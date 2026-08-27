#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6025/CalculateMaxDutyPeriodRule.h"
#include "rule6025/CheckMaxDutyPeriodRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateMaxDP_QQ(Duty* duty) {
	CalculateMaxDutyPeriodRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDutyPeriodRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::calculateMaxDP_QQ(Pairing* pairing) {
	CalculateMaxDutyPeriodRule* rule = _ruleFactory->GetCalcRule<CalculateMaxDutyPeriodRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

bool LegalityChecker::checkMaxDP_QQ(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMaxDutyPeriodRule* rule = _ruleFactory->GetCheckRule<CheckMaxDutyPeriodRule>();
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

bool LegalityChecker::checkMaxDP_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	CheckMaxDutyPeriodRule* rule = _ruleFactory->GetCheckRule<CheckMaxDutyPeriodRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMaxDP_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	CheckMaxDutyPeriodRule* rule = _ruleFactory->GetCheckRule<CheckMaxDutyPeriodRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}
