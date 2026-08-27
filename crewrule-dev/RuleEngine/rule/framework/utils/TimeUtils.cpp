#include "TimeUtils.h"
#ifndef _WIN32
#define _snprintf	snprintf
#define _mkgmtime timegm
#endif

#include <cstring>
#include <iomanip>
#include <sstream>
#include "time64.h"
#include "Utility.h"
#include "UtilFunc.h"

void TimeUtils::GetAbsoluteTime(time_t& startTime, time_t& endTime,
	const time_t baseTime, const std::string& startTimeHHmm, const std::string& endTimeHHmm) {
	struct tm tm{};
	TimeUtils::gmtime(&tm, &baseTime);

	tm.tm_hour = 0;
	tm.tm_min = 0;
	tm.tm_sec = 0;

	struct tm tm2{};
	std::istringstream ss(startTimeHHmm);
	ss >> std::get_time(&tm2, "%H:%M");
	//strptime(startTimeHHmm.c_str(), "%H:%M", &tm2);
	tm.tm_hour = tm2.tm_hour;
	tm.tm_min = tm2.tm_min;
	startTime = TimeUtils::mkgmtime(&tm);

	std::istringstream ss2(endTimeHHmm);
	ss2 >> std::get_time(&tm2, "%H:%M");
	//strptime(endTimeHHmm.c_str(), "%H:%M", &tm2);

	tm.tm_hour = tm2.tm_hour;
	tm.tm_min = tm2.tm_min;
	endTime = TimeUtils::mkgmtime(&tm);
	if (endTime < startTime) {
		//处理跨天
		endTime += 24*60*60;
	}
}

void TimeUtils::GetAbsoluteTime(time_t& startTime, time_t& endTime,
	const time_t baseTime, const int startTimeHHmm, const int endTimeHHmm) {

	time_t baseDay = baseTime - baseTime % (time_t)(3600 * 24);

	time_t targetStartTime = 0, targetEndTime = 0;
	time_t targetStartTime2 = 0, targetEndTime2 = 0;
	startTime = baseDay + (time_t)startTimeHHmm * 60;
	if (endTimeHHmm >= startTimeHHmm) {
		endTime = baseDay + (time_t)endTimeHHmm * 60;
	}
	else {
		//targetStartHHmm和targetEndHHmm出现跨天
		endTime = baseDay + (time_t)24 * 60 * 60 + (time_t)endTimeHHmm * 60;
	}
}

std::vector<std::tuple<time_t, time_t>> TimeUtils::GetOverlapPeriods(const time_t startTimeUtc, const time_t endTimeUtc,
	const int startTimeHHmm, const int endTimeHHmm, const int offsetTZMinutes) {
	std::vector<std::tuple<time_t, time_t>> results;

	// Check if input range is valid
	if (startTimeUtc > endTimeUtc) {
		return results;
	}

	// Convert UTC times to local times for calculations
	time_t localStartTime = startTimeUtc + offsetTZMinutes * 60;
	time_t localEndTime = endTimeUtc + offsetTZMinutes * 60;

	// Determine the range of days to check
	time_t startDay = localStartTime - localStartTime % (time_t)(24 * 60 * 60);
	time_t endDay = localEndTime - localEndTime % (time_t)(24 * 60 * 60);

	// For the iteration, we need to consider that cross-day periods might span multiple days
	// So we need to check from the day that contains the first possible period to the day that contains the last possible period

	// Start from the day that might contain the first possible overlap
	time_t currentDay = startDay;

	// For cross-day periods, we might need to start checking from the previous day
	bool isCrossDay = endTimeHHmm < startTimeHHmm;
	if (isCrossDay) {
		time_t prevDay = startDay - 24 * 60 * 60;
		time_t prevDayStart = prevDay + (time_t)startTimeHHmm * 60;
		time_t prevDayEnd = prevDay + (time_t)24 * 60 * 60 + (time_t)endTimeHHmm * 60;

		// If the previous day's period could overlap with our range, start from there
		if (prevDayStart <= localEndTime && prevDayEnd >= localStartTime) {
			currentDay = prevDay;
		}
	}

	// Iterate through possible days to find all overlapping periods
	// Continue until we're well past any possible overlap
	time_t maxCheckDay = endDay + 2 * (24 * 60 * 60);  // Add extra buffer to handle cross-day ranges

	while (currentDay <= maxCheckDay) {
		// Calculate the current day's period in local time
		time_t currentDailyStart = currentDay + (time_t)startTimeHHmm * 60;
		time_t currentDailyEnd;
		if (endTimeHHmm >= startTimeHHmm) {
			currentDailyEnd = currentDay + (time_t)endTimeHHmm * 60;
		}
		else {
			// Handle cross-day case (e.g., 22:00 to 05:00 next day)
			currentDailyEnd = currentDay + (time_t)24 * 60 * 60 + (time_t)endTimeHHmm * 60;
		}

		// Check if there is an overlap between [localStartTime, localEndTime] and [currentDailyStart, currentDailyEnd]
		if (currentDailyStart <= localEndTime && currentDailyEnd >= localStartTime) {
			// There is an overlap in local time
			time_t localOverlapStart = currentDailyStart;
			time_t localOverlapEnd = currentDailyEnd;

			// Convert back to UTC and add to results
			results.push_back(std::make_tuple(localOverlapStart - offsetTZMinutes * 60, localOverlapEnd - offsetTZMinutes * 60));
		}

		// Move to the next day
		currentDay += 24 * 60 * 60;

		// Prevent infinite loops
		if (results.size() > 1000) break;
	}

	return results;
}

time_t TimeUtils::Truncate(const time_t localTime, const ChronoUnit chronoUnit) {
	return Truncate(localTime, 0, chronoUnit);
}

time_t TimeUtils::Truncate(const time_t utcTime, const int offsetTZMinute, const ChronoUnit chronoUnit) {
	struct tm tm{};
	time_t time = utcTime + offsetTZMinute * 60;
	TimeUtils::gmtime(&tm, &time);

	if (chronoUnit & ChronoUnit::SECONDS) {
		tm.tm_sec = 0;
	}
	if (chronoUnit & ChronoUnit::MINUTES) {
		tm.tm_sec = 0;
		tm.tm_min = 0;
	}
	if (chronoUnit & ChronoUnit::HOURS) {
		tm.tm_sec = 0;
		tm.tm_min = 0;
	}
	if (chronoUnit & ChronoUnit::DAYS) {
		tm.tm_sec = 0;
		tm.tm_min = 0;
		tm.tm_hour = 0;
	}
	if (chronoUnit & ChronoUnit::YEARS) {
		tm.tm_sec = 0;
		tm.tm_min = 0;
		tm.tm_hour = 0;
		tm.tm_mday = 1;
		tm.tm_mon = 0;
		//tm.tm_year = 1900;
	}
	if (chronoUnit & ChronoUnit::MONTHS) {
		tm.tm_sec = 0;
		tm.tm_min = 0;
		tm.tm_hour = 0;
		tm.tm_mday = 1;

	} else if (chronoUnit & ChronoUnit::WEEKS) {
		tm.tm_sec = 0;
		tm.tm_min = 0;
		tm.tm_hour = 0;
		return TimeUtils::mkgmtime(&tm) - tm.tm_wday * 86400;
	}
	return TimeUtils::mkgmtime(&tm) - offsetTZMinute * 60;
}

