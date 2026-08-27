/**
 * @file CheckMinRestBetweenConsecutiveDaysRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKMINRESTBETWEENCONSECUTIVEDAYSRULEPARAM_H_
#define _CHECKMINRESTBETWEENCONSECUTIVEDAYSRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckMinRestBetweenConsecutiveDaysRule;

class CheckMinRestBetweenConsecutiveDaysRuleParam : public RuleParam {
	friend class CheckMinRestBetweenConsecutiveDaysRule;
private:
	explicit CheckMinRestBetweenConsecutiveDaysRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6011;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		CONSECUTIVE_DAYS_BEFORE_REST = 4,
		CONSECUTIVE_DAYS_AFTER_REST = 5,
		ASSIGNMENTS_BEFORE_REST = 6,
		ASSIGNMENTS_AFTER_REST = 7,
		ASSIGNMENT_GROUPS_BEFORE_REST = 8,
		ASSIGNMENT_GROUPS_AFTER_REST = 9,
		MIN_REST_DAYS = 10,
		REST_ASSIGNMENTS = 11,
		REST_ASSIGNMENT_GROUPS = 12,
		BLANK_DAYS_COUNT = 13
	};

	//所属基地,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _bases{};
	//人员级别,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _ranks{};
	//人员机型,多个值使用“|”分隔并支持*通配。
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	//休息前连续任务的天数
	int _consecutiveDaysBeforeRest{};
	//休息后连续任务的天数
	int _consecutiveDaysAfterRest{};
	//休息前连续任务的assignment list，支持*和|分开的多个assignment
	std::vector<std::string> _assignmentsBeforeRest{};
	AssignmentMatchExpression<Activity> _assignmentsBeforeMatch;
	//休息后连续任务的assignment list，支持*和|分开的多个assignment
	std::vector<std::string> _assignmentsAfterRest{};
	AssignmentMatchExpression<Activity> _assignmentsAfterMatch;
	//休息前连续任务的assignment Groups，支持*和|分开的多个assignment Group
	std::vector<std::string> _assignmentGroupsBeforeRest{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsBeforeMatch;
	//休息后连续任务的assignment Groups，支持*和|分开的多个assignment Group
	std::vector<std::string> _assignmentGroupsAfterRest{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsAfterMatch;
	//最小休息天数，参考Rest assignments和blank days count参数定义
	int _minRestDays{};
	//计入休息天数的休息任务assignments，支持*和|分开的多个assignment
	std::vector<std::string> _restAssignments{};
	AssignmentMatchExpression<Activity> _assignmentsRestMatch;
	//休息任务的assignment groups，支持*和|分开的多个Groups
	std::vector<std::string> _restAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsRestMatch;
	//Y - 包括空白天，N不包括空白天
	std::string _blankDaysCount{};


	void ParseParam(const DBRule& dbRule);


	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchBeforeParam(const ROSTER* roster) const;

	bool MatchAfterParam(const ROSTER* roster) const;

	bool MatchRestParam(const ROSTER* roster) const;
};

#endif //_CHECKMINRESTBETWEENCONSECUTIVEDAYSRULEPARAM_H_
