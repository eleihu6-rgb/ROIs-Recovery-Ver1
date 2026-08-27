#ifndef _CALCULATEMAXFLIGHTDUTYPERIODFORHXRULE_H_
#define _CALCULATEMAXFLIGHTDUTYPERIODFORHXRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../CalculateRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMaxFlightDutyPeriodForHXRuleParam.h"
#include "../period/WorkPeriod.h"
#include "RuleParams.h"

class CalculateMaxFlightDutyPeriodForHXRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7484;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CalculateMaxFlightDutyPeriodForHXRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFlightDutyPeriodForHXRule::RuleFuncId, CalculateMaxFlightDutyPeriodForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateMaxFlightDutyPeriodForHXRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
	std::vector<CalculateMaxFlightDutyPeriodForHXRuleParam> _accRuleParams;
	std::vector<CalculateMaxFlightDutyPeriodForHXRuleParam> _unAccRuleParams;

	void ParseParam(const InputType& input);

	void CalculateAcclimatizeDuty(Duty* duty, const Duty* prevDuty = NULL, const ROSTER* prevRoster = NULL);

	void CalculateUnkownDuty(Duty* duty, const string base, const ROSTER* prevRoster = NULL, const Duty* prevDuty = NULL);

	void CalculateUnkownDuty(int dutyIndex, Pairing* pairing);

	//在已适应状态时，通过CheckIn时间计算获得匹配的MaxFDP规则
	CalculateMaxFlightDutyPeriodForHXRuleParam* GetMatchedRuleWhenAcclimatize(Duty* duty, const time_t checkInTime);

	//在未知适应状态时，通过CheckIn时间计算获得匹配的MaxFDP规则
	CalculateMaxFlightDutyPeriodForHXRuleParam* GetMatchedRuleWhenUnknown(Duty* duty, const time_t prevDutyEndTime, const int offsetMinutes);

	int GetDutyLandingNumber(const Duty* duty) const;

	//获得Duty的checkin时间
	time_t GetDutyCheckInTime(const Duty* duty, const std::shared_ptr<max_fdp_after_delay_definition>& maxFdpAfterDelayDefinition);
};




#endif //_CALCULATEMAXFLIGHTDUTYPERIODFORHXRULE_H_
