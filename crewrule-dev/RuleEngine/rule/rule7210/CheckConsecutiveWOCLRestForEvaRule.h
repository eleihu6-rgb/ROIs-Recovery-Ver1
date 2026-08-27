#ifndef _CHECKCONSECUTIVEWOCLRESTFOREVARULE_H_
#define _CHECKCONSECUTIVEWOCLRESTFOREVARULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckConsecutiveWOCLRestForEvaRuleParam.h"
#include "../period/WorkPeriod.h"

class CheckConsecutiveWOCLRestForEvaRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7210;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckConsecutiveWOCLRestForEvaRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckConsecutiveWOCLRestForEvaRule::RuleFuncId, CheckConsecutiveWOCLRestForEvaRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckConsecutiveWOCLRestForEvaRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:


	std::vector<CheckConsecutiveWOCLRestForEvaRuleParam> _ruleParams;

	bool CheckRest(const std::shared_ptr<WorkPeriod>& beforeDuty, const std::shared_ptr<WorkPeriod>& afterDuty, const int minRest, const CheckConsecutiveWOCLRestForEvaRuleParam& ruleParam) const;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;

	void ThrowRuleViolationForDutyNumber() const;
};




#endif //_CHECKCONSECUTIVEWOCLRESTFOREVARULE_H_