/*
* 判断是否相同年、月、日、分等
*/
bool TimeUtils::IsSame(const time_t sLocalTime, const time_t tLocalTime, const ChronoUnit chronoUnit) {
	time_t t1 = Truncate(sLocalTime, chronoUnit);
	time_t t2 = Truncate(tLocalTime, chronoUnit);
	return t1 == t2;
}

/*
* 判断是否相同时间，举例：
*	time_t time = 1677542400; // 2023-02-28 00:00:00 UTC+0
*	bool isSame = TimeUtils::IsSame(time, time + 1, ChronoUnit::DAYS);//返回true
*	std::cout << "isSame:" << isSame << std::endl;
*
*	time = 1709164800; // 2024-02-29 00:00:00 UTC+0
*	isSame = TimeUtils::IsSame(time, time + 1, ChronoUnit::DAYS);//返回true
*	std::cout << "isSame:" << isSame << std::endl;
*/
bool TimeUtils::IsSame(const time_t sUtcTime, const time_t tUtcTime, const int offsetTZMinute, const ChronoUnit chronoUnit) {
	time_t t1 = Truncate(sUtcTime, offsetTZMinute, chronoUnit);
	time_t t2 = Truncate(tUtcTime, offsetTZMinute, chronoUnit);
	return t1 == t2;
}

/**
* 添加月份，举例：
*	time_t time = 1711929600; // 2024-04-01 00:00:00 UTC+0
*	time_t time2 = TimeUtils::AddMonth(time, 10); //2025-02-01 00:00:00 UTC+0，对应时间戳：1738368000
*	std::cout << "time2:" << time2 << std::endl;
*
*	time2 = TimeUtils::AddMonth(time, -10); //2023-06-01 00:00:00 UTC+0，对应时间戳：1685577600
*	std::cout << "time2:" << time2 << std::endl;
*
*/
time_t TimeUtils::AddMonth(const time_t utcTime, const int offsetTZMinute, const int months) {
	struct tm tm {};
	time_t t = utcTime + offsetTZMinute * 60;
	TimeUtils::gmtime(&tm, &t);

	int year = tm.tm_year + 1900;
	int mon = (tm.tm_mon + 1) + months;
	int day = tm.tm_mday;
	int mdays = 0;

	while (mon < 1) {
		mon += 12;
		year--;
	}

	while (mon > 12) {
		mon -= 12;
		year++;
	}

	mdays = DaysInMonth(year, mon);

	if (day > mdays) {
		if (months < 0) day = mdays - (day - mdays);
		else {
			day -= mdays;
			mon++;
			if (mon > 12) {
				year++;
				mon = 1;
			}
		}
	}

	tm.tm_year = year - 1900;
	tm.tm_mon = mon - 1;
	tm.tm_mday = day;
	return TimeUtils::mkgmtime(&tm) - offsetTZMinute * 60;
}

time_t TimeUtils::getEndOfMonth(time_t startOfYear, int month) {
	// 校验月份合法性
	if (month < 1 || month > 12) {
		return startOfYear;
	}

	// 将年初时间戳转换为tm结构体（本地时间）
	tm yearStart = *localtime(&startOfYear);

	// 构造目标月份的下一个月第一天0点的tm结构体
	tm nextMonthFirstDay = {};
	nextMonthFirstDay.tm_year = yearStart.tm_year;  // 继承年份（tm_year是从1900年开始的偏移）
	nextMonthFirstDay.tm_mon = month;               // tm_mon是0-11，month=11（11月）时，tm_mon=11对应12月
	nextMonthFirstDay.tm_mday = 1;                  // 1号
	nextMonthFirstDay.tm_hour = 0;
	nextMonthFirstDay.tm_min = 0;
	nextMonthFirstDay.tm_sec = 0;
	nextMonthFirstDay.tm_isdst = -1;                // 自动检测夏令时

	// 将tm结构体转换为time_t（下一个月第一天0点）
	time_t nextMonthStart = mktime(&nextMonthFirstDay);

	// 减1秒，得到目标月份最后一秒
	time_t endOfMonth = nextMonthStart - 1;

	return endOfMonth;
}

/**
* 添加周，举例：
*	time_t time = 1711929600; // 2024-04-01 00:00:00 UTC+0
*	time_t time2 = TimeUtils::AddWeek(time, 2); //2024-04-15 00:00:00 UTC+0，对应时间戳：1713139200
*	std::cout << "time2:" << time2 << std::endl;
*
*	time2 = TimeUtils::AddWeek(time, -2); //2023-03-18 00:00:00 UTC+0，对应时间戳：1710720000
*	std::cout << "time2:" << time2 << std::endl;
*/
time_t TimeUtils::AddWeek(const time_t time, const int weeks) {
	return AddDay(time, weeks * 7);
}

time_t TimeUtils::AddDay(const time_t time, const int days) {
	return time + (time_t)days * 24 * 60 * 60;
}

int TimeUtils::DiffDay(const time_t startTime, const time_t endTime) {
	return static_cast<int>(endTime - startTime) / (24*60*60);
}

int TimeUtils::DiffCalendarDay(const time_t startTime, const time_t endTime) {
	return static_cast<int>(endTime/((time_t)(24 * 60 * 60)) - startTime/((time_t)(24 * 60 * 60)) + 1);
}

int TimeUtils::DiffMonth(const time_t startTime, const time_t endTime, const int offsetTZMinutes) {
	struct tm startTm {};
	time_t _startTime = startTime + (time_t)offsetTZMinutes * 60;
	TimeUtils::gmtime(&startTm, &_startTime);

	struct tm endTm {};
	time_t _endTime = endTime + (time_t)offsetTZMinutes * 60;
	TimeUtils::gmtime(&endTm, &_endTime);

	// 计算年份差和月份差
	int startYear = startTm.tm_year + 1900;
	int startMonth = startTm.tm_mon + 1;
	int endYear = endTm.tm_year + 1900;
	int endMonth = endTm.tm_mon + 1;

	return (endYear * 12 + endMonth) - (startYear * 12 + startMonth);
}

int TimeUtils::DiffCalendarMonth(const time_t startTime, const time_t endTime, const int offsetTZMinutes) {
	return DiffMonth(startTime, endTime, offsetTZMinutes) + 1;
}

bool TimeUtils::IsSameDay(const time_t& startTime, const time_t& endTime) {
	int day1 = static_cast<int>(startTime / (24 * 60 * 60));
	int day2 = static_cast<int>(endTime / (24 * 60 * 60));
	return day1 == day2;
}


