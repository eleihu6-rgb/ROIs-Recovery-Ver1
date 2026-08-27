#include "RuleEngine.h"

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6039/CheckMinNumCrewRankRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMinNumOfCrewRank(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinNumCrewRankRule* rule = _ruleFactory->GetCheckRule<CheckMinNumCrewRankRule>();
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