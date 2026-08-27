
#ifndef CREWRULE_CHECKMINIMUMRESTPERIODFORSQRULEPARAM_H
#define CREWRULE_CHECKMINIMUMRESTPERIODFORSQRULEPARAM_H

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "../period/WorkPeriod.h"
#include "../framework/utils/LocationMatchUtils.h"

struct MinRest7412ControlParam {
    // Pairing/duty service type filter: '*' (any), 'J' (passenger), 'F' (freighter).
    std::string serviceTypeUpper{"*"};

    // Fleet group filter: empty (any), otherwise require operating fleet group in this list.
    std::vector<std::string> fleetGroupsUpper{};

    // If non-empty, duties with assignment in this list are ignored as rest boundaries
    // (both in the middle and at the ends of a pairing).
    std::vector<std::string> ignoreIntermediateAssignmentsUpper{};

    // If true, all ignored intermediate duties reduce effective rest minutes and local night.
    bool reduceAllIntermediateAssignments{false};
    // Otherwise, only intermediate duties with assignment in this list reduce effective rest minutes and local night.
    std::vector<std::string> reduceRestAndLocalNightAssignmentsUpper{};
};

class CheckMinimumRestPeriodForSQRule;

class CheckMinimumRestPeriodForSQRuleParam : public RuleParam{
    friend class CheckMinimumRestPeriodForSQRule;
    friend class CalculateMinimumRestPeriodForSQRule;

private:
    explicit CheckMinimumRestPeriodForSQRuleParam(const Rule*rule): RuleParam(rule){};
    constexpr static unsigned int RuleFuncId = 7412;
    constexpr static char delimInParam = ',';

    enum class ParamLocation {
        CURRENT_DUTY_PATTERN = 0,
        NEXT_DUTY_PATTERN = 1,
        CURRENT_DUTY_ASSIGNMENTS = 2,
        NEXT_DUTY_ASSIGNMENTS = 3,
        DP_RANGE = 4,
        HAS_LOCAL_NIGHT = 5,
        MIN_REST_TIME = 6,
        INCREMENTAL_REST_PER_DP_HOUR = 7,
        MIN_LOCAL_NIGHT = 8
    };

    struct DutyPatternExpr {
        bool allowAny{true};
        LocationMatchUtils::LocationExpr depExpr{};
        LocationMatchUtils::LocationExpr arrExpr{};
    };

    //当前待检查Duty的Assignment， 多个使用 | 分割，支持*表示所有
    vector<std::string> _currentDutyAssignments;
    //当前Duty紧接下一个Duty的Assignment， 多个使用 | 分割，支持*表示所有
    vector<std::string> _nextDutyAssignments;
    DutyPatternExpr _currentDutyPatternExpr{};
    DutyPatternExpr _nextDutyPatternExpr{};
    //当前Duty和下一个Duty之间是否有本地夜晚，取值：Y/N
    bool _hasLocalNight{false};
    bool _hasLocalNightSpecified{false};
    //Current Duty和Next Duty之间需要满足最小休息时长（分钟）
    int _minRestTimeMinutes{0};
    //Current Duty和Next Duty之间需要满足本地夜晚数量，负数表示忽略
    int _minLocalNights{-1};

    // Optional: incremental rest formula driven by duty period length.
    // If configured (>0), required min rest = MIN REST TIME + floor((DP - DP_RANGE.lower) / 1h) * value.
    int _incrementalRestPerDpHourMinutes{0};

    void ParseParam(const std::string &paraString);

    void ParseParam(const DBRule &dbRule);

    bool MatchCurrentDutyAssignment(const Duty& duty) const;

    bool MatchNextDutyAssignment(const Duty& duty) const;
    bool MatchDutyPattern(const Duty& duty, const DutyPatternExpr& pattern) const;
    static DutyPatternExpr ParseDutyPatternExpr(const std::string& rawValue);

    //Parsed DP range bounds (minutes) from the HH:mm-HH:mm input.
    int _dpRangeMinutesLower{INT_MIN};
    int _dpRangeMinutesUpper{INT_MAX};
    std::string _dpRangeRaw;
public:
    bool MatchRule(const Duty& currDuty, const Duty* nextDuty) const;

    int GetMinRestTimeMinutes() const { return _minRestTimeMinutes; }
    int GetMinRestTimeMinutesForDp(int dpMinutes) const;
    int GetMinLocalNights() const { return _minLocalNights; }
    bool HasLocalNightRequirement() const { return _hasLocalNightSpecified; }
    bool HasLocalNight() const { return _hasLocalNight; }
    bool HasDpRangeFilter() const;
    std::string GetDpRangeText() const { return _dpRangeRaw; }
    std::string GetViolationCriteriaSuffix(int actualLocalNights) const;


};


#endif //CREWRULE_CHECKMINIMUMRESTPERIODFORSQRULEPARAM_H
