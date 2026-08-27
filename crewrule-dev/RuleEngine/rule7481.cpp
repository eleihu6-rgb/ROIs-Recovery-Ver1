#include "RuleEngine.h"
#include "Utility.h"
#include "UtilFunc.h"
#include "rule7481/CalculateRedEyeDutyForHXRule.h"
#include "spdlog/spdlog.h"
#include "RuleFactory.h"

using namespace std;


void LegalityChecker::setRedEyeDutyForHX(Pairing* pairing) {
	if (this->isCheckPairingInRoster(CalculateRedEyeDutyForHXRule::RuleFuncId, pairing->getDbId())) {
		//spdlog::info("[setRedEyeDutyForHX] pairing id={}, roster is checked", pairing->getDbId());
		return;
	}
	//spdlog::info("[setRedEyeDutyForHX] pairing id={}", pairing->getDbId());
	CalculateRedEyeDutyForHXRule* rule = _ruleFactory->GetCalcRule<CalculateRedEyeDutyForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

//PO在构建Duty阶段调用
void LegalityChecker::setRedEyeDutyForHX(Duty* duty) {
	CalculateRedEyeDutyForHXRule* rule = _ruleFactory->GetCalcRule<CalculateRedEyeDutyForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setRedEyeDutyForHX(RULE_LEGALITY * pCrew) {
	CalculateRedEyeDutyForHXRule* rule = _ruleFactory->GetCalcRule<CalculateRedEyeDutyForHXRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//spdlog::info("[setRedEyeDutyForHX] pCrew roster id={}", roster->rosterId);
		rosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(CalculateRedEyeDutyForHXRule::RuleFuncId, _dbData->crewList[pCrew->crewIndex]->rosterList);
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setRedEyeDutyForHX(const vector<SharedPtr<ROSTER>>& rosters) {
	CalculateRedEyeDutyForHXRule* rule = _ruleFactory->GetCalcRule<CalculateRedEyeDutyForHXRule>();
	if (rule == nullptr) {
		return;
	}
	rule->setDataContext(this->_dbData);
	rule->setApplication(this->_application);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		//spdlog::info("[setRedEyeDutyForHX] rosters roster id={}", roster->rosterId);
		tmpRosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(CalculateRedEyeDutyForHXRule::RuleFuncId, rosters);
	rule->CalculateDuty(tmpRosters);
}
