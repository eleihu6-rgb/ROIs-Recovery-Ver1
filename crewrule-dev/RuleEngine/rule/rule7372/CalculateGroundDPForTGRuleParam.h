/**
 * @file CalculateGroundDPForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATEGROUNDDPFORTGRULEPARAM_H_
#define _CALCULATEGROUNDDPFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include <string>
#include <limits>

class CalculateGroundDPForTGRule;

class CalculateGroundDPForTGRuleParam : public RuleParam {
	friend class CalculateGroundDPForTGRule;
private:
	explicit CalculateGroundDPForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7372;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		ASSIGNMENT_GROUPS,
		ASSIGNMENTS,
		OFFSET,
		LIMIT,
		RATE
	};

	std::string _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;

	std::vector<std::string> _assignments{};

	int _offset{};

	int _limit{};

	double _rate{};

	void ParseParam(const DBRule& dbRule);


public:


};

#endif //_CALCULATEGROUNDDPFORTGRULEPARAM_H_
