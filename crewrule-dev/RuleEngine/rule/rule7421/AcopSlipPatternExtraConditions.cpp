/**
 * @file AcopSlipPatternExtraConditions.cpp
 */

#include "AcopSlipPatternExtraConditions.h"

#include "AcopSlipPatternRuleParam.h"

#include <algorithm>
#include <limits>
#include <optional>

#include "Duty.h"
#include "StringUtil.h"

#include "../framework/utils/StringUtils.h"
#include "../framework/utils/TimeUtils.h"

namespace {

std::string safeLabel(const std::string& value, const std::string& fallback) {
    return value.empty() ? fallback : value;
}

std::size_t safeIndexOrEnd(std::size_t idx) {
    return idx == static_cast<std::size_t>(-1) ? std::numeric_limits<std::size_t>::max() : idx;
}

int getDutyDropoffMinutes(const Duty& duty) {
    int dropoff = duty.getActualDropoffMin();
    if (dropoff <= 0) {
        dropoff = duty.getMinDropoff();
    }
    return dropoff < 0 ? 0 : dropoff;
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

}  // namespace

namespace AcopSlipPatternExtraConditions {

ExtraConditionState InitState(const std::vector<Duty*>& duties,
                              std::size_t arriveDutyIndex,
                              std::size_t departIndex,
                              time_t arrivalDay,
                              const AcopSlipPatternRuleParam& param,
                              const AcopSlipPatternControlParam& control) {
    (void)duties;
    (void)arriveDutyIndex;
    (void)departIndex;
    (void)control;

    ExtraConditionState out;
    out.type = param.GetExtraConditionType();
    out.eur4b.arrivalDay = arrivalDay;

    // ATDO token defines a minimum day-off window at base on return (7465-style).
    // For EUR_4B, ATDO is clause-specific and should be applied only when the EUR_4B sub-condition triggers.
    out.atdoDaysOffAtBase = (out.type == AcopSlipPatternExtraConditionType::Eur4B) ? 0 : param.GetAtdoDaysOffAtBase();
    if (out.atdoDaysOffAtBase > 0) {
        out.atdoDaysOffAtBaseReason = "ATDO token";
    }

    // EXDO token adds extra rest time (7466-style extension) on return to base.
    out.exdoDaysOffAtBase = param.GetExdoDaysOffAtBase();
    if (out.exdoDaysOffAtBase > 0) {
        out.exdoDaysOffAtBaseReason = "EXDO token";
    }
    return out;
}

bool ValidateAndObserveInternalDuty(const std::vector<Duty*>& duties,
                                   std::size_t dutyIndex,
                                   const Duty& duty,
                                   time_t dutyDay,
                                   int minutesOfDay,
                                   bool isStandby,
                                   bool dutyIsWithinSlipLocation,
                                   const AcopSlipPatternRuleParam& param,
                                   const AcopSlipPatternControlParam& control,
                                   const std::map<std::string, std::string>& baseExtra,
                                   ExtraConditionState& state,
                                   const ReportDutyViolationFn& reportDutyViolation) {
    (void)duties;
    (void)control;

    if (param.GetExtraConditionType() != AcopSlipPatternExtraConditionType::Eur4B) {
        return true;
    }

    auto& s = state.eur4b;
    if (s.arrivalDay > 0 && dutyDay == s.arrivalDay) {
        std::map<std::string, std::string> extra = baseExtra;
        extra.emplace("reasons", "EUR_4B internal duty on arrival day");
        reportDutyViolation(
            duty,
            param,
            StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} EUR_4B only permits internal duties from the day after arrival.",
                                safeLabel(param.GetClause(), "UNKNOWN")),
            extra);
        return false;
    }

    if (isStandby) {
        s.standbyDays.insert(dutyDay);
        s.followDays.insert(TimeUtils::AddDay(dutyDay, 1));
    }

    auto& info = s.days[dutyDay];

