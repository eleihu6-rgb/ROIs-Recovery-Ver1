

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7306/LimitMinRestLFESFlightForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMinRestAfterLFESFlightForPR(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitMinRestLFESFlightForPRRule* rule = _ruleFactory->GetCheckRule<LimitMinRestLFESFlightForPRRule>();
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