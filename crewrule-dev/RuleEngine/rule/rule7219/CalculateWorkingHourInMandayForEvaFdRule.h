#pragma once
#ifndef _CALCULATEWORKINGHOURINMANDAYFOREVAFDRULE_H_
#define _CALCULATEWORKINGHOURINMANDAYFOREVAFDRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "WorkingHourForEvaFdRuleParam.h"


/*
* Working Hour仅通过计划时间进行计算
*/
class CalculateWorkingHourInMandayForEvaFdRule : public CalculateRule<std::tuple<map<time_t, double>, map<long long, double>>> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7219;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculateWorkingHourInMandayForEvaFdRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateWorkingHourInMandayForEvaFdRule::RuleFuncId, CalculateWorkingHourInMandayForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculateWorkingHourInMandayForEvaFdRule() override = default;

	//计算manday的WorkingHour, map<localDay,WorkingHour(分钟数)(计划时间)>, map<rosterId, WorkingHour(分钟数)(计划时间)>)
	std::tuple<map<time_t, double>, map<long long, double>> Calculate(std::vector<const ROSTER*>& rosters) override;

private:

	std::unique_ptr<WorkingHourForEvaFdRuleParam> _ruleParam{ nullptr };

	void ParseParam(const InputType& input);

	/*
	* 获得Working Hour时间段。
	* @param currRoster 当前Roster
	* @param prevRoster 前一个Roster
	* @param crewBase 人员所在基地
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	vector<SharedPtr<MandayActivity>> CalculateWorkingHour(const ROSTER* currRoster, const ROSTER* nextRoster, const string& crewBase, const int offsetTZMinutes);

	vector<SharedPtr<MandayActivity>> GetWorkingHourActivityForPairing(const Pairing* currPairing, const ROSTER* currRoster, const ROSTER* nextRoster, const int offsetTZMinutes);

	vector<SharedPtr<MandayActivity>> GetWorkingHourActivityForGroundRoster(const ROSTER* currRoster, const ROSTER* nextRoster, const int offsetTZMinutes);

	SharedPtr<MandayActivity> GetWorkingHourActivityForGroundRoster(const ROSTER* roster, const int offsetTZMinutes, const GroundRosterWorkingHourForEvaFdRuleParam& ruleParam);

	/*
	* 获得包含飞行的Duty（纯飞行或FLY+DHD) 并且 Duty Flight Hour小于4:00（Duty Working Hour小于4:00）的MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetWorkingHourActivityForFlyDuty(const Duty* duty) const;

	/*
	* 获得纯DHD的Duty 并且 Duty Flight Hour大于8:00（Duty Working Hour大于4:00）的MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetWorkingHourActivityForPureDHDDuty(const Duty* duty) const;

	/*
	* 计算Segment的Working Hour
	* @param duty
	* @param segment
	* @param offsetTZMinutes
	* @param ruleParam
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetWorkingHourActivityForSegment(const Duty* duty, const Segment* segment, const ROSTER* roster, const int offsetTZMinutes, const bool prevSegmentSIM, const bool currSegmentSIM, const PairingWorkingHourForEvaFdRuleParam& ruleParam) const;

	//特殊场景1：Duty中PNC/DHD航段的特殊处理，PNC(DHD)航段与其他类型航段组合，若其他类型航段WH=0,则PNC(DHD)航段=0
	void GetWorkingHourActivityForSpecialDHD(vector<SharedPtr<MandayActivity>>& segMandayActivitiesInDuty, const string timeType="SCH");

	vector<SharedPtr<MandayActivity>> GetWorkingHourActivityForDuty(const Duty* duty, const ROSTER* roster, const int offsetTZMinutes, const vector<SharedPtr<MandayActivity>>& segMandayActivitiesInDuty, const string timeType="SCH") const;
	
	/*
	* 计算每月第一个DO的Working Hour
	* @param roster
	* @param offsetTZMinutes
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetWorkingHourActivityForFirstDO(const ROSTER* roster, const int offsetTZMinutes) const;

	/**
	* 获得Duty的针对特定Segment的累计Working Hour
	*/
	double GetAccumulatedWorkingHourForDuty(const Duty* duty, const ROSTER* roster, const PairingWorkingHourForEvaFdRuleParam& ruleParam) const;

	/**
	* 获得Duty的针对特定Segment的平均Working Hour
	*/
	double GetAveragedWorkingHourForDuty(const Duty* duty, const ROSTER* roster, const PairingWorkingHourForEvaFdRuleParam& ruleParam) const;


	/**
	* 通过法规参数计算最终working hour值
	*/
	double CalcuateWorkingHour(const double duration, const PairingWorkingHourForEvaFdRuleParam& ruleParam) const;

	/*
	* 获得纯飞行的Duty最小Working Hour值(分钟数)
	*/
	int GetMinWorkingHourForPureFlyDuty() const;

	/*
	* 获得纯DHD的Duty最大Working Hour值(分钟数)
	*/
	int GetMaxWorkingHourForPureDhdDuty() const;

	/*
	* 获得Duty的所有航班时长合计(秒数)
	*/
	int GetFlightHourForDuty(const Duty* duty) const;

	/*
	* 获得每月第一个DO任务
	* @param firstDoRoster 返回每月第一个DO任务
	* @param 当前Roster
	* @return true：表示获取到每月第一个DO任务，false：未获取每月第一个DO任务
	*/
	bool GetFirstDoOfMonth(ROSTER*& firstDoRoster, const ROSTER* currRoster, const int offsetTZMinutes);
	

	///*
	//* 二个Duty之间时间段计入Per Diem
	//* @param prevDuty
	//* @param currDuty
	//* @result 计入Per-Diem时间段MandayActivity对象
	//*/
	//SharedPtr<MandayActivity> GetPerDiemActivityBetweenDuties(const Duty* prevDuty, const Duty* currDuty, const int offsetTZMinutes) const;

	///*
	//* Duty的DropOff时间段计入Per Diem
	//* @param duty
	//* @result 计入Per-Diem时间段MandayActivity对象
	//*/
	//SharedPtr<MandayActivity> GetPerDiemActivityForDropOffInDuty(const Duty* duty, const int offsetTZMinutes) const;

	///*
	//* 二个Duty之间Layover时间段计入Per Diem（注意不包括 prevDuty.DropOff, currDuty.Pickup)
	//* @param prevDuty
	//* @param currDuty
	//* @result 计入Per-Diem时间段MandayActivity对象
	//*/
	//SharedPtr<MandayActivity> GetPerDiemActivityForLayoverBetweenDuties(const Duty* prevDuty, const Duty* currDuty, const int offsetTZMinutes) const;

	///*
	//* 法规参数中Pairing的Gap，计入Per Diem
	//* @param pairing
	//* @param perDiemGapMinutes
	//* @result 计入Per-Diem时间段MandayActivity对象
	//*/
	//SharedPtr<MandayActivity> GetPerDiemActivityForPairingGap(const Pairing* pairing, const int perDiemGapMinutes, const int offsetTZMinutes);

	////二个Roster之间“空白天/休息/Layover等（无任务）”计入Per-Diem时间段
	//SharedPtr<MandayActivity> GetPerDiemActivityBetweenRoster(const ROSTER* currRoster, const ROSTER* prevRoster, const int offsetTZMinutes);

	////场景开始时间到场景第一个Roster之间，计入Per-Diem时间段
	//SharedPtr<MandayActivity> GetPerDiemActivityBetweenScenarioStartAndFirstRoster(const ROSTER* firstRoster, const int offsetTZMinutes);

	////场景最后Roster到场景结束时间之间，计入Per-Diem时间段
	//SharedPtr<MandayActivity> GetPerDiemActivityBetweenLastRosterAndScenarioEnd(const ROSTER* lastRoster, const int offsetTZMinutes);

	//HalfPairingFlag GetHalfPairingFlag(const Pairing* pairing, const string& crewBase);


};

#endif //_CALCULATEWORKINGHOURINMANDAYFOREVAFDRULE_H_