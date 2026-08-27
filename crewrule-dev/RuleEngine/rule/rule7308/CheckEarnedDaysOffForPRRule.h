/**
 * @file CheckEarnedDaysOffForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-08-21
**/



#ifndef _CHECKEARNEDDAYSOFFFORPRRULE_H_
#define _CHECKEARNEDDAYSOFFFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckEarnedDaysOffForPRRuleParam.h"

struct ActivityPeriod {
	ROSTER* roster = nullptr;
	Activity* activity = nullptr;//Pairing、Duty、Segment或Ground Roster
	bool isRest = false;//是否是休息。true：休息，false：非休息
	bool isCheckWorkingTask = false;//是否是检查Working Task(Pairing、Duty、Segment、RosterGround)，true：需要检查对象，false：不需要检查
};

class CheckEarnedDaysOffForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7308;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckEarnedDaysOffForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckEarnedDaysOffForPRRule::RuleFuncId, CheckEarnedDaysOffForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckEarnedDaysOffForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CheckEarnedDaysOffForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const;

	bool CheckRule(size_t& currentIndex, const shared_ptr<ActivityPeriod>& currActivityPeriod, const int totalConsecutiveWorkingDays, const vector<shared_ptr<ActivityPeriod>>& activityPeriods, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const;

private:

	bool CheckRule(const int consecutiveWorkingDays, const time_t restStartTimeUtc, const time_t restEndTimeUtc, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const;

	vector<shared_ptr<ActivityPeriod>> GetActivityPeriods(const std::vector<const ROSTER*>& rosters, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const;

	shared_ptr<ActivityPeriod> GetActivityPeriodWithWorking(const Activity* activity, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const;

	//判断是否连续天
	bool isConsecutiveDays(const shared_ptr<ActivityPeriod>& prevActivityPeriod, const shared_ptr<ActivityPeriod>& currActivityPeriod) const;
	
	//判断是否在同一天
	bool isSameDays(const shared_ptr<ActivityPeriod>& prevActivityPeriod, const shared_ptr<ActivityPeriod>& currActivityPeriod) const;

	void ThrowRuleViolation(const shared_ptr<ActivityPeriod>& activityPeriod, const int consecutiveWorkingDays, const time_t restStartTimeUtc, const time_t restEndTimeUtc, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const;

};

#endif //_CHECKEARNEDDAYSOFFFORPRRULE_H_
