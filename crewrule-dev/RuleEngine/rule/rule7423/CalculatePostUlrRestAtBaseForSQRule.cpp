/**
 * @file CalculatePostUlrRestAtBaseForSQRule.cpp
 */

#include "CalculatePostUlrRestAtBaseForSQRule.h"

#include <algorithm>
#include <unordered_map>

#include "Log/Logger.h"
#include "StringUtil.h"

#include "../framework/constant/Constants.h"
#include "../framework/utils/BaseUtils.h"
#include "../framework/utils/DutyUtils.h"
#include "../framework/utils/TimeUtils.h"

namespace {

bool isStandbyAssignmentUpper(const std::string& assignmentUpper) {
    if (assignmentUpper.empty()) {
        return false;
    }
    if (assignmentUpper == "SBY") {
        return true;
    }
    return assignmentUpper.rfind("SBY", 0) == 0;
}

bool isStandbyDutyAtStation(const Duty& duty, const std::string& stationUpper) {
    const std::string& assignmentUpper = duty.getAssignment();
    if (!isStandbyAssignmentUpper(assignmentUpper)) {
        return false;
    }
    const std::string dep = duty.getDepartureStation();
    const std::string arr = duty.getArrivalStation();
    return (!stationUpper.empty() && dep == stationUpper && arr == stationUpper);
}

bool isPositionBackToBaseDuty(const Duty& duty, const std::string& ulrArrUpper, const std::string& baseUpper) {
    const std::string assignmentUpper = duty.getAssignment();
    if (assignmentUpper != "MVP") {
        return false;
    }
    const std::string dep = duty.getDepartureStation();
    const std::string arr = duty.getArrivalStation();
    return (!ulrArrUpper.empty() && !baseUpper.empty() && dep == ulrArrUpper && arr == baseUpper);
}

std::vector<std::string> splitPipeUpper(const std::string& value) {
    std::vector<std::string> out;
    const std::string trimmed = trim(value);
    if (trimmed.empty() || trimmed == "*" || trimmed == RuleParamConstant::IGNORED || trimmed == RuleParamConstant::IGNORED_2) {
        return out;
    }
    std::vector<std::string> parts;
    split(trimmed.c_str(), '|', parts);
    for (auto& p : parts) {
        const std::string token = strToUpper(trim(p));
        if (!token.empty()) {
            out.push_back(token);
        }
    }
    return out;
}

int getDutyDropoffMinutes(const Duty& duty) {
    int dropoff = duty.getActualDropoffMin();
    if (dropoff <= 0) {
        dropoff = duty.getMinDropoff();
    }
    return dropoff < 0 ? 0 : dropoff;
}

bool isDebriefBased(PostUlr7423RestStartsAfter startsAfter) {
    return startsAfter != PostUlr7423RestStartsAfter::Transport;
}

bool exactMidnightStartsNextDay(PostUlr7423RestStartsAfter startsAfter) {
    return startsAfter == PostUlr7423RestStartsAfter::DebriefNxdo;
}

time_t calcRestStartUtcAfterDuty(const Duty& duty, const PostUlr7423ControlParam& control, int offsetTZMinute) {
    time_t endUtc = duty.getEndTimeUtcAct();
    if (endUtc <= 0) {
        endUtc = duty.getEndTimeUtcSch();
    }
    if (endUtc <= 0) {
        const time_t endLoc = duty.getEndTimeLocAct();
        if (endLoc <= 0) {
            return 0;
        }
        endUtc = endLoc - static_cast<time_t>(offsetTZMinute) * 60;
    }

    if (isDebriefBased(control.restStartsAfter)) {
        return endUtc;
    }

    const int dropoffMin = getDutyDropoffMinutes(duty);
    return endUtc + static_cast<time_t>(dropoffMin) * 60;
}

}  // namespace

void CalculatePostUlrRestAtBaseForSQRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
    if (_ruleInstances.empty()) {
        return;
    }
    for (auto* roster : rosters) {
        if (roster == nullptr || roster->pairing == nullptr) {
            continue;
        }
        CalculateDuty(roster->pairing);
    }
}

