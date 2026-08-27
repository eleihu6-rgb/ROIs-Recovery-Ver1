/**
 * @file CheckAnrConsecutiveSpecialDutyRule.cpp
 */

#include "CheckAnrConsecutiveSpecialDutyRule.h"

#include <algorithm>

#include "CrewDB.h"
#include "Utility.h"
#include "StringUtil.h"
#include "TimezoneUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"

namespace {

bool isFlightSegment(const Segment* seg) {
    return seg != nullptr && (seg->getIsOperating() || seg->isDeadhead());
}

std::string dutyAssignmentUpperOrDefault(const Duty& duty) {
    const std::string assignment = duty.getAssignment();
    return assignment.empty() ? "FLY" : assignment;
}

bool assignmentInListUpper(const std::string& assignmentUpper,
                           const std::vector<std::string>& listUpper) {
    if (listUpper.empty()) {
        return false;
    }
    return std::find(listUpper.begin(), listUpper.end(), assignmentUpper) != listUpper.end();
}

bool isDutyIgnoredByControl(const Duty& duty,
                            const AnrConsecutiveSpecialDutyControlParam& control) {
    if (control.ignoreIntermediateAssignmentsUpper.empty()) {
        return false;
    }
    return assignmentInListUpper(dutyAssignmentUpperOrDefault(duty),
                                 control.ignoreIntermediateAssignmentsUpper);
}

bool isDutyReducingByControl(const Duty& duty,
                             const AnrConsecutiveSpecialDutyControlParam& control) {
    if (control.reduceAllIntermediateAssignments) {
        return true;
    }
    return assignmentInListUpper(dutyAssignmentUpperOrDefault(duty),
                                 control.reduceRestAndLocalNightAssignmentsUpper);
}

int maxContinuousGapMinutes(time_t windowStartUtc,
                            time_t windowEndUtc,
                            std::vector<std::pair<time_t, time_t>> busyIntervalsUtc) {
    if (windowStartUtc <= 0 || windowEndUtc <= 0 || windowEndUtc <= windowStartUtc) {
        return 0;
    }
    if (busyIntervalsUtc.empty()) {
        return static_cast<int>((windowEndUtc - windowStartUtc) / 60);
    }

    std::sort(busyIntervalsUtc.begin(), busyIntervalsUtc.end());

    time_t cursor = windowStartUtc;
    time_t maxGapSeconds = 0;
    for (const auto& interval : busyIntervalsUtc) {
        const time_t s = std::max(interval.first, windowStartUtc);
        const time_t e = std::min(interval.second, windowEndUtc);
        if (e <= s) {
            continue;
        }

        if (s > cursor) {
            maxGapSeconds = std::max(maxGapSeconds, s - cursor);
        }
        if (e > cursor) {
            cursor = e;
        }
    }

    if (windowEndUtc > cursor) {
        maxGapSeconds = std::max(maxGapSeconds, windowEndUtc - cursor);
    }
    return static_cast<int>(maxGapSeconds / 60);
}

int getDynamicArrivalOffsetMinutes(const Duty* duty,
                                   time_t restStartUtc,
                                   const SharedPtr<CrewDataContext>& dbData) {
    if (duty == nullptr || dbData == nullptr) {
        return 0;
    }
    const std::string zoneId = dbData->getAirportZoneId(duty->getArrivalStation());
    return TimezoneUtils::GetTimezoneOffset(restStartUtc, zoneId);
}

int getDynamicDepartureOffsetMinutes(const Duty* duty,
                                     time_t restEndUtc,
                                     const SharedPtr<CrewDataContext>& dbData) {
    if (duty == nullptr || dbData == nullptr) {
        return 0;
    }
    const std::string zoneId = dbData->getAirportZoneId(duty->getDepartureStation());
    return TimezoneUtils::GetTimezoneOffset(restEndUtc, zoneId);
}

}  // namespace

bool CheckAnrConsecutiveSpecialDutyRule::CheckRule(const Pairing* pairing) const {
    return checkPairing(pairing, nullptr);
}

bool CheckAnrConsecutiveSpecialDutyRule::CheckRule(
    const std::vector<const ROSTER*>& rosters) const {
    if (rosters.empty()) {
        return true;
    }
    for (const auto* roster : rosters) {
        if (!roster || !roster->pairing) {
            continue;
        }
        if (!checkPairing(roster->pairing, roster)) {
            return false;
        }
    }
    return true;
}

