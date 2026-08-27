

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7326/CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkEarliesBriefOrLatestDebriefAfterRosterForPR(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule* rule = _ruleFactory->GetCheckRule<CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule>();
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