/**
 * @brief 计算两个时间之间的完整天数
 *
 * @param time1 第一个时间点（time_t格式，UTC时间）
 * @param time2 第二个时间点（time_t格式，UTC时间）
 * @return int 两个时间点之间的完整天数（总是正数或零）
 */
int TimeUtils::CalculateFullDaysBetweenTimes(const time_t& time1, const time_t& time2, const int offsetTZMinutes) {
	
	// 转换回time_t（UTC时间）
	time_t time1Loc = time1 + (time_t)offsetTZMinutes * 60;
	time_t time2Loc = time2 + (time_t)offsetTZMinutes * 60;

	time_t date1 = GetStartTimeOfDay(time1Loc);
	time_t date2 = GetStartTimeOfDay(time2Loc);
	if (time2Loc - date2 == 23 * 3600 + 59 * 60) {
		date2 += 24 * 3600;
	}
    // 非0点开始的任务，将后一天的0点作为开始
    if (date1 != time1Loc)
        date1 += 24 * 3600;
	// 计算完整天数
	const int seconds_per_day = 24 * 60 * 60;
	double diff = difftime(date2, date1);
	int days_diff = static_cast<int>(diff / seconds_per_day);

	return std::max(0, days_diff);
}

std::vector<std::tuple<time_t,time_t>> TimeUtils::GetFullDaysBetweenTimes(const time_t time1, const time_t time2, const int offsetTZMinutes) {
	std::vector<std::tuple<time_t,time_t>> fullDays;
	
	// 转换回time_t（UTC时间）
	time_t time1Loc = time1 + (time_t)offsetTZMinutes * 60;
	time_t time2Loc = time2 + (time_t)offsetTZMinutes * 60;

	time_t date1 = GetStartTimeOfDay(time1Loc);
	time_t date2 = GetStartTimeOfDay(time2Loc);
    // 非0点开始的任务，将后一天的0点作为开始
    if (date1 != time1Loc)
        date1 += 24 * 3600;
	// 计算完整天数
	const int seconds_per_day = 24 * 60 * 60;
	double diff = difftime(date2, date1);
	int days_diff = static_cast<int>(diff / seconds_per_day);
	days_diff = std::max(0, days_diff);
	// 生成完整天的时间段
	for (int i = 0; i < days_diff; i++) {
		time_t day_start = date1 + i * seconds_per_day;
		time_t day_end = day_start + seconds_per_day - 1; // 一天的最后一秒
		fullDays.push_back(std::make_tuple(day_start, day_end));
	}

	return fullDays;
}

int TimeUtils::GetCalendarDaysInBetween(const time_t startTime, const time_t endTime, const int offsetTZMinutes) {
	// 1. 校验时间戳有效性（time_t最小值通常为-1，代表无效）
	if (startTime == (time_t)-1 || endTime == (time_t)-1) {
		return -1;
	}

	// 2. 若结束时间≤开始时间，无间隔，返回0
	if (endTime <= startTime) {
		return 0;
	}

	time_t startTimeLoc = startTime + (time_t)offsetTZMinutes * 60;
	time_t endTimeLoc = endTime + (time_t)offsetTZMinutes * 60;

	// 3. 核心逻辑：时间戳除以86400（24*60*60）得到从epoch开始的天数
	const int SECONDS_PER_DAY = 24 * 60 * 60;
	long long start_day = (long long)startTimeLoc / SECONDS_PER_DAY;
	long long end_day = (long long)endTimeLoc / SECONDS_PER_DAY;

	// 4. 计算总天数差（包含起止），再减1（排除开始和结束日期）
	long long total_days = end_day - start_day;
	int interval_days = (int)total_days - 1;

	// 5. 边界处理：确保返回值≥0
	return (interval_days < 0) ? 0 : interval_days;
}

bool TimeUtils::isHHmm(const char * str) {
	int i = 0, j = 0, len = 0, count = 0, index = 0;
	if (str == NULL)
		return false;

	count = 0;
	len = (int)strlen(str);

	//mantis#3153, 修正允许小时超出 100
	//除冒号外都是数字
	for (i = 0; i < len; i++) {
		char ch = str[i];
		if (i == 0 && ch == '-') {
			//负数继续
			continue;
		}
		if ((ch < '0' || ch > '9') && ch != ':') {
			return false;
		}
		if (ch == ':') {
			count++;
			index = i;
		}
	}

	//收尾冒号不合法
	if (index == 0 || index == len - 1)
		return false;

	return true;
}

int TimeUtils::hhmmToMinutes(const std::string& str) {
	return hhmmToMinutes(str.c_str());
}

int TimeUtils::hhmmToMinutes(const char * str) {
	int i = 0, len = 0, hh = 0, mm = 0;
	bool afterColon = false;
	if (!isHHmm(str))
		return -1;
	len = (int)strlen(str);
	bool isNegative = false;
	for (i = 0; i < len; i++) {
		char ch = str[i];
		if (i == 0 && ch == '-') {
			isNegative = true;
			continue;
		}
		if (ch == ':') {
			afterColon = true;
		}
		else if (afterColon) {
			mm = mm * 10 + ch - '0';
		}
		else {
			hh = hh * 10 + ch - '0';
		}
	}
	return (isNegative ? -1 : 1) * (hh * 60 + mm);
}

std::string TimeUtils::MinutesTohhmm(const int minutes) {
	bool isNegative = (minutes < 0);
	int tmpMinutes = isNegative ? -1 * minutes : minutes;

	int hh = (tmpMinutes) / 60;
	int mm = (tmpMinutes) % 60;

	std::stringstream ss;
	if (isNegative) {
		ss << "-";
	}
	if (hh < 10)
		ss << "0";
	ss << hh << ":";
	if (mm < 10)
		ss << "0";
	ss << mm;
	return ss.str();
}

int TimeUtils::GetDurationOfHHmm(const std::string& startHHmm, const std::string& endHHmm) {
	int start = hhmmToMinutes(startHHmm);
	int end = hhmmToMinutes(endHHmm);
	return GetDurationOfHHmm(start, end);
}

int TimeUtils::GetDurationOfHHmm(const int startMinutesOfDay, const int endMinutesOfDay) {
	int duration = 0;
	int start = startMinutesOfDay;
	int end = endMinutesOfDay;
	if (start < 0) {
		start = 0;
	}
	if (end < 0) {
		end = 0;
	}

	if (end >= start) {
		//未跨夜
		duration = end - start;
	}
	else {
		//跨夜
		duration = (24 * 60 - start) + end;
	}
	return duration;
}

