#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7227/CheckLayoverRestrictionRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkLayoverRestriction(RULE_LEGALITY* pCrew) {

	CheckLayoverRestrictionRule* rule = _ruleFactory->GetCheckRule<CheckLayoverRestrictionRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}

bool LegalityChecker::checkLayoverRestriction(Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckLayoverRestrictionRule* rule = _ruleFactory->GetCheckRule<CheckLayoverRestrictionRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkLayoverRestrictionForDuty(vector<Segment*> segments, RULE_LEGALITY* ruleLegality) {

	CheckLayoverRestrictionRule* rule = _ruleFactory->GetCheckRule<CheckLayoverRestrictionRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(segments);
}
