/**
 * @file CheckSchMinRestAfterCumulativeFTForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKSCHMINRESTAFTERCUMULATIVEFTFOREVAFDRULE_H_
#define _CHECKSCHMINRESTAFTERCUMULATIVEFTFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam.h"


/*
* 7211的分身，通过计划时间检查MinRest
*/
class CheckSchMinRestAfterCumulativeFTForEvaFdRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7266;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CheckSchMinRestAfterCumulativeFTForEvaFdRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckSchMinRestAfterCumulativeFTForEvaFdRule::RuleFuncId, CheckSchMinRestAfterCumulativeFTForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }

    ~CheckSchMinRestAfterCumulativeFTForEvaFdRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

    bool CheckRule(const Pairing* pairing) const override;

    bool CheckRule(const Duty* duty) const override;
private:

    std::vector<CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    bool CheckRule(const vector<Duty*> duties) const;

    //先前连续24小时统计
    void GetMinRestForDutyPrevious(int& minRest, std::size_t currDutyIndex, std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam& ruleParam) const;

    //先后连续24小时统计
    void GetMinRestForDutyAfter(int& minRest, std::size_t currDutyIndex, std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam& ruleParam) const;

    void ThrowRuleViolation(const Duty* duty) const;

};

#endif //_CHECKSCHMINRESTAFTERCUMULATIVEFTFOREVAFDRULE_H_
