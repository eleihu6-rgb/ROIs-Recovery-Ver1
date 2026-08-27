/**
 * @file LimitDutyDaysOffForHXRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/



#ifndef _LIMITDUTYDAYSOFFFORHXRULE_H_
#define _LIMITDUTYDAYSOFFFORHXRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../period/WorkPeriod.h"
#include "LimitDutyDaysOffForHXRuleParam.h"
#include "../rule7401/AnrDayOffDefinition.h"

class LimitDutyDaysOffForHXRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7480;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitDutyDaysOffForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitDutyDaysOffForHXRule::RuleFuncId, LimitDutyDaysOffForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitDutyDaysOffForHXRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitDutyDaysOffForHXRuleParam> _ruleParams;

	AnrDayOffDefinition _dayOffDefinition;

	void ParseParam(const InputType& input);

	/*通过Consecutive Days进行分组，分成父子规则。
	* 相同连续天数Consecutive Days，父规则为isCrewAgreeWork==nullptr&&isDHDLastDay==nullptr, 不满足父规则再检查子规则
	* @return tuple<父规则，子规则列表>
	*/
	vector<std::tuple<LimitDutyDaysOffForHXRuleParam*, vector<LimitDutyDaysOffForHXRuleParam*>>> GetRuleParamMap() const;

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam, const vector<LimitDutyDaysOffForHXRuleParam*>& childrenRuleParams) const;

	bool CheckRule(int& maxDaysOffInRest, int& totalDaysOff, const std::vector<const ROSTER*>& rosters, const vector<ROSTER*>& possibleLayoverGroundRosters, const std::shared_ptr<CREW>& crew, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const time_t lastDayStartTimeUtc, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

private:
	//检查Manday中DDO是否满足要求
	bool CheckDaysOffFromManday(const vector<time_t>& actDaysOffDateInManday, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;
	
	//检查Duty Layover安排的任务EXB(等价于DDO)是否满足要求
	bool CheckDaysOffFromLayoverGroundRosters(const vector<ROSTER*>& layoverGroundRosters, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//检查Roster+Manday中DDO是否满足要求
	bool CheckDaysOff(int& maxDaysOffInRest, int& totalDaysOff, const int daysOff, const int daysOffOfAssignment, const int excludingDONum, const time_t restStartTimeUtc, const time_t restEndTimeUtc, const vector<time_t>& actDaysOffDateInManday, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//匹配子规则
	bool MatchChildRuleParam(const std::vector<const ROSTER*>& rosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const time_t lastDayStartTimeUtc, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& childRuleParam) const;
	
	bool MatchDHDAndCrewAgreeWorkLastDay(const ROSTER* lastDayRoster, const time_t lastDayStartTimeUtc, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//获得需要排除的DO数量
	int ExcludingDaysOffNum(const ROSTER* prevWorkRoster, const ROSTER* currWorkRoster, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//从manday数据统计roster之前DDO日期
	vector<time_t> GetDaysOffFromManday(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, 
		const int offsetTZMinutes, const bool isCountBlankDay, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	vector<time_t> GetDaysOffFromManday(const std::shared_ptr<CREW_MANDAY_BASIC>& prevManday, const std::shared_ptr<CREW_MANDAY_BASIC>& currManday, 
		const time_t rostersStartDayLoc, const time_t rostersEndDayLoc, const time_t rangeStartTimeLoc, const time_t rangeEndTimeLoc, 
		const bool isCountBlankDay, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//获得所有DDO日期(本地时间)
	vector<time_t> GetDaysOffDates(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//获得可能在Layover安排的任务列表（匹配LayoverAssignment任务）
	vector<ROSTER*> GetPossibleLayoverGroundRosters(const std::shared_ptr<CREW>& crew, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//获得满足条件的在Layover安排的任务列表（匹配LayoverAssignment，但时长大于等于layoverAssignmentsDuration的任务）
	vector<ROSTER*> GetLayoverGroundRosters(const ROSTER* roster, const vector<ROSTER*>& possibleLayoverGroundRosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//检查DDO后14天内是否有连续2个DDO（平移检查逻辑）
	bool CheckRuleFollowingDdo(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//检查时间段内是否存在连续多个DDO
	bool HasConsecutiveDDO(int& firstConsecutiveStartIndex, int& firstConsecutiveEndIndex, const vector<time_t>& ddoDates, const time_t startTimeLoc, const time_t endTimeLoc, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	//用户是否最后一天任务
	bool IsLastDayTask(const ROSTER* currRoster, const time_t lastDayStartTimeUtc) const;

    /*
	* 用户是否给最后一天安排了任务设置同意工作标志
	* @param lastDayRoster：最后一天Roster
	* @param lastDayStartTimeUtc：最后一天开始时间
	* @return true-在最后一天设置同意工作标志，false-在最后一天未设置同意工作标志
	*/
	bool IsCrewAgreeWork(const ROSTER* lastDayRoster, const time_t lastDayStartTimeUtc) const;

	/*
	* 最后一天只能安排了DHD任务
	* @param lastDayRoster：最后一天Roster
	* @param lastDayStartTimeUtc：最后一天开始时间
	* @return true-在最后一天仅有DHD任务，false-在最后一天有非DHD任务
	*/
	bool IsOnlyDHD(const ROSTER* lastDayRoster, const time_t lastDayStartTimeUtc) const;

	//地面任务结束是59分钟，差一分钟需要补回
	int GetEndTimeGapInSec(const ROSTER* roster) const;

    //获得不适应状态转换成适应状态的时差，单位分钟
	int GetAccStateTimeZoneDiff(const Duty* prevDuty) const;

	//针对检查时间段内[startTimeUtc,endTimeUtc)的rosters有工作任务，则不能忽略检查；否则忽略检查
	bool IgnoreCheck(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinutes) const;

	void ThrowRuleViolationForMinDO(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int totalDaysOff, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

	void ThrowRuleViolationForMinConsecutiveDO(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int maxDaysOffInRest, const LimitDutyDaysOffForHXRuleParam& ruleParam) const;

};

#endif //_LIMITDUTYDAYSOFFFORHXRULE_H_
