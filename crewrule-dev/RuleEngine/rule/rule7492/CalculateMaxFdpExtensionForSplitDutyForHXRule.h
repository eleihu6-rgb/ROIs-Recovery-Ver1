/**
 * @file CalculateMaxFdpExtensionForSplitDutyForHXRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-03-30
**/

#ifndef _CalculateMaxFdpExtensionForSplitDutyForHXRule_H_
#define _CalculateMaxFdpExtensionForSplitDutyForHXRule_H_

#include <string>
#include "../RuleInput.h"
#include "../CalculateRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMaxFdpExtensionForSplitDutyForHXRuleParam.h"


class CalculateMaxFdpExtensionForSplitDutyForHXRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7492;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMaxFdpExtensionForSplitDutyForHXRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFdpExtensionForSplitDutyForHXRule::RuleFuncId, CalculateMaxFdpExtensionForSplitDutyForHXRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMaxFdpExtensionForSplitDutyForHXRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

	std::vector<CalculateMaxFdpExtensionForSplitDutyForHXRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*>& duties, const ROSTER* preRoster = nullptr);

	//计算因LT休息时间带来的FDP延长值
	int CalculateFdpExtensionByLtRest(const Duty* duty, const CalculateMaxFdpExtensionForSplitDutyForHXRuleParam& ruleParam) const;

	bool MatchSplitFdpLimits(const Duty* duty, const Segment* currentSeg, const Segment* nextSeg,
		const CalculateMaxFdpExtensionForSplitDutyForHXRuleParam& ruleParam) const;
};

#endif //_CalculateMaxFdpExtensionForSplitDutyForHXRule_H_
