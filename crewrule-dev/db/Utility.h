#ifndef SINGLETON_H
#define SINGLETON_H

#include <string>
#include <map>
#include <time.h>
#include <vector>
#include <cfloat>
#include "CrewDB.h"
#include "CrewDBUtil.h"
using namespace std;

//调用法规的应用
const int PAIRING_OPTIMIZER = 0;
const int ROSTER_OPTIMIZER = 1;
const int ROSTER_EDITOR = 2;
const int BATCH_LEGALITY = 3;
const int PAIRING_EDITOR = 4;

//休息开始结束时间
struct Rest_Ranges{
	time_t startInUtc = 0;
	time_t endInUtc = 0;
	string airport;
};

//本地local night定义
struct Local_Night_Definition{
	string LocalStart;
	string LocalEnd;
	string MinRestInterval;
};

struct WOCL_Definition {
	// hh:mm to minutes
	int woclStart = 0;;
	int woclEnd = 0;;
};

struct Early_Start_Definition{
	int earlyStartStart = 0;;
	int earlyStartEnd = 0;;
};

struct Late_Finish_Definition {
	int lateFinishStart = 0;;
	int lateFinishEnd = 0;;
};

struct Night_Duty_Definition {
	int nightDutyStart = 0;
	int nightDutyEnd = 0;
};

struct RDO_Ranges {
	long startTime = 0;
	long endTime = 0;
};

struct Standby_FDP_And_Rest_Definition {
	vector<string> standbyAssignments;
	bool dutyWithinThePlannedStandby = false;
	string callOutToFlightGapRange;
	int callOutToFlightGapStart = 0;
	int callOutToFlightGapEnd = 0;
	string actualFdpCalcStart;
	string actualFdpCalcEnd;
	string actualDpCalcStart;
	string actualDpCalcEnd;
	string fdpReportingTimeStart;
	string actualRestCalculate;
	string standbyRestRatioStr;
	double standbyRestRatioValue = 0.0;
	string restExcludeSbyWindow;
	int restExcludeSbyWindowStart = 0;
	int restExcludeSbyWindowEnd = 0;

    //匹配规则，true：匹配成功，false：匹配失败
	bool match(const ROSTER* prevRoster, const ROSTER* currRoster) const;
};


struct Standby_DP_Definition {
	vector<string> standbyAssignments;

	string sbyWindow;
	int sbyWindowStart = 0;
	int sbyWindowEnd = 0;

	string sbyDPRatioStr;
	double sbyDPRatioValue = 0.0;

	bool match(const ROSTER* roster) const;
};

//计算DP
struct DP_Definition {
	//PR计算DP使用
	vector<string> dpAssignments{};
	//航班时长超过设定值需要扣除
	int flightHours = 0;
	//扣除的比例
	double dpPct = 0.0;
	vector<string> calloutAssignments{};
	vector<string> domIntTypes{}; //DIR: 航班国际国内类型，D-国内，I-国际，R-区域，支持*忽略該參數
	vector<string> serviceTypes{}; //Service Type : 取 Service Type Code, 支持* 忽略該參數

	bool matchSegment(const Segment* segment) const;

	bool matchCalloutAssignment(const string& assignment) const;
};

/**
 * @brief 结构体：经纬度坐标（度为单位）
 * @param lat 纬度（北纬为正，南纬为负）
 * @param lng 经度（东经为正，西经为负）
 */
struct LatLng {
	double lat = 0; // 纬度
	double lng = 0; // 经度
};

class Utility
{
public:

	// 静态成员函数,提供全局访问的接口
	static Utility* GetInstancePtr();

	void progressBar(int n);

	bool likeFind(vector<string>& vecs, string toBeFind);

	time_t getRestByNumberOfLocalNights(time_t endUtcTm, int numberOfLocalNights, Local_Night_Definition locals, int offsetMinutes);

	void getHHMMfromStr(const char* str, int* HH, int* mm);

