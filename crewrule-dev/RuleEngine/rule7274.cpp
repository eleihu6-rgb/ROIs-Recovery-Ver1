#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7274/CheckIOEPhaseFlightCompositionRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkIOEPhaseFlightComposition(RULE_LEGALITY* pCrew) {

	CheckIOEPhaseFlightCompositionRule* rule = _ruleFactory->GetCheckRule<CheckIOEPhaseFlightCompositionRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}
