/**
 * @file LimitConsecutiveDayMinRestForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-13
**/

#ifndef _LIMITCONSECUTIVEDAYMINRESTFORHXRULEPARAM_H_
#define _LIMITCONSECUTIVEDAYMINRESTFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>
#include "matcher/AssignmentGroupMatchExpression.h"

class LimitConsecutiveDayMinRestForHXRule;

class LimitConsecutiveDayMinRestForHXRuleParam : public RuleParam {
	friend class LimitConsecutiveDayMinRestForHXRule;
private:
    explicit LimitConsecutiveDayMinRestForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7489;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		CONSECUTIVE_DAYS = 1,
		ACC_STATE,
		REST_ASSIGNMENT_GROUPS,
		REST_DURATION,
		IS_PHYSIOLOGICAL_REST_INCLUDED_IN_COUNT_STATISTICS,
		LAYOVER_ASSIGNMENTS,
		MIN_LAYOVER_ASSIGNMENTS_DURATION,
		MAX_CONSECUTIVE_REST_DURATION_TIMES,
		MAX_TOTAL_REST_DURATION_TIMES,
		SEVERITY
    };

	//连续天数（基地日历日，基地时区）。格式：数值型
	std::string _strConsecutiveDays;
	int _consecutiveDays{};

	//适应状态(连续天数内任意一个duty的适应状态满足即可)。适应状态取值：A或U
	std::string _accState{};

	//休息任务组。多个值使用“|”分隔并支持*通配
	std::vector<std::string> _restAssignmentGroups;

	//休息时长。格式：HH:mm-HH:mm，取值范围：[n,m]
	std::string _restDurationRange{};
	int _restDurationRangeMinutesLower{};
	int _restDurationRangeMinutesUpper{};

	//休息时长是否需要包含生理休息时段(即本地夜晚)。取值：Y/N
	std::shared_ptr<bool> _isPhysiologicalRest{nullptr};

	//在Duty Layover安排的任务类型(一般地面任务)，多个使用|分割，支持*忽略
	std::string _strLayoverAssignments{};
	std::vector<std::string> _layoverAssignments{};

	//在Duty Layover安排的任务最小持续时长，格式：HH:mm，支持*忽略
	std::string _strMinLayoverAssignmentsDuration{};
	int _minLayoverAssignmentsDuration{};

	//最大满足休息时长的连续休息次数，*忽略该参数。格式：数值型
	std::shared_ptr<int> _maxConsecutiveRestTimes{nullptr};

	//最大满足休息时长的休息次数(不连续)，*忽略该参数。格式：数值型
	std::shared_ptr<int> _maxTotalRestTimes{nullptr};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

public:

	bool IsCheckLayoverAssignment() const;
};

#endif //_LIMITCONSECUTIVEDAYMINRESTFORHXRULEPARAM_H_
