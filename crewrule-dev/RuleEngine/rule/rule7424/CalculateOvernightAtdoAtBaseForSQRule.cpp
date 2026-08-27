/**
 * @file CalculateOvernightAtdoAtBaseForSQRule.cpp
 */

#include "CalculateOvernightAtdoAtBaseForSQRule.h"

#include <algorithm>
#include <unordered_map>

#include "Log/Logger.h"
#include "StringUtil.h"

#include "../framework/constant/Constants.h"
#include "../framework/utils/TimeUtils.h"

namespace {

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

const Segment* findLastSegment(const Duty& duty) {
    return duty.getLastSegment();
}

time_t resolveUtcTime(time_t act, time_t sch) {
    return act > 0 ? act : sch;
}

time_t resolveLocTime(time_t act, time_t sch) {
    return act > 0 ? act : sch;
}

int resolveBaseOffsetMinutes(const Duty& duty,
                             const Segment* lastSeg,
                             const CrewDataContext* /*ctx*/,
                             const std::string& /*base*/) {

    const time_t endLoc = duty.getEndTimeLocAct();
    const time_t endUtc = duty.getEndTimeUtcAct();
    if (endLoc > 0 && endUtc > 0) {
        return static_cast<int>((endLoc - endUtc) / 60);
    }

    if (lastSeg != nullptr) {
        const time_t arrLoc = lastSeg->getEndTimeLocAct();
        const time_t arrUtc = lastSeg->getEndTimeUtcAct();
        if (arrLoc > 0 && arrUtc > 0) {
            return static_cast<int>((arrLoc - arrUtc) / 60);
        }
    }

    return 0;
}

bool isDebriefBased(Overnight7424DOStartsAfter startsAfter) {
    return startsAfter != Overnight7424DOStartsAfter::Transport;
}

bool exactMidnightStartsNextDay(Overnight7424DOStartsAfter startsAfter) {
    return startsAfter == Overnight7424DOStartsAfter::DebriefNxdo;
}

time_t getDOStartUtcAfterDuty(const Duty& duty, Overnight7424DOStartsAfter startsAfter) {
    if (isDebriefBased(startsAfter)) {
        auto debrief = duty.getLastDebrief();
        if (debrief != nullptr) {
            const time_t debriefEndUtc = resolveUtcTime(debrief->getEndTimeUtcAct(), debrief->getEndTimeUtcSch());
            if (debriefEndUtc > 0) {
                return debriefEndUtc;
            }
        }
    } else {
        auto dropoff = duty.getLastDropoff();
        if (dropoff != nullptr) {
            const time_t dropoffEndUtc = resolveUtcTime(dropoff->getEndTimeUtcAct(), dropoff->getEndTimeUtcSch());
            if (dropoffEndUtc > 0) {
                return dropoffEndUtc;
            }
        }
    }

    time_t endUtc = resolveUtcTime(duty.getEndTimeUtcAct(), duty.getEndTimeUtcSch());
    if (endUtc <= 0) {
        return 0;
    }
    if (isDebriefBased(startsAfter)) {
        return endUtc;
    }
    int dropoffMin = duty.getActualDropoffMin();
    if (dropoffMin <= 0) {
        dropoffMin = duty.getMinDropoff();
    }
    if (dropoffMin < 0) {
        dropoffMin = 0;
    }
    return endUtc + static_cast<time_t>(dropoffMin) * 60;
}

int getDebriefToDropoffMinutesLoc(const Duty& duty) {
    auto debrief = duty.getLastDebrief();
    auto dropoff = duty.getLastDropoff();
    if (debrief != nullptr && dropoff != nullptr) {
        const time_t debriefEndLoc = resolveLocTime(debrief->getEndTimeLocAct(), debrief->getEndTimeLocSch());
        const time_t dropoffEndLoc = resolveLocTime(dropoff->getEndTimeLocAct(), dropoff->getEndTimeLocSch());
        if (debriefEndLoc > 0 && dropoffEndLoc > 0 && dropoffEndLoc >= debriefEndLoc) {
            return static_cast<int>((dropoffEndLoc - debriefEndLoc) / 60);
        }
    }
    int dropoffMin = duty.getActualDropoffMin();
    if (dropoffMin <= 0) {
        dropoffMin = duty.getMinDropoff();
    }
    return dropoffMin < 0 ? 0 : dropoffMin;
}

int resolveDutyFdpMinutes(const Duty& duty) {
    const int act = duty.getActualFDP();
    if (act > 0) {
        return act;
    }
    const int plan = duty.getPlanFDP();
    if (plan > 0) {
        return plan;
    }
    const int sch = duty.getScheduleFDP();
    if (sch > 0) {
        return sch;
    }
    const long planSecs = duty.getFDPInSecs();
    return planSecs > 0 ? static_cast<int>(planSecs / 60) : 0;
}

std::string resolveDutyServiceTypeUpper(const Pairing& pairing) {
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
    return (sawOperating && allOperatingAreFreighter) ? "F" : "J";
}

std::string resolveFleetGroupUpper(const Segment* seg, const CrewDataContext* dbData) {
    if (seg == nullptr || dbData == nullptr) {
        return {};
    }
    const std::string fleet = seg->getFleetCD();
    if (fleet.empty()) {
        return {};
    }
    const auto it = dbData->fleetMap.find(fleet);
    if (it == dbData->fleetMap.end()) {
        return {};
    }
    return it->second.fleetGrp;
}

bool pairingMatchesFleetGroups(const Pairing& pairing,
                               const std::vector<std::string>& allowedFleetGroupsUpper,
                               const CrewDataContext* dbData,
                               const Segment* lastSeg) {
    if (allowedFleetGroupsUpper.empty()) {
        return true;
    }
    if (dbData == nullptr) {
        return false;
    }

    bool sawOperating = false;
    for (auto* duty : pairing.getDutyVec()) {
        if (duty == nullptr) {
            continue;
        }
        for (auto* seg : duty->getSegmentsRead()) {
            if (seg == nullptr || !seg->getIsOperating()) {
                continue;
            }
            sawOperating = true;
            const std::string fleetGroup = resolveFleetGroupUpper(seg, dbData);
            if (fleetGroup.empty() ||
                std::find(allowedFleetGroupsUpper.begin(), allowedFleetGroupsUpper.end(), fleetGroup) ==
                    allowedFleetGroupsUpper.end()) {
                return false;
            }
        }
    }

    if (sawOperating) {
        return true;
    }

    const std::string fallbackFleetGroup = resolveFleetGroupUpper(lastSeg, dbData);
    if (fallbackFleetGroup.empty()) {
        return false;
    }
    return std::find(allowedFleetGroupsUpper.begin(),
                     allowedFleetGroupsUpper.end(),
                     fallbackFleetGroup) != allowedFleetGroupsUpper.end();
}

}  // namespace

