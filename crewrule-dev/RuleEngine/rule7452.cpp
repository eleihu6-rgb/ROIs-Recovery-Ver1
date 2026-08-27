#include "RuleEngine.h"
#include "Utility.h"

#include "RuleFactory.h"
#include "rule7452/UlrFdpClassificationMismatchForSQRule.h"

bool LegalityChecker::checkUlrFdpClassificationMismatch_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
    UlrFdpClassificationMismatchForSQRule* rule =
        _ruleFactory->GetCheckRule<UlrFdpClassificationMismatchForSQRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkUlrFdpClassificationMismatch_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
    UlrFdpClassificationMismatchForSQRule* rule =
        _ruleFactory->GetCheckRule<UlrFdpClassificationMismatchForSQRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(duty);
}
