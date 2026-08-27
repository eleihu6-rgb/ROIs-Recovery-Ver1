

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7212/CheckMinWOCLAtLayoverStationForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMinWOCLAtLayoverStationForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckMinWOCLAtLayoverStationForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckMinWOCLAtLayoverStationForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMinWOCLAtLayoverStationForEvaFd(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinWOCLAtLayoverStationForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckMinWOCLAtLayoverStationForEvaFdRule>();
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