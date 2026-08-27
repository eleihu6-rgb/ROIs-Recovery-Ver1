#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule7484/CalculateMaxFlightDutyPeriodForHXRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateMaxFlightDutyPeriod_HX(Duty* duty, SharedPtr<ROSTER> roster) {
	CalculateMaxFlightDutyPeriodForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFlightDutyPeriodForHXRule>();
	if (rule == nullptr) {
		return;
	}
	if (roster == NULL) {
		rule->CalculateDuty(duty);
	}
	else {
		std::vector<const ROSTER*> rosters;
		rosters.emplace_back(roster.get());
		rule->CalculateDuty(rosters);
	}
}

// for po
void LegalityChecker::calculateMaxFlightDutyPeriod_HX(Pairing* pairing) {
	CalculateMaxFlightDutyPeriodForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFlightDutyPeriodForHXRule>();
	if (rule == nullptr) {
		return;
	}

	rule->CalculateDuty(pairing);

}

void LegalityChecker::calculateMaxFlightDutyPeriod_HX(RULE_LEGALITY* pCrew) {
	CalculateMaxFlightDutyPeriodForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFlightDutyPeriodForHXRule>();
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


void LegalityChecker::calculateMaxFlightDutyPeriod_HX(vector<SharedPtr<ROSTER>>& rosters) {
	CalculateMaxFlightDutyPeriodForHXRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFlightDutyPeriodForHXRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rawRosters;
	rawRosters.reserve(rosters.size());
	for (const auto& roster : rosters) {
		rawRosters.push_back(roster.get());
	}
	rule->CalculateDuty(rawRosters);
}