int TimeUtils::GetDuration(const time_t startTime, const time_t endTime, const int restStartHHmm, const int restEndHHmm) {
	// 首先计算总时长
	int totalDuration = static_cast<int>(endTime - startTime);
	if (totalDuration <= 0) {
		return 0;
	}
	if (restStartHHmm == -1 || restEndHHmm == -1) {
		return totalDuration;
	}

	// 计算扣除的午休时间
	int subtraction = 0;
	//struct tm startTm;
	//struct tm endTm;
	//TimeUtils::gmtime(&startTm, &startTime);
	//TimeUtils::gmtime(&endTm, &endTime);

	time_t currentDay = (startTime / (time_t)(24 * 60 * 60)) * 24 * 60 * 60; //开始天的0点
	//struct tm current = startTm;
	time_t currentTime = startTime;

	while (currentTime <= endTime) {
		//当天午休开始和结束
		time_t lunchStartTime = currentDay + (time_t)restStartHHmm * 60;
		time_t lunchEndTime = currentDay + (time_t)restEndHHmm * 60;
		if (restEndHHmm < restStartHHmm) {
			//跨夜
			lunchEndTime += (time_t)24 * 60 * 60;
		}

		if (currentTime < lunchEndTime && endTime > lunchStartTime) {
			// 计算重叠部分
			time_t overlapStart = (currentTime > lunchStartTime) ? currentTime : lunchStartTime;
			time_t overlapEnd = (endTime < lunchEndTime) ? endTime : lunchEndTime;
			subtraction += static_cast<int>(overlapEnd - overlapStart);
		}

		// 移动到下一天
		currentTime = currentTime + (time_t)24 * 60 * 60;
	}

	// 返回扣除后的时长
	return totalDuration - subtraction;
}

int TimeUtils::GetDurationAfterHHmm(const time_t startTime, const time_t endTime, const int afterHHmm) {
	int totalDuration = 0;
	time_t startTimeAfterHHmm = (startTime / ((time_t)(24 * 60 * 60))) * 24 * 60 * 60 + (time_t)afterHHmm * 60;
	if (startTimeAfterHHmm >= startTime) {
		totalDuration = static_cast<int>(endTime - startTimeAfterHHmm);
	}
	else {
		totalDuration = static_cast<int>(endTime - startTime);
	}
	if (totalDuration <= 0) {
		return 0;
	}
	return totalDuration;
}

//根据time_t计算对应日期的开始时间，即00:00
time_t TimeUtils::GetStartTimeOfDay(const time_t utc) {
	time_t startOfDay = 0;
	time_t t = utc;
	tm  m = { 0 };
	TimeUtils::gmtime(&m, &t);

	startOfDay = utc - m.tm_hour * 3600 - m.tm_min * 60 - m.tm_sec;

	//快速计算当日0点，方法如下：
	//time_t startOfDay = (utc / ((time_t)(24 * 60 * 60))) * 24 * 60 * 60; 
	return startOfDay;
}

//计算time_t时间段对应天数
int TimeUtils::GetDaysByDuration(const time_t utcBeg, const time_t utcEnd) {
	int days = 0;
	time_t startOfBeg = 0;
	time_t startOfEnd = 0;

	startOfBeg = GetStartTimeOfDay(utcBeg);
	startOfEnd = GetStartTimeOfDay(utcEnd);

	days = static_cast<int>(startOfEnd - startOfBeg) / (24 * 3600);
	return days;
}

ChronoUnit TimeUtils::FromSlideUnit(const std::string& slideUnit) {
	if (slideUnit == "RH") {
		return ChronoUnit::HOURS;
	}
	else if (slideUnit == "CD") {
		return ChronoUnit::DAYS;
	}
	return ChronoUnit::UNKNOWN;
}

//时间向下取整，
//例如：
//      Floor(2023-1-1 10:40:29, ChronoUnit.HOURS) = 2023-1-1 10:00
//      Floor(2023-1-1 10:00:00, ChronoUnit.HOURS) = 2023-1-1 10:00
//      Floor(2023-1-1 10:40:29, ChronoUnit.DAYS) = 2023-1-1 00:00
//      Floor(2023-1-1 00:00:00, ChronoUnit.DAYS) = 2023-1-1 00:00:00
time_t TimeUtils::Floor(const time_t time, const ChronoUnit chronoUnit) {
	//TODO by hexd
	time_t result = time;
	int unit = GetUnit(chronoUnit);
	if (unit == -1) {
		//月和年暂时不支持
		//if (chronoUnit == ChronoUnit::MONTHS) {
		//	unit = 30 * 7 * 24 * 60 * 60; //月计算存在BUG
		//}
		//else if (chronoUnit == ChronoUnit::YEARS) {
		//	unit = 365 * 24 * 60 * 60; //年计算存在BUG
		//}
		return result;
	}

	int diff = time % unit;
	if (diff != 0) {
		result = time - diff;
	}
	return result;
}

//时间向上取整，
//例如：
//	 Ceil(2023-1-1 10:40:29, ChronoUnit.HOURS) = 2023-1-1 11:00
//   Ceil(2023-1-1 10:40:29, ChronoUnit.DAYS) = 2023-1-2 00:00
time_t TimeUtils::Ceil(const time_t time, const ChronoUnit chronoUnit) {
	//TODO by hexd
	time_t result = time;
	int unit = GetUnit(chronoUnit);

	if (unit == -1) {
		//月和年暂时不支持
		//if (chronoUnit == ChronoUnit::MONTHS) {
		//	unit = 30 * 7 * 24 * 60 * 60; //月计算存在BUG
		//}
		//else if (chronoUnit == ChronoUnit::YEARS) {
		//	unit = 365 * 24 * 60 * 60; //年计算存在BUG
		//}
		return result;
	}

	int diff = time % unit;
	if (diff != 0) {
		result = time - diff + unit;
	}

	return result;
}

time_t TimeUtils::Floor(const time_t utcTime, const int offsetTZMinute, const ChronoUnit chronoUnit) {
	//算法如下：本地时区： Asia/Shanghai UTC + 8
	// 2024-01-09 10:12:00 UTC 
	//-> 2024-01-09 18:12:00 LOC 转化成本地时间 ->	2024-01-10 00:00:00 LOC DAY 本地时间向上取整天
	//-> 2024-01-09 10:12:00 UTC + （2024-01-10 00:00:00 LOC DAY - 2024-01-09 18:12:00 LOC） 最终UCT结果
	time_t localTime = utcTime + offsetTZMinute * 60;
	time_t localTimeFloor = Floor(localTime, chronoUnit);
	return utcTime + (localTimeFloor - localTime);
}


time_t TimeUtils::Ceil(const time_t utcTime, const int offsetTZMinute, const ChronoUnit chronoUnit) {
	//算法如下：本地时区： Asia/Shanghai UTC + 8
	// 2024-01-09 10:12:00 UTC 
	//-> 2024-01-09 18:12:00 LOC 转化成本地时间 ->	2024-01-09 00:00:00 LOC DAY 本地时间向下取整天
	//-> 2024-01-09 10:12:00 UTC + （2024-01-09 00:00:00 LOC DAY - 2024-01-09 18:12:00 LOC） 最终UCT结果
	time_t localTime = utcTime + offsetTZMinute * 60;
	time_t localTimeCeil = Ceil(localTime, chronoUnit);
	return utcTime + (localTimeCeil - localTime);
}

