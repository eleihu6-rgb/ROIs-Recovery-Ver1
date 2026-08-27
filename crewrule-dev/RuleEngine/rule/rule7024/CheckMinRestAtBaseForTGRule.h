/**
 * @file CheckMinRestAtBaseForTGRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-25
**/



#ifndef _CHECKMINRESTATBASEFORTGRULE_H_
#define _CHECKMINRESTATBASEFORTGRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinRestAtBaseForTGRuleParam.h"


class CheckMinRestAtBaseForTGRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7024;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMinRestAtBaseForTGRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinRestAtBaseForTGRule::RuleFuncId, CheckMinRestAtBaseForTGRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMinRestAtBaseForTGRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<MinRestAtBaseForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

    bool CheckRule(const Pairing* pairing, const ROSTER* nextRoster, const int offsetTZMinutes, const MinRestAtBaseForTGRuleParam& ruleParam) const;

    void ThrowRuleViolation(const Pairing* pairing, const MinRestAtBaseForTGRuleParam& ruleParam) const;
};

#endif //_CHECKMINRESTATBASEFORTGRULE_H_
