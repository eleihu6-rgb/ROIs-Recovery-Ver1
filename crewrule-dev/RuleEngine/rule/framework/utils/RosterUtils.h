#ifndef _ROSTERUTILS_H_
#define _ROSTERUTILS_H_

#include "CrewDB.h"

class RosterUtils {

public:
	//判断二个Roster的所在的本地时间的日历天是否连续
	static bool IsConsecutiveLocalDay(const ROSTER* prevRoster, const ROSTER* currRoster);

	//判断二个Roster的所在的本地时间的日历天是否连续（根据roster的restStart判断）
	static bool IsConsecutiveLocalDayByRestStart(const ROSTER* prevRoster, const ROSTER* currRoster);

	//获取一段时间内，特定的任务类型的天数
	static int GetRosterDaysByAssignmentInRange(const std::vector<const ROSTER*>& rosters, vector<string> dutyAssignments, time_t start, time_t end, int CrewBaseOffsetMinutes);

	/**
	* 获得备班召回的排班映射Map<备班排班，备班随后被召回飞行任务排班>
	* @param rosters 排班列表,并且按照actStrUtc进行排序
	* @param standbyAssignments 备班任务类型列表
	* @return 返回排班映射Map<备班排班，备班随后被召回飞行任务排班>
	**/
	static std::map<const ROSTER*, const ROSTER*> GetRosterMapForCalloutStandby(const std::vector<const ROSTER*>& rosters, const vector<string>& standbyAssignments, const int delta = 0);

	/**
	* 获得备班召回的排班映射Map<备班排班，备班随后被召回飞行任务排班>
	* @param rosters 排班列表,并且按照actStrUtc进行排序
	* @param standbyAssignments 备班任务类型列表
	**/
	static std::vector<Pairing*> GetPairingForCalloutStandby(const std::vector<const ROSTER*>& rosters, const vector<string>& standbyAssignments);


	/*
	* 通过PairingId获得对应的Roster
	*/
	static const SharedPtr<ROSTER> GetRosterByPairingId(const vector<SharedPtr<ROSTER>>& rosters, const long long pairingId);

	//计算地面任务的DP(Duty Period)时长，单位：秒
	static int GetDutyPeriodInSecsForGround(const ROSTER* roster, const SharedPtr<CrewDataContext>& dbData);

	//计算地面任务的DP(Duty Period)时长，单位：秒
	static int GetDutyPeriodInSecsForGround(const ROSTER* roster, const double dp_pct);

	//获得基于crew所在基地的时区
	static int GetTimeZoneOffset(const time_t baseUtcTime, const std::shared_ptr<CREW>& crew, const SharedPtr<CrewDataContext>& dbData);
	static int GetTimeZoneOffset(const time_t baseUtcTime, const std::string base, const SharedPtr<CrewDataContext>& dbData);


	//获得训练有关Roster
	//static std::vector<const ROSTER*> GetTrainingRosters(const std::vector<const ROSTER*>& rosters, const SharedPtr<CrewDataContext>& dbData);

	//通过Roster获得训练课程(地面任务)
	static std::shared_ptr<TmCourse> GetTrainingCourseByRoster(const ROSTER& roster, const SharedPtr<CrewDataContext>& dbData);
	static std::shared_ptr<TmCourse> GetTrainingCourseByMandayActivity(const MandayActivity& mandayActivity, const SharedPtr<CrewDataContext>& dbData);
	//通过Roster获得训练课程(飞行任务)	
	static std::shared_ptr<TmCourse> GetTrainingCourseByRoster(const ROSTER& roster, const long long flightId, const SharedPtr<CrewDataContext>& dbData);
	static std::shared_ptr<TmCourse> GetTrainingCourseByMandayActivity(const MandayActivity& mandayActivity, const long long flightId, const SharedPtr<CrewDataContext>& dbData);

	static string GetTrainingCourseCodeByRoster(const ROSTER& roster, const long long flightId, const SharedPtr<CrewDataContext>& dbData);
	static string GetTrainingCourseCodeByMandayActivity(const MandayActivity& mandayActivity, const long long flightId, const SharedPtr<CrewDataContext>& dbData);
	//通过Roster获得训练角色
	static std::vector<std::string> GetTrainingRoleByRoster(const ROSTER& roster, const vector<long long>& flightIds, const SharedPtr<CrewDataContext>& dbData);
	static std::vector<std::string> GetTrainingRoleByMandayActivity(const MandayActivity& mandayActivity, const vector<long long>& flightIds, const SharedPtr<CrewDataContext>& dbData);

	//返回：tuple<Assignment,Role>的列表
	static std::vector<std::tuple<std::string,std::string>> GetTrainingAssignmentRoleByRoster(const ROSTER& roster, const vector<long long>& flightIds, const SharedPtr<CrewDataContext>& dbData);
	//
	/*
	* 获得资质有效期扩展时间
	* @param activity：安排的任务Segment或Roster对象
	* @param crewQual: 人员资质 
	* @param qualExtensionConfigsForQualMap: multimap<Qual,<Activity(扩展资质的任务), QualExtensionConfig>>
	* @return 重新后的资质生效日期和过期日期
	*/
	static std::tuple<time_t,time_t> GetQualExtension(const std::shared_ptr<CREW_QUALIFICATION>& crewQual, const multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigsForQualMap);