bool CheckAnrConsecutiveSpecialDutyRule::checkPairing(const Pairing* pairing,
                                                      const ROSTER* roster) const {
    if (pairing == nullptr || _dbData == nullptr) {
        return true;
    }
    if (!_param.hasConfig()) {
        return true;
    }

    const auto& duties = pairing->getDutyVec();
    if (duties.empty()) {
        return true;
    }

    for (const auto& instance : _param.getInstances()) {
        if (instance.configs.empty()) {
            continue;
        }

        const auto& control = instance.control;
        std::vector<std::size_t> boundaryIdx;
        boundaryIdx.reserve(duties.size());
        for (std::size_t i = 0; i < duties.size(); ++i) {
            const Duty* d = duties[i];
            if (d == nullptr) {
                continue;
            }
            if (isDutyIgnoredByControl(*d, control)) {
                continue;
            }
            boundaryIdx.push_back(i);
        }
        if (boundaryIdx.empty()) {
            continue;
        }

        std::vector<RestInfo> boundaryRests;
        boundaryRests.reserve(boundaryIdx.size() > 0 ? boundaryIdx.size() - 1 : 0);
        for (std::size_t bi = 0; bi + 1 < boundaryIdx.size(); ++bi) {
            boundaryRests.emplace_back(evaluateRest(duties[boundaryIdx[bi]],
                                                    duties[boundaryIdx[bi + 1]],
                                                    control,
                                                    duties,
                                                    boundaryIdx[bi],
                                                    boundaryIdx[bi + 1]));
        }

        // keep special flags outside so it can be reused if config is the same.
        std::vector<bool> specialFlags;
        specialFlags.reserve(boundaryIdx.size());
        bool specialFlagsValid = false;
        bool specialFlagsIncludeDhd = false;

        for (const auto& config : instance.configs) {
            const int required = config.numConsecutiveDuties;
            if (required <= 1) {
                continue;
            }
            if (boundaryIdx.size() < static_cast<size_t>(required)) {
                continue;
            }

            // Only update special flags when config changes (or first use).
            if (!specialFlagsValid || specialFlagsIncludeDhd != config.includeTrailingDeadhead) {
                specialFlags.clear();
                for (const auto idx : boundaryIdx) {
                    specialFlags.push_back(isSpecialDuty(duties[idx], config.includeTrailingDeadhead));
                }
                specialFlagsValid = true;
                specialFlagsIncludeDhd = config.includeTrailingDeadhead;
            }

            for (size_t i = 0; i < boundaryIdx.size();) {
                if (!specialFlags[i]) {
                    ++i;
                    continue;
                }

                size_t consecutiveSpecialDutyIdx = i;
                while (consecutiveSpecialDutyIdx < boundaryIdx.size() &&
                       specialFlags[consecutiveSpecialDutyIdx]) {
                    ++consecutiveSpecialDutyIdx;
                }

                const size_t blockLength = consecutiveSpecialDutyIdx - i;
                if (blockLength >= static_cast<size_t>(required)) {
                    if (config.restType == AnrConsecutiveSpecialDutyRestType::PRE ||
                        config.restType == AnrConsecutiveSpecialDutyRestType::POST) {
                        // For PRE/POST, a qualifying rest between adjacent special duties breaks the
                        // consecutive chain. Split by those qualifying internal rests, then evaluate
                        // PRE/POST rest requirement on each resulting sub-block.
                        size_t subBlockStart = i;
                        while (subBlockStart < consecutiveSpecialDutyIdx) {
                            size_t subBlockEnd = subBlockStart + 1;
                            while (subBlockEnd < consecutiveSpecialDutyIdx) {
                                const RestInfo& internalRest = boundaryRests[subBlockEnd - 1];
                                if (restQualifies(internalRest, config)) {
                                    break;
                                }
                                ++subBlockEnd;
                            }

                            const size_t subBlockLength = subBlockEnd - subBlockStart;
                            if (subBlockLength >= static_cast<size_t>(required)) {
                                for (size_t windowStart = 0;
                                     windowStart + required <= subBlockLength;
                                     ++windowStart) {
                                    const size_t windowFirstIdx = subBlockStart + windowStart;
                                    const size_t windowLastIdx = windowFirstIdx + required - 1;
                                    const Duty* windowFirst = duties[boundaryIdx[windowFirstIdx]];
                                    const Duty* windowLast = duties[boundaryIdx[windowLastIdx]];
                                    if (config.restType ==
                                        AnrConsecutiveSpecialDutyRestType::PRE) {
                                        if (windowFirstIdx == 0) {
                                            continue;
                                        }

                                        const RestInfo& priorRest =
                                            boundaryRests[windowFirstIdx - 1];
                                        if (!restQualifies(priorRest, config)) {
                                            throwViolation(pairing,
                                                           roster,
                                                           windowFirst,
                                                           windowLast,
                                                           priorRest,
                                                           config);
                                            return false;
                                        }
                                    } else {
                                        const size_t nextIdx = windowLastIdx + 1;
                                        if (nextIdx >= boundaryIdx.size()) {
                                            continue;
                                        }
                                        const RestInfo& postRest = boundaryRests[windowLastIdx];
                                        if (!restQualifies(postRest, config)) {
                                            throwViolation(pairing,
                                                           roster,
                                                           windowFirst,
                                                           windowLast,
                                                           postRest,
                                                           config);
                                            return false;
                                        }
                                    }
                                }
                            }

                            if (subBlockEnd == consecutiveSpecialDutyIdx) {
                                break;
                            }
                            subBlockStart = subBlockEnd;
                        }

                        i = consecutiveSpecialDutyIdx;
                        continue;
                    }

                    for (size_t windowStart = 0; windowStart + required <= blockLength; ++windowStart) {
                        const size_t windowFirstIdx = i + windowStart;
                        const size_t windowLastIdx = windowFirstIdx + required - 1;
                        const Duty* windowFirst = duties[boundaryIdx[windowFirstIdx]];
                        const Duty* windowLast = duties[boundaryIdx[windowLastIdx]];

                        if (config.restType == AnrConsecutiveSpecialDutyRestType::POST) {
                            const size_t nextIdx = windowLastIdx + 1;
                            if (nextIdx >= boundaryIdx.size()) {
                                continue;
                            }
                            RestInfo& rest = boundaryRests[windowLastIdx];
                            if (!restQualifies(rest, config)) {
                                throwViolation(pairing, roster, windowFirst, windowLast, rest, config);
                                return false;
                            }
                            continue;
                        }

                        const size_t restStartIdx = windowFirstIdx;
                        const size_t restEndIdx = restStartIdx + required - 2;
                        bool hasQualifyingRest = false;
                        RestInfo bestRest = boundaryRests[restStartIdx];

                        for (size_t r = restStartIdx; r <= restEndIdx; ++r) {
                            const RestInfo& candidate = boundaryRests[r];
                            if (restQualifies(candidate, config)) {
                                hasQualifyingRest = true;
                                break;
                            }
                            if (candidate.minutes > bestRest.minutes ||
                                (candidate.minutes == bestRest.minutes &&
                                 candidate.localNights > bestRest.localNights)) {
                                bestRest = candidate;
                            }
                        }

                        if (!hasQualifyingRest) {
                            throwViolation(pairing, roster, windowFirst, windowLast, bestRest, config);
                            return false;
                        }
                    }
                }

                i = consecutiveSpecialDutyIdx;
            }
        }
    }

    return true;
}

