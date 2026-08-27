/**
 * @file CalculateCourseFDPForTGRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-02-20
**/



#ifndef _CALCULATECOURSEFDPFORTGRULE_H_
#define _CALCULATECOURSEFDPFORTGRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateCourseFDPForTGRuleParam.h"

class CalculateCourseFDPForTGRule : public CalculateRule<long> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7278;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::CREW;

    explicit CalculateCourseFDPForTGRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, CalculateCourseFDPForTGRule::RuleFuncId, CalculateCourseFDPForTGRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateCourseFDPForTGRule() override = default;

    long Calculate(SharedPtr<ROSTER> roster);

    long Calculate(Duty* duty, const SharedPtr<ROSTER>& roster);

private:

    std::vector<CalculateCourseFDPForTGRuleParam> _ruleParams;


    void ParseParam(const InputType& input);
};


#endif //_CALCULATECOURSEFDPFORTGRULE_H_
