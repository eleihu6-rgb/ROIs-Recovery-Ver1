#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule0000/CheckGeneralRule.h"
#include "RuleFactory.h"

void LegalityChecker::calculateGeneralRule(Pairing* pairing) {
	auto duty = pairing->getLastDuty();
	if (duty != nullptr) {
		duty->setActualRest(duty->getMinRest());
	}
}

void LegalityChecker::calculateGeneralRule(vector<Duty*>& duties) {
	if (duties.empty()) {
		return;
	}
	auto duty = duties.back();
	if (duty != nullptr) {
		duty->setActualRest(duty->getMinRest());
	}
}

void LegalityChecker::calculateGeneralRule(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		if (roster->pairing == nullptr) {
			continue;
		}
		//TODO 暂时不需处理
	}
}


bool LegalityChecker::checkGeneralRule(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckGeneralRule* rule = _ruleFactory->GetCheckRule<CheckGeneralRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkGeneralRule(const Duty* duty, RULE_LEGALITY* ruleLegality) {

	CheckGeneralRule* rule = _ruleFactory->GetCheckRule<CheckGeneralRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(duty);
}

bool LegalityChecker::checkGeneralRule(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckGeneralRule* rule = _ruleFactory->GetCheckRule<CheckGeneralRule>();
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