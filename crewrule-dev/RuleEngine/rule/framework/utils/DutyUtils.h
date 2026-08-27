#ifndef _DUTYUTILS_H_
#define _DUTYUTILS_H_

#include "CrewDB.h"
#include <utility>
#include <vector>
#include "Utility.h"

struct DutyExt {
	Duty* duty = nullptr;
	std::string pairingHomeBase;
};


class DutyUtils {

public:
	//获得Duty的分公司
	static std::string GetFiliale(const Duty& duty, const SharedPtr<CrewDataContext>& dbData);

	//获得Duty的UTC时区差(分钟数），通过Duty的开始机场和实际开始时间来计算
	static int GetTimeZoneOffset(const Duty& duty, const SharedPtr<CrewDataContext>& dbData);

	//获得Duty的UTC时区差(分钟数），通过Duty的开始机场和实际开始时间来计算
	static int GetTimeZoneOffsetByDep(const Duty& duty, const SharedPtr<CrewDataContext>& dbData);

	//获得Duty的UTC时区差(分钟数），通过Duty的到达机场和实际结束时间来计算
	static int GetTimeZoneOffsetByArr(const Duty& duty, const SharedPtr<CrewDataContext>& dbData);

	//获得Duty的起飞机场和落地机场时差(分钟数）
	static int GetTimeZoneDiff(const Duty& duty, const SharedPtr<CrewDataContext>& dbData);

	//获得prevDuty和duty的时差(分钟数），即：prevDuty的起飞机场 与 duty的起飞机场时差
	static int GetTimeZoneDiff(const Duty& prevDuty, const Duty& duty, const SharedPtr<CrewDataContext>& dbData);

	//获得prevDuty和duty的时差(分钟数），即：prevDuty的到达机场 与 duty的到达机场时差
	static int GetTimeZoneDiffByArr(const Duty& prevDuty, const Duty& duty, const SharedPtr<CrewDataContext>& dbData);

	/**
	* 获得位移(飞行)方向
	* @param duty 
	* @return E-先东飞行，W-先西飞行
	*/
	static std::string GetDisplacementDirection(const Duty& duty, const SharedPtr<CrewDataContext>& dbData);

	/**
	* 获得位移(飞行)方向
	* @param prevDuty 前一个Duty
	* @param currDuty 当前Duty
	* @return E-先东飞行，W-先西飞行
	*/
	static std::string GetDisplacementDirection(const Duty& prevDuty, const Duty& currDuty, const SharedPtr<CrewDataContext>& dbData);

	//获得2个Duty之间时长（秒）从开始时间到开始时间之间时长, currDuty.startTime - prevDuty.startTime
	static int GetIntervalFromSS(const Duty& prevDuty, const Duty& currDuty);

	// 获得duty的Composition，从rule2030拷贝，与业务逻辑有较深羁绊，后续需调整
	static string GetCompositionByDutyFor3(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, string division = "");

	static string GetCompositionByDutySegmentFor3(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, string division = "");

	//isOnlyCurrentPairing：仅检查当前Pairing
	static string GetCompositionByDutyFor3(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, const bool isOnlyCurrentPairing, string division = "");

	// 获得duty上的航段数
	static int getLangdingNums(const Duty* duty, CrewDataContext* dbData);

	//获得Roster列表中所有Duty列表
	static vector<Duty*> GetDuties(const std::vector<const ROSTER*>& rosters, const SharedPtr<CrewDataContext>& dbData);

	vector<std::shared_ptr<DutyExt>> GetDutyExtes(const std::vector<const ROSTER*>& rosters, const SharedPtr<CrewDataContext>& dbData);

	static bool IsWoclDuty(const time_t dutyStartUtc, const int offsetTZMinute);
	static bool IsWoclDuty(const Duty* duty, const SharedPtr<CrewDataContext>& dbData);
	static int GetWoclEnd();
	static bool IsEarlyStartDuty(const time_t dutyStartUtc, const int offsetTZMinute);
	static bool IsEarlyStartDuty(const Duty* duty);
	static int GetEarlyStartEnd();
	static bool IsEarlyStartTime(const time_t checkTimeUtc, const int offsetTZMinute);
	static bool IsLateFinishTime(const time_t checkTimeUtc, const int offsetTZMinute);

	static bool IsWoclTime(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute);

	static int GetWoclOverlapTime(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute);

