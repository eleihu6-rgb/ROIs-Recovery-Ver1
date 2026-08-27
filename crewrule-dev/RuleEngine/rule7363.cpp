#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7363/CalculateInexperiencedCrewFor5JRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateInexperiencedCrewFor5J(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return;
	}

	CalculateInexperiencedCrewFor5JRule* rule = _ruleFactory->GetCalcRule<CalculateInexperiencedCrewFor5JRule>();
	if (rule == nullptr) {
		return;
	}
	rule->setRuleLegality(pCrew);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	const auto& crewId = _dbData->crewList[pCrew->crewIndex]->idCrew;
	rule->Calculate(rosters, crewId);
}

void LegalityChecker::calculateInexperiencedCrewFor5J(std::shared_ptr<CREW>& crew) {
	CalculateInexperiencedCrewFor5JRule* rule = _ruleFactory->GetCalcRule<CalculateInexperiencedCrewFor5JRule>();
	if (rule == nullptr) {
		return;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : crew->rosterList) {
		rosters.emplace_back(roster.get());
	}
	const auto& crewId = crew->idCrew;
	rule->Calculate(rosters, crewId);
}