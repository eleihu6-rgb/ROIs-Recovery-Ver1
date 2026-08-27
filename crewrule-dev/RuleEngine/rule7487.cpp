#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7487/CheckMaxDurationFromStandbyToFlightDutyEndForHXRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMaxDurationFromStandbyToFlightDutyEndForHX(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMaxDurationFromStandbyToFlightDutyEndForHXRule* rule = _ruleFactory->GetCheckRule<CheckMaxDurationFromStandbyToFlightDutyEndForHXRule>();
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