	bool isFD(vector<RANK> rankList,string rank);

	string getAirlineCode();

	int DaysBetween(time_t date1, time_t date2,int offsetMinutes = 0);
	time_t LocalDateToUtc(tm local, int offsetMinutes);

	bool isInSameCity(string airport1, string airport2);

	static bool isInSameBase(string airport1, string airport2);

	bool isSouthNorathCommute(SharedPtr<CREW> crew,string strBase, SharedPtr<ROSTER> roster);

	// 检查本地时是否在小时分钟时间范围(inclusive)，可以传入 utc + offsetMinutes (本地时对应时区)；也可以传入本地时 + offsetMinutes = 0
	// 例如：utc 1713146400 + offsetMinutes 480 (2024年4月15日早上10点00分 GMT+08:00)，strLower "10:00", strUpper "11:59"
	// 返回true: 本地时为 1713175200 (1713146400+480*60) 本地时间为早上10点00分 GMT+08:00，在10:00和11:59之间
	// 直接传入本地时 1713175200 (1713146400+480*60) 和 offsetMinutes = 0，返回同样结果
	bool IsTimesInRange(time_t utctime, int minutesOffset, string strLower, string strUpper);

	bool isTimeRangeContained(time_t startTime, time_t endTime,	const std::string& targetStartTime,	const std::string& targetEndTime);

	//time_t getLocalTime(time_t UTCTime, int offset);

	string getComplement(map<string, int> compMap);

	time_t   UTCStrToUTC(char * buf);

	int convertToMinutes(const string& strMinutes);
	bool isHalfRoster(SharedPtr<ROSTER>& roster);

	vector<Rest_Ranges*> getRestRanges(vector<SharedPtr<ROSTER>> rosters, time_t startUtc, time_t endUtc, bool bCoutLayover = true,string restBase="*");
	vector<Rest_Ranges*> getRestRanges(vector<SharedPtr<ROSTER>> rosters, time_t startUtc, time_t endUtc, vector<string> restAssignmentGroups, bool bCoutLayover = true,string restBase="*");
	vector<Rest_Ranges*> getWorkingRanges(vector<SharedPtr<ROSTER>> rosters, time_t startUtc, time_t endUtc, bool bCoutLayover=true, string restBase="*");
	vector<Rest_Ranges*> getRestRanges(vector<SharedPtr<ROSTER>> rosters, time_t startUtc, time_t endUtc, bool bCountPostRest, vector<string> restAssignmentGroups);

	int hasXConsecutiveLocalNightsBeforeTm(vector<Rest_Ranges*> rests, int X, time_t startTm, Local_Night_Definition locals, int offsetMinutes, time_t startAtMostTm=0,bool searchMaxNumInRange=false);
	int howManyLocalNightsInRest(time_t start, time_t end,int maxLocalNighs, Local_Night_Definition locals, int offsetMinutes);
	int howManyConsecutiveDayswithAssgnGroups(vector<SharedPtr<ROSTER>>& rosters, time_t start, time_t end, vector<string>& assignmentGroups, int offsetMinutes, int application, bool isRosterMode=true);
	
	bool isDownRankInScenario(string crewActiveRank, string crewActingRank, vector<string>& scenarioActiveRanks, vector<string>& scenarioActingRanks, string rankCross="");

	// 计算用utc表达的本地时日历日开始时间，传入 utc + offsetMinutes (本地时对应时区)
	// 例如：utc 1713146400 + offsetMinutes 480 (2024年4月15日早上10点00分 GMT+08:00)，返回结果为 1713110400 （2024年4月15日凌晨12点00分 GMT+08:00， 或 2024年4月14日PM4点00分 GMT）	
	time_t getLocalDayStartInUTC(time_t utc, int offsetMinutes);
	time_t getLocalMonthEndInUTC(time_t utc, int offsetMinutes, int num = 1);

