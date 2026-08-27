#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7278/CalculateCourseFDPForTGRule.h"
#include "RuleFactory.h"


long LegalityChecker::CalculateCourseDutyFDPForTG(Duty* duty, SharedPtr<ROSTER> roster) {
	CalculateCourseFDPForTGRule* rule = _ruleFactory->GetCalcRule<CalculateCourseFDPForTGRule>();
	if (rule == nullptr) {
		return 0;
	}
	return rule->Calculate(duty, roster);
}


long LegalityChecker::CalculateCourseRosterGroundFDPForTG(SharedPtr<ROSTER> roster) {
	CalculateCourseFDPForTGRule* rule = _ruleFactory->GetCalcRule<CalculateCourseFDPForTGRule>();
	if (rule == nullptr) {
		return 0;
	};
	return rule->Calculate(roster);
}