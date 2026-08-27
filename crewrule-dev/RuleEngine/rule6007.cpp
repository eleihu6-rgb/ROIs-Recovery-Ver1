#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6007/CalculateMaxFlightDutyPeriodRule.h"
#include "rule6007/CheckMaxFlightDutyPeriodRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMaxFlightDutyPeriod_QQ(RULE_LEGALITY * pPairing) {

	CheckMaxFlightDutyPeriodRule* rule = _ruleFactory->GetCalcRule<CheckMaxFlightDutyPeriodRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pPairing);

	bool bLegal = true;

	
	if (this->GetApplication() == ROSTER_EDITOR && pPairing->crewIndex >= 0) {
		if (pPairing->PairingIndex < 0) return true;
		vector<SharedPtr<ROSTER>>& rosterList = this->_dbData->crewList[pPairing->crewIndex]->rosterList;
		std::vector<const ROSTER*> rosters;
		for (SharedPtr<ROSTER> roster : rosterList) {
			rosters.emplace_back(roster.get());
		}
		bLegal = rule->CheckRule(rosters);
	}
	else {
		if (pPairing->PairingIndex < 0) return true;
		const auto & pg = this->_dbData->pairingList[pPairing->PairingIndex];
		for (const auto & duty : pg->getDutyVec()) {
			Duty::DUTY_TYPE dtType = duty->getType();
			if (dtType == Duty::DUTY_PAIRING_REST || dtType == Duty::DUTY_BLANK_DAY) {
				continue;
			}
			rule->setRuleLegality(nullptr);
			bLegal = rule->CheckRule(duty);
		}
	}
	
	return true;
}

bool LegalityChecker::checkMaxFlightDutyPeriodSingleDuty_QQ(Duty* duty) {

	CheckMaxFlightDutyPeriodRule* rule = _ruleFactory->GetCheckRule<CheckMaxFlightDutyPeriodRule>();
	if (rule == nullptr) {
		return true;
	}

	bool bLegal = true;	
	Duty::DUTY_TYPE dtType = duty->getType();
	if (dtType == Duty::DUTY_PAIRING_REST || dtType == Duty::DUTY_BLANK_DAY) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	bLegal = rule->CheckRule(duty);

	return bLegal;
}

void LegalityChecker::calculateMaxFlightDutyPeriod_QQ(Duty * duty, SharedPtr<ROSTER> roster) {
	CalculateMaxFlightDutyPeriodRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFlightDutyPeriodRule>();
	if (rule == nullptr) {
		return;
	}
	if (roster == NULL) {
		rule->CalculateDuty(duty);
	}
	else {
		rule->CalculateDuty(duty, roster.get());
	}
}

// for po
void LegalityChecker::calculateMaxFlightDutyPeriod_QQ(Pairing * pairing) {
	CalculateMaxFlightDutyPeriodRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFlightDutyPeriodRule>();
	if (rule == nullptr) {
		return;
	}

	rule->CalculateDuty(pairing);
	
}
