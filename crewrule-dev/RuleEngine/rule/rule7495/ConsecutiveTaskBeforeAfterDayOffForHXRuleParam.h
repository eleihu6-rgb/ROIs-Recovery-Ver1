/**
 * @file ConsecutiveTaskBeforeAfterDayOffForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-03
**/

#ifndef _CONSECUTIVETASKBEOREAFTERDAYOFFFORHXRULEPARAM_H_
#define _CONSECUTIVETASKBEOREAFTERDAYOFFFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/TimeRangeMatchExpression.h"
#include <string>
#include <limits>

class LimitConsecutiveTaskBeforeAfterDayOffForHXRule;

class ConsecutiveTaskBeforeAfterDayOffForHXRuleParam : public RuleParam {
	friend class LimitConsecutiveTaskBeforeAfterDayOffForHXRule;
private:
    explicit ConsecutiveTaskBeforeAfterDayOffForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7495;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 10;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		ASSIGNMENT_GROUPS = 4,
		ASSIGNMENTS = 5,
		ATTRIBUTES = 6,
		CONSECUTIVE_DAYS_RANGE = 7,
		MIN_PRE_DAYS_OFF = 8,
		MIN_POST_DAYS_OFF = 9
    };

	//组员基地，多个使用|分割，支持*表示所有
	std::vector<std::string> _bases{};

	//组员级别，多个使用|分割，支持*表示所有
	std::vector<std::string> _ranks{};

	//组员机型，多个使用|分割，支持*表示所有
	std::vector<std::string> _fleets{};

	//组员Teams，多个使用|分割，支持*表示所有。
	std::vector<std::string> _teams{};

	//任务组，多个使用|分割，支持*表示所有。
	std::string _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;

	//任务，多个使用|分割，支持*表示所有。
	std::string _assignments{};
	AssignmentMatchExpression<Activity> _assignmentsMatch;

	//Pairing标签，多个使用|分割，支持*表示所有。
	std::string _strAttributes{};
	vector<string> _attributes;

	//连续天数，格式：n-m，支持*，支持*-*，包含二个语义：
	//例如：6-6或6-* 表示连续最大n天。*-6或7-13表示连续最少n天且最多m天。
	std::string _strConsecutiveDaysRange{};
	int _consecutiveDaysRangeLower{};
	int _consecutiveDaysRangeUpper{ std::numeric_limits<int>::max() };
	int _maxConsecutiveDays{};

	//前序最少Days Off
	std::string _strMinPreDaysOff{};
	int _minPreDaysOff{};

	//后序最少Days Off
	std::string _strMinPostDaysOff{};
	int _minPostDaysOff{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAssignment(const ROSTER* roster) const;

	bool MatchConsecutiveDaysRange(const int consecutiveDays) const;

	bool MatchAttributes(const ROSTER* roster) const;

public:
	bool MatchParam(const ROSTER* roster) const;
};

#endif //_CONSECUTIVETASKBEOREAFTERDAYOFFFORHXRULEPARAM_H_