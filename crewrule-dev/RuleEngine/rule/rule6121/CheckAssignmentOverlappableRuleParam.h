/**
 * @file CheckAssignmentOverlappableRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CheckAssignmentOverlappableRulePARAM_H_
#define _CheckAssignmentOverlappableRulePARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "CheckAssignmentOverlappableFirstRuleParam.h"
#include "CheckAssignmentOverlappableSecondRuleParam.h"

class CheckAssignmentOverlappableRule;

class CheckAssignmentOverlappableRuleParam : public RuleParam {
	friend class CheckAssignmentOverlappableRule;
public:

	vector<CheckAssignmentOverlappableFirstRuleParam>& GetFirstCaseParams() const {
		return this->_firstCaseParams;
	}

	void SetFirstCaseParams(const vector<CheckAssignmentOverlappableFirstRuleParam>& firstCaseParams) {
		this->_firstCaseParams = firstCaseParams;
	}

	vector<CheckAssignmentOverlappableSecondRuleParam>& GetSecondCaseParams() const {
		return this->_secondCaseParams;
	}

	void SetCheckAssignmentOverlappableRuleSecondCaseParams(const vector<CheckAssignmentOverlappableSecondRuleParam>& secondCaseParams) {
		this->_secondCaseParams = secondCaseParams;
	}

	bool Empty() const;

private:
	explicit CheckAssignmentOverlappableRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 6121;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	mutable vector<CheckAssignmentOverlappableFirstRuleParam> _firstCaseParams;
	mutable vector<CheckAssignmentOverlappableSecondRuleParam> _secondCaseParams;


	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchAssignmentOverlappable(const string prevAssignment, const string nextAssignment) const;

	bool OnlyCheckFirstParam() const;
};

#endif //_CheckAssignmentOverlappableRulePARAM_H_
