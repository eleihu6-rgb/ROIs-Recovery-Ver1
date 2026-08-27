/**
 * @file MinRestAtBaseOrLayoverStationRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculateMinRestAtBaseOrLayoverStationRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMinRestAtBaseOrLayoverStationRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	map<long long, long> mapCallinSBY_FDPMins;
	CalculateDuty(duties, mapCallinSBY_FDPMins);
}

void CalculateMinRestAtBaseOrLayoverStationRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}
	map<long long, long> mapCallinSBY_FDPMins;
	CalculateDuty(pairing->getDutyVec(), mapCallinSBY_FDPMins);
}

void CalculateMinRestAtBaseOrLayoverStationRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);

	map<long long, long> mapCallinSBY_FDPMins;
	for (auto& roster : rosters) {
		if (roster->pairing != nullptr && roster->callinSBY_FDPMins > 0) {
			mapCallinSBY_FDPMins.insert(std::make_pair(roster->pairId, roster->callinSBY_FDPMins));
		}
	}

	CalculateDuty(duties, mapCallinSBY_FDPMins);
}

void CalculateMinRestAtBaseOrLayoverStationRule::CalculateDuty(vector<Duty*> duties, const map<long long, long>& mapCallinSBY_FDPMins) {
	if (duties.empty()) {
		return;
	}

	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (Duty* duty : duties) {
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(duty, base, ruleParam, mapCallinSBY_FDPMins)) {
				break;
			}
		}
	}
}

bool CalculateMinRestAtBaseOrLayoverStationRule::CalculateDuty(Duty *duty, const std::string& base, const MinRestAtBaseOrLayoverStationRuleParam& ruleParam, const map<long long, long>& mapCallinSBY_FDPMins) {
	bool next = true;
	if (!ruleParam.MatchRule(*duty, mapCallinSBY_FDPMins)) {
		return true;
	}

	if (ruleParam._minRestAtBase != nullptr && ruleParam.MatchHomeBase(*duty, base)) {
		duty->setMinRest(*ruleParam._minRestAtBase);
		duty->setMinRestAtBase(*ruleParam._minRestAtBase);
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, *ruleParam._minRestAtBase, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
	}
	if (ruleParam._minRestAtLayover != nullptr && ruleParam.MatchLayoverStation(*duty)) {
		duty->setMinRest(*ruleParam._minRestAtLayover);
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, *ruleParam._minRestAtLayover, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
	}
	return next;
}

void CalculateMinRestAtBaseOrLayoverStationRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MinRestAtBaseOrLayoverStationRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MinRestAtBaseOrLayoverStationRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}