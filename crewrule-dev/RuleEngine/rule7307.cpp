#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7307/CalculateMinRestBasedLocalNightForPRRule.h"
#include "rule7307/CheckMinRestBasedLocalNightForPRRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMinRestBasedLocalNightForPR(Duty * duty) {
	CalculateMinRestBasedLocalNightForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestBasedLocalNightForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMinRestBasedLocalNightForPR(Pairing* pairing) {
	CalculateMinRestBasedLocalNightForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestBasedLocalNightForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinRestBasedLocalNightForPR(SharedPtr<ROSTER> roster) {
	CalculateMinRestBasedLocalNightForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestBasedLocalNightForPRRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setMinRestBasedLocalNightForPR(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return;
	}

	CalculateMinRestBasedLocalNightForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestBasedLocalNightForPRRule>();
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

bool LegalityChecker::checkMinRestBasedLocalNightForPR(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckMinRestBasedLocalNightForPRRule* rule = _ruleFactory->GetCheckRule<CheckMinRestBasedLocalNightForPRRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMinRestBasedLocalNightForPR(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinRestBasedLocalNightForPRRule* rule = _ruleFactory->GetCheckRule<CheckMinRestBasedLocalNightForPRRule>();
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