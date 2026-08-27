/**
 * @file CheckSchMinRestForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKSCHMINRESTFOREVAFDRULE_H_
#define _CHECKSCHMINRESTFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../period/WorkPeriod.h"
#include "CheckSchMinRestForEvaFdRuleParam.h"


/*
* 7100(7200)的分身，通过计划时间检查MinRest
*/
class CheckSchMinRestForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7265;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckSchMinRestForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckSchMinRestForEvaFdRule::RuleFuncId, CheckSchMinRestForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}

	~CheckSchMinRestForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

    std::vector<CheckSchMinRestForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(const Duty *currDuty, const Duty* nextDuty, const CheckSchMinRestForEvaFdRuleParam& ruleParam) const;

	bool CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods) const;

	bool CheckRule(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod) const;

	int GetDutyMinRest(const Duty* duty, const CheckSchMinRestForEvaFdRuleParam& ruleParam) const;

	int GetFDPMinutesForMRT(const Duty* duty) const;

	void ThrowRuleViolation(const Duty* duty) const;
};

#endif //_CHECKSCHMINRESTFOREVAFDRULE_H_
