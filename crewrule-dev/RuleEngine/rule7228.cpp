#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7228/CalculateTrainingBriefAndDebriefForEvaFdRule.h"
#include "rule7228/CheckTrainingBriefAndDebriefForEvaFdRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateTrainingBriefAndDebrief(RULE_LEGALITY* pCrew) {
	CalculateTrainingBriefAndDebriefForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateTrainingBriefAndDebriefForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}

void LegalityChecker::calculateTrainingBriefAndDebrief(SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew) {
	CalculateTrainingBriefAndDebriefForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateTrainingBriefAndDebriefForEvaFdRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : crew->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(rosters);
}

bool LegalityChecker::checkTrainingBriefAndDebrief(RULE_LEGALITY* pCrew) {

	CheckTrainingBriefAndDebriefForEvaFdRule* rule = _ruleFactory->GetCheckRule<CheckTrainingBriefAndDebriefForEvaFdRule>();
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