	time_t getLocalQuarterEndInUTC(time_t utc, int offsetMinutes);
	time_t getLocalMonthStartInUTC(time_t utc, int offsetMinutes);
	time_t getLocalQuarterStartInUtc(time_t utc, int offsetMinutes);
	time_t getBirthdayInAYear(time_t thisyear, tm birthday);
	//weekdayStartFrom取值：MON - 周一为每周开始、SUN - 周日为每周开始
	time_t getLocalWeekStartInUTC(const time_t utc, const string& weekdayStartFrom, const int offsetMinutes);
	//weekdayStartFrom取值：MON - 周一为每周开始、SUN - 周日为每周开始
	time_t getLocalWeekEndInUTC(const time_t utc, const string& weekdayStartFrom, const int offsetMinutes);
	time_t getLocalYearStartInUTC(time_t utc, int offsetMinutes);
	time_t getLocalYearEndInUTC(time_t utc, int offsetMinutes);
	time_t getTimeByRoundHour(time_t times, bool retNext = true);
	time_t getLocalHourStartInUTC(time_t utc, int offsetMinutes);
	time_t getLocalHourEndInUTC(time_t utc, int offsetMinutes);
	int getFirstRosterAfter(vector<SharedPtr<ROSTER>> rosterList, time_t startTime);

	//获得年份
	int getYear(const time_t time);

	//判断是否同一年
	bool isSameYear(const time_t start, const time_t end);

	/*
	根据起始结束日期，和定义，得到时间数值。比如CM,1(月),2014-10-11,2015-02-01，得到的结果应该为10,11,12,1,2五个月的起始结束日期
	*/
	map<time_t, time_t>& getDateRange(string strDefinition, string strNum, string startDateUTC, string endDateUTC, const string& weekdayStartFrom);
	map<time_t, time_t>& getDateRangeFromLong(string strDefinition, string strNum, time_t startDateUTC, time_t endDateUTC, const string& weekdayStartFrom, int offsetMinutes = 0);

	//从crewbases中获取指定时刻 base，时间范围为 startUtc ~ now()+1year
	string getCrewPrimaryBase(vector<SharedPtr<CREW_BASE>>& bases, time_t startUtc);
	string getCrewPrimaryBaseByLoc(vector<SharedPtr<CREW_BASE>>& bases, time_t startLoc);
	//从crewbases中获取指定时刻 base，时间范围为 startUtc ~ endUtc
	string getCrewPrimaryBase(vector<SharedPtr<CREW_BASE>>& bases, time_t startUtc, time_t endUtc);

	bool isTimeOverlap(time_t startDateUTC1, time_t endDateUTC1, time_t startDateUTC2, time_t endDateUTC2);

	bool isTimeCoveredInRange(time_t timeUtc,int offsetMinutes, time_t startLoc, time_t endLoc);
	bool isTimesCoveredInRange(time_t startUtc, time_t endUtc, int offsetMinutes, int startLoc, int endLoc);
	//bool isTimesCoveredInRange_fix(time_t startUtc, time_t endUtc, int hoursOffset, int startLoc, int endLoc);

	//deprecated
	bool isTimesCoveredInRange2(time_t startUtc, time_t endUtc, int hoursOffset, int startLoc, int endLoc);

	string formatMinutes(int minutes);
	string formatMinutesToDays(int minutes);

	bool isDownGrade(vector<RANK>& ranks,string airline, string activeRank, string actingRank);

	bool isTwoDutyConsecutives(Duty* prevDuty, Duty* currentDuty, int offsetMinutes, int startLoc, int endLoc);

	//得到dutylist里，iMinutesWindow分钟的Rest window. 比如从roster取168小时window
	//window范围来做RosterEditor或者RosterOptimizer
	//rollingUnit Rolling单位，如果是小时，则
	map<time_t, time_t> getRollingWindows(int iMinutesRestWindow, time_t windowStart, time_t windowEnd,int rollingUnit);

