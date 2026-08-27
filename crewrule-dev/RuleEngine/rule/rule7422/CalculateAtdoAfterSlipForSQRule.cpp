/**
 * @file CalculateAtdoAfterSlipForSQRule.cpp
 */

#include "CalculateAtdoAfterSlipForSQRule.h"

#include <algorithm>
#include <limits>
#include <unordered_map>

#include "Log/Logger.h"
#include "StringUtil.h"

#include "../RuleSytem.h"
#include "../framework/constant/Constants.h"
#include "../framework/utils/DutyUtils.h"
#include "../framework/utils/TimeUtils.h"

namespace {

bool parseBoolYN(const std::string& value, bool defaultValue) {
    const std::string upper = strToUpper(trim(value));
    if (upper.empty()) {
        return defaultValue;
    }
    if (upper == "Y" || upper == "YES" || upper == "TRUE" || upper == "1") {
        return true;
    }
    if (upper == "N" || upper == "NO" || upper == "FALSE" || upper == "0") {
        return false;
    }
    return defaultValue;
}

bool isDebriefBased(Atdo7422RestStartsAfter startsAfter) {
    return startsAfter != Atdo7422RestStartsAfter::Transport;
}

bool exactMidnightStartsNextDay(Atdo7422RestStartsAfter startsAfter) {
    return startsAfter == Atdo7422RestStartsAfter::DebriefNxdo;
}

int getDutyDropoffMinutes(const Duty& duty) {
    int dropoff = duty.getActualDropoffMin();
    if (dropoff <= 0) {
        dropoff = duty.getMinDropoff();
    }
    return dropoff < 0 ? 0 : dropoff;
}

Atdo7422PairingLengthEndsAt parsePairingLengthEndsAt(const std::string& value) {
    const std::string upper = strToUpper(trim(value));
    if (upper == "TRANSPORT" || upper == "DROPOFF" || upper == "DROP OFF" || upper == "DROP-OFF") {
        return Atdo7422PairingLengthEndsAt::Transport;
    }
    if (upper == "DEBRIEF" || upper == "DEBRIEFING") {
        return Atdo7422PairingLengthEndsAt::Debrief;
    }
    return Atdo7422PairingLengthEndsAt::Debrief;
}

time_t resolveDutyReportStartLoc(const Duty& duty) {
    const auto brief = duty.getFirstBreif();
    if (brief != nullptr) {
        if (brief->getStartTimeLocAct() > 0) {
            return brief->getStartTimeLocAct();
        }
        if (brief->getStartTimeLocSch() > 0) {
            return brief->getStartTimeLocSch();
        }
    }
    if (duty.getStartTimeLocAct() > 0) {
        return duty.getStartTimeLocAct();
    }
    return duty.getStartTimeLocSch();
}

time_t resolveDutyDebriefEndLoc(const Duty& duty) {
    const auto debrief = duty.getLastDebrief();
    if (debrief != nullptr) {
        if (debrief->getEndTimeLocAct() > 0) {
            return debrief->getEndTimeLocAct();
        }
        if (debrief->getEndTimeLocSch() > 0) {
            return debrief->getEndTimeLocSch();
        }
    }
    if (duty.getEndTimeLocAct() > 0) {
        return duty.getEndTimeLocAct();
    }
    return duty.getEndTimeLocSch();
}

time_t resolveDutyTransportEndLoc(const Duty& duty) {
    const auto dropoff = duty.getLastDropoff();
    if (dropoff != nullptr) {
        if (dropoff->getEndTimeLocAct() > 0) {
            return dropoff->getEndTimeLocAct();
        }
        if (dropoff->getEndTimeLocSch() > 0) {
            return dropoff->getEndTimeLocSch();
        }
    }
    const time_t debriefEndLoc = resolveDutyDebriefEndLoc(duty);
    if (debriefEndLoc <= 0) {
        return 0;
    }
    return debriefEndLoc + static_cast<time_t>(getDutyDropoffMinutes(duty)) * 60;
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

int overlapMinutes(time_t startLoc, time_t endLoc, time_t windowStartLoc, time_t windowEndLoc) {
    if (startLoc <= 0 || endLoc <= 0 || windowStartLoc <= 0 || windowEndLoc <= 0) {
        return 0;
    }
    if (endLoc <= startLoc || windowEndLoc <= windowStartLoc) {
        return 0;
    }
    const time_t s = std::max(startLoc, windowStartLoc);
    const time_t e = std::min(endLoc, windowEndLoc);
    if (e <= s) {
        return 0;
    }
    return static_cast<int>((e - s) / 60);
}

int standbyTotalMinutesWithinWindow(const std::vector<Duty*>& duties,
                                   std::size_t startDutyIndex,
                                   std::size_t endDutyIndex,
                                   time_t windowStartLoc,
                                   time_t windowEndLoc,
                                   const std::vector<std::string>& standbyAssignmentsUpper) {
    if (duties.empty() || startDutyIndex >= duties.size() || endDutyIndex >= duties.size() || startDutyIndex > endDutyIndex) {
        return 0;
    }
    if (standbyAssignmentsUpper.empty()) {
        return 0;
    }

    int total = 0;
    for (std::size_t i = startDutyIndex; i <= endDutyIndex && i < duties.size(); ++i) {
        const Duty* d = duties[i];
        if (d == nullptr) {
            continue;
        }
        const std::string assignment = d->getAssignment();
        if (std::find(standbyAssignmentsUpper.begin(), standbyAssignmentsUpper.end(), assignment) == standbyAssignmentsUpper.end()) {
            continue;
        }
        total += overlapMinutes(d->getStartTimeLocAct(), d->getEndTimeLocAct(), windowStartLoc, windowEndLoc);
    }
    return total < 0 ? 0 : total;
}

time_t calcRestStartUtcAfterDuty(const Duty& duty, const Atdo7422ControlParam& control, int offsetTZMinute) {
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

time_t calcRestEndLocByAtdoDays(const time_t restStartLoc,
                                int atdoDays,
                                int allowAfterMinutes,
                                bool exactMidnightNextDay) {
    if (restStartLoc <= 0) {
        return 0;
    }
    auto ceilToNextMidnight = [exactMidnightNextDay](time_t tLoc) -> time_t {
        if (tLoc <= 0) {
            return 0;
        }
        const time_t day = TimeUtils::Truncate(tLoc, ChronoUnit::DAYS);
        if (tLoc == day) {
            return exactMidnightNextDay ? TimeUtils::AddDay(day, 1) : day;
        }
        return TimeUtils::AddDay(day, 1);
    };
    auto clampMinutesOfDay = [](int minutes) -> int {
        if (minutes < 0) {
            return 0;
        }
        return minutes >= 24 * 60 ? (24 * 60 - 1) : minutes;
    };

    const time_t alignLoc = ceilToNextMidnight(restStartLoc);
    if (alignLoc <= 0) {
        return 0;
    }
    const time_t fullDaysEndLoc = TimeUtils::AddDay(alignLoc, atdoDays);
    return fullDaysEndLoc + static_cast<time_t>(clampMinutesOfDay(allowAfterMinutes)) * 60;
}

struct StationChainWithDutyIndex {
    std::vector<std::string> chain;
    std::vector<std::size_t> arriveDutyIndex;
};

StationChainWithDutyIndex buildStationChainWithDutyIndex(const std::vector<Duty*>& duties) {
    StationChainWithDutyIndex out;
    if (duties.empty()) {
        return out;
    }

    std::size_t firstIndex = duties.size();
    for (std::size_t i = 0; i < duties.size(); ++i) {
        if (duties[i] != nullptr) {
            firstIndex = i;
            break;
        }
    }
    if (firstIndex >= duties.size() || duties[firstIndex] == nullptr) {
        return out;
    }

    out.chain.push_back(duties[firstIndex]->getDepartureStation());
    out.arriveDutyIndex.push_back(std::numeric_limits<std::size_t>::max());

    for (std::size_t i = firstIndex; i < duties.size(); ++i) {
        const Duty* d = duties[i];
        if (d == nullptr) {
            continue;
        }
        const std::string arr = d->getArrivalStation();
        if (out.chain.empty() || out.chain.back() != arr) {
            out.chain.push_back(arr);
            out.arriveDutyIndex.push_back(i);
        }
    }
    return out;
}

bool matchLocationPatternAndBuildRanges(const std::vector<Atdo7422LocationExpr>& pattern,
                                       const std::vector<std::string>& stationChain,
                                       const CrewDataContext* dbData,
                                       std::vector<std::pair<std::size_t, std::size_t>>& outRanges) {
    outRanges.clear();
    if (pattern.empty()) {
        return true;
    }
    if (stationChain.size() < pattern.size()) {
        return false;
    }
    outRanges.resize(pattern.size());

    // Allow extra stations inside a location token, e.g. token "NZ" matching "CHC-AKL".
    std::size_t p = 0;
    std::size_t s = 0;
    while (p < pattern.size()) {
        const auto& token = pattern[p];
        const std::size_t tokenStart = s;
        if (s >= stationChain.size() || !token.MatchesAirport(stationChain[s], dbData)) {
            return false;
        }
        const bool lastToken = (p + 1 >= pattern.size());
        if (lastToken) {
            for (; s < stationChain.size(); ++s) {
                if (!token.MatchesAirport(stationChain[s], dbData)) {
                    return false;
                }
            }
            outRanges[p] = {tokenStart, stationChain.size() - 1};
            return true;
        }

        ++s;  // consume at least one station for this token
        const auto& nextToken = pattern[p + 1];
        while (s < stationChain.size()) {
            if (nextToken.MatchesAirport(stationChain[s], dbData)) {
                break;
            }
            if (!token.MatchesAirport(stationChain[s], dbData)) {
                return false;
            }
            ++s;
        }
        outRanges[p] = {tokenStart, s - 1};
        ++p;
    }
    return s == stationChain.size();
}

bool allStationsMatch(const Atdo7422LocationExpr& expr,
                      const std::vector<std::string>& stationChain,
                      std::size_t start,
                      std::size_t end,
                      const CrewDataContext* dbData) {
    if (start > end || end >= stationChain.size()) {
        return false;
    }
    for (std::size_t i = start; i <= end; ++i) {
        if (!expr.MatchesAirport(stationChain[i], dbData)) {
            return false;
        }
    }
    return true;
}

}  // namespace

void CalculateAtdoAfterSlipForSQRule::CalculateDuty(Pairing* pairing) {
    if (pairing == nullptr || _ruleInstances.empty()) {
        return;
    }

    int bestMinRestAtBase = 0;
    const AtdoAfterSlipForSQRuleParam* bestParam = nullptr;
    const Atdo7422ControlParam* bestControl = nullptr;
    RestWindowResult bestRestWindow{};

    const auto pairingServiceType = [&]() -> std::string {
        bool sawOperating = false;
        bool allOperatingAreFreighter = true;
        for (auto* duty : pairing->getDutyVec()) {
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
    }();

    auto pairingOperatingFleetsAreAllowed = [&](const Atdo7422ControlParam& control) -> bool {
        if (control.fleetCodesUpper.empty()) {
            return true;
        }
        bool sawOperating = false;
        bool allOperatingInAllowed = true;
        for (auto* duty : pairing->getDutyVec()) {
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
        return !sawOperating || allOperatingInAllowed;
    };

    for (const auto& instance : _ruleInstances) {
        if (instance.params.empty()) {
            continue;
        }
        const Atdo7422ControlParam& control = instance.control;
        const std::string filterUpper = control.serviceTypeUpper;
        if (!filterUpper.empty() && filterUpper != "*" && filterUpper != pairingServiceType) {
            continue;
        }
        if (!pairingOperatingFleetsAreAllowed(control)) {
            continue;
        }

        for (const auto& p : instance.params) {
            RestWindowResult candidateRestWindow{};
            if (!TryMatchAndCalcMinRestAtBaseMinutes(*pairing, p, control, candidateRestWindow)) {
                continue;
            }
            if (candidateRestWindow.minRestAtBaseMinutes > bestMinRestAtBase) {
                bestMinRestAtBase = candidateRestWindow.minRestAtBaseMinutes;
                bestParam = &p;
                bestControl = &control;
                bestRestWindow = candidateRestWindow;
            }
        }
    }

    if (bestMinRestAtBase <= 0 || bestParam == nullptr || bestControl == nullptr) {
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
    const int atdoDays = CalcDerivedAtdoDaysFromRestWindow(bestRestWindow, *bestControl);
    if (atdoDays > 0) {
        lastDuty->setMinATDO(atdoDays);
    }
}

void CalculateAtdoAfterSlipForSQRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
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

bool CalculateAtdoAfterSlipForSQRule::ParseControlRow(const DBRule& dbRule, Atdo7422ControlParam& control) {
    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string valueUpper = strToUpper(trim(it->second));
        if (headerUpper == "SBY REDUCES REST AND LN" || headerUpper == "SBY REDUCES REST AND LOCAL NIGHT") {
            control.standbyReducesRestAndLocalNight = parseBoolYN(it->second, control.standbyReducesRestAndLocalNight);
        } else if (headerUpper == "REST STARTS AFTER" || headerUpper == "DO STARTS AFTER") {
            if (valueUpper == "DEBRIEF_NXDO" || valueUpper == "DEBRIEF_NEXT_DO") {
                control.restStartsAfter = Atdo7422RestStartsAfter::DebriefNxdo;
            } else if (valueUpper == "DEBRIEF" || valueUpper == "DEBRIEFING") {
                control.restStartsAfter = Atdo7422RestStartsAfter::Debrief;
            } else if (valueUpper == "TRANSPORT" || valueUpper == "DROPOFF" || valueUpper == "DROP OFF" || valueUpper == "DROP-OFF") {
                control.restStartsAfter = Atdo7422RestStartsAfter::Transport;
            }
        } else if (headerUpper == "PAIRING LENGTH ENDS AT" || headerUpper == "PAIRING ENDS AT") {
            control.pairingLengthEndsAt = parsePairingLengthEndsAt(it->second);
        } else if (headerUpper == "STANDBY ASSIGNMENTS") {
            auto list = splitPipeUpper(it->second);
            if (!list.empty()) {
                control.standbyAssignmentsUpper = std::move(list);
            }
        } else if (headerUpper == "OPERATING DEFINITION") {
            if (valueUpper == "DUTY_IS_OPERATING") {
                control.operatingDefinitionType = Atdo7422OperatingDefinitionType::DutyIsOperating;
                control.operatingAssignmentsUpper = {"FLY", "MVO"};
            } else if (valueUpper.rfind("DUTY_ASSIGNMENTS=", 0) == 0) {
                control.operatingDefinitionType = Atdo7422OperatingDefinitionType::DutyAssignmentInList;
                control.operatingAssignmentsUpper = splitPipeUpper(valueUpper.substr(std::string("DUTY_ASSIGNMENTS=").size()));
                if (control.operatingAssignmentsUpper.empty()) {
                    control.operatingAssignmentsUpper = {"FLY", "MVO"};
                }
            } else if (valueUpper == "SEGMENT_IS_OPERATING") {
                control.operatingDefinitionType = Atdo7422OperatingDefinitionType::SegmentIsOperating;
            } else {
                control.operatingDefinitionType = Atdo7422OperatingDefinitionType::SegmentIsOperating;
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
            Logger::getRuleLogger()->warn("Rule 7422 control parameter ignored, header: {}", it->first);
        }
    }
    return true;
}

void CalculateAtdoAfterSlipForSQRule::ParseParam(const InputType& input) {
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
        instance.params.emplace_back(AtdoAfterSlipForSQRuleParam(this));
        auto& p = instance.params.back();
        p.ParseParam(dbRule);
        if (!p.IsValid()) {
            instance.params.pop_back();
        }
    }
}

bool CalculateAtdoAfterSlipForSQRule::IsOperatingDuty(const Duty& duty, const Atdo7422ControlParam& control) {
    if (control.operatingDefinitionType == Atdo7422OperatingDefinitionType::SegmentIsOperating) {
        for (auto* seg : duty.getSegmentsRead()) {
            if (seg != nullptr && seg->getIsOperating()) {
                return true;
            }
        }
        return false;
    }

    const std::string dutyAssignment = duty.getAssignment();
    if (control.operatingDefinitionType == Atdo7422OperatingDefinitionType::DutyIsOperating ||
        control.operatingDefinitionType == Atdo7422OperatingDefinitionType::DutyAssignmentInList) {
        return std::find(control.operatingAssignmentsUpper.begin(),
                         control.operatingAssignmentsUpper.end(),
                         dutyAssignment) != control.operatingAssignmentsUpper.end();
    }
    return false;
}

time_t CalculateAtdoAfterSlipForSQRule::GetRestStartLocAfterDuty(const Duty& duty, const Atdo7422ControlParam& control) {
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

time_t CalculateAtdoAfterSlipForSQRule::CeilToNextMidnight(time_t tLoc, bool exactMidnightNextDay) {
    if (tLoc <= 0) {
        return 0;
    }
    const time_t day = TimeUtils::Truncate(tLoc, ChronoUnit::DAYS);
    if (tLoc == day) {
        return exactMidnightNextDay ? TimeUtils::AddDay(day, 1) : day;
    }
    return TimeUtils::AddDay(day, 1);
}

int CalculateAtdoAfterSlipForSQRule::ClampMinutesOfDay(int minutes) {
    if (minutes < 0) {
        return 0;
    }
    return minutes >= 24 * 60 ? (24 * 60 - 1) : minutes;
}

int CalculateAtdoAfterSlipForSQRule::CalcDerivedAtdoDaysFromRestWindow(const RestWindowResult& restWindow,
                                                                       const Atdo7422ControlParam& control) {
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

bool CalculateAtdoAfterSlipForSQRule::TryMatchAndCalcMinRestAtBaseMinutes(
    const Pairing& pairing,
    const AtdoAfterSlipForSQRuleParam& ruleParam,
    const Atdo7422ControlParam& control,
    RestWindowResult& outRestWindow) const {
    outRestWindow = RestWindowResult{};
    if (!ruleParam.IsValid()) {
        return false;
    }

    const auto& duties = pairing.getDutyVec();
    if (duties.empty() || ruleParam.GetPatternStationChain().empty()) {
        return false;
    }

    const StationChainWithDutyIndex chain = buildStationChainWithDutyIndex(duties);
    if (chain.chain.empty() || chain.arriveDutyIndex.size() != chain.chain.size()) {
        return false;
    }

    if (ruleParam.GetMaxPairingDays() > 0) {
        std::size_t firstDutyIndex = duties.size();
        for (std::size_t i = 0; i < duties.size(); ++i) {
            if (duties[i] != nullptr) {
                firstDutyIndex = i;
                break;
            }
        }
        if (firstDutyIndex >= duties.size() || duties[firstDutyIndex] == nullptr) {
            return false;
        }

        std::size_t lastDutyIndexForDays = duties.size();
        for (std::size_t i = duties.size(); i-- > 0;) {
            if (duties[i] != nullptr) {
                lastDutyIndexForDays = i;
                break;
            }
        }
        if (lastDutyIndexForDays >= duties.size() || duties[lastDutyIndexForDays] == nullptr) {
            return false;
        }

        const time_t startLoc = resolveDutyReportStartLoc(*duties[firstDutyIndex]);
        const time_t endLoc = control.pairingLengthEndsAt == Atdo7422PairingLengthEndsAt::Transport
                                  ? resolveDutyTransportEndLoc(*duties[lastDutyIndexForDays])
                                  : resolveDutyDebriefEndLoc(*duties[lastDutyIndexForDays]);
        if (startLoc <= 0 || endLoc <= 0) {
            return false;
        }
        const time_t startDay = TimeUtils::Truncate(startLoc, ChronoUnit::DAYS);
        const time_t endDay = TimeUtils::Truncate(endLoc, ChronoUnit::DAYS);
        if (startDay <= 0 || endDay <= 0 || endDay < startDay) {
            return false;
        }
        const int pairingDays = static_cast<int>((endDay - startDay) / (24 * 3600)) + 1;
        if (pairingDays > ruleParam.GetMaxPairingDays()) {
            return false;
        }
    }

    const CrewDataContext* dbData = GetDataContext().get();
    std::vector<std::pair<std::size_t, std::size_t>> ranges;
    if (!matchLocationPatternAndBuildRanges(ruleParam.GetPatternStationChain(), chain.chain, dbData, ranges)) {
        return false;
    }

    std::size_t lastDutyIndex = duties.size();
    for (std::size_t i = duties.size(); i-- > 0;) {
        if (duties[i] != nullptr) {
            lastDutyIndex = i;
            break;
        }
    }
    if (lastDutyIndex >= duties.size() || duties[lastDutyIndex] == nullptr) {
        return false;
    }

    if (ranges.size() < 3) {
        return false;
    }

    std::vector<std::size_t> slipCandidates;
    for (std::size_t i = 1; i + 1 < ranges.size(); ++i) {
        if (allStationsMatch(ruleParam.GetSlipStationExpr(), chain.chain, ranges[i].first, ranges[i].second, dbData)) {
            slipCandidates.push_back(i);
        }
    }
    if (slipCandidates.size() != 1) {
        return false;
    }

    const std::size_t slipTokenIndex = slipCandidates.front();
    const std::size_t slipArrIndex = ranges[slipTokenIndex].first;
    const std::size_t slipLastIndex = ranges[slipTokenIndex].second;
    const std::size_t nextTokenStartIndex = ranges[slipTokenIndex + 1].first;
    if (slipArrIndex == 0 || slipArrIndex >= chain.chain.size() || slipLastIndex >= chain.chain.size() ||
        nextTokenStartIndex >= chain.chain.size() || nextTokenStartIndex == 0 || slipLastIndex + 1 != nextTokenStartIndex) {
        return false;
    }

    const std::string prevStation = chain.chain[slipArrIndex - 1];
    const std::string slipArrStation = chain.chain[slipArrIndex];
    const std::string slipDepStation = chain.chain[slipLastIndex];
    const std::string nextStation = chain.chain[nextTokenStartIndex];

    const std::size_t arrivalDutyIndex = chain.arriveDutyIndex[slipArrIndex];
    const std::size_t departDutyIndex = chain.arriveDutyIndex[nextTokenStartIndex];
    if (arrivalDutyIndex >= duties.size() || departDutyIndex >= duties.size()) {
        return false;
    }
    const Duty* arrivalDuty = duties[arrivalDutyIndex];
    const Duty* departDuty = duties[departDutyIndex];
    if (arrivalDuty == nullptr || departDuty == nullptr) {
        return false;
    }
    if (departDutyIndex != lastDutyIndex) {
        return false;
    }
    enum class OperatingStatus {
        Operate,
        NonOperate,
        Invalid // is a duty does not match, usually if Operating definition is segment and duty does not contain such segment
    };
    const OperatingStatus outboundIsOperating = [&]() -> OperatingStatus {
        if (control.operatingDefinitionType == Atdo7422OperatingDefinitionType::SegmentIsOperating) {
            const auto& segs = arrivalDuty->getSegmentsRead();
            Segment* matchedSegment = nullptr;
            for (auto seg : segs) {
                if (seg->getDepStation() == prevStation && seg->getArrStation() == slipArrStation) {
                    matchedSegment = seg;
                    break;
                }
            }
            if (matchedSegment == nullptr)
                return OperatingStatus::Invalid;
            return matchedSegment->getIsOperating() ? OperatingStatus::Operate : OperatingStatus::NonOperate;
        }
		return IsOperatingDuty(*arrivalDuty, control) ? OperatingStatus::Operate : OperatingStatus::NonOperate;
    }();

    if (outboundIsOperating == OperatingStatus::Invalid) 
        return false;
    if (ruleParam.GetSlipArrIsOperatingRequirement() != Atdo7422SectorRequirement::Any) {
        if (ruleParam.GetSlipArrIsOperatingRequirement() == Atdo7422SectorRequirement::Operate 
			&& outboundIsOperating != OperatingStatus::Operate) {
            return false;
        }
        if (ruleParam.GetSlipArrIsOperatingRequirement() == Atdo7422SectorRequirement::NonOperate 
            && outboundIsOperating != OperatingStatus::NonOperate) {
            return false;
        }
    }

    const OperatingStatus inboundIsOperating = [&]() -> OperatingStatus {
        if (control.operatingDefinitionType == Atdo7422OperatingDefinitionType::SegmentIsOperating) {
            const auto& segs = departDuty->getSegmentsRead();
            Segment* matchedSegment = nullptr;
            for (auto seg : segs) {
                if (seg->getDepStation() == slipDepStation && seg->getArrStation() == nextStation) {
                    matchedSegment = seg;
                    break;
                }
			}
            if (matchedSegment == nullptr)
				return OperatingStatus::Invalid;
			return matchedSegment->getIsOperating() ? OperatingStatus::Operate : OperatingStatus::NonOperate;
        }
		return IsOperatingDuty(*departDuty, control) ? OperatingStatus::Operate : OperatingStatus::NonOperate;
    }();

    if (inboundIsOperating == OperatingStatus::Invalid) 
		return false;
    if (ruleParam.GetSlipDepIsOperatingRequirement() != Atdo7422SectorRequirement::Any) {
        if (ruleParam.GetSlipDepIsOperatingRequirement() == Atdo7422SectorRequirement::Operate 
            && inboundIsOperating != OperatingStatus::Operate) {
            return false;
        }
        if (ruleParam.GetSlipDepIsOperatingRequirement() == Atdo7422SectorRequirement::NonOperate 
            && inboundIsOperating != OperatingStatus::NonOperate) {
            return false;
        }
    }

    const time_t slipStartLoc = GetRestStartLocAfterDuty(*arrivalDuty, control);
    const time_t slipEndLoc = departDuty->getStartTimeLocAct();
    if (slipStartLoc <= 0 || slipEndLoc <= 0 || slipEndLoc <= slipStartLoc) {
        return false;
    }
    const int slipMinutes = static_cast<int>((slipEndLoc - slipStartLoc) / 60);
    const int standbyMinutes = control.standbyReducesRestAndLocalNight
                                   ? standbyTotalMinutesWithinWindow(duties,
                                                                    arrivalDutyIndex + 1,
                                                                    departDutyIndex > 0 ? (departDutyIndex - 1) : 0,
                                                                    slipStartLoc,
                                                                    slipEndLoc,
                                                                    control.standbyAssignmentsUpper)
                                   : 0;
    const int effectiveSlipMinutes = std::max(0, slipMinutes - standbyMinutes);
    if (effectiveSlipMinutes >= ruleParam.GetSlipLtHours() * 60) {
        return false;
    }

    const time_t restStartLoc = GetRestStartLocAfterDuty(*departDuty, control);
    if (restStartLoc <= 0) {
        return false;
    }

    int offsetTZMinute = 0;
    const time_t dutyEndLoc = departDuty->getEndTimeLocAct();
    const time_t dutyEndUtc = departDuty->getEndTimeUtcAct();
    if (dutyEndLoc > 0 && dutyEndUtc > 0) {
        offsetTZMinute = static_cast<int>((dutyEndLoc - dutyEndUtc) / 60);
    }
    std::string restZoneId;
    if (const auto dataContext = this->GetDataContext()) {
        restZoneId = dataContext->getAirportZoneId(departDuty->getArrivalStation());
    }

    const time_t restStartUtc = calcRestStartUtcAfterDuty(*departDuty, control, offsetTZMinute);

    time_t requiredEndLoc = restStartLoc;

    if (ruleParam.GetAtdoDays() > 0 || ruleParam.GetFollowingDoAllowAfterMinutes() > 0) {
        const time_t candidate = calcRestEndLocByAtdoDays(restStartLoc,
                                                         ruleParam.GetAtdoDays(),
                                                         ruleParam.GetFollowingDoAllowAfterMinutes(),
                                                         exactMidnightStartsNextDay(control.restStartsAfter));
        if (candidate > requiredEndLoc) {
            requiredEndLoc = candidate;
        }
    }

    if (ruleParam.GetAtdoHours() > 0) {
        const time_t candidate = restStartLoc + static_cast<time_t>(ruleParam.GetAtdoHours()) * 3600;
        if (candidate > requiredEndLoc) {
            requiredEndLoc = candidate;
        }
    }

    if (ruleParam.GetAtdoLocalNights() > 0 && restStartUtc > 0) {
        const time_t requiredEndUtc = DutyUtils::GetRestEndTimeMeetingNumLocalNights(
            restStartUtc, offsetTZMinute, restZoneId, ruleParam.GetAtdoLocalNights());
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

    // The system's pairing end time (and thus `endTimeIncludesRestInUTC`) is based on duty end + dropoff (transport).
    // When rule 7422 is configured to start DO after DEBRIEF, the dropoff portion is considered part of the DO/rest,
    // so the remaining rest required after transport should be reduced by the dropoff minutes to avoid a shift
    // (e.g., ending at 01:00 LT instead of 00:00 LT for 2 ATDO days).
    if (isDebriefBased(control.restStartsAfter)) {
        const int dropoffMin = getDutyDropoffMinutes(*departDuty);
        outRestWindow.minRestAtBaseMinutes = std::max(0, outRestWindow.minRestAtBaseMinutes - dropoffMin);
    }
    return outRestWindow.minRestAtBaseMinutes > 0;
}
