#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6008/CheckFdpAndFtDiscretionForFdRule.h"
#include "rule6008/CalculateFdpAndFtDiscretionForFdRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkFdpAndFtDiscretionForFd_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckFdpAndFtDiscretionForFdRule* rule = _ruleFactory->GetCheckRule<CheckFdpAndFtDiscretionForFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkFdpAndFtDiscretionForFd_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckFdpAndFtDiscretionForFdRule* rule = _ruleFactory->GetCheckRule<CheckFdpAndFtDiscretionForFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

void LegalityChecker::setFdpAndFtDiscretionForFd_QQ(Duty * duty) {
	CalculateFdpAndFtDiscretionForFdRule* rule = _ruleFactory->GetCalcRule<CalculateFdpAndFtDiscretionForFdRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setFdpAndFtDiscretionForFd_QQ(Pairing* pairing) {
	CalculateFdpAndFtDiscretionForFdRule* rule = _ruleFactory->GetCalcRule<CalculateFdpAndFtDiscretionForFdRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}
