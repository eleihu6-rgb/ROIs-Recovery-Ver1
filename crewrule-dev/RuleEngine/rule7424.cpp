#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7424/CalculateOvernightAtdoAtBaseForSQRule.h"
#include "RuleFactory.h"

void LegalityChecker::setOvernightAtdoAtBaseForSQ(Pairing* pairing) {
	CalculateOvernightAtdoAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculateOvernightAtdoAtBaseForSQRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setOvernightAtdoAtBaseForSQ(SharedPtr<ROSTER> roster) {
	CalculateOvernightAtdoAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculateOvernightAtdoAtBaseForSQRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setOvernightAtdoAtBaseForSQ(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0) {
		return;
	}

	CalculateOvernightAtdoAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculateOvernightAtdoAtBaseForSQRule>();
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
