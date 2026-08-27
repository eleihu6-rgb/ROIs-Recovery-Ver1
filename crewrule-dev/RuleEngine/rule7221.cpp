#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7221/CheckImplausibleConnectionsRule.h"
#include "RuleFactory.h"


bool LegalityChecker::CheckImplausibleConnectionsForCrew(RULE_LEGALITY* pCrew) {

	CheckImplausibleConnectionsRule* rule = _ruleFactory->GetCheckRule<CheckImplausibleConnectionsRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}

bool LegalityChecker::CheckImplausibleConnectionsForPairing(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckImplausibleConnectionsRule* rule = _ruleFactory->GetCheckRule<CheckImplausibleConnectionsRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}