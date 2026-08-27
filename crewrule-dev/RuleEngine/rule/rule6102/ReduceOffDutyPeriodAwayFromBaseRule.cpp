/**
 * @file ReduceOffDutyPeriodAwayFromBaseRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "ReduceOffDutyPeriodAwayFromBaseRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void ReduceOffDutyPeriodAwayFromBaseRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParam->Empty()) {
		return;
	}
	vector<Duty*> duties = pairing->getDutyVec();
	map<long long, long> mapCallinSBY_FDPMins;
	CalculateDuty(duties, nullptr, mapCallinSBY_FDPMins);
}

void ReduceOffDutyPeriodAwayFromBaseRule::CalculateDuty(Duty* duty) {
	if (this->IsPairingOptimizerModel()) {
		return;
	}
	long long pairingId = duty->getPairingId();
	Pairing* pairing = this->_dbData->pairingIdMap[pairingId];
	vector<Duty*> duties = pairing->getDutyVec();
	map<long long, long> mapCallinSBY_FDPMins;
	CalculateDuty(duties, duty, mapCallinSBY_FDPMins);
}

void ReduceOffDutyPeriodAwayFromBaseRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParam->Empty() || rosters.empty()) {
		return;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);

	map<long long, long> mapCallinSBY_FDPMins;
	for (auto& roster : rosters) {
		if (roster->pairing != nullptr && roster->callinSBY_FDPMins > 0) {
			mapCallinSBY_FDPMins.insert(std::make_pair(roster->pairId, roster->callinSBY_FDPMins));
		}
	}

	CalculateDuty(duties, nullptr, mapCallinSBY_FDPMins);
}

void ReduceOffDutyPeriodAwayFromBaseRule::CalculateDuty(std::vector<Duty*>& duties, Duty* currDuty, const map<long long, long>& mapCallinSBY_FDPMins) {

	for (int i = 0; i <= (int)duties.size() - 4; i++) {
		Duty* firstODPBeforeDuty = duties[i];
		Duty* firstFDPDuty = duties[i + 1];
		Duty* secondFDPDuty = duties[i + 2];
		Duty* thirdFDPDuty = duties[i + 3];
		if (currDuty != nullptr && currDuty->getDutyId() == firstFDPDuty->getDutyId()) {
			CalculateDuty(firstODPBeforeDuty, firstFDPDuty, secondFDPDuty, thirdFDPDuty, mapCallinSBY_FDPMins);
		}
		else {
			CalculateDuty(firstODPBeforeDuty, firstFDPDuty, secondFDPDuty, thirdFDPDuty, mapCallinSBY_FDPMins);

		}
	}

	for (int i = 0; i <= (int)duties.size() - 3; i++) {
		Duty* firstFDPDuty = duties[i];
		Duty* secondFDPDuty = duties[i + 1];
		Duty* thirdFDPDuty = duties[i + 2];
		if (currDuty != nullptr && currDuty->getDutyId() == firstFDPDuty->getDutyId()) {
			CalculateDuty(firstFDPDuty, secondFDPDuty, thirdFDPDuty, mapCallinSBY_FDPMins);
		}
		else {
			CalculateDuty(firstFDPDuty, secondFDPDuty, thirdFDPDuty, mapCallinSBY_FDPMins);

		}
	}
}


void ReduceOffDutyPeriodAwayFromBaseRule::CalculateDuty(const Duty* firstODPBeforeDuty, Duty* firstFDPDuty, const Duty* secondFDPDuty, const Duty* thirdFDPDuty, const map<long long, long>& mapCallinSBY_FDPMins) {
	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = firstFDPDuty->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (const auto & ruleParam : _ruleParam->GetFirstCaseParams()) {
		if (!CalculateDuty(firstODPBeforeDuty, firstFDPDuty, secondFDPDuty, thirdFDPDuty, base, ruleParam, mapCallinSBY_FDPMins)) {
			break;
		}
	}
}

void ReduceOffDutyPeriodAwayFromBaseRule::CalculateDuty(Duty* firstFDPDuty, const Duty* secondFDPDuty, const Duty* thirdFDPDuty, const map<long long, long>& mapCallinSBY_FDPMins) {
	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = firstFDPDuty->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (const auto & ruleParam : _ruleParam->GetSecondCaseParams()) {
		if (!CalculateDuty(firstFDPDuty, secondFDPDuty, thirdFDPDuty, base, ruleParam, mapCallinSBY_FDPMins)) {
			break;
		}
	}
}

bool ReduceOffDutyPeriodAwayFromBaseRule::CalculateDuty(const Duty* firstODPBeforeDuty, Duty* firstFDPDuty,
	const Duty* secondFDPDuty, const Duty* thirdFDPDuty, const std::string& base, const ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam& ruleParam, const map<long long, long>& mapCallinSBY_FDPMins) {
	if (firstODPBeforeDuty == nullptr || firstFDPDuty == nullptr || secondFDPDuty == nullptr || thirdFDPDuty == nullptr) {
		return false;
	}

	bool next = true;
	if (ruleParam.MatchParam(*firstODPBeforeDuty, *firstFDPDuty, *secondFDPDuty, *thirdFDPDuty, base, mapCallinSBY_FDPMins)) {
		if (ruleParam.ValidReducedToMinRest()) {
			if (firstFDPDuty->getMinRest() >= ruleParam._secondODPReducedToMinMinutes) {
				firstFDPDuty->setMinRest(ruleParam._secondODPReducedToMinMinutes, true);
				firstFDPDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, ruleParam._secondODPReducedToMinMinutes, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
			}
			next = false;
		}
	}
	return next;
}

bool ReduceOffDutyPeriodAwayFromBaseRule::CalculateDuty(Duty* firstFDPDuty, const Duty* secondFDPDuty, const Duty* thirdFDPDuty, const std::string& base, const ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam& ruleParam, const map<long long, long>& mapCallinSBY_FDPMins) {
	if (firstFDPDuty == nullptr || secondFDPDuty == nullptr || thirdFDPDuty == nullptr) {
		return false;
	}

	bool next = true;
	if (ruleParam.MatchParam(*firstFDPDuty, *secondFDPDuty, *thirdFDPDuty, base, mapCallinSBY_FDPMins)) {
		if (ruleParam.ValidReducedToMinRest()) {
			if (firstFDPDuty->getMinRest() >= ruleParam._firstODPReducedToMinMinutes) {
				firstFDPDuty->setMinRest(ruleParam._firstODPReducedToMinMinutes, true);
				firstFDPDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, ruleParam._firstODPReducedToMinMinutes, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
			}
			next = false;
		}
	}
	return next;
}

void ReduceOffDutyPeriodAwayFromBaseRule::ParseParam(const InputType& input) {
	//add by hexd ���DBRule֧��
	if (_ruleParam == nullptr) {
		_ruleParam = std::make_unique<ReduceOffDutyPeriodAwayFromBaseRuleParam>(ReduceOffDutyPeriodAwayFromBaseRuleParam(this));
	}
	for (const auto& dbRule : input.dbRules) {
		_ruleParam->ParseParam(dbRule);
	}
	if (!_ruleParam->Empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParam->ParseParam(singleRuleParamString);
	}
}

