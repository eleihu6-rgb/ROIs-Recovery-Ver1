#ifndef  _TIMEZONEUTILS_H_
#define _TIMEZONEUTILS_H_

#include <string>
#include "date/date.h"
#include "date/tz.h"

using namespace std::chrono;

class TimezoneUtils {

public:
	//设置时区数据库目录
	static void SetTimezoneDatabase(const std::string& path);

	//重新加载时区数据库
	static void reloadTimezoneDatabase();

	//获得本地时间
	static time_t GetLocalTime(const time_t utcTime, const std::string& zoneId);

    //通过本地时间获得UTC时间，特别注意：
	//（1）当存在夏令时，在时钟回调时间段(减少n小时)内，转换成UTC时间会存在二个时区，因此取值可能错误
	//（2）当存在夏令时，在时钟先前调的时间段(增加n小时)内，此时本地时间无UTC时间，此时返回INT_MIN值
    static time_t GetUTCTime(const time_t localTime, const std::string& localZoneId);

	//获得zoneId时区与UTC时区的分钟差，例如：utcTime = 0, zoneId = "Asia/Shanghai" 输出：480
	static int GetTimezoneOffset(const time_t utcTime, const std::string& zoneId);

	//分别以开始地点时间和结束地点时间基准，获得二个时区的时区分钟差
	static int GetTimezoneOffset(const time_t startUtcTime, const std::string& startZoneId,
		const time_t& endUtcTime, const std::string& endZoneId);

	//已开始地点时间为基准来计算，获得二个地点时区的时区分钟差
	static int GetTimezoneOffsetByStart(const time_t startUtcTime, const std::string& startZoneId,
		const std::string& endZoneId);

	//已结束地点时间为基准来计算，获得二个地点时区的时区分钟差
	static int GetTimezoneOffsetByEnd(const time_t endUtcTime, const std::string& startZoneId,
		const std::string& endZoneId);


	//时间戳转换时间点
	static system_clock::time_point Timestamp2Timepoint(const time_t timestamp);

	//时间点转换时间戳
	static time_t Timepoint2Timestamp(const system_clock::time_point& timePoint);

	//本地时间转换时间戳
	static time_t Timepoint2Timestamp(const date::local_seconds& localTime);

	//获得时区差的绝对值(单位：分钟)
	static int abs(const int timeZoneDiff);

	//从本地日期string ymd ("YYYY-MM-DD") 获得本地日期开始时间time_t (YYYY-MM-DD 00:00:00)
	static time_t LocalDateToUtc_StartOfDay(const std::string& ymd,     // "YYYY-MM-DD"
		const std::string& zoneId);  // "Asia/Singapore"

	//从本地日期string ymd ("YYYY-MM-DD") 获得本地日期结束时间time_t (YYYY-MM-DD 23:59:59)
	static time_t LocalDateToUtc_EndOfDay(const std::string& ymd,     // "YYYY-MM-DD"
		const std::string& zoneId);  // "Asia/Singapore"

	//从本地时间string ("YYYY-MM-DD HH:mm:ss") 获得本地时间time_t。
	// 若夏令时本地时间无UTC时间，此时返回INT_MIN值; 若存在二义性默认返回后一个 latest
	static time_t LocalDateTimeToUtc(
		const std::string& localStr,      // "YYYY-MM-DD HH:MM:SS"
		const std::string& tzName,        // "Europe/London"
		date::choose ambiguousChoice = date::choose::latest);

private:
	static bool _installed;

	static void LoadDefaultTimezoneDatabase();


};

#endif // ! _TIMEZONEUTILS_H_
