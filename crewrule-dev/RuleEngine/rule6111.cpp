#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6111/CheckRestDiscretionRule.h"
#include "rule6111/CalculateRestDiscretionRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkRestDiscretion_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckRestDiscretionRule* rule = _ruleFactory->GetCheckRule<CheckRestDiscretionRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkRestDiscretion_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckRestDiscretionRule* rule = _ruleFactory->GetCheckRule<CheckRestDiscretionRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

void LegalityChecker::setRestDiscretion_QQ(Duty * duty) {

	CalculateRestDiscretionRule* rule = _ruleFactory->GetCalcRule<CalculateRestDiscretionRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setRestDiscretion_QQ(Pairing* pairing) {
	CalculateRestDiscretionRule* rule = _ruleFactory->GetCalcRule<CalculateRestDiscretionRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}