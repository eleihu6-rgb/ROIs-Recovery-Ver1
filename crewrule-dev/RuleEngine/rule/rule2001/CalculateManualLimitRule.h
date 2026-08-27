/**
 * @file CalculateManualLimitRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-04
**/



#ifndef _CALCULATEMANUALLIMITRULE_H_
#define _CALCULATEMANUALLIMITRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateManualLimitRuleParam.h"

/*
* 内置法规，手工设置MaxFDP、MaxDP、MinRest等值后，优先级最高，覆盖其他计算法规值。
* 注意：必须在计算法规最后调用。
*/
class CalculateManualLimitRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 2001;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateManualLimitRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateManualLimitRule::RuleFuncId, CalculateManualLimitRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateManualLimitRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<CalculateManualLimitRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty* duty, const CalculateManualLimitRuleParam& ruleParam);

};

#endif //_CalculateManualLimitRULE_H_
