#pragma once
/**
 * @file CheckImplausibleConnectionsRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-08-19
**/

#ifndef _CHECKIMPLAUSIBLECONNECTIONSRULEPARAM_H_
#define _CHECKIMPLAUSIBLECONNECTIONSRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "CheckImplausibleConnectionsAirportRuleParam.h"
#include "CheckImplausibleConnectionsAssignmentRuleParam.h"

class CheckImplausibleConnectionsRuleParam;

class CheckImplausibleConnectionsRuleParam : public RuleParam {
    friend class CheckImplausibleConnectionsRule;

public:

	const std::vector<CheckImplausibleConnectionsAirportRuleParam>& GetAirportParams() const {
		return this->_airportParams;
	}

	void SetAirportParams(const std::vector<CheckImplausibleConnectionsAirportRuleParam> airportParams) {
		this->_airportParams = airportParams;
	}

	std::vector<CheckImplausibleConnectionsAssignmentRuleParam> GetAssignmentParams() const {
		return this->_assignmentParams;
	}

	void SetAssignmentParams(const std::vector<CheckImplausibleConnectionsAssignmentRuleParam> assignmentParams) {
		this->_assignmentParams = assignmentParams;
	}


private:
    explicit CheckImplausibleConnectionsRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7221;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 1;

	mutable std::vector<CheckImplausibleConnectionsAirportRuleParam> _airportParams;
	mutable std::vector<CheckImplausibleConnectionsAssignmentRuleParam> _assignmentParams;

    void ParseParam(const DBRule& dbRule);

};

#endif //_CHECKIMPLAUSIBLECONNECTIONSRULEPARAM_H_
