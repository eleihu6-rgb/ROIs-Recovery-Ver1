/**
 * @file CheckTrainingEndForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKTRAININGENDFOREVAFDRULE_H_
#define _CHECKTRAININGENDFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckTrainingEndForEvaFdRuleParam.h"


class CheckTrainingEndForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7226;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckTrainingEndForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckTrainingEndForEvaFdRule::RuleFuncId, CheckTrainingEndForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckTrainingEndForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckTrainingEndForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

    bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

    void ThrowRuleViolationForCourseEnd(const ROSTER* roster) const;
};

#endif //_CHECKTRAININGENDFOREVAFDRULE_H_
