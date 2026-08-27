/**
 * @file CheckBirthdayDaysOffForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/



#ifndef _CHECKBIRTHDAYDAYSOFFFORPRRULE_H_
#define _CHECKBIRTHDAYDAYSOFFFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckBirthdayDaysOffForPRRuleParam.h"

class CheckBirthdayDaysOffForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7324;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckBirthdayDaysOffForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckBirthdayDaysOffForPRRule::RuleFuncId, CheckBirthdayDaysOffForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckBirthdayDaysOffForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CheckBirthdayDaysOffForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const time_t birthdayUtc, const int offsetTZMinutes, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const;

	//检查生日前后[daysOffBeforeBirthday,daysOffAfterBirthday]必须安排DO任务,且仅能安排DO任务
	bool CheckRuleForDOAssignment(map<time_t, std::tuple<std::shared_ptr<bool>, ROSTER*>>& birthdayRangesMap, const ROSTER* roster, const time_t birthdayUtc, const int offsetTZMinutes, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const;

	//检查生日前后签出和签到时间是否满足
	bool CheckRuleForLatestEndAndEarliestStart(bool& next, const ROSTER* currRoster, const ROSTER* nextRoster, const time_t startDayUtcLower, const time_t endDayUtcUpper, const time_t latestCheckoutTimeUtc, const time_t earliestCheckInTimeUtc,  const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const;
private:
	//获得Crew在场景内的生日
	time_t GetBirthdayUtcInScenario(const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const time_t checkedStartTime, const time_t checkedEndTime) const;

	void ThrowRuleViolationForNotAssignDO(const time_t birthdayUtc, const time_t checkedStartUtc, const time_t checkedEndUtc, const time_t checkBirthdayUtc, const ROSTER* roster, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForLatestEnd(const ROSTER* roster, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForEarliestStart(const ROSTER* roster, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const;

};

#endif //_CHECKBIRTHDAYDAYSOFFFORPRRULE_H_
