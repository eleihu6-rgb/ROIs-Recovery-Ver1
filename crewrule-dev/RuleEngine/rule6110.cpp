#include "RuleEngine.h"
#include <iostream>
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6110/MinODPInPeriodForCcRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMinODPInPeriodForCc_QQ(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}
	MinODPInPeriodForCcRule* rule = _ruleFactory->GetCheckRule<MinODPInPeriodForCcRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setDataContext(this->_dbData);
	rule->setApplication(this->_application);
	rule->setDebugModel(this->DebugMode());
	rule->setRuleViolation(&(this->_rule_violations));
	rule->setViolations(&(this->_violations));
	rule->setRuleLegality(pCrew);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}