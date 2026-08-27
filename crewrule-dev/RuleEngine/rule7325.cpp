

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7325/CheckMinNumberOfDaysOffForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMinNumberOfDaysOffForPR(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinNumberOfDaysOffForPRRule* rule = _ruleFactory->GetCheckRule<CheckMinNumberOfDaysOffForPRRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}

std::vector<std::vector<EnumerationOccupationStatus>> LegalityChecker::GetAvailableEnumerationOccupationStatus(RULE_LEGALITY* pCrew) {

	auto rule = _ruleFactory->GetCheckRule<CheckMinNumberOfDaysOffForPRRule>();
	if (rule == nullptr) {
		return {};
	}
	rule->setRuleLegality(pCrew);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->GetAvailableEnumerationOccupationStatus(_dbData->crewList[pCrew->crewIndex], rosters);
}

void LegalityChecker::preCalculateEnumerationDOPatternCache() {
	auto rule = _ruleFactory->GetCheckRule<CheckMinNumberOfDaysOffForPRRule>();
	if (rule == nullptr) {
		return;
	}
	return rule->PreCalculateCache();
}