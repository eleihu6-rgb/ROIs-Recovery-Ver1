#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule7302/CalculateMaxFDPByCalloutStandbyForPRRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateMaxFDPByCalloutStandbyForPR(RULE_LEGALITY* pCrew) {
	CalculateMaxFDPByCalloutStandbyForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFDPByCalloutStandbyForPRRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}

void LegalityChecker::calculateMaxFDPByCalloutStandbyForPR(const vector<SharedPtr<ROSTER>>& rosters) {
	CalculateMaxFDPByCalloutStandbyForPRRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFDPByCalloutStandbyForPRRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		tmpRosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(tmpRosters);
}