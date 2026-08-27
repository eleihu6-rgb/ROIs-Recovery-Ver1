/**
 * @file CalculateMaxDutyPeriodRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculateMaxDutyPeriodRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"	
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"


void CalculateMaxDutyPeriodRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateMaxDutyPeriodRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateMaxDutyPeriodRule::CalculateDuty(const vector<Duty*>& duties) {
	if (duties.empty()) {
		return;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (auto& duty : duties) {
		for (const auto& ruleParam : _ruleParams) {
			if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}

			if (!CalculateDuty(duty, base, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateMaxDutyPeriodRule::CalculateDuty(Duty* duty, const std::string& base, const LimitMaxDutyPeriodRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*duty, base)) {
		//next = false;
		if (ruleParam._maxDPMinutes > 0) {
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_DP, ruleParam._maxDPMinutes, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
		}
	}
	return next;
}

void CalculateMaxDutyPeriodRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitMaxDutyPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitMaxDutyPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}