/**
 * @file CheckDaysOffForTradeRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKDAYSOFFFORTRADERULE_H_
#define _CHECKDAYSOFFFORTRADERULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckDaysOffForTradeRuleParam.h"




class CheckDaysOffForTradeRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7275;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckDaysOffForTradeRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckDaysOffForTradeRule::RuleFuncId, CheckDaysOffForTradeRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckDaysOffForTradeRule() override = default;

    bool CheckRule(vector<SharedPtr<ROSTER>>& rosters) const;

private:

    std::vector<CheckDaysOffForTradeRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CHECKDAYSOFFFORTRADERULE_H_
