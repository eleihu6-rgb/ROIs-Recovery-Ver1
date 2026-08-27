#include "RuleEngine.h"

#include "RuleFactory.h"
#include "rule7420/AcopFdpPatternRule.h"

bool LegalityChecker::checkAcopFdpPatternTableA_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
    AcopFdpPatternRule* rule = _ruleFactory->GetCheckRule<AcopFdpPatternRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAcopFdpPatternTableA_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
    AcopFdpPatternRule* rule = _ruleFactory->GetCheckRule<AcopFdpPatternRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(duty);
}

