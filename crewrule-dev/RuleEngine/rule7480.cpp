#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7480/LimitDutyDaysOffForHXRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkDutyDaysOffForHX(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitDutyDaysOffForHXRule* rule = _ruleFactory->GetCheckRule<LimitDutyDaysOffForHXRule>();
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
