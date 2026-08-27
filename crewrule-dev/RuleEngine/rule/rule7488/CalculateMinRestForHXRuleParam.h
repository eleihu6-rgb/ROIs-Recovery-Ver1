/**
 * @file CalculateMinRestForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/

#ifndef _CALCULATEMINRESTFORHXRULEPARAM_H_
#define _CALCULATEMINRESTFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

#include "StandardMinRestForHXRuleParam.h"
#include "AdjustMinRestForHXRuleParam.h"

class CalculateMinRestForHXRule;

class CalculateMinRestForHXRuleParam : public RuleParam {
friend class CalculateMinRestForHXRule;
public:

	vector<StandardMinRestForHXRuleParam>& GetStandardMinRestForHXRuleParams() const {
		return this->_standardMinRestForHXRuleParams;
	}

	vector<AdjustMinRestForHXRuleParam>& GetAdjustMinRestForHXRuleParams() const {
		return this->_adjustMinRestForHXRuleParams;
	}

	void SetDailyAdjustmentForCARSParams(const vector<AdjustMinRestForHXRuleParam>& adjustMinRestForHXRuleParams) {
		this->_adjustMinRestForHXRuleParams = adjustMinRestForHXRuleParams;
	}

	bool Empty() const;

private:
    explicit CalculateMinRestForHXRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7488;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 1;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);


private:

	mutable vector<StandardMinRestForHXRuleParam> _standardMinRestForHXRuleParams;
	mutable vector<AdjustMinRestForHXRuleParam> _adjustMinRestForHXRuleParams;
};

#endif //_CALCULATEMINRESTFORHXRULEPARAM_H_
