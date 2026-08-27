

#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7321/TaskOnlyBeOperatedByFilteredCrewForPRRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkTaskOnlyBeOperatedByFilteredCrewForPR(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	TaskOnlyBeOperatedByFilteredCrewForPRRule* rule = _ruleFactory->GetCheckRule<TaskOnlyBeOperatedByFilteredCrewForPRRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}

	//if (!this->isCheckPairingInRoster(TaskOnlyBeOperatedByFilteredCrewForPRRule::RuleFuncId, -1)) {//仅执行一次
	//	//初始化 缓存
	//	rule->InitTaskAndCrewRuleParamMap(this->_dbData->crewList);
	//	this->addCheckPairingInRoster(TaskOnlyBeOperatedByFilteredCrewForPRRule::RuleFuncId, -1);
	//}

	return rule->CheckRule(rosters);
}

void LegalityChecker::initTaskOnlyBeOperatedByFilteredCrewCacheForPR(const SharedPtr<CrewDataContext>& dbData) {
	TaskOnlyBeOperatedByFilteredCrewForPRRule* rule = _ruleFactory->GetCheckRule<TaskOnlyBeOperatedByFilteredCrewForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->InitTaskAndCrewRuleParamMap(dbData->crewList);
}

void LegalityChecker::removeTaskOnlyBeOperatedByFilteredCrewCacheForPR(const std::shared_ptr<CREW>& crew, const std::shared_ptr<ROSTER>& roster, const Pairing* oldPairing) {
	TaskOnlyBeOperatedByFilteredCrewForPRRule* rule = _ruleFactory->GetCheckRule<TaskOnlyBeOperatedByFilteredCrewForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->RemoveTaskAndCrewRuleParamMap(crew, roster, oldPairing);
}

void LegalityChecker::updateTaskOnlyBeOperatedByFilteredCrewCacheForPR(const std::shared_ptr<CREW>& crew, const std::shared_ptr<ROSTER>& roster) {
	TaskOnlyBeOperatedByFilteredCrewForPRRule* rule = _ruleFactory->GetCheckRule<TaskOnlyBeOperatedByFilteredCrewForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->UpdateTaskAndCrewRuleParamMap(crew, roster);
}

void LegalityChecker::updateTaskOnlyBeOperateRosterId(const std::shared_ptr<CREW>& crew, const long long oldId, const long long newId) {
	TaskOnlyBeOperatedByFilteredCrewForPRRule* rule = _ruleFactory->GetCheckRule<TaskOnlyBeOperatedByFilteredCrewForPRRule>();
	if (rule == nullptr) {
		return;
	}
	rule->UpdateTaskRosterId(oldId, newId);
}

void LegalityChecker::updateTaskOnlyBeOperatedByFilteredCrewCacheForPR(const long long fltId) {
	TaskOnlyBeOperatedByFilteredCrewForPRRule* rule = _ruleFactory->GetCheckRule<TaskOnlyBeOperatedByFilteredCrewForPRRule>();
	if (rule == nullptr) {
		return;
	}
	auto rfs = _dbData->rosterFlightMgr.get(fltId);
	for (auto& rf : rfs) {
		auto roster = _dbData->findRoster(rf->crewId, rf->rosterId);
		auto iterCrew = _dbData->crewIdMap.find(rf->crewId);
		if (roster != nullptr && iterCrew != _dbData->crewIdMap.end()) {
			rule->RemoveTaskAndCrewRuleParamMap(iterCrew->second, roster, nullptr);
			rule->UpdateTaskAndCrewRuleParamMap(iterCrew->second, roster);
		}
	}
}