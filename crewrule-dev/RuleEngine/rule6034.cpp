#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule6034/CheckMaxEarlyDutyInAnyConsecutiveDayRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckMaxEarlyDutyInAnyConsecutiveDay(RULE_LEGALITY * pCrew, const DBRule* singleRule) {

	CheckMaxEarlyDutyInAnyConsecutiveDayRule* rule = _ruleFactory->GetCheckRule<CheckMaxEarlyDutyInAnyConsecutiveDayRule>();
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