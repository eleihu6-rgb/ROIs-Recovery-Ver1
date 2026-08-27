/**
 * @file AcopSlipPatternRule.cpp
 */

#include "AcopSlipPatternRule.h"

#include <algorithm>
#include <limits>
#include <map>
#include <optional>
#include <unordered_map>
#include <utility>
#include <vector>

#include "AcopSlipPatternExtraConditions.h"

#include "Log/Logger.h"
#include "StringUtil.h"

#include "../framework/constant/Constants.h"
#include "../framework/utils/DutyUtils.h"
#include "../framework/utils/LocationMatchUtils.h"
#include "../framework/utils/StringUtils.h"
#include "../framework/utils/TimeUtils.h"

#include "../rule7405/UlrDutyDefinition.h"

namespace {

bool parseBoolYN(const std::string& value, bool defaultValue) {
    const std::string v = strToUpper(trim(value));
    if (v.empty() || v == "*" || v == RuleParamConstant::IGNORED) {
        return defaultValue;
    }
    return v == "Y" || v == "YES" || v == "TRUE" || v == "1";
}

AcopRestStartsAfter parseRestStartsAfter(const std::string& value, AcopRestStartsAfter defaultValue) {
    const std::string v = strToUpper(trim(value));
    if (v.empty() || v == "*" || v == RuleParamConstant::IGNORED) {
        return defaultValue;
    }
    if (v == "TRANSPORT" || v == "DROPOFF" || v == "DROP OFF" || v == "DROP-OFF") {
        return AcopRestStartsAfter::Transport;
    }
    if (v == "DEBRIEF" || v == "DEBRIEFING") {
        return AcopRestStartsAfter::Debrief;
    }
    // Backward-compatible: treat Y/1/TRUE as "DEBRIEF" (transport counts as rest), otherwise "TRANSPORT".
    return parseBoolYN(v, false) ? AcopRestStartsAfter::Debrief : AcopRestStartsAfter::Transport;
}

std::vector<std::string> parsePipeListUpper(const std::string& value) {
    std::vector<std::string> out;
    const std::string trimmed = trim(value);
    if (trimmed.empty() || trimmed == "*" || trimmed == RuleParamConstant::IGNORED) {
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

int parseOptimizerPassLevel(const std::string& value, int defaultValue) {
    const std::string v = strToUpper(trim(value));
    if (v.empty() || v == "*" || v == RuleParamConstant::IGNORED) {
        return defaultValue;
    }

    if (v == "ANY") {
        return 255;
    }
    if (v == "NONE") {
        return -1;
    }
    if (v == "WARNING") {
        return 2;
    }
    if (v == "CRITICAL" || v == "CRITICAL ALERT" || v == "CRITICAL_ALERT") {
        return 4;
    }
    if (v == "INVIOLABLE") {
        return 5;
    }

    try {
        return std::stoi(v);
    } catch (...) {
        return defaultValue;
    }
}

std::string safeLabel(const std::string& value, const std::string& fallback) {
    return value.empty() ? fallback : value;
}

constexpr const char* kUlrEffectiveDateHeader = "EFFECTIVE DATE";
constexpr const char* kUlrExpiryDateHeader = "EXPIRY DATE";

struct StayMetrics {
    bool valid{false};

    time_t startLoc{0};
    time_t endLoc{0};

    // Slip window duration (minutes), from rest start to rest end, ignoring standby reduction logic.
    int windowMinutes{0};

    int effectiveRestMinutes{0};
    int localNights{0};
    time_t lastLocalNightStartDateLoc{0};

    int standbyPeriods{0};  // number of standby sectors within slip
    int standbyTotalMinutes{0};
};

bool isOnDayAfterLocalNightStartDate(time_t dutyStartLoc, time_t localNightStartDateLoc) {
    if (dutyStartLoc <= 0 || localNightStartDateLoc <= 0) {
        return false;
    }
    const time_t dutyDay = TimeUtils::Truncate(dutyStartLoc, ChronoUnit::DAYS);
    const time_t localNightStartDay = TimeUtils::Truncate(localNightStartDateLoc, ChronoUnit::DAYS);
    const time_t requiredDutyDay = TimeUtils::AddDay(localNightStartDay, 1);
    return dutyDay == requiredDutyDay;
}

int getDutyDropoffMinutes(const Duty& duty) {
    int dropoff = duty.getActualDropoffMin();
    if (dropoff <= 0) {
        dropoff = duty.getMinDropoff();
    }
    return dropoff < 0 ? 0 : dropoff;
}

int getDutyDebriefMinutes(const Duty& duty) {
    int debrief = duty.getActualDebriefMin();
    if (debrief <= 0) {
        debrief = duty.getMinDebrief();
    }
    return debrief < 0 ? 0 : debrief;
}

int getDutyPickupMinutes(const Duty& duty) {
    int pickup = duty.getActualPickupMin();
    if (pickup <= 0) {
        pickup = duty.getMinPickup();
    }
    return pickup < 0 ? 0 : pickup;
}

time_t getFirstFlightDepartTimeLoc(const Pairing& pairing) {
    const auto& duties = pairing.getDutyVec();
    for (auto* duty : duties) {
        if (duty == nullptr) {
            continue;
        }
        for (auto* seg : duty->getSegmentsRead()) {
            if (seg == nullptr) {
                continue;
            }
            const time_t departLoc = seg->getStartTimeLocAct();
            if (departLoc > 0) {
                return departLoc;
            }
        }
    }
    return 0;
}

time_t getRestStartLocAfterDuty(const Duty& duty, const AcopSlipPatternControlParam& control) {
    const time_t endLoc = duty.getEndTimeLocAct();
    if (endLoc <= 0) {
        return 0;
    }
    if (control.restStartsAfter == AcopRestStartsAfter::Debrief) {
        return endLoc;
    }
    const int dropoffMin = getDutyDropoffMinutes(duty);
    return endLoc + static_cast<time_t>(dropoffMin) * 60;
}

time_t getRestEndLocBeforeDuty(const Duty& duty) {
    const time_t startLoc = duty.getStartTimeLocAct();
    return startLoc;
}

time_t getRestStartUtcAfterDuty(const Duty& duty, const AcopSlipPatternControlParam& control) {
    const time_t endUtc = duty.getEndTimeUtcAct();
    if (endUtc <= 0) {
        return 0;
    }
    if (control.restStartsAfter == AcopRestStartsAfter::Debrief) {
        return endUtc;
    }
    const int dropoffMin = getDutyDropoffMinutes(duty);
    return endUtc + static_cast<time_t>(dropoffMin) * 60;
}

time_t getRestEndUtcBeforeDuty(const Duty& duty) {
    return duty.getStartTimeUtcAct();
}

int getDutyEndOffsetMinutes(const Duty& duty) {
    const time_t endLoc = duty.getEndTimeLocAct();
    const time_t endUtc = duty.getEndTimeUtcAct();
    if (endLoc <= 0 || endUtc <= 0) {
        return 0;
    }
    return static_cast<int>((endLoc - endUtc) / 60);
}

int getDutyStartOffsetMinutes(const Duty& duty) {
    const time_t startLoc = duty.getStartTimeLocAct();
    const time_t startUtc = duty.getStartTimeUtcAct();
    if (startLoc <= 0 || startUtc <= 0) {
        return 0;
    }
    return static_cast<int>((startLoc - startUtc) / 60);
}

std::string getRestZoneId(const Duty* arriveDuty,
                          const Duty* departDuty,
                          const CrewDataContext* dbData) {
    if (dbData == nullptr) {
        return {};
    }
    if (departDuty != nullptr) {
        const std::string depZoneId = dbData->getAirportZoneId(departDuty->getDepartureStation());
        if (!depZoneId.empty()) {
            return depZoneId;
        }
    }
    if (arriveDuty != nullptr) {
        return dbData->getAirportZoneId(arriveDuty->getArrivalStation());
    }
    return {};
}

int getLocalNightNumsForRestWindow(const Duty* arriveDuty,
                                   const Duty* departDuty,
                                   const AcopSlipPatternControlParam& control,
                                   const CrewDataContext* dbData,
                                   time_t fallbackStartLoc,
                                   time_t fallbackEndLoc) {

    const time_t restStartUtc = getRestStartUtcAfterDuty(*arriveDuty, control);
    const time_t restEndUtc = getRestEndUtcBeforeDuty(*departDuty);
    const std::string zoneId = getRestZoneId(arriveDuty, departDuty, dbData);
    if (restStartUtc <= 0 || restEndUtc <= restStartUtc || zoneId.empty()) {
        return 0;
    }

    // Pragmatic shortcut: use duty endpoint local/UTC deltas as the DST detector.
    // Rare limitation: if the effective rest boundary shifts across a DST transition because of
    // rest-start transport/debrief adjustments, the detector may miss that edge case.
    const int startOffsetMinutes = getDutyEndOffsetMinutes(*arriveDuty);
    const int endOffsetMinutes = getDutyStartOffsetMinutes(*departDuty);
    return DutyUtils::GetLocalNightNums(restStartUtc, restEndUtc, startOffsetMinutes, endOffsetMinutes, zoneId);
}

std::vector<time_t> getLocalNightDatesForRestWindow(const Duty* arriveDuty,
                                                    const Duty* departDuty,
                                                    const AcopSlipPatternControlParam& control,
                                                    const CrewDataContext* dbData,
                                                    time_t fallbackStartLoc,
                                                    time_t fallbackEndLoc) {

    const time_t restStartUtc = getRestStartUtcAfterDuty(*arriveDuty, control);
    const time_t restEndUtc = getRestEndUtcBeforeDuty(*departDuty);
    const std::string zoneId = getRestZoneId(arriveDuty, departDuty, dbData);
    if (restStartUtc <= 0 || restEndUtc <= restStartUtc || zoneId.empty()) {
        return {};
    }

    // Pragmatic shortcut: use duty endpoint local/UTC deltas as the DST detector.
    // Rare limitation: if the effective rest boundary shifts across a DST transition because of
    // rest-start transport/debrief adjustments, the detector may miss that edge case.
    const int startOffsetMinutes = getDutyEndOffsetMinutes(*arriveDuty);
    const int endOffsetMinutes = getDutyStartOffsetMinutes(*departDuty);
    return DutyUtils::GetLocalNightDates(restStartUtc, restEndUtc, startOffsetMinutes, endOffsetMinutes, zoneId);
}

bool isStandbyAssignment(const std::string& assignmentUpper, const AcopSlipPatternControlParam& control) {
    if (assignmentUpper.empty()) {
        return false;
    }
    for (const auto& a : control.standbyAssignments) {
        if (a == assignmentUpper) {
            return true;
        }
    }
    return false;
}

bool isStandbyDuty(const Duty* duty, const AcopSlipPatternControlParam& control) {
    return duty != nullptr && isStandbyAssignment(duty->getAssignment(), control);
}

bool dutyHasOperatingSegment(const Duty& duty) {
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg != nullptr && seg->getIsOperating()) {
            return true;
        }
    }
    return false;
}

std::string describeInternalDutyType(const Duty& duty,
                                     const std::string& assignmentUpper,
                                     const AcopSlipPatternControlParam& control) {
    if (isStandbyAssignment(assignmentUpper, control)) {
        return "standby duty";
    }
    if (dutyHasOperatingSegment(duty)) {
        return "flight duty";
    }
    return "position duty";
}

bool matchesAnyUpper(const std::vector<std::string>& tokensUpper, const std::string& valueUpper) {
    if (valueUpper.empty()) {
        return false;
    }
    for (const auto& t : tokensUpper) {
        if (t == valueUpper) {
            return true;
        }
    }
    return false;
}

const std::map<std::string, int>* resolveComplementMapForStandby(const CrewDataContext* dbData, const Duty* duty) {
    if (dbData != nullptr && duty != nullptr) {
        const long long pairingId = duty->getPairingId();
        if (pairingId != 0) {
            auto it = dbData->pairingIdMap.find(pairingId);
            if (it != dbData->pairingIdMap.end() && it->second != nullptr) {
                auto& comp = it->second->getComplements();
                if (!comp.empty()) {
                    return &comp;
                }
            }
        }
    }
    if (duty != nullptr) {
        const auto& comp = duty->getComplementMap();
        if (!comp.empty()) {
            return &comp;
        }
    }
    return nullptr;
}

int resolveMaxStandbyPeriodsForCrew(const AcopSlipPatternRuleParam& param,
                                   const CrewDataContext* dbData,
                                   const Duty* duty) {
    int maxStandbyPeriods = param.GetMaxStandbyPeriods();
    if (maxStandbyPeriods < 0) {
        return maxStandbyPeriods;
    }
    if (param.GetExtraConditionType() != AcopSlipPatternExtraConditionType::NineAiStandbyCrew) {
        return maxStandbyPeriods;
    }
    const auto* comp = resolveComplementMapForStandby(dbData, duty);
    if (comp == nullptr) {
        return maxStandbyPeriods;
    }

    int capCount = 0;
    int foCount = 0;
    int totalCount = 0;
    for (const auto& kv : *comp) {
        const int count = kv.second;
        if (count <= 0) {
            continue;
        }
        totalCount += count;
        const std::string rank = strToUpper(trim(kv.first));
        if (rank == "CAP" || rank == "CPT") {
            capCount += count;
        } else if (rank == "FO") {
            foCount += count;
        }
    }

    if (capCount >= 1 && foCount >= 1) {
        return 1;
    }
    return 2;
}

bool matchesDoAfterTrigger(const std::string& assignmentUpper,
                           bool isStandby,
                           const AcopSlipPatternRuleParam& param) {
    if (!param.HasDoAfterDutyAfterAssignments()) {
        return false;
    }
    const auto& triggers = param.GetDoAfterDutyAfterAssignmentsUpper();

    if (matchesAnyUpper(triggers, assignmentUpper)) {
        return true;
    }
    if (isStandby && (matchesAnyUpper(triggers, "SBY") || matchesAnyUpper(triggers, "STANDBY"))) {
        return true;
    }
    return false;
}

std::pair<time_t, time_t> getDutyWindowLoc(const Duty& duty) {
    return {duty.getStartTimeLocAct(), duty.getEndTimeLocAct()};
}

int getDutyDurationMinutes(const Duty& duty) {
    const int actualDutyMinutes = duty.getActualDP();
    if (actualDutyMinutes > 0) {
        return actualDutyMinutes;
    }

    time_t start = duty.getStartTimeUtcAct();
    time_t end = duty.getEndTimeUtcAct();
    if (start > 0 && end > start) {
        return static_cast<int>((end - start) / 60);
    }

    return 0;
}

std::pair<time_t, time_t> getSegmentWindowLoc(const Segment& seg) {
    time_t startLoc = seg.getStartTimeLocAct();
    time_t endLoc = seg.getEndTimeLocAct();
    if (startLoc <= 0) {
        startLoc = seg.getStartTimeLocSch();
    }
    if (endLoc <= 0) {
        endLoc = seg.getEndTimeLocSch();
    }

    return {startLoc, endLoc};
}

bool matchesSlipStationAirport(const AcopLocationExpr& slipStation,
                               AcopSlipStationMatchMode slipStationMatchMode,
                               const std::string& airport,
                               const CrewDataContext* dbData,
                               const std::string& anchorAirport);

// check if duty is internal to slip location
bool dutyIsWithinLocation(const Duty& duty,
                          const AcopLocationExpr& location,
                          AcopSlipStationMatchMode slipStationMatchMode,
                          const std::string& anchorAirport,
                          const CrewDataContext* dbData) {
    if (slipStationMatchMode == AcopSlipStationMatchMode::Expression) {
        if (location.type == AcopLocationExpr::Type::Any) {
            return true;
        }
        return location.MatchesAirport(duty.getDepartureStation(), dbData) &&
               location.MatchesAirport(duty.getArrivalStation(), dbData);
    }

    return matchesSlipStationAirport(location, slipStationMatchMode, duty.getDepartureStation(), dbData, anchorAirport) &&
           matchesSlipStationAirport(location, slipStationMatchMode, duty.getArrivalStation(), dbData, anchorAirport);
}

StayMetrics computeStayMetrics(const std::vector<Duty*>& duties,
                              std::size_t arriveDutyIndex,
                              std::size_t departDutyIndex,
                              const AcopSlipPatternControlParam& control,
                              const CrewDataContext* dbData) {
    StayMetrics out{};
    if (arriveDutyIndex >= duties.size() || departDutyIndex >= duties.size() || departDutyIndex <= arriveDutyIndex) {
        return out;
    }
    const Duty* arriveDuty = duties[arriveDutyIndex];
    const Duty* departDuty = duties[departDutyIndex];
    if (arriveDuty == nullptr || departDuty == nullptr) {
        return out;
    }

    const time_t slipStartLoc = getRestStartLocAfterDuty(*arriveDuty, control);
    const time_t slipEndLoc = getRestEndLocBeforeDuty(*departDuty);
    if (slipStartLoc <= 0 || slipEndLoc <= 0 || slipEndLoc <= slipStartLoc) {
        return out;
    }

    out.valid = true;
    out.startLoc = slipStartLoc;
    out.endLoc = slipEndLoc;
    out.windowMinutes = static_cast<int>((slipEndLoc - slipStartLoc) / 60);

    // Standby periods/hours are based on duties occurring within the stay (excluding arrive and depart boundary duties).
    for (std::size_t k = arriveDutyIndex + 1; k < departDutyIndex; ++k) {
        const Duty* d = duties[k];
        if (d == nullptr) {
            continue;
        }
        const std::string assignment = d->getAssignment();
        if (!isStandbyAssignment(assignment, control)) {
            continue;
        }

        const int dutyMinutes = getDutyDurationMinutes(*d);
        if (dutyMinutes > 0) {
            out.standbyPeriods += 1;
            out.standbyTotalMinutes += dutyMinutes;
        }
    }

    if (!control.standbyReducesRestAndLocalNight) {
        out.effectiveRestMinutes = out.windowMinutes;
        out.localNights = getLocalNightNumsForRestWindow(arriveDuty, departDuty, control, dbData, slipStartLoc, slipEndLoc);
        const std::vector<time_t> dates =
            getLocalNightDatesForRestWindow(arriveDuty, departDuty, control, dbData, slipStartLoc, slipEndLoc);
        if (!dates.empty()) {
            out.lastLocalNightStartDateLoc = dates.back();
        }
        return out;
    }

    // When standby reduces rest/local-night: count rest gaps between duties within the stay.
    int totalRestMinutes = 0;
    int totalLocalNights = 0;
    time_t lastLocalNightStartDateLoc = 0;

    time_t prevRestStart = slipStartLoc;
    const Duty* prevRestStartDuty = arriveDuty;
    for (std::size_t k = arriveDutyIndex + 1; k < departDutyIndex; ++k) {
        const Duty* d = duties[k];
        if (d == nullptr) {
            continue;
        }
        const time_t nextDutyStart = getRestEndLocBeforeDuty(*d);
        if (nextDutyStart > 0 && nextDutyStart > prevRestStart) {
            totalRestMinutes += static_cast<int>((nextDutyStart - prevRestStart) / 60);
            totalLocalNights += getLocalNightNumsForRestWindow(prevRestStartDuty, d, control, dbData, prevRestStart, nextDutyStart);
            const std::vector<time_t> dates =
                getLocalNightDatesForRestWindow(prevRestStartDuty, d, control, dbData, prevRestStart, nextDutyStart);
            if (!dates.empty()) {
                lastLocalNightStartDateLoc = std::max(lastLocalNightStartDateLoc, dates.back());
            }
        }
        prevRestStart = getRestStartLocAfterDuty(*d, control);
        prevRestStartDuty = d;
        if (prevRestStart <= 0) {
            prevRestStart = nextDutyStart;
        }
    }
    if (slipEndLoc > prevRestStart && prevRestStart > 0) {
        totalRestMinutes += static_cast<int>((slipEndLoc - prevRestStart) / 60);
        totalLocalNights += getLocalNightNumsForRestWindow(prevRestStartDuty, departDuty, control, dbData, prevRestStart, slipEndLoc);
        const std::vector<time_t> dates =
            getLocalNightDatesForRestWindow(prevRestStartDuty, departDuty, control, dbData, prevRestStart, slipEndLoc);
        if (!dates.empty()) {
            lastLocalNightStartDateLoc = std::max(lastLocalNightStartDateLoc, dates.back());
        }
    }

    out.effectiveRestMinutes = totalRestMinutes;
    out.localNights = totalLocalNights;
    out.lastLocalNightStartDateLoc = lastLocalNightStartDateLoc;
    return out;
}

int computeLocalNightsBeforeInternalDuty(const std::vector<Duty*>& duties,
                                         std::size_t arriveDutyIndex,
                                         std::size_t internalDutyIndex,
                                         time_t slipStartLoc,
                                         const AcopSlipPatternControlParam& control,
                                         const CrewDataContext* dbData) {
    if (internalDutyIndex >= duties.size()) {
        return 0;
    }
    const Duty* target = duties[internalDutyIndex];
    if (target == nullptr) {
        return 0;
    }
    const time_t targetStartLoc = getRestEndLocBeforeDuty(*target);
    if (slipStartLoc <= 0 || targetStartLoc <= slipStartLoc) {
        return 0;
    }

    if (!control.standbyReducesRestAndLocalNight) {
        return getLocalNightNumsForRestWindow(duties[arriveDutyIndex], target, control, dbData, slipStartLoc, targetStartLoc);
    }

    time_t restStartLoc = slipStartLoc;
    int localNights = 0;
    const Duty* restStartDuty = duties[arriveDutyIndex];
    for (std::size_t k = arriveDutyIndex + 1; k < internalDutyIndex; ++k) {
        const Duty* d = duties[k];
        if (d == nullptr) {
            continue;
        }
        const time_t s = getRestEndLocBeforeDuty(*d);
        if (s > 0 && s > restStartLoc) {
            localNights += getLocalNightNumsForRestWindow(restStartDuty, d, control, dbData, restStartLoc, s);
        }
        restStartLoc = getRestStartLocAfterDuty(*d, control);
        restStartDuty = d;
        if (restStartLoc <= 0) {
            restStartLoc = s;
        }
    }
    if (targetStartLoc > restStartLoc && restStartLoc > 0) {
        localNights += getLocalNightNumsForRestWindow(restStartDuty, target, control, dbData, restStartLoc, targetStartLoc);
    }
    return localNights;
}

time_t computeLastLocalNightStartDateBeforeInternalDuty(const std::vector<Duty*>& duties,
                                                        std::size_t arriveDutyIndex,
                                                        std::size_t internalDutyIndex,
                                                        time_t slipStartLoc,
                                                        const AcopSlipPatternControlParam& control,
                                                        const CrewDataContext* dbData) {
    if (internalDutyIndex >= duties.size()) {
        return 0;
    }
    const Duty* target = duties[internalDutyIndex];
    if (target == nullptr) {
        return 0;
    }
    const time_t targetStartLoc = getRestEndLocBeforeDuty(*target);
    if (slipStartLoc <= 0 || targetStartLoc <= slipStartLoc) {
        return 0;
    }

    if (!control.standbyReducesRestAndLocalNight) {
        const std::vector<time_t> dates =
            getLocalNightDatesForRestWindow(duties[arriveDutyIndex], target, control, dbData, slipStartLoc, targetStartLoc);
        return dates.empty() ? 0 : dates.back();
    }

    time_t restStartLoc = slipStartLoc;
    time_t lastLocalNightStartDateLoc = 0;
    const Duty* restStartDuty = duties[arriveDutyIndex];
    for (std::size_t k = arriveDutyIndex + 1; k < internalDutyIndex; ++k) {
        const Duty* d = duties[k];
        if (d == nullptr) {
            continue;
        }
        const time_t s = getRestEndLocBeforeDuty(*d);
        if (s > 0 && s > restStartLoc) {
            const std::vector<time_t> dates =
                getLocalNightDatesForRestWindow(restStartDuty, d, control, dbData, restStartLoc, s);
            if (!dates.empty()) {
                lastLocalNightStartDateLoc = std::max(lastLocalNightStartDateLoc, dates.back());
            }
        }
        restStartLoc = getRestStartLocAfterDuty(*d, control);
        restStartDuty = d;
        if (restStartLoc <= 0) {
            restStartLoc = s;
        }
    }
    if (targetStartLoc > restStartLoc && restStartLoc > 0) {
        const std::vector<time_t> dates =
            getLocalNightDatesForRestWindow(restStartDuty, target, control, dbData, restStartLoc, targetStartLoc);
        if (!dates.empty()) {
            lastLocalNightStartDateLoc = std::max(lastLocalNightStartDateLoc, dates.back());
        }
    }
    return lastLocalNightStartDateLoc;
}

int computeEffectiveRestMinutesBeforeInternalDuty(const std::vector<Duty*>& duties,
                                                  std::size_t arriveDutyIndex,
                                                  std::size_t internalDutyIndex,
                                                  time_t slipStartLoc,
                                                  const AcopSlipPatternControlParam& control) {
    if (internalDutyIndex >= duties.size()) {
        return 0;
    }
    const Duty* target = duties[internalDutyIndex];
    if (target == nullptr) {
        return 0;
    }
    const time_t targetStartLoc = getRestEndLocBeforeDuty(*target);
    if (slipStartLoc <= 0 || targetStartLoc <= slipStartLoc) {
        return 0;
    }

    if (!control.standbyReducesRestAndLocalNight) {
        return static_cast<int>((targetStartLoc - slipStartLoc) / 60);
    }

    time_t restStartLoc = slipStartLoc;
    int restMinutes = 0;
    for (std::size_t k = arriveDutyIndex + 1; k < internalDutyIndex; ++k) {
        const Duty* d = duties[k];
        if (d == nullptr) {
            continue;
        }
        const time_t s = getRestEndLocBeforeDuty(*d);
        if (s > 0 && s > restStartLoc) {
            restMinutes += static_cast<int>((s - restStartLoc) / 60);
        }
        restStartLoc = getRestStartLocAfterDuty(*d, control);
        if (restStartLoc <= 0) {
            restStartLoc = s;
        }
    }
    if (targetStartLoc > restStartLoc && restStartLoc > 0) {
        restMinutes += static_cast<int>((targetStartLoc - restStartLoc) / 60);
    }
    return restMinutes;
}

bool matchesDoAfterTriggerForInternalDuty(const std::vector<Duty*>& duties,
                                          std::size_t arriveDutyIndex,
                                          std::size_t internalDutyIndex,
                                          time_t slipStartLoc,
                                          time_t arrivalDay,
                                          const AcopSlipPatternControlParam& control,
                                          const AcopSlipPatternRuleParam& param) {
    switch (param.GetDoAfterTriggerType()) {
    case AcopDoAfterTriggerType::Always:
        return true;
    case AcopDoAfterTriggerType::DayAfterArrival: {
        if (internalDutyIndex >= duties.size() || arrivalDay <= 0) {
            return false;
        }
        const Duty* duty = duties[internalDutyIndex];
        if (duty == nullptr) {
            return false;
        }
        const time_t startLoc = duty->getStartTimeLocAct();
        if (startLoc <= 0) {
            return false;
        }
        const time_t dutyDay = TimeUtils::Truncate(startLoc, ChronoUnit::DAYS);
        return dutyDay == TimeUtils::AddDay(arrivalDay, 1);
    }
    case AcopDoAfterTriggerType::RestLt24H:
        return computeEffectiveRestMinutesBeforeInternalDuty(duties,
                                                             arriveDutyIndex,
                                                             internalDutyIndex,
                                                             slipStartLoc,
                                                             control) < 24 * 60;
    }
    return true;
}

std::vector<std::string> buildStationChain(const std::vector<Duty*>& duties,
                                          const AcopSlipPatternControlParam& control) {
    std::vector<std::string> chain;
    if (duties.empty() || duties.front() == nullptr) {
        return chain;
    }
    chain.push_back(duties.front()->getDepartureStation());
    for (const auto* duty : duties) {
        if (duty == nullptr) {
            continue;
        }
        if (isStandbyAssignment(duty->getAssignment(), control)) {
            continue;
        }
        const std::string arr = duty->getArrivalStation();
        if (chain.empty() || chain.back() != arr) {
            chain.push_back(arr);
        }
    }
    return chain;
}

bool matchesCopPattern(const AcopCopPattern& pattern,
                       const std::vector<std::string>& stationChain,
                       const CrewDataContext* dbData) {
    if (pattern.special != AcopCopPattern::SpecialType::None) {
        return true;
    }
    if (pattern.stationChain.empty()) {
        return true;
    }

    auto rawUpperAt = [&](std::size_t idx) -> std::string {
        if (pattern.stationChainRawUpper.size() == pattern.stationChain.size() && idx < pattern.stationChainRawUpper.size()) {
            return pattern.stationChainRawUpper[idx];
        }
        return {};
    };

    auto matchesSingleStation = [&](std::size_t pIdx, const std::string& station) -> bool {
        if (pIdx >= pattern.stationChain.size()) {
            return false;
        }
        const std::string rawUpper = rawUpperAt(pIdx);
        const auto& expr = pattern.stationChain[pIdx];

        if (rawUpper == "**") {
            return true;
        }
        if (rawUpper == "?") {
            return true;
        }

        if (expr.type != LocationMatchUtils::LocationExpr::Type::Any) {
            return expr.MatchesAirport(station, dbData);
        }

        // Special semantics: an interior '*' in a dashed pattern means:
        //   - match exactly one station that does NOT match the previous token, AND
        //   - does NOT match the next token.
        // This supports patterns like "SIN-*-AU-SIN" where '*' must not be SIN and must not be in country AU.
        if (rawUpper == "*" && pIdx > 0 && (pIdx + 1) < pattern.stationChain.size()) {
            const bool matchesPrev = pattern.stationChain[pIdx - 1].MatchesAirport(station, dbData);
            const bool matchesNext = pattern.stationChain[pIdx + 1].MatchesAirport(station, dbData);
            return !matchesPrev && !matchesNext;
        }

        return true;  // normal '*' / Any
    };

    const std::size_t m = pattern.stationChain.size();
    const std::size_t n = stationChain.size();

    std::vector<std::vector<int>> memo(m + 1, std::vector<int>(n + 1, -1));

    std::function<bool(std::size_t, std::size_t)> matchFrom = [&](std::size_t pIdx, std::size_t sIdx) -> bool {
        int& cell = memo[pIdx][sIdx];
        if (cell != -1) {
            return cell == 1;
        }

        if (pIdx >= m) {
            cell = (sIdx == n) ? 1 : 0;
            return cell == 1;
        }

        const std::string rawUpper = rawUpperAt(pIdx);
        if (rawUpper == "**") {
            // "**" matches zero or more stations.
            if (matchFrom(pIdx + 1, sIdx)) {
                cell = 1;
                return true;
            }
            if (sIdx < n && matchFrom(pIdx, sIdx + 1)) {
                cell = 1;
                return true;
            }
            cell = 0;
            return false;
        }

        if (sIdx >= n) {
            cell = 0;
            return false;
        }
        if (!matchesSingleStation(pIdx, stationChain[sIdx])) {
            cell = 0;
            return false;
        }

        const bool exactOne = (rawUpper == "?") || (rawUpper == "*" && pIdx > 0 && (pIdx + 1) < m);
        if (exactOne) {
            cell = matchFrom(pIdx + 1, sIdx + 1) ? 1 : 0;
            return cell == 1;
        }

        // Allow extra stations inside a token, e.g. pattern "SIN-NZ-SIN" should match "SIN-CHC-AKL-SIN".
        for (std::size_t k = 1; (sIdx + k) <= n; ++k) {
            if (k > 1) {
                if (!matchesSingleStation(pIdx, stationChain[sIdx + k - 1])) {
                    break;
                }
            }
            if (matchFrom(pIdx + 1, sIdx + k)) {
                cell = 1;
                return true;
            }
        }

        cell = 0;
        return false;
    };

    return matchFrom(0, 0);
}

bool dutyHasOperatingSequenceInSingleFdp(const Duty& duty, const std::vector<std::string>& seqUpper) {
    if (seqUpper.size() < 2) {
        return false;
    }
    std::vector<std::string> path;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        if (path.empty()) {
            path.push_back(seg->getDepStation());
        }
        path.push_back(seg->getArrStation());
    }
    if (path.size() < seqUpper.size()) {
        return false;
    }
    for (std::size_t start = 0; start + seqUpper.size() <= path.size(); ++start) {
        bool ok = true;
        for (std::size_t j = 0; j < seqUpper.size(); ++j) {
            if (path[start + j] != seqUpper[j]) {
                ok = false;
                break;
            }
        }
        if (ok) {
            return true;
        }
    }
    return false;
}

