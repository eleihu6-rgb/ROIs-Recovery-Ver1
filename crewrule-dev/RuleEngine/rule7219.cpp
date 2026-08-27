#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7219/CalculateWorkingHourInMandayForEvaFdRule.h"
#include "RuleFactory.h"

std::tuple<map<time_t, double>, map<long long, double>> LegalityChecker::getWorkingHourForEvaFd(vector<SharedPtr<ROSTER>>& rosterList) {
	CalculateWorkingHourInMandayForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateWorkingHourInMandayForEvaFdRule>();
	if (rule == nullptr) {
		return std::tuple<map<time_t, double>, map<long long, double>>();
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->Calculate(rosters);
}