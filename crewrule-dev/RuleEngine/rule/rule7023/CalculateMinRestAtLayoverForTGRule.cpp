/**
 * @file CalculateMinRestAtLayoverForTGRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-25
**/

#include "../RuleSytem.h"
#include "CalculateMinRestAtLayoverForTGRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMinRestAtLayoverForTGRule::CalculateDuty(Duty* duty) {
	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duty->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (const auto & ruleParam : _ruleParams) {
		if (!CalculateDuty(duty, base, ruleParam)) {
			break;
		}
	}
}

void CalculateMinRestAtLayoverForTGRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = pairing->getFirstDuty()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	CalculateDuty(pairing->getDutyVec(), base);
}

void CalculateMinRestAtLayoverForTGRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();

	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	CalculateDuty(duties, base);
}

void CalculateMinRestAtLayoverForTGRule::CalculateDuty(vector<Duty*> duties, const string& base) {
	for (Duty* duty : duties) {
		for (const auto& ruleParam : _ruleParams) {
			if (!CalculateDuty(duty, base, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateMinRestAtLayoverForTGRule::CalculateDuty(Duty *duty, const string& base, const CalculateMinRestAtLayoverForTGRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*duty, base)) {

		int minRest = std::max(ruleParam._minRestMinutes, duty->getActualDP());
		duty->setMinRest(minRest);
		if (ruleParam._isHomeBase != nullptr && *ruleParam._isHomeBase) {
			duty->setMinRestAtBase(minRest);
		}
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());

		next = false;
	}
	return next;
}

void CalculateMinRestAtLayoverForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMinRestAtLayoverForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateMinRestAtLayoverForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}