#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule7264/CheckSchTimeAbnlForEvaFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkSchTimeAbnormality(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	CheckSchTimeAbnlForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchTimeAbnlForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkSchTimeAbnormality(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	CheckSchTimeAbnlForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckSchTimeAbnlForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