	static int GetWoclNonOverlappingTime(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTzMinute);

	static bool IsNightDuty(const Duty* duty);

	static bool IsNightTime(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute);

	//获得开始时间和结束时间之间有几个连续本地夜晚数量	
	// DST! this version is used when the time zone offset may change during the period, such as when crossing DST boundary. It will calculate the local night number based on the local time converted from UTC time with the provided time zone offset at each time point.
	static int GetLocalNightNums(const time_t startTimeUtc, const time_t endTimeUtc, const int startOffsetTZMinute,
		const int endOffsetTZMinute, const std::string& zoneId);

	// Legaacy None DST versions
	static int GetLocalNightNums(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute);
	static int GetLocalNightNums(const time_t startTimeLoc, const time_t endTimeLoc);

	//获得开始时间和结束时间之间有几个连续本地夜晚数量
	//本地夜晚定义：(开始时间HH:mm localNightStartHHmm, 结束时间HH:mm localNightEndHHmm, 最小持续时长分钟数HH:mm localNightMinRestIntervalHHmm)
	static int GetLocalNightNums(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute, 
		const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm);
	static int GetLocalNightNums(const time_t startTimeLoc, const time_t endTimeLoc,
		const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm);
	static int GetLocalNightNums(const time_t startTimeLoc, const time_t endTimeLoc,
		const int localNightStartHHmm, const int localNightEndHHmm, const int localNightMinRestIntervalHHmm);

	//获得开始时间和结束时间之间有几个连续本地夜晚的日期
	// DST! this version is used when the time zone offset may change during the period, such as when crossing DST boundary. It will calculate the local night number based on the local time converted from UTC time with the provided time zone offset at each time point.
	static std::vector<time_t> GetLocalNightDates(const time_t startTimeUtc, const time_t endTimeUtc, const int startOffsetTZMinute,
		const int endOffsetTZMinute, const std::string& zoneId);
	
	// Legaacy None DST versions
	static std::vector<time_t> GetLocalNightDates(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute);
	static std::vector<time_t> GetLocalNightDates(const time_t startTimeLoc, const time_t endTimeLoc);
	//获得开始时间和结束时间之间有几个连续本地夜晚的日期
	//本地夜晚定义：(开始时间HH:mm localNightStartHHmm, 结束时间HH:mm localNightEndHHmm, 最小持续时长分钟数HH:mm localNightMinRestIntervalHHmm)
	static std::vector<time_t> GetLocalNightDates(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute,
		const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm);
	static std::vector<time_t> GetLocalNightDates(const time_t startTimeLoc, const time_t endTimeLoc,
		const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm);

	// Count local nights when the rest window is interrupted by excluded intervals (UTC).
	// A local night counts only if there exists a continuous free interval inside the local-night window
	// whose duration is >= localNight.MinRestInterval.
	static int GetLocalNightNumsExcludingIntervals(const time_t startTimeUtc,
		const time_t endTimeUtc,
		const int offsetTZMinute,
		const std::vector<std::pair<time_t, time_t>>& excludedIntervalsUtc);

	// DST! this version is used when the time zone offset may change during the period, such as when crossing DST boundary. It will calculate the local night number based on the local time converted from UTC time with the provided time zone offset at each time point.
	static int GetLocalNightNumsExcludingIntervals(const time_t startTimeUtc,
		const time_t endTimeUtc,
		const int startOffsetTZMinute,
		const int endOffsetTZMinute,
		const std::string& zoneId,
		const std::vector<std::pair<time_t, time_t>>& excludedIntervalsUtc);

	static int GetLocalNightEnd();

	/** dateKeyLoc 为 GetLocalNightDates 返回的本地日零点；local night 定义来自法规 2104。 */
	struct LocalNightUtcWindow {
		time_t startUtc = 0;
		time_t endUtc = 0;
		bool valid = false;
	};
	static LocalNightUtcWindow GetLocalNightWindowUtc(time_t dateKeyLoc,
	                                                    int offsetTZMinute,
	                                                    const std::string& zoneId = {});


	//获得满足指定本地夜晚数量的最早休息结束时间（返回UTC时间；若无法满足则返回-1）
	//startTimeUtc：休息开始时间（UTC）
	//offsetTZMinute：本地时区与UTC的偏差（分钟）
	//numLocalNights：需要满足的本地夜晚数量（>=1；<=0时直接返回startTimeUtc）
	static time_t GetRestEndTimeMeetingNumLocalNights(time_t startTimeUtc,
		int startOffsetTZMinute,
		const std::string& zoneId,
		int numLocalNights);

