#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "CalculateRule.h"
#include "rule7485/CheckCompositionRequirementForHXRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkCompositionRequirement_HX(RULE_LEGALITY* pPairing) {

	CheckCompositionRequirementForHXRule* rule = _ruleFactory->GetCheckRule<CheckCompositionRequirementForHXRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pPairing);

	bool bLegal = true;


	if (this->GetApplication() == ROSTER_EDITOR && pPairing->crewIndex >= 0) {
		if (pPairing->PairingIndex < 0) return true;
		vector<SharedPtr<ROSTER>>& rosterList = this->_dbData->crewList[pPairing->crewIndex]->rosterList;
		std::vector<const ROSTER*> rosters;
		for (SharedPtr<ROSTER> roster : rosterList) {
			rosters.emplace_back(roster.get());
		}
		bLegal = rule->CheckRule(rosters);
	}
	else {
		if (pPairing->PairingIndex < 0) return true;
		const auto& pg = this->_dbData->pairingList[pPairing->PairingIndex];
		for (const auto& duty : pg->getDutyVec()) {
			Duty::DUTY_TYPE dtType = duty->getType();
			if (dtType == Duty::DUTY_PAIRING_REST || dtType == Duty::DUTY_BLANK_DAY) {
				continue;
			}
			rule->setRuleLegality(nullptr);
			bLegal = rule->CheckRule(duty);
		}
	}

	return true;
}

bool LegalityChecker::checkCompositionRequirement_HX(const Duty* duty) {

	CheckCompositionRequirementForHXRule* rule = _ruleFactory->GetCheckRule<CheckCompositionRequirementForHXRule>();
	if (rule == nullptr) {
		return true;
	}

	bool bLegal = true;
	Duty::DUTY_TYPE dtType = duty->getType();
	if (dtType == Duty::DUTY_PAIRING_REST || dtType == Duty::DUTY_BLANK_DAY) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	bLegal = rule->CheckRule(duty);

	return bLegal;
}