#ifndef CREWRULE_MINRESTREQUIREMENTCALCULATOR_H
#define CREWRULE_MINRESTREQUIREMENTCALCULATOR_H

#include <ctime>

#include "CheckMinimumRestPeriodForSQRuleParam.h"

class MinRestRequirementCalculator {
public:
    // 返回不违规的最小休息分钟数
    static int Calculate(const CheckMinimumRestPeriodForSQRuleParam& ruleParam,
        int dpMinutes,
        time_t restStartUtc,
        int offsetMinutes,
        const std::string& zoneId);
};

#endif // CREWRULE_MINRESTREQUIREMENTCALCULATOR_H
