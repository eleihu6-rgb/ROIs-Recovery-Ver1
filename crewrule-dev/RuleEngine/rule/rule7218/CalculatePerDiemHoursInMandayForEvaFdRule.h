#pragma once
#ifndef _CALCULATEPERDIEMHOURSINMANDAYFOREVAFDRULE_H_
#define _CALCULATEPERDIEMHOURSINMANDAYFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "PerDiemHoursForEvaFdRuleParam.h"



class CalculatePerDiemHoursInMandayForEvaFdRule : public CalculateRule<std::tuple<map<time_t, MandayPerDiem>, map<long long, PerDiem>>> {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7218;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CalculatePerDiemHoursInMandayForEvaFdRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculatePerDiemHoursInMandayForEvaFdRule::RuleFuncId, CalculatePerDiemHoursInMandayForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~CalculatePerDiemHoursInMandayForEvaFdRule() override = default;

	//计算manday的PerDiem, map<localDay,MandayPerDiem(当天的PerDiem(分钟数)和Long PerDiem(分钟数)>, map<rosterId, PerDiem>)
	std::tuple<map<time_t, MandayPerDiem>, map<long long, PerDiem>> Calculate(std::vector<const ROSTER*>& rosters) override;

private:

	enum class HalfPairingFlag {
		HEAD = 1, //半环前段
		TAIL = 2,  //半环后段
		FULL = 3, //完整环
	};

	//特定Pairing结构
	enum class SpecialPairingFlag {
		NOT_SPECAIL = 0,
		OUTER_BASE = 1, //是否外Base的Pairing
	};

	struct HalfPairing {
		Pairing* headPairing = nullptr; //半环前段（仅商务机）
		Pairing* tailPairing = nullptr; //半环后段（仅商务机）
		bool isLongPerDiemDutyForHeadPairing = false; //半环前段（仅商务机）是否是Long Perdiem Duty
		bool isLongPerDiemDutyForTailPairing = false; //半环后端（仅商务机）是否是Long Perdiem Duty
		vector<SharedPtr<MandayActivity>> halfPairingMandayActivities; //半环中的Perdeim。商务机半环内部的Pairing的PerDiem（仅用于Crew计算Pairing的PerDeim，不需要按天计算，否则会出现重复计算)
	};

	std::vector<PerDiemHoursForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	/*
	* 获得Per Diem时间段。
	* 假设：半环不存在嵌套，即 <半环1前段(A-B), 半环2前段(C-D), 半环2前段(C-D), 半环1后段(B-A)> 不允许。
	* @param currRoster 当前Roster
	* @param crewBase 人员所在基地
	* @param offsetTZMinutes 时区
	* @param halfPairing 输出半环信息
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	vector<SharedPtr<MandayActivity>> CalculatePerDiem(const ROSTER* currRoster, const string& crewBase, const int offsetTZMinutes, HalfPairing& halfPairing, map<long long, string>& dutyTimeTypeMap);

	vector<SharedPtr<MandayActivity>> GetPerDiemActivityForPairing(bool& matched, vector<SharedPtr<MandayActivity>>& halfPairingMandayActivities, map<long long, string>& dutyTimeTypeMap, const Pairing* pairing, const ROSTER* roster, const Pairing* headPairing, const int offsetTZMinutes);

	/*
	* 当前Duty时间段计入Per Diem
	* @param mapPerDiemGap
	* @param duty
	* @param ruleParam
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetPerDiemActivityForDuty(std::map<long long, int>& mapPerDiemGap, const Duty* duty, const Pairing* pairing, const SpecialPairingFlag specialPairingFlag, const int offsetTZMinutes, const string& timeType, const PerDiemHoursForEvaFdRuleParam& ruleParam) const;

	/*
	* 二个Duty之间时间段计入Per Diem
	* @param prevDuty
	* @param currDuty
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetPerDiemActivityBetweenDuties(const Duty* prevDuty, const Duty* currDuty, const int offsetTZMinutes, const string& timeType, const string& prevDutyTimeType) const;

	/*
	* Duty的Pickup时间段计入Per Diem
	* @param duty
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetPerDiemActivityForPickupInDuty(const Duty* duty, const int offsetTZMinutes, const string& timeType) const;

	/*
	* Duty的Brief时间段计入Per Diem
	* @param duty
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetPerDiemActivityForBriefInDuty(const Duty* duty, const int offsetTZMinutes, const string& timeType) const;

	/*
	* Duty的Debrief时间段计入Per Diem
	* @param duty
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetPerDiemActivityForDebriefInDuty(const Duty* duty, const int offsetTZMinutes, const string& timeType) const;

	/*
	* Duty的DropOff时间段计入Per Diem
	* @param duty
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetPerDiemActivityForDropOffInDuty(const Duty* duty, const int offsetTZMinutes, const string& timeType) const;

	/*
	* 二个Duty之间Layover时间段计入Per Diem（注意不包括 prevDuty.DropOff, currDuty.Pickup)
	* @param prevDuty
	* @param currDuty
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetPerDiemActivityForLayoverBetweenDuties(const Duty* prevDuty, const Duty* currDuty, const int offsetTZMinutes, const string& timeType, const string& prevDutyTimeType) const;

	/*
	* Duty内部二个Segment之间的中转时间计入Per Diem
	* @param prevSegment
	* @param currSegment
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetPerDiemActivityForLayoverBetweenSegments(const Segment* prevSegment, const Segment* currSegment, const int offsetTZMinutes, const string& timeType) const;

	/*
	* 法规参数中Pairing的Gap，计入Per Diem
	* @param pairing
	* @param perDiemGapMinutes
	* @result 计入Per-Diem时间段MandayActivity对象
	*/
	SharedPtr<MandayActivity> GetPerDiemActivityForPairingGap(const Pairing* pairing, const int perDiemGapMinutes, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap);

