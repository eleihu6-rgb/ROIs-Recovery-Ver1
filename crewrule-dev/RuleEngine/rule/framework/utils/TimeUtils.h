#ifndef _TIMEUTILS_H_
#define _TIMEUTILS_H_

#include <string>
#include <map>
#include <vector>
#include <tuple>
#include <time.h>

enum ChronoUnit {
	UNKNOWN = -1,
	SECONDS = 1,
	MINUTES = 2,
	HOURS = 4,
	DAYS = 8,
	WEEKS = 16,
	MONTHS = 32,
	YEARS = 64
};

class TimeUtils {
public:

	static constexpr char* YYYY_MM_DD_HH_MM_SS = "%Y-%m-%d %H:%M:%S"; //eg: 2024-02-11 05:35:00

	static constexpr char* YYYY_MM_DD_HH_MM = "%Y-%m-%d %H:%M"; //eg: 2024-02-11 05:35

	static constexpr char* YYYY_MM_DD_HH = "%Y-%m-%d %H"; //eg: 2024-02-11 05

	static constexpr char* YYYY_MM_DD = "%Y-%m-%d"; //eg: 2024-02-11

	static constexpr char* HH_MM_SS = "%H:%M:%S"; //eg: 05:35:00

	static constexpr char* HH_MM = "%H:%M"; //eg: 05:35

	static constexpr char* YYYYMMDDHHMMSS = "%Y%m%d%H%M%S"; //eg: 20240211053500

	static constexpr char* YYYYMMDDHHMM = "%Y%m%d%H%M"; //eg: 202402110535

	static constexpr char* YYYYMMDDHH = "%Y%m%d %H"; //eg: 2024021105

	static constexpr char* YYYYMMDD = "%Y%m%d"; //eg: 20240211

	static constexpr char* MM_DD_YYYY_HH_MM_SS = "%m/%d/%Y %H:%M:%S"; //eg: 02/11/2024 05:35:00

	static constexpr char* MM_DD_YYYY_HH_MM = "%m/%d/%Y %H:%M"; //eg: 02/11/2024 05:35

	static constexpr char* MM_DD_YYYY_HH = "%m/%d/%Y %H"; //eg: 02/11/2024 05

	static constexpr char* MM_DD_YYYY = "%m/%d/%Y"; //eg: 02/11/2024

	static constexpr char* MM_DD_YY_HH_MM_SS = "%m/%d/%y %H:%M:%S"; //eg: 02/11/24 05:35:00

	static constexpr char* MM_DD_YY_HH_MM = "%m/%d/%y %H:%M"; //eg: 02/11/24 05:35

	static constexpr char* MM_DD_YY_HH = "%m/%d/%y %H"; //eg: 02/11/24 05

	static constexpr char* MM_DD_YY = "%m/%d/%y"; //eg: 02/11/24

public:

	/*
	* 将相对时间HH:mm格式转化成基准时间日期的对应的时间。
	* 例如：
	*  （1）输入参数：baseTime  2023/1/1 10:12:00, startTimeHHmm 22:00, endTimeHHmm 05:00，
	*       输出参数：startTime 2023/1/1 22:00, endTime 2023/1/2 05:00  （endTimeHHmm小于startTimeHHmm则跨天）
	*  （2）输入参数：baseTime  2023/1/1 10:12:00, startTimeHHmm 22:00, endTimeHHmm 23:00，
	*       输出参数：startTime 2023/1/1 22:00, endTime 2023/1/1 23:00
	*
	* @param localStartTime 输出参数：本地开始时间
	* @param localEndTime 输出参数：本地结束时间
	* @param localBaseTime 输入参数：本地基准时间
	* @param startTimeHHmm：输入参数：开始时间HHmm，仅HH:mm 例如：23:00
	* @param endTimeHHmm：输入参数：结束时间HHmm，仅HH:mm 例如：05:00。 上下限为：[23:00~05:00] 表示跨天
	*/
	static void GetAbsoluteTime(time_t& localStartTime, time_t& localEndTime,
		const time_t localBaseTime, const std::string& startTimeHHmm, const std::string& endTimeHHmm);

