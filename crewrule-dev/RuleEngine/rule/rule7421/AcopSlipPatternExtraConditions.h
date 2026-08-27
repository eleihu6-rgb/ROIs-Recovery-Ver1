/**
 * @file AcopSlipPatternExtraConditions.h
 */

#pragma once

#include <cstddef>
#include <ctime>
#include <functional>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "AcopSlipPatternRuleParam.h"

class Duty;

namespace AcopSlipPatternExtraConditions {

using ReportDutyViolationFn = std::function<void(const Duty&,
                                                 const AcopSlipPatternRuleParam&,
                                                 const std::string&,
                                                 const std::map<std::string, std::string>&)>;

struct Eur4BState {
    time_t arrivalDay{0};

    struct DayInfo {
        bool hasStandby{false};
        bool hasNonStandby{false};
        bool hasNonStandbyOutsideSlip{false};

        std::size_t firstStandbyIndex{static_cast<std::size_t>(-1)};
        std::size_t firstNonStandbyIndex{static_cast<std::size_t>(-1)};

        std::size_t lastDutyIndex{static_cast<std::size_t>(-1)};
        time_t lastDutyEndLoc{0};
    };

    // Any local day within the slip window that contains at least one standby duty.
    std::set<time_t> standbyDays{};

    // The local day immediately following each standby day (standbyDay + 1).
    std::set<time_t> followDays{};

    // Internal duties (within slip window) bucketed by local day.
    std::map<time_t, DayInfo> days{};
};

struct ExtraConditionState {
    AcopSlipPatternExtraConditionType type{AcopSlipPatternExtraConditionType::None};
    Eur4BState eur4b{};
    int atdoDaysOffAtBase{0};
    std::string atdoDaysOffAtBaseReason{};

    // Extra days off are applied as an *extension* on top of the existing post-duty rest (7466-style).
    int exdoDaysOffAtBase{0};
    std::string exdoDaysOffAtBaseReason{};
};

ExtraConditionState InitState(const std::vector<Duty*>& duties,
                              std::size_t arriveDutyIndex,
                              std::size_t departIndex,
                              time_t arrivalDay,
                              const AcopSlipPatternRuleParam& param,
                              const AcopSlipPatternControlParam& control);

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
                                   const ReportDutyViolationFn& reportDutyViolation);

bool ShouldBypassAllowedDutyCheckForNonStandbyDuty(const Duty& duty,
                                                  std::size_t dutyIndex,
                                                  time_t dutyDay,
                                                  int minutesOfDay,
                                                  bool isStandby,
                                                  bool dutyIsWithinSlipLocation,
                                                  const AcopSlipPatternRuleParam& param,
                                                  ExtraConditionState& state);

bool Finalize(const std::vector<Duty*>& duties,
              const Duty& departDuty,
              const AcopSlipPatternRuleParam& param,
              const AcopSlipPatternControlParam& control,
              const std::map<std::string, std::string>& baseExtra,
              ExtraConditionState& state,
              const ReportDutyViolationFn& reportDutyViolation);

}  // namespace AcopSlipPatternExtraConditions
