#pragma once
/**
 * @file CheckImplausibleConnectionsAssignmentRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-08-19
**/

#ifndef _CHECKIMPLAUSIBLECONNECTIONSASSIGNMENTRULEPARAM_H_
#define _CHECKIMPLAUSIBLECONNECTIONSASSIGNMENTRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckImplausibleConnectionsAssignmentRuleParam;
class CheckImplausibleConnectionsRuleParam;

class CheckImplausibleConnectionsAssignmentRuleParam : public RuleParam {
    friend class CheckImplausibleConnectionsRule;
    friend class CheckImplausibleConnectionsRuleParam;
private:
    

    constexpr static unsigned int RuleFuncId = 7221;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 1;

    enum class ParamLocation {
        EXCEPTION_ASSIGNMENTS = 1,
        EXCEPTION_ASSIGNMENT_GROUPS = 2
    };

    void ParseParam(const DBRule& dbRule);


public:
    explicit CheckImplausibleConnectionsAssignmentRuleParam(const Rule* rule) :RuleParam(rule) {};
    std::vector<std::string> _exceptionAssignments;
    std::vector<std::string> _exceptionAssignmentGroups;
    bool MatchAssignment(const std::string assignment) const;
    
};

#endif //_CHECKIMPLAUSIBLECONNECTIONSASSIGNMENTRULEPARAM_H_
