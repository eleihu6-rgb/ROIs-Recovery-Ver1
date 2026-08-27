#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule6036/CehckWorkingDaysLimitRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckWorkingDaysLimit(RULE_LEGALITY * pCrew, const DBRule* singleRule) {

	CehckWorkingDaysLimitRule* rule = _ruleFactory->GetCheckRule<CehckWorkingDaysLimitRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}