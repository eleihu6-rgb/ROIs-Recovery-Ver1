#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7218/CalculatePerDiemHoursInMandayForEvaFdRule.h"
#include "RuleFactory.h"

std::tuple<map<time_t, MandayPerDiem>, map<long long, PerDiem>> LegalityChecker::getPerDiemHourForEvaFd(vector<SharedPtr<ROSTER>>& rosterList) {
	CalculatePerDiemHoursInMandayForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculatePerDiemHoursInMandayForEvaFdRule>();
	if (rule == nullptr) {
		return std::tuple<map<time_t, MandayPerDiem>, map<long long, PerDiem>>();
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->Calculate(rosters);
}