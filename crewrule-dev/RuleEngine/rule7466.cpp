#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7466/CalculateExtraDaysOffAtBaseForSQRule.h"
#include "RuleFactory.h"


void LegalityChecker::setExtraDaysOffAtBaseForSQ(Pairing* pairing) {
	CalculateExtraDaysOffAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculateExtraDaysOffAtBaseForSQRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setExtraDaysOffAtBaseForSQ(SharedPtr<ROSTER> roster) {
	CalculateExtraDaysOffAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculateExtraDaysOffAtBaseForSQRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setExtraDaysOffAtBaseForSQ(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return;
	}

	CalculateExtraDaysOffAtBaseForSQRule* rule = _ruleFactory->GetCalcRule<CalculateExtraDaysOffAtBaseForSQRule>();
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
