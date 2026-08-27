

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7267/CheckSchMinWOCLAtLayoverStationForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkSchMinWOCLAtLayoverStationForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckSchMinWOCLAtLayoverStationForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchMinWOCLAtLayoverStationForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkSchMinWOCLAtLayoverStationForEvaFd(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckSchMinWOCLAtLayoverStationForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchMinWOCLAtLayoverStationForEvaFdRule>();
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