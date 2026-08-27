#pragma once
#ifndef _CHECKCONSECUTIVEROSTERFORITRULEPARAM_H_
#define _CHECKCONSECUTIVEROSTERFORITRULEPARAM_H_
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckConsecutiveRosterForItRuleParam;

class CheckConsecutiveRosterForItRuleParam : public RuleParam {
	friend class CheckConsecutiveRosterForItRule;
private:
	explicit CheckConsecutiveRosterForItRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7232;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 14;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		ATTRIBUTES = 4,
		ASSIGNMENTS = 5,
		ASSIGNMENT_GROUPS = 6,
		MAX_CONSECUTIVE_DUTIES = 7,
		CONSECUTIVE_DEFINITION = 8,
	};

	std::vector<std::string> _bases{};
	std::vector<std::string> _ranks{};
	std::vector<std::string> _fleets{};
	std::vector<std::string> _teams{};
	//任务类型,使用“|”分隔，表示多个值
	std::vector<std::string> _assignments{};
	AssignmentMatchExpression<Activity> _assignmentsMatch;
	//标签
	std::vector<std::string> _attributes{};
	//任务组类型,使用“|”分隔，表示多个值
	std::vector<std::string> _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;
	//最大连续工作次数
	int _maxConsecutiveTime{};
	//取值B（blank day）、O（Other Duties），支持多选，即B|O，不支持*
	std::string _consecutiveDefinition{};

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAssignmentGroup(const ROSTER* roster) const;

	bool MatchAssignment(const ROSTER* roster) const;


};

#endif // _CHECKCONSECUTIVEROSTERFORITRULEPARAM_H_
