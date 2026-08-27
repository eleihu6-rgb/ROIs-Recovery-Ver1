#include <tuple>

#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7502/CalculateCreditHoursForCARSRule.h"
#include "RuleFactory.h"

std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> LegalityChecker::getCreditHoursMandayForCARS(vector<SharedPtr<ROSTER>>& rosterList) {
	CalculateCreditHoursForCARSRule* rule = _ruleFactory->GetCalcRule<CalculateCreditHoursForCARSRule>();
	if (rule == nullptr) {
		return std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>>();
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->Calculate(rosters);
}