bool CheckAnrConsecutiveSpecialDutyRule::isSpecialDuty(const Duty* duty, bool includeTrailingDhd) const {
    if (duty == nullptr) {
        return false;
    }

    const auto& segments = duty->getSegmentsRead();
    int firstFlightIdx = -1;
    int lastFlightIdx = -1;
    int lastOperatingIdx = -1;
    for (size_t idx = 0; idx < segments.size(); ++idx) {
        const auto* seg = segments[idx];
        if (!isFlightSegment(seg)) {
            continue;
        }
        if (firstFlightIdx < 0) {
            firstFlightIdx = static_cast<int>(idx);
        }
        lastFlightIdx = static_cast<int>(idx);
        if (seg->getIsOperating()) {
            lastOperatingIdx = static_cast<int>(idx);
        }
    }

    if (firstFlightIdx < 0) {
        return false;
    }
    // Pure position duties are never special for 7414. Trailing deadhead only
    // affects classification when there is at least one operating sector.
    if (lastOperatingIdx < 0) {
        return false;
    }
    int lastCheckIdx = lastFlightIdx;
    if (!includeTrailingDhd) {
        lastCheckIdx = lastOperatingIdx;
    }

    const Segment* firstFlight = segments[firstFlightIdx];
    const Segment* lastCheckFlight = lastCheckIdx >= 0 ? segments[lastCheckIdx] : nullptr;

    const int refOffsetMinutes = duty->getRefTimeZone();
    const time_t firstDepUtc = firstFlight->getStartTimeUtcAct();
    const bool earlyStart = DutyUtils::IsEarlyStartDuty(firstDepUtc, refOffsetMinutes);

    bool lateFinish = false;
    if (lastCheckFlight != nullptr) {
        const time_t lastArrUtc = lastCheckFlight->getEndTimeUtcAct();
        lateFinish = DutyUtils::IsLateFinishTime(lastArrUtc, refOffsetMinutes);
    }

    bool woclDuty = false;
    // check until last check index (if trailing deadhead is ignored, skip wocl check)
    for (int idx = firstFlightIdx; idx <= lastCheckIdx; ++idx) {
        const auto* seg = segments[idx];
        if (!isFlightSegment(seg)) {
            continue;
        }
        const time_t depUtc = seg->getStartTimeUtcAct();
        const time_t arrUtc = seg->getEndTimeUtcAct();
        if (DutyUtils::IsWoclTime(depUtc, depUtc, refOffsetMinutes) ||
            DutyUtils::IsWoclTime(arrUtc, arrUtc, refOffsetMinutes)) {
            woclDuty = true;
            break;
        }
    }

    return earlyStart || lateFinish || woclDuty;
}

