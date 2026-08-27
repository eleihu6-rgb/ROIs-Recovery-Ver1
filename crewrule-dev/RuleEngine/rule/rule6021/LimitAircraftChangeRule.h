/**
 * @file LimitAircraftChangeRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITAIRCRAFTCHANGERULE_H_
#define _LIMITAIRCRAFTCHANGERULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitAircraftChangeRuleParam.h"


class LimitAircraftChangeRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6021;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit LimitAircraftChangeRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitAircraftChangeRule::RuleFuncId, LimitAircraftChangeRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitAircraftChangeRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

	std::vector<LimitAircraftChangeRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	//判断X基地航班在X机场中转能否换飞机
	bool CheckRule(bool& next, const Duty *duty, const std::string& base, const LimitAircraftChangeRuleParam& ruleParam) const;

	//抛出违反换飞机规则的告警
	void ThrowTransitRuleViolation(const Duty* duty, const Segment* segment, const LimitAircraftChangeRuleParam::WarnCode warnCode) const;

};

#endif //_LIMITAIRCRAFTCHANGERULE_H_