bool dutyContainsOperatingSector(const Duty& duty, const std::string& depUpper, const std::string& arrUpper) {
    if (depUpper.empty() || arrUpper.empty()) {
        return false;
    }
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        if (seg->getDepStation() == depUpper && seg->getArrStation() == arrUpper) {
            return true;
        }
    }
    return false;
}

bool matchesSpecialCopFilter(const AcopCopPattern& pattern, const Duty& arriveDuty) {
    if (pattern.special == AcopCopPattern::SpecialType::None) {
        return true;
    }
    if (pattern.special == AcopCopPattern::SpecialType::InSingleFdpSequence) {
        return dutyHasOperatingSequenceInSingleFdp(arriveDuty, pattern.singleFdpSequence);
    }
    if (pattern.special == AcopCopPattern::SpecialType::DutyHasOperatingSectorAndEndsAfter) {
        // New semantics: the duty contains the operating sector, and the rule enforces that the duty must end at slip station.
        return dutyContainsOperatingSector(arriveDuty, pattern.operatingDep, pattern.operatingArr);
    }
    return true;
}

std::string airportCityCodeUpper(const std::string& airportCode, const CrewDataContext* dbData) {
    if (airportCode.empty()) {
        return "";
    }
    if (dbData == nullptr) {
        return airportCode;
    }
    const auto it = dbData->airportCodeMap.find(airportCode);
    if (it == dbData->airportCodeMap.end() || it->second == nullptr) {
        return airportCode;
    }
    const std::string city = it->second->city;
    if (!city.empty()) {
        return city;
    }
    return airportCode;
}

