#include <tuple>

#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7224/CalculateFreighterCreditHoursInMandayForEvaFdRule.h"
#include "RuleFactory.h"

std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> LegalityChecker::getFreighterCreditHoursMandayForEvaFd(vector<SharedPtr<ROSTER>>& rosterList) {
	CalculateFreighterCreditHoursInMandayForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateFreighterCreditHoursInMandayForEvaFdRule>();
	if (rule == nullptr) {
		return std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>>();
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->Calculate(rosters);
}