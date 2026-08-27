#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7486/LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkRedEyeDutyForHX(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule* rule = _ruleFactory->GetCheckRule<LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule>();
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
