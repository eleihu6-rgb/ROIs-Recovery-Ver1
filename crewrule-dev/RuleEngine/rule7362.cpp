#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7362/LimitAreaEntryCountForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkAreaEntryCountForPR(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitAreaEntryCountForPRRule* rule = _ruleFactory->GetCheckRule<LimitAreaEntryCountForPRRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAreaEntryCountForPR(const Duty* duty, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitAreaEntryCountForPRRule* rule = _ruleFactory->GetCheckRule<LimitAreaEntryCountForPRRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

bool LegalityChecker::checkAreaEntryCountForPR(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitAreaEntryCountForPRRule* rule = _ruleFactory->GetCheckRule<LimitAreaEntryCountForPRRule>();
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