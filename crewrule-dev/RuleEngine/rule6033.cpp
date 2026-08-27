#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule6033/CheckMaxConsecutiveEarlyStartRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckMaxConsecutiveEarlyStart(RULE_LEGALITY * pCrew, const DBRule* singleRule) {

	CheckMaxConsecutiveEarlyStartRule* rule = _ruleFactory->GetCheckRule<CheckMaxConsecutiveEarlyStartRule>();
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