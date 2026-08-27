#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7200/CheckMinRestForEvaFdRule.h"
#include "rule7200/CalculateCheckInMinRestForEvaFdRule.h"
#include "RuleFactory.h"


void LegalityChecker::setCheckInMinRest_EvaFd(Duty* duty) {
	CalculateCheckInMinRestForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateCheckInMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setCheckInMinRest_EvaFd(Pairing* pairing) {
	CalculateCheckInMinRestForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateCheckInMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setCheckInMinRest_EvaFd(SharedPtr<ROSTER> roster) {
	CalculateCheckInMinRestForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateCheckInMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

bool LegalityChecker::checkMinRestForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckMinRestForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMinRestForEvaFd(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckMinRestForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckMinRestForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

bool LegalityChecker::checkMinRestForEvaFd(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinRestForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckMinRestForEvaFdRule>();
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