	static void GetAbsoluteTime(time_t& localStartTime, time_t& localEndTime,
		const time_t localBaseTime, const int startTimeHHmm, const int endTimeHHmm);

	/*
	* 获得输入时间段[startTimeUtc,endTimeUtc]与[startTimeHHmm,endTimeHHmm]时间重叠的所有时间段
	* 例如：
	*  （1）输入参数：[2023/1/1 10:12, 2023/1/1 21:59] [22:00,05:00]
	*       输出参数：[] 数值是空
	*  （2）输入参数：[2023/1/1 10:12, 2023/1/1 22:00] [22:00,05:00]
	*       输出参数：[<2023-01-01 22:00,2023-01-02 05:00>] 数值是空 （endTimeHHmm小于startTimeHHmm则跨天）
	*  （3）输入参数：[2023/1/1 10:12, 2023/1/2 15:12] [22:00,05:00]
	*       输出参数：[<2023-01-01 22:00,2023-01-02 05:00>] 
	*  （4）输入参数：[2023/1/1 10:12, 2023/1/4 15:12] [22:00,05:00]
	*       输出参数：[<2023-01-01 22:00,2023-01-02 05:00>,<2023-01-02 22:00,2023-01-03 05:00>,<2023-01-03 22:00,2023-01-04 05:00>]
	*
	* @param startTimeUtc 开始时间(UTC)
	* @param endTimeUtc 结束时间(UTC)
	* @param startTimeHHmm：开始时间HHmm，仅HH:mm 例如：23:00
	* @param endTimeHHmm：结束时间HHmm，仅HH:mm 例如：05:00。 上下限为：[23:00~05:00] 表示跨天
	* @param offsetTZMinutes 时区
	* @return 所有与[startTimeHHmm,endTimeHHmm]相交的<startTimePeriod,endTimePeriod>数组
	*/
	static std::vector<std::tuple<time_t,time_t>> GetOverlapPeriods(const time_t startTimeUtc, const time_t endTimeUtc,
		const int startTimeHHmm, const int endTimeHHmm, const int offsetTZMinutes = 0);

	/*
	* 截断时间
	*/
	static time_t Truncate(const time_t localTime, const ChronoUnit chronoUnit);

	/*
	* 截断时间
	*/
	static time_t Truncate(const time_t utcTime, const int offsetTZMinute, const ChronoUnit chronoUnit);

	/*
	* 判断是否相同年、月、日、分等
	*/
	static bool IsSame(const time_t sLocalTime, const time_t tLocalTime, const ChronoUnit chronoUnit);

	/*
	* 判断是否相同年、月、日、分等
	*/
	static bool IsSame(const time_t sUtcTime, const time_t tUtcTime, const int offsetTZMinute, const ChronoUnit chronoUnit);

	/**
	* 添加月份
	* @param utcTime UTC时间
	* @param months 月数
	*/
	static time_t AddMonth(const time_t utcTime, const int offsetTZMinute, const int months);

	/**
	* 函数功能：根据年初时间戳和月份，返回该月最后一秒的time_t
	* 参数：
	* startOfYear - 当年1月1日00:00:00的time_t时间戳
	* month       - 目标月份（1-12）
	* 返回值：目标月份最后一秒的time_t时间戳
	*/
	static time_t getEndOfMonth(time_t startOfYear, int month);

	/**
	* 添加周，与时区无关
	* @param time 时间
	* @param days 天数
	*/
	static time_t AddWeek(const time_t time, const int weeks);

	/**
	* 添加天，与时区无关
	* @param time 时间
	* @param days 天数
	*/
	static time_t AddDay(const time_t time, const int days);

