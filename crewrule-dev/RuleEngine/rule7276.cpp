#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7276/CheckDisruptiveSchedulesLocalNightForTGRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkDisruptiveSchedulesLocalNightForTG(RULE_LEGALITY* pCrew) {

	CheckDisruptiveSchedulesLocalNightForTGRule* rule = _ruleFactory->GetCheckRule<CheckDisruptiveSchedulesLocalNightForTGRule>();
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
