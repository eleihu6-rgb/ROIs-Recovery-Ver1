/**
 * @file MinWorkDaysBetweenAssignmentsForHXRuleParam.h
 * @brief 7496法规参数类
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-05
**/

#ifndef _MINWORKDAYSBETWEENASSIGNMENTSFORHXRULEPARAM_H_
#define _MINWORKDAYSBETWEENASSIGNMENTSFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class LimitMinWorkDaysBetweenAssignmentsForHXRule;

class MinWorkDaysBetweenAssignmentsForHXRuleParam : public RuleParam {
	friend class LimitMinWorkDaysBetweenAssignmentsForHXRule;
private:
    explicit MinWorkDaysBetweenAssignmentsForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7496;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 10;

    enum class ParamLocation {
		CONSECUTIVE_ASSIGNMENT_GROUP_A = 1,
		CONSECUTIVE_ASSIGNMENT_A,
		CONSECUTIVE_ASSIGNMENT_GROUP_B,
		CONSECUTIVE_ASSIGNMENT_B,
		DIRECTIONAL,
		MIN_WORKING_DAYS,
		WORKING_ASSIGNMENT_GROUP,
		WORKING_ASSIGNMENTS,
		COUNT_BLANK_DAY
    };

	//连续的任务组A，1个也算连续，支持"|"分割多个，支持*
	std::string _strConsecutiveAssignmentGroupA{};
	AssignmentGroupMatchExpression<Activity> _consecutiveAssignmentGroupAMatch;

	//连续的任务A，1个也算连续，支持"|"分割多个，支持*
	std::string _strConsecutiveAssignmentA{};
	AssignmentMatchExpression<Activity> _consecutiveAssignmentAMatch;

	//连续的任务组B，1个也算连续，支持"|"分割多个，支持*
	std::string _strConsecutiveAssignmentGroupB{};
	AssignmentGroupMatchExpression<Activity> _consecutiveAssignmentGroupBMatch;

	//连续的任务B，1个也算连续，支持"|"分割多个，支持*
	std::string _strConsecutiveAssignmentB{};
	AssignmentMatchExpression<Activity> _consecutiveAssignmentBMatch;

	//方向：Y:定向，N：双向
	std::shared_ptr<bool> _isDirectional{nullptr};

	//最小工作天数，格式数字。必填
	int _minWorkingDays{};

	//工作任务组, 支持"|"分割多个,支持*
	std::string _strWorkingAssignmentGroup{};
	AssignmentGroupMatchExpression<Activity> _workingAssignmentGroupMatch;

	//工作任务类型, 支持"|"分割多个,支持*
	std::string _strWorkingAssignments{};
	AssignmentMatchExpression<Activity> _workingAssignmentsMatch;

	//空白天是否计算工作天，取值：Y/N，RO优化时设置Y，tracking时设置N
	std::shared_ptr<bool> _isCountBlankDay{nullptr};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断roster是否匹配连续任务A的条件
	bool MatchConsecutiveAssignmentA(const ROSTER* roster) const;

	//判断roster是否匹配连续任务B的条件
	bool MatchConsecutiveAssignmentB(const ROSTER* roster) const;

	//判断roster是否匹配工作任务的条件
	bool MatchWorkingAssignment(const ROSTER* roster) const;

public:
};

#endif //_MINWORKDAYSBETWEENASSIGNMENTSFORHXRULEPARAM_H_