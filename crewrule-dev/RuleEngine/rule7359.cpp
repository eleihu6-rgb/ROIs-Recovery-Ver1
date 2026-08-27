#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7359/CheckStandardFdpExtensionRestRequirementRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkStandardFdpExtensionRestRequirementFor5J(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckStandardFdpExtensionRestRequirementRule* rule = _ruleFactory->GetCheckRule<CheckStandardFdpExtensionRestRequirementRule>();
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