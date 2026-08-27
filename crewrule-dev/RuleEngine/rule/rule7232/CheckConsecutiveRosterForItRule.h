#ifndef _CHECKCONSECUTIVEROSTERFORITRULE_H_
#define _CHECKCONSECUTIVEROSTERFORITRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckConsecutiveRosterForItRuleParam.h"

class CheckConsecutiveRosterForItRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7232;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckConsecutiveRosterForItRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckConsecutiveRosterForItRule::RuleFuncId, CheckConsecutiveRosterForItRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckConsecutiveRosterForItRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	//std::bitset<28> GetDutyDayInRPRange(const std::vector<const ROSTER*>& rosters, const std::vector<string> dutyAssignments, long rpStartUtc, long rpEndUtc, int CrewBaseOffsetMinutes)

	int getBlankDaysBetweenRosters(const ROSTER* roster1, const ROSTER* roster2) const;


	std::vector<CheckConsecutiveRosterForItRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;

};




#endif //_CHECKCONSECUTIVEROSTERFORITRULE_H_
