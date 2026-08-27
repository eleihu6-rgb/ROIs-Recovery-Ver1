/**
 * @file CalculateMinRestAfterCumulativeFTForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEMINRESTAFTERCUMULATIVEFTFOREVAFDRULE_H_
#define _CALCULATEMINRESTAFTERCUMULATIVEFTFOREVAFDRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMinRestAfterCumulativeFTForEvaFdRuleParam.h"


class CalculateMinRestAfterCumulativeFTForEvaFdRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7211;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CalculateMinRestAfterCumulativeFTForEvaFdRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, CalculateMinRestAfterCumulativeFTForEvaFdRule::RuleFuncId, CalculateMinRestAfterCumulativeFTForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }

    ~CalculateMinRestAfterCumulativeFTForEvaFdRule() override = default;

    void CalculateDuty(Pairing* pairing) override;

    void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<CalculateMinRestAfterCumulativeFTForEvaFdRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void CalculateDuty(vector<Duty*> duties);

    //先前连续24小时统计
    void CalculateDutyPrevious(int& minRest, std::size_t currDutyIndex, std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const CalculateMinRestAfterCumulativeFTForEvaFdRuleParam& ruleParam);

    //先后连续24小时统计
    void CalculateDutyAfter(int& minRest, std::size_t currDutyIndex, std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const CalculateMinRestAfterCumulativeFTForEvaFdRuleParam& ruleParam);

};

#endif //_CALCULATEMINRESTAFTERCUMULATIVEFTFOREVAFDRULE_H_
