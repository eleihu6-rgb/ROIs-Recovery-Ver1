#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7504/CheckMinSpaceBetweenDutyForF8Rule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMinSpaceBetweenDutyForF8(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinSpaceBetweenDutyForF8Rule* rule = _ruleFactory->GetCheckRule<CheckMinSpaceBetweenDutyForF8Rule>();
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

bool LegalityChecker::checkMinSpaceBetweenDutyForF8(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	CheckMinSpaceBetweenDutyForF8Rule* rule = _ruleFactory->GetCheckRule<CheckMinSpaceBetweenDutyForF8Rule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}
