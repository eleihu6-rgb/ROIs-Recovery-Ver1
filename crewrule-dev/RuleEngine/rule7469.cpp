#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule7469/ForcedComplementForDutyRouteForSQRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkForcedComplementByDutyRouteForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	ForcedComplementForDutyRouteForSQRule* rule = _ruleFactory->GetCheckRule<ForcedComplementForDutyRouteForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkForcedComplementByDutyRouteForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	ForcedComplementForDutyRouteForSQRule* rule = _ruleFactory->GetCheckRule<ForcedComplementForDutyRouteForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}
