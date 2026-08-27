#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7423/CalculatePostUlrRestAtBaseForSQRule.h"
#include "RuleFactory.h"

void LegalityChecker::setPostUlrRestAtBaseForSQ(Pairing* pairing) {
	CalculatePostUlrRestAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculatePostUlrRestAtBaseForSQRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setPostUlrRestAtBaseForSQ(SharedPtr<ROSTER> roster) {
	CalculatePostUlrRestAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculatePostUlrRestAtBaseForSQRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setPostUlrRestAtBaseForSQ(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0) {
		return;
	}

	CalculatePostUlrRestAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculatePostUlrRestAtBaseForSQRule>();
	if (rule == nullptr) {
		return;
	}
	rule->setRuleLegality(pCrew);
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}

