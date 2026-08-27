#include "CheckAnrDayOffSpacingRule.h"

#include <limits>
#include <map>

#include "CrewDB.h"
#include "StringUtil.h"
#include "Log/Logger.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

namespace {
constexpr long long kSecondsPerDay = 24LL * 60LL * 60LL;
constexpr int kMinutesPerDay = 24 * 60;
constexpr long long kInvalidDayIndex = std::numeric_limits<long long>::min();

const char* workDayEndsAtToString(Anr7415WorkDayEndsAt mode) {
    return mode == Anr7415WorkDayEndsAt::Debrief ? "DEBRIEF" : "TRANSPORT";
}
}

namespace {
constexpr int kAnrDayOffDefinitionId = RULES::ANR_DAY_OFF_DEFINITION;
}

void CheckAnrDayOffSpacingRule::ParseParam(const InputType& input) {
    _param.ParseFromRuleInput(input);
    auto it = input.dependDbRules.find(kAnrDayOffDefinitionId);
    if (it != input.dependDbRules.end()) {
        _dayOffDefinition.loadFromDbRules(it->second);
    }
    else {
        // default day off setting will be used
    }
}

bool CheckAnrDayOffSpacingRule::CheckRule(const Pairing* pairing) const {
    return checkPairingInternal(pairing, nullptr);
}

bool CheckAnrDayOffSpacingRule::CheckRule(
    const std::vector<const ROSTER*>& rosters) const {
    if (rosters.empty()) {
        return true;
    }
    for (const auto* roster : rosters) {
        if (!roster || !roster->pairing) {
            continue;
        }
        if (!checkPairingInternal(roster->pairing, roster)) {
            return false;
        }
    }
    return true;
}

bool CheckAnrDayOffSpacingRule::checkPairingInternal(const Pairing* pairing,
                                                     const ROSTER* roster) const {
    if (pairing == nullptr || pairing->getDutyVec().empty()) {
        return true;
    }

    if (!_param.hasConfig())
        return true;

    const auto& duties = pairing->getDutyVec();
    const Duty* firstDuty = duties.front();
    if (firstDuty == nullptr) {
        return true;
    }

    const auto configs = _param.findConfigsForPairing(pairing, this->_dbData.get());
    if (configs.empty()) {
        return true;
    }

    bool allValid = true;
    for (const auto* config : configs) {
        if (config == nullptr) {
            continue;
        }
        if (!checkPairingWithConfig(pairing, roster, *config)) {
            allValid = false;
            if (!IsCheckAllRule()) {
                return false;
            }
        }
    }
    return allValid;
}

