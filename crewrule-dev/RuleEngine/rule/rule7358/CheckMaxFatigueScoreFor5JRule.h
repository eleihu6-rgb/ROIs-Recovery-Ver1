/**
 * @file CheckMaxFatigueScoreFor5JRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CheckMaxFatigueScoreFor5JRule_H_
#define _CheckMaxFatigueScoreFor5JRule_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxFatigueScoreFor5JRuleParam.h"


struct RosterProgramCourse;


class CheckMaxFatigueScoreFor5JRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7358;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMaxFatigueScoreFor5JRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMaxFatigueScoreFor5JRule::RuleFuncId, CheckMaxFatigueScoreFor5JRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMaxFatigueScoreFor5JRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckMaxFatigueScoreFor5JRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation() const;

};


#endif //_CheckMaxFatigueScoreFor5JRule_H_
