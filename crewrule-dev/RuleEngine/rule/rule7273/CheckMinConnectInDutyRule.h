/**
 * @file CheckMinConnectInDutyRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CheckMinConnectInDutyRule_H_
#define _CheckMinConnectInDutyRule_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMinConnectInDutyRuleParam.h"


struct RosterProgramCourse;


class CheckMinConnectInDutyRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7273;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster | RuleInterface::Interface::GroupedDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMinConnectInDutyRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMinConnectInDutyRule::RuleFuncId, CheckMinConnectInDutyRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMinConnectInDutyRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

    bool CheckRule(const vector<Duty*>& duties, const std::string crewId = "") const;

    bool CheckRule(const vector<Segment*>& segments) const;

private:

    std::vector<CheckMinConnectInDutyRuleParam> _ruleParams;


    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const CheckMinConnectInDutyRuleParam& ruleParam) const;

    bool CheckRule(const Segment* segment1, const Segment* segment2, const CheckMinConnectInDutyRuleParam& _ruleParam) const;
    bool MatchRule(const Segment* segment1, const Segment* segment2, const CheckMinConnectInDutyRuleParam& _ruleParam) const;

};


#endif //_CheckMinConnectInDutyRule_H_
