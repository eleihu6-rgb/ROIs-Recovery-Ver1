#pragma once

#ifndef _CHECKMAXDURATIONFROMSTANDBYTOFLIGHTDUTYENDFORHXRULEPARAM_H_
#define _CHECKMAXDURATIONFROMSTANDBYTOFLIGHTDUTYENDFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include <string>
#include <limits>

class CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam;

class CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam : public RuleParam {
	friend class CheckMaxDurationFromStandbyToFlightDutyEndForHXRule;
private:
	explicit CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7487;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 11;

	enum class ParamLocation {
		STANDBY_ASSIGNMENT_GROUPS = 0,
		STANDBY_ASSIGNMENTS = 1,
		FLIGHT_WITHIN_THE_PLANNED_STANDBY = 2,
		CALL_OUT_TO_FLIGHT_GAP_RANGE = 3,
		MAX_DURATION_FROM_STANDBY_TO_FLIGHT_DUTY_END = 4,
	};
	
	std::string _standbyAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _standbyAssignmentGroupsMatch;

	std::vector<std::string> _standbyAssignments{};

	std::string _flightWithinThePlannedStandby{};

	std::string _callOutToFlightGapRange{};
	int _callOutToFlightGapLower{};
	int _callOutToFlightGapUpper{};

	std::string _maxDurationFromStandbyToFlightDutyEnd{};
	int _maxDurationFromStandbyToFlightDutyEndMinutes{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchStandbyAssignmentGroups(const ROSTER* roster) const;

	bool MatchStandbyAssignments(const string assignment) const;

	bool MatchFlightTimeInPlannedStandby(const ROSTER* roster, const ROSTER* nextRoster) const;

	bool MatchCallOutToFlightGap(const ROSTER* roster, const ROSTER* nextRoster) const;

	bool CheckMaxDurationFromStandbyToFlightDutyEnd(const ROSTER* roster, const ROSTER* nextRoster) const;
};

#endif //_CHECKMAXDURATIONFROMSTANDBYTOFLIGHTDUTYENDFORHXRULEPARAM_H_
