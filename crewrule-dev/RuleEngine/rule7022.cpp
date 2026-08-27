#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7022/CheckReducedRestForTGRule.h"
#include "rule7022/CalculateReducedRestForTGRule.h"
#include "RuleFactory.h"


// ============================================================
// setMinRestReduce_TG - Crew维度的wrapper（已有逻辑，未修改）
// ============================================================
// 调用路径：checkRulesImpl → setMinRestReduce_TG(rosters)
//
// 作用：处理已分配给Crew的Duty。从rosters中提取duties，
//       使用crew的primeBase作为基地匹配依据。
// ============================================================
void LegalityChecker::setMinRestReduce_TG(vector<SharedPtr<ROSTER>> rosters) {
	CalculateReducedRestForTGRule* rule = _ruleFactory->GetCalcRule<CalculateReducedRestForTGRule>();
	if (rule == nullptr) {
		return;
	}
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		tmpRosters.emplace_back(roster.get());
	}
	rule->CalculateDuty(tmpRosters);
}

// ============================================================
// setMinRestReduce_TG - Pairing维度的wrapper（新增逻辑）
// ============================================================
// 调用路径：calculatePairingFdpRest → setMinRestReduce_TG(pairing)
//
// 作用：处理尚未分配给任何Crew的Duty。直接从Pairing中提取所有duties，
//       使用pairing的base作为基地匹配依据。
//
// 为什么需要这个入口？
//   原有的Crew维度入口（setMinRestReduce_TG）只在checkRulesImpl中被调用，
//   而checkRulesImpl只在有Crew分配时才执行。如果Pairing中的Duty尚未分配
//   给任何Crew，则manualRestDiscretion永远不会被设置。
//
//   此入口在calculatePairingFdpRest中被调用（与setMinRestByDP_TG同级），
//   确保在Pairing处理阶段就完成manualRestDiscretion的计算。
// ============================================================
void LegalityChecker::setMinRestReduce_TG(Pairing* pairing) {
	CalculateReducedRestForTGRule* rule = _ruleFactory->GetCalcRule<CalculateReducedRestForTGRule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

// ============================================================
// checkMinRestReduceBetweenDO - Check法规（已有逻辑，未修改）
// ============================================================
bool LegalityChecker::checkMinRestReduceBetweenDO(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	CheckReducedRestForTGRule* rule = _ruleFactory->GetCheckRule<CheckReducedRestForTGRule>();
	if (rule == nullptr) {
		return true;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->setRuleLegality(pCrew);
	return rule->CheckRule(rosters);
}