/**
 * @file CalculateMaxDutyPeriodRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEMAXDUTYPERIODRULE_H_
#define _CALCULATEMAXDUTYPERIODRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitMaxDutyPeriodRuleParam.h"


class CalculateMaxDutyPeriodRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6025;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedPairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMaxDutyPeriodRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxDutyPeriodRule::RuleFuncId, CalculateMaxDutyPeriodRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMaxDutyPeriodRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

private:

    std::vector<LimitMaxDutyPeriodRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	//计算Duty任务
	void CalculateDuty(const vector<Duty*>& duties);

	//计算Duty任务
	bool CalculateDuty(Duty* duty, const std::string& base, const LimitMaxDutyPeriodRuleParam& ruleParam);

};

#endif //_CALCULATEMAXDUTYPERIODRULE_H_
