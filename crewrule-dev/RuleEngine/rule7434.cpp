#include "RuleEngine.h"
#include "Utility.h"

#include "RuleFactory.h"
#include "rule7434/MaxDutyPeriodRuleForSQ.h"

bool LegalityChecker::checkMaxDutyPeriod_SQ(const Pairing* pairing,
                                                        RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	MaxDutyPeriodRuleForSQ* rule =
	    _ruleFactory->GetCheckRule<MaxDutyPeriodRuleForSQ>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMaxDutyPeriod_SQ(const Duty* duty,
                                                        RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	MaxDutyPeriodRuleForSQ* rule =
	    _ruleFactory->GetCheckRule<MaxDutyPeriodRuleForSQ>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

