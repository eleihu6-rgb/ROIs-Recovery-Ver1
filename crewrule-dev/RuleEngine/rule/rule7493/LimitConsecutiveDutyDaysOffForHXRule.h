/**
 * @file LimitConsecutiveDutyDaysOffForHXRule.h
 * @brief 日历月最少N次连续X个DDO规则类
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-05-28
**/

#ifndef _LIMITCONSECUTIVEDUTYDAYSOFFFORHXRULE_H_
#define _LIMITCONSECUTIVEDUTYDAYSOFFFORHXRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../period/WorkPeriod.h"
#include "ConsecutiveDutyDaysOffForHXRuleParam.h"
#include "../rule7401/AnrDayOffDefinition.h"

class LimitConsecutiveDutyDaysOffForHXRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7493;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitConsecutiveDutyDaysOffForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitConsecutiveDutyDaysOffForHXRule::RuleFuncId, LimitConsecutiveDutyDaysOffForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitConsecutiveDutyDaysOffForHXRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<ConsecutiveDutyDaysOffForHXRuleParam> _ruleParams;

	AnrDayOffDefinition _dayOffDefinition;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const;

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const std::shared_ptr<CREW>& crew, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int offsetTZMinutes, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const;

	//从manday数据统计roster之前DDO日期
	vector<time_t> GetDaysOffFromManday(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc,
		const int offsetTZMinutes, const bool isCountBlankDay, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const;

	vector<time_t> GetDaysOffFromManday(const std::shared_ptr<CREW_MANDAY_BASIC>& prevManday, const std::shared_ptr<CREW_MANDAY_BASIC>& currManday,
		const time_t rostersStartDayLoc, const time_t rostersEndDayLoc, const time_t rangeStartTimeLoc, const time_t rangeEndTimeLoc,
		const bool isCountBlankDay, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const;

	//获得所有DDO日期(本地时间)
	vector<time_t> GetDaysOffDates(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const;

	//计算连续n个(consecutiveDaysOff)DDO出现次数
	int CountConsecutiveDaysOffOccurrences(const vector<time_t>& ddoDates, const int consecutiveDaysOff) const;

	void ThrowRuleViolation(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int occurrences, const ConsecutiveDutyDaysOffForHXRuleParam& ruleParam) const;
};

#endif //_LIMITCONSECUTIVEDUTYDAYSOFFFORHXRULE_H_