#ifndef _CHECKMAXCONSECUTIVEWOCLDUTYRULE_H_
#define _CHECKMAXCONSECUTIVEWOCLDUTYRULE_H_

#include <string>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxConsecutiveWOCLDutyRuleParam.h"
#include "../period/WorkPeriod.h"

class CheckMaxConsecutiveWOCLDutyRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6032;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckMaxConsecutiveWOCLDutyRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxConsecutiveWOCLDutyRule::RuleFuncId, CheckMaxConsecutiveWOCLDutyRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMaxConsecutiveWOCLDutyRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	bool CheckConsecutiveWOCL(int allowMax, int firstMax, int firstReduceFDP, int needLocalNightNum, int checkLocalNightIndex, int secondMax, int secondReduceFDP, int consecutiveEarlyDuties, int notEarlierThan, vector<Duty*> checkVector) const;

	int GetLocalNightNum(const time_t startTimeUtc, const time_t endTimeUtc, const int needLocalNightNum, const int offsetTZMinute) const;

	std::vector<CheckMaxConsecutiveWOCLDutyRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;
};




#endif //_CHECKMAXCONSECUTIVEWOCLDUTYRULE_H_
