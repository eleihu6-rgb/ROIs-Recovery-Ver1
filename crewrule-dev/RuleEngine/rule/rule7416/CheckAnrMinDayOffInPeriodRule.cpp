#include "CheckAnrMinDayOffInPeriodRule.h"

#include <algorithm>
#include <limits>

#include "CrewDB.h"
#include "StringUtil.h"
#include "Log/Logger.h"
#include "Utility.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "RuleParams.h"

namespace {
constexpr long long kSecondsPerDay = 24LL * 60LL * 60LL;
}

void CheckAnrMinDayOffInPeriodRule::ParseParam(const InputType& input) {
    _param.ParseFromRuleInput(input);
    auto it = input.dependDbRules.find(AnrDayOffDefinition::RuleFuncId);
    if (it != input.dependDbRules.end()) {
        _dayOffDefinition.loadFromDbRules(it->second);
    } else {
        // use default Day Off setting
    }
}

bool CheckAnrMinDayOffInPeriodRule::CheckRule(const Pairing* pairing) const {
    return checkPairingInternal(pairing, nullptr);
}

bool CheckAnrMinDayOffInPeriodRule::CheckRule(
    const std::vector<const ROSTER*>& rosters) const {
    if (rosters.empty()) {
        return true;
    }
    bool allValid = true;
    for (const auto* roster : rosters) {
        if (!roster || !roster->pairing) {
            continue;
        }
        if (!checkPairingInternal(roster->pairing, roster)) {
            allValid = false;
            if (this->_application == ROSTER_OPTIMIZER) {
                return false;
            }
        }
    }
    return allValid;
}

