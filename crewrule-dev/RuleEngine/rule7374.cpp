#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7374/CalculateMaxFDPByCalloutFor5JRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateMaxFDPByCalloutFor5J(const vector<SharedPtr<ROSTER>>& rosters) {
	CalculateMaxFDPByCalloutFor5JRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFDPByCalloutFor5JRule>();
	if (rule == nullptr) {
		return;
	}

	std::vector<const ROSTER*> tmpRosters;
	for (const SharedPtr<ROSTER>& roster : rosters) {
		tmpRosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(tmpRosters);
}
