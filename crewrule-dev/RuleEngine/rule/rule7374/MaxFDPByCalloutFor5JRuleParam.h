/**
 * @file MaxFDPByCalloutFor5JRuleParam.h
 * @brief
 * @author OpenAI
 * @version 1.0
 * @date 2026-05-28
**/

#ifndef _MAXFDPBYCALLOUTFOR5JRULEPARAM_H_
#define _MAXFDPBYCALLOUTFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include <string>

class CalculateMaxFDPByCalloutFor5JRule;

class MaxFDPByCalloutFor5JRuleParam : public RuleParam {
	friend class CalculateMaxFDPByCalloutFor5JRule;
private:
	explicit MaxFDPByCalloutFor5JRuleParam(const Rule* rule) : RuleParam(rule) {}

	constexpr static unsigned int RuleFuncId = 7374;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	enum class ParamLocation {
		ASSIGNMENT_GROUPS = 0,
		STANDBY_START_RANGE = 1,
		STANDBY_OVERLAP_RANGE = 2,
		STANDBY_LENGTH_THRESHOLD = 3,
	};

	std::string _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;

	std::string _standbyStartRange{};
	int _standbyStartRangeStartMinutes{ -1 };
	int _standbyStartRangeEndMinutes{ -1 };

	std::string _standbyOverlapRange{};
	int _standbyOverlapRangeStartMinutes{ -1 };
	int _standbyOverlapRangeEndMinutes{ -1 };

	std::string _standbyLengthThreshold{};
	int _standbyLengthThresholdMinutes{ -1 };

	void ParseParam(const std::string& paramString);
	void ParseParam(const DBRule& dbRule);

	bool MatchAssignmentGroup(const ROSTER* standbyRoster) const;
	bool ShouldIgnoreOverlapByStandbyStart(const ROSTER* standbyRoster) const;

public:
	bool MatchParam(const ROSTER* standbyRoster, const ROSTER* flyRoster, const Duty& duty) const;
};

#endif //_MAXFDPBYCALLOUTFOR5JRULEPARAM_H_
