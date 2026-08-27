#ifndef _CHECKSCHCONSECUTIVEWOCLRESTFOREVARULE_H_
#define _CHECKSCHCONSECUTIVEWOCLRESTFOREVARULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckSchConsecutiveWOCLRestForEvaRuleParam.h"
#include "../period/WorkPeriod.h"

/*
* 7210的分身，通过计划时间检查MinRest
*/
class CheckSchConsecutiveWOCLRestForEvaRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7268;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckSchConsecutiveWOCLRestForEvaRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckSchConsecutiveWOCLRestForEvaRule::RuleFuncId, CheckSchConsecutiveWOCLRestForEvaRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckSchConsecutiveWOCLRestForEvaRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:


	std::vector<CheckSchConsecutiveWOCLRestForEvaRuleParam> _ruleParams;

	bool CheckRest(const std::shared_ptr<WorkPeriod>& beforeDuty, const std::shared_ptr<WorkPeriod>& afterDuty, const int minRest, const CheckSchConsecutiveWOCLRestForEvaRuleParam& ruleParam) const;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;

	void ThrowRuleViolationForDutyNumber() const;
};




#endif //_CHECKSCHCONSECUTIVEWOCLRESTFOREVARULE_H_
