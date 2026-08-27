#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7465/CalculateMinScheDaysOffAtBaseForSQRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMinScheDaysOffAtBaseForSQ(Pairing* pairing) {
	CalculateMinScheDaysOffAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculateMinScheDaysOffAtBaseForSQRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinScheDaysOffAtBaseForSQ(SharedPtr<ROSTER> roster) {
	CalculateMinScheDaysOffAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculateMinScheDaysOffAtBaseForSQRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setMinScheDaysOffAtBaseForSQ(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return;
	}

	CalculateMinScheDaysOffAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculateMinScheDaysOffAtBaseForSQRule>();
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
