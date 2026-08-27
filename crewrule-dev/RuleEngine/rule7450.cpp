#include "RuleEngine.h"
#include "Utility.h"

#include "RuleFactory.h"
#include "rule7450/FdpSectorLimitForSQRule.h"

bool LegalityChecker::checkFdpSectorLimit_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
    FdpSectorLimitForSQRule* rule = _ruleFactory->GetCheckRule<FdpSectorLimitForSQRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkFdpSectorLimit_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
    FdpSectorLimitForSQRule* rule = _ruleFactory->GetCheckRule<FdpSectorLimitForSQRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(duty);
}