	map<time_t, time_t> getWeeksRollingWindows(time_t windowStart, time_t windowEnd, const string& weekdayStartFrom, int offsetMinutes, int times);

	map<time_t, time_t> getWeeksRollingWindowsByFirstDayOfYear(time_t windowStart, time_t windowEnd, int offsetMinutes, int times);

	map<time_t, time_t> getWeeksRollingWindowsByRefDate(time_t windowStart, time_t windowEnd, const string& weekdayStartFrom, int offsetMinutes, int times, time_t refDate, bool isRolling);

	map<time_t, time_t> getDaysRollingWindows(time_t windowStart, time_t windowEnd, int offsetMinutes, int times);

	map<time_t, time_t> getDaysRollingWindowsByRefDate(time_t windowStart, time_t windowEnd, int offsetMinutes, int times, time_t refDate, bool isRolling);

	map<time_t, time_t> getMonthRollingWindows(time_t windowStart, time_t windowEnd,int offsetMinutes,int times);

	map<time_t, time_t> getMonthRollingWindowsByRefDate(time_t windowStart, time_t windowEnd, int offsetMinutes, int times, time_t refDate, bool isRolling);

	map<time_t, time_t> getQuarterRollingWindows(time_t windowStart, time_t windowEnd, int offsetMinutes, int times);

	//假设time已经是基于时区
	time_t addWeeks(time_t time, int numberOfWeeks);
	time_t addMonths(time_t utcTime, int offsetTZMinute, int numberOfMonths);
	time_t addMonths(time_t time, int numberOfMonths);
	time_t addYears(time_t time, int numberOfYears);

	/**
	* 获得某年某月的天数
	* @param year 年份，例如：2024
	* @param month 月份，取值：1-12
	* @return 月份天数，取值范围：1-31
	*/
	int daysInMonth(const int year, const int month);

	//EVA ONLY
	time_t getTrackingWindowEnd(int offsetMinutes);

	void UTCToUTCStr(time_t utc, char * buf, int bufsize);
	
	string getAirportType(vector<DBAirport> * airportList, string airport);

	string getSegType(vector<DBAirport> * airportList, string airport1, string airport2);

	string getDutySegType(Duty* duty, vector<DBAirport> * airportList);
	//string getCountry(string airport){ return ""; };
	//pairingDutyNode
	shared_ptr<PairingDutyNode> getPairingDutyNode(vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes, string type, string node, long long segmentId = 0);
	shared_ptr<PairingDutyNode> getPairingDutyNodeOfSeg(const vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes, const string node, const long long fromSegmentId, const long long toSegmentId);
	// 检查Crew在时间范围内是否有有效的资质qual
	bool isCrewHasQual(SharedPtr<CREW>& crew, string qual, time_t startDate, time_t endDate, string assignment, const multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigsForQualMap, bool isRankSpecific = false);
	int getFirstWorkingRosterIndex(vector<SharedPtr<ROSTER>>& rosters, vector<string>& restAssignments);
	int getLastWorkingRosterIndex(vector<SharedPtr<ROSTER>>& rosters, vector<string>& restAssignments);
	int getNextWorkingRosterIndex(vector<SharedPtr<ROSTER>>& rosters, vector<string>& restAssignments, int iCurrentIndex);
	int getWorkingRosterIndexBefore(vector<SharedPtr<ROSTER>>& rosters, vector<string>& restAssignments, int iCurrentIndex);
	int howManyAssignmentsInRange(vector<SharedPtr<ROSTER>>& rosters, vector<string>& assignments, vector<string>& assignmentGroups, time_t rangeStart, time_t rangeEnd, int iConsecutive = 1, bool isSplit = true);
	int howManyAssignmentsInRange(vector<SharedPtr<ROSTER>>& rosters, vector<string>& assignments, time_t rangeStart, time_t rangeEnd, int iConsecutive = 1, bool isSplit=true);
	bool findBeforeFdpSeg(int i, Duty*& duty, CrewDataContext* dbData);
	bool findAfterFdpSeg(int i, Duty*& duty, CrewDataContext* dbData);
	//统计一段时间内，满足条件的Roster数量
	double howManyRostersInRange(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData, time_t rangeStart, time_t rangeEnd, bool isOptimizer = false, int roRosterIndex = -2);
	//howManyRostersInRange 准备deprecated，用howManyRostersInRange2代替
	double howManyRostersInRange2(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData, time_t rangeStart, time_t rangeEnd, bool isOptimizer = false, int roRosterIndex = -2);

