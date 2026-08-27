#ifndef _CheckCompositionRequirementForHXRule_H_
#define _CheckCompositionRequirementForHXRule_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckCompositionRequirementForHXRuleParam.h"
#include "../period/WorkPeriod.h"

class CheckCompositionRequirementForHXRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7485;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckCompositionRequirementForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckCompositionRequirementForHXRule::RuleFuncId, CheckCompositionRequirementForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckCompositionRequirementForHXRule() override = default;

	bool CheckRule(const Duty* duty) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
	std::vector<CheckCompositionRequirementForHXRuleParam> _accRuleParams;
	std::vector<CheckCompositionRequirementForHXRuleParam> _unAccRuleParams;

	void ParseParam(const InputType& input);

	bool CheckAcclimatizeDuty(const Duty* duty, const ROSTER* roster = NULL) const;

	bool CheckUnkownDuty(const Duty* duty, const string base, const ROSTER* prevRoster = NULL, const Duty* prevDuty = NULL) const;

	int GetDutyLandingNumber(const Duty* duty) const;

	bool MatchedRuleWhenAcclimatize(const Duty* duty, const CheckCompositionRequirementForHXRuleParam _ruleParam, const time_t checkInTime) const;

	bool MatchedRuleWhenUnknown(const Duty* duty, const CheckCompositionRequirementForHXRuleParam _ruleParam, const time_t prevDutyEndTime, const int offsetMinutes) const;

	void ThrowRuleViolation() const;
};




#endif //_CheckCompositionRequirementForHXRule_H_
