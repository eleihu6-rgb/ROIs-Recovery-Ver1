#include "RuleEngine.h"
#include "Utility.h"

#include "RuleFactory.h"
#include "rule7400/AcclimatizationOfANRRule.h"

using namespace std;

void LegalityChecker::setAcclimationStateOfANR(Pairing* pairing) {
    AcclimatizationOfANRRule* rule = _ruleFactory->GetCalcRule<AcclimatizationOfANRRule>();
    if (rule == nullptr) {
        return;
    }
    rule->CalculateDuty(pairing);
}

void LegalityChecker::setAcclimationStateOfANR(Duty* duty) {
    AcclimatizationOfANRRule* rule = _ruleFactory->GetCalcRule<AcclimatizationOfANRRule>();
    if (rule == nullptr) {
        return;
    }
    rule->CalculateDuty(duty);
}

void LegalityChecker::setAcclimationStateOfANR(RULE_LEGALITY* pCrew) {
    AcclimatizationOfANRRule* rule = _ruleFactory->GetCalcRule<AcclimatizationOfANRRule>();
    if (rule == nullptr) {
        return;
    }
    std::vector<const ROSTER*> rosters;
    for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
        rosters.emplace_back(roster.get());
    }
    rule->CalculateDuty(rosters);
}

void LegalityChecker::setAcclimationStateOfANR(const vector<SharedPtr<ROSTER>>& rosters) {
    AcclimatizationOfANRRule* rule = _ruleFactory->GetCalcRule<AcclimatizationOfANRRule>();
    if (rule == nullptr) {
        return;
    }
    rule->setDataContext(this->_dbData);
    rule->setApplication(this->_application);
    std::vector<const ROSTER*> tmpRosters;
    for (SharedPtr<ROSTER> roster : rosters) {
        tmpRosters.emplace_back(roster.get());
    }
    rule->CalculateDuty(tmpRosters);
}

