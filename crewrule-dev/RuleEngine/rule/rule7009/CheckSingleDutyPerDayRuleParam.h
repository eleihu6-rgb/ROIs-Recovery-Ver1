#pragma once

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckSingleDutyPerDayRuleParam;

class CheckSingleDutyPerDayRuleParam : public RuleParam {
	friend class CheckSingleDutyPerDayRule;
private:
	explicit CheckSingleDutyPerDayRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7009;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 11;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		ASSIGNMENTS = 4,
		ASSIGNMENT_GROUPS = 5,
		FLEET_GROUPS = 6,
		LEVEL = 7,
		PREV_ROSTER_THRESHOLD = 8,
		PREV_ROSTER_START = 9,
		NEXT_ROSTER_END = 10
	};

	std::vector<std::string> _bases{};
	std::vector<std::string> _ranks{};
	std::vector<std::string> _fleets{};
	std::vector<std::string> _teams{};
	string _prevRosterStart{};
	string _nextRosterEnd{};
	
	//前一个任务完成或开始时间阈值，与prevRosterStart配合使用。格式：HH:MM，同时支持 * 即忽略该条件
	string _prevRosterThreshold;
	int _prevRosterThresholdMinutes{};

	//任务类型,使用“|”分隔，表示多个值
	std::vector<std::string> _assignmentsA{};
	AssignmentMatchExpression<Activity> _assignmentsAMatch;

	std::vector<std::string> _assignmentGroupsA{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsAMatch;

	//任务类型,使用“|”分隔，表示多个值
	std::vector<std::string> _assignmentsB{};
	AssignmentMatchExpression<Activity> _assignmentsBMatch;

	std::vector<std::string> _assignmentGroupsB{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsBMatch;

	//机型组列表。多个使用|分割并支持*
	std::vector<std::string> _fleetGroups{};

	//任务层级。取值：R、D或S，分别代表Roster(Pairing)、Duty和Flight。
	std::string _level{"R"};
	// TIME ZONE: LOCAL/L (default) or BASE/B
	std::string _timeZone{"LOCAL"};


	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAssignmentA(const Activity* activity) const;
	bool MatchAssignmentB(const Activity* activity) const;

	bool MatchFleetGroups(const ROSTER* roster) const;

	bool MatchFleetGroups(const Duty* duty) const;

	bool MatchFleetGroups(const Segment* segment) const;

};
