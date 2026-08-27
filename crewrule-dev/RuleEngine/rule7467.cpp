#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7467/LimitRestTimeBetweenFlightsForSQRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkRestTimeBetweenFlightsForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitRestTimeBetweenFlightsForSQRule* rule = _ruleFactory->GetCheckRule<LimitRestTimeBetweenFlightsForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkRestTimeBetweenFlightsForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitRestTimeBetweenFlightsForSQRule* rule = _ruleFactory->GetCheckRule<LimitRestTimeBetweenFlightsForSQRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

