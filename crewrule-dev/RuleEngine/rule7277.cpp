#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7277/CheckDisruptiveScheduleRERRPForTGRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkDisruptiveSchedulesRERRPForTG(RULE_LEGALITY* pCrew) {

	CheckDisruptiveScheduleRERRPForTGRule* rule = _ruleFactory->GetCheckRule<CheckDisruptiveScheduleRERRPForTGRule>();
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