bool isSameAirportCity(const std::string& lhsAirport,
                       const std::string& rhsAirport,
                       const CrewDataContext* dbData) {
    if (lhsAirport.empty() || rhsAirport.empty()) {
        return false;
    }
    return airportCityCodeUpper(lhsAirport, dbData) == airportCityCodeUpper(rhsAirport, dbData);
}

bool isSameAirport(const std::string& lhsAirport, const std::string& rhsAirport) {
    if (lhsAirport.empty() || rhsAirport.empty()) {
        return false;
    }
    return (lhsAirport) == (rhsAirport);
}

bool matchesSlipStationAirport(const AcopLocationExpr& slipStation,
                               AcopSlipStationMatchMode slipStationMatchMode,
                               const std::string& airport,
                               const CrewDataContext* dbData,
                               const std::string& anchorAirport) {
    if (slipStationMatchMode == AcopSlipStationMatchMode::Expression) {
        return slipStation.MatchesAirport(airport, dbData);
    }

    if (airport.empty()) {
        return false;
    }
    if (anchorAirport.empty()) {
        return true;
    }

    if (slipStationMatchMode == AcopSlipStationMatchMode::AirportAnchor) {
        return isSameAirport(airport, anchorAirport);
    }
    return isSameAirportCity(airport, anchorAirport, dbData);
}

std::size_t findSlipDepartDutyIndex(const std::vector<Duty*>& duties,
                                    std::size_t arriveDutyIndex,
                                    const AcopLocationExpr& slipStation,
                                    AcopSlipStationMatchMode slipStationMatchMode,
                                    const AcopSlipPatternControlParam& control,
                                    const CrewDataContext* dbData,
                                    const std::string& anchorAirport) {
    if (arriveDutyIndex >= duties.size()) {
        return duties.size();
    }
    for (std::size_t j = arriveDutyIndex + 1; j < duties.size(); ++j) {
        const Duty* d = duties[j];
        if (d == nullptr) {
            continue;
        }
        if (isStandbyDuty(d, control)) {
            continue;
        }
        const std::string dep = d->getDepartureStation();
        const std::string arr = d->getArrivalStation();

        const bool depIn = matchesSlipStationAirport(slipStation, slipStationMatchMode, dep, dbData, anchorAirport);
        const bool arrIn = matchesSlipStationAirport(slipStation, slipStationMatchMode, arr, dbData, anchorAirport);
        if (!depIn || !arrIn) {
            return j;
        }
    }
    return duties.size();
}

struct CandidateRow {
    const AcopSlipPatternRuleParam* param{nullptr};
    std::size_t departIndex{0};
    const Duty* departDuty{nullptr};
    StayMetrics stay{};
    time_t slipStartLoc{0};
    time_t arrivalDay{0};
    time_t departDay{0};
    std::map<std::string, std::string> baseExtra{};
    bool hasSlipLimitConstraints{false};  // min/max slip hours, min slip local nights
    bool hasSlipDepartDutyReportTimeConstraint{false};
    bool hasInternalConstraints{false};
    bool slipLimitsPass{true};
    bool slipDepartDutyReportTimePass{true};
};

std::string describeAllowedOption(const AcopSlipPatternRuleParam& param) {
    const std::string allowedRaw = trim(param.GetAllowedDutyWithinSlipRaw());
    const std::string allowedUpper = strToUpper(allowedRaw);
    const bool hasAllowed = param.GetAllowedDutyWithinSlip().HasConstraint();
    const int maxStandbyPeriods = param.GetMaxStandbyPeriods();
    const int maxStandbyMinutes = param.GetMaxStandbyMinutes();
    const bool hasStandbyCaps = (maxStandbyPeriods >= 0 || maxStandbyMinutes >= 0);
    const bool standbyNotAllowed = (maxStandbyPeriods == 0 && maxStandbyMinutes == 0);

    std::string allowedPart;
    if (hasAllowed) {
        if (allowedUpper == "NONE") {
            if (standbyNotAllowed) {
                return "NONE";
            }
            allowedPart = "standby only";
        } else if (!allowedRaw.empty()) {
            allowedPart = "allowed duty: " + allowedRaw;
        } else {
            allowedPart = "allowed duty: *";
        }
    }

    std::string standbyPart;
    if (hasStandbyCaps) {
        if (maxStandbyPeriods == 0 && maxStandbyMinutes == 0) {
            standbyPart = "no standby";
        } else {
            std::string cap;
            if (maxStandbyPeriods >= 0) {
                cap += "max periods " + std::to_string(maxStandbyPeriods);
            }
            if (maxStandbyMinutes >= 0) {
                if (!cap.empty()) {
                    cap += ", ";
                }
                cap += "max hours " + TimeUtils::MinutesTohhmm(maxStandbyMinutes);
            }
            if (!cap.empty()) {
                standbyPart = "standby caps: " + cap;
            }
        }
    }

    if (allowedPart == "standby only" && !standbyPart.empty()) {
        return allowedPart + " (" + standbyPart + ")";
    }
    if (!allowedPart.empty() && !standbyPart.empty()) {
        return allowedPart + " (" + standbyPart + ")";
    }
    if (!allowedPart.empty()) {
        return allowedPart;
    }
    if (!standbyPart.empty()) {
        return standbyPart;
    }
    return "";
}

std::string buildGroupAllowedOptions(const std::vector<CandidateRow>& candidates,
                                     const std::vector<std::size_t>& indices,
                                     int bestPriority) {
    std::vector<std::string> options;
    bool sawNone = false;
    for (const auto idx : indices) {
        if (idx >= candidates.size()) {
            continue;
        }
        const CandidateRow& row = candidates[idx];
        if (row.param == nullptr || row.param->GetPriority() != bestPriority) {
            continue;
        }
        const std::string option = describeAllowedOption(*row.param);
        if (option.empty()) {
            continue;
        }
        if (option == "NONE") {
            sawNone = true;
            continue;
        }
        if (std::find(options.begin(), options.end(), option) == options.end()) {
            options.push_back(option);
        }
    }
    if (options.empty() && sawNone) {
        return "NONE";
    }
    if (options.empty()) {
        return "";
    }
    std::string out;
    for (std::size_t i = 0; i < options.size(); ++i) {
        if (i > 0) {
            out += " OR ";
        }
        out += options[i];
    }
    return out;
}

bool slipLimitsPass(const CandidateRow& row) {
    if (!row.hasSlipLimitConstraints || row.param == nullptr) {
        return true;
    }
    const auto& p = *row.param;
    if (p.GetMinSlipMinutes() > 0) {
        const int requiredMinutes = p.GetMinSlipMinutes();
        if (row.stay.effectiveRestMinutes < requiredMinutes) {
            return false;
        }
    }
    if (p.GetMaxSlipMinutes() > 0) {
        const int allowedMinutes = p.GetMaxSlipMinutes();
        if (row.stay.windowMinutes > allowedMinutes) {
            return false;
        }
    }
    if (p.GetMinSlipLocalNights() > 0) {
        if (row.stay.localNights < p.GetMinSlipLocalNights()) {
            return false;
        }
    }
    return true;
}

bool slipDepartDutyReportTimePass(const CandidateRow& row) {
    if (row.param == nullptr || row.departDuty == nullptr) {
        return true;
    }
    if (!row.hasSlipDepartDutyReportTimeConstraint) {
        return true;
    }

    const int requiredMinutes = row.param->GetSlipDepartDutyReportTimeMinutes();
    if (requiredMinutes < 0) {
        return true;
    }

    const time_t departStartLoc = row.departDuty->getStartTimeLocAct();
    if (!isOnDayAfterLocalNightStartDate(departStartLoc, row.stay.lastLocalNightStartDateLoc)) {
        return true;
    }
    if (departStartLoc <= 0 || row.departDay <= 0) {
        return false;
    }
    const int minutesOfDay = static_cast<int>((departStartLoc - row.departDay) / 60);
    return minutesOfDay >= requiredMinutes;
}

