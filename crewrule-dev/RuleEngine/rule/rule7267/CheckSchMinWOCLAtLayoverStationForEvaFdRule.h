/**
 * @file CheckSchMinWOCLAtLayoverStationForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKSCHMINWOCLATLAYOVERSTATIONFOREVAFDRULE_H_
#define _CHECKSCHMINWOCLATLAYOVERSTATIONFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "SchMinWOCLAtLayoverStationForEvaFdRuleParam.h"

/*
* 7212的分身，通过计划时间检查MinRest
*/
class CheckSchMinWOCLAtLayoverStationForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7267;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckSchMinWOCLAtLayoverStationForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckSchMinWOCLAtLayoverStationForEvaFdRule::RuleFuncId, CheckSchMinWOCLAtLayoverStationForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckSchMinWOCLAtLayoverStationForEvaFdRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<SchMinWOCLAtLayoverStationForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

    bool CheckRule(bool& next, const Pairing* pairing, const SchMinWOCLAtLayoverStationForEvaFdRuleParam& ruleParam) const;

    void ThrowRuleViolationForMinRestAndMinWOCL(const Duty* duty) const;

    void ThrowRuleViolationForMinRest(const Duty* duty) const;

    void ThrowRuleViolationForMinWOCL(const Duty* duty) const;

};

#endif //_CHECKSCHMINWOCLATLAYOVERSTATIONFOREVAFDRULE_H_
