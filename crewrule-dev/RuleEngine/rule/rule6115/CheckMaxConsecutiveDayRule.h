/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMAXCONSECUTIVEDAYRULE_H_
#define _CHECKMAXCONSECUTIVEDAYRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMaxConsecutiveDayRuleParam.h"
#include "../period/WorkPeriod.h"
#include <bitset>

class CheckMaxConsecutiveDayRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 6115;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckMaxConsecutiveDayRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMaxConsecutiveDayRule::RuleFuncId, CheckMaxConsecutiveDayRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMaxConsecutiveDayRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:


	std::bitset<50> GetDutyDayInRPRange(const std::vector<const ROSTER*>& rosters, const std::vector<string> dutyAssignments, time_t rpStartUtc, time_t rpEndUtc, int CrewBaseOffsetMinutes, int maxConsecutiveDay, string isAddMaxInRP) const;

	//std::bitset<28> GetDutyDayInRPRange(const std::vector<const ROSTER*>& rosters, const std::vector<string> dutyAssignments, time_t rpStartUtc, time_t rpEndUtc, int CrewBaseOffsetMinutes)

	bool CheckConsecutiveDay(const std::bitset<50> & dutyDay, int maxConsecutiveDay, int addMaxConsecutiveDay, string unitParam, int addMaxNumber, int leadinRange, time_t rpStartUtc, string isAddMaxInRP, int rpStartIndex = 0, int rpEndIndex = 27) const;


	std::vector<CheckMaxConsecutiveDayRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;

};




#endif //_CHECKMAXCONSECUTIVEDAYRULE_H_
