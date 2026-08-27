#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7210/CheckConsecutiveWOCLRestForEvaRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkConsecutiveWOCLRestForEva(RULE_LEGALITY * pCrew) {

	CheckConsecutiveWOCLRestForEvaRule* rule = _ruleFactory->GetCheckRule<CheckConsecutiveWOCLRestForEvaRule>();
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