void CalculateOvernightAtdoAtBaseForSQRule::CalculateDuty(Pairing* pairing) {
    if (pairing == nullptr || _ruleInstances.empty()) {
        return;
    }

    int bestMinRestAtBase = 0;
    const OvernightAtdoAtBaseForSQRuleParam* bestParam = nullptr;

    const std::string pairingServiceType = resolveDutyServiceTypeUpper(*pairing);

    for (const auto& instance : _ruleInstances) {
        if (instance.params.empty()) {
            continue;
        }
        const Overnight7424ControlParam& control = instance.control;
        if (!control.serviceTypeUpper.empty() && control.serviceTypeUpper != "*" &&
            control.serviceTypeUpper != pairingServiceType) {
            continue;
        }

        const Duty* lastDutyForFleet = pairing->getLastDuty();
        if (lastDutyForFleet == nullptr) {
            for (auto it = pairing->getDutyVec().rbegin(); it != pairing->getDutyVec().rend(); ++it) {
                if (*it != nullptr) {
                    lastDutyForFleet = *it;
                    break;
                }
            }
        }
        const Segment* lastSegForFleet = lastDutyForFleet != nullptr ? findLastSegment(*lastDutyForFleet) : nullptr;
        if (!pairingMatchesFleetGroups(*pairing, control.fleetGroupsUpper, this->_dbData.get(), lastSegForFleet)) {
            continue;
        }

        for (const auto& p : instance.params) {
            int candidate = 0;
            if (!TryMatchAndCalcMinRestAtBaseMinutes(*pairing, p, control, candidate)) {
                continue;
            }
            if (candidate > bestMinRestAtBase) {
                bestMinRestAtBase = candidate;
                bestParam = &p;
            }
        }
    }

    if (bestMinRestAtBase <= 0 || bestParam == nullptr) {
        return;
    }

    Duty* lastDuty = pairing->getLastDuty();
    if (lastDuty == nullptr) {
        return;
    }

    const int prevMinRestAtBase = lastDuty->getMinRestAtBase();
    const int prevMinRest = lastDuty->getMinRest();
    bool updated = false;

    if (bestMinRestAtBase > prevMinRestAtBase) {
        lastDuty->setMinRestAtBase(bestMinRestAtBase);
        updated = true;
    }
    if (bestMinRestAtBase > prevMinRest) {
        lastDuty->setMinRest(bestMinRestAtBase);
        updated = true;
    }
    if (updated) {
        lastDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST,
                                     bestMinRestAtBase,
                                     bestParam->GetId(),
                                     bestParam->GetRuleParamId(),
                                     bestParam->GetOverrideAbility(),
                                     bestParam->GetClassType(),
                                     bestParam->GetDescription(),
                                     bestParam->GetReference());
    }
    if (bestParam->GetAtdoDays() > 0) {
        lastDuty->setMinATDO(bestParam->GetAtdoDays());
    }
}