	/*
	* 相差天数
	* [2024/11/3 0:00:00, 2024/11/3 00:00:01] 返回 0个日历天 
	* [2024/11/3 0:10:00, 2024/11/4 00:05:00] 返回 0个日历天 
	* [2024/11/3 0:00:00, 2024/11/4 00:00:01] 返回 1个日历天
	* 当endTime>=startTime返回最小值为 0 天
	*/
	static int DiffDay(const time_t startTime, const time_t endTime);

	/*
	* 相差日历天数
	* 当endTime>=startTime返回最小值为 1 天
	* 例如：[2024/11/3 0:00:00, 2024/11/4 0:00:00] 返回 2个日历天 
	* [2024/11/3 0:00:00, 2024/11/3 23:59:59] 返回 1个日历天 
	* [2024/11/3 0:00:00, 2024/11/3 00:00:01] 返回 1个日历天 
	*/
	static int DiffCalendarDay(const time_t startTime, const time_t endTime);

	//计算两个时间之间的完整天数
    static int CalculateFullDaysBetweenTimes(const time_t& time1, const time_t& time2, const int offsetTZMinutes = 0);

	//计算两个时间包含的的完整天时间段,返回所有完整天时间段的<startTimePeriod,endTimePeriod>数组
    static std::vector<std::tuple<time_t,time_t>> GetFullDaysBetweenTimes(const time_t time1, const time_t time2, const int offsetTZMinutes = 0);

	/**
	* 计算两个时间之间的间隔的日历天数（不包括开始时间和结束时间所在天）
	* 例如：
	* [2024/11/3 0:00:00, 2024/11/3 23:59:59] 间隔 0个日历天 
	* [2024/11/3 0:00:00, 2024/11/4 0:00:00] 间隔 0个日历天 
	* [2024/11/3 0:00:01, 2024/11/4 23:59:59] 间隔 0个日历天 
	* [2024/11/3 0:00:00, 2024/11/5 00:00:00] 间隔 1个日历天 
	* [2024/11/3 23:59:59, 2024/11/5 23:59:59] 间隔 1个日历天 
	* [2024/11/3 00:00:00, 2024/11/6 23:59:59] 间隔 2个日历天
	* @param startTime 开始时间
	* @param endTime 结束时间
	* @param offsetTZMinutes 时区
	* @reutun 返回结果
	*/
	static int GetCalendarDaysInBetween(const time_t startTime, const time_t endTime, const int offsetTZMinutes = 0);

	/*
	* 相差月数
	* 当endTime>=startTime返回最小值为 0 月
	* 例如：[2024/11/3 0:00:00, 2024/12/4 0:00:00] 返回 1个日历月
	* [2024/11/3 03:04:10, 2024/11/14 12:11:22] 返回 0个日历月
	* [2024/11/3 0:00:00, 2024/11/3 00:00:01] 返回 0个日历月
	*/
	static int DiffMonth(const time_t startTime, const time_t endTime, const int offsetTZMinutes = 0);

	/*
	* 相差日历月数(经历过日历月数)
	* 当endTime>=startTime返回最小值为 1 月
	* 例如：[2024/11/3 0:00:00, 2024/12/4 0:00:00] 返回 2个日历月
	* [2024/11/3 03:04:10, 2024/11/14 12:11:22] 返回 1个日历月
	* [2024/11/3 0:00:00, 2024/11/3 00:00:01] 返回 1个日历月
	*/
	static int DiffCalendarMonth(const time_t startTime, const time_t endTime, const int offsetTZMinutes = 0);

	static bool IsSameDay(const time_t& startTime, const time_t& endTime);
	///*
	//* 获得包含时间段（特定周期）次数
	//*
	//* @param startTime
	//* @param endTime
	//* @param baseTime
	//* @param startTimeHHmm：开始时间HHmm，仅HH:mm 例如：23:00
	//* @param endTimeHHmm：结束时间HHmm，仅HH:mm 例如：05:00。 上下限为：[23:00~05:00] 表示跨天
	//*/
	//static int GetTimePeriodNums(const time_t& startTime, const time_t& endTime, const std::string& startHHmm, const std::string& endHHmm, const int& minSize);

