#include "RuleEngine.h"

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6109/MinOffDutyPeriodForCcRule.h"
#include "RuleFactory.h"

void LegalityChecker::setDutyDiscretion_QQ(Duty * duty) {
	MinOffDutyPeriodForCcRule* rule = _ruleFactory->GetCalcRule<MinOffDutyPeriodForCcRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setDutyDiscretion_QQ(Pairing* pairing) {
	MinOffDutyPeriodForCcRule* rule = _ruleFactory->GetCalcRule<MinOffDutyPeriodForCcRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}
