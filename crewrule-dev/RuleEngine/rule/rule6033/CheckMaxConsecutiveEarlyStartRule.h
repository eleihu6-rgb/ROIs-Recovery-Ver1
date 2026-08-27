#ifndef _CHECKMAXCONSECUTIVEEARLYSTARTRULE_H_
#define _CHECKMAXCONSECUTIVEEARLYSTARTRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxConsecutiveEarlyStartRuleParam.h"
#include "../period/WorkPeriod.h"

class CheckMaxConsecutiveEarlyStartRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6033;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckMaxConsecutiveEarlyStartRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxConsecutiveEarlyStartRule::RuleFuncId, CheckMaxConsecutiveEarlyStartRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMaxConsecutiveEarlyStartRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	bool CheckConsecutiveEarlyStart(int allowMax, int firstMax, int firstReduceFDP, int secondMax, int secondReduceFDP, int consecutiveEarlyDuties, int notEarlierThan, Duty* prevDuty, Duty* pPrevDuty) const;

	std::vector<CheckMaxConsecutiveEarlyStartRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;
};




#endif //_CHECKMAXCONSECUTIVEEARLYSTARTRULE_H_
