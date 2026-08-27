/**
 * @file CheckMinRestForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMINRESTFOREVAFDRULE_H_
#define _CHECKMINRESTFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../period/WorkPeriod.h"
#include "CheckMinRestForEvaFdRuleParam.h"


class CheckMinRestForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7200;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckMinRestForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinRestForEvaFdRule::RuleFuncId, CheckMinRestForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}

	~CheckMinRestForEvaFdRule() override = default;

	bool    CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

    std::vector<CheckMinRestForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(const Duty *currDuty, const Duty* nextDuty, const CheckMinRestForEvaFdRuleParam& ruleParam) const;

	bool CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods) const;

	bool CheckRule(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod) const;

	int GetDutyMinRest(const Duty* duty, const CheckMinRestForEvaFdRuleParam& ruleParam) const;

	int GetFDPMinutesForMRT(const Duty* duty) const;

	void ThrowRuleViolation(const Duty* duty) const;
};

#endif //_CHECKMINRESTFOREVAFDRULE_H_