template <typename ReportDutyViolationFn>
bool checkInternalConstraints(const std::vector<Duty*>& duties,
                              std::size_t arriveDutyIndex,
                              const std::string& arriveStation,
                              const CandidateRow& row,
                              const AcopSlipPatternControlParam& control,
                              const CrewDataContext* dbData,
                              int* outAtdoDaysOffAtBase,
                              std::string* outAtdoDaysOffAtBaseReason,
                              int* outExdoDaysOffAtBase,
                              std::string* outExdoDaysOffAtBaseReason,
                              ReportDutyViolationFn&& reportDutyViolation) {
    if (outAtdoDaysOffAtBase != nullptr) {
        *outAtdoDaysOffAtBase = 0;
    }
    if (outAtdoDaysOffAtBaseReason != nullptr) {
        outAtdoDaysOffAtBaseReason->clear();
    }
    if (outExdoDaysOffAtBase != nullptr) {
        *outExdoDaysOffAtBase = 0;
    }
    if (outExdoDaysOffAtBaseReason != nullptr) {
        outExdoDaysOffAtBaseReason->clear();
    }
    if (row.param == nullptr) {
        return true;
    }
    const auto& param = *row.param;

    const std::size_t departIndex = row.departIndex;
    const Duty* departDuty = row.departDuty;
    const bool hasDepartDuty = (departDuty != nullptr);
    const StayMetrics& stay = row.stay;
    const time_t slipStartLoc = row.slipStartLoc;
    const time_t arrivalDay = row.arrivalDay;
    const time_t departDay = row.departDay;
    const std::map<std::string, std::string>& baseExtra = row.baseExtra;

    const bool hasAllowedDutyConstraint = param.GetAllowedDutyWithinSlip().HasConstraint();
    const bool hasDutyAfterConstraint =
        (param.GetDutyAfterMinutes() >= 0 || param.GetDutyAfterLocalNights() >= 0 || param.GetDutyAfterLocalTimeMinutes() >= 0);
    const int maxStandbyPeriods = resolveMaxStandbyPeriodsForCrew(param, dbData, departDuty);
    const bool hasStandbyCaps = (maxStandbyPeriods >= 0 || param.GetMaxStandbyMinutes() >= 0);
    const bool hasDutyAfterTargetByStandby = hasStandbyCaps;
    const bool hasDutyAfterTargetByAllowedDuty = hasAllowedDutyConstraint;
    const bool useTargetedDutyAfterScope = (hasDutyAfterTargetByStandby || hasDutyAfterTargetByAllowedDuty);
    const bool hasDoAfterDutyDays = (param.GetDoAfterDutyDays() > 0);
    const bool hasDoAfterTriggers = (hasDoAfterDutyDays && param.HasDoAfterDutyAfterAssignments());
    const bool isEur4B = (param.GetExtraConditionType() == AcopSlipPatternExtraConditionType::Eur4B);

    bool pass = true;
    bool anyNonStandbyInternalDuty = false;
    time_t lastNonStandbyInternalEndLoc = 0;
    std::size_t firstNonStandbyInternalDutyIndex = duties.size();
    std::vector<std::size_t> doAfterTriggerDutyIndices;

    AcopSlipPatternExtraConditions::ExtraConditionState extraConditionState{};
    if (hasDepartDuty) {
        extraConditionState = AcopSlipPatternExtraConditions::InitState(duties, arriveDutyIndex, departIndex, arrivalDay, param, control);
    }
    const AcopSlipPatternExtraConditions::ReportDutyViolationFn extraConditionReport =
        [&](const Duty& duty,
            const AcopSlipPatternRuleParam& param,
            const std::string& message,
            const std::map<std::string, std::string>& extraFields) {
            reportDutyViolation(duty, param, message, extraFields);
        };

    if (hasStandbyCaps && hasDepartDuty) {
        std::vector<std::string> reasons;
        std::map<std::string, std::string> extra = baseExtra;
        std::vector<std::string> details;

        if (maxStandbyPeriods >= 0) {
            if (stay.standbyPeriods > maxStandbyPeriods) {
                reasons.push_back("max standby periods");
                extra.emplace("max_standby_periods", std::to_string(maxStandbyPeriods));
                details.push_back(StringUtils::Format("standby periods {0} > max {1}",
                                                     std::to_string(stay.standbyPeriods),
                                                     std::to_string(maxStandbyPeriods)));
            }
        }
        if (param.GetMaxStandbyMinutes() >= 0) {
            const int maxMinutes = param.GetMaxStandbyMinutes();
            if (stay.standbyTotalMinutes > maxMinutes) {
                reasons.push_back("max standby hours");
                extra.emplace("max_standby_hours", TimeUtils::MinutesTohhmm(param.GetMaxStandbyMinutes()));
                details.push_back(StringUtils::Format("standby time {0} > max {1}",
                                                     TimeUtils::MinutesTohhmm(stay.standbyTotalMinutes),
                                                     TimeUtils::MinutesTohhmm(maxMinutes)));
            }
        }

        if (!reasons.empty()) {
            std::string reasonJoined;
            for (std::size_t rr = 0; rr < reasons.size(); ++rr) {
                if (rr > 0) {
                    reasonJoined += ", ";
                }
                reasonJoined += reasons[rr];
            }
            extra.emplace("reasons", reasonJoined);

            std::string detailJoined;
            for (std::size_t d = 0; d < details.size(); ++d) {
                if (d > 0) {
                    detailJoined += "; ";
                }
                detailJoined += details[d];
            }
            if (detailJoined.empty()) {
                detailJoined = StringUtils::Format("standby periods {0}, standby time {1}",
                                                   std::to_string(stay.standbyPeriods),
                                                   TimeUtils::MinutesTohhmm(stay.standbyTotalMinutes));
            }

            reportDutyViolation(
                *departDuty,
                param,
                StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} slip at {1:slip} violates internal standby caps ({2:reasons}): {3:details}.",
                                    safeLabel(param.GetClause(), "UNKNOWN"),
                                    safeLabel(arriveStation, "UNKNOWN"),
                                    safeLabel(reasonJoined, "UNKNOWN"),
                                    safeLabel(detailJoined, "UNKNOWN")),
                extra);
            pass = false;
        }
    }

    // Duty-after / allowed-duty constraints apply only to duties WITHIN the slip period.
    if (arriveDutyIndex + 1 < departIndex) {
        for (std::size_t k = arriveDutyIndex + 1; k < departIndex; ++k) {
            const Duty* d = duties[k];
            if (d == nullptr) {
                continue;
            }

            const std::string assignment = d->getAssignment();
            const bool isStandby = isStandbyAssignment(assignment, control);
            const std::string dutyTypeLabel = describeInternalDutyType(*d, assignment, control);
            if (!isStandby) {
                anyNonStandbyInternalDuty = true;
                if (firstNonStandbyInternalDutyIndex >= duties.size()) {
                    firstNonStandbyInternalDutyIndex = k;
                }
                const time_t e = d->getEndTimeLocAct();
                if (e > lastNonStandbyInternalEndLoc) {
                    lastNonStandbyInternalEndLoc = e;
                }
            }
            if (hasDoAfterTriggers && matchesDoAfterTrigger(assignment, isStandby, param)) {
                doAfterTriggerDutyIndices.push_back(k);
            }

            const time_t dutyStartLoc = d->getStartTimeLocAct();
            if (dutyStartLoc <= 0) {
                continue;
            }
            const time_t dutyDay = TimeUtils::Truncate(dutyStartLoc, ChronoUnit::DAYS);
            const int minutesOfDay = static_cast<int>((dutyStartLoc - dutyDay) / 60);
            const bool dutyIsWithinSlipLocation = dutyIsWithinLocation(*d,
                                                                        param.GetSlipStation(),
                                                                        param.GetSlipStationMatchMode(),
                                                                        arriveStation,
                                                                        dbData);
            bool nonStandbyAllowedByRule = false;
            if (hasAllowedDutyConstraint && !isStandby) {
                nonStandbyAllowedByRule = param.GetAllowedDutyWithinSlip().IsNonStandbyDutyAllowed(*d, dbData);
            }

            if (pass && extraConditionState.type != AcopSlipPatternExtraConditionType::None) {
                if (!AcopSlipPatternExtraConditions::ValidateAndObserveInternalDuty(duties,
                                                                                  k,
                                                                                  *d,
                                                                                  dutyDay,
                                                                                  minutesOfDay,
                                                                                  isStandby,
                                                                                  dutyIsWithinSlipLocation,
                                                                                  param,
                                                                                  control,
                                                                                  baseExtra,
                                                                                  extraConditionState,
                                                                                  extraConditionReport)) {
                    pass = false;
                    break;
                }
            }

            bool shouldCheckDutyAfterForThisDuty = false;
            if (hasDutyAfterConstraint) {
                if (!useTargetedDutyAfterScope) {
                    // Backward-compatible behavior: without standby/allowed-duty targeting columns,
                    // duty-after constraints apply to any internal duty.
                    shouldCheckDutyAfterForThisDuty = true;
                } else {
                    const bool isTargetedStandbyDuty = hasDutyAfterTargetByStandby && isStandby;
                    const bool isTargetedAllowedDuty = hasDutyAfterTargetByAllowedDuty && !isStandby && nonStandbyAllowedByRule;
                    shouldCheckDutyAfterForThisDuty = isTargetedStandbyDuty || isTargetedAllowedDuty;
                }
            }

            if (shouldCheckDutyAfterForThisDuty) {
                std::vector<std::string> reasons;
                std::map<std::string, std::string> extra = baseExtra;
                extra.emplace("internal_duty_assignment", safeLabel(d->getAssignment(), "UNKNOWN"));
                extra.emplace("internal_duty_type", dutyTypeLabel);
                extra.emplace("internal_duty_sequence", std::to_string(d->getDutySeq()));
                std::vector<std::string> details;

                if (param.GetDutyAfterMinutes() >= 0) {
                    const time_t minStart = slipStartLoc + static_cast<time_t>(param.GetDutyAfterMinutes()) * 60;
                    if (dutyStartLoc < minStart) {
                        reasons.push_back("duty after hours");
                        extra.emplace("duty_after_hours", TimeUtils::MinutesTohhmm(param.GetDutyAfterMinutes()));
                        const int actualMinutes = dutyStartLoc > slipStartLoc ? static_cast<int>((dutyStartLoc - slipStartLoc) / 60) : 0;
                        details.push_back(StringUtils::Format("{0:type} (sequence {1:seq}) starts {2} after slip start < min {3}",
                                                             safeLabel(dutyTypeLabel, "duty"),
                                                             std::to_string(d->getDutySeq()),
                                                             TimeUtils::MinutesTohhmm(actualMinutes),
                                                             TimeUtils::MinutesTohhmm(param.GetDutyAfterMinutes())));
                    }
                }
                if (param.GetDutyAfterLocalNights() >= 0) {
                    const int localNightsBefore =
                        computeLocalNightsBeforeInternalDuty(duties, arriveDutyIndex, k, slipStartLoc, control, dbData);
                    if (localNightsBefore < param.GetDutyAfterLocalNights()) {
                        reasons.push_back("duty after local nights");
                        extra.emplace("duty_after_local_nights", std::to_string(param.GetDutyAfterLocalNights()));
                        extra.emplace("local_nights_before_duty", std::to_string(localNightsBefore));
                        details.push_back(StringUtils::Format("{0:type} (sequence {1:seq}) has local nights before duty {2} < min {3}",
                                                             safeLabel(dutyTypeLabel, "duty"),
                                                             std::to_string(d->getDutySeq()),
                                                             std::to_string(localNightsBefore),
                                                             std::to_string(param.GetDutyAfterLocalNights())));
                    }
                }
                if (param.GetDutyAfterLocalTimeMinutes() >= 0 && arrivalDay > 0) {
                    const time_t dutyDay = TimeUtils::Truncate(dutyStartLoc, ChronoUnit::DAYS);
                    if (param.GetDutyAfterLocalTimeMinutes() == 0 && param.GetDutyAfterLocalNights() <= 0) {
                        const time_t requiredDay = TimeUtils::AddDay(arrivalDay, 1);
                        if (dutyDay < requiredDay) {
                            reasons.push_back("duty time after LN day+1");
                            extra.emplace("duty_time_after_ln", "00:00");
                            const int actualDayOffset = static_cast<int>((dutyDay - arrivalDay) / (24 * 3600));
                            details.push_back(StringUtils::Format("{0:type} (sequence {1:seq}) starts on day+{2} < required day+1",
                                                                 safeLabel(dutyTypeLabel, "duty"),
                                                                 std::to_string(d->getDutySeq()),
                                                                 std::to_string(actualDayOffset)));
                        }
                    } else if (param.GetDutyAfterLocalNights() >= 0) {
                        const int localNightsBefore =
                            computeLocalNightsBeforeInternalDuty(duties, arriveDutyIndex, k, slipStartLoc, control, dbData);
                        if (localNightsBefore == param.GetDutyAfterLocalNights()) {
                            const time_t lastLocalNightStartDateLoc =
                                computeLastLocalNightStartDateBeforeInternalDuty(duties, arriveDutyIndex, k, slipStartLoc, control, dbData);
                            if (isOnDayAfterLocalNightStartDate(dutyStartLoc, lastLocalNightStartDateLoc)) {
                                const int minutesOfDay = static_cast<int>((dutyStartLoc - dutyDay) / 60);
                                if (minutesOfDay < param.GetDutyAfterLocalTimeMinutes()) {
                                    reasons.push_back("duty time after LN");
                                    extra.emplace("duty_time_after_ln_minutes",
                                                  std::to_string(param.GetDutyAfterLocalTimeMinutes()));
                                    extra.emplace("local_nights_before_duty", std::to_string(localNightsBefore));
                                    details.push_back(StringUtils::Format("{0:type} (sequence {1:seq}) starts at {2} < min {3}",
                                                                         safeLabel(dutyTypeLabel, "duty"),
                                                                         std::to_string(d->getDutySeq()),
                                                                         TimeUtils::MinutesTohhmm(minutesOfDay),
                                                                         TimeUtils::MinutesTohhmm(param.GetDutyAfterLocalTimeMinutes())));
                                }
                            }
                        }
                    }
                }

                if (!reasons.empty()) {
                    std::string reasonJoined;
                    for (std::size_t rr = 0; rr < reasons.size(); ++rr) {
                        if (rr > 0) {
                            reasonJoined += ", ";
                        }
                        reasonJoined += reasons[rr];
                    }
                    extra.emplace("reasons", reasonJoined);

                    std::string detailJoined;
                    for (std::size_t dd = 0; dd < details.size(); ++dd) {
                        if (dd > 0) {
                            detailJoined += "; ";
                        }
                        detailJoined += details[dd];
                    }
                    if (detailJoined.empty()) {
                        detailJoined = "see constraints";
                    }
                    reportDutyViolation(
                        *d,
                        param,
                        StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} internal duty within slip violates constraints ({1:reasons}): {2:details}.",
                                            safeLabel(param.GetClause(), "UNKNOWN"),
                                            safeLabel(reasonJoined, "UNKNOWN"),
                                            safeLabel(detailJoined, "UNKNOWN")),
                        extra);
                    pass = false;
                    break;
                }
            }

            // Standby duties are constrained via max standby periods/hours; allowed-duty expressions constrain non-standby duties.
            if (pass && hasAllowedDutyConstraint && !isStandby) {
                const bool bypassAllowedDutyCheck =
                    AcopSlipPatternExtraConditions::ShouldBypassAllowedDutyCheckForNonStandbyDuty(
                        *d,
                        k,
                        dutyDay,
                        minutesOfDay,
                        isStandby,
                        dutyIsWithinSlipLocation,
                        param,
                        extraConditionState);

                if (!bypassAllowedDutyCheck && !nonStandbyAllowedByRule) {
                    std::map<std::string, std::string> extra = baseExtra;
                    extra.emplace("reasons", "allowed duty within slip");
                    extra.emplace("allowed_duty_within_slip", safeLabel(param.GetAllowedDutyWithinSlipRaw(), "*"));
                    extra.emplace("internal_duty_assignment", safeLabel(d->getAssignment(), "UNKNOWN"));
                    reportDutyViolation(
                        *d,
                        param,
                        StringUtils::Format(param.GetViolationHeader() +
                                                " Clause {0:clause} internal duty within slip violates allowed duty within slip (allowed: {1:allowed}).",
                                            safeLabel(param.GetClause(), "UNKNOWN"),
                                            safeLabel(param.GetAllowedDutyWithinSlipRaw(), "*")),
                        extra);
                    pass = false;
                    break;
                }
            }
        }
    }

    const bool doAfterAppliesToFirstNonStandbyDuty =
        hasDoAfterDutyDays &&
        firstNonStandbyInternalDutyIndex < duties.size() &&
        matchesDoAfterTriggerForInternalDuty(duties,
                                             arriveDutyIndex,
                                             firstNonStandbyInternalDutyIndex,
                                             slipStartLoc,
                                             arrivalDay,
                                             control,
                                             param);

    // DO-after-duty enforcement between the allowed internal duty and the next duty in the pairing.
    if (pass && !hasDoAfterTriggers && doAfterAppliesToFirstNonStandbyDuty && hasAllowedDutyConstraint && firstNonStandbyInternalDutyIndex < duties.size()) {
        const Duty* firstInternal = duties[firstNonStandbyInternalDutyIndex];
        if (firstInternal != nullptr) {
            std::size_t nextDutyIndex = firstNonStandbyInternalDutyIndex + 1;
            while (nextDutyIndex < duties.size() && duties[nextDutyIndex] == nullptr) {
                ++nextDutyIndex;
            }
            if (nextDutyIndex < duties.size()) {
                const Duty* nextDuty = duties[nextDutyIndex];
                const time_t nextStartLoc = nextDuty != nullptr ? nextDuty->getStartTimeLocAct() : 0;
                const time_t nextDay = nextStartLoc > 0 ? TimeUtils::Truncate(nextStartLoc, ChronoUnit::DAYS) : 0;

				// for now we always use duty end time (debrief time) for "day free of duty" reqreuiment
                //time_t restStartLocAfter = getRestStartLocAfterDuty(*firstInternal, control);
				auto restStartLocAfter = firstInternal->getEndTimeLocAct();
                //if (restStartLocAfter <= 0) {
                //    restStartLocAfter = firstInternal->getEndTimeLocAct();
                //}
                const time_t endDay = restStartLocAfter > 0 ? TimeUtils::Truncate(restStartLocAfter, ChronoUnit::DAYS) : 0;
                const time_t requiredDay = endDay > 0 ? TimeUtils::AddDay(endDay, param.GetDoAfterDutyDays() + 1) : 0;

                if (requiredDay > 0 && nextDay > 0 && nextDay < requiredDay) {
                    std::map<std::string, std::string> extra = baseExtra;
                    extra.emplace("reasons", "DO after duty");
                    extra.emplace("do_after_duty_days", std::to_string(param.GetDoAfterDutyDays()));
                    reportDutyViolation(
                        *nextDuty,
                        param,
                        StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} violates DO after duty requirement (no day free of duty after internal duty).",
                                            safeLabel(param.GetClause(), "UNKNOWN")),
                        extra);
                    pass = false;
                }
            }
        }
    }

    if (pass && !hasDoAfterTriggers && doAfterAppliesToFirstNonStandbyDuty && anyNonStandbyInternalDuty && lastNonStandbyInternalEndLoc > 0 && departDay > 0) {
        const time_t lastEndDay = TimeUtils::Truncate(lastNonStandbyInternalEndLoc, ChronoUnit::DAYS);
        const time_t required = lastEndDay > 0 ? TimeUtils::AddDay(lastEndDay, param.GetDoAfterDutyDays()) : 0;
        if (required > 0 && departDay < required) {
            std::map<std::string, std::string> extra = baseExtra;
            extra.emplace("reasons", "DO after duty");
            extra.emplace("do_after_duty_days", std::to_string(param.GetDoAfterDutyDays()));
            reportDutyViolation(
                *departDuty,
                param,
                StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} slip at {1:slip} violates DO after duty requirement.",
                                    safeLabel(param.GetClause(), "UNKNOWN"),
                                    safeLabel(arriveStation, "UNKNOWN")),
                extra);
            pass = false;
        }
    }

    if (pass && hasDoAfterTriggers && hasDoAfterDutyDays) {
        for (const std::size_t dutyIndex : doAfterTriggerDutyIndices) {
            const Duty* triggerDuty = dutyIndex < duties.size() ? duties[dutyIndex] : nullptr;
            if (triggerDuty == nullptr) {
                continue;
            }
            if (!matchesDoAfterTriggerForInternalDuty(duties,
                                                      arriveDutyIndex,
                                                      dutyIndex,
                                                      slipStartLoc,
                                                      arrivalDay,
                                                      control,
                                                      param)) {
                continue;
            }

            std::size_t nextDutyIndex = dutyIndex + 1;
            while (nextDutyIndex < duties.size() && duties[nextDutyIndex] == nullptr) {
                ++nextDutyIndex;
            }
            if (nextDutyIndex >= duties.size()) {
                continue;
            }

            const Duty* nextDuty = duties[nextDutyIndex];
            const time_t nextStartLoc = nextDuty != nullptr ? nextDuty->getStartTimeLocAct() : 0;
            const time_t nextDay = nextStartLoc > 0 ? TimeUtils::Truncate(nextStartLoc, ChronoUnit::DAYS) : 0;

            time_t restStartLocAfter = getRestStartLocAfterDuty(*triggerDuty, control);
            if (restStartLocAfter <= 0) {
                restStartLocAfter = triggerDuty->getEndTimeLocAct();
            }
            const time_t endDay = restStartLocAfter > 0 ? TimeUtils::Truncate(restStartLocAfter, ChronoUnit::DAYS) : 0;
            const time_t requiredDay = endDay > 0 ? TimeUtils::AddDay(endDay, param.GetDoAfterDutyDays() + 1) : 0;

            if (requiredDay > 0 && nextDay > 0 && nextDay < requiredDay) {
                std::map<std::string, std::string> extra = baseExtra;
                extra.emplace("reasons", "DO after duty (after)");
                extra.emplace("do_after_duty_days", std::to_string(param.GetDoAfterDutyDays()));
                extra.emplace("do_after_duty_raw", safeLabel(param.GetDoAfterDutyRaw(), "UNKNOWN"));
                reportDutyViolation(
                    *nextDuty,
                    param,
                    StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} violates DO after duty requirement.",
                                        safeLabel(param.GetClause(), "UNKNOWN")),
                    extra);
                pass = false;
                break;
            }
        }
    }

    if (pass && extraConditionState.type != AcopSlipPatternExtraConditionType::None && departDuty != nullptr) {
        pass = AcopSlipPatternExtraConditions::Finalize(duties,
                                                       *departDuty,
                                                       param,
                                                       control,
                                                       baseExtra,
                                                       extraConditionState,
                                                       extraConditionReport);
    }

    if (outAtdoDaysOffAtBase != nullptr) {
        *outAtdoDaysOffAtBase = extraConditionState.atdoDaysOffAtBase;
    }
    if (outAtdoDaysOffAtBaseReason != nullptr) {
        *outAtdoDaysOffAtBaseReason = extraConditionState.atdoDaysOffAtBaseReason;
    }
    if (outExdoDaysOffAtBase != nullptr) {
        *outExdoDaysOffAtBase = extraConditionState.exdoDaysOffAtBase;
    }
    if (outExdoDaysOffAtBaseReason != nullptr) {
        *outExdoDaysOffAtBaseReason = extraConditionState.exdoDaysOffAtBaseReason;
    }
    return pass;
}

}  // namespace

