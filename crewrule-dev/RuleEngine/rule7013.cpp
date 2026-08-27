#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7013/CheckCOFMultipleQualsForTGRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckCOFMultipleQualsTG(RULE_LEGALITY * pCrew) {
	CheckCOFMultipleQualsForTGRule* rule = _ruleFactory->GetCheckRule<CheckCOFMultipleQualsForTGRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}

	return rule->CheckRule(rosters);
}
