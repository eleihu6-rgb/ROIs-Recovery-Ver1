#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7373/CalculateGroundRosterMinRestFor5JRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateGroundRosterMinRestFor5J(SharedPtr<ROSTER> roster) {
	CalculateGroundRosterMinRestFor5JRule* rule = _ruleFactory->GetCalcRule<CalculateGroundRosterMinRestFor5JRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::calculateGroundRosterMinRestFor5J(vector<SharedPtr<ROSTER>> rosters) {
	CalculateGroundRosterMinRestFor5JRule* rule = _ruleFactory->GetCalcRule<CalculateGroundRosterMinRestFor5JRule>();
	if (rule == nullptr) {
		return;
	}
	if (rosters.empty())
		return;
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		tmpRosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(tmpRosters);
}