    if (isStandby) {
        info.hasStandby = true;
        if (safeIndexOrEnd(info.firstStandbyIndex) == std::numeric_limits<std::size_t>::max()) {
            info.firstStandbyIndex = dutyIndex;
        }
    } else {
        info.hasNonStandby = true;
        info.hasNonStandbyOutsideSlip = info.hasNonStandbyOutsideSlip || !dutyIsWithinSlipLocation;
        if (safeIndexOrEnd(info.firstNonStandbyIndex) == std::numeric_limits<std::size_t>::max()) {
            info.firstNonStandbyIndex = dutyIndex;
        }
    }

    const time_t endLoc = duty.getEndTimeLocAct();
    if (endLoc > info.lastDutyEndLoc) {
        info.lastDutyEndLoc = endLoc;
        info.lastDutyIndex = dutyIndex;
    }

    if (info.hasStandby && info.hasNonStandby) {
        std::map<std::string, std::string> extra = baseExtra;
        extra.emplace("reasons", s.followDays.find(dutyDay) != s.followDays.end()
                                     ? "EUR_4B follow-day cannot mix standby and COP"
                                     : "EUR_4B standby day cannot mix standby and COP");
        reportDutyViolation(
            duty,
            param,
            StringUtils::Format(s.followDays.find(dutyDay) != s.followDays.end()
                                    ? param.GetViolationHeader() + " Clause {0:clause} EUR_4B requires the day after standby to contain either standby only or COP within Europe only."
                                    : param.GetViolationHeader() + " Clause {0:clause} EUR_4B requires standby day to contain standby only (other duties must be rostered on the following day).",
                                safeLabel(param.GetClause(), "UNKNOWN")),
            extra);
        return false;
    }

    if (!isStandby && s.followDays.find(dutyDay) != s.followDays.end()) {
        if (minutesOfDay < 6 * 60) {
            std::map<std::string, std::string> extra = baseExtra;
            extra.emplace("reasons", "EUR_4B next-day COP after 0600");
            extra.emplace("min_start_time", "06:00");
            reportDutyViolation(
                duty,
                param,
                StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} EUR_4B requires COP within Europe (day after standby) to start at/after 06:00 LT.",
                                    safeLabel(param.GetClause(), "UNKNOWN")),
                extra);
            return false;
        }
        if (!dutyIsWithinSlipLocation) {
            std::map<std::string, std::string> extra = baseExtra;
            extra.emplace("reasons", "EUR_4B next-day COP within Europe");
            reportDutyViolation(
                duty,
                param,
                StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} EUR_4B only permits COP within Europe on the day after standby.",
                                    safeLabel(param.GetClause(), "UNKNOWN")),
                extra);
            return false;
        }
    }

    return true;
}

bool ShouldBypassAllowedDutyCheckForNonStandbyDuty(const Duty& duty,
                                                  std::size_t dutyIndex,
                                                  time_t dutyDay,
                                                  int minutesOfDay,
                                                  bool isStandby,
                                                  bool dutyIsWithinSlipLocation,
                                                  const AcopSlipPatternRuleParam& param,
                                                  ExtraConditionState& state) {
    (void)dutyIndex;
    if (param.GetExtraConditionType() != AcopSlipPatternExtraConditionType::Eur4B) {
        return false;
    }
    if (isStandby || !dutyIsWithinSlipLocation || minutesOfDay < 6 * 60) {
        return false;
    }
    const auto& s = state.eur4b;
    if (s.followDays.find(dutyDay) == s.followDays.end()) {
        return false;
    }

    const std::string assignment = duty.getAssignment();
    const bool isPos = (assignment == "MVP");
    bool isFdp = false;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg != nullptr && seg->getIsOperating()) {
            isFdp = true;
            break;
        }
    }
    return isPos || isFdp;
}