	/**
	* 检查字符串是否符合格式 HH:mm
	* 1 只能由数字和：组成
	* 2 冒号位置只能在[1]和[2]
	* 3 只能有1个：
	* @param str
	*/
	static bool isHHmm(const char * str);

	/**
	* 01:30 --> 90, return -1 on err
	* @param str
	*/
	static int hhmmToMinutes(const char * str);

	/**
	* 01:30 --> 90, return -1 on err
	* @param str
	*/
	static int hhmmToMinutes(const std::string& str);

	//分钟转化成HH:mm格式，例如：90 --> 01:30， -90 --> -01:30
	static std::string MinutesTohhmm(const int minutes);

	//获得HH:mm格式时分间隔时长（分钟），需要考虑跨夜
	//例如：[01:30, 03:30] = 120, [22:00, 08:00] = 600, [22:00, 00:00] = 120
	static int GetDurationOfHHmm(const std::string& startHHmm, const std::string& endHHmm);

	//计算二个基于0点分钟数的的间隔时长（分钟），需要考虑跨夜
	//例如：[90（表示01:30）, 210（表示03:30）] = 120
	//      [1320（表示22:00）, 480（表示08:00）] = 600, [1320（表示22:00）, 0表示（00:00）] = 120
	static int GetDurationOfHHmm(const int startMinutesOfDay, const int endMinutesOfDay);

	//获得[startTime, endTime]之间的时长，但要扣除[hh:mm, hh:mm]之间的时间，单位：秒
	//例如排班[2025/5/1 8:00, 2025/5/1 17:00], 需要扣除中间午休时间[12:30,13:30]
	static int GetDuration(const time_t startTime, const time_t endTime, const int restStartHHmm = -1, const int restEndHHmm = -1);

	//获得[startTime, endTime]之间的时长，但仅计算startTime在hh:mm之后的时长，单位：秒
	//例如[2025/5/1 8:00, 2025/5/1 17:00], 仅计算10:00之后时长，最终仅需要计算[2025/5/1 10:00, 2025/5/1 17:00]之间时长
	static int GetDurationAfterHHmm(const time_t startTime, const time_t endTime, const int afterHHmm);

	static time_t GetStartTimeOfDay(const time_t utc);

	int GetDaysByDuration(const time_t utcBeg, const time_t utcEnd);

	//时间向下取整，
	//例如：
	//      Floor(2023-1-1 10:40:29, ChronoUnit.HOURS) = 2023-1-1 10:00
	//      Floor(2023-1-1 10:00:00, ChronoUnit.HOURS) = 2023-1-1 10:00
	//      Floor(2023-1-1 10:40:29, ChronoUnit.DAYS) = 2023-1-1 00:00
	//      Floor(2023-1-1 00:00:00, ChronoUnit.DAYS) = 2023-1-1 00:00:00
	static time_t Floor(const time_t time, const ChronoUnit chronoUnit);

	//时间向上取整，
	//例如：
	//	 Ceil(2023-1-1 10:40:29, ChronoUnit.HOURS) = 2023-1-1 11:00
	//   Ceil(2023-1-1 10:40:29, ChronoUnit.DAYS) = 2023-1-2 00:00
	static time_t Ceil(const time_t time, const ChronoUnit chronoUnit);

	//UTC时间转化成“本地时间”后向下取整，并返回UTC时间
	//例如：
	//      Floor(2023-1-1 10:40:29, ChronoUnit.HOURS) = 2023-1-1 10:00
	//      Floor(2023-1-1 10:00:00, ChronoUnit.HOURS) = 2023-1-1 10:00
	//      Floor(2023-1-1 10:40:29, ChronoUnit.DAYS) = 2023-1-1 00:00
	//      Floor(2023-1-1 00:00:00, ChronoUnit.DAYS) = 2023-1-1 00:00:00
	static time_t Floor(const time_t utcTime, const int offsetTZMinute, const ChronoUnit chronoUnit);

