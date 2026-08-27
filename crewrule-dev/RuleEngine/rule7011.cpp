#include "RuleEngine.h"
#include "Utility.h"
#include <iostream>
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7011/CheckCrewCountryLimitationRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CrewCountryLimitation(RULE_LEGALITY * pCrew) {
	CheckCrewCountryLimitationRule* rule = _ruleFactory->GetCheckRule<CheckCrewCountryLimitationRule>();
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

bool LegalityChecker::CheckCrewCountryLimitationForPairing(SharedPtr<CREW> crew, Pairing* pairing) {
	CheckCrewCountryLimitationRule* rule = _ruleFactory->GetCheckRule<CheckCrewCountryLimitationRule>();
	if (rule == nullptr) {
		return true;
	}
	//rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	return rule->CheckRuleForPairing(crew, pairing);
}
