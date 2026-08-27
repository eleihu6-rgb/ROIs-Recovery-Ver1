#include "RuleEngine.h"
#include "Utility.h"
#include "StringUtil.h"
#include "rule7007/CheckMinRestRule.h"
#include "RuleFactory.h"

bool LegalityChecker::CheckMinRestInRangeRule(RULE_LEGALITY * pCrew) {
	CheckMinRestRule* rule = _ruleFactory->GetCheckRule<CheckMinRestRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}
	
	return rule->CheckRule(_dbData->crewList[pCrew->crewIndex]->rosterList);
}
