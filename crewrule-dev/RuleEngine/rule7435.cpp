#include "RuleEngine.h"
#include "Utility.h"

#include "RuleFactory.h"
#include "rule7435/MinPairingDaysForUlrStandbyRule.h"

bool LegalityChecker::checkUlrStandbyMinPairingDays_SQ(const Pairing* pairing,
                                                       RULE_LEGALITY* ruleLegality) {
    MinPairingDaysForUlrStandbyRule* rule =
        _ruleFactory->GetCheckRule<MinPairingDaysForUlrStandbyRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(pairing);
}
