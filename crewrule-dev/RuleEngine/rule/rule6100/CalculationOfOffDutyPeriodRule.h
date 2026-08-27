/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATIONOFOFFDUTYPERIODRULE_H_
#define _CALCULATIONOFOFFDUTYPERIODRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculationOfOffDutyPeriodRuleParam.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class CalculationOfOffDutyPeriodRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6100;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CalculationOfOffDutyPeriodRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculationOfOffDutyPeriodRule::RuleFuncId, CalculationOfOffDutyPeriodRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculationOfOffDutyPeriodRule() override = default;

	void CalculateDuty(Duty *duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;
private:

    std::vector<CalculationOfOffDutyPeriodRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(const vector<Duty*>& duties);

	bool CalculateDuty(Duty* currDuty, const std::string& base, const CalculationOfOffDutyPeriodRuleParam& ruleParam) const;

	int GetDisplacementAdjustment(const Duty* currDuty, const string& direction, const CalculationOfOffDutyPeriodRuleParam& ruleParam) const;

	int GetFDPAdjustment(const int& dutyFdpMinutes, const CalculationOfOffDutyPeriodRuleParam& ruleParam) const;

	//Duty经过所有机场的时区中与最近适应地的时区差，获取其中的最大值。
	int GetDisplacementTime(const Duty& duty) const;

};





#endif //_CALCULATIONOFOFFDUTYPERIODRULE_H_
