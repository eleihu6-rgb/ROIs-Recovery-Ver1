#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule7494/LimitFleetSectorByQaulificationForHXRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkFleetSectorByQaulificationForHX(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitFleetSectorByQaulificationForHXRule* rule = _ruleFactory->GetCheckRule<LimitFleetSectorByQaulificationForHXRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}
