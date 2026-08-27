#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7254/BuddiesInSameCourseForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkBuddiesInSameCourseForEvaFd(RULE_LEGALITY* pCrew) {

	BuddiesInSameCourseForEvaFdRule* rule = _ruleFactory->GetCheckRule<BuddiesInSameCourseForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	//std::vector<const ROSTER*> rosters;
	//for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
	//	rosters.emplace_back(roster.get());
	//}
	return rule->CheckRule(_dbData->crewList[pCrew->crewIndex]);
}
