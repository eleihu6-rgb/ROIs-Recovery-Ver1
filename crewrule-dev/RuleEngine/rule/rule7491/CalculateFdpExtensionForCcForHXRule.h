/**
 * @file CalculateFdpExtensionForCcForHXRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/

#ifndef _CalculateFdpExtensionForCcForHXRule_H_
#define _CalculateFdpExtensionForCcForHXRule_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateFdpExtensionForCcForHXRuleParam.h"


class CalculateFdpExtensionForCcForHXRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7491;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateFdpExtensionForCcForHXRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateFdpExtensionForCcForHXRule::RuleFuncId, CalculateFdpExtensionForCcForHXRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateFdpExtensionForCcForHXRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

	std::vector<CalculateFdpExtensionForCcForHXRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*>& duties, const ROSTER* preRoster = nullptr);

private:

	//获取最小的空中休息时间
	vector<int> GetMinRestInFlight(const Segment* segment, const Duty* duty) const;

	//根据FDP上限获取空中休息时间
	int CalculateRestInFlightByMaxFDP(const int maxFdpMinutes, const Segment* segment, const time_t fdpStartTime) const;

	//获取FDP上限经历的起飞降落时间
	int GetTakeOffAndLandingMinutesByFdpLimit(const int maxFdpMinutes, const Segment* segment, const time_t fdpStartTime) const;

};

#endif //_CalculateFdpExtensionForCcForHXRule_H_
