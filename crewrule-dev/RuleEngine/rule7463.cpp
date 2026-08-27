#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7463/LimitSwingbackForSQRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkSwingbackForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitSwingbackForSQRule* rule = _ruleFactory->GetCheckRule<LimitSwingbackForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkSwingbackForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitSwingbackForSQRule* rule = _ruleFactory->GetCheckRule<LimitSwingbackForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

