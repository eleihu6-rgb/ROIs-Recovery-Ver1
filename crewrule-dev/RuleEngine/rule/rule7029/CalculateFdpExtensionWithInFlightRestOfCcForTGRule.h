/**
 * @file CalculateFdpExtensionWithInFlightRestOfCcForTGRule.h
 * @brief 7029法规规则类 - TG FDP Extension with in-flight rest for Cabin Crew
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-09
**/

#ifndef _CALCULATEFDPEXTENSIONWITHINFLIGHTRESTOFCCTGFORCCRULE_H_
#define _CALCULATEFDPEXTENSIONWITHINFLIGHTRESTOFCCTGFORCCRULE_H_

#include <string>
#include <vector>
#include <map>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "FdpExtensionWithInFlightRestForCcRuleParam.h"

class CalculateFdpExtensionWithInFlightRestOfCcForTGRule : public CalculateRule<int> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7029;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CalculateFdpExtensionWithInFlightRestOfCcForTGRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateFdpExtensionWithInFlightRestOfCcForTGRule::RuleFuncId, CalculateFdpExtensionWithInFlightRestOfCcForTGRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateFdpExtensionWithInFlightRestOfCcForTGRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
	std::unique_ptr<FdpExtensionWithInFlightRestForCcRuleParam> _ruleParam{ nullptr };

	void ParseParam(const InputType& input);

	//对rosterList中的所有duty进行FDP扩展计算
	void CalculateDuty(vector<Duty*>& duties);

	//根据Segment查找FDP扩展配置
	const FdpExtensionWithInFlightRestForCcConfigParam* FindFdpExtensionConfigParam(const Duty* duty, const Segment* segment) const;

	//根据fleet和flightNumber查找航班运行时间配置
	const FlightOperationTimeForCcConfigParam* FindFlightOperTimeConfigParam(const Segment* segment) const;

	//计算获得sector的in-flight rest时长
	int GetInFlightRest(const Duty* duty, const Segment* segment, const int group) const;

};

#endif //_CALCULATEFDPEXTENSIONWITHINFLIGHTRESTOFCCTGFORCCRULE_H_