bool AcopSlipPatternRule::CheckRule(const Pairing* pairing) const {
    if (pairing == nullptr) {
        return true;
    }


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

    auto pairingOperatingFleetsAreAllowed = [&](const AcopSlipPatternControlParam& control) -> bool {
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

    const auto& duties = pairing->getDutyVec();
    if (duties.empty() || duties.front() == nullptr) {
        return true;
    }

    const time_t reportTimeLoc = duties.front()->getStartTimeLocAct();
    time_t departTimeAtBaseLoc = getFirstFlightDepartTimeLoc(*pairing);

    bool passAll = true;
    for (const auto& instance : _ruleInstances) {
        if (instance.params.empty()) {
            continue;
        }
        const auto& params = instance.params;
        const auto& control = instance.control;
        const std::vector<std::string> stationChain = buildStationChain(duties, control);

        int highestSeverityValue = -1;
        for (const auto& p : params) {
            const int severityValue = static_cast<int>(p.GetSeverity());
            if (severityValue > highestSeverityValue) {
                highestSeverityValue = severityValue;
            }
        }

        if ((IsPairingOptimizerModel() || IsRosterOptimizerModel()) &&
            control.optimizerPassLevel >= 0 &&
            highestSeverityValue >= 0 &&
            highestSeverityValue <= control.optimizerPassLevel) {
            continue;
        }

        const std::string filterUpper = control.serviceTypeUpper;
        if (!filterUpper.empty() && filterUpper != "*" && filterUpper != pairingServiceType) {
            continue;
        }
        if (!pairingOperatingFleetsAreAllowed(control)) {
            continue;
        }

        // `matchesCopPattern` is relatively expensive and depends only on the pairing-level station chain.
        // Hoist pairing-invariant filters out of the per-duty loop.
        std::vector<const AcopSlipPatternRuleParam*> applicableParams;
        applicableParams.reserve(params.size());
        for (const auto& param : params) {
            if (!param.MatchesReportTimeAtBase(reportTimeLoc)) {
                continue;
            }
            if (!param.MatchesDepartureTimeAtBase(departTimeAtBaseLoc)) {
                continue;
            }
            if (!matchesCopPattern(param.GetCopPattern(), stationChain, _dbData.get())) {
                continue;
            }
            applicableParams.push_back(&param);
        }
        if (applicableParams.empty()) {
            continue;
        }

        const auto isUlrEquivalentPositioningDuty = [&](const Duty& duty) -> bool {
            EnsureUlrDefinitionRowsInitialized();
            return ULRDutyDefinition::IsUlrEquivalentPositioningDuty(duty, _ulrDefinitionRows, _dbData.get());
        };

        bool groupPassAll = true;
        ExtraDaysOffAtBaseRequirement extraDaysOffAtBaseRequirement;
        for (std::size_t i = 0; i < duties.size(); ++i) {
            if (!checkSlipAtIndex(*pairing,
                                  i,
                                  applicableParams,
                                  control,
                                  extraDaysOffAtBaseRequirement,
                                  isUlrEquivalentPositioningDuty)) {
                groupPassAll = false;
                passAll = false;
                if (!IsCheckAllRule()) {
                    return false;
                }
            }
        }

        if (groupPassAll &&
            (extraDaysOffAtBaseRequirement.atdoDays > 0 || extraDaysOffAtBaseRequirement.exdoDays > 0) &&
            (extraDaysOffAtBaseRequirement.atdoParam != nullptr || extraDaysOffAtBaseRequirement.exdoParam != nullptr)) {
            Duty* lastDuty = pairing->getLastDuty();
            if (lastDuty == nullptr) {
                for (auto it = duties.rbegin(); it != duties.rend(); ++it) {
                    if (*it != nullptr) {
                        lastDuty = *it;
                        break;
                    }
                }
            }
            const std::string base = pairing->getBase();
            const std::string lastArr = lastDuty != nullptr ? lastDuty->getArrivalStation() : "";
            if (!base.empty() && lastDuty != nullptr && lastArr == base) {
                const time_t dutyEndLoc = lastDuty->getEndTimeLocAct();
                const int offsetTZInSecs = static_cast<int>(pairing->getStartTimeLocAct() - pairing->getStartTimeUtcAct());

                time_t restStartLoc = dutyEndLoc;
                if (restStartLoc <= 0) {
                    const time_t dutyEndUtc = lastDuty->getEndTimeUtcAct();
                    restStartLoc = dutyEndUtc > 0 ? dutyEndUtc + static_cast<time_t>(offsetTZInSecs) : 0;
                }
                // For now ATDO and EXDO day-off windows are defined from DEBRIEF.
                // Pairing end time (and thus endTimeIncludesRestInUTC) is based on DROPOFF/transport, so when we
                // translate a debrief-based window into a min-rest duration enforced after transport, subtract the
                // debrief->dropoff delta minutes to avoid shifting the implied rest end time by the transport length.
                const int debriefToDropoffMinutes = [&]() -> int {
                    const auto debrief = lastDuty->getLastDebrief();
                    const auto dropoff = lastDuty->getLastDropoff();
                    if (debrief != nullptr && dropoff != nullptr) {
                        const time_t debriefEndLoc = debrief->getEndTimeLocAct();
                        const time_t dropoffEndLoc = dropoff->getEndTimeLocAct();
                        if (debriefEndLoc > 0 && dropoffEndLoc > 0 && dropoffEndLoc >= debriefEndLoc) {
                            return static_cast<int>((dropoffEndLoc - debriefEndLoc) / 60);
                        }
                    }
                    int dropoffMin = lastDuty->getActualDropoffMin();
                    if (dropoffMin <= 0) {
                        dropoffMin = lastDuty->getMinDropoff();
                    }
                    return dropoffMin < 0 ? 0 : dropoffMin;
                }();

                //if (restStartLoc > 0 && control.restStartsAfter == AcopRestStartsAfter::Transport) {
                //    int dropoffMin = lastDuty->getActualDropoffMin();
                //    if (dropoffMin <= 0) {
                //        dropoffMin = lastDuty->getMinDropoff();
                //    }
                //    if (dropoffMin > 0) {
                //        restStartLoc += static_cast<time_t>(dropoffMin) * 60;
                //    }
                //}

                if (restStartLoc > 0 && extraDaysOffAtBaseRequirement.atdoDays > 0 && extraDaysOffAtBaseRequirement.atdoParam != nullptr) {
                    const time_t alignDay = TimeUtils::Truncate(restStartLoc, ChronoUnit::DAYS);
                    const time_t alignLoc = (restStartLoc == alignDay) ? alignDay : TimeUtils::AddDay(alignDay, 1);
                    const time_t restEndLoc = TimeUtils::AddDay(alignLoc, extraDaysOffAtBaseRequirement.atdoDays);

                    const int minRestFromDebrief = restEndLoc > restStartLoc ? static_cast<int>((restEndLoc - restStartLoc) / 60) : 0;
                    const int minRestMinutes = std::max(0, minRestFromDebrief - debriefToDropoffMinutes);
                    lastDuty->setMinATDO(extraDaysOffAtBaseRequirement.atdoDays);
                    if (minRestMinutes > lastDuty->getMinRestAtBase()) {
                        lastDuty->setMinRestAtBase(minRestMinutes);
                        if (minRestMinutes > lastDuty->getMinRest()) {
                            lastDuty->setMinRest(minRestMinutes);
                        }
                        lastDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST,
                                                     minRestMinutes,
                                                     extraDaysOffAtBaseRequirement.atdoParam->GetId(),
                                                     extraDaysOffAtBaseRequirement.atdoParam->GetRuleParamId(),
                                                     extraDaysOffAtBaseRequirement.atdoParam->GetOverrideAbility(),
                                                     extraDaysOffAtBaseRequirement.atdoParam->GetClassType(),
                                                     extraDaysOffAtBaseRequirement.atdoParam->GetDescription(),
                                                     extraDaysOffAtBaseRequirement.atdoParam->GetReference());
                    }
                }

                if (restStartLoc > 0 && extraDaysOffAtBaseRequirement.exdoDays > 0 && extraDaysOffAtBaseRequirement.exdoParam != nullptr) {
                    const int totalDaysOff = std::max(0, lastDuty->getMinATDO()) +
                                             std::max(0, extraDaysOffAtBaseRequirement.exdoDays);
                    const time_t alignDay = TimeUtils::Truncate(restStartLoc, ChronoUnit::DAYS);
                    const time_t alignLoc = (restStartLoc == alignDay) ? alignDay : TimeUtils::AddDay(alignDay, 1);
                    const time_t restEndLoc = TimeUtils::AddDay(alignLoc, totalDaysOff);

                    const int minRestFromDebrief = restEndLoc > restStartLoc ? static_cast<int>((restEndLoc - restStartLoc) / 60) : 0;
                    const int minRestMinutes = std::max(0, minRestFromDebrief - debriefToDropoffMinutes);
                    lastDuty->setMinEXDO(extraDaysOffAtBaseRequirement.exdoDays);
                    if (minRestMinutes > lastDuty->getMinRestAtBase()) {
                        lastDuty->setMinRestAtBase(minRestMinutes);
                        if (minRestMinutes > lastDuty->getMinRest()) {
                            lastDuty->setMinRest(minRestMinutes);
                        }
                        lastDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST,
                                                     minRestMinutes,
                                                     extraDaysOffAtBaseRequirement.exdoParam->GetId(),
                                                     extraDaysOffAtBaseRequirement.exdoParam->GetRuleParamId(),
                                                     extraDaysOffAtBaseRequirement.exdoParam->GetOverrideAbility(),
                                                     extraDaysOffAtBaseRequirement.exdoParam->GetClassType(),
                                                     extraDaysOffAtBaseRequirement.exdoParam->GetDescription(),
                                                     extraDaysOffAtBaseRequirement.exdoParam->GetReference());
                    }
                }
            }
        }
    }

    return passAll;
}

