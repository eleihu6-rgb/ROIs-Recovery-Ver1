/**
 * @file CalculateMaxFDPByCalloutStandbyForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-19
**/



#ifndef _CALCULATEMAXFDPBYCALLOUTSTANDBYFORPRRULE_H_
#define _CALCULATEMAXFDPBYCALLOUTSTANDBYFORPRRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFDPByCalloutStandbyForPRRuleParam.h"


class CalculateMaxFDPByCalloutStandbyForPRRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7302;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateMaxFDPByCalloutStandbyForPRRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFDPByCalloutStandbyForPRRule::RuleFuncId, CalculateMaxFDPByCalloutStandbyForPRRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMaxFDPByCalloutStandbyForPRRule() override = default;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<MaxFDPByCalloutStandbyForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime, const std::string& base);

	bool CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, Duty* duty, const MaxFDPByCalloutStandbyForPRRuleParam& ruleParam);

};

#endif //_CALCULATEMAXFDPBYCALLOUTSTANDBYFORPRRULE_H_
