/**
 * @file CalculateSplitDutyMaxFdpExtensionForTGRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATESPLITDUTYMAXFDPEXTENSIONFORTGRULE_H_
#define _CALCULATESPLITDUTYMAXFDPEXTENSIONFORTGRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateSplitDutyMaxFdpExtensionForTGRuleParam.h"

class CalculateSplitDutyMaxFdpExtensionForTGRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7028;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CalculateSplitDutyMaxFdpExtensionForTGRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, CalculateSplitDutyMaxFdpExtensionForTGRule::RuleFuncId, CalculateSplitDutyMaxFdpExtensionForTGRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateSplitDutyMaxFdpExtensionForTGRule() override = default;

    void CalculateDuty(Duty* duty) override;

    void CalculateDuty(Pairing* pairing) override;
private:

    std::vector<CalculateSplitDutyMaxFdpExtensionForTGRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void CalculateDuty(const vector<Duty*>& duties);

    bool CalculateDuty(Duty* duty, const CalculateSplitDutyMaxFdpExtensionForTGRuleParam& ruleParam);

};





#endif //_CALCULATESPLITDUTYMAXFDPEXTENSIONFORTGRULE_H_
