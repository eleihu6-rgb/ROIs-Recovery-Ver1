#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7272/CalculateStandbyDPForTGRule.h"
#include "RuleFactory.h"

long LegalityChecker::CalculateStandbyDP_TG(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster) {
	CalculateStandbyDPForTGRule* rule = _ruleFactory->GetCalcRule<CalculateStandbyDPForTGRule>();
	if (rule == nullptr) {
		return -1;
	}

	return rule->Calculate(roster, nextRoster);
}


void LegalityChecker::CalculateStandbyDP_TG(vector<SharedPtr<ROSTER>> rosters) {
	CalculateStandbyDPForTGRule* rule = _ruleFactory->GetCalcRule<CalculateStandbyDPForTGRule>();
	if (rule == nullptr) {
		return;
	}
	if (rosters.empty())
		return;
	for (size_t i = 0; i < rosters.size() - 1; i++) {
		auto& roster = rosters[i];
		auto& nextRoster = rosters[i + 1];
		rule->CalculateDP(roster, nextRoster);
	}
	if (rosters.size() > 0) {
		rule->CalculateDP(rosters[rosters.size() - 1], nullptr);
	}

	this->addCheckPairingInRoster(CalculateStandbyDPForTGRule::RuleFuncId, rosters);
}

void LegalityChecker::CalculatePairingStandbyDP_TG(Pairing* pairing) {
	CalculateStandbyDPForTGRule* rule = _ruleFactory->GetCalcRule<CalculateStandbyDPForTGRule>();
	if (rule == nullptr) {
		return;
	}
	if (this->isCheckPairingInRoster(CalculateStandbyDPForTGRule::RuleFuncId, pairing->getDbId()))
		return;
	rule->CalculatePairingDP(pairing);
}