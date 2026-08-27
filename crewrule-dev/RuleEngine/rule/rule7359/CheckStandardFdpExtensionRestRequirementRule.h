/**
 * @file CheckStandardFdpExtensionRestRequirementRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKSTANDARDFDPEXTENSIONRESTREQUIREMENTRULE_H_
#define _CHECKSTANDARDFDPEXTENSIONRESTREQUIREMENTRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckStandardFdpExtensionRestRequirementRuleParam.h"


struct RosterProgramCourse;


class CheckStandardFdpExtensionRestRequirementRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7359;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckStandardFdpExtensionRestRequirementRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckStandardFdpExtensionRestRequirementRule::RuleFuncId, CheckStandardFdpExtensionRestRequirementRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckStandardFdpExtensionRestRequirementRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckStandardFdpExtensionRestRequirementRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CHECKSTANDARDFDPEXTENSIONRESTREQUIREMENTRULE_H_
