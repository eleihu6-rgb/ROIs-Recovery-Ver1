#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7460/RestrictMidDutyBaseTurnRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkRestrictMidDutyBaseTurn_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	RestrictMidDutyBaseTurnRule* rule = _ruleFactory->GetCheckRule<RestrictMidDutyBaseTurnRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkRestrictMidDutyBaseTurn_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	RestrictMidDutyBaseTurnRule* rule = _ruleFactory->GetCheckRule<RestrictMidDutyBaseTurnRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}