void CalculatePostUlrRestAtBaseForSQRule::CalculateDuty(Pairing* pairing) {
    if (pairing == nullptr || _ruleInstances.empty()) {
        return;
    }

    Duty* lastUlrDuty = nullptr;
    Duty* lastDutyAtBase = nullptr;
    if (!PairingHasUlrEndingAtCrewBase(*pairing, lastUlrDuty, lastDutyAtBase) ||
        lastUlrDuty == nullptr || lastDutyAtBase == nullptr) {
        return;
    }

    bool hasPositionBackAfterUlr = false;
    const std::string base = lastDutyAtBase->getArrivalStation();
    if (!base.empty()) {
        const std::string ulrArr = lastUlrDuty->getArrivalStation();
        if (!ulrArr.empty() && ulrArr != base) {
            bool afterUlr = false;
            for (auto* d : pairing->getDutyVec()) {
                if (d == nullptr) {
                    continue;
                }
                if (!afterUlr) {
                    if (d == lastUlrDuty) {
                        afterUlr = true;
                    }
                    continue;
                }

                if (isStandbyDutyAtStation(*d, ulrArr)) {
                    continue;
                }
                hasPositionBackAfterUlr = isPositionBackToBaseDuty(*d, ulrArr, base);
                break;
            }
        }
    }

    const bool hasUlrDuty = true;

    int bestMinRestAtBase = 0;
    int bestSpecificity = -1;
    const PostUlrRestAtBaseForSQRuleParam* bestParam = nullptr;
    const PostUlr7423ControlParam* bestControl = nullptr;
    RestWindowResult bestRestWindow{};
    for (const auto& instance : _ruleInstances) {
        if (instance.params.empty()) {
            continue;
        }
        const PostUlr7423ControlParam& control = instance.control;
        if (!PairingMatchesServiceTypeAndFleets(*pairing, control)) {
            continue;
        }
        for (const auto& p : instance.params) {
            if (!p.Matches(hasUlrDuty, hasPositionBackAfterUlr)) {
                continue;
            }
            RestWindowResult candidateRestWindow{};
            if (!CalcMinRestAtBase(*lastDutyAtBase, p, control, candidateRestWindow)) {
                continue;
            }
            const int spec = p.Specificity();
            if (spec > bestSpecificity ||
                (spec == bestSpecificity && candidateRestWindow.minRestAtBaseMinutes > bestMinRestAtBase)) {
                bestMinRestAtBase = candidateRestWindow.minRestAtBaseMinutes;
                bestSpecificity = spec;
                bestParam = &p;
                bestControl = &control;
                bestRestWindow = candidateRestWindow;
            }
        }
    }

    if (bestMinRestAtBase <= 0 || bestParam == nullptr || bestControl == nullptr) {
        return;
    }

    const int prevMinRestAtBase = lastDutyAtBase->getMinRestAtBase();
    const int prevMinRest = lastDutyAtBase->getMinRest();
    bool updated = false;

    if (bestMinRestAtBase > prevMinRestAtBase) {
        lastDutyAtBase->setMinRestAtBase(bestMinRestAtBase);
        updated = true;
    }
    if (bestMinRestAtBase > prevMinRest) {
        lastDutyAtBase->setMinRest(bestMinRestAtBase);
        updated = true;
    }
    if (updated) {
        lastDutyAtBase->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST,
                                           bestMinRestAtBase,
                                           bestParam->GetId(),
                                           bestParam->GetRuleParamId(),
                                           bestParam->GetOverrideAbility(),
                                           bestParam->GetClassType(),
                                           bestParam->GetDescription(),
                                           bestParam->GetReference());
    }
    const int atdoDays = CalcDerivedAtdoDaysFromRestWindow(bestRestWindow, *bestControl);
    if (atdoDays > 0) {
        lastDutyAtBase->setMinATDO(atdoDays);
    }
}

