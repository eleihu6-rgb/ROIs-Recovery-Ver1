#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7422/CalculateAtdoAfterSlipForSQRule.h"
#include "RuleFactory.h"

void LegalityChecker::setAtdoAfterSlipForSQ(Pairing* pairing) {
	CalculateAtdoAfterSlipForSQRule* rule = _ruleFactory->GetCalcRule<CalculateAtdoAfterSlipForSQRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setAtdoAfterSlipForSQ(SharedPtr<ROSTER> roster) {
	CalculateAtdoAfterSlipForSQRule* rule = _ruleFactory->GetCalcRule<CalculateAtdoAfterSlipForSQRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setAtdoAfterSlipForSQ(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0) {
		return;
	}

	CalculateAtdoAfterSlipForSQRule* rule = _ruleFactory->GetCalcRule<CalculateAtdoAfterSlipForSQRule>();
	if (rule == nullptr) {
		return;
	}
	rule->setRuleLegality(pCrew);
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}

