#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7273/CheckMinConnectInDutyRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkMinConnectInDutyRuleForEva(RULE_LEGALITY* pCrew) {

	CheckMinConnectInDutyRule* rule = _ruleFactory->GetCheckRule<CheckMinConnectInDutyRule>();
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

bool LegalityChecker::checkMinConnectInDutyRuleForEva(const vector<Duty*>& duties) {

	CheckMinConnectInDutyRule* rule = _ruleFactory->GetCheckRule<CheckMinConnectInDutyRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(duties);

}

bool LegalityChecker::checkMinConnectInDutyRuleForEva(const vector<Segment*>& segments) {

	CheckMinConnectInDutyRule* rule = _ruleFactory->GetCheckRule<CheckMinConnectInDutyRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(segments);

}