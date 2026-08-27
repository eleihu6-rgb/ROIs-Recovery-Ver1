#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule7461/RestrictDhdAndPositionOnFreightForSQRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkDhdAndPositionOnFreightForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	RestrictDhdAndPositionOnFreightForSQRule* rule = _ruleFactory->GetCheckRule<RestrictDhdAndPositionOnFreightForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkDhdAndPositionOnFreightForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	RestrictDhdAndPositionOnFreightForSQRule* rule = _ruleFactory->GetCheckRule<RestrictDhdAndPositionOnFreightForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

bool LegalityChecker::checkDhdAndPositionOnFreightForSQ(const vector<Duty*>& duties, RULE_LEGALITY* ruleLegality) {

	RestrictDhdAndPositionOnFreightForSQRule* rule = _ruleFactory->GetCheckRule<RestrictDhdAndPositionOnFreightForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duties);
}