bool CheckAnrDayOffSpacingRule::checkPairingWithConfig(
    const Pairing* pairing,
    const ROSTER* roster,
    const AnrDayOffSpacingConfig& config) const {
    const auto& duties = pairing->getDutyVec();
    const Duty* firstDuty = duties.front();

    int baseOffsetMinutes = DutyUtils::GetTimeZoneOffset(*firstDuty, this->_dbData);
    const time_t finalWorkingDayEndUtc =
        computeWorkingDayEndUtc(duties.back(), config.workDayEndsAt);
    const long long finalDayIndex =
        dayIndexForBase(finalWorkingDayEndUtc, baseOffsetMinutes);
    const int maxWorkingDays = config.maxWorkingDays > 0 ? config.maxWorkingDays : 0;
    const int lastDayBufferMinutes = config.lastDayBufferMinutes;

    if (maxWorkingDays <= 0) {
        return true;
    }

    // Working-day start date is based on the first duty's start local day.
    const time_t firstDutyStartUtc = firstDuty->getStartTimeUtcAct();
    long long workingStartDay = dayIndexForBase(firstDutyStartUtc, baseOffsetMinutes);

    // Early exit: if the entire pairing span (from first duty start to last
    // duty rest start) is shorter than the maximum allowed consecutive working
    // days, it can never violate this rule.
    const long long overallSpanDays = finalDayIndex - workingStartDay + 1;
    if (overallSpanDays < maxWorkingDays) {
        return true;
    }

    for (size_t idx = 0; idx < duties.size(); ++idx) {
        const Duty* duty = duties[idx];
        if (!duty) {
            continue;
        }

        const time_t workingDayEndUtc =
            computeWorkingDayEndUtc(duty, config.workDayEndsAt);
        const long long workingEndDay =
            dayIndexForBase(workingDayEndUtc, baseOffsetMinutes);

        long long deltaDays = workingEndDay - workingStartDay;
        int workingDays = static_cast<int>(deltaDays + 1);
        if (workingDays <= 0) {
            workingDays = 1;
        }

        if (workingDays > maxWorkingDays) {
            throwViolation(pairing,
                           roster,
                           duty,
                           workingDays,
                           workingDayEndUtc,
                           config,
                           ViolationReason::ExceededLimit);
            return false;
        }

        if (lastDayBufferMinutes >= 0 && workingDays == maxWorkingDays) {
            const int minutesSinceMidnight =
                minutesFromBaseMidnight(workingDayEndUtc, baseOffsetMinutes);
            if (minutesSinceMidnight > lastDayBufferMinutes) {
                throwViolation(pairing,
                               roster,
                               duty,
                               workingDays,
                               workingDayEndUtc,
                               config,
                               ViolationReason::LateBuffer);
                return false;
            }
        }

        const Duty* nextDuty = (idx + 1 < duties.size()) ? duties[idx + 1] : nullptr;
        if (nextDuty && restContainsAnrDayOff(duty, nextDuty)) {
            // Restart counting from the next duty's local start day.
            const time_t nextStartUtc = nextDuty->getStartTimeUtcAct();
            workingStartDay = dayIndexForBase(nextStartUtc, baseOffsetMinutes);

            // Early exit after a qualifying day off: if the remaining span from
            // this new start to the final rest start is shorter than the
            // maximum, it cannot produce a violation.
            const long long remainingSpanDays = finalDayIndex - workingStartDay + 1;
            if (remainingSpanDays < maxWorkingDays) {
                return true;
            }
        }
    }

    return true;
}

bool CheckAnrDayOffSpacingRule::restContainsAnrDayOff(const Duty* duty,
                                                      const Duty* nextDuty) const {
    
    const time_t restStartUtc = computeRestStartUtc(duty);
    const time_t restEndUtc = computeRestEndUtc(nextDuty);
    if (restEndUtc <= restStartUtc) {
        return false;
    }

    const int offsetMinutes =
        DutyUtils::GetTimeZoneOffsetByArr(*duty, this->_dbData);
    const std::string restZoneId =
        this->_dbData->getAirportZoneId(nextDuty->getDepartureStation());

    return _dayOffDefinition.countDaysOffInRest(restStartUtc, restEndUtc, offsetMinutes, restZoneId) >= 1;
}

