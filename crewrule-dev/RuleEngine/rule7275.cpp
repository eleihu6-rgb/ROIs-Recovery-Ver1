#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7275/CheckDaysOffForTradeRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkDaysOffForTrade(RULE_LEGALITY* pCrew) {

	CheckDaysOffForTradeRule* rule = _ruleFactory->GetCheckRule<CheckDaysOffForTradeRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	
	return rule->CheckRule(_dbData->crewList[pCrew->crewIndex]->rosterList);
}