	static multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> GetQualExtensionConfigs(const ROSTER* roster, const map<string, multimap<string, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigMap);

	//返回值：对应Assignment的multimap<qual,<Activity(扩展资质的任务),QualExtensionConfig>>
	static multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> GetQualExtensionConfigs(const std::string& rosterAssignment, const Activity* activity, const map<string, multimap<string, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigMap);

	//返回值：对应Assignment的multimap<qual,,<Activity(扩展资质的任务),QualExtensionConfig>>
	//static multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> GetQualExtensionConfigs(const SharedPtr<CREW>& crew, const Activity* activity, const map<string, multimap<string, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigMap);

	//返回值：对应Assignment的multimap<qual,,<Activity(扩展资质的任务),QualExtensionConfig>>
	static multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> GetQualExtensionConfigs(const SharedPtr<CREW>& crew, const map<string, multimap<string, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigMap);

	/*
	* 获得结束时间的Gap差值，单位秒。备注：获得结束时间的本地时间通过 UTC + offsetTZMinutes。
	* 业务场景：地面任务一般情况下，任务时间段如下[2025/1/1 20:00,2025/1/1  23:59]，实际用户想表达是[2025/1/1 20:00:00, 2025/1/2 00:00:00) 到1/1结束，但不到1/2。因此需要新增1分钟
	* @param activity：Segment或Roster对象
	* @param timeType: SCH 计划时间， ACT 实际时间
	* @return
	*/
	static int GetEndTimeGapInSec(const Activity* activity, const int offsetTZMinutes, const string timeType);

	/*
	* 获得结束时间的Gap差值，单位秒。备注：直接采用本地时间计算
	* 业务场景：地面任务一般情况下，任务时间段如下[2025/1/1 20:00,2025/1/1  23:59]，实际用户想表达是[2025/1/1 20:00:00, 2025/1/2 00:00:00) 到1/1结束，但不到1/2。因此需要新增1分钟
	* @param activity：Segment或Roster对象
	* @param timeType: SCH 计划时间， ACT 实际时间
	* @return
	*/
	static int GetEndTimeGapInSec(const Activity* activity, const string timeType);

	//获得crew的有效资质列表
	static vector<string> GetValidQualificationOfCrew(const ROSTER* roster, const std::shared_ptr<CREW>& crew);
	static vector<string> GetValidQualificationOfCrew(const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew);

	//判断crew在安排roster是否有合法资质quals。defaultValid：若crew没有纸质默认是否合法性
	static bool IsValidCrewQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& quals, const bool defaultValid = false);
	//判断crew的segment是否有合法资质quals
	static bool IsValidCrewQualification(const Segment* segment, const std::shared_ptr<CREW>& crew, const vector<string>& quals, const bool defaultValid = false);

	//获得与[startTimeUtc,endTimeUtc]时间段存在交集的rosters列表
	static vector<const ROSTER*> FilterRoster(const vector<const ROSTER*>& rosters, const time_t startTimeUtc, const time_t endTimeUtc);

	//获得场景开始时间（本地时区）
	static time_t GetScenarioStartLoc(const std::shared_ptr<CREW> crew, const SharedPtr<CrewDataContext>& dbData);

	//获得场景开始时间（本地时区）
	static time_t GetScenarioStartLoc(const SharedPtr<CrewDataContext>& dbData);

	//获得场景结束时间（本地时区）
	static time_t GetScenarioEndLoc(const std::shared_ptr<CREW> crew, const SharedPtr<CrewDataContext>& dbData);

	//获得场景结束时间（本地时区）
	static time_t GetScenarioEndLoc(const SharedPtr<CrewDataContext>& dbData);

	//获得Duty和Duty、Duty和地面任务（Roster）之间休息时长，，单位：分钟
	static int GetActualRestMinutes(time_t& actRestStartTimeUtc, time_t& actRestEndTimeUtc, const Activity* currActivity, const Activity* nextActivity, const SharedPtr<CrewDataContext>& dbData);

	//获得在[lowerLimitTimeUtc,upperLimitTimeUtc]之间(通过该时间段强制截断Ground Roster DP时间段，获得Ground Roster DP时长)的Ground Roster对应的DP值(分钟数)。
	static long GetDPInMinsWithTruncation(const ROSTER* groundRoster, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData);
