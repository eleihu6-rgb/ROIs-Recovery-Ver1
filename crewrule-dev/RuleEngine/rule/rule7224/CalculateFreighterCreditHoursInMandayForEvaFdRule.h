#pragma once
#ifndef _CALCULATEFREIGHTERCREDITHOURSINMANDAYFOREVAFDRULE_H_
#define _CALCULATEFREIGHTERCREDITHOURSINMANDAYFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "FreighterCreditHoursDefinitionForEvaFdRuleParam.h"



class CalculateFreighterCreditHoursInMandayForEvaFdRule : public CalculateRule<std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>>> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7224;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateFreighterCreditHoursInMandayForEvaFdRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateFreighterCreditHoursInMandayForEvaFdRule::RuleFuncId, CalculateFreighterCreditHoursInMandayForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateFreighterCreditHoursInMandayForEvaFdRule() override = default;

	//返回值：计算manday的Credit Hour, std::tuple<map<localDay,MandayCredit(分钟数)>, map<rosterId,Pairing Credit(分钟数)>, map<rosterId, map<segmentId,Segment Credit(分钟数)>>>
	std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> Calculate(std::vector<const ROSTER*>& rosters) override;

private:

	std::vector<FreighterCreditHoursDefinitionForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	int CalculateCredit(const ROSTER* groundRoster, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam);

	int CalculateCredit(const Segment* segment, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam);

	//获得计算采用实际时间，还是计划时间。返回："SCH" - 计划时间，"ACT" - 实际时间
	string GetTimeType(const Activity* activity, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) const;

	/*
	* 通过飞时计算Credit，Credit以MandayActivity时间段形式存储 Credit = endTime - startTime
	* @param allSegmentMandayActivities 返回值，航段Segment有关的manday credit值
	* @param allAssignmentMapCrewMandayDay 返回值，通过Assignment分组后的按天切分的credit时长，map<assignment, map<本地时间天, tuple<当天credit时长合计(实际时间),当天credit时长合计(计划时间)>>>
	* @param activities Activity是 ROSTER或Segment对象
	* @param crew
	* @param ruleParam
	* @return map<本地时间天,tuple<当天credit时长合计(实际时间),当天credit时长合计(计划时间)>>
	*/
	map<time_t, std::tuple<double, double>> CalculateCreditDay(vector<std::shared_ptr<MandayActivity>>& allSegmentMandayActivities, map<string, map<time_t, std::tuple<double, double>>>& allAssignmentMapCrewMandayDay,
		const vector<const Activity*>& activities, const int offsetTZMinutes, const std::shared_ptr<CREW>& crew, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam);

	/*
	* 通过飞时计算Credit，Credit以MandayActivity时间段形式存储 Credit = endTime - startTime
	* @param activities Activity是 ROSTER或Segment对象
	* @param crew
	* @param ruleParam
	* @return 
	*/
	vector<std::shared_ptr<MandayActivity>> GetCreditActivityByBLH(const vector<const Activity*>& activities, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam);

	vector<std::shared_ptr<MandayActivity>> GetCreditActivityByAvgGuaranteeHour(const vector<const Activity*>& activities, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam);

	/*
	* 通过飞时计算Credit，Credit以MandayActivity时间段形式存储 Credit = endTime - startTime
	* @param activities Activity是 ROSTER或Segment对象（一般是Ground Roster）
	* @param crew
	* @param ruleParam
	* @return
	*/
	vector<std::shared_ptr<MandayActivity>> GetCreditActivityByGround(const vector<const Activity*>& activities, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam);

	/*
	* 计算Credit时，采用固定时长，格式：HH:MM
	* @param activities Activity是 ROSTER或Segment对象
	* @param crew
	* @param ruleParam
	* @return
	*/
	vector<std::shared_ptr<MandayActivity>> GetCreditActivityByFixedDuration(const vector<const Activity*>& activities, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam);

	/*
	* 通过飞时计算Credit
	* @param activity ROSTER或Segment对象
	* @param crew
	* @param btGapMinutes 飞时偏差值(分钟数)
	* @param isStartTime 基准时间是以开始时间还是结束时间，true - 开始时间，false - 结束时间
	* @return
	*/
	std::shared_ptr<MandayActivity> GetCreditActivityForCreditBtGap(const Activity* activity, const int offsetTZMinutes, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam, const bool isStartTime);

	map<string, vector<std::shared_ptr<MandayActivity>>> GetMandayActivitiesByAssignment(const vector<std::shared_ptr<MandayActivity>>& mandayActivities) const;

	void Merge(map<string, map<time_t, std::tuple<double, double>>>& allAssignmentMapCrewMandayDay, const string& assignment, const map<time_t, std::tuple<double, double>>& mapAssignmentMandayDay) const;

	void CalculateCreditDayByExpression(map<time_t, double>& mapCrewMandayDay, const std::shared_ptr<CREW>& crew, const FreighterCreditHoursDefinitionForEvaFdRuleParam& ruleParam) const;
};

#endif //_CALCULATEFREIGHTERCREDITHOURSINMANDAYFOREVAFDRULE_H_