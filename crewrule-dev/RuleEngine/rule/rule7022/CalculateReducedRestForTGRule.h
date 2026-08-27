/**
 * @file CalculateReducedRestForTGRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/



#ifndef _CALCULATEREDUCEDRESTFORTGRULE_H_
#define _CALCULATEREDUCEDRESTFORTGRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateReducedRestForTGRuleParam.h"

class Pairing;

class CalculateReducedRestForTGRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7022;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateReducedRestForTGRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateReducedRestForTGRule::RuleFuncId, CalculateReducedRestForTGRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateReducedRestForTGRule() override = default;

	// ============================================================
	// CalculateDuty 入口：Crew维度（已有逻辑）
	// ============================================================
	// 当Duty已分配给Crew时，从Roster中提取Duties并计算manualRestDiscretion。
	// base取自crew->getPrimeBase()。
	// ============================================================
	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

	// ============================================================
	// CalculateDuty 入口：Pairing维度（新增逻辑）
	// ============================================================
	// 当Duty尚未分配给任何Crew时，直接从Pairing中提取所有Duties并计算
	// manualRestDiscretion。这确保了即使在Pairing创建阶段（无Crew分配），
	// REST Discretion值也能被正确计算和持久化。
	//
	// 此方法仅设置manualRestDiscretion，不处理DutyDelta/nextDuty逻辑。
	// base取自pairing->getBase()，用于MatchHomeBase判断。
	//
	// 注意：此方法是幂等的——如果同一Duty后续在Crew维度再次被处理，
	// manualRestDiscretion会被相同的计算结果覆盖，不会产生错误。
	// ============================================================
	void CalculateDuty(Pairing* pairing);

private:
	std::mutex _7022mutex;

	std::vector<CalculateReducedRestForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	// ============================================================
	// SetManualRestDiscretion - 仅设置manualRestDiscretion（核心方法）
	// ============================================================
	// 遍历所有duties，对标记了REST discretion的duty计算并设置
	// manualRestDiscretion = duty.getMinRest() - ruleParam._restMin
	//
	// 此方法被两个入口共用：
	//   1. CalculateDuty(Pairing*) - 仅调用此方法
	//   2. CalculateDuty(duties, base) - 调用此方法 + Pass 2 DutyDelta逻辑
	// ============================================================
	void SetManualRestDiscretion(vector<Duty*> duties, const string& base);

	// Crew维度完整计算：manualRestDiscretion + DutyDelta/nextDuty逻辑
	void CalculateDuty(vector<Duty*> duties, const string& base);

	bool CalculateDuty(Duty* duty, const string& base, const CalculateReducedRestForTGRuleParam& ruleParam);

	//判断两个DO之间是否超过最大数量
	bool CheckMaxTimesBetweenDO(const std::vector<const ROSTER*>& rosters, const CalculateReducedRestForTGRuleParam & ruleParam);
};

#endif //_CALCULATEREDUCEDRESTFORTGRULE_H_