public:

	/*
	* 在prevRoster和currRoster连续前提下，获得Current Roster新增的连续次数
	* 若prevRoster和currRoster连续，则返回1（表示1次连续)。若prevRoster = nullptr，currRoster != nullptr 也返回1次连续
	* * @return 返回-1表示不连续
	*/
	static int GetConsecutiveTimesWithCurrRoster(const ROSTER* prevRoster, const ROSTER* currRoster);

	/*
	* 在prevActivity和currActivity连续前提下，获得Current Activity(Roster/Duty)新增的连续次数。
	* prevActivity结束时间和currActivity开始时间在同一天或紧邻一天，则认为连续
	* 若prevActivity和currActivity连续，则返回1（表示1次连续)。若prevActivity = nullptr，currActivity != nullptr 也返回1次连续
	* * @return 返回-1表示不连续
	*/
	static int GetConsecutiveTimesWithCurrActivity(const Activity* prevActivity, const Activity* currActivity, const int offsetTZMinutes);

	/*
	* 在prevRoster和currRoster连续前提下，获得Current Roster新增的连续天数。
	* 若prevRoster和currRoster连续，则返回currRoster跨越天数(即Curr Roster的连续天数)
	* 注意：若prevRoster的最后一天和currRoster的第一个天在同一天，则返回：“currRoster跨越天数” - 1
	* @return 返回-1表示不连续
	*/
	static int GetConsecutiveDaysWithCurrRoster(const ROSTER* prevRoster, const ROSTER* currRoster);

	/*
	* 基于roster开始时间获得连续天数
	* 若prevRoster和currRoster开始日期连续（紧邻，例如：2026/1/1和2026/1/2，2026/1/31和2026/2/1，2025/12/31和2026/1/1），则返回1
	* 若prevRoster和currRoster开始日期同一天，则返回0
	* 若prevRoster和currRoster开始日期间隔超过1天，则返回-1
	* @return 返回-1表示不连续，0表示同一天，1表示连续一天
	*/
	static int GetConsecutiveDaysWithCurrRosterByStartTime(const ROSTER* prevRoster, const ROSTER* currRoster);

	/*
	* 在prevActivity和currActivity连续前提下，获得Current Activity新增的连续天数。
	* 若prevActivity和currActivity连续，则返回currActivity跨越天数(即Curr Activity的连续天数)
	* 注意：若prevActivity的最后一天和currActivity的第一个天在同一天，则返回：“currActivity跨越天数” - 1
	* @return 返回-1表示不连续
	*/
	static int GetConsecutiveDaysWithCurrActivity(const Activity* prevActivity, const Activity* currActivity);

	/*
	* 获得进入Airport Area区域的次数，连续进入认为是1次
    * @param segments：Segment列表，按照开始时间排序
    * @param airportAreas：Airport Area列表(机场)
	*/
	static int GetActualEntryTimes(const vector<Segment*>& segments, const vector<std::string>& airportAreas);
public:
	//仅RO使用，Crew的rosterList保留资质有效期扩展的Assignment
	static vector<SharedPtr<ROSTER>> FilterRostersByQualExtension(const int ruleRosterIndex, const std::shared_ptr<CREW>& crew, const SharedPtr<CrewDataContext>& dbData);

public:
	//返回值map<pairingId,ROSTER>
	static unordered_map<long long, const ROSTER*> GetPairingRosterMap(const std::vector<const ROSTER*>& rosters);

	//检查Roster是否存在exception Code（若存在，则返回true并忽略法规检查）
	static bool ExistExceptionCode(const ROSTER* roster, const set<string>& exceptionCodes, const SharedPtr<CrewDataContext>& dbData);
	//检查Pairing是否存在exception Code（若存在，则返回true并忽略法规检查）
	static bool ExistExceptionCode(const ROSTER* roster, const Pairing* pairing, const set<string>& exceptionCodes, const SharedPtr<CrewDataContext>& dbData);
	//检查Duty是否存在exception Code（若存在，则返回true并忽略法规检查）
	static bool ExistExceptionCode(const ROSTER* roster, const Duty* duty, const set<string>& exceptionCodes, const SharedPtr<CrewDataContext>& dbData);
	//检查Segment是否存在exception Code（若存在，则返回true并忽略法规检查）
	static bool ExistExceptionCode(const ROSTER* roster, const Segment* segment, const set<string>& exceptionCodes, const SharedPtr<CrewDataContext>& dbData);

private:
	static string GetTrainingCourseCode(const string crewId, const long long rosterId, const long long flightId, const SharedPtr<CrewDataContext>& dbData);

	static std::shared_ptr<TmCourse> GetTrainingCourse(const string crewId, const long long rosterId, const long long pairingId, const string tmGroupId, const SharedPtr<CrewDataContext>& dbData);
	static std::shared_ptr<TmCourse> GetTrainingCourse(const string crewId, const long long rosterId, const long long flightId, const SharedPtr<CrewDataContext>& dbData);

	static std::vector<std::string> GetTrainingRole(const string crewId, const long long rosterId, const long long pairingId, const vector<long long>& flightIds, const string role, const SharedPtr<CrewDataContext>& dbData);

	//返回：tuple<Assignment,Role>的列表
	static std::vector<std::tuple<std::string,std::string>> GetTrainingAssignmentRole(const ROSTER& roster, const vector<long long>& flightIds, const SharedPtr<CrewDataContext>& dbData);
};

#endif //_ROSTERUTILS_H_