	//二个Roster之间“空白天/休息/Layover等（无任务）”计入Per-Diem时间段
	SharedPtr<MandayActivity> GetPerDiemActivityBetweenRoster(const ROSTER* currRoster, const ROSTER* prevRoster, const Pairing* headPairing, const Pairing* tailPairing, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap);

	//二个Pairing之间“空白天/休息/Layover等（无任务）”计入Per-Diem时间段(用于商务机半环)
	SharedPtr<MandayActivity> GetPerDiemActivityBetweenPairing(const Pairing* headPairing, const Pairing* tailPairing, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap);

	//针对场景仅有商务机后半环，场景开始时间到场景第一个Roster之间，计入Per-Diem时间段
	SharedPtr<MandayActivity> GetPerDiemActivityBetweenScenarioStartAndFirstRoster(const Pairing* tailPairing, const ROSTER* firstRoster, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap);
	//针对场景仅有商务机后半环，从商务机的后半环所在月首日到后半环之间，计入Per-Diem时间段
	SharedPtr<MandayActivity> GetPerDiemActivityBetweenMonthFirstDayAndTailPairing(const Pairing* tailPairing, const bool isLongPerDiemDutyForTailPairing, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap) const;

	//针对场景仅有商务机前半环，场景"最后Roster结束时间" 到 "前半环结束时间月末"之间(注意：)，计入Per-Diem时间段
	SharedPtr<MandayActivity> GetPerDiemActivityBetweenLastRosterAndScenarioEnd(const Pairing* headPairing, const ROSTER* lastRoster, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap);
	//针对场景仅有商务机前半环，场景"headPairing结束时间" 到 "前半环结束时间月末"之间，计入Per-Diem时间段
	SharedPtr<MandayActivity> GetPerDiemActivityBetweenHeadPairingAndMonthEndDay(const Pairing* headPairing, const bool isLongPerDiemDutyForHeadPairing, const int offsetTZMinutes, const map<long long, string>& dutyTimeTypeMap) const;

	//获得商务机的半环标志，若不是商务机则认为是完整环(HalfPairingFlag.FULL)
	HalfPairingFlag GetHalfPairingFlagOfBusinessAviation(const Pairing* pairing, const string& crewBase);
	HalfPairingFlag GetHalfPairingFlag(const Pairing* pairing, const string& crewBase);
	
	//Pairing是否存在Long Perdiem的Duty。若是地面任务，在半环内并且前面有Long Perdiem Duty，则也返回true
	bool ExistLongPerdiemDuty(const Pairing* pairing, const bool isLongPerDiemDutyForHeadPairing, const SharedPtr<CrewDataContext>& dbData);

	//是否商务机
	bool IsBusinessAviation(const Pairing* pairing) const;

private:
	SpecialPairingFlag GetSpecialPairingFlag(const ROSTER* roster, const Pairing* pairing) const;

	//针对特殊场景：Pairing为外站Base
	vector<SharedPtr<MandayActivity>> GetPerDiemActivityForOuterBase(const SharedPtr<MandayActivity>& firstDutyPerDiemActivity, const SharedPtr<MandayActivity>& lastDutyPerDiemActivity, const set<int>& dutySeqsPerDiem, const Pairing* pairing, const int offsetTZMinutes, const string& timeType) const;

	//针对特殊场景：Duty不计算PH，但其中某些特定Segment需要计算PH
	vector<SharedPtr<MandayActivity>> GetPerDiemActivityForSpecilSegments(const Duty* duty, const int offsetTZMinutes, const string& timeType) const;

	//针对特殊Pairing是否计算Perdiem。true：计算，false：不计算
	//bool IsCountedPerDeimForSpecialPairing(const ROSTER* roster, const Pairing* pairing, const Duty* currDuty, const SpecialPairingFlag specialPairingFlag) const;

	//获得特殊Pairing的Duty的PH时长MandayActivity
	//vector<SharedPtr<MandayActivity>> GetPerDiemActivityForSpecialPairingDuty(std::map<long long, int>& mapPerDiemGap, SharedPtr<MandayActivity>& dutyPerDiemActivity, const Pairing* pairing, const Duty* currDuty, const int offsetTZMinutes, const SpecialPairingFlag specialPairingFlag, const string& timeType) const;

	//获得特殊Pairing的Duty Segment的PH时长MandayActivity
	//vector<SharedPtr<MandayActivity>> GetPerDiemActivityForSpecialPairingDutySegment(const Pairing* pairing, const Segment* segment, const int offsetTZMinutes, const SpecialPairingFlag specialPairingFlag, const string& timeType) const;
	
	//获得计算实际PerDiem，使用实际时间，还是计划时间。返回："SCH" - 计划时间，"ACT" - 实际时间
	string GetTimeType(const Duty* duty, const int offsetTZMinutes, const PerDiemHoursForEvaFdRuleParam& ruleParam) const;
	string GetTimeType(const Duty* duty, const map<long long, string>& dutyTimeTypeMap) const;

	//判断当前Duty是否包含Line TE(特殊处理场景使用)
	bool IsCourseLineTrainee(const ROSTER* roster, const Duty* duty);

};

#endif //_CALCULATEPERDIEMHOURSINMANDAYFOREVAFDRULE_H_