	//统计一段时间内，满足条件的航班数量
	double howManyFlightsInRange(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData, time_t rangeStart, time_t rangeEnd, bool isOptimizer, int roRosterIndex);

	//统计一段时间内，满足条件的Duty数量
	double howManyDutiesInRange(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData, time_t rangeStart, time_t rangeEnd, bool isOptimizer, int roRosterIndex);

	//deprecated
	[[deprecated("use howManyDaysOffInRanges instead")]]
	int howManyDaysOffInRange(vector<SharedPtr<ROSTER>>& rosters, vector<string> restAssignments, vector<string> daysOffs, int offsetMinutes, bool bCountPostRest, time_t rangeStart, time_t rangeEnd, int iConsecutive = 1);

	int howManyDaysOffInRanges(const vector<SharedPtr<ROSTER>>& rosters, const vector<string>& doAssignments, const vector<string>& doAssignmentGroups, const time_t rangeStart, const time_t rangeEnd, const int offsetMinutes, const bool bCountBlankDays, const bool bCountPostRest, const map<string, DBAirport*>& airportMap, const string latoverTimemode = "", const int iConsecutive = 1, const bool bCountLayover = false, const string base = "", const bool isSplit = true, const string weekEnd = "N");
	int howManyDaysOffInRanges(const vector<SharedPtr<ROSTER>>& rosters, const vector<string>& doAssignments, const time_t rangeStart, const time_t rangeEnd, const int offsetMinutes, const bool bCountBlankDays, const bool bCountPostRest, const map<string, DBAirport*>& airportMap, const string latoverTimemode = "", const int iConsecutive = 1, const bool bCountLayover = false, const string base = "", const bool isSplit = true, const string weekEnd = "N");

	int hasWeekEndInRange(time_t utcStart, time_t utcEnd,int offsetMinutes, string weekEndMode);

	//在时间范围内是否有RO Assigned Roster
	bool hasROAssignedRosterInRange(vector<SharedPtr<ROSTER>>& rosters, time_t start, time_t end);

	int getPrevAttributeRoster(vector<SharedPtr<ROSTER>>& rosters, int iCurrentRoster, string strAtt);
	int getFirstAttributeRoster(vector<SharedPtr<ROSTER>>& rosters, string strAtt);
	int getNextAttributeRoster(vector<SharedPtr<ROSTER>>& rosters, int iCurrentRoster, string strAtt);

	//strLocationSameTOBase (Y=location和base相同,N=不相同,其他都可以）
	int getFirstRoster(vector<SharedPtr<ROSTER>>& rosters, vector<string>& attrs, vector<string>& asssignments, vector<string>& labels, vector<string>& quals, string isRequested = "*", string crewBase = "", string strLocationSameTOBase = "*");
	int getNextRoster(vector<SharedPtr<ROSTER>>& rosters, int iCurrentRoster, vector<string>& attrs, vector<string>& asssignments, vector<string>& labels, vector<string>& quals, string isRequested = "*", string crewBase = "", string strLocationSameTOBase = "*");

	int  getFirstRoster(vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData);
	int  getNextRoster(vector<SharedPtr<ROSTER>>& rosters, int iCurrentRoster, roster_space* space, SharedPtr<CrewDataContext> _dbData);
	bool isMatchRosterSpace(Pairing* pairing, roster_space* space);

