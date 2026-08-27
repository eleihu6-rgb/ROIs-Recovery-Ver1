#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6037/LimitFlightDHDRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkFlightDHD_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	LimitFlightDHDRule* rule = _ruleFactory->GetCheckRule<LimitFlightDHDRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkFlightDHD_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	LimitFlightDHDRule* rule = _ruleFactory->GetCheckRule<LimitFlightDHDRule>();
	if (rule == nullptr) {
		return true;
	}
	if (duty->getPairingId() > 0) {
		//PO阶段的Pairing阶段通过Pairing接口检查
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