void CheckAnrDayOffSpacingRule::throwViolation(const Pairing* pairing,
                                               const ROSTER* roster,
                                               const Duty* duty,
                                               int consecutiveDays,
                                               time_t restStartUtc,
                                               const AnrDayOffSpacingConfig& config,
                                               ViolationReason reason) const {
    _ruleViolation.SetParam("consecutive_days", std::to_string(consecutiveDays));
    _ruleViolation.SetParam("max_working_days", std::to_string(config.maxWorkingDays));
    _ruleViolation.SetParam("rest_start_utc", std::to_string(restStartUtc));
    _ruleViolation.SetParam("work_day_ends_at",
                            workDayEndsAtToString(config.workDayEndsAt));
    _ruleViolation.SetParam("reason",
                            reason == ViolationReason::LateBuffer
                                ? "last_day_buffer"
                                : "missing_day_off");

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->startDTUtc = duty ? duty->getStartTimeUtcAct() : 0;
    rv->endDTUtc = duty ? duty->getEndTimeUtcAct() : restStartUtc;
    if (pairing) {
        rv->pairingId = pairing->getDbId();
    }
    if (duty) {
        rv->dutySequenceNumber = duty->getDutySeq();
    }
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
    rv->ishard = (strToUpper(config.overrideAbility) == "H");

    rv->operation_result.insert(std::make_pair("consecutive_days",
        std::to_string(consecutiveDays)));
    rv->operation_result.insert(std::make_pair("max_working_days",
        std::to_string(config.maxWorkingDays)));
    rv->operation_result.insert(std::make_pair("rest_start_utc",
        std::to_string(restStartUtc)));
    rv->operation_result.insert(std::make_pair("work_day_ends_at",
        workDayEndsAtToString(config.workDayEndsAt)));
    if (config.lastDayBufferMinutes >= 0) {
        rv->operation_result.insert(std::make_pair(
            "last_day_buffer",
            TimeUtils::MinutesTohhmm(config.lastDayBufferMinutes)));
    }
    rv->operation_result.insert(std::make_pair("ruleId", std::to_string(RuleFuncId)));

    std::string errorMsg;
    if (reason == ViolationReason::LateBuffer) {
        errorMsg = "[ANR] Day " + std::to_string(config.maxWorkingDays) +
                   " rest started after buffer (" +
                   TimeUtils::MinutesTohhmm(config.lastDayBufferMinutes) +
                   ") on day " + std::to_string(config.maxWorkingDays) +
                   " of consecutive duty, violating last-day requirement";
    } else {
        errorMsg = "[ANR] Worked " + std::to_string(consecutiveDays) +
                   " consecutive days without qualifying ANR day off (max " +
                   std::to_string(config.maxWorkingDays) + ")";
    }
    rv->violation_msg = errorMsg;

    _ruleViolation.AddRuleViolations(rv);
}

long long CheckAnrDayOffSpacingRule::dayIndexForBase(time_t utcTime,
                                                     int baseOffsetMinutes) {
    const long long localSeconds =
        static_cast<long long>(utcTime) +
        static_cast<long long>(baseOffsetMinutes) * 60LL;
    assert(localSeconds >= 0);
    return localSeconds / kSecondsPerDay;
}

int CheckAnrDayOffSpacingRule::minutesFromBaseMidnight(time_t utcTime,
                                                       int baseOffsetMinutes) {
    const long long localSeconds =
        static_cast<long long>(utcTime) +
        static_cast<long long>(baseOffsetMinutes) * 60LL;
    const long long dayIndex = dayIndexForBase(utcTime, baseOffsetMinutes);
    const long long midnightSeconds = dayIndex * kSecondsPerDay;
    long long minutes = (localSeconds - midnightSeconds) / 60;
    minutes %= kMinutesPerDay;
    if (minutes < 0) {
        minutes += kMinutesPerDay;
    }
    return static_cast<int>(minutes);
}

time_t CheckAnrDayOffSpacingRule::computeWorkingDayEndUtc(
    const Duty* duty,
    Anr7415WorkDayEndsAt mode) const {
    if (mode == Anr7415WorkDayEndsAt::Debrief) {
        return duty->getEndTimeUtcAct();
    }
    return computeRestStartUtc(duty);
}

time_t CheckAnrDayOffSpacingRule::computeRestStartUtc(const Duty* duty) const {

    long dropoffMin = duty->getActualDropoffMin();
    if (dropoffMin <=0 )
		dropoffMin = duty->getMinDropoff();
    time_t restStart = duty->getEndTimeUtcAct();
    if (dropoffMin > 0) {
        restStart += static_cast<time_t>(dropoffMin) * 60;
    }
    return restStart;
}

time_t CheckAnrDayOffSpacingRule::computeRestEndUtc(const Duty* nextDuty) const {

    long pickupMin = nextDuty->getActualPickupMin();
	if (pickupMin <= 0)
		pickupMin = nextDuty->getMinPickup();
    time_t restEnd = nextDuty->getStartTimeUtcAct();
    if (pickupMin > 0) {
        restEnd -= static_cast<time_t>(pickupMin) * 60;
    }
    return restEnd;
}
