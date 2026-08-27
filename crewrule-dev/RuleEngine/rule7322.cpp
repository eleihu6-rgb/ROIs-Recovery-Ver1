

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7322/CrewCannotOperateSpecificTaskForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkCrewCannotOperateSpecificTaskForPR(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CrewCannotOperateSpecificTaskForPRRule* rule = _ruleFactory->GetCheckRule<CrewCannotOperateSpecificTaskForPRRule>();
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