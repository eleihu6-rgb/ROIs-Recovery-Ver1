/**
 * @file CheckOffDutyPeriodRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKOFFDUTYPERIODRULE_H_
#define _CHECKOFFDUTYPERIODRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckOffDutyPeriodRuleParam.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class CheckOffDutyPeriodRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6120;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CheckOffDutyPeriodRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckOffDutyPeriodRule::RuleFuncId, CheckOffDutyPeriodRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckOffDutyPeriodRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;
private:

    std::vector<CheckOffDutyPeriodRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	bool CheckRule(const Duty* currDuty, const Duty* nextDuty, const std::string& base, const CheckOffDutyPeriodRuleParam& ruleParam) const;

	bool CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime) const;

	bool CheckRule(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod, const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime) const;

	int GetDutyMinRest(const Duty* currDuty, const int dutyFdpMinutes, const string& direction, const CheckOffDutyPeriodRuleParam& ruleParam) const;

	int GetDisplacementAdjustment(const Duty* currDuty, const string& direction, const CheckOffDutyPeriodRuleParam& ruleParam) const;

	int GetFDPAdjustment(const int& dutyFdpMinutes, const CheckOffDutyPeriodRuleParam& ruleParam) const;

	//Duty经过所有机场的时区中与最近适应地的时区差，获取其中的最大值。
	int GetDisplacementTime(const Duty& duty) const;

	void ThrowRuleViolation(const Duty* duty) const;

};





#endif //_CHECKOFFDUTYPERIODRULE_H_
