/**
 * @file CheckSegmentRestrictionWOCLForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKSEGMENTRESTRICTIONWOCLFOREVAFDRULE_H_
#define _CHECKSEGMENTRESTRICTIONWOCLFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "SegmentRestrictionWOCLForEvaFdRuleParam.h"
#include "../period/SlideListener.h"


class CheckSegmentRestrictionWOCLForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7204;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing |  RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckSegmentRestrictionWOCLForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckSegmentRestrictionWOCLForEvaFdRule::RuleFuncId, CheckSegmentRestrictionWOCLForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckSegmentRestrictionWOCLForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

    std::vector<SegmentRestrictionWOCLForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(const vector<Duty*>& duties, const SegmentRestrictionWOCLForEvaFdRuleParam& ruleParam) const;

	bool CheckRule(const Duty* duty, const SegmentRestrictionDayNightForEvaFdRuleParam& ruleParam) const;

	bool CheckRule(const Duty* duty, const SegmentRestrictionFDPNightForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForDayNight(const Duty* duty) const;

	void ThrowRuleViolationForFDPNight(const Duty* duty) const;

};


#endif //_CHECKSEGMENTRESTRICTIONWOCLFOREVAFDRULE_H_
