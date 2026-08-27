/**
 * @file CheckSchAcclimatizedRestRuleForEva.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKSCHACCLIMATIZEDRESTRULEFOREVA_H_
#define _CHECKSCHACCLIMATIZEDRESTRULEFOREVA_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckSchAcclimatizedRestRuleParamForEva.h"


/*
* 7271为7261的分身，通过计划时间来检查
*/
class CheckSchAcclimatizedRestRuleForEva : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7271;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckSchAcclimatizedRestRuleForEva(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckSchAcclimatizedRestRuleForEva::RuleFuncId, CheckSchAcclimatizedRestRuleForEva::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckSchAcclimatizedRestRuleForEva() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckSchAcclimatizedRestRuleParamForEva> _ruleParams;


    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const ROSTER* roster) const;

};


#endif //_CHECKSCHACCLIMATIZEDRESTRULEFOREVA_H_
