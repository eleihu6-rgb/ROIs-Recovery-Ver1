#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule6022/CalculateDutyTimeForDelayedFlightRule.h"
#include "RuleFactory.h"

void LegalityChecker:: setPairingDutyTimesForDelayedFlight_QQ(Duty * duty) {
    CalculateDutyTimeForDelayedFlightRule* rule = _ruleFactory->GetCalcRule<CalculateDutyTimeForDelayedFlightRule>();
    if (rule == nullptr) {
        return;
    }
    rule->CalculateDuty(duty);
}

void LegalityChecker:: setPairingDutyTimesForDelayedFlight_QQ(Pairing* pairing) {
    CalculateDutyTimeForDelayedFlightRule* rule = _ruleFactory->GetCalcRule<CalculateDutyTimeForDelayedFlightRule>();
    if (rule == nullptr) {
        return;
    }
    rule->CalculateDuty(pairing);
}