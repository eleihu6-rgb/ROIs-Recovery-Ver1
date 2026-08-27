#include "RuleEngine.h"
#include "Utility.h"
#include "UtilFunc.h"
#include "rule6005/AcclimatizationRule.h"
#include "spdlog/spdlog.h"
#include "RuleFactory.h"

using namespace std;


void LegalityChecker::setAcclimationState_QQ(Pairing* pairing) {
	if (this->isCheckPairingInRoster(AcclimatizationRule::RuleFuncId, pairing->getDbId())) {
		//spdlog::info("[setAcclimationState_QQ] pairing id={}, roster is checked", pairing->getDbId());
		return;
	}
	//spdlog::info("[setAcclimationState_QQ] pairing id={}", pairing->getDbId());
	AcclimatizationRule* rule = _ruleFactory->GetCalcRule<AcclimatizationRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

//PO在构建Duty阶段调用
void LegalityChecker::setAcclimationState_QQ(Duty* duty) {
	AcclimatizationRule* rule = _ruleFactory->GetCalcRule<AcclimatizationRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setAcclimationState_QQ(RULE_LEGALITY * pCrew) {
	AcclimatizationRule* rule = _ruleFactory->GetCalcRule<AcclimatizationRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//spdlog::info("[setAcclimationState_QQ] pCrew roster id={}", roster->rosterId);
		rosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(AcclimatizationRule::RuleFuncId, _dbData->crewList[pCrew->crewIndex]->rosterList);
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setAcclimationState_QQ(const vector<SharedPtr<ROSTER>>& rosters) {
	AcclimatizationRule* rule = _ruleFactory->GetCalcRule<AcclimatizationRule>();
	if (rule == nullptr) {
		return;
	}
	rule->setDataContext(this->_dbData);
	rule->setApplication(this->_application);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		//spdlog::info("[setAcclimationState_QQ] rosters roster id={}", roster->rosterId);
		tmpRosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(AcclimatizationRule::RuleFuncId, rosters);
	rule->CalculateDuty(tmpRosters);
}
