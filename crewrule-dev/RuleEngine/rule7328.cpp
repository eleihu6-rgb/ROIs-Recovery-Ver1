#include <tuple>

#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7328/CalculateCreditHoursInMandayForPRRule.h"
#include "RuleFactory.h"

std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> LegalityChecker::getCreditHoursMandayForPR(vector<SharedPtr<ROSTER>>& rosterList) {
	CalculateCreditHoursInMandayForPRRule* rule = _ruleFactory->GetCalcRule<CalculateCreditHoursInMandayForPRRule>();
	if (rule == nullptr) {
		return std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>>();
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->Calculate(rosters);
}
