

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7357/LimitMaxAttributesNumberBasedMandayForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMaxAttributesNumberBasedMandayForPR(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitMaxAttributesNumberBasedMandayForPRRule* rule = _ruleFactory->GetCheckRule<LimitMaxAttributesNumberBasedMandayForPRRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}