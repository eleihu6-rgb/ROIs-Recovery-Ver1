#include "RuleEngine.h"

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6041/CheckMaxNumberOfDPInRPForQQRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMaxNumberOfDPInRPForQQ(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMaxNumberOfDPInRPForQQRule* rule = _ruleFactory->GetCheckRule<CheckMaxNumberOfDPInRPForQQRule>();
	if (rule == nullptr) {
		return true;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->setRuleLegality(pCrew);
	return rule->CheckRule(rosters);
}