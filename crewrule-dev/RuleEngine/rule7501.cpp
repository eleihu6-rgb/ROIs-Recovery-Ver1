
#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7501/LimitSingleDayFreeFromDutyForCARSRule.h"
#include "RuleFactory.h"

/**
 * @brief 法规 7501 引擎入口：Limit Single Day Free from Duty for CARS。
 *
 * 由 RuleEngine::checkRulesImpl 在 LIMIT_SINGLE_DAY_FREE_FROM_DUTY_FOR_CARS (7501) 节点调用。
 * 非 ROSTER_OPTIMIZER 模式下即使前面法规已失败也会继续执行本规则。
 *
 * 流程：
 * 1. 校验 crewIndex 有效
 * 2. 从 RuleFactory 获取 LimitSingleDayFreeFromDutyForCARSRule 实例
 * 3. 绑定 RULE_LEGALITY 上下文
 * 4. 收集组员全部 roster 指针，调用 CheckRule
 *
 * @param pCrew 当前检查组员的 legality 上下文（含 crewIndex）
 * @return CheckRule 返回值；crewIndex 无效或规则未注册时返回 true（跳过）
 */
bool LegalityChecker::checkSingleDayFreeFromDutyForCARS(RULE_LEGALITY * pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	LimitSingleDayFreeFromDutyForCARSRule* rule = _ruleFactory->GetCheckRule<LimitSingleDayFreeFromDutyForCARSRule>();
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
