#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7016/CheckCrewOperatingRecencyRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckCrewOperatingRecencyRule_TG(RULE_LEGALITY * pCrew) {
	CheckCrewOperatingRecencyRule* rule = _ruleFactory->GetCheckRule<CheckCrewOperatingRecencyRule>();
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