bool Finalize(const std::vector<Duty*>& duties,
              const Duty& departDuty,
              const AcopSlipPatternRuleParam& param,
              const AcopSlipPatternControlParam& control,
              const std::map<std::string, std::string>& baseExtra,
              ExtraConditionState& state,
              const ReportDutyViolationFn& reportDutyViolation) {
    if (param.GetExtraConditionType() != AcopSlipPatternExtraConditionType::Eur4B) {
        return true;
    }

    auto& s = state.eur4b;
    if (s.standbyDays.empty()) {
        return true;
    }

    const time_t departStartLoc = departDuty.getStartTimeLocAct();
    const time_t departStartDay = departStartLoc > 0 ? TimeUtils::Truncate(departStartLoc, ChronoUnit::DAYS) : 0;

    auto findDayInfo = [&](time_t day) -> Eur4BState::DayInfo* {
        auto it = s.days.find(day);
        return it == s.days.end() ? nullptr : &it->second;
    };

    // For each standby day, enforce follow-day rules.
    for (time_t standbyDay : s.standbyDays) {
        const time_t followDay = TimeUtils::AddDay(standbyDay, 1);

        const Eur4BState::DayInfo* followInfo = findDayInfo(followDay);
        const bool hasInternalDutyOnFollowDay = (followInfo != nullptr && (followInfo->hasStandby || followInfo->hasNonStandby));

        // Option (ii)(2): If the follow-day is the slip depart day (COP out of Europe), allow depart after 0600 LT without DO in Europe.
        const bool departsOnFollowDay = (departStartDay > 0 && departStartDay == followDay);
        if (departsOnFollowDay) {
            if (departStartLoc > 0) {
                const int minutesOfDay = static_cast<int>((departStartLoc - departStartDay) / 60);
                if (minutesOfDay < 6 * 60) {
                    std::map<std::string, std::string> extra = baseExtra;
                    extra.emplace("reasons", "EUR_4B next-day depart COP after 0600");
                    extra.emplace("min_start_time", "06:00");
                    reportDutyViolation(
                        departDuty,
                        param,
                        StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} EUR_4B requires COP out of Europe (day after standby) to start at/after 06:00 LT.",
                                            safeLabel(param.GetClause(), "UNKNOWN")),
                        extra);
                    return false;
                }
            }

            if (hasInternalDutyOnFollowDay) {
                std::map<std::string, std::string> extra = baseExtra;
                extra.emplace("reasons", "EUR_4B depart day exclusivity");
                reportDutyViolation(
                    departDuty,
                    param,
                    StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} EUR_4B prohibits additional internal duties on the day-after-standby when departing Europe.",
                                        safeLabel(param.GetClause(), "UNKNOWN")),
                    extra);
                return false;
            }

            // Option (ii)(2): Departing Europe on the day-after-standby without an intervening day free of duty
            // requires 2 extra days off at base on return to base (applied by the caller).
            state.exdoDaysOffAtBase = std::max(state.exdoDaysOffAtBase, 2);
            state.exdoDaysOffAtBaseReason = "EUR_4B depart out of Europe day after standby";
            continue;
        }

        // Option (ii)(1): If follow-day has duties, it must be either:
        //   - further standby (standby only), or
        //   - any COP within Europe after 0600 LT (non-standby only).
        // Follow-day mutual exclusivity is enforced during observation; keep here as a safety net.

        // If follow-day has non-standby duties, they must start >=06:00 LT.
        // (Per-duty validation is done by the main rule's allowed-duty and time checks; here we cover the EUR_4B time rule.)
        if (followInfo != nullptr && followInfo->hasNonStandby) {
            if (followInfo->hasNonStandbyOutsideSlip) {
                const std::size_t reportIndex = followInfo->firstNonStandbyIndex;
                const Duty* reportDuty = reportIndex < duties.size() ? duties[reportIndex] : nullptr;
                if (reportDuty != nullptr) {
                    std::map<std::string, std::string> extra = baseExtra;
                    extra.emplace("reasons", "EUR_4B next-day COP within Europe");
                    reportDutyViolation(
                        *reportDuty,
                        param,
                        StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} EUR_4B only permits COP within Europe on the day after standby.",
                                            safeLabel(param.GetClause(), "UNKNOWN")),
                        extra);
                    return false;
                }
            }
            for (std::size_t i = 0; i < duties.size(); ++i) {
                const Duty* d = duties[i];
                if (d == nullptr) {
                    continue;
                }
                const time_t startLoc = d->getStartTimeLocAct();
                if (startLoc <= 0) {
                    continue;
                }
                const time_t day = TimeUtils::Truncate(startLoc, ChronoUnit::DAYS);
                if (day != followDay) {
                    continue;
                }
                const std::string assignment = d->getAssignment();
                const bool isStandby = std::find(control.standbyAssignments.begin(),
                                                 control.standbyAssignments.end(),
                                                 assignment) != control.standbyAssignments.end();
                if (isStandby) {
                    continue;
                }
                const int minutes = static_cast<int>((startLoc - day) / 60);
                if (minutes < 6 * 60) {
                    std::map<std::string, std::string> extra = baseExtra;
                    extra.emplace("reasons", "EUR_4B next-day COP after 0600");
                    extra.emplace("min_start_time", "06:00");
                    reportDutyViolation(
                        *d,
                        param,
                        StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} EUR_4B requires COP within Europe (day after standby) to start at/after 06:00 LT.",
                                            safeLabel(param.GetClause(), "UNKNOWN")),
                        extra);
                    return false;
                }
            }
        }

        // If follow-day has any duties (further standby or COP within Europe), require 1 DO after that day.
        if (hasInternalDutyOnFollowDay && followInfo != nullptr) {
            const std::size_t triggerIndex = followInfo->lastDutyIndex;
            const Duty* triggerDuty = triggerIndex < duties.size() ? duties[triggerIndex] : nullptr;
            if (triggerDuty != nullptr) {
                std::size_t nextDutyIndex = triggerIndex + 1;
                while (nextDutyIndex < duties.size() && duties[nextDutyIndex] == nullptr) {
                    ++nextDutyIndex;
                }
                if (nextDutyIndex < duties.size()) {
                    const Duty* nextDuty = duties[nextDutyIndex];
                    const time_t nextStartLoc = nextDuty != nullptr ? nextDuty->getStartTimeLocAct() : 0;
                    const time_t nextDay = nextStartLoc > 0 ? TimeUtils::Truncate(nextStartLoc, ChronoUnit::DAYS) : 0;

                    time_t restStartLocAfter = getRestStartLocAfterDuty(*triggerDuty, control);
                    if (restStartLocAfter <= 0) {
                        restStartLocAfter = triggerDuty->getEndTimeLocAct();
                    }
                    const time_t endDay = restStartLocAfter > 0 ? TimeUtils::Truncate(restStartLocAfter, ChronoUnit::DAYS) : 0;
                    const time_t requiredDay = endDay > 0 ? TimeUtils::AddDay(endDay, 2) : 0;  // 1 DO => next duty day >= day+2

                    if (requiredDay > 0 && nextDay > 0 && nextDay < requiredDay) {
                        std::map<std::string, std::string> extra = baseExtra;
                        extra.emplace("reasons", "EUR_4B DO after follow-day duty");
                        extra.emplace("do_after_duty_days", "1");
                        reportDutyViolation(
                            *nextDuty,
                            param,
                            StringUtils::Format(param.GetViolationHeader() + " Clause {0:clause} EUR_4B violates day-free-of-duty requirement after duty following standby.",
                                                safeLabel(param.GetClause(), "UNKNOWN")),
                            extra);
                        return false;
                    }
                }
            }
        }
    }

    return true;
}

}  // namespace AcopSlipPatternExtraConditions
