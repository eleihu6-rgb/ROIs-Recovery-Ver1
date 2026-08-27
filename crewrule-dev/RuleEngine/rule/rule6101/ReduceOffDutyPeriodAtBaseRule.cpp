/**
 * @file ReduceOffDutyPeriodAtBaseRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "ReduceOffDutyPeriodAtBaseRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void ReduceOffDutyPeriodAtBaseRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void ReduceOffDutyPeriodAtBaseRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void ReduceOffDutyPeriodAtBaseRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	if (rosters.empty()) {
		return;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	for (auto& duty : duties) {
		CalculateDuty(duty, base);
	}
}

void ReduceOffDutyPeriodAtBaseRule::CalculateDuty(const vector<Duty*>& duties) {
	if (duties.empty()) {
		return;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (auto& duty : duties) {
		CalculateDuty(duty, base);
	}
}

void ReduceOffDutyPeriodAtBaseRule::CalculateDuty(Duty* duty, const std::string& base) {
	int lastMinRest = -1;//最新计算出minRest
	for (const auto & ruleParam : _ruleParams) {
		if (!CalculateDuty(lastMinRest, duty, base, ruleParam)) {
			break;
		}
	}
}

bool ReduceOffDutyPeriodAtBaseRule::CalculateDuty(int& lastMinRest, Duty* duty, const std::string& base, const ReduceOffDutyPeriodAtBaseRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*duty, base)) {
		if (ruleParam.ValidReducedToMinRest()) {
			if (ruleParam._reducedToMinRestMinutes > lastMinRest) {
				lastMinRest = ruleParam._reducedToMinRestMinutes;
				duty->setMinRest(ruleParam._reducedToMinRestMinutes, true);
				duty->setMinRestAtBase(ruleParam._reducedToMinRestMinutes, true);
				duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, ruleParam._reducedToMinRestMinutes, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
			}

		}
	}
	return next;
}

void ReduceOffDutyPeriodAtBaseRule::ParseParam(const InputType& input) {
	//add by hexd ���DBRule֧��
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(ReduceOffDutyPeriodAtBaseRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(ReduceOffDutyPeriodAtBaseRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