bool CalculatePostUlrRestAtBaseForSQRule::PairingMatchesServiceTypeAndFleets(const Pairing& pairing, const PostUlr7423ControlParam& control) const {
    const std::string filterUpper = control.serviceTypeUpper;
    if (!filterUpper.empty() && filterUpper != "*") {
        bool sawOperating = false;
        bool allOperatingAreFreighter = true;
        for (auto* duty : pairing.getDutyVec()) {
            if (duty == nullptr) {
                continue;
            }
            for (auto* seg : duty->getSegmentsRead()) {
                if (seg == nullptr || !seg->getIsOperating()) {
                    continue;
                }
                sawOperating = true;
                if (seg->getServiceType() != "F") {
                    allOperatingAreFreighter = false;
                    break;
                }
            }
            if (!allOperatingAreFreighter) {
                break;
            }
        }
        const std::string pairingServiceType = (sawOperating && allOperatingAreFreighter) ? "F" : "J";
        if (filterUpper != pairingServiceType) {
            return false;
        }
    }

    if (!control.fleetCodesUpper.empty()) {
        bool sawOperating = false;
        bool allOperatingInAllowed = true;
        for (auto* duty : pairing.getDutyVec()) {
            if (duty == nullptr) {
                continue;
            }
            for (auto* seg : duty->getSegmentsRead()) {
                if (seg == nullptr || !seg->getIsOperating()) {
                    continue;
                }
                sawOperating = true;
                const std::string fleet = seg->getFleetCD();
                if (fleet.empty() ||
                    std::find(control.fleetCodesUpper.begin(), control.fleetCodesUpper.end(), fleet) == control.fleetCodesUpper.end()) {
                    allOperatingInAllowed = false;
                    break;
                }
            }
            if (!allOperatingInAllowed) {
                break;
            }
        }
        if (sawOperating && !allOperatingInAllowed) {
            return false;
        }
    }

    return true;
}

bool CalculatePostUlrRestAtBaseForSQRule::PairingHasUlrEndingAtCrewBase(const Pairing& pairing,
                                                                         Duty*& outLastUlrDuty,
                                                                         Duty*& outLastDutyAtBase) const {
    outLastUlrDuty = nullptr;
    outLastDutyAtBase = nullptr;

    for (auto* duty : pairing.getDutyVec()) {
        if (duty == nullptr) {
            continue;
        }
        if (duty->isULR()) {
            outLastUlrDuty = duty;
        }
    }
    if (outLastUlrDuty == nullptr) {
        return false;
    }

    Duty* lastDuty = pairing.getLastDuty();
    if (lastDuty == nullptr) {
        for (auto it = pairing.getDutyVec().rbegin(); it != pairing.getDutyVec().rend(); ++it) {
            if (*it != nullptr) {
                lastDuty = *it;
                break;
            }
        }
    }
    if (lastDuty == nullptr) {
        return false;
    }

    const std::string lastArr = lastDuty->getArrivalStation();
    if (lastArr.empty()) {
        return false;
    }

    bool endsAtCrewBase = false;
    if (_dbData != nullptr && !_dbData->baseList.empty()) {
        endsAtCrewBase = BaseUtils::IsHomeBase(lastArr, _dbData->baseList, pairing.getFiliale());
    }
    if (!endsAtCrewBase) {
        const std::string pairingBase = pairing.getBase();
        endsAtCrewBase = !pairingBase.empty() && pairingBase == lastArr;
    }
    if (!endsAtCrewBase) {
        return false;
    }

    outLastDutyAtBase = lastDuty;
    return true;
}

