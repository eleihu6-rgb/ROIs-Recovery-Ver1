#ifndef _CHECKCONSECUTIVEDUTYRULE_H_
#define _CHECKCONSECUTIVEDUTYRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckConsecutiveDutyRuleParam.h"

class CheckConsecutiveDutyRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7008;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckConsecutiveDutyRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckConsecutiveDutyRule::RuleFuncId, CheckConsecutiveDutyRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckConsecutiveDutyRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	//std::bitset<28> GetDutyDayInRPRange(const std::vector<const ROSTER*>& rosters, const std::vector<string> dutyAssignments, long rpStartUtc, long rpEndUtc, int CrewBaseOffsetMinutes)

	int getBlankDaysBetweenRosters(const ROSTER* roster1, const ROSTER* roster2) const;


	std::vector<CheckConsecutiveDutyRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;

};




#endif //_CHECKCONSECUTIVEDUTYRULE_H_
