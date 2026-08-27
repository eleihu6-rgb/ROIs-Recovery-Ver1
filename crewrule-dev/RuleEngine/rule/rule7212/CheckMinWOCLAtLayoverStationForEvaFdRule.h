/**
 * @file CheckMinWOCLAtLayoverStationForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMINWOCLATLAYOVERSTATIONFOREVAFDRULE_H_
#define _CHECKMINWOCLATLAYOVERSTATIONFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinWOCLAtLayoverStationForEvaFdRuleParam.h"


class CheckMinWOCLAtLayoverStationForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7212;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMinWOCLAtLayoverStationForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinWOCLAtLayoverStationForEvaFdRule::RuleFuncId, CheckMinWOCLAtLayoverStationForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMinWOCLAtLayoverStationForEvaFdRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<MinWOCLAtLayoverStationForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

    bool CheckRule(bool& next, const Pairing* pairing, const MinWOCLAtLayoverStationForEvaFdRuleParam& ruleParam) const;

    void ThrowRuleViolationForMinRestAndMinWOCL(const Duty* currDuty, const Duty* nextDuty) const;

    void ThrowRuleViolationForMinRest(const Duty* currDuty, const Duty* nextDuty) const;

    void ThrowRuleViolationForMinWOCL(const Duty* currDuty, const Duty* nextDuty) const;

};

#endif //_CHECKMINWOCLATLAYOVERSTATIONFOREVAFDRULE_H_
