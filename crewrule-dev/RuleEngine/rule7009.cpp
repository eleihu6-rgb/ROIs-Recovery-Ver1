#include "RuleEngine.h"
#include "Utility.h"
#include <iostream>
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7009/CheckSingleDutyPerDayRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckSingleDutyPerDay (RULE_LEGALITY * pCrew) {
	CheckSingleDutyPerDayRule* rule = _ruleFactory->GetCheckRule<CheckSingleDutyPerDayRule>();
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

bool LegalityChecker::CheckSingleDutyPerDay(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckSingleDutyPerDayRule* rule = _ruleFactory->GetCheckRule<CheckSingleDutyPerDayRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(pairing->getDutyVec());
}
