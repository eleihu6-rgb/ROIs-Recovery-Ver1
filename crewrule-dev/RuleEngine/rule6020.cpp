#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6020/CalculateMaxFlightDutyBySplitDutyRule.h"
#include "rule6020/CalculateDutyDpInMandayRule.h"
#include "rule6020/CheckMaxFlightDutyBySplitDutyRule.h"
#include "RuleFactory.h"

void LegalityChecker::setMaxFlightDutyBySplitDuty_QQ(Duty * duty) {
	CalculateMaxFlightDutyBySplitDutyRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFlightDutyBySplitDutyRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

int LegalityChecker::getDutyDPManday(Duty* duty) {
	CalculateDutyDpInMandayRule* rule = _ruleFactory->GetCalcRule<CalculateDutyDpInMandayRule>("INT");
	if (rule == nullptr) {
		return -1;
	}
	return rule->Calculate(duty);
}

bool LegalityChecker::checkMaxFlightDutyBySplitDuty_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	CheckMaxFlightDutyBySplitDutyRule* rule = _ruleFactory->GetCheckRule<CheckMaxFlightDutyBySplitDutyRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMaxFlightDutyBySplitDuty_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	CheckMaxFlightDutyBySplitDutyRule* rule = _ruleFactory->GetCheckRule<CheckMaxFlightDutyBySplitDutyRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}


bool LegalityChecker::checkMaxFlightDutyBySplitDuty_QQ(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMaxFlightDutyBySplitDutyRule* rule = _ruleFactory->GetCheckRule<CheckMaxFlightDutyBySplitDutyRule>();
	if (rule == nullptr) {
		return true;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->setRuleLegality(pCrew);
	return rule->CheckRule(rosters);
}