int TimeUtils::GetUnit(const ChronoUnit chronoUnit) {
	int unit = 1;
	if (chronoUnit == ChronoUnit::MINUTES) {
		unit = 60;
	}
	else if (chronoUnit == ChronoUnit::HOURS) {
		unit = 60 * 60;
	}
	else if (chronoUnit == ChronoUnit::DAYS) {
		unit = 24 * 60 * 60;
	}
	else if (chronoUnit == ChronoUnit::WEEKS) {
		unit = 7 * 24 * 60 * 60;
	}
	else if (chronoUnit == ChronoUnit::MONTHS) {
		unit = -1; // 30 * 7 * 24 * 60 * 60; //月计算存在BUG
	}
	else if (chronoUnit == ChronoUnit::YEARS) {
		unit = -1; // 365 * 24 * 60 * 60; //年计算存在BUG
	}
	return unit;
}

bool TimeUtils::IsTimesInRange(const time_t checkTime, const int startHHmm, const int endHHmm) {
	int hhmm = checkTime % (3600 * 24) / 60;

	return IsTimesInRange(hhmm, startHHmm, endHHmm);
}

bool TimeUtils::IsTimesInRange(const int checkHHmm, const time_t startTime, const time_t endTime) {
	int startHHmm = startTime % (3600 * 24) / 60;
	int endHHmm = endTime % (3600 * 24) / 60;

	return IsTimesInRange(checkHHmm, startHHmm, endHHmm);
}

bool TimeUtils::IsTimesInRange(const int checkHHmm, const int startHHmm, const int endHHmm) {
	if (endHHmm < startHHmm) { // 时间范围跨天
		return checkHHmm >= startHHmm || checkHHmm <= endHHmm;
	}
	return checkHHmm >= startHHmm && checkHHmm <= endHHmm;
}

bool TimeUtils::IsTimesInRange(const time_t checkStartTime, const time_t checkEndTime, const int startHHmm, const int endHHmm, const int minDuration) {
	if (checkEndTime > checkStartTime
		&& IsTimesInRange(checkStartTime, startHHmm, endHHmm) && IsTimesInRange(checkEndTime, startHHmm, endHHmm)
		&& (checkEndTime - checkStartTime) >= (time_t)minDuration * 60) {
		return true;
	}
	return false;
}

bool TimeUtils::IsTimesCovered(const time_t checkStartTime, const time_t checkEndTime, const int targetStartHHmm, const int targetEndHHmm) {
	//转换成绝对时间进行比较,将[targetStartHHmm,targetEndHHmm]映射到2天绝对时间进行比较（跨天2天为一个周期）
	time_t checkStartDay = checkStartTime - checkStartTime % ((time_t)(3600 * 24));

	time_t targetStartTime = 0, targetEndTime = 0;
	time_t targetStartTime2 = 0, targetEndTime2 = 0;
	if (targetEndHHmm >= targetStartHHmm) {
		//第一天
		targetStartTime = checkStartDay + (time_t)targetStartHHmm * 60;
		targetEndTime = checkStartDay + (time_t)targetEndHHmm * 60;
		//第二天
		targetStartTime2 = checkStartDay + (time_t)24 * 60 * 60 + (time_t)targetStartHHmm * 60;
		targetEndTime2 = checkStartDay + (time_t)24 * 60 * 60 + targetEndHHmm * 60;
	}
	else {
		//targetStartHHmm和targetEndHHmm出现跨天
		//第一天
		targetStartTime = checkStartDay - (time_t)24 * 60 * 60 + (time_t)targetStartHHmm * 60;
		targetEndTime = checkStartDay + (time_t)targetEndHHmm * 60;

		//第二天
		targetStartTime2 = checkStartDay + (time_t)targetStartHHmm * 60;
		targetEndTime2 = checkStartDay + (time_t)24 * 60 * 60 + (time_t)targetEndHHmm * 60;
	}
	return IsAbsoluteTimesCovered(checkStartTime, checkEndTime, targetStartTime, targetEndTime) ||
		 IsAbsoluteTimesCovered(checkStartTime, checkEndTime, targetStartTime2, targetEndTime2);

}

bool TimeUtils::IsAbsoluteTimesCovered(const time_t checkStartTime, const time_t checkEndTime, const time_t targetStartTime, const time_t targetEndTime) {
	return (checkStartTime >= targetStartTime && checkStartTime <= targetEndTime) ||
		(checkEndTime >= targetStartTime && checkEndTime <= targetEndTime) ||
		(targetStartTime >= checkStartTime && targetStartTime <= checkEndTime) ||
		(targetEndTime >= checkStartTime && targetEndTime <= checkEndTime);
}

bool TimeUtils::IsAbsoluteTimesInRange(const time_t checkStartTime, const time_t checkEndTime, const time_t targetStartTime, const time_t targetEndTime) {
	// 首先检查时间有效性（check的结束不能早于开始）
	if (checkStartTime > checkEndTime) {
		return false;
	}

	// 检查target的结束不能早于开始
	if (targetStartTime > targetEndTime) {
		return false;
	}

	// 检查check是否完全在target内
	return checkStartTime >= targetStartTime && checkEndTime <= targetEndTime;
}

bool TimeUtils::isTimeInMonthDayRange(const time_t time, const std::string mmddStart, const std::string mmddEnd) {
	std::vector<std::string> mmddStartStrList;
	std::vector<std::string> mmddEndStrList;
	if (mmddStart.empty() || mmddStart == "*") {
		mmddStartStrList.push_back("0");
		mmddStartStrList.push_back("0");
	}
	else {
		split(mmddStart, '-', mmddStartStrList);
	}
	if (mmddEnd.empty() || mmddEnd == "*") {
		mmddEndStrList.push_back("12");
		mmddEndStrList.push_back("31");
	}
	else {
		split(mmddEnd, '-', mmddEndStrList);
	}



	if (mmddStartStrList.size() > 1 && mmddEndStrList.size() > 1) {
		int mmStart = stoi(mmddStartStrList[0]);
		int ddStart = stoi(mmddStartStrList[1]);
		int mmEnd = stoi(mmddEndStrList[0]);
		int ddEnd = stoi(mmddEndStrList[1]);
		return isTimeInMonthDayRange(time, mmStart, ddStart, mmEnd, ddEnd);
	}
	else {
		return true;
	}
}

