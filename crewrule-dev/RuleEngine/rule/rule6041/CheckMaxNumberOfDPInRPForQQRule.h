/**
 * @file CheckMaxNumberOfDPInRPForQQRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMAXNUMBEROFDPINRPFORQQRULE_H_
#define _CHECKMAXNUMBEROFDPINRPFORQQRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxNumberOfDPInRPForQQRuleParam.h"
#include "../period/WorkPeriod.h"
#include "../period/RestPeriod.h"

class CheckMaxNumberOfDPInRPForQQRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6041;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMaxNumberOfDPInRPForQQRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMaxNumberOfDPInRPForQQRule::RuleFuncId, CheckMaxNumberOfDPInRPForQQRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMaxNumberOfDPInRPForQQRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;
private:

    std::vector<CheckMaxNumberOfDPInRPForQQRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};




#endif //_CHECKMAXNUMBEROFDPINRPFORQQRULE_H_
