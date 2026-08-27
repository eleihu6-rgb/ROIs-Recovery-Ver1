/**
 * @file LimitActualFdpOnStandbyOfCcForTGRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITACTUALFDPONSTANDBYOFCCFORTGRULE_H_
#define _LIMITACTUALFDPONSTANDBYOFCCFORTGRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitActualFdpOnStandbyOfCcForTGRuleParam.h"
#include "../period/WorkPeriod.h"
#include "../period/RestPeriod.h"

class LimitActualFdpOnStandbyOfCcForTGRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7019;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit LimitActualFdpOnStandbyOfCcForTGRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitActualFdpOnStandbyOfCcForTGRule::RuleFuncId, LimitActualFdpOnStandbyOfCcForTGRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitActualFdpOnStandbyOfCcForTGRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;
private:

	std::vector<LimitActualFdpOnStandbyOfCcForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* standbyRoster, const ROSTER* flyRoster, const std::shared_ptr<CREW>& crew) const;

	void ThrowRuleViolation(const ROSTER* roster, const Duty* duty, const LimitActualFdpOnStandbyOfCcForTGRuleParam& ruleParam) const;


};




#endif //_LIMITACTUALFDPONSTANDBYOFCCFORTGRULE_H_
