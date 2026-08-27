#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6019/LimitTransitAndLayoverRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkTransitAndLayover_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitTransitAndLayoverRule* rule = _ruleFactory->GetCheckRule<LimitTransitAndLayoverRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkTransitAndLayover_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitTransitAndLayoverRule* rule = _ruleFactory->GetCheckRule<LimitTransitAndLayoverRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

