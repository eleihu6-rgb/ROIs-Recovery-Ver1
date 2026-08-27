

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7356/LimitAttributesSpacingBasedMandayForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkAttributesSpacingBasedMandayForPR(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitAttributesSpacingBasedMandayForPRRule* rule = _ruleFactory->GetCheckRule<LimitAttributesSpacingBasedMandayForPRRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}