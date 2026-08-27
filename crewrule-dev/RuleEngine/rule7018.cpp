#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule7018/CalculateMaxFdpOnStandbyOfCcForTGRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateMaxFdpOnStandbyOfCc_TG(RULE_LEGALITY* pCrew) {
	CalculateMaxFdpOnStandbyOfCcForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFdpOnStandbyOfCcForTGRule>();
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

void LegalityChecker::calculateMaxFdpOnStandbyOfCc_TG(const vector<SharedPtr<ROSTER>>& rosters) {
	CalculateMaxFdpOnStandbyOfCcForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFdpOnStandbyOfCcForTGRule>();
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