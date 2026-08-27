/**
 * @file FdpAndFtDiscretionForFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculateFdpAndFtDiscretionForFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateFdpAndFtDiscretionForFdRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateFdpAndFtDiscretionForFdRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateFdpAndFtDiscretionForFdRule::CalculateDuty(vector<Duty*> duties) {
	if (duties.empty()) {
		return;
	}
	if (_ruleParams.empty()) {
		return;
	}
	for (auto& duty : duties) {
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(duty, duties, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateFdpAndFtDiscretionForFdRule::CalculateDuty(Duty* currDuty, vector<Duty*>& duties, const FdpAndFtDiscretionForFdRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*currDuty, duties)) {
		next = false;

		if (!ruleParam._fdpMaxExtension.empty() && ruleParam.MatchOnlyLastDuty(*currDuty, duties) && currDuty->supportDiscretionType(DiscretionType::FDP)) {
			if (currDuty->getManualFdpDiscretion() == 0 || currDuty->getManualFdpDiscretion() > ruleParam._fdpMaxExtensionMinutes) {
				currDuty->setManualFdpDiscretion(ruleParam._fdpMaxExtensionMinutes);
			}
		}

		if (!ruleParam._ftMaxExtension.empty() && ruleParam.MatchOnlyLastDuty(*currDuty, duties) && currDuty->supportDiscretionType(DiscretionType::FT)) {
			if (currDuty->getManualFtDiscretion() == 0 || currDuty->getManualFtDiscretion() > ruleParam._ftMaxExtensionMinutes) {
				currDuty->setManualFtDiscretion(ruleParam._ftMaxExtensionMinutes);
			}
		}

		if (!ruleParam._dpMaxExtension.empty() && ruleParam.MatchOnlyLastDuty(*currDuty, duties) && currDuty->supportDiscretionType(DiscretionType::DP)) {
			if (currDuty->getManualDpDiscretion() == 0 || currDuty->getManualDpDiscretion() > ruleParam._dpMaxExtensionMinutes) {
				currDuty->setManualDpDiscretion(ruleParam._dpMaxExtensionMinutes);
			}
		}
	}
	return next;
}

void CalculateFdpAndFtDiscretionForFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(FdpAndFtDiscretionForFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(FdpAndFtDiscretionForFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}