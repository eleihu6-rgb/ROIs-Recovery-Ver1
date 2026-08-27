#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7311/CalculateMinRestByBlockTimeForPRRule.h"
#include "rule7311/LimitMinRestByBlockTimeForPRRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMinRestByBlockTime_PR(Duty* duty) {
	CalculateMinRestByBlockTimeForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestByBlockTimeForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMinRestByBlockTime_PR(Pairing* pairing) {
	CalculateMinRestByBlockTimeForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestByBlockTimeForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinRestByBlockTime_PR(SharedPtr<ROSTER> roster) {
	CalculateMinRestByBlockTimeForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestByBlockTimeForPRRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

bool LegalityChecker::checkMinRestByBlockTime_PR(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	LimitMinRestByBlockTimeForPRRule* rule = _ruleFactory->GetCheckRule<LimitMinRestByBlockTimeForPRRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMinRestByBlockTime_PR(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitMinRestByBlockTimeForPRRule* rule = _ruleFactory->GetCheckRule<LimitMinRestByBlockTimeForPRRule>();
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

