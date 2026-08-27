/**
 * @file RedEyeDefinitionInDutyCycleForHXParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-14
**/

#ifndef _REDEYEDEFINITIONINDUTYCYCLEFORHXPARAM_H_
#define _REDEYEDEFINITIONINDUTYCYCLEFORHXPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateRedEyeDutyForHXRule;

class RedEyeDefinitionInDutyCycleForHXParam : public RuleParam {
	friend class RedEyeDutyForHXRuleParam;
	friend class CalculateRedEyeDutyForHXRule;
private:
    explicit RedEyeDefinitionInDutyCycleForHXParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7481;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		IS_BEFORE_FDP = 1,
		IS_AFTER_FDP = 2,
		EXCLUDE_ASSIGNMENTS = 3,
		SEVERITY = 4
    };

	//当前Duty执勤时段在LNP之内并且在第一个FDP任务之前(Late Night Period就是表1的WOCL范围)
	bool _isBeforeFDP = false;

	//当前Duty执勤时段在LNP之内并且在第一个FDP任务之后。
	bool _isAfterFDP = false;

	//排除的任务类型，多个值使用“|”分隔并支持*通配
	vector<string> _excludeAssignments;

    void ParseParam(const std::string& paramString);

public:
	void ParseParam(const DBRule& dbRule);
	
	// This is function is for rule 6038 to generate one objecct becasue the constructer is private
	static RedEyeDefinitionInDutyCycleForHXParam GetInstance(const Rule* rule) {
		return RedEyeDefinitionInDutyCycleForHXParam(rule);
	}
};

#endif //_REDEYEDEFINITIONINDUTYCYCLEFORHXPARAM_H_
