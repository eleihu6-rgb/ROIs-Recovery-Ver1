#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7314/CheckGenderOnFlightByCompositionForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkGenderOnFlightByCompositionForPR(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckGenderOnFlightByCompositionForPRRule* rule = _ruleFactory->GetCheckRule<CheckGenderOnFlightByCompositionForPRRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkGenderOnFlightByCompositionForPR(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckGenderOnFlightByCompositionForPRRule* rule = _ruleFactory->GetCheckRule<CheckGenderOnFlightByCompositionForPRRule>();
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