/**
 * @file CheckMinRestBasedLocalNightForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMINRESTBASEDLOCALNIGHTFORPRRULE_H_
#define _CHECKMINRESTBASEDLOCALNIGHTFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../period/WorkPeriod.h"
#include "MinRestBasedLocalNightForPRRuleParam.h"


class CheckMinRestBasedLocalNightForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7307;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckMinRestBasedLocalNightForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinRestBasedLocalNightForPRRule::RuleFuncId, CheckMinRestBasedLocalNightForPRRule::AvailableInterface) {
		ParseParam(input);
	}

	~CheckMinRestBasedLocalNightForPRRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<MinRestBasedLocalNightForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(const Duty* currDuty, const Duty* nextDuty, const string& base, const MinRestBasedLocalNightForPRRuleParam& ruleParam) const;

	bool CheckRule(const std::unique_ptr<WorkPeriod>& currWorkPeriod, const std::unique_ptr<WorkPeriod>& nextWorkPeriod, const MinRestBasedLocalNightForPRRuleParam& ruleParam) const;

	void ThrowRuleViolation(const Duty* currDuty, const Duty* nextDuty, const int actRestMinutes, const MinRestBasedLocalNightForPRRuleParam& ruleParam, const bool isCheckBaseRest) const;

	void ThrowRuleViolation(const std::unique_ptr<WorkPeriod>& currWorkPeriod, const std::unique_ptr<WorkPeriod>& nextWorkPeriod, const int actRestMinutes, const MinRestBasedLocalNightForPRRuleParam& ruleParam, const bool isCheckBaseRest) const;

};

#endif //_CHECKMINRESTBASEDLOCALNIGHTFORPRRULE_H_
