#ifndef _CALCULATEMANDAYFTCUSTOMRULE_H_
#define _CALCULATEMANDAYFTCUSTOMRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../CalculateRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMandayFTCustomRuleParam.h"

class CalculateMandayFTCustomRule : public CalculateRule<double> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7006;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleSegment;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CalculateMandayFTCustomRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMandayFTCustomRule::RuleFuncId, CalculateMandayFTCustomRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateMandayFTCustomRule() override = default;

	double Calculate(Segment* segment) override;

private:
	std::vector<CalculateMandayFTCustomRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	double CalculatePercent(Segment * segment);
};




#endif //_CALCULATEMANDAYFTCUSTOMRULE_H_
