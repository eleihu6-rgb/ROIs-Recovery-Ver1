#include "RuleEngine.h"

#include "RuleFactory.h"
#include "rule7421/AcopSlipPatternRule.h"

bool LegalityChecker::checkAcopSlipPatternTableB_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
    AcopSlipPatternRule* rule = _ruleFactory->GetCheckRule<AcopSlipPatternRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAcopSlipPatternTableB_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
    AcopSlipPatternRule* rule = _ruleFactory->GetCheckRule<AcopSlipPatternRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(duty);
}

