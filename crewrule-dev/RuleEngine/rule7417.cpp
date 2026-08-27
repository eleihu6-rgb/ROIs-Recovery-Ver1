#include "RuleEngine.h"
#include "CrewDB.h"

#include "rule7417/CheckAnrReportingDebriefRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkAnrReportingDebrief_ANR(
    Pairing* pairing,
    RULE_LEGALITY* ruleLegality) {
    CheckAnrReportingDebriefRule* rule =
        _ruleFactory->GetCheckRule<CheckAnrReportingDebriefRule>();
    if (rule == nullptr || pairing == nullptr) {
        return true;
    }

    if (ruleLegality) {
        rule->setRuleLegality(ruleLegality);
    }
    return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAnrReportingDebrief_ANR(RULE_LEGALITY* pCrew) {
    if (pCrew == nullptr || pCrew->crewIndex < 0) {
        return true;
    }

    CheckAnrReportingDebriefRule* rule =
        _ruleFactory->GetCheckRule<CheckAnrReportingDebriefRule>();
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
