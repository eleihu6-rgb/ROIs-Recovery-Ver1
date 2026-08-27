#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7211/CalculateMinRestAfterCumulativeFTForEvaFdRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMinRestAfterCumulativeFT_EvaFd(Pairing* pairing) {
	CalculateMinRestAfterCumulativeFTForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAfterCumulativeFTForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinRestAfterCumulativeFT_EvaFd(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return;
	}

	CalculateMinRestAfterCumulativeFTForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAfterCumulativeFTForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	rule->setRuleLegality(pCrew);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}