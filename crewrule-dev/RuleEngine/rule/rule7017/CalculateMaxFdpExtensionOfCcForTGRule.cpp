/**
 * @file MaxFlightDutyBySplitDutyRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "CalculateMaxFdpExtensionOfCcForTGRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMaxFdpExtensionOfCcForTGRule::CalculateDuty(Duty *duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateMaxFdpExtensionOfCcForTGRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateMaxFdpExtensionOfCcForTGRule::CalculateDuty(const vector<Duty*>& duties) {
	if (duties.empty()) {
		return;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (auto& duty : duties) {
		// 如果split duty设置了，不继续设置in flight rest
		if (duty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP) && duty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP)->last_set_rule == RULES::CALC_SPLIT_DUTY_MAX_FDP_EXTENSION_FOR_TG)
			continue;
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(duty, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateMaxFdpExtensionOfCcForTGRule::CalculateDuty(Duty* duty, const CalculateMaxFdpExtensionOfCcForTGRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*duty)) {
		int maxFdpMin = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
		if (maxFdpMin < ruleParam._maxFDPMinutes) {
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, ruleParam._maxFDPMinutes, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
		}
		next = false;
	}
	return next;
}

void CalculateMaxFdpExtensionOfCcForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMaxFdpExtensionOfCcForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateMaxFdpExtensionOfCcForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}