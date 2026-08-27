#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7323/CheckMinSpaceBetweenDutyForRPRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMinSpaceBetweenDutyForPR(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinSpaceBetweenDutyForRPRule* rule = _ruleFactory->GetCheckRule<CheckMinSpaceBetweenDutyForRPRule>();
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

bool LegalityChecker::checkMinSpaceBetweenDutyForPR(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	CheckMinSpaceBetweenDutyForRPRule* rule = _ruleFactory->GetCheckRule<CheckMinSpaceBetweenDutyForRPRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}