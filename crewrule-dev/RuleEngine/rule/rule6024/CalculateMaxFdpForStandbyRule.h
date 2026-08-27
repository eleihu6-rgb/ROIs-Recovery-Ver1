/**
 * @file CalculateMaxFdpForStandbyRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEMAXFDPFORSTANDBYRULE_H_
#define _CALCULATEMAXFDPFORSTANDBYRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFdpForStandbyRuleParam.h"


class CalculateMaxFdpForStandbyRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6024;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateMaxFdpForStandbyRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFdpForStandbyRule::RuleFuncId, CalculateMaxFdpForStandbyRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMaxFdpForStandbyRule() override = default;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<MaxFdpForStandbyRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, const std::string& base);

	bool CalculateDuty(const string& standbyAssignmentGroup, const string& standbyAssignment, Duty* duty, const long callinSBY_FDPMins, const std::string& base, const MaxFdpForStandbyRuleParam& ruleParam);

};

#endif //_CALCULATEMAXFDPFORSTANDBYRULE_H_
