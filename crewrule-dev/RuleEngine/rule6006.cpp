#include "RuleEngine.h"

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6006/CalculateAirportRestFaciltyRule.h"
#include "RuleFactory.h"

void LegalityChecker::setAirportRestFacilty_QQ(Duty * duty) {
	CalculateAirportRestFaciltyRule* rule = _ruleFactory->GetCalcRule<CalculateAirportRestFaciltyRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setAirportRestFacilty_QQ(Pairing * pairing) {
	CalculateAirportRestFaciltyRule* rule = _ruleFactory->GetCalcRule<CalculateAirportRestFaciltyRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}