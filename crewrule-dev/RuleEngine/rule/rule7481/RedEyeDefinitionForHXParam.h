/**
 * @file RedEyeDefinitionForHXParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-14
**/

#ifndef _REDEYEDEFINITIONFORHXPARAM_H_
#define _REDEYEDEFINITIONFORHXPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateRedEyeDutyForHXRule;

class RedEyeDefinitionForHXParam : public RuleParam {
	friend class RedEyeDutyForHXRuleParam;
    friend class CalculateRedEyeDutyForHXRule;
private:
    explicit RedEyeDefinitionForHXParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7481;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 5;

    enum class ParamLocation {
		IS_BASE = 1,
        PICKUP_RANGE = 2,
        WOCL_START = 3,
        WOCL_END = 4,
		SEVERITY = 5
    };

    bool _isBase = false;//是否基地

    string _pickupRange;//Pickup时间范围，格式：HH:mm-HH:mm
    int _pickupLowerMinutes = 0;
    int _pickupUpperMinutes = 0;

    string _woclStart;//WOCL开始时间，格式：HH:mm
    int _woclStartMinutes = 0;

    string _woclEnd;//WOCL结束时间，格式：HH:mm
    int _woclEndMinutes = 0;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

};

#endif //_REDEYEDEFINITIONFORHXPARAM_H_
