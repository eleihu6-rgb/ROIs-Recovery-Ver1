#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule7468/LimitPositioningInCopForSQRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkLimitPositioningInCopForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	LimitPositioningInCopForSQRule* rule = _ruleFactory->GetCheckRule<LimitPositioningInCopForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkLimitPositioningInCopForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	LimitPositioningInCopForSQRule* rule = _ruleFactory->GetCheckRule<LimitPositioningInCopForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}
