/**
 * @file LimitFlightDHDRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _ADAPTIONPERIOD4MAXFDPRULE_H_
#define _ADAPTIONPERIOD4MAXFDPRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../rule6005/AdaptionPeriodParam.h"
#include "AdaptionPeriod4MaxFDPRuleParam.h"


class AdaptionPeriod4MaxFDPRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6038;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit AdaptionPeriod4MaxFDPRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, AdaptionPeriod4MaxFDPRule::RuleFuncId, AdaptionPeriod4MaxFDPRule::AvailableInterface) {
		ParseParam(input);
	}
	~AdaptionPeriod4MaxFDPRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	void ParseParam(const InputType& input);

private:

	std::vector<AdaptionPeriod4MaxFDPRuleParam> _ruleParams;

	std::vector<AdaptionPeriodParam> _ruleParamsOfAdpPeriod;


	bool CheckRule(const vector<Duty*>& duties) const;
};

#endif //_ADAPTIONPERIOD4MAXFDPRULE_H_
