#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7489/LimitConsecutiveDayMinRestForHXRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkConsecutiveDayMinRestForHX(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitConsecutiveDayMinRestForHXRule* rule = _ruleFactory->GetCheckRule<LimitConsecutiveDayMinRestForHXRule>();
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
