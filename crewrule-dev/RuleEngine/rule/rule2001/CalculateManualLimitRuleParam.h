/**
 * @file CalculateManualLimitRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-04
**/

#ifndef _CALCULATEMANUALLIMITRULEPARAM_H_
#define _CALCULATEMANUALLIMITRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateManualLimitRule;

class CalculateManualLimitRuleParam : public RuleParam {
friend class CalculateManualLimitRule;
private:
    explicit CalculateManualLimitRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 2001;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 3;

    enum class ParamLocation {
		TYPE = 1,
        ACTIVE,
		SEVERITY
    };

    //航班前后和强制连接的类型。取值：MaxFDP、MinREST、MaxDP等
    std::string _type{};

    //本条规则是否激活。取值：Y/N。Y-本条规则生效，N-忽略本条规则
    bool _active{ true };

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

};

#endif //_CalculateManualLimitRULEPARAM_H_
