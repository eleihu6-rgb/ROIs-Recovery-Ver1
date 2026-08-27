/**
 * @file CalculateManualLimitRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-04
**/

#include "../RuleSytem.h"
#include "CalculateManualLimitRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateManualLimitRule::CalculateDuty(Duty* duty) {
	if (this->IsRosterOptimizerModel() || this->IsPairingOptimizerModel()) {
		return;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateManualLimitRule::CalculateDuty(Pairing* pairing) {
	if (this->IsRosterOptimizerModel() || this->IsPairingOptimizerModel()) {
		return;
	}
	CalculateDuty(pairing->getDutyVec());
}

void CalculateManualLimitRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->IsRosterOptimizerModel() || this->IsPairingOptimizerModel()) {
		return;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	CalculateDuty(duties);
}

void CalculateManualLimitRule::CalculateDuty(vector<Duty*> duties) {
	for (Duty* duty : duties) {
		for (const auto& ruleParam : _ruleParams) {
			CalculateDuty(duty, ruleParam);
		}
	}
}

bool CalculateManualLimitRule::CalculateDuty(Duty* duty, const CalculateManualLimitRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam._type == "MAXFDP" && ruleParam._active) {
		if (duty->isManualMaxFdp() && duty->getManualMaxFdp() > 0) {
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, duty->getManualMaxFdp(), ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true, true);
		}
	}
	return next;
}

void CalculateManualLimitRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateManualLimitRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateManualLimitRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}

	if (input.dbRules.empty() && input.ruleParamString.empty()) {
		//初始化默认法规规则
		CalculateManualLimitRuleParam ruleParam(this);
		ruleParam.SetId(CalculateManualLimitRuleParam::RuleFuncId);
		ruleParam.SetRuleParamId(-1);
		ruleParam.SetClassType("B");
		ruleParam.SetOverrideAbility("H");
		ruleParam.SetDescription("Manual Limit Max FDP");
		ruleParam.SetReference("Manual Limit");
		ruleParam._type = "MAXFDP";
		ruleParam._active = true;
		_ruleParams.emplace_back(ruleParam);
	}
}