CheckAnrConsecutiveSpecialDutyRule::RestInfo CheckAnrConsecutiveSpecialDutyRule::evaluateRest(
    const Duty* prevDuty,
    const Duty* nextDuty,
    const AnrConsecutiveSpecialDutyControlParam& control,
    const std::vector<Duty*>& duties,
    std::size_t prevIdx,
    std::size_t nextIdx) const {
    RestInfo info{};
    if (prevDuty == nullptr || nextDuty == nullptr) {
        return info;
    }

    info.prev = prevDuty;
    info.next = nextDuty;
    info.minutes = DutyUtils::GetActualRestMinutes(info.startUtc, prevDuty, nextDuty, this->_dbData);
    if (info.minutes < 0) {
        info.minutes = 0;
    }
    info.endUtc = info.startUtc + static_cast<time_t>(info.minutes) * 60;

    const int offsetMinutes = getDynamicArrivalOffsetMinutes(prevDuty, info.startUtc, this->_dbData);
    const std::string restZoneId = nextDuty != nullptr
        ? this->_dbData->getAirportZoneId(nextDuty->getDepartureStation())
        : this->_dbData->getAirportZoneId(prevDuty->getArrivalStation());
    const int restEndOffsetMinutes = getDynamicDepartureOffsetMinutes(nextDuty, info.endUtc, this->_dbData);
    info.localNights = DutyUtils::GetLocalNightNums(info.startUtc, info.endUtc, offsetMinutes, restEndOffsetMinutes, restZoneId);

    if (nextIdx > prevIdx + 1 &&
        (control.reduceAllIntermediateAssignments ||
         !control.reduceRestAndLocalNightAssignmentsUpper.empty())) {
        std::vector<std::pair<time_t, time_t>> busyIntervalsUtc;
        for (std::size_t mi = prevIdx + 1; mi < nextIdx; ++mi) {
            const Duty* mid = duties[mi];
            if (mid == nullptr) {
                continue;
            }
            if (!isDutyReducingByControl(*mid, control)) {
                continue;
            }
            const time_t s = mid->getStartTimeUtcAct();
            const time_t e = mid->getEndTimeUtcAct();
            if (s <= 0 || e <= 0 || e <= s) {
                continue;
            }
            busyIntervalsUtc.push_back({s, e});
        }

        if (!busyIntervalsUtc.empty()) {
            info.minutes = maxContinuousGapMinutes(info.startUtc, info.endUtc, busyIntervalsUtc);
            info.localNights = DutyUtils::GetLocalNightNumsExcludingIntervals(
                info.startUtc, info.endUtc, offsetMinutes, restEndOffsetMinutes, restZoneId, busyIntervalsUtc);
        }
    }
    return info;
}

bool CheckAnrConsecutiveSpecialDutyRule::restQualifies(
    const RestInfo& rest,
    const AnrConsecutiveSpecialDutyConfig& config) const {
    if (rest.minutes < config.minRestMinutes) {
        return false;
    }
    if (config.minLocalNights >= 0 && rest.localNights < config.minLocalNights) {
        return false;
    }
    return true;
}