bool TimeUtils::isTimeInMonthDayRange(const time_t time, const int startMonth, const int startDay, const int endMonth, const int endDay) {
	// 转换为本地时间结构
	struct tm* timeinfo = localtime(&time);
	if (!timeinfo) {
		return false;
	}

	// 获取月份和日期（月份从0开始，所以需要+1）
	int currentMonth = timeinfo->tm_mon + 1;
	int currentDay = timeinfo->tm_mday;

	// 创建开始和结束的 tm 结构（使用相同年份）
	struct tm startTm = { 0 };
	struct tm endTm = { 0 };

	startTm.tm_year = timeinfo->tm_year;
	startTm.tm_mon = startMonth - 1;
	startTm.tm_mday = startDay;
	startTm.tm_hour = 0;
	startTm.tm_min = 0;
	startTm.tm_sec = 0;

	endTm.tm_year = timeinfo->tm_year;
	endTm.tm_mon = endMonth - 1;
	endTm.tm_mday = endDay;
	endTm.tm_hour = 23;
	endTm.tm_min = 59;
	endTm.tm_sec = 59;

	// end < start
	if (endMonth < startMonth || (endMonth == startMonth && endDay < startDay)) {
		endTm.tm_year = endTm.tm_year + 1;
	}

	// 转换为 time_t 进行比较
	time_t startTime = mktime(&startTm);
	time_t endTime = mktime(&endTm);

	// 检查是否在范围内
	return (time >= startTime) && (time <= endTime);
}



std::string TimeUtils::Format(const time_t timestamp, const std::string format) {
	char utcStr[30] = { 0 };
	Format(timestamp, utcStr, sizeof(utcStr), format.c_str());
	return utcStr;
}

void TimeUtils::Format(const time_t utc, char * buf, int bufsize, const char * format) {
	time_t t = utc;
	int year = 0, mon = 0, date = 0;
	int hour = 0, min = 0, sec = 0;
	int i = 0;
	char formatBuf[40] = { 0 };
	tm m = { 0 };
	//20181018 ain, mantis#4289, 外部指定缓冲 m, 避免多次函数调用共用缓冲造成问题
	gmtime_64_s(t, &m);
	year = m.tm_year + 1900;
	mon = m.tm_mon + 1;
	date = m.tm_mday;
	hour = m.tm_hour;
	min = m.tm_min;
	sec = m.tm_sec;

	strncpy(formatBuf, format, sizeof(formatBuf));
	formatBuf[sizeof(formatBuf) - 1] = '\0';
	memset(buf, 0, bufsize);
	if (0 == strncmp(formatBuf, "yyyymmdd", sizeof(formatBuf))) {
		//_snprintf(buf, bufsize, "%04d%02d%02d", year, mon, date);
		std::strftime(buf, bufsize, TimeUtils::YYYYMMDD, &m);
	}
	else if (0 == strncmp(formatBuf, "yyyy-mm-dd", sizeof(formatBuf))) {
		//_snprintf(buf, bufsize, "%04d-%02d-%02d", year, mon, date);
		std::strftime(buf, bufsize, TimeUtils::YYYY_MM_DD, &m);
	}
	else if (0 == strncmp(formatBuf, "yyyy-mm-dd HH:mm:ss", sizeof(formatBuf))) {
		//_snprintf(buf, bufsize, "%04d-%02d-%02d %02d:%02d:%02d", year, mon, date, hour, min, sec);
		std::strftime(buf, bufsize, TimeUtils::YYYY_MM_DD_HH_MM_SS, &m);
	}
	else if (0 == strncmp(formatBuf, "yyyy-mm-dd HH:mm", sizeof(formatBuf))) {
		//_snprintf(buf, bufsize, "%04d-%02d-%02d %02d:%02d", year, mon, date, hour, min);
		std::strftime(buf, bufsize, TimeUtils::YYYY_MM_DD_HH_MM, &m);
	}
	else if (0 == strncmp(formatBuf, "HH:mm", sizeof(formatBuf))) {
		//_snprintf(buf, bufsize, "%02d:%02d", year, mon, date, hour, min);
		std::strftime(buf, bufsize, TimeUtils::HH_MM, &m);
	}
	else {
		//_snprintf(buf, bufsize, "%04d-%02d-%02d", year, mon, date);
		std::strftime(buf, bufsize, format, &m);
	}


}

bool TimeUtils::IsLeapYear(const int year)
{
	if (year % 4) return false;  // if not divisible by 4, not leap
	if (year % 100) return true; // by 4, but not by 100 is leap
	if (year % 400) return false;      // not by 100 and not by 400 not leap
	return true;
}

int TimeUtils::DaysInYear(const int year) {
	return IsLeapYear(year) ? 366 : 365;
}

int TimeUtils::DaysInMonth(const int year, const int month) {
	if (month < 1 || month > 12) {
		return -1; // 无效的月份
	}

	int daysInMonth;
	if (month == 2) {
		if ((year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)) {
			daysInMonth = 29; // 闰年2月有29天
		}
		else {
			daysInMonth = 28; // 平年2月有28天
		}
	}
	else if (month == 4 || month == 6 || month == 9 || month == 11) {
		daysInMonth = 30; // 四月、六月、九月、十一月有30天
	}
	else {
		daysInMonth = 31; // 其他月份有31天
	}

	return daysInMonth;
}

int TimeUtils::GetWholeDayNumber(const time_t startTimeLoc, const time_t endTimeLoc) {
	int startDay = static_cast<int>(startTimeLoc / (3600 * 24));
	int endDay = static_cast<int>(endTimeLoc / (3600 * 24));

	// 00:00特殊情况
	if (startTimeLoc % (3600 * 24) == 0) {
		return endDay - startDay;
	}
	return endDay - startDay - 1;

}

int TimeUtils::GetYear(const time_t timestamp) {
	struct tm tm {};
	TimeUtils::gmtime(&tm, &timestamp);
	return tm.tm_year + 1900;
}

int TimeUtils::GetMonth(const time_t timestamp) {
	struct tm tm {};
	TimeUtils::gmtime(&tm, &timestamp);
	return tm.tm_mon;
}

int TimeUtils::GetDay(const time_t timestamp) {
	struct tm tm {};
	TimeUtils::gmtime(&tm, &timestamp);
	return tm.tm_mday;
}

//判断是否同一月
bool TimeUtils::IsSameMonth(const time_t t1, const time_t t2) {
	return IsSameMonth(t1, t2, 0);
}

//判断是否同一月
bool TimeUtils::IsSameMonth(const time_t t1, const time_t t2, const int offsetTZMinutes) {
	struct tm tm1 {};
	time_t _t1 = t1 + (time_t)offsetTZMinutes * 60;
	TimeUtils::gmtime(&tm1, &_t1);

	struct tm tm2 {};
	time_t _t2 = t2 + (time_t)offsetTZMinutes * 60;
	TimeUtils::gmtime(&tm2, &_t2);

	return tm1.tm_year == tm2.tm_year && tm1.tm_mon == tm2.tm_mon;
}

int TimeUtils::gmtime(struct tm* const tm, time_t const* const time) {
#ifdef _WIN32
	return gmtime_s(tm, time);
#else
	return gmtime_r(time, tm) == nullptr;
#endif
}

