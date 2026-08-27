#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7488/CalculateMinRestForHXRule.h"
#include "RuleFactory.h"


void LegalityChecker::setMinRestForHX(Duty * duty) {
	CalculateMinRestForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setMinRestForHX(Pairing* pairing) {
	if (pairing == nullptr) return;
	CalculateMinRestForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinRestForHX(SharedPtr<ROSTER> roster) {
	CalculateMinRestForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestForHXRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setMinRestForHX(RULE_LEGALITY* pCrew) {
	CalculateMinRestForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestForHXRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//spdlog::info("[setAcclimationState_QQ] pCrew roster id={}", roster->rosterId);
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}

