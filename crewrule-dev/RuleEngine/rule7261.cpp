#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7261/CheckAcclimatizedRestRuleForEva.h"
#include "RuleFactory.h"


bool LegalityChecker::checkAcclimatizedRestForEva(RULE_LEGALITY* pCrew) {

	CheckAcclimatizedRestRuleForEva* rule = _ruleFactory->GetCheckRule<CheckAcclimatizedRestRuleForEva>();
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
