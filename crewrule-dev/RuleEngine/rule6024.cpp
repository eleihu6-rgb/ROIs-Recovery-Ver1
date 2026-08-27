#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6024/CalculateMaxFdpForStandbyRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateMaxFdpForStand_QQ(RULE_LEGALITY * pCrew) {
	CalculateMaxFdpForStandbyRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFdpForStandbyRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//spdlog::info("[setAcclimationState_QQ] pCrew roster id={}", roster->rosterId);
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}

void LegalityChecker::calculateMaxFdpForStand_QQ(const vector<SharedPtr<ROSTER>>& rosters) {
	CalculateMaxFdpForStandbyRule* rule = _ruleFactory->GetCalcRule<CalculateMaxFdpForStandbyRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		//spdlog::info("[setAcclimationState_QQ] rosters roster id={}", roster->rosterId);
		tmpRosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(tmpRosters);
}