/**
 * @file CheckReducedRestForTGRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/



#ifndef _CHECKREDUCEDRESTFORTGRULE_H_
#define _CHECKREDUCEDRESTFORTGRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateReducedRestForTGRuleParam.h"


class CheckReducedRestForTGRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7022;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckReducedRestForTGRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckReducedRestForTGRule::RuleFuncId, CheckReducedRestForTGRule::AvailableInterface) {
		ParseParam(input);
	}

	~CheckReducedRestForTGRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CalculateReducedRestForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	//判断两个DO之间是否超过最大数量
	bool CheckMaxTimesBetweenDO(const std::vector<const ROSTER*>& rosters, const CalculateReducedRestForTGRuleParam& ruleParam) const;

	void ThrowRuleViolation() const;
};

#endif //_CHECKREDUCEDRESTFORTGRULE_H_