	//UTC时间转化成“本地时间”后向上取整，并返回UTC时间
	//例如：
	//	 Ceil(2023-1-1 10:40:29, ChronoUnit.HOURS) = 2023-1-1 11:00
	//   Ceil(2023-1-1 10:40:29, ChronoUnit.DAYS) = 2023-1-2 00:00
	static time_t Ceil(const time_t utcTime, const int offsetTZMinute, const ChronoUnit chronoUnit);

	/**
	* slideUnit 滑动单位， RH-按小时，CD-按天
	*/
	static ChronoUnit FromSlideUnit(const std::string& slideUnit);

	/** 判断checkTime的hhmm是否在时间范围内[start,end]
	* checkTime 绝对时间
	* startHHmm 开始范围（分钟数） 如 480 = "08:00"早8点
	* endHHmm 结束范围（分钟数） 如 119 = "01:59"
	* 
	*/
	static bool IsTimesInRange(const time_t checkTime, const int startHHmm, const int endHHmm);

	/** 判断checkHHmm的hhmm是否在时间范围内[startTime,endTime]
	* 例如：09:00 在 2021/1/1 08:00 ~2021/1/1 10:00 之间
	* 09:00 在 2021/1/1 10:00 ~2021/1/2 09:10 之间
	* checkHHmm 检查时间（分钟数）  如 540 = "09:00"早8点
	* startTime 开始时间戳
	* endTime  结束时间戳
	*
	*/
	static bool IsTimesInRange(const int checkHHmm, const time_t startTime, const time_t endTime);


	/** 判断checkHHmm的hhmm是否在时间范围内[startTime,endTime]
	* 例如：09:00 在 08:00 ~10:00 之间
	* 09:00 在 10:00 ~ 09:10 之间 跨夜
	* checkHHmm 检查时间分钟数  如 540 = "09:00"早9点
	* startHHmm 开始范围（分钟数） 如 480 = "08:00"早8点
	* endHHmm 结束范围（分钟数） 如 119 = "01:59"
	*
	*/
	static bool IsTimesInRange(const int checkHHmm, const int startHHmm, const int endHHmm);

	/*
	* 判断绝对时间[checkStartTime,checkEndTime] 在相对时间[startHHmm,endHHmm]内，并且checkStartTime和checkEndTime之间时长需要大于等于minDuration
	* @param checkStartTime
	* @param checkEndTime
	* @param startHHmm HH:MM的分钟数
	* @param endHHmm HH:MM的分钟数
	* @param minDuration：间隔时长，单位：分钟
	*/
	static bool IsTimesInRange(const time_t checkStartTime, const time_t checkEndTime, const int startHHmm, const int endHHmm, const int minDuration);

	/** 判断时间段[checkStartTime,checkEndTime]与相对时间[targetStartHHmm,targetEndHHmm]是否存在交集
	* checkStartTime 检查的开始时间
	* checkEndTIme 检查的结束时间
	* targetStartHHmm 区间开始（分钟数）如480 = "08:00"
	* targetEndHHmm 区间结束
	*/
	static bool IsTimesCovered(const time_t checkStartTime, const time_t checkEndTime, const int targetStartHHmm, const int targetEndHHmm);


	/** 判断时间段[checkStartTime,checkEndTime]与[targetStartTime,targetEndTime]是否存在交集
	* checkStartTime 检查的开始时间(时间戳)
	* checkEndTIme 检查的结束时间(时间戳)
	* targetStartTime 区间开始时间(时间戳)
	* targetEndTime 区间结束时间(时间戳)
	*/
	static bool IsAbsoluteTimesCovered(const time_t checkStartTime, const time_t checkEndTime, const time_t targetStartTime, const time_t targetEndTime);

