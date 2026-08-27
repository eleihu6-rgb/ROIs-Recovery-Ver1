/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _MINODPINPERIODFORCCRULE_H_
#define _MINODPINPERIODFORCCRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinODPInPeriodForCcRuleParam.h"
#include "../period/WorkPeriod.h"
#include "../period/RestPeriod.h"

class MinODPInPeriodForCcRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6110;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit MinODPInPeriodForCcRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, MinODPInPeriodForCcRule::RuleFuncId, MinODPInPeriodForCcRule::AvailableInterface) {
        ParseParam(input);
    }
    ~MinODPInPeriodForCcRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;
private:

	std::vector<MinODPInPeriodForCcRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	WindowTime GetWindowTime(const std::vector<const ROSTER*>& rosters) const;

	/**
	* 获得RosterPeriod
	*/
	std::vector<RosterPeriod>& GetRosterPeriods() const;

	/*判断工作任务是否在滑动窗口内
	* isStartTime: 为true则使用workPeriod开始时间判断是否在[windowStart,windowEnd], 否则使用使用workPeriod结束时间来判断
	**/
	bool IsSlideWindow(const WorkPeriod& workPeriod, const time_t windowStart, const time_t windowEnd, const bool isStartTime) const;
	
	bool CheckConsecutiveHoursPerPeriod(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
		const unsigned int& maxPeriodDays, const unsigned int& minConsecutiveHoursPerPeriod, const int offsetTZMinutes) const;

	//检查在特定滑动窗口中是否违规
	bool CheckConsecutiveHoursPerPeriod(int& startIndex, const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
		const unsigned int& minConsecutiveMinutesPerPeriod, const time_t& windowStart, const time_t& windowEnd, const time_t& windowSlideSize) const;

	bool CheckConsecutiveNightsPerPeriod(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const unsigned int& maxPeriodNights,
		const unsigned int& minConsecutiveNightsPerPeriod, const std::string& nightStartTimeHHmm, const std::string& nightEndTimeHHmm, const string& nightMinRestInterval, const int offsetTZMinutes) const;

	//检查在特定滑动窗口中是否违规
	bool CheckConsecutiveNightsPerPeriod(int startIndex, const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
		const unsigned int& minConsecutiveNightsPerPeriod, 
		const std::string& nightStartTimeHHmm, const std::string& nightEndTimeHHmm, const string& nightMinRestInterval,
		const time_t& windowStart, const time_t& windowEnd, const time_t& windowSlideSize) const;

	/**
	* 检查排班是否违规最小休息日天数要求
	* @param: rosters 员工所有排班列表
	* @param: rosterPeriods 排班周期列表
	* @param: maxRosterPeriod 废弃不需要使用
	* @param: minDaysFreeOfDuty 最小休息日天数(天）
	*/
	bool CheckDaysFreeOfDutyPerPeriod(const std::vector<const ROSTER*>& rosters,
		const std::vector<RosterPeriod>& rosterPeriods,
		const unsigned int& maxRosterPeriod, const unsigned int& minDaysFreeOfDuty) const;

	/**
	* 检查当前排班周期中是否违规最小休息日天数要求
	* @param: rostersInPeriod  当前排班周期的员工所有排班列表
	* @param: maxRosterPeriod 废弃不需要使用
	* @param: minDaysFreeOfDuty 最小休息日天数(天）
	*/
	bool CheckDaysFreeOfDutyInPeriod(const std::vector<const ROSTER*>& rostersInPeriod,
		const unsigned int& maxRosterPeriod, const unsigned int& minDaysFreeOfDuty) const;

	//需要迁移到RosterPeriod类中 by hexd
	std::map<RosterPeriod*, std::vector<const ROSTER*>> GetRostersInPeriod(const std::vector<const ROSTER*>& rosters,
		const std::vector<RosterPeriod>& rosterPeriods) const;

	//需要迁移到RosterPeriod类中 by hexd
	std::vector<const ROSTER*> GetRostersInPeriod(const std::vector<const ROSTER*>& rosters,	const RosterPeriod& rosterPeriod) const;

	//判断roster是否在RosterPeriod中，需要迁移到RosterPeriod类中  by hexd
	bool MatchRosterPeriod(const ROSTER* roster, const RosterPeriod& rosterPeriod) const;

	//判断是否休息任务
	bool IsRestAssignment(const std::string& assignment) const;

	//获得时间段内RDO的天数
	int GetDaysFreeOfDuty(const time_t& startTime, const time_t& endTime) const;

	bool MatchLocalNight(const std::shared_ptr<RestPeriod>& restPeriod, 
		const std::string& nightStartTimeHHmm, const std::string& nightEndTimeHHmm) const;

	/**
	* 获得连续休息之间的连续本地夜晚数量
	* @param prevRestPeriod 前一个休息期
	* @param restPeriod 当前休息期
	* @param consecutiveNightsBefore 之前休息期（可能多个）累计本地夜晚数量
	* @param localNightNums 当前休息期本地夜晚数量
	* @return 
	*/
	unsigned int GetConsecutiveLocalNight(const std::shared_ptr<RestPeriod>& prevRestPeriod, const std::shared_ptr<RestPeriod>& restPeriod,
		const unsigned int consecutiveNightsBefore, const unsigned int localNightNums) const;

	//抛出不满足某段时间内连续休息小时告警
	void ThrowRuleViolationForConsecutiveHours() const;

	//抛出不满足某段时间内连续本地夜晚休息告警
	void ThrowRuleViolationForConsecutiveNights() const;

	//抛出不满足某段时间内休息日天数告警
	void ThrowRuleViolationForDaysFreeOfDuty() const;

};




#endif //_MINODPINPERIODFORCCRULE_H_
