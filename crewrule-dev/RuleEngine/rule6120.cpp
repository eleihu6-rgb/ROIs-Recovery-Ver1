#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule6120/CheckOffDutyPeriodRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkOffDutyPeriodForQQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckOffDutyPeriodRule* rule = _ruleFactory->GetCheckRule<CheckOffDutyPeriodRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkOffDutyPeriodForQQ(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckOffDutyPeriodRule* rule = _ruleFactory->GetCheckRule<CheckOffDutyPeriodRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

bool LegalityChecker::checkOffDutyPeriodForQQ(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckOffDutyPeriodRule* rule = _ruleFactory->GetCheckRule<CheckOffDutyPeriodRule>();
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

