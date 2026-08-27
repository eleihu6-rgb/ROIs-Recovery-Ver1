

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7324/CheckBirthdayDaysOffForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkBirthdayDaysOffForPR(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckBirthdayDaysOffForPRRule* rule = _ruleFactory->GetCheckRule<CheckBirthdayDaysOffForPRRule>();
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