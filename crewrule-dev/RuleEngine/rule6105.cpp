#include "RuleEngine.h"
#include <iostream>
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6105/CheckMinRestAtBaseOrLayoverStationRule.h"
#include "rule6105/CalculateMinRestAtBaseOrLayoverStationRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMinRestAtBaseOrLayover_QQ(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinRestAtBaseOrLayoverStationRule* rule = _ruleFactory->GetCheckRule<CheckMinRestAtBaseOrLayoverStationRule>();
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

bool LegalityChecker::checkMinRestAtBaseOrLayover_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckMinRestAtBaseOrLayoverStationRule* rule = _ruleFactory->GetCheckRule<CheckMinRestAtBaseOrLayoverStationRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMinRestAtBaseOrLayover_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckMinRestAtBaseOrLayoverStationRule* rule = _ruleFactory->GetCheckRule<CheckMinRestAtBaseOrLayoverStationRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

void LegalityChecker::setMinRestAtBaseOrLayover_QQ(Duty * duty) {
	
	CalculateMinRestAtBaseOrLayoverStationRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAtBaseOrLayoverStationRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMinRestAtBaseOrLayover_QQ(Pairing* pairing) {
	CalculateMinRestAtBaseOrLayoverStationRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAtBaseOrLayoverStationRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinRestAtBaseOrLayover_QQ(SharedPtr<ROSTER> roster) {
	CalculateMinRestAtBaseOrLayoverStationRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAtBaseOrLayoverStationRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}