bool AcopSlipPatternRule::CheckRule(const Duty* duty) const {
    (void)duty;
    return true;
}

bool AcopSlipPatternRule::checkSlipAtIndex(const Pairing& pairing,
                                          std::size_t arriveDutyIndex,
                                          const std::vector<const AcopSlipPatternRuleParam*>& applicableParams,
                                          const AcopSlipPatternControlParam& control,
                                          ExtraDaysOffAtBaseRequirement& extraDaysOffAtBaseRequirement,
                                          const std::function<bool(const Duty&)>& isUlrEquivalentPositioningDuty) const {
    const auto& duties = pairing.getDutyVec();
    if (arriveDutyIndex >= duties.size()) {
        return true;
    }
    const Duty* arriveDuty = duties[arriveDutyIndex];
    if (arriveDuty == nullptr) {
        return true;
    }
    if (isStandbyDuty(arriveDuty, control)) {
        return true;
    }

    const std::string arriveStation = arriveDuty->getArrivalStation();

    struct DeferredViolation {
        const Duty* duty{nullptr};
        const AcopSlipPatternRuleParam* param{nullptr};
        std::string message{};
        std::map<std::string, std::string> extraFields{};
    };

    auto buildSlipLimitViolation = [&](const CandidateRow& row) -> DeferredViolation {
        const auto& p = *row.param;
        std::vector<std::string> reasons;
        std::map<std::string, std::string> extra = row.baseExtra;
        std::vector<std::string> details;

        if (p.GetMinSlipMinutes() > 0) {
            const int requiredMinutes = p.GetMinSlipMinutes();
            if (row.stay.effectiveRestMinutes < requiredMinutes) {
                reasons.push_back("min slip hours");
                extra.emplace("min_slip_hours", TimeUtils::MinutesTohhmm(p.GetMinSlipMinutes()));
                details.push_back(StringUtils::Format("effective rest {0} < min {1}",
                                                     TimeUtils::MinutesTohhmm(row.stay.effectiveRestMinutes),
                                                     TimeUtils::MinutesTohhmm(requiredMinutes)));
            }
        }
        if (p.GetMaxSlipMinutes() > 0) {
            const int allowedMinutes = p.GetMaxSlipMinutes();
            if (row.stay.windowMinutes > allowedMinutes) {
                reasons.push_back("max slip hours");
                extra.emplace("max_slip_hours", TimeUtils::MinutesTohhmm(p.GetMaxSlipMinutes()));
                details.push_back(StringUtils::Format("slip window {0} > max {1}",
                                                     TimeUtils::MinutesTohhmm(row.stay.windowMinutes),
                                                     TimeUtils::MinutesTohhmm(allowedMinutes)));
            }
        }
        if (p.GetMinSlipLocalNights() > 0) {
            if (row.stay.localNights < p.GetMinSlipLocalNights()) {
                reasons.push_back("min slip local nights");
                extra.emplace("min_slip_local_nights", std::to_string(p.GetMinSlipLocalNights()));
                details.push_back(StringUtils::Format("local nights {0} < min {1}",
                                                     std::to_string(row.stay.localNights),
                                                     std::to_string(p.GetMinSlipLocalNights())));
            }
        }
        if (reasons.empty()) {
            reasons.push_back("min slip limits");
        }

        std::string reasonJoined;
        for (std::size_t r = 0; r < reasons.size(); ++r) {
            if (r > 0) {
                reasonJoined += ", ";
            }
            reasonJoined += reasons[r];
        }
        extra.emplace("reasons", reasonJoined);

        DeferredViolation v;
        v.duty = row.departDuty;
        v.param = row.param;
        std::string detailJoined;
        for (std::size_t d = 0; d < details.size(); ++d) {
            if (d > 0) {
                detailJoined += "; ";
            }
            detailJoined += details[d];
        }
        if (detailJoined.empty()) {
            detailJoined = StringUtils::Format("effective rest {0}, window {1}, local nights {2}",
                                               TimeUtils::MinutesTohhmm(row.stay.effectiveRestMinutes),
                                               TimeUtils::MinutesTohhmm(row.stay.windowMinutes),
                                               std::to_string(row.stay.localNights));
        }

        v.message = StringUtils::Format(p.GetViolationHeader() + " Clause {0:clause} slip at {1:slip} violates slip limits ({2:reasons}; {3:details}).",
                                        safeLabel(p.GetClause(), "UNKNOWN"),
                                        safeLabel(arriveStation, "UNKNOWN"),
                                        safeLabel(reasonJoined, "UNKNOWN"),
                                        safeLabel(detailJoined, "UNKNOWN"));
        v.extraFields = std::move(extra);
        return v;
    };

    auto buildSlipDepartDutyReportTimeViolation = [&](const CandidateRow& row) -> DeferredViolation {
        const auto& p = *row.param;
        std::map<std::string, std::string> extra = row.baseExtra;
        extra.emplace("reasons", "slip depart duty report time");
        extra.emplace("slip_depart_duty_report_time",
                      safeLabel(p.GetSlipDepartDutyReportTimeRaw(), std::to_string(p.GetSlipDepartDutyReportTimeMinutes())));

        const time_t departStartLoc = row.departDuty != nullptr ? row.departDuty->getStartTimeLocAct() : 0;
        const int departMinutesOfDay = (departStartLoc > 0 && row.departDay > 0) ? static_cast<int>((departStartLoc - row.departDay) / 60) : -1;
        extra.emplace("depart_duty_report_time_actual_minutes", std::to_string(departMinutesOfDay));

        const std::string actualLabel = departMinutesOfDay >= 0 ? TimeUtils::MinutesTohhmm(departMinutesOfDay) : "UNKNOWN";
        const std::string requiredLabel = p.GetSlipDepartDutyReportTimeMinutes() >= 0 ? TimeUtils::MinutesTohhmm(p.GetSlipDepartDutyReportTimeMinutes()) : "UNKNOWN";

        DeferredViolation v;
        v.duty = row.departDuty;
        v.param = row.param;
        v.message = StringUtils::Format(p.GetViolationHeader() + " Clause {0:clause} slip at {1:slip} depart duty report time violates constraint (actual {2:actual} < min {3:min}).",
                                        safeLabel(p.GetClause(), "UNKNOWN"),
                                        safeLabel(arriveStation, "UNKNOWN"),
                                        safeLabel(actualLabel, "UNKNOWN"),
                                        safeLabel(requiredLabel, "UNKNOWN"));
        v.extraFields = std::move(extra);
        return v;
    };

    struct InternalEval {
        std::vector<DeferredViolation> failures;
        int atdoDaysOffAtBase{0};
        std::string atdoDaysOffAtBaseReason{};
        int exdoDaysOffAtBase{0};
        std::string exdoDaysOffAtBaseReason{};
    };

    auto evaluateInternal = [&](const CandidateRow& row) -> InternalEval {
        InternalEval out;
        std::vector<DeferredViolation> captured;
        int atdoDaysOffAtBase = 0;
        std::string atdoDaysOffAtBaseReason;
        int exdoDaysOffAtBase = 0;
        std::string exdoDaysOffAtBaseReason;

        const bool ok = checkInternalConstraints(duties,
                                                 arriveDutyIndex,
                                                 arriveStation,
                                                 row,
                                                 control,
                                                 _dbData.get(),
                                                 &atdoDaysOffAtBase,
                                                 &atdoDaysOffAtBaseReason,
                                                 &exdoDaysOffAtBase,
                                                 &exdoDaysOffAtBaseReason,
                                                 [&](const Duty& duty,
                                                     const AcopSlipPatternRuleParam& param,
                                                     const std::string& message,
                                                     const std::map<std::string, std::string>& extraFields) {
                                                     DeferredViolation v;
                                                     v.duty = &duty;
                                                     v.param = &param;
                                                     v.message = message;
                                                     v.extraFields = extraFields;
                                                     captured.push_back(std::move(v));
                                                 });
        if (ok) {
            out.atdoDaysOffAtBase = atdoDaysOffAtBase;
            out.atdoDaysOffAtBaseReason = std::move(atdoDaysOffAtBaseReason);
            out.exdoDaysOffAtBase = exdoDaysOffAtBase;
            out.exdoDaysOffAtBaseReason = std::move(exdoDaysOffAtBaseReason);
            return out;
        }

        out.failures = std::move(captured);
        return out;
    };

    std::vector<CandidateRow> candidates;
    candidates.reserve(applicableParams.size());

    auto isOperatingDuty = [&](const Duty& duty) -> bool {
        const std::string dutyAssignment = duty.getAssignment();
        if (dutyAssignment.empty()) {
            return false;
        }
        return std::find(control.operatingAssignmentsUpper.begin(),
                         control.operatingAssignmentsUpper.end(),
                         dutyAssignment) != control.operatingAssignmentsUpper.end();
    };

    enum class OperatingStatus {
        Operate,
        NonOperate,
        Invalid
    };

    auto slipArriveOperatingStatus = [&](const Duty& duty) -> OperatingStatus {
        if (control.operatingDefinitionType == AcopSlipPatternControlParam::OperatingDefinitionType::SegmentIsOperating) {
            Segment* matched = nullptr;
            for (auto* seg : duty.getSegmentsRead()) {
                if (seg == nullptr) {
                    continue;
                }
                if (seg->getArrStation() != arriveStation) {
                    continue;
                }
                if (seg->getDepStation() == arriveStation) {
                    continue;
                }
                matched = seg;
                break;
            }
            if (matched == nullptr) {
                return OperatingStatus::Invalid;
            }
            return matched->getIsOperating() ? OperatingStatus::Operate : OperatingStatus::NonOperate;
        }

        return isOperatingDuty(duty) ? OperatingStatus::Operate : OperatingStatus::NonOperate;
    };

    auto slipDepartOperatingStatus = [&](const Duty& duty) -> OperatingStatus {
        if (control.operatingDefinitionType == AcopSlipPatternControlParam::OperatingDefinitionType::SegmentIsOperating) {
            Segment* matched = nullptr;
            for (auto* seg : duty.getSegmentsRead()) {
                if (seg == nullptr) {
                    continue;
                }
                if (seg->getDepStation() != arriveStation) {
                    continue;
                }
                if (seg->getArrStation() == arriveStation) {
                    continue;
                }
                matched = seg;
                break;
            }
            if (matched == nullptr) {
                return OperatingStatus::Invalid;
            }
            return matched->getIsOperating() ? OperatingStatus::Operate : OperatingStatus::NonOperate;
        }

        return isOperatingDuty(duty) ? OperatingStatus::Operate : OperatingStatus::NonOperate;
    };

    auto matchesOperatingRequirement = [&](AcopSlipOperatingRequirement req, OperatingStatus status) -> bool {
        if (req == AcopSlipOperatingRequirement::Any) {
            return true;
        }
        if (status == OperatingStatus::Invalid) {
            return false;
        }
        if (req == AcopSlipOperatingRequirement::Operate) {
            return status == OperatingStatus::Operate;
        }
        if (req == AcopSlipOperatingRequirement::NonOperate) {
            return status == OperatingStatus::NonOperate;
        }
        return true;
    };

    for (const auto* paramPtr : applicableParams) {
        if (paramPtr == nullptr) {
            continue;
        }
        const auto& param = *paramPtr;
        _ruleViolation.SetRuleParam(param);

        if (!param.MatchesDutyBefore(*arriveDuty, isUlrEquivalentPositioningDuty)) {
            continue;
        }
        if (!param.MatchesSlipArrFlightNo(*arriveDuty, _dbData.get())) {
            continue;
        }
        if (!matchesOperatingRequirement(param.GetSlipArrIsOperatingRequirement(), slipArriveOperatingStatus(*arriveDuty))) {
            continue;
        }
        if (!matchesSpecialCopFilter(param.GetCopPattern(), *arriveDuty)) {
            continue;
        }

        AcopLocationExpr slipStationExpr = param.GetSlipStation();
        const AcopSlipStationMatchMode slipStationMatchMode = param.GetSlipStationMatchMode();
        const std::string slipStationAnchorAirport =
            (slipStationMatchMode == AcopSlipStationMatchMode::Expression) ? "" : arriveStation;

        if (!matchesSlipStationAirport(slipStationExpr,
                                       slipStationMatchMode,
                                       arriveStation,
                                       _dbData.get(),
                                       slipStationAnchorAirport)) {
            if (param.GetCopPattern().special == AcopCopPattern::SpecialType::DutyHasOperatingSectorAndEndsAfter) {
                std::map<std::string, std::string> extra{
                    {"clause", safeLabel(param.GetClause(), "UNKNOWN")},
                    {"slip_station", safeLabel(param.GetSlipStationRaw(), "UNKNOWN")},
                    {"duty_end_station", safeLabel(arriveStation, "UNKNOWN")},
                    {"pattern", safeLabel(param.GetCopApplicabilityRaw(), "*")},
                    {"reasons", "duty must end at slip station"},
                };
                if (!shouldBypassViolationForOptimizer(param.GetSeverity(), control)) {
                    reportDutyViolation(*arriveDuty,
                                        param,
                                        StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} duty contains required operating sector but must end at slip station {1:slip}.",
                                                            safeLabel(param.GetClause(), "UNKNOWN"),
                                                            safeLabel(param.GetSlipStationRaw(), "UNKNOWN")),
                                        extra);
                    return false;
                }
                continue;
            }
            continue;
        }

        // Only treat a duty as the "arrival into slip" when it enters the slip station from outside.
        if (matchesSlipStationAirport(slipStationExpr,
                                      slipStationMatchMode,
                                      arriveDuty->getDepartureStation(),
                                      _dbData.get(),
                                      slipStationAnchorAirport)) {
            continue;
        }

        if (param.GetSlipOccurrence() > 0) {
            int occ = 0;
            for (std::size_t k = 0; k <= arriveDutyIndex; ++k) {
                const Duty* d = duties[k];
                if (d == nullptr || isStandbyDuty(d, control)) {
                    continue;
                }
                if (matchesSlipStationAirport(slipStationExpr,
                                              slipStationMatchMode,
                                              d->getArrivalStation(),
                                              _dbData.get(),
                                              slipStationAnchorAirport)) {
                    ++occ;
                }
            }
            if (occ != param.GetSlipOccurrence()) {
                continue;
            }
        }

        const std::size_t departIndex =
            findSlipDepartDutyIndex(duties,
                                    arriveDutyIndex,
                                    slipStationExpr,
                                    slipStationMatchMode,
                                    control,
                                    _dbData.get(),
                                    slipStationAnchorAirport);
        const Duty* departDuty = departIndex < duties.size() ? duties[departIndex] : nullptr;
        if (departDuty != nullptr) {
            if (!param.MatchesDutyAfter(*departDuty, isUlrEquivalentPositioningDuty)) {
                continue;
            }
            if (!param.MatchesSlipDepFlightNo(*departDuty, _dbData.get())) {
                continue;
            }
            if (!matchesOperatingRequirement(param.GetSlipDepIsOperatingRequirement(), slipDepartOperatingStatus(*departDuty))) {
                continue;
            }
        }

        // Previous slip filters (based on the station where the arrive duty departed from).
        const int prevSlipLnThreshold = param.GetPrevSlipLocalNightsThreshold();
        const int prevSlipHadStandbyFilter = param.GetPrevSlipHadStandbyFilter();
        if (prevSlipLnThreshold > 0 || prevSlipHadStandbyFilter != -1) {
            int prevLocalNights = 0;
            bool prevHadStandby = false;

            if (arriveDutyIndex > 0) {
                const std::string prevStation = arriveDuty->getDepartureStation();
                std::size_t prevArriveIndex = duties.size();
                for (std::size_t k = arriveDutyIndex; k-- > 0;) {
                    const Duty* d = duties[k];
                    if (d == nullptr) {
                        continue;
                    }
                    if (isStandbyDuty(d, control)) {
                        continue;
                    }
                    if (d->getArrivalStation() != prevStation) {
                        continue;
                    }
                    if (d->getDepartureStation() != prevStation) {
                        prevArriveIndex = k;
                        break;
                    }
                }
                if (prevArriveIndex < duties.size()) {
                    const StayMetrics prev = computeStayMetrics(duties, prevArriveIndex, arriveDutyIndex, control, _dbData.get());
                    if (prev.valid) {
                        prevLocalNights = prev.localNights;
                        prevHadStandby = prev.standbyPeriods > 0;
                    }
                }
            }

            if (prevSlipLnThreshold > 0 && prevLocalNights < prevSlipLnThreshold) {
                continue;
            }
            if (prevSlipHadStandbyFilter == 0 && prevHadStandby) {
                continue;
            }
            if (prevSlipHadStandbyFilter == 1 && !prevHadStandby) {
                continue;
            }
        }

        const bool hasAllowedDutyConstraint = param.GetAllowedDutyWithinSlip().HasConstraint();
        const bool hasDutyAfterConstraint =
            (param.GetDutyAfterMinutes() >= 0 || param.GetDutyAfterLocalNights() >= 0 || param.GetDutyAfterLocalTimeMinutes() >= 0);
        const bool hasStandbyCaps = (param.GetMaxStandbyPeriods() >= 0 || param.GetMaxStandbyMinutes() >= 0);
        const bool hasExtraCondition = param.HasAnyExtraCondition();
        const bool hasInternalConstraints =
            (hasStandbyCaps || hasDutyAfterConstraint || hasAllowedDutyConstraint ||
             param.GetDoAfterDutyDays() > 0 || hasExtraCondition);

        if (departDuty == nullptr && !hasInternalConstraints) {
            continue;
        }

        StayMetrics stay{};
        if (departDuty != nullptr) {
            stay = computeStayMetrics(duties, arriveDutyIndex, departIndex, control, _dbData.get());
            if (!stay.valid) {
                continue;
            }
        } else {
            stay.valid = true;
            stay.startLoc = getRestStartLocAfterDuty(*arriveDuty, control);
        }

        std::map<std::string, std::string> baseExtra{
            {"clause", safeLabel(param.GetClause(), "UNKNOWN")},
            {"group", safeLabel(param.GetGroup(), "DEFAULT")},
            {"priority", std::to_string(param.GetPriority())},
            {"slip_station", safeLabel(arriveStation, "UNKNOWN")},
            {"pattern", safeLabel(param.GetCopApplicabilityRaw(), "*")},
            {"window_minutes", std::to_string(stay.windowMinutes)},
            {"effective_rest_minutes", std::to_string(stay.effectiveRestMinutes)},
            {"local_nights", std::to_string(stay.localNights)},
            {"standby_periods", std::to_string(stay.standbyPeriods)},
            {"standby_total_minutes", std::to_string(stay.standbyTotalMinutes)},
        };

        const time_t slipStartLoc = stay.startLoc;
        const time_t dutyEndLocal = arriveDuty->getEndTimeLocAct();
		auto lastSeg = arriveDuty->getLastSegment();
        time_t arrivalTimeLocal = 0;
        // based on rule document, we use last flight arrival time for "day after arrival"
        if (lastSeg != nullptr) {
            arrivalTimeLocal = lastSeg->getEndTimeLocAct();
            if (arrivalTimeLocal <= 0)
                arrivalTimeLocal = lastSeg->getEndTimeLocSch();
        }
        const time_t arrivalDay = arrivalTimeLocal > 0 ? TimeUtils::Truncate(arrivalTimeLocal, ChronoUnit::DAYS) : 0;
        const time_t departStartLoc = departDuty != nullptr ? departDuty->getStartTimeLocAct() : 0;
        const time_t departDay = departStartLoc > 0 ? TimeUtils::Truncate(departStartLoc, ChronoUnit::DAYS) : 0;

        const bool hasSlipLimitConstraints =
            (departDuty != nullptr) &&
            (param.GetMinSlipMinutes() > 0 || param.GetMaxSlipMinutes() > 0 || param.GetMinSlipLocalNights() > 0);
        const bool hasSlipDepartDutyReportTimeConstraint =
            (departDuty != nullptr) &&
            (param.GetSlipDepartDutyReportTimeMinutes() >= 0) &&
            (param.GetMinSlipLocalNights() > 0) &&
            (stay.localNights == param.GetMinSlipLocalNights()) &&
            isOnDayAfterLocalNightStartDate(departStartLoc, stay.lastLocalNightStartDateLoc);

        CandidateRow row;
        row.param = paramPtr;
        row.departIndex = departIndex;
        row.departDuty = departDuty;
        row.stay = stay;
        row.slipStartLoc = slipStartLoc;
        row.arrivalDay = arrivalDay;
        row.departDay = departDay;
        row.baseExtra = std::move(baseExtra);
        row.hasSlipLimitConstraints = hasSlipLimitConstraints;
        row.hasSlipDepartDutyReportTimeConstraint = hasSlipDepartDutyReportTimeConstraint;
        row.hasInternalConstraints = hasInternalConstraints;
        row.slipLimitsPass = slipLimitsPass(row);
        row.slipDepartDutyReportTimePass = slipDepartDutyReportTimePass(row);
        candidates.push_back(std::move(row));
    }

    if (!candidates.empty()) {
        const bool isOptimizer = (IsPairingOptimizerModel() || IsRosterOptimizerModel());
        std::vector<DeferredViolation> groupFailures;
        bool allGroupsPass = true;
        auto groupKey = [](const CandidateRow& row) -> std::string {
            if (row.param == nullptr) {
                return "DEFAULT";
            }
            const std::string g = row.param->GetGroup();
            return g.empty() ? "DEFAULT" : g;
        };

        std::map<std::string, std::vector<std::size_t>> groups;
        for (std::size_t i = 0; i < candidates.size(); ++i) {
            groups[groupKey(candidates[i])].push_back(i);
        }

        auto hasInternalDutyBetween = [&](std::size_t departIndex) -> bool {
            const std::size_t endIndex = std::min(departIndex, duties.size());
            for (std::size_t k = arriveDutyIndex + 1; k < endIndex; ++k) {
                if (duties[k] != nullptr) {
                    return true;
                }
            }
            return false;
        };

        for (const auto& entry : groups) {
            const auto& indices = entry.second;
            int bestPriority = std::numeric_limits<int>::max();
            for (auto idx : indices) {
                if (candidates[idx].param == nullptr) {
                    continue;
                }
                bestPriority = std::min(bestPriority, candidates[idx].param->GetPriority());
            }
            if (bestPriority == std::numeric_limits<int>::max()) {
                continue;
            }
            const std::string groupAllowedOptions = buildGroupAllowedOptions(candidates, indices, bestPriority);

            std::vector<DeferredViolation> firstInternalFailures;
            std::optional<DeferredViolation> firstDepartTimeFailure;
            std::optional<DeferredViolation> bestSlipLimitFailure;
            std::optional<DeferredViolation> highestSeverityFailure;
            int bestReqMinMinutes = 0;
            int bestReqMinLocalNights = 0;
            int bestAllowedMaxMinutes = std::numeric_limits<int>::max();
            int highestSeverityValue = -1;

            bool groupPass = false;
            bool anyRowConsidered = false;
            int groupAtdoDaysOffAtBase = 0;
            const AcopSlipPatternRuleParam* groupAtdoDaysParam = nullptr;
            std::string groupAtdoDaysReason;
            int groupExdoDaysOffAtBase = 0;
            const AcopSlipPatternRuleParam* groupExdoDaysParam = nullptr;
            std::string groupExdoDaysReason;
            for (auto idx : indices) {
                CandidateRow& row = candidates[idx];
                if (row.param == nullptr) {
                    continue;
                }
                if (row.departDuty == nullptr && !row.hasInternalConstraints) {
                    continue;
                }
                if (row.param->GetPriority() != bestPriority) {
                    continue;
                }
                const bool hasInternalDuties = hasInternalDutyBetween(row.departIndex);
                if (!hasInternalDuties &&
                    row.hasInternalConstraints &&
                    !row.hasSlipLimitConstraints &&
                    !row.hasSlipDepartDutyReportTimeConstraint &&
                    !row.param->HasAnyExtraCondition()) {
                    continue;
                }
                anyRowConsidered = true;

                if (row.hasSlipLimitConstraints && !row.slipLimitsPass) {
                    const auto& p = *row.param;
                    const int reqMinMinutes = p.GetMinSlipMinutes() > 0 ? p.GetMinSlipMinutes() : 0;
                    const int reqMinLn = p.GetMinSlipLocalNights() > 0 ? p.GetMinSlipLocalNights() : 0;
                    const int allowedMaxMinutes = p.GetMaxSlipMinutes() > 0 ? p.GetMaxSlipMinutes() : std::numeric_limits<int>::max();
                    const bool morePermissive =
                        (!bestSlipLimitFailure.has_value()) ||
                        (reqMinMinutes < bestReqMinMinutes) ||
                        (reqMinMinutes == bestReqMinMinutes && reqMinLn < bestReqMinLocalNights) ||
                        (reqMinMinutes == bestReqMinMinutes && reqMinLn == bestReqMinLocalNights && allowedMaxMinutes > bestAllowedMaxMinutes);

                    if (morePermissive) {
                        bestSlipLimitFailure = buildSlipLimitViolation(row);
                        bestReqMinMinutes = reqMinMinutes;
                        bestReqMinLocalNights = reqMinLn;
                        bestAllowedMaxMinutes = allowedMaxMinutes;
                    }

                    const int sev = enum_to_underlying(row.param->GetSeverity());
                    if (sev > highestSeverityValue) {
                        highestSeverityValue = sev;
                        highestSeverityFailure = buildSlipLimitViolation(row);
                    }
                    continue;
                }

                if (row.hasSlipDepartDutyReportTimeConstraint && !row.slipDepartDutyReportTimePass) {
                    if (!firstDepartTimeFailure.has_value()) {
                        firstDepartTimeFailure = buildSlipDepartDutyReportTimeViolation(row);
                    }
                    const int sev = enum_to_underlying(row.param->GetSeverity());
                    if (sev > highestSeverityValue) {
                        highestSeverityValue = sev;
                        highestSeverityFailure = buildSlipDepartDutyReportTimeViolation(row);
                    }
                    continue;
                }

                if (row.hasInternalConstraints) {
                    const auto internal = evaluateInternal(row);
                    if (!internal.failures.empty()) {
                        if (firstInternalFailures.empty()) {
                            firstInternalFailures = internal.failures;
                        }
                        const int sev = enum_to_underlying(row.param->GetSeverity());
                        if (sev > highestSeverityValue) {
                            highestSeverityValue = sev;
                            highestSeverityFailure = internal.failures.front();
                        }
                        continue;
                    }
                    groupAtdoDaysOffAtBase = internal.atdoDaysOffAtBase;
                    groupAtdoDaysReason = internal.atdoDaysOffAtBaseReason;
                    groupExdoDaysOffAtBase = internal.exdoDaysOffAtBase;
                    groupExdoDaysReason = internal.exdoDaysOffAtBaseReason;
                }

                groupPass = true;
                groupAtdoDaysParam = row.param;
                groupExdoDaysParam = row.param;
                break;
            }

            if (!groupPass) {
                if (!anyRowConsidered) {
                    continue;
                }
                if (isOptimizer &&
                    control.optimizerPassLevel >= 0 &&
                    highestSeverityValue >= 0 &&
                    highestSeverityValue <= control.optimizerPassLevel) {
                    return true;
                }

                const DeferredViolation* toReport = nullptr;
                const std::vector<DeferredViolation>* toReportList = nullptr;
                if (isOptimizer && highestSeverityFailure.has_value()) {
                    toReport = &*highestSeverityFailure;
                } else if (!firstInternalFailures.empty()) {
                    toReportList = &firstInternalFailures;
                } else if (firstDepartTimeFailure.has_value()) {
                    toReport = &*firstDepartTimeFailure;
                } else if (bestSlipLimitFailure.has_value()) {
                    toReport = &*bestSlipLimitFailure;
                }

                auto addAllowedOptions = [&](DeferredViolation& report) {
                    const auto reasonIt = report.extraFields.find("reasons");
                    std::string allowedOptions = groupAllowedOptions;
                    if (allowedOptions.empty() && reasonIt != report.extraFields.end() &&
                        reasonIt->second.find("allowed duty within slip") != std::string::npos) {
                        allowedOptions = "NONE";
                    }
                    if (!allowedOptions.empty() && reasonIt != report.extraFields.end() &&
                        reasonIt->second.find("allowed duty within slip") != std::string::npos) {
                        const std::string marker = " (allowed:";
                        const std::size_t pos = report.message.find(marker);
                        if (pos != std::string::npos) {
                            const std::size_t end = report.message.find(')', pos);
                            if (end != std::string::npos) {
                                report.message.erase(pos, end - pos + 1);
                            }
                        }
                        report.extraFields.emplace("allowed_options", allowedOptions);
                        report.message += StringUtils::Format(" Allowed options in group: {0:options}.",
                                                             safeLabel(allowedOptions, "UNKNOWN"));
                    }
                };

                if (toReportList != nullptr) {
                    for (auto report : *toReportList) {
                        if (report.duty == nullptr || report.param == nullptr) {
                            continue;
                        }
                        addAllowedOptions(report);
                        groupFailures.push_back(std::move(report));
                    }
                } else if (toReport != nullptr && toReport->duty != nullptr && toReport->param != nullptr) {
                    DeferredViolation report = *toReport;
                    addAllowedOptions(report);
                    if (isOptimizer) {
                        reportDutyViolation(*report.duty, *report.param, report.message, report.extraFields);
                        return false;
                    }
                    groupFailures.push_back(std::move(report));
                }
                allGroupsPass = false;
                continue;
            }

            if (groupAtdoDaysOffAtBase > extraDaysOffAtBaseRequirement.atdoDays && groupAtdoDaysParam != nullptr) {
                extraDaysOffAtBaseRequirement.atdoDays = groupAtdoDaysOffAtBase;
                extraDaysOffAtBaseRequirement.atdoParam = groupAtdoDaysParam;
                extraDaysOffAtBaseRequirement.atdoReason = std::move(groupAtdoDaysReason);
            }
            if (groupExdoDaysOffAtBase > extraDaysOffAtBaseRequirement.exdoDays && groupExdoDaysParam != nullptr) {
                extraDaysOffAtBaseRequirement.exdoDays = groupExdoDaysOffAtBase;
                extraDaysOffAtBaseRequirement.exdoParam = groupExdoDaysParam;
                extraDaysOffAtBaseRequirement.exdoReason = std::move(groupExdoDaysReason);
            }
        }

        if (!allGroupsPass) {
            for (const auto& v : groupFailures) {
                if (v.duty != nullptr && v.param != nullptr) {
                    reportDutyViolation(*v.duty, *v.param, v.message, v.extraFields);
                }
            }
            return false;
        }
    }

    return true;

}

