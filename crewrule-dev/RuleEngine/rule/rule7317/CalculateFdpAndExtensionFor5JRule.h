/**
 * @file CalculateFdpAndExtensionFor5JRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-02-20
**/



#ifndef _CalculateFdpAndExtensionFor5JRule_H_
#define _CalculateFdpAndExtensionFor5JRule_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateFdpAndExtensionFor5JRuleParam.h"

class CalculateFdpAndExtensionFor5JRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7317;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CalculateFdpAndExtensionFor5JRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, CalculateFdpAndExtensionFor5JRule::RuleFuncId, CalculateFdpAndExtensionFor5JRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateFdpAndExtensionFor5JRule() override = default;

    void CalculateDuty(Duty* duty) override;
private:

    std::vector<CalculateFdpAndExtensionFor5JRuleParam> _ruleParams;

    long calculateRegularStandby(long duration, int offset, double pct);

    long calculateCalloutStandby(time_t notificationTime, SharedPtr<ROSTER> nextRoster, long sbyDuration, int offset, double pct, int sbyLimit, int notifyLimit);

    void ParseParam(const InputType& input);
};


#endif //_CalculateFdpAndExtensionFor5JRule_H_