void CheckAnrConsecutiveSpecialDutyRule::throwViolation(
    const Pairing* pairing,
    const ROSTER* roster,
    const Duty* windowStart,
    const Duty* windowEnd,
    const RestInfo& bestRest,
    const AnrConsecutiveSpecialDutyConfig& config) const {
    const std::string minRestLabel =
        Utility::GetInstancePtr()->formatMinutes(config.minRestMinutes);
    const std::string actualRestLabel =
        Utility::GetInstancePtr()->formatMinutes(std::max(0, bestRest.minutes));
    const std::string minNightLabel =
        config.minLocalNights < 0 ? std::string("*") : std::to_string(config.minLocalNights);
    const std::string actualNightLabel = std::to_string(bestRest.localNights);

    _ruleViolation.SetParam("rest_type", config.restTypeLabel);
    _ruleViolation.SetParam("required_consecutive", std::to_string(config.numConsecutiveDuties));
    _ruleViolation.SetParam("min_rest_minutes", std::to_string(config.minRestMinutes));
    _ruleViolation.SetParam("min_local_nights", minNightLabel);
    _ruleViolation.SetParam("window_start_seq", windowStart ? std::to_string(windowStart->getDutySeq()) : "0");
    _ruleViolation.SetParam("window_end_seq", windowEnd ? std::to_string(windowEnd->getDutySeq()) : "0");
    _ruleViolation.SetParam("actual_rest_minutes", std::to_string(std::max(0, bestRest.minutes)));
    _ruleViolation.SetParam("actual_local_nights", actualNightLabel);

    std::string message;
    if (config.restType == AnrConsecutiveSpecialDutyRestType::PRE) {
        message = "[ANR] Consecutive special duties (seq {0}-{1}) require prior rest of {2}";
    } else if (config.restType == AnrConsecutiveSpecialDutyRestType::POST) {
        message = "[ANR] Consecutive special duties (seq {0}-{1}) require post rest of {2}";
    } else {
        message =
            "[ANR] Consecutive special duties (seq {0}-{1}) require at least one rest of {2}";
    }
    if (config.minLocalNights >= 0) {
        message += " with >= {3} local night(s)";
    }
    message += ", best rest was {4}";
    if (config.minLocalNights >= 0) {
        message += " with {5} local night(s)";
    }

    message = StringUtils::Format(message,
                                  _ruleViolation.GetParam("window_start_seq"),
                                  _ruleViolation.GetParam("window_end_seq"),
                                  minRestLabel,
                                  minNightLabel,
                                  actualRestLabel,
                                  actualNightLabel);

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->startDTUtc = windowStart ? windowStart->getStartTimeUtcAct() : 0;
    rv->endDTUtc = windowEnd ? windowEnd->getEndTimeUtcAct() : 0;
    rv->pairingId = pairing ? pairing->getDbId()
                            : (windowStart ? windowStart->getPairingId() : 0);
    rv->dutySequenceNumber = windowStart ? windowStart->getDutySeq() : 0;
    if (roster) {
        rv->crewId = roster->idcrew;
        rv->rosterId = roster->rosterId;
        rv->type = CREW_VIOLATION;
    } else {
        rv->type = PAIRING_VIOLATION;
    }
    rv->idRule = config.idRule == 0 ? RuleFuncId : config.idRule;
    rv->ruleParamId = config.idRuleParam;
    rv->description = config.description;
    rv->reference = config.reference;
    rv->ishard = (config.overrideAbility == "H" || config.overrideAbility == "h");

    rv->operation_result.insert(std::make_pair("ruleId", std::to_string(RuleFuncId)));
    rv->operation_result.insert(std::make_pair("required_consecutive",
                                               std::to_string(config.numConsecutiveDuties)));
    rv->operation_result.insert(std::make_pair("rest_type", config.restTypeLabel));
    rv->operation_result.insert(std::make_pair("min_rest_minutes",
                                               std::to_string(config.minRestMinutes)));
    rv->operation_result.insert(std::make_pair("min_local_nights", minNightLabel));
    rv->operation_result.insert(std::make_pair("actual_rest_minutes",
                                               std::to_string(std::max(0, bestRest.minutes))));
    rv->operation_result.insert(std::make_pair("actual_local_nights", actualNightLabel));

    rv->violation_msg = message;
    _ruleViolation.AddRuleViolations(rv);
}
