#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7246/LimitSameDeviceInProgramForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkSameDeviceInProgramForEvaFd(RULE_LEGALITY* pCrew) {

	LimitSameDeviceInProgramForEvaFdRule* rule = _ruleFactory->GetCheckRule<LimitSameDeviceInProgramForEvaFdRule>();
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
