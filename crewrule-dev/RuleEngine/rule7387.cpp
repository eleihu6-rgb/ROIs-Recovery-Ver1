#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7387/CheckStandbyCalloutDurationFor5JRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkStandbyCalloutDurationFor5J(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0) {
		return true;
	}

	CheckStandbyCalloutDurationFor5JRule* rule = _ruleFactory->GetCheckRule<CheckStandbyCalloutDurationFor5JRule>();
	if (rule == nullptr) {
		return true;
	}

	rule->setRuleLegality(pCrew);
	std::vector<const ROSTER*> rosters;
	for (const SharedPtr<ROSTER>& roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}