	//获得满足最小休息时间和本地夜晚数量的最早休息结束时间（返回UTC时间；若无法满足则返回-1）
	//startTimeUtc：休息开始时间（UTC）
	//offsetTZMinute：本地时区与UTC的偏差（分钟）
	//minRestMinutes：最小休息时间（分钟）
	//numLocalNights：需要满足的本地夜晚数量（>=1；<=0时无要求）
	static time_t GetRestEndTimeMeetingMinRestAndNumLocalNights(time_t startTimeUtc,
		int startOffsetTZMinute,
		const std::string& zoneId,
		int minRestMinutes,
		int numLocalNights);

	//获得满足本地夜晚时间的休息结束时间(最小休息结束时间点)
	//例如：本地夜晚 22:00-06:00，最小8小时
	static time_t GetRestEndTimeMeetingLocalNight(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute);
	static time_t GetRestEndTimeMeetingLocalNight(const time_t startTimeLoc, const time_t endTimeLoc);

	static time_t GetRestEndTimeMeetingLocalNight(const time_t startTimeLoc, const time_t endTimeLoc,
		const std::string& localNightStartHHmm, const std::string& localNightEndHHmm, const std::string& localNightMinRestIntervalHHmm);

	//获得开始时间和结束时间之间有几个连续WOCL数量
	static int GetConsecutiveWOCLNums(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinute);
	static int GetConsecutiveWOCLNums(const time_t startTimeLoc, const time_t endTimeLoc);

	//获得开始时间和结束时间之间有几个连续时间段[periodStartHHmm, periodEndHHmm]数量，periodStartHHmm和periodEndHHmm为HH:mm转换成分钟数
	// periodEndHHmm小于periodStartHHmm表示跨天
	//若时间周期为22:00-05:30, periodStartHHmm=22*60+ 0=1320, periodEndHHmm=5*60+30=330;
	static int GetConsecutiveTimePeriodNums(const time_t startTime, const time_t endTime, const int periodStartHHmm, const int periodEndHHmm, const int minIntervalHHmmInPeriod = -1);

	//获得Duty间休息时长，去除Pickup和Dropoff时长，单位：分钟
	static int GetActualRestMinutes(const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData);

	static int GetActualRestMinutes(time_t& actRestStartTimeUtc, const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData);

	static int GetActualRestMinutes(time_t& actRestStartTimeUtc, time_t& actRestEndTimeUtc, const Duty* currDuty, const Duty* nextDuty, const SharedPtr<CrewDataContext>& dbData);

	//获得Duty与地面任务（Roster）之间休息时长，去除Pickup和Dropoff时长，单位：分钟
	static int GetActualRestMinutes(const Duty* currDuty, const ROSTER* nextRoster, const SharedPtr<CrewDataContext>& dbData);

	static int GetActualRestMinutes(time_t& actRestStartTimeUtc, const Duty* currDuty, const ROSTER* nextRoster, const SharedPtr<CrewDataContext>& dbData);

	//获得在[lowerLimitTimeUtc,upperLimitTimeUtc]之间(与该时间段重叠的FDP时间段均计入新获取的Duty FDP时长)的Duty对应的FDP值(分钟数)。与CustomBiz.cpp中calculateDutyFdp()逻辑相同
	static long GetDutyFDPInMinsWithCover(Duty* duty, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData);

	//获得在[lowerLimitTimeUtc,upperLimitTimeUtc]之间(通过该时间段强制截断Duty FDP时间段，获得Duty FDP时长)的Duty对应的FDP值(分钟数)。与CustomBiz.cpp中calculateDutyFdp()逻辑相同
	static long GetDutyFDPInMinsWithTruncation(Duty* duty, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData);

	//获得在[lowerLimitTimeUtc,upperLimitTimeUtc]之间(通过该时间段强制截断Duty DP时间段，获得Duty DP时长)的Duty对应的DP值(分钟数)。与CustomBiz.cpp中calculatePairingDutyTimes()逻辑相同
	static long GetDutyDPInMinsWithTruncation(Duty* duty, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData);

	//Duty是否包含飞行
	static bool containFly(const Duty* duty);