void CalculateOvernightAtdoAtBaseForSQRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
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

bool CalculateOvernightAtdoAtBaseForSQRule::ParseControlRow(const DBRule& dbRule, Overnight7424ControlParam& control) {
    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string valueUpper = strToUpper(trim(it->second));
        if (headerUpper == "DO STARTS AFTER" || headerUpper == "REST STARTS AFTER") {
            if (valueUpper == "DEBRIEF_NXDO" || valueUpper == "DEBRIEF_NEXT_DO") {
                control.doStartsAfter = Overnight7424DOStartsAfter::DebriefNxdo;
            } else if (valueUpper == "DEBRIEF" || valueUpper == "DEBRIEFING") {
                control.doStartsAfter = Overnight7424DOStartsAfter::Debrief;
            } else if (valueUpper == "TRANSPORT" || valueUpper == "DROPOFF" || valueUpper == "DROP OFF" || valueUpper == "DROP-OFF") {
                control.doStartsAfter = Overnight7424DOStartsAfter::Transport;
            }
        } else if (headerUpper == "SERVICE TYPE") {
            control.serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
        } else if (headerUpper == "FLEET GROUP" || headerUpper == "FLEET GROUPS" ||
                   headerUpper == "FLEET GROUP(GRP)" || headerUpper == "FLEET GRP") {
            if (valueUpper.empty() || valueUpper == "*" || valueUpper == RuleParamConstant::ALL ||
                valueUpper == RuleParamConstant::IGNORED || valueUpper == RuleParamConstant::IGNORED_2) {
                control.fleetGroupsUpper.clear();
            } else {
                control.fleetGroupsUpper = splitPipeUpper(valueUpper);
            }
        } else {
            Logger::getRuleLogger()->warn("Rule 7424 control parameter ignored, header: {}", it->first);
        }
    }
    return true;
}

void CalculateOvernightAtdoAtBaseForSQRule::ParseParam(const InputType& input) {
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
        instance.params.emplace_back(OvernightAtdoAtBaseForSQRuleParam(this));
        auto& p = instance.params.back();
        p.ParseParam(dbRule);
        if (!p.IsValid()) {
            instance.params.pop_back();
        }
    }
}

bool CalculateOvernightAtdoAtBaseForSQRule::PairingMatchesServiceTypeAndFleetGroups(
    const Pairing& pairing,
    const Overnight7424ControlParam& control) const {
    if (!control.serviceTypeUpper.empty() && control.serviceTypeUpper != "*") {
        const std::string pairingServiceType = resolveDutyServiceTypeUpper(pairing);
        if (control.serviceTypeUpper != pairingServiceType) {
            return false;
        }
    }

    const Duty* lastDuty = pairing.getLastDuty();
    if (lastDuty == nullptr) {
        for (auto it = pairing.getDutyVec().rbegin(); it != pairing.getDutyVec().rend(); ++it) {
            if (*it != nullptr) {
                lastDuty = *it;
                break;
            }
        }
    }
    const Segment* lastSeg = lastDuty != nullptr ? findLastSegment(*lastDuty) : nullptr;
    return pairingMatchesFleetGroups(pairing, control.fleetGroupsUpper, this->_dbData.get(), lastSeg);
}

