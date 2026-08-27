#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7266/CheckSchMinRestAfterCumulativeFTForEvaFdRule.h"
#include "RuleFactory.h"



bool LegalityChecker::checkSchMinRestAfterCumulativeFT_EvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckSchMinRestAfterCumulativeFTForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchMinRestAfterCumulativeFTForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkSchMinRestAfterCumulativeFT_EvaFd(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckSchMinRestAfterCumulativeFTForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchMinRestAfterCumulativeFTForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

bool LegalityChecker::checkSchMinRestAfterCumulativeFT_EvaFd(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckSchMinRestAfterCumulativeFTForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchMinRestAfterCumulativeFTForEvaFdRule>();
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

