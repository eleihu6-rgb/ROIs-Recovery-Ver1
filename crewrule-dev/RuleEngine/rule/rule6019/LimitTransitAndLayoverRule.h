/**
 * @file LimitTransitAndLayoverRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITTRANSITANDLAYOVERRULE_H_
#define _LIMITTRANSITANDLAYOVERRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "TransitAndLayoverRuleParam.h"


class LimitTransitAndLayoverRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6019;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit LimitTransitAndLayoverRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitTransitAndLayoverRule::RuleFuncId, LimitTransitAndLayoverRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitTransitAndLayoverRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

	//TransitAndLayoverRuleParam聚合其他参数对象
	std::unique_ptr<TransitAndLayoverRuleParam> _ruleParam{nullptr};

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties) const;

	//判断X基地航班在X机场中转能否过夜
	bool CheckRule(const Duty *duty, const std::string& base, const LimitLayoverParam& ruleParam) const;

	//判断X基地航班在X机场中转能否换飞机，以及是否满足中转时长
	bool CheckRule(bool& next, const Duty *duty, const std::string& base, const LimitAircraftChangeAndConnectionParam& ruleParam) const;

	//抛出违反过夜规则的告警
	void ThrowLayoverRuleViolation(const Duty* duty) const;

	//抛出违反中转规则的告警
	void ThrowTransitRuleViolation(const Duty* duty, const Segment* segment, const LimitAircraftChangeAndConnectionParam::WarnCode warnCode) const;

};

#endif //_LIMITTRANSITANDLAYOVERRULE_H_
