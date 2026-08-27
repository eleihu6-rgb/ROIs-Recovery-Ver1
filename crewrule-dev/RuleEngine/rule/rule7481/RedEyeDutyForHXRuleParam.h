/**
 * @file RedEyeDutyForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-14
**/

#ifndef _REDEYEDUTYFORHXRULEPARAM_H_
#define _REDEYEDUTYFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "RedEyeDefinitionForHXParam.h"
#include "RedEyeDefinitionInDutyCycleForHXParam.h"

class CalculateRedEyeDutyForHXRule;

class RedEyeDutyForHXRuleParam : public RuleParam {
friend class CalculateRedEyeDutyForHXRule;
public:

	RedEyeDefinitionForHXParam& GetRedEyeDefinitionParam() const {
		return *this->_redEyeDefinitionForHXParam;
	}

	vector<RedEyeDefinitionInDutyCycleForHXParam>& GetRedEyeDefinitionInDutyCycleForHXParams() const {
		return this->_redEyeDefinitionInDutyCycleForHXParams;
	}

	void SetRedEyeDefinitionInDutyCycleForHXParams(const vector<RedEyeDefinitionInDutyCycleForHXParam>& redEyeDefinitionInDutyCycleForHXParams) {
		this->_redEyeDefinitionInDutyCycleForHXParams = redEyeDefinitionInDutyCycleForHXParams;
	}

private:
    explicit RedEyeDutyForHXRuleParam(const Rule* rule) :RuleParam(rule) {
		_redEyeDefinitionForHXParam = std::make_unique<RedEyeDefinitionForHXParam>(RedEyeDefinitionForHXParam(rule));
	};

    constexpr static unsigned int RuleFuncId = 7481;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 14;

	mutable std::unique_ptr<RedEyeDefinitionForHXParam> _redEyeDefinitionForHXParam;
	mutable vector<RedEyeDefinitionInDutyCycleForHXParam> _redEyeDefinitionInDutyCycleForHXParams;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);


};

#endif //_REDEYEDUTYFORHXRULEPARAM_H_
