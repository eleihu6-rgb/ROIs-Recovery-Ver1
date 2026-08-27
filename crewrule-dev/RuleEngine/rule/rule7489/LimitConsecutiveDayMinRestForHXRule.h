/**
 * @file LimitConsecutiveDayMinRestForHXRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-13
**/



#ifndef _LIMITCONSECUTIVEDAYMINRESTFORHXRULE_H_
#define _LIMITCONSECUTIVEDAYMINRESTFORHXRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../period/WorkPeriod.h"
#include "LimitConsecutiveDayMinRestForHXRuleParam.h"
#include "../rule7401/AnrDayOffDefinition.h"

class LimitConsecutiveDayMinRestForHXRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7489;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitConsecutiveDayMinRestForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitConsecutiveDayMinRestForHXRule::RuleFuncId, LimitConsecutiveDayMinRestForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitConsecutiveDayMinRestForHXRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitConsecutiveDayMinRestForHXRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const;

private:
	bool CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const vector<ROSTER*>& possibleViolatedlayoverRosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const;

	//获得休息次数
	void GetRestTimes(int& restTimes, int& consecutiveRestTimes, int& violatedLayoverAssignmentTimes, const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const vector<ROSTER*>& possibleViolatedlayoverRosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const;
	void GetRestTimes(int& restTimes, int& consecutiveRestTimes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int restOffsetTZMinutes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const;

	//获得可能违规的在Layover安排的任务列表（匹配LayoverAssignment，但时长小于minLayoverAssignmentsDuration的任务）
	vector<ROSTER*> GetPossibleViolatedLayoverRosters(const std::shared_ptr<CREW>& crew, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const;

	//获得违规的Layover任务的数量
	int GetViolatedLayoverRosterTimes(const WorkPeriod* beforeWorkPeriod, const WorkPeriod* currWorkPeriod, const vector<ROSTER*>& layoverRosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const;

	void ThrowRuleViolationForRestTimes(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int totalDaysOff, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const;

	void ThrowRuleViolationForConsecutiveRestTimes(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int maxDaysOffInRest, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const;

	void ThrowRuleViolationForLayoverAssignmentDuration(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int violatedLayoverRosterTimes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const;

};

#endif //_LIMITCONSECUTIVEDAYMINRESTFORHXRULE_H_
