#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6100/CalculationOfOffDutyPeriodRule.h"
#include "RuleFactory.h"

void LegalityChecker::setDutyDiscretion2_QQ(Duty * duty) {
	CalculationOfOffDutyPeriodRule* rule = _ruleFactory->GetCalcRule<CalculationOfOffDutyPeriodRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setDutyDiscretion2_QQ(Pairing* pairing) {
	CalculationOfOffDutyPeriodRule* rule = _ruleFactory->GetCalcRule<CalculationOfOffDutyPeriodRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}