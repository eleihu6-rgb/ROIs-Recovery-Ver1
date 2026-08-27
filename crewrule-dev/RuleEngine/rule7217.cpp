#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7217/CalculatePairingPerDiemHoursForEvaFdRule.h"
#include "RuleFactory.h"

PerDiem LegalityChecker::getPairingPerDiemHourForEvaFd(Pairing* pairing) {
	CalculatePairingPerDiemHoursForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculatePairingPerDiemHoursForEvaFdRule>();
	if (rule == nullptr) {
		return PerDiem();
	}
	return rule->Calculate(pairing);
}
