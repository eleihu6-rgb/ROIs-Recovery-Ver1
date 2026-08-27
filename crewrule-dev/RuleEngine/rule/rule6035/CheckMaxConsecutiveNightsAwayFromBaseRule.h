
#ifndef _CHECKMAXCONSECUTIVENIGHTSAWAYFROMBASERULE_H_
#define _CHECKMAXCONSECUTIVENIGHTSAWAYFROMBASERULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxConsecutiveNightsAwayFromBaseRuleParam.h"
#include "../period/WorkPeriod.h"

class CheckMaxConsecutiveNightsAwayFromBaseRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6035;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::CREW;

	explicit CheckMaxConsecutiveNightsAwayFromBaseRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxConsecutiveNightsAwayFromBaseRule::RuleFuncId, CheckMaxConsecutiveNightsAwayFromBaseRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMaxConsecutiveNightsAwayFromBaseRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	bool CheckNightNumber(time_t& start, time_t& end, int maxTimes) const;

	std::vector<CheckMaxConsecutiveNightsAwayFromBaseRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;
};




#endif //_CHECKMAXCONSECUTIVENIGHTSAWAYFROMBASERULE_H_
