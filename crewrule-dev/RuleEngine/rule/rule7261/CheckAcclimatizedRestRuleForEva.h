/**
 * @file CheckAcclimatizedRestRuleForEva.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKACCLIMATIZEDRESTRULEFOREVA_H_
#define _CHECKACCLIMATIZEDRESTRULEFOREVA_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckAcclimatizedRestRuleParamForEva.h"


struct RosterProgramCourse;


class CheckAcclimatizedRestRuleForEva : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7261;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckAcclimatizedRestRuleForEva(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckAcclimatizedRestRuleForEva::RuleFuncId, CheckAcclimatizedRestRuleForEva::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckAcclimatizedRestRuleForEva() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckAcclimatizedRestRuleParamForEva> _ruleParams;


    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const ROSTER* roster) const;

};


#endif //_CHECKACCLIMATIZEDRESTRULEFOREVA_H_
