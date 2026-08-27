/**
 * @file LimitLongTransitRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITLONGTRANSITRULE_H_
#define _LIMITLONGTRANSITRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitLongTransitRuleParam.h"


class LimitLongTransitRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6018;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit LimitLongTransitRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitLongTransitRule::RuleFuncId, LimitLongTransitRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitLongTransitRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

	std::vector<LimitLongTransitRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	//判断X基地航班在X机场能否长中转（前提是Split Duty）
	bool CheckRule(bool& next, const Duty *duty, const std::string& base, const LimitLongTransitRuleParam& ruleParam) const;

	//抛出违反长中转规则的告警
	void ThrowLongTransitRuleViolation(const Duty* duty, const Segment* segment) const;

};

#endif //_LIMITLONGTRANSITRULE_H_
