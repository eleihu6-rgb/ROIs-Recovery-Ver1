#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6009/CheckFdpAndFtDiscretionForCCRule.h"
#include "rule6009/CalculateFdpAndFtDiscretionForCCRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkFdpAndFtDiscretionForCC_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckFdpAndFtDiscretionForCCRule* rule = _ruleFactory->GetCheckRule<CheckFdpAndFtDiscretionForCCRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkFdpAndFtDiscretionForCC_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckFdpAndFtDiscretionForCCRule* rule = _ruleFactory->GetCheckRule<CheckFdpAndFtDiscretionForCCRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

void LegalityChecker::setFdpAndFtDiscretionForCC_QQ(Duty * duty) {
	CalculateFdpAndFtDiscretionForCCRule* rule = _ruleFactory->GetCalcRule<CalculateFdpAndFtDiscretionForCCRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setFdpAndFtDiscretionForCC_QQ(Pairing* pairing) {
	CalculateFdpAndFtDiscretionForCCRule* rule = _ruleFactory->GetCalcRule<CalculateFdpAndFtDiscretionForCCRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}