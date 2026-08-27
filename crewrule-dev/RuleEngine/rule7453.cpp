#include "RuleEngine.h"

#include "RuleFactory.h"
#include "rule7453/RequireSameCityAroundUlrDutyForSQRule.h"

bool LegalityChecker::checkSameCityAroundUlrDuty_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
    RequireSameCityAroundUlrDutyForSQRule* rule =
        _ruleFactory->GetCheckRule<RequireSameCityAroundUlrDutyForSQRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkSameCityAroundUlrDuty_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {
    RequireSameCityAroundUlrDutyForSQRule* rule =
        _ruleFactory->GetCheckRule<RequireSameCityAroundUlrDutyForSQRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(duty);
}
