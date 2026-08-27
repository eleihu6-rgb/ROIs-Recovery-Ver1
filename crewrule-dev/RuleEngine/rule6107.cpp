#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6107/CalculateMaxFlightDutyTimeRule.h"
#include "rule6107/CheckMaxFlightDutyTimeRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMaxFlightTime_QQ(RULE_LEGALITY * pPairing) {
	
	CheckMaxFlightDutyTimeRule* rule = _ruleFactory->GetCheckRule<CheckMaxFlightDutyTimeRule>();
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
			if (checkDutyIsNoOperating(duty)) {
				rule->setRuleLegality(nullptr);
				bLegal = rule->CheckRule(duty);
			}
			
		}
	}

	return true;
}

bool LegalityChecker::checkMaxFlightTimeSingleDuty_QQ_CC(Duty* duty) {
	if (!checkDutyIsNoOperating(duty)) {
		return true;
	}
	CheckMaxFlightDutyTimeRule* rule = _ruleFactory->GetCheckRule<CheckMaxFlightDutyTimeRule>();
	if (rule == nullptr) {
		return true;
	}

	bool bLegal = true;
	Duty::DUTY_TYPE dtType = duty->getType();
	if (dtType == Duty::DUTY_PAIRING_REST || dtType == Duty::DUTY_BLANK_DAY) {
		return true;
	}
	if (checkDutyIsNoOperating(duty)) {
		rule->setRuleLegality(nullptr);
		bLegal = rule->CheckRule(duty);
	}

	return bLegal;
}

void LegalityChecker::calculateMaxFlighTime_QQ_CC(Pairing* pairing) {
	for (Duty* duty : pairing->getDutyVec()) {
		calculateMaxFlighTime_QQ_CC(duty);
	}
}

void LegalityChecker::calculateMaxFlighTime_QQ_CC(Duty * duty) {
	if (!checkDutyIsNoOperating(duty)) {
		return;
	}
	CalculateMaxFlightDutyTimeRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFlightDutyTimeRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
	
}