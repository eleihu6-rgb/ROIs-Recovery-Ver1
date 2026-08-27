/**
 * @file CheckMinNumberOfDaysOffForPRRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CheckMinNumberOfDaysOffForPRRulePARAM_H_
#define _CheckMinNumberOfDaysOffForPRRulePARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "CheckMinNumberOfDaysOffBasicForPRRuleParam.h"
#include "CheckMinNumberOfDaysOffPatternForPRRuleParam.h"

class CheckMinNumberOfDaysOffForPRRule;

class CheckMinNumberOfDaysOffForPRRuleParam : public RuleParam {
	friend class CheckMinNumberOfDaysOffForPRRule;
public:

	vector<CheckMinNumberOfDaysOffBasicForPRRuleParam>& GetFirstCaseParams() const {
		return this->_firstCaseParams;
	}

	void SetFirstCaseParams(const vector<CheckMinNumberOfDaysOffBasicForPRRuleParam>& firstCaseParams) {
		this->_firstCaseParams = firstCaseParams;
	}

	vector<CheckMinNumberOfDaysOffPatternForPRRuleParam>& GetSecondCaseParams() const {
		return this->_secondCaseParams;
	}

	void SetCheckMinNumberOfDaysOffPatternForPRRuleParams(const vector<CheckMinNumberOfDaysOffPatternForPRRuleParam>& secondCaseParams) {
		this->_secondCaseParams = secondCaseParams;
	}

	bool Empty() const;

	void GetPatternList(std::vector<std::vector<unsigned char>>& result, std::vector<std::string> paramList) const;


private:
	explicit CheckMinNumberOfDaysOffForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7325;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	mutable vector<CheckMinNumberOfDaysOffBasicForPRRuleParam> _firstCaseParams;
	mutable vector<CheckMinNumberOfDaysOffPatternForPRRuleParam> _secondCaseParams;


	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

};

#endif //_CheckMinNumberOfDaysOffForPRRulePARAM_H_
