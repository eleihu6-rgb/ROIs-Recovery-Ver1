/**
 * @file LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-26
**/



#ifndef _LIMITLATEFINISHANDEARLYSTARTOFREDEYEDUTYFORHXRULE_H_
#define _LIMITLATEFINISHANDEARLYSTARTOFREDEYEDUTYFORHXRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam.h"
#include "../rule7481/RedEyeDefinitionForHXParam.h"

class BaseActivityPeriod;

class LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7486;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::RuleFuncId, LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const;

	//检查连续N个红眼任务合规性
	bool CheckConsecutiveRedeyeTimes(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const;
	bool CheckConsecutiveRedeyeTimes(size_t& currIndex, const bool isRollCheck, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const;

	//检查特定时间段内连续N个红眼任务合规性
	bool CheckConsecutiveRedeyeTimes(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const;
	
	//检查特定时间段内N个红眼任务合规性（红眼任务可能连续，也可能不连续）
	bool CheckRedeyeTimes(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const;

	bool GetConsecutiveTimesLastIndex(int& lastIndex, vector<shared_ptr<BaseActivityPeriod>>& consecutiveActivityPeriods, const size_t currentIndex, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const;

	//判断是否满足连续次数要求
	bool IsConsecutiveTimes(const shared_ptr<BaseActivityPeriod>& prevActivityPeriod, const shared_ptr<BaseActivityPeriod>& currActivityPeriod, const int offsetTZMinutes) const;
private:

	void ThrowRuleViolationForLateFinish(const int actRestMinutes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const ROSTER* roster, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const;

	void ThrowRuleViolationForEarlyStart(const int actRestMinutes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const ROSTER* roster, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const;

	void ThrowRuleViolationForMaxFDPOfDuty(const Duty* duty, const ROSTER* roster, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const;
};

#endif //_LIMITLATEFINISHANDEARLYSTARTOFREDEYEDUTYFORHXRULE_H_
