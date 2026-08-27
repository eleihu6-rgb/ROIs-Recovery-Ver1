#ifndef _CALCULATEMAXFLIGHTDUTYPERIODRULE_H_
#define _CALCULATEMAXFLIGHTDUTYPERIODRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../CalculateRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFlightDutyPeriodRuleParam.h"
#include "../period/WorkPeriod.h"
#include "RuleParams.h"

class CalculateMaxFlightDutyPeriodRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6007;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CalculateMaxFlightDutyPeriodRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFlightDutyPeriodRule::RuleFuncId, CalculateMaxFlightDutyPeriodRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateMaxFlightDutyPeriodRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Duty* duty, const ROSTER* roster);

	void CalculateDuty(Pairing * pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
	std::vector<MaxFlightDutyPeriodRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateAcclimatizeDuty(Duty* duty);

	void CalculateUnkownDuty(Duty* duty, const ROSTER* roster = NULL);

	void CalculateUnkownDuty(int dutyIndex, Pairing * pairing);

	//在已适应状态时，通过CheckIn时间计算获得匹配的MaxFDP规则
	MaxFlightDutyPeriodRuleParam* GetMatchedRuleWhenAcclimatize(Duty *duty, const time_t checkInTime);

	//在未知适应状态时，通过CheckIn时间计算获得匹配的MaxFDP规则
	MaxFlightDutyPeriodRuleParam*  GetMatchedRuleWhenUnknown(Duty* duty, const ROSTER* roster, const time_t checkInTime);

	MaxFlightDutyPeriodRuleParam*  GetMatchedRuleWhenUnknown(int dutyIndex, const Pairing* pairing, const time_t checkInTime);

	int GetDutyLandingNumber(const Duty* duty, std::vector<std::string> landingAssignments) const;

	//获得Duty的checkin时间,<原FDP开始时间作为基准,修正后的FDP开始时间作为基准>
	std::tuple<time_t,time_t> GetDutyCheckInTime(const Duty* duty, const std::shared_ptr<max_fdp_after_delay_definition>& maxFdpAfterDelayDefinition);

	bool IsReplaceRuleParam(const MaxFlightDutyPeriodRuleParam before, const MaxFlightDutyPeriodRuleParam current) const;
};




#endif //_CALCULATEMAXFLIGHTDUTYPERIODRULE_H_
