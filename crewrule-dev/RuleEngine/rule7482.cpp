#include "RuleEngine.h"
#include "Utility.h"
#include "UtilFunc.h"
#include "rule7482/AcclimatizationForHXRule.h"
#include "rule7482/LimitTaskOnRecoveryPeriodForHXRule.h"
#include "spdlog/spdlog.h"
#include "RuleFactory.h"

using namespace std;


void LegalityChecker::setAcclimationStateForHX(Pairing* pairing) {
	if (this->isCheckPairingInRoster(AcclimatizationForHXRule::RuleFuncId, pairing->getDbId())) {
		//spdlog::info("[setAcclimationStateForHX] pairing id={}, roster is checked", pairing->getDbId());
		return;
	}
	//spdlog::info("[setAcclimationStateForHX] pairing id={}", pairing->getDbId());
	AcclimatizationForHXRule* rule = _ruleFactory->GetCalcRule<AcclimatizationForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

//PO在构建Duty阶段调用
void LegalityChecker::setAcclimationStateForHX(Duty* duty) {
	AcclimatizationForHXRule* rule = _ruleFactory->GetCalcRule<AcclimatizationForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setAcclimationStateForHX(RULE_LEGALITY * pCrew) {
	AcclimatizationForHXRule* rule = _ruleFactory->GetCalcRule<AcclimatizationForHXRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//spdlog::info("[setAcclimationStateForHX] pCrew roster id={}", roster->rosterId);
		rosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(AcclimatizationForHXRule::RuleFuncId, _dbData->crewList[pCrew->crewIndex]->rosterList);
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setAcclimationStateForHX(const vector<SharedPtr<ROSTER>>& rosters) {
	AcclimatizationForHXRule* rule = _ruleFactory->GetCalcRule<AcclimatizationForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->setDataContext(this->_dbData);
	rule->setApplication(this->_application);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		//spdlog::info("[setAcclimationStateForHX] rosters roster id={}", roster->rosterId);
		tmpRosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(AcclimatizationForHXRule::RuleFuncId, rosters);
	rule->CalculateDuty(tmpRosters);
}


bool LegalityChecker::checkTaskOnRecoveryPeriodForHX(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitTaskOnRecoveryPeriodForHXRule* rule = _ruleFactory->GetCheckRule<LimitTaskOnRecoveryPeriodForHXRule>();
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