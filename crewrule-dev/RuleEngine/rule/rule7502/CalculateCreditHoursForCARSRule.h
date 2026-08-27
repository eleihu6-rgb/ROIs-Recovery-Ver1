#pragma once
#ifndef _CALCULATECREDITHOURSFORCARSRULE_H_
#define _CALCULATECREDITHOURSFORCARSRULE_H_

#include <string>
#include <tuple>
#include <vector>
#include <map>
#include <memory>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CreditHoursForCARSRuleParam.h"
#include "CrewDB.h"

class CalculateCreditHoursForCARSRule : public CalculateRule<std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>>> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7502;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateCreditHoursForCARSRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateCreditHoursForCARSRule::RuleFuncId, CalculateCreditHoursForCARSRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateCreditHoursForCARSRule() override = default;

	//返回值：计算manday的Credit Hour, std::tuple<map<localDay,MandayCredit(分钟数)>, map<rosterId,Pairing Credit(分钟数)>, map<rosterId, map<segmentId,Segment Credit(分钟数)>>>
	std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> Calculate(std::vector<const ROSTER*>& rosters) override;

private:

	std::vector<CreditHoursForCARSRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	/**
	* 计算Credit Hour，取以下三个值的最大值：
	* 1. Minimum CH (固定值 04:00)
	* 2. Flight Time * FT Ratio
	* 3. Duty Period * DP Ratio
	* @param segment 航段
	* @param dutyPeriod DP时长(分钟)
	* @param offsetTZMinutes 时区偏移(分钟)
	* @param timeType 时间类型: "SCH" 或 "ACT"
	* @param ruleParam 规则参数
	* @return Credit值(分钟)
	*/
	int CalculateCredit(const Segment* segment, int dutyPeriodMinutes, const int offsetTZMinutes, const std::string& timeType, const CreditHoursForCARSRuleParam& ruleParam);

	/**
	* 计算地面任务的Credit Hour
	* @param roster 地面任务
	* @param dutyPeriodMinutes DP时长(分钟)
	* @param offsetTZMinutes 时区偏移(分钟)
	* @param timeType 时间类型: "SCH" 或 "ACT"
	* @param ruleParam 规则参数
	* @return Credit值(分钟)
	*/
	int CalculateCredit(const ROSTER* roster, int dutyPeriodMinutes, const int offsetTZMinutes, const std::string& timeType, const CreditHoursForCARSRuleParam& ruleParam);

	/**
	* 计算飞时相关的Credit
	* @param segment 航段
	* @param timeType 时间类型: "SCH" 或 "ACT"
	* @param ruleParam 规则参数
	* @return Credit值(分钟)
	*/
	int CalculateCreditByFltHours(const Segment* segment, const std::string& timeType, const CreditHoursForCARSRuleParam& ruleParam);

	/**
	* 按天计算Credit
	* @param rosters 航班任务列表
	* @param offsetTZMinutes 时区偏移(分钟)
	* @param crew 机组
	* @return map<本地时间天, tuple<当天credit时长合计(实际时间),当天credit时长合计(计划时间)>>
	*/
	map<time_t, std::tuple<double, double>> CalculateCreditDayByDutyPeriod(std::vector<const ROSTER*>& rosters, const int offsetTZMinutes, const std::shared_ptr<CREW>& crew);

	/**
	* 获取航班飞时(分钟)
	* @param segment 航段
	* @param timeType 时间类型: "SCH" 或 "ACT"
	* @return 飞时(分钟)
	*/
	int GetFlightHoursMinutes(const Segment* segment, const std::string& timeType);

	/**
	* 获取地面任务时长(分钟)
	* @param roster 地面任务
	* @param timeType 时间类型: "SCH" 或 "ACT"
	* @return 时长(分钟)
	*/
	int GetGroundDurationMinutes(const ROSTER* roster, const std::string& timeType);

	/**
	* 获取Credit活动列表
	* @param activities 活动列表
	* @param offsetTZMinutes 时区偏移(分钟)
	* @param ruleParam 规则参数
	* @return Credit活动列表
	*/
	vector<std::shared_ptr<MandayActivity>> GetCreditActivities(const vector<const Activity*>& activities, const int offsetTZMinutes, const CreditHoursForCARSRuleParam& ruleParam);

	vector<std::shared_ptr<MandayActivity>> GetCreditActivitiesForFixedCH(const vector<const Activity*>& activities, const int offsetTZMinutes, const CreditHoursForCARSRuleParam& ruleParam);
	vector<std::shared_ptr<MandayActivity>> GetCreditActivitiesForFT(const vector<const Activity*>& activities, const int offsetTZMinutes, const CreditHoursForCARSRuleParam& ruleParam);
	vector<std::shared_ptr<MandayActivity>> GetCreditActivitiesForDP(const vector<const Activity*>& activities, const int offsetTZMinutes, const CreditHoursForCARSRuleParam& ruleParam);

	/**
	* 计算按天切分的Credit
	* @param allSegmentMandayActivities 航段活动列表
	* @param allGroundRosterMandayActivities 地面任务活动列表
	* @param allAssignmentMapCrewMandayDay 按Assignment分组的Credit
	* @param activities 活动列表
	* @param offsetTZMinutes 时区偏移(分钟)
	* @param ruleParam 规则参数
	* @return 按天切分的Credit
	*/
	map<time_t, std::tuple<double, double>> CalculateCreditDay(vector<std::shared_ptr<MandayActivity>>& allSegmentMandayActivities, 
		vector<std::shared_ptr<MandayActivity>>& allGroundRosterMandayActivities, 
		map<string, map<time_t, std::tuple<double, double>>>& allAssignmentMapCrewMandayDay, 
		const vector<const Activity*>& activities, 
		const int offsetTZMinutes, 
		const CreditHoursForCARSRuleParam& ruleParam);

	/**
	* 获取Roster级别的Credit
	* @param rosters 任务列表
	* @param offsetTZMinutes 时区偏移(分钟)
	* @return Roster级别的Credit
	*/
	map<long long, CreditHour> GetRosterCredit(const vector<const ROSTER*>& rosters, const int offsetTZMinutes);

	/**
	* 获取Segment级别的Credit
	* @param rosters 任务列表
	* @param offsetTZMinutes 时区偏移(分钟)
	* @return Segment级别的Credit
	*/
	map<long long, map<long long, CreditHour>> GetSegmentCredit(const vector<const ROSTER*>& rosters, const int offsetTZMinutes);
};

#endif //_CALCULATECREDITHOURSFORCARSRULE_H_
