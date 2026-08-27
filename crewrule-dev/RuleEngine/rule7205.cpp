#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7205/CheckMaxFlightTimeInPeriodForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMaxBLHInPeriodForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckMaxFlightTimeInPeriodForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckMaxFlightTimeInPeriodForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMaxBLHInPeriodForEvaFd(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMaxFlightTimeInPeriodForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckMaxFlightTimeInPeriodForEvaFdRule>();
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