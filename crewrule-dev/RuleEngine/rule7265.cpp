#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7265/CheckSchMinRestForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkSchMinRestForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckSchMinRestForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkSchMinRestForEvaFd(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckSchMinRestForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

bool LegalityChecker::checkSchMinRestForEvaFd(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckSchMinRestForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}

