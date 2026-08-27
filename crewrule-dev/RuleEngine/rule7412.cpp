

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7412/CheckMinimumRestPeriodForSQRule.h"
#include "rule7412/CalculateMinimumRestPeriodForSQRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMinimumRestPeriodForSQRule(const Pairing* pairing, RULE_LEGALITY* ruleLegality)
{
//    CalculateCheckInMinRestForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateCheckInMinRestForEvaFdRule>();
    CheckMinimumRestPeriodForSQRule* rule = _ruleFactory->GetCheckRule<CheckMinimumRestPeriodForSQRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkMinimumRestPeriodForSQRule(RULE_LEGALITY* pCrew)
{
    if (pCrew->crewIndex < 0)
    {
        return true;
    }

    CheckMinimumRestPeriodForSQRule* rule = _ruleFactory->GetCheckRule<CheckMinimumRestPeriodForSQRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(pCrew);
    std::vector<const ROSTER*> rosters;
    for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
        rosters.emplace_back(roster.get());
    }
    return rule->CheckRule(rosters);
}

bool LegalityChecker::checkMinimumRestPeriodForSQRule(std::vector<Duty*>& duties, RULE_LEGALITY* ruleLegality) {
    CheckMinimumRestPeriodForSQRule* rule = _ruleFactory->GetCheckRule<CheckMinimumRestPeriodForSQRule>();
    if (rule == nullptr) {
        return true;
    }
    rule->setRuleLegality(ruleLegality);
    return rule->CheckRule(duties);
}

void LegalityChecker::setMinimumRestPeriodForSQRule(Duty* duty) {
    CalculateMinimumRestPeriodForSQRule* rule = _ruleFactory->GetCalcRule<CalculateMinimumRestPeriodForSQRule>();
    if (rule == nullptr) {
        return;
    }
    rule->CalculateDuty(duty);
}

void LegalityChecker::setMinimumRestPeriodForSQRule(Pairing* pairing) {
    CalculateMinimumRestPeriodForSQRule* rule = _ruleFactory->GetCalcRule<CalculateMinimumRestPeriodForSQRule>();
    if (rule == nullptr) {
        return;
    }
    rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinimumRestPeriodForSQRule(SharedPtr<ROSTER> roster) {
    CalculateMinimumRestPeriodForSQRule* rule = _ruleFactory->GetCalcRule<CalculateMinimumRestPeriodForSQRule>();
    if (rule == nullptr) {
        return;
    }
    std::vector<const ROSTER*> rosters;
    rosters.emplace_back(roster.get());
    rule->CalculateDuty(rosters);
}
