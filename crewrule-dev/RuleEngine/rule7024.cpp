

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7024/CheckMinRestAtBaseForTGRule.h"
#include "rule7024/CalculateAccStartAtBaseForRTRule.h"
#include "rule7024/CalculateMinRestAtBaseForTGRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkMinRestAtBaseForTG(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckMinRestAtBaseForTGRule* rule = _ruleFactory->GetCheckRule<CheckMinRestAtBaseForTGRule>();
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

void LegalityChecker::setMinRestAtBaseForTG(Pairing* pairing) {
	CalculateMinRestAtBaseForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAtBaseForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

void LegalityChecker::setMinRestAtBaseForTG(vector<SharedPtr<ROSTER>> rosters) {
	CalculateMinRestAtBaseForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAtBaseForTGRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rostersPtr;
	for (const SharedPtr<ROSTER>& roster : rosters) {
		rostersPtr.emplace_back(roster.get());
	}
	rule->CalculateDuty(rostersPtr);
}

void LegalityChecker::setMinRestAtBaseForTG(SharedPtr<ROSTER> roster) {
	CalculateMinRestAtBaseForTGRule* rule = _ruleFactory->GetCalcRule<CalculateMinRestAtBaseForTGRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setAccStartAtBaseForRT(SharedPtr<ROSTER> roster) {
	CalculateAccStartAtBaseForRTRule* rule = _ruleFactory->GetCalcRule<CalculateAccStartAtBaseForRTRule>("ACC");
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	rosters.emplace_back(roster.get());
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setAccStartAtBaseForRT(vector<SharedPtr<ROSTER>> rosters) {
	CalculateAccStartAtBaseForRTRule* rule = _ruleFactory->GetCalcRule<CalculateAccStartAtBaseForRTRule>("ACC");
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rostersPtr;
	for (const SharedPtr<ROSTER>& roster : rosters) {
		rostersPtr.emplace_back(roster.get());
	}
	rule->CalculateDuty(rostersPtr);
}
