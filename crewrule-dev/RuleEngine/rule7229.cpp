#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7229/CheckPassportAndVisaForEvaFdRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkPassportAndVisaForEva(RULE_LEGALITY* pCrew) {
	CheckPassportAndVisaForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckPassportAndVisaForEvaFdRule>();
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