	//Duty是否纯飞行（即Duty所有Segment Assignment都是FLY)
	static bool IsPureFly(const Duty* duty);

	//Duty是否纯DHD（即Duty所有Segment Assignment都是DHD)
	static bool IsPureDHD(const Duty* duty);

	//获取Duty Type
	static string getDutyType(const Duty* duty);

	//判断Duty是否属于Long per-diem(仅EVAFD PerDiem计算使用）
	static bool IsLongPerdiem(const Duty* duty, const SharedPtr<CrewDataContext>& dbData);

	//获得Duty的机型，取Duty最后一个飞行航段的机型
	static bool GetFleetAndSubFleet(string& fleet, string& subFleet, const Duty* duty);

	static time_t GetDutyStartTimeByRuleParamForHX(const Duty* duty, const ROSTER* preRoster = nullptr, const time_t calloutTime = 0);

	static time_t GetTimeByRuleParam(const Duty* duty, const ROSTER* preRoster, const time_t calloutTime, const string type, const std::shared_ptr<Standby_FDP_And_Rest_Definition> ruleParam);

	static long long GetPrecedingRestLength(const time_t startUtc, const time_t endUtc, const int offsetTzMinute);

public:

	/*
	* 在prevDuty和currDuty连续前提下，获得Current Duty新增的连续次数
	* 若prevDuty和currDuty连续，则返回1（表示1次连续)。若prevDuty = nullptr，currDuty != nullptr 也返回1次连续
	* * @return 返回-1表示不连续
	*/
	static int GetConsecutiveTimesWithCurrDuty(const Duty* prevDuty, const Duty* currDuty);

	/*
	* 在prevDuty和currDuty连续前提下，获得Current Duty新增的连续天数。
	* 若prevDuty和currDuty连续，则返回currDuty跨越天数(即Curr Roster的连续天数)
	* 注意：若prevDuty的最后一天和currDuty的第一个天在同一天，则返回：“currDuty跨越天数” - 1
	* @return 返回-1表示不连续
	*/
	static int GetConsecutiveDaysWithCurrDuty(const Duty* prevDuty, const Duty* currDuty);

	/*
	* 获得Duty的航班休息设施（通过航班休息设施计算获得）
	*/
	static int GetRestfacility(const Duty* duty, const SharedPtr<CrewDataContext>& dbData);

	/**
	* 获得Duty的实际FDP时长（分钟数），若存在合并FDP，则返回合并后FDP
	*/
	static int GetDutyActualFDP(const Duty* duty, const ROSTER* roster);

	/**
	* 获得Duty的实际DP时长（分钟数），若存在合并DP，则返回合并后DP
	*/
	static int GetDutyActualDP(const Duty* duty, const ROSTER* roster);

	/**
	* 获得Duty的实际BLH时长（分钟数），若存在合并BLH，则返回合并后BLH
	*/
	static int GetDutyActualBLH(const Duty* duty, const ROSTER* roster);
public:

	//判断Duty是否是适应状态(支持QQ和EASA)，true-适应状态,fase:非适应状态
	static bool IsAcclimation(const Duty* duty, const SharedPtr<CrewDataContext>& dbData);

	//判断Duty是否是未知状态(支持QQ和EASA)，true-未知状态,fase:非未知状态
	static bool IsUnknownAcclimation(const Duty* duty, const SharedPtr<CrewDataContext>& dbData);

private:
	/**
	* 获得位移(飞行)方向
	* @param depOffsetTZ 起飞地点时区差
	* @param arrOffsetTZ 到达地点时区差
	* @return E-先东飞行，W-先西飞行
	*/
	static std::string GetDisplacementDirection(int depOffsetTZ, int arrOffsetTZ);

	//Duty是否在欧洲或美洲航线进行Layover(仅EVAFD PerDiem计算使用）
	static bool IsLayoverInEUR(const Duty* duty, const SharedPtr<CrewDataContext>& dbData);

	//判断站点是否是计算Long Perdeim洲际航线的站点(仅EVAFD PerDiem计算使用）
	static bool IsStationOfLongPerdiemRoutes(const string& station, const SharedPtr<CrewDataContext>& dbData);

	static bool MatchStandbyRuleParam(const Duty* duty, const ROSTER* preRoster, const time_t calloutTime, const std::shared_ptr<Standby_FDP_And_Rest_Definition> ruleParam);
};

#endif //_DUTYUTILS_H_
