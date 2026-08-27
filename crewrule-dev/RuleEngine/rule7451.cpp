#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"

#include "RuleFactory.h"
#include "rule7451/RestrictCoterminalDutyConnectionForSQRule.h"

bool LegalityChecker::checkRestrictCoterminalDutyConnection_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	RestrictCoterminalDutyConnectionForSQRule* rule = _ruleFactory->GetCheckRule<RestrictCoterminalDutyConnectionForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkRestrictCoterminalDutyConnection_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	RestrictCoterminalDutyConnectionForSQRule* rule = _ruleFactory->GetCheckRule<RestrictCoterminalDutyConnectionForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

