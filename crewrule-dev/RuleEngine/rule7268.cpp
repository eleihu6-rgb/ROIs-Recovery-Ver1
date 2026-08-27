#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7268/CheckSchConsecutiveWOCLRestForEvaRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkSchConsecutiveWOCLRestForEva(RULE_LEGALITY * pCrew) {

	CheckSchConsecutiveWOCLRestForEvaRule* rule = _ruleFactory->GetCheckRule<CheckSchConsecutiveWOCLRestForEvaRule>();
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