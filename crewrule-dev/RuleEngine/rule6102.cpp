#include "RuleEngine.h"
#include <iostream>

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6102/ReduceOffDutyPeriodAwayFromBaseRule.h"
#include "RuleFactory.h"

void LegalityChecker::reduceMinRestAwayFromBase_QQ(Duty * duty) {
	ReduceOffDutyPeriodAwayFromBaseRule* rule = _ruleFactory->GetCalcRule<ReduceOffDutyPeriodAwayFromBaseRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::reduceMinRestAwayFromBase_QQ(Pairing * pairing) {
	ReduceOffDutyPeriodAwayFromBaseRule* rule = _ruleFactory->GetCalcRule<ReduceOffDutyPeriodAwayFromBaseRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::reduceMinRestAwayFromBase_QQ(RULE_LEGALITY * pCrew) {
	ReduceOffDutyPeriodAwayFromBaseRule* rule = _ruleFactory->GetCalcRule<ReduceOffDutyPeriodAwayFromBaseRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//spdlog::info("[setAcclimationState_QQ] pCrew roster id={}", roster->rosterId);
		rosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(ReduceOffDutyPeriodAwayFromBaseRule::RuleFuncId, _dbData->crewList[pCrew->crewIndex]->rosterList);
	rule->CalculateDuty(rosters);
}