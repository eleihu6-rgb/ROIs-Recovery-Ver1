/**
 * @file ReduceOffDutyPeriodAwayFromBaseRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _REDUCEOFFDUTYPERIODAWAYFROMBASERULEPARAM_H_
#define _REDUCEOFFDUTYPERIODAWAYFROMBASERULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam.h"
#include "ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam.h"

class ReduceOffDutyPeriodAwayFromBaseRule;

class ReduceOffDutyPeriodAwayFromBaseRuleParam : public RuleParam {
	friend class ReduceOffDutyPeriodAwayFromBaseRule;
public:

	vector<ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam>& GetFirstCaseParams() const {
		return this->_firstCaseParams;
	}

	void SetFirstCaseParams(const vector<ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam>& firstCaseParams) {
		this->_firstCaseParams = firstCaseParams;
	}

	vector<ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam>& GetSecondCaseParams() const {
		return this->_secondCaseParams;
	}

	void SetReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParams(const vector<ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam>& secondCaseParams) {
		this->_secondCaseParams = secondCaseParams;
	}

	bool Empty() const;

private:
    explicit ReduceOffDutyPeriodAwayFromBaseRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6102;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

	mutable vector<ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam> _firstCaseParams;
	mutable vector<ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam> _secondCaseParams;


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);


};

#endif //_REDUCEOFFDUTYPERIODAWAYFROMBASERULEPARAM_H_
