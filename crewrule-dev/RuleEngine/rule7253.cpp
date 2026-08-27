#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7253/LimitLegAndStationForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkLegAndStationForEvaFd(RULE_LEGALITY* pCrew) {

	LimitLegAndStationForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitLegAndStationForEvaFdRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	//std::vector<const ROSTER*> rosters;
	//for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
	//	rosters.emplace_back(roster.get());
	//}
	return rule->CheckRule(_dbData->crewList[pCrew->crewIndex]);
}