	//一次获取符合条件的RosterList，返回Roster Index的List
	vector<int> getMatchedRosters(const vector<SharedPtr<ROSTER>>& rosters, roster_space* space, SharedPtr<CrewDataContext> _dbData);

    //一次获取符合条件的Roster和对应的Duty List，返回Map<Roster Index, Duty List>
	map<size_t, vector<Duty*>> getMatchedDuties(const vector<SharedPtr<ROSTER>>& rosters, roster_space* space, const SharedPtr<CrewDataContext>& _dbData);

	bool isCrewQualified(const SharedPtr<CREW>& crew, const string base, const string rank, const string fleet, const string team = "*", const string position="*", const time_t eff = 0, const time_t exp = 0) const;
	bool isCrewQualified(const SharedPtr<CREW>& crew, const vector<string>& strBases, const vector<string>& strRanks, const vector<string>& strFleets, const vector<string>& strTeams, const vector<string>& strPositions, const time_t eff, const time_t exp) const;

	bool isCrewTeamQualified(const SharedPtr<CREW>& crew, const string& rTeam, const time_t eff, const time_t exp) const;

	bool isCrewTeamQualified(const SharedPtr<CREW>& crew, const vector<string>& teams, const time_t eff, const time_t exp) const;

	bool isCrewRankQualified(const SharedPtr<CREW>& crew, const string& rank, const time_t eff, const time_t exp) const;

	bool isCrewRankQualified(const SharedPtr<CREW>& crew, const vector<string>& ranks, const time_t eff, const time_t exp) const;

	bool isCrewBaseQualified(const SharedPtr<CREW>& crew, const vector<string>& bases, const time_t eff, const time_t exp) const;

	bool isCrewFleetQualified(const SharedPtr<CREW>& crew, const vector<string>& fleets, const time_t eff, const time_t exp) const;

	bool isCrewPositionQualified(const SharedPtr<CREW>& crew, const vector<string>& positions, const time_t eff, const time_t exp) const;

	bool isCrewActingRankQualified(const SharedPtr<CREW>& crew, const long long fltId, const vector<string>& actingRanks, const SharedPtr<CrewDataContext>& dbData) const;

	//类型转换
	string iToa(int integer);
	string lToa(long bigInteger);
	string llToa(long long  Inter64);
	string dToa(double Double);
	string ToString(int a);
	string ToString(unsigned int a);
	string ToString(long a);
	string ToString(long long a);
	string ToString(double a);
	//拼接 2 3 -> 2:03  2 0 -> 2:00
	string getClock_format(int t1, int t2);
	//判断时间是否是planing 还是tracking时间 planing返回true 反之false
	bool isTrackingOrPlaning(time_t checkTime);

	//判断任务环是否 符合标签过滤条件
	bool isPairingMatchAttributes(const string& pairingAttributes, vector<string>& attributesCriterias);
	bool isPairingMatchAttributes(const string& pairingAttributes, const string& attributesCriterias);
	bool isPairingMatchAttribute(const string& pairingAttributes, const string& singleAttributeCriteria);

	//判断Duty是否 符合标签过滤条件
	bool isDutyMatchAttributes(const string& strDutyAttributes, const vector<string>& attributesCriterias);

	//判断roster是否包含训练line training任务
	bool isTrainingFlight(const SharedPtr<ROSTER>& roster, const SharedPtr<CrewDataContext>& _dbData) const;

	bool checkCoverdDPGapTimeRange(const time_t& checkStart, const time_t& checkEnd, const  CrewDataContext* _dbData) const;

	//是否能匹配roster.qualifier(assignment)和roster.duty(assignment group)
	bool matchAssignmentInRoster(const SharedPtr<ROSTER>& roster, const vector<string>& assignments, const vector<string>& assignmentGroups);

	time_t getCurrentTimeInUTC(const SharedPtr<CrewDataContext>& dbData);
public:

