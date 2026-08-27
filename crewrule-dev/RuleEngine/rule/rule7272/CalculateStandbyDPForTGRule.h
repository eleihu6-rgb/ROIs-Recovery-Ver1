/**
 * @file CalculateStandbyDPForTGRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-02-20
**/



#ifndef _CALCULATESTANDBYDPFORTGRULE_H_
#define _CALCULATESTANDBYDPFORTGRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateStandbyDPForTGRuleParam.h"

class CalculateStandbyDPForTGRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7272;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::CREW;

    explicit CalculateStandbyDPForTGRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, CalculateStandbyDPForTGRule::RuleFuncId, CalculateStandbyDPForTGRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateStandbyDPForTGRule() override = default;

    long Calculate(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster);

    void CalculateDP(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster);

    void CalculatePairingDP(Pairing* pairing);
private:

    std::vector<CalculateStandbyDPForTGRuleParam> _ruleParams;

    long calculateRegularStandby(long duration, int offset, double pct);

    long calculateCalloutStandby(time_t notificationTime, SharedPtr<ROSTER> nextRoster, long sbyDuration, int offset, double pct, int sbyLimit, int notifyLimit);

    void ParseParam(const InputType& input);
};


#endif //_CALCULATESTANDBYDPFORTGRULE_H_
