#ifndef _CHECKSTANDBYCALLOUTDURATIONFOR5JRULEPARAM_H_
#define _CHECKSTANDBYCALLOUTDURATIONFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include <string>
#include <vector>

class CheckStandbyCalloutDurationFor5JRule;

class CheckStandbyCalloutDurationFor5JRuleParam : public RuleParam {
	friend class CheckStandbyCalloutDurationFor5JRule;
private:
	explicit CheckStandbyCalloutDurationFor5JRuleParam(const Rule* rule) : RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7387;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	enum class ParamLocation {
		STANDBY_ASSIGNMENT_GROUPS = 0,
		CALL_OUT_ASSIGNMENTS = 1,
		COMBINED = 2,
		MAX_DURATION = 3,
	};

	std::string _standbyAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _standbyAssignmentGroupsMatch;

	std::vector<std::string> _callOutAssignments{};

    //DP/FDP合并检查类型。取值：DP或FDP，配置*默认表示DP
	std::string _combinedType{};

	std::string _maxDuration{};
	int _maxDurationMinutes{ -1 };

	void ParseParam(const std::string& paramString);
	void ParseParam(const DBRule& dbRule);

	bool MatchStandbyAssignmentGroups(const ROSTER* roster) const;
	bool MatchCallOutAssignments(const std::string& assignment) const;
	bool MatchMergedStandbyCallout(const ROSTER* standbyRoster, const ROSTER* flyRoster) const;
	bool CheckMaxDuration(const ROSTER* standbyRoster, const ROSTER* flyRoster) const;
};

#endif //_CHECKSTANDBYCALLOUTDURATIONFOR5JRULEPARAM_H_
