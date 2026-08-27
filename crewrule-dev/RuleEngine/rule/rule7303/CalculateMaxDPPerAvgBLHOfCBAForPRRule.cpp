/**
 * @file CalculateMaxDPPerAvgBLHOfCBAForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-27
**/

#include "../RuleSytem.h"
#include "CalculateMaxDPPerAvgBLHOfCBAForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMaxDPPerAvgBLHOfCBAForPRRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateMaxDPPerAvgBLHOfCBAForPRRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateMaxDPPerAvgBLHOfCBAForPRRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	CalculateDuty(duties);
}

void CalculateMaxDPPerAvgBLHOfCBAForPRRule::CalculateDuty(vector<Duty*> duties) {
	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (Duty* duty : duties) {
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(duty, base, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateMaxDPPerAvgBLHOfCBAForPRRule::CalculateDuty(Duty* duty, const std::string& base, const CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*duty, base)) {
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_DP, ruleParam._maxDP, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
		next = false;
	}
	return next;
}

void CalculateMaxDPPerAvgBLHOfCBAForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}