	/** 判断时间段[checkStartTime,checkEndTime]与[targetStartTime,targetEndTime]是否存在交集
	* checkStartTime 检查的开始时间(时间戳)
	* checkEndTIme 检查的结束时间(时间戳)
	* targetStartTime 区间开始时间(时间戳)
	* targetEndTime 区间结束时间(时间戳)
	*/
	static bool IsAbsoluteTimesInRange(const time_t checkStartTime, const time_t checkEndTime, const time_t targetStartTime, const time_t targetEndTime);

	static bool isTimeInMonthDayRange(const time_t time, const std::string mmddStart, const std::string mmddEnd);

	static bool isTimeInMonthDayRange(const time_t time, const int startMonth, const int startDay, const int endMonth, const int endDay);

	/*
	* 将时间戳转化成'yyyy-mm-dd HH:mm:ss'格式时间字符串
	*/
	static std::string Format(const time_t timestamp, const std::string format="yyyy-mm-dd HH:mm:ss");

	/*
	* 是否为闰年
	* @param year 年份，例如：2024
	* @return true:闰年, false: 非闰年
	*/
	static bool IsLeapYear(const int year);

	/**
	* 获得某年的天数
	* @param year 年份，例如：2024
	* @return 某年天数，取值范围：365-366
	*/
	static int DaysInYear(const int year);

	/**
	* 获得某年某月的天数
	* @param year 年份，例如：2024
	* @param month 月份，取值：1-12
	* @return 月份天数，取值范围：1-31
	*/
	static int DaysInMonth(const int year, const int month);

	/**
	* 获得时间段内的完整天数
	* @param startTimeLoc
	* @param endTimeLoc
	* @return 天数
	*/
	static int GetWholeDayNumber(const time_t startTimeLoc, const time_t endTimeLoc);

	//获得年份
	static int GetYear(const time_t timestamp);

	//获得月份
	static int GetMonth(const time_t timestamp);

	//获得天
	static int GetDay(const time_t timestamp);

	//判断是否同一月
	static bool IsSameMonth(const time_t t1, const time_t t2);
	static bool IsSameMonth(const time_t t1, const time_t t2, const int offsetTZMinutes);

	/**
	* 判断时间段[startTimeUtc,endTimeUtc]是否跨月
	*/
	static bool IsCrossMonths(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinutes);


	/**
	* 判断时间段[startTimeUtc,endTimeUtc]是否跨天
	*/
	static bool IsCrossDays(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinutes);

	/*
	* 判断是否是工作日（周一到周五）
	*/
	static bool IsWeekday(const time_t localTime);

	/*
	* 判断是否是周末（周六到周日）
	*/
	static bool IsWeekend(const time_t localTime);

	/*
	* 获取当天0点到当前时间的分钟数，一天最大1440，返回值：[0,1439)直接整数
	* 例如：timestamp=1730996460 时间：2024/11/07 16:21:00，返回：16:21转换成分钟数16*60+21=981
	*/
	static int GetMinutesFromMidnight(const time_t timestamp);

	/*
	* 获得完整时间
	* @param yyyymmdd: 格式：yyyy-mm-dd，例如：2020-01-01
	* @param hhMM: 格式: HH:mm, 例如：08:00
	* @return 时间戳
	*/
	static time_t GetFullTime(const std::string& yyyymmdd, const std::string& hhMM);

	/*
	* 获得星期几
	* @param time_t
	*/
	static int GetDayOfWeekend(const time_t timestamp);

	/*
	* 判断时间是不是当日最后一分钟。
	* 例如：2025/01/01 23:59:00 返回 true，2025/01/01 23:59:01 返回 true, 2025/01/01 23:59:59 返回 true
	*  2025/01/01 23:58:59 返回 false, 2025/01/02 00:00:00 返回 false
	* @return 若是最后一分钟则返回 true，否则返回 false
	*/
	static bool IsLastMinuteOfDay(const time_t timestamp, const int offsetTZMinutes = 0);