void AcopSlipPatternRule::reportDutyViolation(const Duty& duty,
                                              const AcopSlipPatternRuleParam& param,
                                              const std::string& message,
                                              const std::map<std::string, std::string>& extraFields) const {
    _ruleViolation.SetRuleParam(param);
    for (const auto& entry : extraFields) {
        _ruleViolation.SetParam(entry.first, entry.second);
    }

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->pairingId = duty.getPairingId();
    rv->dutySequenceNumber = duty.getDutySeq();
    rv->startDTUtc = duty.getStartTimeUtcAct();
    rv->endDTUtc = duty.getEndTimeUtcAct();
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
    rv->violation_msg = message;
    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(param.GetId())));
    rv->operation_result.insert(std::make_pair(
        "category", param.GetReference().empty() ? "CA" : param.GetReference()));
    rv->operation_result.insert(std::make_pair(
        "subCategory", param.GetCategory().empty() ? "ACOP" : param.GetCategory()));
    for (const auto& entry : extraFields) {
        rv->operation_result.insert(std::make_pair(entry.first, entry.second));
    }

    if (_ruleViolation.GetRuleLegality() != nullptr) {
        auto* legality = _ruleViolation.GetRuleLegality();
        if (legality->crewIndex >= 0 && legality->crewIndex < static_cast<int>(_dbData->crewList.size())) {
            SharedPtr<CREW> crew = this->_dbData->crewList[legality->crewIndex];
            rv->crewId = crew->idCrew;
            _ruleViolation.SetLegalityMessage(crew, message);
        }
    } else {
        _ruleViolation.SetLegalityMessage(const_cast<Duty*>(&duty), message, AcopSlipPatternRule::RuleFuncId);
    }

    _ruleViolation.AddRuleViolations(rv);
}

