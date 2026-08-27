#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule7462/CheckAllowedMultiSectorDutyForFreighterForSQRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkAllowedMultiSectorDutyForFreighterForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckAllowedMultiSectorDutyForFreighterForSQRule* rule = _ruleFactory->GetCheckRule<CheckAllowedMultiSectorDutyForFreighterForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAllowedMultiSectorDutyForFreighterForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckAllowedMultiSectorDutyForFreighterForSQRule* rule = _ruleFactory->GetCheckRule<CheckAllowedMultiSectorDutyForFreighterForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}