#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7260/CalculatePICForEvaRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculatePICForEva(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	CalculatePICForEvaRule* rule = _ruleFactory->GetCalcRule<CalculatePICForEvaRule>();
	if (rule == nullptr) {
		return;
	}
	
	rule->Calculate(pairing);
}

void LegalityChecker::calculatePICForEva(const vector<SharedPtr<ROSTER>>& rosters) {
	CalculatePICForEvaRule* rule = _ruleFactory->GetCalcRule<CalculatePICForEvaRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		if (!this->isCheckPairingInRoster(CalculatePICForEvaRule::RuleFuncId, roster->pairId))
			tmpRosters.emplace_back(roster.get());
	}
	rule->Calculate(tmpRosters);

	this->addCheckPairingInRoster(CalculatePICForEvaRule::RuleFuncId, rosters);
}
