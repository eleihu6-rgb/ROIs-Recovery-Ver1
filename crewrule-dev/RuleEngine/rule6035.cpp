#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule6035/CheckMaxConsecutiveNightsAwayFromBaseRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckMaxConsecutiveNightsAwayFromBase(RULE_LEGALITY * pCrew, const DBRule* singleRule) {

	CheckMaxConsecutiveNightsAwayFromBaseRule* rule = _ruleFactory->GetCheckRule<CheckMaxConsecutiveNightsAwayFromBaseRule>();
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