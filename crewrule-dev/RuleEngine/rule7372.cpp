#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7372/CalculateGroundDPForTGRule.h"
#include "RuleFactory.h"

long LegalityChecker::CalculateGroundDP_TG(SharedPtr<ROSTER> roster) {
	CalculateGroundDPForTGRule* rule = _ruleFactory->GetCalcRule<CalculateGroundDPForTGRule>();
	if (rule == nullptr) {
		return -1;
	}

	return rule->Calculate(roster);
}


void LegalityChecker::CalculateGroundDP_TG(vector<SharedPtr<ROSTER>> rosters) {
	CalculateGroundDPForTGRule* rule = _ruleFactory->GetCalcRule<CalculateGroundDPForTGRule>();
	if (rule == nullptr) {
		return;
	}
	if (rosters.empty())
		return;
	for (size_t i = 0; i < rosters.size() - 1; i++) {
		auto& roster = rosters[i];
		rule->CalculateDP(roster);
	}
	if (rosters.size() > 0) {
		rule->CalculateDP(rosters[rosters.size() - 1]);
	}

	this->addCheckPairingInRoster(CalculateGroundDPForTGRule::RuleFuncId, rosters);
}
