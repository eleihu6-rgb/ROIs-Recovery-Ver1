#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7203/CheckSegmentRestrictionForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkSegmentRestrictionForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckSegmentRestrictionForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSegmentRestrictionForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkSegmentRestrictionForEvaFd(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckSegmentRestrictionForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSegmentRestrictionForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

bool LegalityChecker::checkSegmentRestrictionForEvaFd(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckSegmentRestrictionForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSegmentRestrictionForEvaFdRule>();
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