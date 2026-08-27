#include "RuleEngine.h"
#include <iostream>

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6101/ReduceOffDutyPeriodAtBaseRule.h"
#include "RuleFactory.h"

void LegalityChecker::reduceMinRestAtBase_QQ(Duty * duty) {
	ReduceOffDutyPeriodAtBaseRule* rule = _ruleFactory->GetCalcRule<ReduceOffDutyPeriodAtBaseRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::reduceMinRestAtBase_QQ(Pairing * pairing) {
	ReduceOffDutyPeriodAtBaseRule* rule = _ruleFactory->GetCalcRule<ReduceOffDutyPeriodAtBaseRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::reduceMinRestAtBase_QQ(RULE_LEGALITY * pCrew) {
	ReduceOffDutyPeriodAtBaseRule* rule = _ruleFactory->GetCalcRule<ReduceOffDutyPeriodAtBaseRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//spdlog::info("[setAcclimationState_QQ] pCrew roster id={}", roster->rosterId);
		rosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(ReduceOffDutyPeriodAtBaseRule::RuleFuncId, _dbData->crewList[pCrew->crewIndex]->rosterList);
	rule->CalculateDuty(rosters);
}