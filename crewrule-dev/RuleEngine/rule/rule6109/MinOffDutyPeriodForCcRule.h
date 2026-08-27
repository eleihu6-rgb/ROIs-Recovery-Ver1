/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _MINOFFDUTYPERIODFORCCRULE_H_
#define _MINOFFDUTYPERIODFORCCRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinOffDutyPeriodForCcRuleParam.h"
#include "MinOffDutyPeriodForCcRuleInput.h"

class MinOffDutyPeriodForCcRule: public CalculateRule<int> {
public:
    using InputType = MinOffDutyPeriodForCcRuleInput;
    constexpr static unsigned int RuleFuncId = 6109;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit MinOffDutyPeriodForCcRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, MinOffDutyPeriodForCcRule::RuleFuncId, MinOffDutyPeriodForCcRule::AvailableInterface) {
        ParseParam(input);
    }
    ~MinOffDutyPeriodForCcRule() override = default;

    void CalculateDuty(Duty *duty) override;

	void CalculateDuty(Pairing* pairing) override;

private:

	void CalculateDuty(vector<Duty*> duties);

	//Min ODP between Duties for CC
	std::vector<std::pair<int, RuleParam>> GetTimeFreeOfDuty(const Duty *duty) const;

    void ParseParam(const InputType& input);

    std::vector<MinOffDutyPeriodForCcRuleParam> _ruleParams;

};

#endif //_MINOFFDUTYPERIODFORCCRULE_H_
