/**
 * @file WorkingHourForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _WORKINGHOURFOREVAFDRULEPARAM_H_
#define _WORKINGHOURFOREVAFDRULEPARAM_H_

#include <string>
#include <limits>

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "PairingWorkingHourForEvaFdRuleParam.h"
#include "GroundRosterWorkingHourForEvaFdRuleParam.h"

class CalculateWorkingHourInMandayForEvaFdRule;

class WorkingHourForEvaFdRuleParam : public RuleParam {
	friend class CalculateWorkingHourInMandayForEvaFdRule;
private:
    explicit WorkingHourForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7219;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 1;

	mutable vector<PairingWorkingHourForEvaFdRuleParam> _pairingWorkingHourParams;
	mutable vector<GroundRosterWorkingHourForEvaFdRuleParam> _groundRosterWorkingHourParams;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);
public:

	vector<PairingWorkingHourForEvaFdRuleParam>& GetPairingWorkingHourParams() const {
		return this->_pairingWorkingHourParams;
	}

	void SetPairingWorkingHourParams(const vector<PairingWorkingHourForEvaFdRuleParam>& pairingWorkingHourParams) {
		this->_pairingWorkingHourParams = pairingWorkingHourParams;
	}

	vector<GroundRosterWorkingHourForEvaFdRuleParam>& GetGroundRosterWorkingHourForEvaFdRuleParams() const {
		return this->_groundRosterWorkingHourParams;
	}


	void SetGroundRosterWorkingHourForEvaFdRuleParams(const vector<GroundRosterWorkingHourForEvaFdRuleParam>& groundRosterWorkingHourParams) {
		this->_groundRosterWorkingHourParams = groundRosterWorkingHourParams;
	}

	bool Empty() const;

};

#endif //_WORKINGHOURFOREVAFDRULEPARAM_H_
