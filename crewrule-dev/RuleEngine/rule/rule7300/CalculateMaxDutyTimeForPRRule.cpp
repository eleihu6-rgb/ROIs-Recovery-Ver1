/**
 * @file CalculateMaxDutyTimeForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-10
**/

#include "../RuleSytem.h"
#include "CalculateMaxDutyTimeForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMaxDutyTimeForPRRule::CalculateDuty(Duty* duty) {
	for (const auto & ruleParam : _ruleParams) {
		if (!CalculateDuty(duty, ruleParam)) {
			break;
		}
	}
}

void CalculateMaxDutyTimeForPRRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateMaxDutyTimeForPRRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	CalculateDuty(duties);
}

void CalculateMaxDutyTimeForPRRule::CalculateDuty(vector<Duty*> duties) {
	for (Duty* duty : duties) {
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(duty, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateMaxDutyTimeForPRRule::CalculateDuty(Duty* duty, const CalculateMaxDutyTimeForPRRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*duty)) {
		bool locked = ruleParam._isOverrideable == nullptr ? false : *(ruleParam._isOverrideable.get());
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_DP, ruleParam._maxDP, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), locked, locked);
		next = false;
	}
	return next;
}

void CalculateMaxDutyTimeForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMaxDutyTimeForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateMaxDutyTimeForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}