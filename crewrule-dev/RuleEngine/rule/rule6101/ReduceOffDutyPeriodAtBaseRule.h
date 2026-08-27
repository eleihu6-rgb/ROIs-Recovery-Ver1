/**
 * @file ReduceOffDutyPeriodAtBaseRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _REDUCEOFFDUTYPERIODATBASERULE_H_
#define _REDUCEOFFDUTYPERIODATBASERULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "ReduceOffDutyPeriodAtBaseRuleParam.h"


class ReduceOffDutyPeriodAtBaseRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6101;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit ReduceOffDutyPeriodAtBaseRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, ReduceOffDutyPeriodAtBaseRule::RuleFuncId, ReduceOffDutyPeriodAtBaseRule::AvailableInterface) {
		ParseParam(input);
	}

	~ReduceOffDutyPeriodAtBaseRule() override = default;

	void CalculateDuty(Duty *duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;
private:

	std::vector<ReduceOffDutyPeriodAtBaseRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(const vector<Duty*>& duties);

	void CalculateDuty(Duty* duty, const std::string& base);

	bool CalculateDuty(int& lastMinRest, Duty* duty, const std::string& base, const ReduceOffDutyPeriodAtBaseRuleParam& ruleParam);

};

#endif //_REDUCEOFFDUTYPERIODATBASERULE_H_