	/*
	* 判断时间是不是当日最后一分钟。
	* 例如：2025/01/01 23:59:59 返回 true，2025/01/01 23:59:00 返回 false, 2025/01/01 23:59:58 返回 false
	* @return 若是最后一分钟则返回 true，否则返回 false
	*/
	static bool IsLastSecondOfDay(const time_t timestamp, const int offsetTZMinutes = 0);

	//计算[startTime,endTime]包含[HH:mm,HH:mm]的数量。
	//例如：计算本地夜晚天数 时间段[2010-10-05 10:00,2010-10-10 23:00] 本地夜晚 [22:00, 05:00]，返回天数
	static int GetTimePeriodNum(const time_t startTime, const time_t endTime, const int startHHmm, const int endHHmm);

	//检查开始时间[startTime,endTime]和[startTime2, endTime2] 均覆盖相对时间 [targetStartHHmm,targetEndHHmm]，并且是连续则返回true
	//案例1：[2025/9/5 21:00, 2025/9/6 06:00] 和 [2025/9/6 12:10, 2025/9/6 22:00] 覆盖时间[22:00, 06:00]，并且是连续则返回true
	//案例2：[2025/9/5 21:00, 2025/9/6 06:00] 和 [2025/9/6 12:10, 2025/9/6 21:59] 由于第二个时间段未覆盖时间[22:00, 06:00]，返回false
	//案例3：[2025/9/5 21:00, 2025/9/6 06:00] 和 [2025/9/7 12:10, 2025/9/7 22:00] 覆盖时间[22:00, 06:00]，但连续则返回false (因为中间还有一个[2025/9/6 22:00, 2025/9/7 06:00])
	static bool IsConsecutive(const time_t startTime, const time_t endTime, const time_t startTime2, const time_t endTime2, const int targetStartHHmm, const int targetEndHHmm);

	/*
	* 按天切分时间段，并统计时长。结果累计到mResults中
	* @param mResults map<localDay, 切分到localDay的时长(秒)> [startTimeUtc,endTimeUtc]切分到localDay时长会被累计到mResults中
	* @param startTimeUtc 开始时间(UTC)
	* @param endTimeUtc 结束时间(UTC)
	* @param offsetTZMinutes 时区
	*/
	static void GetAccumulatedDurationByDay(std::map<time_t, int>& mResults, const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinutes);

	/*
	* 获取时间段和区间的重叠时长
	* @param startTimeUtc 开始时间（UTC）
	* @param endTimeUtc 结束时间（UTC）
	* @param startMinute 区间开始时间HH:mm to minute
	* @param endMinute 区间结束时间HH:mm to minute
	* @param offsetTZMinutes 时区
	*/
	static int GetOverlapDuration(const time_t startTimeUtc, const time_t endTimeUtc, const int startMinute, const int endMinute, const int offsetTZMintes);

public:

    //获得当天0点到当前时间的分钟数，一天最大1440，返回值：[0,1439)整数
	static inline int GetDayMinutes(const time_t timestamp) {
		return (int)(timestamp - timestamp / (24 * 3600) * (24 * 3600)) / 60;
	}

	/*
	* 时间戳转换成日历，时区UTC
	*/
	static int gmtime(struct tm* const tm, time_t const* const time);

	/*
	* 日历转换成时间戳，时区UTC
	*/
	static time_t mkgmtime(struct tm* const tm);

private:
	//返回-1表示不支持
	static int GetUnit(const ChronoUnit chronoUnit);

	/*
	* 将时间戳转化成特定格式时间字符串
	*/
	static void Format(const time_t utc, char * buf, int bufsize, const char * format);


	static int getOverlapMinutes(int a1, int a2, int b1, int b2);
};

#endif //_TIMEUTILS_H_