bool AcopSlipPatternRule::shouldBypassViolationForOptimizer(const ViolationSeverity& severity, const AcopSlipPatternControlParam& control) const {
    if (!IsPairingOptimizerModel() && !IsRosterOptimizerModel()) {
        return false;
    }
    if (control.optimizerPassLevel < 0) {
        return false;
    }
    return enum_to_underlying(severity) <= control.optimizerPassLevel;
}

void AcopSlipPatternRule::EnsureUlrDefinitionRowsInitialized() const {
    if (_dbData == nullptr) {
        return;
    }
    std::call_once(_ulrDefinitionInitOnce, [&]() {
        _ulrDefinitionRows.clear();
        if (_ulrDefinitionDbRules.empty()) {
            return;
        }

        _ulrDefinitionRows.reserve(_ulrDefinitionDbRules.size());
        for (const auto& dbRule : _ulrDefinitionDbRules) {
            if (dbRule.tableNum == 2 || dbRule.params.empty()) {
                continue;
            }

            ULRDutyDefinition::Row row;
            row.idRule = dbRule.idRule;
            row.idRuleParam = dbRule.idRuleParam;
            row.rowNum = dbRule.rowNum;
            row.effectiveDate.clear();
            row.expiryDate.clear();
            row.utcRangeParsed = false;
            row.utcRangeValid = true;
            row.effectiveStartUtc = 0;
            row.expiryEndUtc = std::numeric_limits<time_t>::max();

            for (const auto& kv : dbRule.params) {
                const std::string header = strToUpper(trim(kv.first));
                const std::string value = trim(kv.second);
                if (header == "DEP" || header == "DEP STATION" || header == "DEP AIRPORT" ||
                    header == "DUTY START STATION" || header == "START STATION") {
                    row.depStation = strToUpper(value);
                } else if (header == "ARR" || header == "ARR STATION" || header == "ARR AIRPORT" ||
                    header == "DUTY END STATION" || header == "END STATION") {
                    row.arrStation = strToUpper(value);
                } else if (header == "FLEET" || header == "FLEETS") {
                    row.fleet = strToUpper(value);
                } else if (header == "FLEET GROUP" || header == "FLEET GRP" || header == "FLEETGROUP") {
                    row.fleetGroup = strToUpper(value);
                } else if (header == kUlrEffectiveDateHeader || header == "EFFECTIVE DATE (YYYY-MM-DD)" ||
                    header == "EFFECTIVE DATE (YYYY-MM-DD HH:MM:SS)" ||
                    header == "EFFECTIVE DATE (YYYY-MM-DD HH:MM)" ||
                    header == "EFFECTIVE DATE (YYYY-MM-DD HH)") {
                    row.effectiveDate = value;
                } else if (header == kUlrExpiryDateHeader || header == "EXPIRED DATE" ||
                    header == "EXPIRED DATE (YYYY-MM-DD)" ||
                    header == "EXPIRED DATE (YYYY-MM-DD HH:MM:SS)" ||
                    header == "EXPIRED DATE (YYYY-MM-DD HH:MM)" ||
                    header == "EXPIRED DATE (YYYY-MM-DD HH)") {
                    row.expiryDate = value;
                } else {
                    Logger::getRuleLogger()->debug(
                        "Rule 7421 ignoring 7405 param '{}' for idRule:{} idRuleParam:{}",
                        header, dbRule.idRule, dbRule.idRuleParam);
                }
            }

            if (row.depStation.empty() && row.arrStation.empty() &&
                row.fleet.empty() && row.fleetGroup.empty()) {
                continue;
            }
            _ulrDefinitionRows.push_back(std::move(row));
        }

        ULRDutyDefinition::ParseUtcRanges(_ulrDefinitionRows, _dbData.get());
    });
}

void AcopSlipPatternRule::ParseParam(const InputType& input) {
    _ruleInstances.clear();
    _ulrDefinitionDbRules.clear();
    auto itUlr = input.dependDbRules.find(RULES::ANR_ULR_DUTY_DEFINITION);
    if (itUlr != input.dependDbRules.end()) {
        _ulrDefinitionDbRules = itUlr->second;
    }

    std::unordered_map<long long, std::size_t> instanceIndexByRuleId;
    instanceIndexByRuleId.reserve(input.dbRules.size());

    auto getOrCreateInstance = [&](long long ruleId) -> RuleInstance& {
        const auto it = instanceIndexByRuleId.find(ruleId);
        if (it != instanceIndexByRuleId.end()) {
            return _ruleInstances[it->second];
        }
        const std::size_t idx = _ruleInstances.size();
        instanceIndexByRuleId.emplace(ruleId, idx);
        _ruleInstances.emplace_back();
        _ruleInstances.back().ruleId = ruleId;
        return _ruleInstances.back();
    };

    if (!input.dbRules.empty()) {
        for (const auto& dbRule : input.dbRules) {
            // Table 1 = slip limitations; Table 2 = control parameters. Allow tableNum=0 as table 1.
            if (dbRule.tableNum == 2) {
                auto& instance = getOrCreateInstance(dbRule.idRule);
                auto& control = instance.control;
                const auto& parameters = dbRule.params;
                for (auto it = parameters.begin(); it != parameters.end(); ++it) {
                    const std::string headerUpper = strToUpper(trim(it->first));
                    const std::string value = trim(it->second);

                    if (headerUpper == "SBY REDUCES REST AND LN" || headerUpper == "SBY REDUCES REST AND LOCAL NIGHT") {
                        control.standbyReducesRestAndLocalNight = parseBoolYN(value, true);
                    } else if (headerUpper == "REST STARTS AFTER") {
                        control.restStartsAfter = parseRestStartsAfter(value, control.restStartsAfter);
                    } else if (headerUpper == "REST INCLUDES TRANSPORT") {
                        // Backward-compatible alias: Y => start after debrief (transport counts as rest).
                        control.restStartsAfter = parseRestStartsAfter(value, control.restStartsAfter);
                    } else if (headerUpper == "STANDBY ASSIGNMENTS") {
                        auto list = parsePipeListUpper(value);
                        if (!list.empty()) {
                            control.standbyAssignments = std::move(list);
                        }
                    } else if (headerUpper == "SERVICE TYPE") {
                        const std::string upper = strToUpper(trim(value));
                        control.serviceTypeUpper = upper.empty() ? "*" : upper;
                    } else if (headerUpper == "FLEETS" || headerUpper == "FLEET") {
                        const std::string upper = strToUpper(trim(value));
                        if (upper.empty() || upper == "*" || upper == RuleParamConstant::ALL ||
                            upper == RuleParamConstant::IGNORED) {
                            control.fleetCodesUpper.clear();
                        } else {
                            control.fleetCodesUpper = parsePipeListUpper(upper);
                        }
                    } else if (headerUpper == "OPERATING DEFINITION") {
                        const std::string upper = strToUpper(trim(value));
                        if (upper == "DUTY_IS_OPERATING") {
                            control.operatingDefinitionType = AcopSlipPatternControlParam::OperatingDefinitionType::DutyIsOperating;
                            control.operatingAssignmentsUpper = {"FLY", "MVO"};
                        } else if (upper.rfind("DUTY_ASSIGNMENTS=", 0) == 0) {
                            control.operatingDefinitionType = AcopSlipPatternControlParam::OperatingDefinitionType::DutyAssignmentInList;
                            control.operatingAssignmentsUpper = parsePipeListUpper(upper.substr(std::string("DUTY_ASSIGNMENTS=").size()));
                            if (control.operatingAssignmentsUpper.empty()) {
                                control.operatingAssignmentsUpper = {"FLY", "MVO"};
                            }
                        } else if (upper == "SEGMENT_IS_OPERATING") {
                            control.operatingDefinitionType = AcopSlipPatternControlParam::OperatingDefinitionType::SegmentIsOperating;
                        } else {
                            // Default: duty assignment in {"FLY","MVO"}.
                            control.operatingDefinitionType = AcopSlipPatternControlParam::OperatingDefinitionType::DutyIsOperating;
                            control.operatingAssignmentsUpper = {"FLY", "MVO"};
                        }
                    } else if (headerUpper == "OPTIMIZER PASS LEVEL" || headerUpper == "OPTIMIZER FAIL LEVEL") {
                        control.optimizerPassLevel = parseOptimizerPassLevel(value, control.optimizerPassLevel);
                    } else if (headerUpper == "SEVERITY") {
                        // ignore (rule-level severity already handled by RuleParam)
                    } else {
                        Logger::getRuleLogger()->warn("Rule 7421 control parameter ignored, header: {}", it->first);
                    }
                }
                continue;
            }

            if (dbRule.tableNum != 0 && dbRule.tableNum != 1) {
                continue;
            }
            AcopSlipPatternRuleParam param(this);
            param.ParseParam(dbRule);
            param.SetRowNum(dbRule.rowNum);
            auto& instance = getOrCreateInstance(dbRule.idRule);
            instance.params.emplace_back(std::move(param));
        }
    }

    auto paramLess = [](const AcopSlipPatternRuleParam& lhs, const AcopSlipPatternRuleParam& rhs) {
        if (lhs.GetGroup() != rhs.GetGroup()) {
            return lhs.GetGroup() < rhs.GetGroup();
        }
        if (lhs.GetPriority() != rhs.GetPriority()) {
            // Priority: smaller number means higher priority (1 is highest).
            return lhs.GetPriority() < rhs.GetPriority();
        }
        // Prefer more specific conditions when priorities tie.
        if (lhs.GetSlipOccurrence() != rhs.GetSlipOccurrence()) {
            return lhs.GetSlipOccurrence() > rhs.GetSlipOccurrence();
        }
        if (lhs.GetPrevSlipLocalNightsThreshold() != rhs.GetPrevSlipLocalNightsThreshold()) {
            return lhs.GetPrevSlipLocalNightsThreshold() > rhs.GetPrevSlipLocalNightsThreshold();
        }
        const int lhsPrevSbySpecified = (lhs.GetPrevSlipHadStandbyFilter() == -1) ? 0 : 1;
        const int rhsPrevSbySpecified = (rhs.GetPrevSlipHadStandbyFilter() == -1) ? 0 : 1;
        if (lhsPrevSbySpecified != rhsPrevSbySpecified) {
            return lhsPrevSbySpecified > rhsPrevSbySpecified;
        }
        if (lhs.GetRowNum() != rhs.GetRowNum()) {
            return lhs.GetRowNum() < rhs.GetRowNum();
        }
        return lhs.GetRuleParamId() < rhs.GetRuleParamId();
    };

    for (auto& instance : _ruleInstances) {
        std::sort(instance.params.begin(), instance.params.end(), paramLess);
    }
}
