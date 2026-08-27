#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule6021/LimitAircraftChangeRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkAircraftChange_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitAircraftChangeRule* rule = _ruleFactory->GetCheckRule<LimitAircraftChangeRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAircraftChange_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitAircraftChangeRule* rule = _ruleFactory->GetCheckRule<LimitAircraftChangeRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