	//四舍五入
	template <typename T>
	inline T round(const T v)
	{
		return ((v < T(0)) ? std::ceil(v - T(0.5)) : std::floor(v + T(0.5)));
	}

	//向上取整
	template <typename T>
	inline int ceil(const T v) {
		double num = (double)v;
		double rounded_num = std::round(num);
		//double epsilon = std::numeric_limits<double>::epsilon();
		double epsilon = 0.0000001;
		double gap = fabs(rounded_num - num);

		if (gap > 0 && gap < epsilon) {
			//不可以接受的误差值。若 (num > rounded_num) 误差值比原始值偏大，否则 误差值比原始值偏小
			num = (num > rounded_num) ? std::floor(num) : std::ceil(num);
		}
		else {
			//可以接受的误差值
			num = std::ceil(num);
		}
		return (int)num;
	}

	//向下取整
	template <typename T>
	inline int floor(const T v) {
		double num = (double)v;
		double rounded_num = std::round(num);
		//double epsilon = std::numeric_limits<double>::epsilon();
		double epsilon = 0.0000001;
		double gap = fabs(rounded_num - num);

		if (gap > 0 && gap < epsilon) {
			//不可以接受的误差值。若 (num > rounded_num) 误差值比原始值偏大，否则 误差值比原始值偏小
			num = (num > rounded_num) ? std::floor(num) : std::ceil(num);
		}
		else {
			//可以接受的误差值
			num = std::floor(num);
		}
		return (int)num;
	}

	//浮点数等于0，a==0
	inline static bool zero(double a, const double epsilon = DBL_EPSILON)
	{
		return fabs(a) <= epsilon;
	}

	//a == b
	inline static bool equal(const double a, const double b, const double epsilon = DBL_EPSILON)
	{
		return fabs(a - b) <= epsilon;
	}

	//a < b
	inline static bool lessThan(double a, double b, const double epsilon = DBL_EPSILON)
	{
		return a < (b - epsilon);
	}

	//a <= b
	inline static bool lessThanOrEqual(double a, double b, const double epsilon = DBL_EPSILON)
	{
		return a <= (b + epsilon);
	}

	//a > b
	inline static bool greaterThan(double a, double b, const double epsilon = DBL_EPSILON)
	{
		return a > (b + epsilon);
	}

	//a >= b
	inline static bool greaterThanOrEqual(double a, double b, const double epsilon = DBL_EPSILON)
	{
		return a >= (b - epsilon);
	}

	//小数精度precision之后进行向上取整
	inline static double ceil(const double value, const int precision) {
		double factor = std::pow(10.0, precision);
		return std::ceil(value * factor) / factor;
	}

	//小数精度precision之后进行向下取整
	inline static double floor(const double value, const int precision) {
		double factor = std::pow(10.0, precision);
		return std::floor(value * factor) / factor;
	}

	//小数精度precision之后进行四舍五入
	inline static double round(const double value, const int precision) {
		double factor = std::pow(10.0, precision);
		return std::round(value * factor) / factor;
	}

	//小数精度precision之后进行直接截取
	inline static double trunc(const double value, const int precision) {
		double factor = std::pow(10.0, precision);
		return std::trunc(value * factor) / factor;
	}

public:
	//Haversine公式计算两个经纬度间的距离（高精度版）
	int calculateDistanceHaversine(const LatLng& pointA, const LatLng& pointB) const;

	//球面余弦公式计算距离（简洁版，适合长距离）
	int calculateDistanceCosine(const LatLng& pointA, const LatLng& pointB) const;
private:
	// 静态成员变量,提供全局惟一的一个实例
	static Utility m_pStatic;
	Utility();
	~Utility();

	string _airlinecode;
	
	int isDigit(char ch);
	bool isPureAssignmentInRoster(SharedPtr<ROSTER> roster, vector<string> assignments);

	
};

#endif
