#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7115/CheckMaxConsecutiveDutyRuleForIt.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMaxConsecutiveDayForIt(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMaxConsecutiveDutyRuleForIt* rule = _ruleFactory->GetCheckRule<CheckMaxConsecutiveDutyRuleForIt>();
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