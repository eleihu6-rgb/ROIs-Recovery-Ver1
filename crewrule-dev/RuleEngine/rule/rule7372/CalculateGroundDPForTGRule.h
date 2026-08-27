/**
 * @file CalculateGroundDPForTGRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-02-20
**/



#ifndef _CALCULATEGROUNDDPFORTGRULE_H_
#define _CALCULATEGROUNDDPFORTGRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateGroundDPForTGRuleParam.h"

class CalculateGroundDPForTGRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7372;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::CREW;

    explicit CalculateGroundDPForTGRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, CalculateGroundDPForTGRule::RuleFuncId, CalculateGroundDPForTGRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateGroundDPForTGRule() override = default;

    long Calculate(SharedPtr<ROSTER> roster);

    void CalculateDP(SharedPtr<ROSTER> roster);
private:

    std::vector<CalculateGroundDPForTGRuleParam> _ruleParams;

    void ParseParam(const InputType& input);
};


#endif //_CALCULATEGROUNDDPFORTGRULE_H_
