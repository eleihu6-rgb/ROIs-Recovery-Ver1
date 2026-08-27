/**
 * @file CalculateMaxFdpExtensionOfCcForTGRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEMAXFDPEXTENSIONOFCCFORTGRULE_H_
#define _CALCULATEMAXFDPEXTENSIONOFCCFORTGRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMaxFdpExtensionOfCcForTGRuleParam.h"

class CalculateMaxFdpExtensionOfCcForTGRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7017;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CalculateMaxFdpExtensionOfCcForTGRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFdpExtensionOfCcForTGRule::RuleFuncId, CalculateMaxFdpExtensionOfCcForTGRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateMaxFdpExtensionOfCcForTGRule() override = default;

	void CalculateDuty(Duty *duty) override;

	void CalculateDuty(Pairing* pairing) override;
private:

    std::vector<CalculateMaxFdpExtensionOfCcForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(const vector<Duty*>& duties);

	bool CalculateDuty(Duty* duty, const CalculateMaxFdpExtensionOfCcForTGRuleParam& ruleParam);

};





#endif //_CALCULATEMAXFDPEXTENSIONOFCCFORTGRULE_H_
