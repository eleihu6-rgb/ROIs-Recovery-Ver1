#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7241/LimitCoursePipNumbersForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkCoursePipNumbersForEvaFd(RULE_LEGALITY* pCrew) {

	LimitCoursePipNumbersForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitCoursePipNumbersForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}
