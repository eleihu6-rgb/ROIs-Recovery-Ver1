/**
 * @file CalculateMaxFdpOnStandbyOfCcForTGRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEMAXFDPONSTANDBYOFCCFORTGRULE_H_
#define _CALCULATEMAXFDPONSTANDBYOFCCFORTGRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFdpOnStandbyOfCcForTGRuleParam.h"


class CalculateMaxFdpOnStandbyOfCcForTGRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7018;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateMaxFdpOnStandbyOfCcForTGRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFdpOnStandbyOfCcForTGRule::RuleFuncId, CalculateMaxFdpOnStandbyOfCcForTGRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMaxFdpOnStandbyOfCcForTGRule() override = default;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<MaxFdpOnStandbyOfCcForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, const std::string& base);

	bool CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, Duty* duty, const long callinSBY_FDPMins, const std::string& base, const MaxFdpOnStandbyOfCcForTGRuleParam& ruleParam);

	int GetStandbyDurationAfterHHmm(const ROSTER* standbyRoster, const ROSTER* flyRoster, const MaxFdpOnStandbyOfCcForTGRuleParam& ruleParam) const;

};

#endif //_CALCULATEMAXFDPONSTANDBYOFCCFORTGRULE_H_