time_t TimeUtils::mkgmtime(struct tm* const t) {
#ifdef _WIN32
    return _mkgmtime(t);
#else
	return timegm(t);
#endif


//	register short month, year;
//	register time_t result;
//	static int m_to_d[12] =	{ 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334 };
//
//	month = t->tm_mon;
//	year = t->tm_year + month / 12 + 1900;
//	month %= 12;
//	if (month < 0) {
//		year -= 1;
//		month += 12;
//	}
//	result = (year - 1970) * 365 + m_to_d[month];
//	if (month <= 1)
//		year -= 1;
//	result += (year - 1968) / 4;
//	result -= (year - 1900) / 100;
//	result += (year - 1600) / 400;
//	result += t->tm_mday;
//	result -= 1;
//	result *= 24;
//	result += t->tm_hour;
//	result *= 60;
//	result += t->tm_min;
//	result *= 60;
//	result += t->tm_sec;
//
//#ifdef WIN32
//	//TODO Test
//	time_t result2 = _mkgmtime(t);
//	if (result2 == result) {
//		std::cout << "mkgmtime:true" << std::endl;
//	}
//	//END
//#endif
//	return result;
}

/**
* 判断时间段[startTimeUtc,endTimeUtc]是否跨月
*/
bool TimeUtils::IsCrossMonths(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinutes) {
	time_t startTimeLoc = startTimeUtc + offsetTZMinutes*60;
	time_t endTimeLoc = endTimeUtc + offsetTZMinutes * 60;
	
	struct tm tmStart {};
	TimeUtils::gmtime(&tmStart, &startTimeLoc);

	struct tm tmEnd {};
	TimeUtils::gmtime(&tmEnd, &endTimeLoc);
	//tmStart.tm_year + 1900;
	return tmStart.tm_year != tmEnd.tm_year || tmStart.tm_mon != tmEnd.tm_mon;
}


/**
* 判断时间段[startTimeUtc,endTimeUtc]是否跨天
*/
bool TimeUtils::IsCrossDays(const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinutes) {
	time_t startTimeLoc = startTimeUtc + offsetTZMinutes * 60;
	time_t endTimeLoc = endTimeUtc + offsetTZMinutes * 60;

	struct tm tmStart {};
	TimeUtils::gmtime(&tmStart, &startTimeLoc);

	struct tm tmEnd {};
	TimeUtils::gmtime(&tmEnd, &endTimeLoc);
	//tmStart.tm_year + 1900;
	return tmStart.tm_year != tmEnd.tm_year || tmStart.tm_mon != tmEnd.tm_mon || tmStart.tm_mday != tmEnd.tm_mday;
}

/*
* 判断是否是工作日（周一到周五）
*/
bool TimeUtils::IsWeekday(const time_t localTime) {
	int wday = GetDayOfWeekend(localTime);
	return wday >= 1 && wday <= 5;
}

/*
* 判断是否是周末（周六到周日）
*/
bool TimeUtils::IsWeekend(const time_t localTime) {
	int wday = GetDayOfWeekend(localTime);
	return wday == 0 || wday == 6;// wday == 0 为周日
}

//获取当天0点到当前时间的分钟数
int TimeUtils::GetMinutesFromMidnight(const time_t timestamp) {
	//一天24小时秒数 86400 = 24 * 60 * 60 
	return static_cast<int>(timestamp - 86400 * (timestamp / 86400)) / 60;
}


time_t TimeUtils::GetFullTime(const std::string& yyyymmdd, const std::string& hhMM) {
	string fullTime = yyyymmdd + " " + hhMM + ":00";
	return utcStrToUtc(const_cast<char*>(fullTime.c_str()));
}

int TimeUtils::GetDayOfWeekend(const time_t timestamp) {
	struct tm tm {};
	TimeUtils::gmtime(&tm, &timestamp);

	return tm.tm_wday;
}

bool TimeUtils::IsLastMinuteOfDay(const time_t timestamp, const int offsetTZMinutes) {
	time_t localTime = timestamp + (time_t)offsetTZMinutes * 60;
	struct tm tm {};
	TimeUtils::gmtime(&tm, &localTime);
	return tm.tm_hour == 23 && tm.tm_min == 59;
}

bool TimeUtils::IsLastSecondOfDay(const time_t timestamp, const int offsetTZMinutes) {
	time_t localTime = timestamp + (time_t)offsetTZMinutes * 60;
	struct tm tm {};
	TimeUtils::gmtime(&tm, &localTime);
	return tm.tm_hour == 23 && tm.tm_min == 59 && tm.tm_sec == 59;
}

int TimeUtils::GetTimePeriodNum(const time_t startTime, const time_t endTime, const int startHHmm, const int endHHmm) {

	int numberOfPeriod = 0;
	int secondsOfDay = 3600 * 24;

	/*算法思路：首先转化成 本地时间段 [startTimeLoc, endTimeLoc]，该时间段中间每天（不包含第一天和最后一天）必然满足本地夜晚
	  因此 "本地夜晚天数" = IF("第一天满足本地夜晚", 1, 0) + IF("最后一天满足本地夜晚", 1, 0) + "中间天数"
	  备注：IF(条件，条件为true返回，条件为false返回)
	  备注：第一天 和 最后一天 是同一天 不能在累加
	*/

	//步骤1：获得开始计算第一天startDay，以及结束最后一天（结束日期）endDay
	//开始日期（本地时间：天）
	time_t startDay = (startTime / ((time_t)(24 * 60 * 60))) * 24 * 60 * 60;
	//结束日期 + 1（本地时间：天）
	time_t endDay = (endTime / ((time_t)(24 * 60 * 60))) * 24 * 60 * 60 + secondsOfDay;

	int intervalDayNums = static_cast<int>(endDay - startDay) / secondsOfDay;

	bool diffDay = false;
	if (endHHmm < startHHmm) {
		diffDay = true;
	}

	for (int i = 0; i < intervalDayNums; i++) {
		auto checkStartTime = startDay + (time_t)i * secondsOfDay + (time_t)startHHmm * 60;
		auto checkEndTime = startDay + (time_t)i * secondsOfDay + (time_t)endHHmm * 60;
		if (diffDay)
			checkEndTime += secondsOfDay;
		if (TimeUtils::IsAbsoluteTimesInRange(checkStartTime, checkEndTime, startTime, endTime)) {
			numberOfPeriod++;
		}
	}

	return numberOfPeriod;
}

