/**
 * @file CheckGenderOnFlightByCompositionForPRRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKGENDERONFLIGHTBYCOMPOSITIONFORPRRULE_H_
#define _CHECKGENDERONFLIGHTBYCOMPOSITIONFORPRRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckGenderOnFlightByCompositionForPRRuleParam.h"


struct RosterProgramCourse;


class CheckGenderOnFlightByCompositionForPRRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7314;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing | RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CheckGenderOnFlightByCompositionForPRRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckGenderOnFlightByCompositionForPRRule::RuleFuncId, CheckGenderOnFlightByCompositionForPRRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckGenderOnFlightByCompositionForPRRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckGenderOnFlightByCompositionForPRRuleParam> _ruleParams;

    bool CheckCrewOnFlight(const Segment* segment, const int needNumberOfCrew, const CheckGenderOnFlightByCompositionForPRRuleParam ruleParam) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CHECKGENDERONFLIGHTBYCOMPOSITIONFORPRRULE_H_
