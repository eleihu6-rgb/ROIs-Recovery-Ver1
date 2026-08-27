/**
 * @file rule7029.cpp
 * @brief 7029法规调用函数 - TG FDP Extension with in-flight rest for Cabin Crew
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-09
**/

#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule/rule7029/CalculateFdpExtensionWithInFlightRestOfCcForTGRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateFdpExtensionWithInFlightRestOfCcForTG(Duty* duty) {
	CalculateFdpExtensionWithInFlightRestOfCcForTGRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionWithInFlightRestOfCcForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::calculateFdpExtensionWithInFlightRestOfCcForTG(Pairing* pairing) {
	CalculateFdpExtensionWithInFlightRestOfCcForTGRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionWithInFlightRestOfCcForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::calculateFdpExtensionWithInFlightRestOfCcForTG(vector<SharedPtr<ROSTER>>& rosters) {
	CalculateFdpExtensionWithInFlightRestOfCcForTGRule* rule = _ruleFactory->GetCalcRule<CalculateFdpExtensionWithInFlightRestOfCcForTGRule>();
	if (rule == nullptr || rosters.empty()) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		tmpRosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(tmpRosters);
}
