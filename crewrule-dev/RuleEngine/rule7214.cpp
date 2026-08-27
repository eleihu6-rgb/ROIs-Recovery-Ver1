

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7214/CheckLayoverRestLimitByTimeZoneForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkLayoverRestLimitByTimeZoneForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckLayoverRestLimitByTimeZoneForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckLayoverRestLimitByTimeZoneForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkLayoverRestLimitByTimeZoneForEvaFd(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckLayoverRestLimitByTimeZoneForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckLayoverRestLimitByTimeZoneForEvaFdRule>();
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