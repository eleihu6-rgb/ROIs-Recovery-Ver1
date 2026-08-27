#include "RuleEngine.h"
#include "Utility.h"
#include <iostream>
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6115/CheckMaxConsecutiveDayRule.h"
#include "rule6115/CheckMaxConsecutiveDayRuleParam.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMaxConsecutiveDutyDay_QQ(RULE_LEGALITY * pCrew) {
	CheckMaxConsecutiveDayRule* rule = _ruleFactory->GetCheckRule<CheckMaxConsecutiveDayRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}