bool CheckAnrMinDayOffInPeriodRule::checkPairingInternal(const Pairing* pairing,
                                                         const ROSTER* roster) const {
    if (pairing == nullptr || pairing->getDutyVec().empty()) {
        return true;
    }
    if (!_param.hasConfig() || !_dbData) {
        return true;
    }

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

bool CheckAnrMinDayOffInPeriodRule::checkPairingWithConfig(
    const Pairing* pairing,
    const ROSTER* roster,
    const AnrMinDayOffInPeriodConfig& cfg) const {
    const auto& duties = pairing->getDutyVec();
    const Duty* firstDuty = duties.front();
    const Duty* lastDuty = duties.back();
    if (firstDuty == nullptr || lastDuty == nullptr) {
        return true;
    }

    if (cfg.period <= 0 || cfg.minDaysOff <= 0 || cfg.unit.empty()) {
        return true;
    }

    long long pairingLengthSeconds = pairing->getEndTimeUtcAct() - pairing->getStartTimeUtcAct();

    std::string unit = cfg.unit;

    // early return check
	// assume N days off can counted from (N+1) * 24 hours rest period, 
	// to count K days off from window begin to pairing start and pairing end to window end, 
	// it is sufficient to have (k+2) * 24 hours rest period window length - pairing length 
    long long windowDays = 0;
    if (unit == "CD") {
        windowDays = cfg.period;
    }
    else if (unit == "CW") {
        windowDays = static_cast<long long>(cfg.period) * 7LL;
	}
    if (windowDays <= 0) {
        return true;
    }

    if (pairingLengthSeconds <= (windowDays - cfg.minDaysOff - 2) * kSecondsPerDay) {
        return true;
    }

    int baseOffsetMinutes = DutyUtils::GetTimeZoneOffset(*firstDuty, this->_dbData);
    const int firstDutyOffsetMinutes =
        DutyUtils::GetTimeZoneOffsetByDep(*firstDuty, this->_dbData);
    const int lastDutyOffsetMinutes =
        DutyUtils::GetTimeZoneOffsetByArr(*lastDuty, this->_dbData);

    // Collect rest periods between duties and include virtual off-duty
    // periods before first duty and after last duty.
    std::vector<RestPeriod> restPeriods;

    RestPeriod leadingRestPeriod;
    leadingRestPeriod.startUtc = std::numeric_limits<time_t>::lowest();
    leadingRestPeriod.endUtc = firstDuty->getStartTimeUtcAct();
    leadingRestPeriod.offsetMinutes = firstDutyOffsetMinutes;
    leadingRestPeriod.zoneId = this->_dbData->getAirportZoneId(firstDuty->getDepartureStation());
    if (leadingRestPeriod.endUtc > leadingRestPeriod.startUtc) {
        restPeriods.push_back(leadingRestPeriod);
    }

    for (size_t i = 0; i + 1 < duties.size(); ++i) {
        const Duty* duty = duties[i];
        const Duty* nextDuty = duties[i + 1];
        if (!duty || !nextDuty) {
            continue;
        }

        time_t restStartUtc = computeRestStartUtc(duty);
        time_t restEndUtc = computeRestEndUtc(nextDuty);
        if (restEndUtc <= restStartUtc) {
            continue;
        }

        RestPeriod period;
        period.startUtc = restStartUtc;
        period.endUtc = restEndUtc;
        period.offsetMinutes = DutyUtils::GetTimeZoneOffsetByArr(*duty, this->_dbData);
        period.zoneId = this->_dbData->getAirportZoneId(nextDuty->getDepartureStation());
        if (period.zoneId.empty()) {
            period.zoneId = this->_dbData->getAirportZoneId(duty->getArrivalStation());
        }
        restPeriods.push_back(period);
    }

    RestPeriod trailingRestPeriod;
    trailingRestPeriod.startUtc = computeRestStartUtc(lastDuty);
    trailingRestPeriod.endUtc = std::numeric_limits<time_t>::max();
    trailingRestPeriod.offsetMinutes = lastDutyOffsetMinutes;
    trailingRestPeriod.zoneId = this->_dbData->getAirportZoneId(lastDuty->getArrivalStation());
    if (trailingRestPeriod.endUtc > trailingRestPeriod.startUtc) {
        restPeriods.push_back(trailingRestPeriod);
    }

    if (restPeriods.empty()) {
        return true;
    }
    
    // Determine pairing span in base-local days, using last duty's rest start
    // as the effective pairing end for this rule.
    time_t pairingStartUtc = firstDuty->getStartTimeUtcAct();
    time_t lastRestStartUtc = computeRestStartUtc(lastDuty);
    long long firstDay = dayIndexForBase(pairingStartUtc, baseOffsetMinutes);
    long long lastDay = dayIndexForBase(lastRestStartUtc, baseOffsetMinutes);
    if (lastDay < firstDay) {
        return true;
    }
	
    if (unit == "CD") {
        bool hasViolation = false;
        time_t worstWindowStartUtc = 0;
        time_t worstWindowEndUtc = 0;
        int worstDaysOff = std::numeric_limits<int>::max();

        for (long long windowStartDay = firstDay;
             windowStartDay + windowDays - 1 <= lastDay;
             ++windowStartDay) {
            long long windowEndDay = windowStartDay + windowDays - 1;

            time_t windowStartUtc =
                dayIndexToUtc(windowStartDay, baseOffsetMinutes);
            time_t windowEndUtc =
                dayIndexToUtc(windowEndDay + 1, baseOffsetMinutes);

            int daysOffInWindow = countAnrDaysOffInWindow(
                    windowStartUtc, windowEndUtc, restPeriods, cfg.minDaysOff);
            if (daysOffInWindow >= cfg.minDaysOff) {
                continue;
            }

            hasViolation = true;
            if (daysOffInWindow < worstDaysOff) {
                worstDaysOff = daysOffInWindow;
                worstWindowStartUtc = windowStartUtc;
                worstWindowEndUtc = windowEndUtc;
            }
        }

        if (hasViolation) {
            if (worstDaysOff == std::numeric_limits<int>::max()) {
                worstDaysOff = 0;
            }
            throwViolation(pairing,
                           roster,
                           worstWindowStartUtc,
                           worstWindowEndUtc,
                           cfg,
                           worstDaysOff);
            return false;
        }
        return true;
    } else if (unit == "CW") {
        int weekStart = cfg.weekStartOn;
        std::string weekdayStartFrom;
        switch (weekStart) {
        case 1: weekdayStartFrom = "MON"; break;
        case 2: weekdayStartFrom = "TUE"; break;
        case 3: weekdayStartFrom = "WED"; break;
        case 4: weekdayStartFrom = "THU"; break;
        case 5: weekdayStartFrom = "FRI"; break;
        case 6: weekdayStartFrom = "SAT"; break;
        case 0:
        case 7:
        default:
            weekdayStartFrom = "SUN";
            break;
        }

        time_t windowStartRange = pairingStartUtc;
        time_t windowEndRange = lastRestStartUtc;

        auto mp = Utility::GetInstancePtr()->getWeeksRollingWindows(
            windowStartRange,
            windowEndRange,
            weekdayStartFrom,
            baseOffsetMinutes,
            cfg.period);

        bool hasViolation = false;
        time_t worstWindowStartUtc = 0;
        time_t worstWindowEndUtc = 0;
        int worstDaysOff = std::numeric_limits<int>::max();

        for (const auto& kv : mp) {
            time_t windowStartUtc = kv.first;
            time_t windowEndUtc = kv.second;

            int daysOffInWindow = countAnrDaysOffInWindow(
                    windowStartUtc, windowEndUtc, restPeriods, cfg.minDaysOff);
            if (daysOffInWindow >= cfg.minDaysOff) {
                continue;
            }

            hasViolation = true;
            if (daysOffInWindow < worstDaysOff) {
                worstDaysOff = daysOffInWindow;
                worstWindowStartUtc = windowStartUtc;
                worstWindowEndUtc = windowEndUtc;
            }
        }

        if (hasViolation) {
            if (worstDaysOff == std::numeric_limits<int>::max()) {
                worstDaysOff = 0;
            }
            throwViolation(pairing,
                           roster,
                           worstWindowStartUtc,
                           worstWindowEndUtc,
                           cfg,
                           worstDaysOff);
            return false;
        }
        return true;
    } else if (unit == "CM") {
        Logger::getRuleLogger()->error(
            "Rule 7416 UNIT=CM is not supported yet, skip checking for idRule:{}",
            cfg.idRule);
        return true;
    } else {
        Logger::getRuleLogger()->error(
            "Rule 7416 unsupported UNIT '{}', skip checking for idRule:{}",
            unit,
            cfg.idRule);
        return true;
    }
}

int CheckAnrMinDayOffInPeriodRule::countAnrDaysOffInWindow(
    time_t windowStartUtc,
    time_t windowEndUtc,
    const std::vector<RestPeriod>& restPeriods,
    int minDaysOffRequired) const {
    if (windowEndUtc <= windowStartUtc) {
        return 0;
    }

    const bool enableEarlyExit = (minDaysOffRequired >= 0);  // negative flag counts full window
    int totalDaysOff = 0;
    for (const auto& period : restPeriods) {
        time_t startUtc =
            std::max(windowStartUtc, static_cast<time_t>(period.startUtc));
        time_t endUtc = std::min(windowEndUtc,
                                 static_cast<time_t>(period.endUtc));
        if (endUtc <= startUtc) {
            continue;
        }

        int daysOffInRest =
            _dayOffDefinition.countDaysOffInRest(startUtc, endUtc, period.offsetMinutes, period.zoneId);
        totalDaysOff += daysOffInRest;
        if (enableEarlyExit && totalDaysOff >= minDaysOffRequired) {
            return totalDaysOff;
        }
    }
    return totalDaysOff;
}

void CheckAnrMinDayOffInPeriodRule::throwViolation(const Pairing* pairing,
                                                   const ROSTER* roster,
                                                   time_t windowStartUtc,
                                                   time_t windowEndUtc,
                                                   const AnrMinDayOffInPeriodConfig& cfg,
                                                    int daysOffInWindow) const {
    _ruleViolation.SetParam("window_start_utc",
                            std::to_string(static_cast<long long>(windowStartUtc)));
    _ruleViolation.SetParam("window_end_utc",
                            std::to_string(static_cast<long long>(windowEndUtc)));
    _ruleViolation.SetParam("unit", cfg.unit);
    _ruleViolation.SetParam("period", std::to_string(cfg.period));
    _ruleViolation.SetParam("min_days_off", std::to_string(cfg.minDaysOff));
    _ruleViolation.SetParam("days_off", std::to_string(daysOffInWindow));

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->startDTUtc = windowStartUtc;
    rv->endDTUtc = windowEndUtc;
    if (pairing) {
        rv->pairingId = pairing->getDbId();
    }
    if (roster) {
        rv->crewId = roster->idcrew;
        rv->rosterId = roster->rosterId;
        rv->type = CREW_VIOLATION;
    } else {
        rv->type = PAIRING_VIOLATION;
    }

    rv->idRule = cfg.idRule == 0 ? RuleFuncId : cfg.idRule;
    rv->ruleParamId = cfg.idRuleParam;
    rv->description = cfg.description;
    rv->reference = cfg.reference;
    rv->ishard = (strToUpper(cfg.overrideAbility) == "H");

    rv->operation_result.insert(std::make_pair(
        "window_start_utc",
        std::to_string(static_cast<long long>(windowStartUtc))));
    rv->operation_result.insert(std::make_pair(
        "window_end_utc",
        std::to_string(static_cast<long long>(windowEndUtc))));
    rv->operation_result.insert(std::make_pair("unit", cfg.unit));
    rv->operation_result.insert(std::make_pair("period",
                                               std::to_string(cfg.period)));
    rv->operation_result.insert(std::make_pair(
        "min_days_off",
        std::to_string(cfg.minDaysOff)));
    rv->operation_result.insert(std::make_pair("days_off",
                                               std::to_string(daysOffInWindow)));
    rv->operation_result.insert(std::make_pair("ruleId", std::to_string(RuleFuncId)));

    std::string msg = "[ANR] At least " +
                      std::to_string(cfg.minDaysOff) +
                      " ANR days off are required in " +
                      std::to_string(cfg.period) + " " + cfg.unit +
                      " window, but only " +
                      std::to_string(daysOffInWindow) +
                      " found.";
    rv->violation_msg = msg;

    _ruleViolation.AddRuleViolations(rv);
}

long long CheckAnrMinDayOffInPeriodRule::dayIndexForBase(
    time_t utcTime,
    int baseOffsetMinutes) {
    const long long localSeconds =
        static_cast<long long>(utcTime) +
        static_cast<long long>(baseOffsetMinutes) * 60LL;
    if (localSeconds < 0) {
        return 0;
    }
    return localSeconds / kSecondsPerDay;
}

time_t CheckAnrMinDayOffInPeriodRule::dayIndexToUtc(
    long long dayIndex,
    int baseOffsetMinutes) {
    long long localSeconds = dayIndex * kSecondsPerDay;
    return static_cast<time_t>(localSeconds -
                               static_cast<long long>(baseOffsetMinutes) * 60LL);
}

time_t CheckAnrMinDayOffInPeriodRule::computeRestStartUtc(const Duty* duty) {
    long dropoffMin = duty->getActualDropoffMin();
    if (dropoffMin <= 0) {
        dropoffMin = duty->getMinDropoff();
    }
    time_t restStart = duty->getEndTimeUtcAct();
    if (dropoffMin > 0) {
        restStart += static_cast<time_t>(dropoffMin) * 60;
    }
    return restStart;
}

time_t CheckAnrMinDayOffInPeriodRule::computeRestEndUtc(const Duty* nextDuty) {
    time_t restEnd = nextDuty->getStartTimeUtcAct();
    return restEnd;
}
