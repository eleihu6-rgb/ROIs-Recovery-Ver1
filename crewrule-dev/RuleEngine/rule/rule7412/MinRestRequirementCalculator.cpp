#include "MinRestRequirementCalculator.h"

#include <limits>

#include "../utils/DutyUtils.h"

int MinRestRequirementCalculator::Calculate(const CheckMinimumRestPeriodForSQRuleParam& ruleParam,
                                            int dpMinutes,
                                            time_t restStartUtc,
                                            int offsetMinutes,
                                            const std::string& zoneId) {
    const int minRestTimeMinutes = ruleParam.GetMinRestTimeMinutesForDp(dpMinutes);
    time_t minRestEndByCheck = DutyUtils::GetRestEndTimeMeetingMinRestAndNumLocalNights(
            restStartUtc,
            offsetMinutes,
            zoneId,
            minRestTimeMinutes,
            ruleParam.GetMinLocalNights()
    );
    int requiredRestMinutes = static_cast<int>((minRestEndByCheck - restStartUtc) / 60);

    time_t minRestEndByFilterInclusive = restStartUtc;
    time_t maxRestEndByFilterExclusive = std::numeric_limits<time_t>::max();

    if (ruleParam.HasLocalNightRequirement()) {
        if (ruleParam.HasLocalNight()) {
            minRestEndByFilterInclusive = DutyUtils::GetRestEndTimeMeetingNumLocalNights(
                restStartUtc, offsetMinutes, zoneId, 1);
        } else {
            maxRestEndByFilterExclusive = DutyUtils::GetRestEndTimeMeetingNumLocalNights(
                restStartUtc, offsetMinutes, zoneId, 1);
        }
    }

    if (maxRestEndByFilterExclusive <= minRestEndByCheck) {
        requiredRestMinutes = static_cast<int>((maxRestEndByFilterExclusive - restStartUtc) / 60);
    }
    if (minRestEndByFilterInclusive > minRestEndByCheck) {
        requiredRestMinutes = 0;
    }

    return requiredRestMinutes;
}
