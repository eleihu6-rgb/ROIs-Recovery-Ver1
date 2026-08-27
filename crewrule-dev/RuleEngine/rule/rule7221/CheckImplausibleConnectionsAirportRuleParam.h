#pragma once
/**
 * @file CheckImplausibleConnectionsAirportRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-08-19
**/

#ifndef _CHECKIMPLAUSIBLECONNECTIONSAIRPORTRULEPARAM_H_
#define _CHECKIMPLAUSIBLECONNECTIONSAIRPORTRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckImplausibleConnectionsAirportRuleParam;
class CheckImplausibleConnectionsRuleParam;

class CheckImplausibleConnectionsAirportRuleParam : public RuleParam {
    friend class CheckImplausibleConnectionsRule;
    friend class CheckImplausibleConnectionsRuleParam;
private:
    

    constexpr static unsigned int RuleFuncId = 7221;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 1;

    enum class ParamLocation {
        NO_WARNING_GROUPS = 1,
    };

public:
    explicit CheckImplausibleConnectionsAirportRuleParam(const Rule* rule) :RuleParam(rule) {};

    multimap<string, string> _noWarningAirportPairs;//不警告前后base连续问题的组合，如 <TPE,TSA>

    void ParseParam(const DBRule& dbRule);

};

#endif //_CHECKIMPLAUSIBLECONNECTIONSAIRPORTRULEPARAM_H_
