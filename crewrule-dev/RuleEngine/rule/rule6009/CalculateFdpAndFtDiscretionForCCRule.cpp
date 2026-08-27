/**
 * @file FdpAndFtDiscretionForCCRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculateFdpAndFtDiscretionForCCRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateFdpAndFtDiscretionForCCRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateFdpAndFtDiscretionForCCRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateFdpAndFtDiscretionForCCRule::CalculateDuty(vector<Duty*> duties) {
	if (duties.empty()) {
		return;
	}
	if (_ruleParams.empty()) {
		return;
	}
	Duty *prevDuty = nullptr;
	for (auto& duty : duties) {
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(prevDuty, duty, ruleParam)) {
				break;
			}
		}
		prevDuty = duty;
	}
}

bool CalculateFdpAndFtDiscretionForCCRule::CalculateDuty(Duty* prevDuty, Duty* currDuty, const FdpAndFtDiscretionForCCRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(prevDuty, currDuty)) {
		next = false;

		if (currDuty->supportDiscretionType(DiscretionType::FDP)) {
			currDuty->setManualFdpDiscretion(ruleParam._fdpMaxExtensionMinutes);
		}

		if (currDuty->supportDiscretionType(DiscretionType::FT)) {
			currDuty->setManualFtDiscretion(ruleParam._ftMaxExtensionMinutes);
		}
	}
	return next;
}

void CalculateFdpAndFtDiscretionForCCRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(FdpAndFtDiscretionForCCRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(FdpAndFtDiscretionForCCRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}