bool TimeUtils::IsConsecutive(const time_t startTime, const time_t endTime, const time_t startTime2, const time_t endTime2, const int targetStartHHmm, const int targetEndHHmm) {

	time_t startDay = startTime - startTime % ((time_t)(3600 * 24));
	time_t endDay = endTime - endTime % ((time_t)(3600 * 24));
	time_t startDay2 = startTime2 - startTime2 % ((time_t)(3600 * 24));
	time_t endDay2 = endTime2 - endTime2 % ((time_t)(3600 * 24));

	//步骤1：检查[startTime,endTime]是否覆盖[targetStartHHmm,targetEndHHmm]，并记录覆盖的时间段
	time_t tmpTargetStartTime = 0, tmpTargetEndTime = 0;
	time_t tmpTargetStartTime2 = 0, tmpTargetEndTime2 = 0;
	if (targetEndHHmm >= targetStartHHmm) {
		//第一天
		tmpTargetStartTime = startDay + (time_t)targetStartHHmm * 60;
		tmpTargetEndTime = startDay + (time_t)targetEndHHmm * 60;
		//第二天
		tmpTargetStartTime2 = startDay + (time_t)24 * 60 * 60 + (time_t)targetStartHHmm * 60;
		tmpTargetEndTime2 = startDay + (time_t)24 * 60 * 60 + targetEndHHmm * 60;
	}
	else {
		//targetStartHHmm和targetEndHHmm出现跨天
		//第一天
		tmpTargetStartTime = startDay - (time_t)24 * 60 * 60 + (time_t)targetStartHHmm * 60;
		tmpTargetEndTime = startDay + (time_t)targetEndHHmm * 60;

		//第二天
		tmpTargetStartTime2 = startDay + (time_t)targetStartHHmm * 60;
		tmpTargetEndTime2 = startDay + (time_t)24 * 60 * 60 + (time_t)targetEndHHmm * 60;
	}

	time_t targetStartTime = 0, targetEndTime = 0;
	if (IsAbsoluteTimesCovered(startTime, endTime, tmpTargetStartTime2, tmpTargetEndTime2)) {
		targetStartTime = tmpTargetStartTime2;
		targetEndTime = tmpTargetEndTime2;
	}
	else if (IsAbsoluteTimesCovered(startTime, endTime, tmpTargetStartTime, tmpTargetEndTime)) {
		targetStartTime = tmpTargetStartTime;
		targetEndTime = tmpTargetEndTime;
	}
	else {
		return false;
	}

	//步骤2：检查[startTime2,endTime2]是否覆盖[targetStartHHmm,targetEndHHmm]，并记录覆盖的时间段
	tmpTargetStartTime = 0, tmpTargetEndTime = 0;
	tmpTargetStartTime2 = 0, tmpTargetEndTime2 = 0;
	if (targetEndHHmm >= targetStartHHmm) {
		//第一天
		tmpTargetStartTime = startDay2 + (time_t)targetStartHHmm * 60;
		tmpTargetEndTime = startDay2 + (time_t)targetEndHHmm * 60;
		//第二天
		tmpTargetStartTime2 = startDay2 + (time_t)24 * 60 * 60 + (time_t)targetStartHHmm * 60;
		tmpTargetEndTime2 = startDay2 + (time_t)24 * 60 * 60 + targetEndHHmm * 60;
	}
	else {
		//targetStartHHmm和targetEndHHmm出现跨天
		//第一天
		tmpTargetStartTime = startDay2 - (time_t)24 * 60 * 60 + (time_t)targetStartHHmm * 60;
		tmpTargetEndTime = startDay2 + (time_t)targetEndHHmm * 60;

		//第二天
		tmpTargetStartTime2 = startDay2 + (time_t)targetStartHHmm * 60;
		tmpTargetEndTime2 = startDay2 + (time_t)24 * 60 * 60 + (time_t)targetEndHHmm * 60;
	}

	time_t targetStartTime2 = 0, targetEndTime2 = 0;
	if (IsAbsoluteTimesCovered(startTime2, endTime2, tmpTargetStartTime, tmpTargetEndTime)) {
		targetStartTime2 = tmpTargetStartTime2;
		targetEndTime2 = tmpTargetEndTime2;
	}
	else if (IsAbsoluteTimesCovered(startTime2, endTime2, tmpTargetStartTime2, tmpTargetEndTime2)) {
		targetStartTime2 = tmpTargetStartTime;
		targetEndTime2 = tmpTargetEndTime;
	}
	else {
		return false;
	}

	//步骤3：检查[targetStartTime,targetEndTime] 和 [targetStartTime2,targetEndTime2]是否连续
	int dalendarDay = TimeUtils::DiffCalendarDay(targetStartTime, targetStartTime2);

	return dalendarDay <= 2;
}

void TimeUtils::GetAccumulatedDurationByDay(map<time_t, int>& mResults, const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinutes) {
	//开始日期(UTC时间)
	time_t localStartDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(startTimeUtc, offsetTZMinutes);
	time_t localEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(endTimeUtc, offsetTZMinutes);

	// 增加保护，只计算一年内的manday
	int iDaysBetween = min((int)((localEndDay - localStartDay) / (24 * 3600) + 1), 365);
	for (int i = 0; i < iDaysBetween; ++i)
	{
		time_t currentDay = localStartDay + (time_t)i * 24 * 3600;

		time_t currentDayStart = max(currentDay, startTimeUtc);
		time_t currentDayEnd = min(currentDay + (time_t)24 * 3600, endTimeUtc);

		if (currentDayEnd > currentDayStart) {
			int duration = static_cast<int>(currentDayEnd - currentDayStart);

			time_t currentDayLoc = currentDay + (time_t)offsetTZMinutes * 60;
			auto iter = mResults.find(currentDayLoc);
			if (iter == mResults.end()) {
				mResults.insert(std::make_pair(currentDayLoc, duration));
			}
			else {
				iter->second += duration;
			}
		}
	}
}

int TimeUtils::GetOverlapDuration(const time_t startTimeUtc, const time_t endTimeUtc, const int startMinute, const int endMinute, const int offsetTZMintes) {
	if (startTimeUtc >= endTimeUtc)
		return 0;

	time_t startTime = startTimeUtc + offsetTZMintes * 60;
	time_t endTime = endTimeUtc + offsetTZMintes * 60;

	time_t totalOverlap = 0;

	const int SECONDS_PER_DAY = 86400;
	time_t currentDay = startTime;

	while (currentDay < endTime) {
		//获取当前天的0点
		time_t dayStart = getLocalDayStartInUTC(currentDay, 0);
		time_t dayEnd = dayStart + SECONDS_PER_DAY;

		//计算当天与绝对时间段的交集
		time_t intersectStart = max(currentDay, dayStart);
		time_t intersectEnd = min(endTime, dayEnd);

		if (intersectStart >= intersectEnd) {
			currentDay = dayEnd;
			continue;
		}

		int intersectStartMin = GetDayMinutes(intersectStart);
		int intersectEndMin = GetDayMinutes(intersectEnd);

		int overlapMin = getOverlapMinutes(startMinute, endMinute, intersectStartMin, intersectEndMin);

		totalOverlap += overlapMin;

		currentDay = dayEnd;
	}
	return totalOverlap;
}

int TimeUtils::getOverlapMinutes(int a1, int a2, int b1, int b2) {
	// 处理跨天区间（如a1=1320(22:00), a2=300(05:00)）
	if (a1 > a2) {
		// 拆分为 [a1, 1439] 和 [0, a2] 两个区间
		int overlap1 = max(0, min(1439, b2) - max(a1, b1) + 1);
		int overlap2 = max(0, min(a2, b2) - max(0, b1));
		return overlap1 + overlap2;
	}
	else {
		// 普通区间
		int start = max(a1, b1);
		int end = min(a2, b2);
		return max(0, end - start);
	}
}
