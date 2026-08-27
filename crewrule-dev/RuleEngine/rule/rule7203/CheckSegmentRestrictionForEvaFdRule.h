/**
 * @file CheckSegmentRestrictionForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKSEGMENTRESTRICTIONFOREVAFDRULE_H_
#define _CHECKSEGMENTRESTRICTIONFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "SegmentRestrictionForEvaFdRuleParam.h"
#include "../period/SlideListener.h"


class CheckSegmentRestrictionForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7203;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing |  RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckSegmentRestrictionForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckSegmentRestrictionForEvaFdRule::RuleFuncId, CheckSegmentRestrictionForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckSegmentRestrictionForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

    std::vector<SegmentRestrictionForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties, const ROSTER* roster = nullptr) const;

	void ThrowRuleViolation(const Duty* duty, const SegmentRestrictionForEvaFdRuleParam& ruleParam) const;

};


#endif //_CHECKSEGMENTRESTRICTIONFOREVAFDRULE_H_
