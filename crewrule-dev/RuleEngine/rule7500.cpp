#include "RuleEngine.h"
#include "Utility.h"
#include "UtilFunc.h"
#include "rule7500/AcclimatizationForCARSRule.h"
#include "spdlog/spdlog.h"
#include "RuleFactory.h"

using namespace std;


void LegalityChecker::setAcclimationStateForCARS(Pairing* pairing) {
	if (this->isCheckPairingInRoster(AcclimatizationForCARSRule::RuleFuncId, pairing->getDbId())) {
		//spdlog::info("[setAcclimationStateForCARS] pairing id={}, roster is checked", pairing->getDbId());
		return;
	}
	//spdlog::info("[setAcclimationStateForCARS] pairing id={}", pairing->getDbId());
	AcclimatizationForCARSRule* rule = _ruleFactory->GetCalcRule<AcclimatizationForCARSRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

//PO在构建Duty阶段调用
void LegalityChecker::setAcclimationStateForCARS(Duty* duty) {
	AcclimatizationForCARSRule* rule = _ruleFactory->GetCalcRule<AcclimatizationForCARSRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setAcclimationStateForCARS(RULE_LEGALITY * pCrew) {
	AcclimatizationForCARSRule* rule = _ruleFactory->GetCalcRule<AcclimatizationForCARSRule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//spdlog::info("[setAcclimationStateForCARS] pCrew roster id={}", roster->rosterId);
		rosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(AcclimatizationForCARSRule::RuleFuncId, _dbData->crewList[pCrew->crewIndex]->rosterList);
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setAcclimationStateForCARS(const vector<SharedPtr<ROSTER>>& rosters) {
	AcclimatizationForCARSRule* rule = _ruleFactory->GetCalcRule<AcclimatizationForCARSRule>();
	if (rule == nullptr) {
		return;
	}
	rule->setDataContext(this->_dbData);
	rule->setApplication(this->_application);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		//spdlog::info("[setAcclimationStateForCARS] rosters roster id={}", roster->rosterId);
		tmpRosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(AcclimatizationForCARSRule::RuleFuncId, rosters);
	rule->CalculateDuty(tmpRosters);
}