bool CalculatePostUlrRestAtBaseForSQRule::CalcMinRestAtBase(const Duty& lastDuty,
                                                            const PostUlrRestAtBaseForSQRuleParam& ruleParam,
                                                            const PostUlr7423ControlParam& control,
                                                            RestWindowResult& outRestWindow) const {
    outRestWindow = RestWindowResult{};
    if (!ruleParam.IsValid()) {
        return false;
    }

    const time_t restStartLoc = GetRestStartLocAfterDuty(lastDuty, control);
    if (restStartLoc <= 0) {
        return false;
    }

    int offsetTZMinute = 0;
    const time_t dutyEndLoc = lastDuty.getEndTimeLocAct();
    const time_t dutyEndUtc = lastDuty.getEndTimeUtcAct();
    if (dutyEndLoc > 0 && dutyEndUtc > 0) {
        offsetTZMinute = static_cast<int>((dutyEndLoc - dutyEndUtc) / 60);
    }
    std::string restZoneId;
    if (const auto dataContext = this->GetDataContext()) {
        restZoneId = dataContext->getAirportZoneId(lastDuty.getArrivalStation());
    }

    const time_t restStartUtc = calcRestStartUtcAfterDuty(lastDuty, control, offsetTZMinute);

    time_t requiredEndLoc = restStartLoc;

    if (ruleParam.GetRestDays() > 0 || ruleParam.GetFollowingDoAllowAfterMinutes() > 0) {
        const time_t alignLoc = CeilToNextMidnight(restStartLoc, exactMidnightStartsNextDay(control.restStartsAfter));
        if (alignLoc <= 0) {
            return false;
        }
        const time_t fullDaysEndLoc = TimeUtils::AddDay(alignLoc, ruleParam.GetRestDays());
        const time_t candidate = fullDaysEndLoc + static_cast<time_t>(ClampMinutesOfDay(ruleParam.GetFollowingDoAllowAfterMinutes())) * 60;
        if (candidate > requiredEndLoc) {
            requiredEndLoc = candidate;
        }
    }

    if (ruleParam.GetRestHours() > 0) {
        const time_t candidate = restStartLoc + static_cast<time_t>(ruleParam.GetRestHours()) * 3600;
        if (candidate > requiredEndLoc) {
            requiredEndLoc = candidate;
        }
    }

    if (ruleParam.GetRestLocalNights() > 0 && restStartUtc > 0) {
        const time_t requiredEndUtc = DutyUtils::GetRestEndTimeMeetingNumLocalNights(
            restStartUtc, offsetTZMinute, restZoneId, ruleParam.GetRestLocalNights());
        if (requiredEndUtc > 0) {
            const time_t candidate = requiredEndUtc + static_cast<time_t>(offsetTZMinute) * 60;
            if (candidate > requiredEndLoc) {
                requiredEndLoc = candidate;
            }
        }
    }

    if (requiredEndLoc <= restStartLoc) {
        return false;
    }

    outRestWindow.restStartLoc = restStartLoc;
    outRestWindow.requiredEndLoc = requiredEndLoc;
    outRestWindow.minRestAtBaseMinutes = static_cast<int>((requiredEndLoc - restStartLoc) / 60);
    // The system pairing end time is based on duty end + dropoff (transport). When configured to start rest/DO
    // after DEBRIEF, the transport portion is considered part of the rest/day-off window; reduce the remaining
    // required rest after transport accordingly to avoid shifting the implied rest end by dropoff minutes.
    if (isDebriefBased(control.restStartsAfter)) {
        outRestWindow.minRestAtBaseMinutes = std::max(0,
                                                      outRestWindow.minRestAtBaseMinutes - getDutyDropoffMinutes(lastDuty));
    }
    return outRestWindow.minRestAtBaseMinutes > 0;
}

bool CalculatePostUlrRestAtBaseForSQRule::ParseControlRow(const DBRule& dbRule, PostUlr7423ControlParam& control) {
    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string valueUpper = strToUpper(trim(it->second));
        if (headerUpper == "REST STARTS AFTER" || headerUpper == "DO STARTS AFTER") {
            if (valueUpper == "DEBRIEF_NXDO" || valueUpper == "DEBRIEF_NEXT_DO") {
                control.restStartsAfter = PostUlr7423RestStartsAfter::DebriefNxdo;
            } else if (valueUpper == "DEBRIEF" || valueUpper == "DEBRIEFING") {
                control.restStartsAfter = PostUlr7423RestStartsAfter::Debrief;
            } else if (valueUpper == "TRANSPORT" || valueUpper == "DROPOFF" || valueUpper == "DROP OFF" || valueUpper == "DROP-OFF") {
                control.restStartsAfter = PostUlr7423RestStartsAfter::Transport;
            }
        } else if (headerUpper == "SERVICE TYPE") {
            control.serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
        } else if (headerUpper == "FLEETS" || headerUpper == "FLEET") {
            if (valueUpper.empty() || valueUpper == "*" || valueUpper == RuleParamConstant::ALL ||
                valueUpper == RuleParamConstant::IGNORED || valueUpper == RuleParamConstant::IGNORED_2) {
                control.fleetCodesUpper.clear();
            } else {
                control.fleetCodesUpper = splitPipeUpper(valueUpper);
            }
        } else {
            Logger::getRuleLogger()->warn("Rule 7423 control parameter ignored, header: {}", it->first);
        }
    }
    return true;
}