bool CalculateOvernightAtdoAtBaseForSQRule::TryMatchAndCalcMinRestAtBaseMinutes(
    const Pairing& pairing,
    const OvernightAtdoAtBaseForSQRuleParam& ruleParam,
    const Overnight7424ControlParam& control,
    int& outMinRestAtBaseMinutes) const {
    outMinRestAtBaseMinutes = 0;
    if (!ruleParam.IsValid()) {
        return false;
    }

    const std::string base = pairing.getBase();
    if (base.empty()) {
        return false;
    }

    const Duty* lastDuty = pairing.getLastDuty();
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

    const Segment* lastSeg = findLastSegment(*lastDuty);
    if (lastSeg == nullptr) {
        return false;
    }

    if (lastSeg->getArrStation() != base) {
        return false;
    }

    if (!PairingMatchesServiceTypeAndFleetGroups(pairing, control)) {
        return false;
    }

    const int baseOffsetMinutes = resolveBaseOffsetMinutes(*lastDuty, lastSeg, this->_dbData.get(), base);

    if (ruleParam.HasOvernightArriveAfter()) {
        const time_t reportUtc = resolveUtcTime(lastDuty->getStartTimeUtcAct(), lastDuty->getStartTimeUtcSch());
        const time_t arriveUtc = resolveUtcTime(lastSeg->getEndTimeUtcAct(), lastSeg->getEndTimeUtcSch());
        if (reportUtc <= 0 || arriveUtc <= 0) {
            return false;
        }
        const time_t reportLoc = reportUtc + static_cast<time_t>(baseOffsetMinutes) * 60;
        const time_t arriveLoc = arriveUtc + static_cast<time_t>(baseOffsetMinutes) * 60;
        const time_t reportDay = TimeUtils::Truncate(reportLoc, ChronoUnit::DAYS);
        const time_t arriveDay = TimeUtils::Truncate(arriveLoc, ChronoUnit::DAYS);
        if (arriveDay <= reportDay) {
            return false;
        }
        const int arriveMinutes = TimeUtils::GetMinutesFromMidnight(arriveLoc);
        if (arriveMinutes <= ruleParam.GetOvernightArriveAfterMinutes()) {
            return false;
        }
    }

    if (ruleParam.HasMinFdpMinutes()) {
        const int fdpMinutes = resolveDutyFdpMinutes(*lastDuty);
        if (fdpMinutes <= ruleParam.GetMinFdpMinutes()) {
            return false;
        }
    }

    if (ruleParam.HasFinalStartStations()) {
        const std::string depUpper = strToUpper(lastSeg->getDepStation());
        const auto& stations = ruleParam.GetFinalStartStationsUpper();
        if (depUpper.empty() ||
            std::find(stations.begin(), stations.end(), depUpper) == stations.end()) {
            return false;
        }
    }

    const time_t dayoffStartUtc = getDOStartUtcAfterDuty(*lastDuty, control.doStartsAfter);
    if (dayoffStartUtc <= 0) {
        return false;
    }
    const time_t dayoffStartLoc = dayoffStartUtc + static_cast<time_t>(baseOffsetMinutes) * 60;
    if (dayoffStartLoc <= 0) {
        return false;
    }

    const time_t day = static_cast<time_t>(24 * 3600);
    const time_t dayStart = TimeUtils::Truncate(dayoffStartLoc, ChronoUnit::DAYS);
    time_t alignLoc = dayoffStartLoc;
    if (dayoffStartLoc == dayStart) {
        alignLoc = exactMidnightStartsNextDay(control.doStartsAfter) ? TimeUtils::AddDay(dayStart, 1) : dayStart;
    } else {
        alignLoc = TimeUtils::AddDay(dayStart, 1);
    }
    const time_t restEndLoc = alignLoc + static_cast<time_t>(ruleParam.GetAtdoDays()) * day;

    int minRest = static_cast<int>((restEndLoc - dayoffStartLoc) / 60);
    if (isDebriefBased(control.doStartsAfter)) {
        const int debriefToDropoff = getDebriefToDropoffMinutesLoc(*lastDuty);
        minRest = std::max(0, minRest - debriefToDropoff);
    }

    if (minRest <= 0) {
        return false;
    }

    outMinRestAtBaseMinutes = minRest;
    return true;
}
