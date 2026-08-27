#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7317/CalculateFdpAndExtensionFor5JRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateDutyFdpAndExtensionFor5J(Duty* duty) {
	CalculateFdpAndExtensionFor5JRule* rule = _ruleFactory->GetCalcRule<CalculateFdpAndExtensionFor5JRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}