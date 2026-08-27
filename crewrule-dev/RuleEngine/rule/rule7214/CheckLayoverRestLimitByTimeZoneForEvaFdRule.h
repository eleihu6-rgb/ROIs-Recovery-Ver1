/**
 * @file CheckLayoverRestLimitByTimeZoneForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKLAYOVERRESTLIMITBYTIMEZONEFOREVAFDRULE_H_
#define _CHECKLAYOVERRESTLIMITBYTIMEZONEFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LayoverRestLimitByTimeZoneForEvaFdRuleParam.h"


class CheckLayoverRestLimitByTimeZoneForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7214;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckLayoverRestLimitByTimeZoneForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckLayoverRestLimitByTimeZoneForEvaFdRule::RuleFuncId, CheckLayoverRestLimitByTimeZoneForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckLayoverRestLimitByTimeZoneForEvaFdRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<LayoverRestLimitByTimeZoneForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

    bool CheckRule(bool& next, const Pairing* pairing, const int baseOffsetTZMinutes, const LayoverRestLimitByTimeZoneForEvaFdRuleParam& ruleParam) const;

    void ThrowRuleViolationForMinRestAndMinWOCL(const Pairing* pairing) const;

    void ThrowRuleViolationForMinRest(const Pairing* pairing) const;

    void ThrowRuleViolationForMinWOCL(const Pairing* pairing) const;
};

#endif //_CHECKLAYOVERRESTLIMITBYTIMEZONEFOREVAFDRULE_H_