void CalculatePostUlrRestAtBaseForSQRule::ParseParam(const InputType& input) {
    _ruleInstances.clear();
    std::unordered_map<long long, std::size_t> instanceIndexByRuleId;
    instanceIndexByRuleId.reserve(input.dbRules.size());

    auto getOrCreateInstance = [&](long long ruleId) -> RuleInstance& {
        const auto it = instanceIndexByRuleId.find(ruleId);
        if (it != instanceIndexByRuleId.end()) {
            return _ruleInstances[it->second];
        }
        const std::size_t idx = _ruleInstances.size();
        _ruleInstances.push_back(RuleInstance{});
        _ruleInstances.back().ruleId = ruleId;
        instanceIndexByRuleId.emplace(ruleId, idx);
        return _ruleInstances.back();
    };

    for (const auto& dbRule : input.dbRules) {
        if (dbRule.tableNum == 2) {
            auto& instance = getOrCreateInstance(dbRule.idRule);
            ParseControlRow(dbRule, instance.control);
            continue;
        }
        // Table 1 = rule rows; Table 2 = control parameters. Allow tableNum=0 as table 1.
        if (dbRule.tableNum != 0 && dbRule.tableNum != 1) {
            continue;
        }
        auto& instance = getOrCreateInstance(dbRule.idRule);
        instance.params.emplace_back(PostUlrRestAtBaseForSQRuleParam(this));
        auto& p = instance.params.back();
        p.ParseParam(dbRule);
        if (!p.IsValid()) {
            instance.params.pop_back();
        }
    }
}

time_t CalculatePostUlrRestAtBaseForSQRule::GetRestStartLocAfterDuty(const Duty& duty, const PostUlr7423ControlParam& control) {
    const time_t endLoc = duty.getEndTimeLocAct();
    if (endLoc <= 0) {
        return 0;
    }
    if (isDebriefBased(control.restStartsAfter)) {
        return endLoc;
    }
    const int dropoffMin = getDutyDropoffMinutes(duty);
    return endLoc + static_cast<time_t>(dropoffMin) * 60;
}

time_t CalculatePostUlrRestAtBaseForSQRule::CeilToNextMidnight(time_t tLoc, bool exactMidnightNextDay) {
    if (tLoc <= 0) {
        return 0;
    }
    const time_t day = TimeUtils::Truncate(tLoc, ChronoUnit::DAYS);
    if (tLoc == day) {
        return exactMidnightNextDay ? TimeUtils::AddDay(day, 1) : day;
    }
    return TimeUtils::AddDay(day, 1);
}

int CalculatePostUlrRestAtBaseForSQRule::ClampMinutesOfDay(int minutes) {
    if (minutes < 0) {
        return 0;
    }
    return minutes >= 24 * 60 ? (24 * 60 - 1) : minutes;
}

int CalculatePostUlrRestAtBaseForSQRule::CalcDerivedAtdoDaysFromRestWindow(const RestWindowResult& restWindow,
                                                                            const PostUlr7423ControlParam& control) {
    if (restWindow.restStartLoc <= 0 || restWindow.requiredEndLoc <= restWindow.restStartLoc) {
        return 0;
    }

    constexpr time_t kDaySeconds = 24 * 3600;
    time_t dayStartLoc = TimeUtils::Truncate(restWindow.restStartLoc, ChronoUnit::DAYS);
    if (restWindow.restStartLoc == dayStartLoc && exactMidnightStartsNextDay(control.restStartsAfter)) {
        dayStartLoc = TimeUtils::AddDay(dayStartLoc, 1);
    }
    if (restWindow.requiredEndLoc <= dayStartLoc) {
        return 0;
    }

    const time_t coveredSeconds = restWindow.requiredEndLoc - dayStartLoc;
    return static_cast<int>((coveredSeconds + kDaySeconds - 1) / kDaySeconds);
}

