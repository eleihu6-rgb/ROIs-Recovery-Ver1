#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7464/LimitTransportLengthForSQRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkTransportLengthForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitTransportLengthForSQRule* rule = _ruleFactory->GetCheckRule<LimitTransportLengthForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkTransportLengthForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitTransportLengthForSQRule* rule = _ruleFactory->GetCheckRule<LimitTransportLengthForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

