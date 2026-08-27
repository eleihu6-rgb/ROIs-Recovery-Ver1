/**
 * @file CheckIOEPhaseFlightCompositionRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKIOEPHASEFLIGHTCOMPOSITIONRULE_H_
#define _CHECKIOEPHASEFLIGHTCOMPOSITIONRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckIOEPhaseFlightCompositionRuleParam.h"


struct RosterProgramCourse;


class CheckIOEPhaseFlightCompositionRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7274;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckIOEPhaseFlightCompositionRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckIOEPhaseFlightCompositionRule::RuleFuncId, CheckIOEPhaseFlightCompositionRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckIOEPhaseFlightCompositionRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckIOEPhaseFlightCompositionRuleParam> _ruleParams;

    std::map<std::string, int> GetCompositionWithoutTE(const std::vector<shared_ptr<RosterFlight>>& rosterFlights, const Segment* seg) const;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CHECKIOEPHASEFLIGHTCOMPOSITIONRULE_H_
