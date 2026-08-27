#pragma once
#ifndef _CALCULATEPAIRINGPERDIEMHOURSFOREVAFDRULE_H_
#define _CALCULATEPAIRINGPERDIEMHOURSFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "PairingPerDiemHoursForEvaFdRuleParam.h"

class CalculatePairingPerDiemHoursForEvaFdRule : public CalculateRule<PerDiem> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7217;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculatePairingPerDiemHoursForEvaFdRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculatePairingPerDiemHoursForEvaFdRule::RuleFuncId, CalculatePairingPerDiemHoursForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculatePairingPerDiemHoursForEvaFdRule() override = default;

	/*
	* 计算Pairing的per-diem
	* @return PerDiem
	*/
	PerDiem Calculate(Pairing* pairing) override;

private:

	std::vector<PairingPerDiemHoursForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	//获得计算实际PerDiem，使用实际时间，还是计划时间。返回："SCH" - 计划时间，"ACT" - 实际时间
	string GetTimeType(const Duty* duty, const int offsetTZMinutes, const PairingPerDiemHoursForEvaFdRuleParam& ruleParam) const;

	//返回值PerDiem
	PerDiem GetDutyPerDiemInSec(std::map<long long, int>& mapPerDiemGap, const Duty* duty, const int offsetTZMinutes, const time_t actFirstMonthStartTimeUtc, const time_t schFirstMonthStartTimeUtc, const string& timeType, const PairingPerDiemHoursForEvaFdRuleParam& ruleParam) const;

};

#endif //_CALCULATEPAIRINGPERDIEMHOURSFOREVAFDRULE_H_