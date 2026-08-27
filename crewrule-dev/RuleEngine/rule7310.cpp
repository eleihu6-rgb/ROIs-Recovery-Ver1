#include <tuple>

#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7310/CalculateDutyAloftInMandayForPRRule.h"
#include "RuleFactory.h"

map<time_t, int> LegalityChecker::getDutyAloftMandayForPR(vector<SharedPtr<ROSTER>>& rosterList) {
	CalculateDutyAloftInMandayForPRRule* rule = _ruleFactory->GetCalcRule<CalculateDutyAloftInMandayForPRRule>();
	if (rule == nullptr) {
		return map<time_t, int>();
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->Calculate(rosters);
}
