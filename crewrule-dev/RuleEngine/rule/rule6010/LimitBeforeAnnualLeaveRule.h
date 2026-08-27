/**
 * @file LimitBeforeAnnualLeaveRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITBEFOREANNUALLEAVERULE_H_
#define _LIMITBEFOREANNUALLEAVERULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitBeforeAnnualLeaveRuleParam.h"
#include "../period/WorkPeriod.h"
#include "../period/RestPeriod.h"

class LimitBeforeAnnualLeaveRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6010;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit LimitBeforeAnnualLeaveRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitBeforeAnnualLeaveRule::RuleFuncId, LimitBeforeAnnualLeaveRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitBeforeAnnualLeaveRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;
private:

	std::vector<LimitBeforeAnnualLeaveRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	//检查Duty签入是否满足法规
	bool CheckRuleForCheckIn(const std::vector<const ROSTER*>& rosters, const LimitBeforeAnnualLeaveRuleParam& ruleParam) const;

	//检查Duty签出是否满足法规
	bool CheckRuleForCheckOut(const std::vector<const ROSTER*>& rosters, const LimitBeforeAnnualLeaveRuleParam& ruleParam) const;

	//Duty签入告警
	void ThrowRuleViolationForCheckIn(const Duty* duty) const;

	//Duty签出告警
	void ThrowRuleViolationForCheckOut(const Duty* duty) const;

};




#endif //_LIMITBEFOREANNUALLEAVERULE_H_
