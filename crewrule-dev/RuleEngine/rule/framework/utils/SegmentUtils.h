#ifndef _NEWRULEENGINE_SEGMENTUTILS_H_
#define _NEWRULEENGINE_SEGMENTUTILS_H_

#include "CrewDB.h"
#include "RuleParams.h"

class SegmentUtils {

public:

	//获得过站（中转）时长，单位：秒
	static int GetTransitDurationInSecs(const Segment* currSegment, const Segment* nextSegment);

	//获得过站（中转）时长实际休息时间，去除二次签到时长（虚拟签到和签出），单位：分钟
    // longTransit can be nullptr, degenarate to TransitDutationInMinutes
	static int GetActualRestMinutes(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit);

	//判断二个Segment之间是否存在Segment层级的PairingDutyNode(即存在Segment级别的二次签到)
	static bool existNode(const Duty* duty, const Segment* currSegment, const Segment* nextSegment);

	//通过PairingDutyNode寻找手工二次签到后，二个Segment之间的休息时长
	static int GetActualRestMinutes(const Duty* duty, const Segment* currSegment, const Segment* nextSegment);

	//获得时间休息开始时间和结束时间（UTC时间）
	static void GetActualRestStartAndEndTimeUtc(time_t& restStartTimeUtc, time_t& restEndTimeUtc, const Segment* currSegment, const Segment* nextSegment);

	//获得时间休息开始时间和结束时间（UTC时间）
	static void GetActualRestStartAndEndTimeUtc(time_t& restStartTimeUtc, time_t& restEndTimeUtc, const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit);

	//获得下一个Segment的FDP开始时间（UTC时间），isIncludeLongTransitPickup 是否包括二次签到Pickup时间
	static time_t GetNextSegmentFDPStartTimeUtc(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const bool isIncludeLongTransitPickup);

	//获得Segment的UTC时区差(分钟数），通过Segment的开始机场和实际开始时间来计算
	static int GetTimeZoneOffset(const Segment& segment, const SharedPtr<CrewDataContext>& dbData);

	//获得Segment的UTC时区差(分钟数），通过Segment的开始机场和实际开始时间来计算
	static int GetTimeZoneOffsetByDep(const Segment& segment, const SharedPtr<CrewDataContext>& dbData);

	//获得Segment的UTC时区差(分钟数），通过Segment的到达机场和实际结束时间来计算
	static int GetTimeZoneOffsetByArr(const Segment& segment, const SharedPtr<CrewDataContext>& dbData);

	//快速获得Segment的UTC时区差(分钟数），通过Segment的开始机场和实际开始时间来计算
	static int GetFastTimeZoneOffsetByDep(const Segment& segment, const SharedPtr<CrewDataContext>& dbData);

	//获得Segment的实际飞时(单位：分钟)
	static int GetBlkMinutes(const Segment& segment);

	//获得Segment的计划飞时(单位：分钟)
	static int GetSchBlkMinutes(const Segment& segment);

	//获得在[lowerLimitTimeUtc,upperLimitTimeUtc]之间(通过该时间段强制截断Segment BLH时间段，获得Segment实际飞时时长)的Segment对应的BLH值(分钟数)。
	static int GetBlkMinutesWithTruncation(const Segment& segment, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData);

	//获得在[lowerLimitTimeUtc,upperLimitTimeUtc]之间(通过该时间段强制截断Segment BLH时间段，获得Segment计划飞时时长)的Segment对应的BLH值(分钟数)。
	static int GetSchBlkMinutesWithTruncation(const Segment& segment, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData);

	//通过Segment检查对应的航班是否实际起飞
	static bool IsActualTakeOff(const Segment* segment, const SharedPtr<CrewDataContext>& dbData);

	//是否夜航起飞
	static bool IsNightTaskOff(const Segment* segment, const SharedPtr<CrewDataContext>& dbData);

	//是否夜航降落
	static bool IsNightLanding(const Segment* segment, const SharedPtr<CrewDataContext>& dbData);

	//获得航班的休息设施，返回：true获取到航班休息设施，false：未获取到航班休息设施。restFacility: 返回航班的休息设施
	static bool GetRestFacility(int& restFacility, const Segment* segment, const SharedPtr<CrewDataContext>& dbData);

	//判断航段是否是DHD
	static bool IsDHD(const Segment* segment);

	//判断航段是否是SIM
	static bool IsSIM(const Segment* segment);

	//获得SIM Segment的Brief和Debrief
	static void GetBriefAndDebriefOfSIM(shared_ptr<PairingDutyNode>& simBrief, shared_ptr<PairingDutyNode>& simDebrief, const Duty* duty, const long long fltId);

	//获取时间范围内航班数量，checkType = S/E，开始时间或者结束时间判断，默认开始时间
	static int GetSegmentNumberInRangeByStartOrEnd(const vector<Segment*>& segments, const time_t checkStart, const time_t checkEnd, const string checkType = "E");

	static string GetCompositionBySegmentFor3(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, string division = "");

	/*
	* 获得Segment的配比(仅当前任务环)
	* @return 返回所有能匹配到的配比及Option，<配比ID，配比名称，配比Option> 列表
	*/
	static vector<std::tuple<long long, string, int>> GetCompositionOptions(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, const string division = "");

	//判断是否换飞机
	static bool IsAircraftChange(const Segment* currSegment, const Segment* nextSegment);

	//匹配Route
	static bool MatchRoute(const Segment* segment, const vector<string>& routeCodes, const SharedPtr<CrewDataContext>& dbData);

	/**
	 * 匹配多个Segment的BLH(segmentBlhsMinutes)是否在多个BLH Range(segmentBlhRangesMinutes)时间段内,segmentBlhRangesMinutes列表数量可以大于segmentBlhsMinutes列表数量
	 * 要求：每个Segment的BLH值只能被一个Range覆盖（不能重复），并且仅可能最多满足覆盖可能性。若都能覆盖则返回true，否则返回false
	 * 举例：
	 *    segmentBlhMinutes=[100, 200, 300]，segmentBlhRangeMinutes=[[100, 200], [200, 300], [300, 400]] 返回：true
	 *    segmentBlhMinutes=[100, 200, 300]，segmentBlhRangeMinutes=[[100, 200], [200, 300]] 返回：true
	 *    segmentBlhMinutes=[450, 200]，segmentBlhRangeMinutes=[[100, 400], [200, 500]] 返回：true
	 *    segmentBlhMinutes=[300, 480]，segmentBlhRangeMinutes=[[100, 400], [200, 500]] 返回：true
	 *    segmentBlhMinutes=[450, 480]，segmentBlhRangeMinutes=[[100, 400], [200, 500]] 返回：false
	 * @param segmentBlhsMinutes BLH列表
	 * @param segmentBlhRangesMinutes BLH Range列表
	 * @return 是否都能覆盖
	 */
	static bool MatchDistinctSegmentsForRanges(const std::vector<int>& segmentBlhsMinutes, const std::vector<std::pair<int, int>>& segmentBlhRangesMinutes);

public:	
    //通过Segment获取对应的Flight对象
	static inline std::shared_ptr<Segment> GetFlightBySegment(const Segment* segment, const SharedPtr<CrewDataContext>& dbData) {
		if (segment == nullptr || dbData == nullptr) {
			return nullptr;
		}
		auto iter = dbData->flightIdMap.find(segment->getDBId());
        if (iter != dbData->flightIdMap.end()) {
			return iter->second;
		}
		return nullptr;
	}
};

#endif //_NEWRULEENGINE_SEGMENTUTILS_H_
