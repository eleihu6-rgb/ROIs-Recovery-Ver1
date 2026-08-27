#include "TimezoneUtils.h"

#include <iostream>
#include <ratio>
#include <chrono>
#include <time.h>
#include <climits>
#include <sstream>
#include <stdexcept>
#include <filesystem>
#include <vector>
#include "spdlog/spdlog.h"

#ifdef _WIN32
#include <io.h>
#include <windows.h>
#else
#include <unistd.h>
#endif



using namespace std;
using namespace std::chrono;
using namespace date;

#ifdef _WIN32
const char* TZDB_DEFAULT_PATH[] = {
        "./tzdata",             // executable directory
        "../tzdata",            // parent directory
        "../../tzdata",         // double parent directory, currently used in PO server
        "../../../tzdata",
        "C:/Downloads/tzdata",
        "D:/Downloads/tzdata"
};
#else
const char* TZDB_DEFAULT_PATH[] = {
        "./tzdata",
        "../tzdata",
        "../../tzdata",
        "../../../tzdata",
        "~/Downloads/tzdata",
        "/Downloads/tzdata"
};
#endif

bool TimezoneUtils::_installed = false;

static bool file_exists(const std::string& filename)
{
#ifdef _WIN32
	return ::_access(filename.c_str(), 0) == 0;
#else
	return ::access(filename.c_str(), F_OK) == 0;
#endif
}

static std::filesystem::path executable_directory()
{
#ifdef _WIN32
	char buffer[MAX_PATH] = { 0 };
	const DWORD size = ::GetModuleFileNameA(nullptr, buffer, MAX_PATH);
	if (size == 0 || size == MAX_PATH) {
		return {};
	}
	return std::filesystem::path(buffer).parent_path();
#else
	char buffer[PATH_MAX] = { 0 };
	const ssize_t size = ::readlink("/proc/self/exe", buffer, sizeof(buffer) - 1);
	if (size <= 0) {
		return {};
	}
	buffer[size] = '\0';
	return std::filesystem::path(buffer).parent_path();
#endif
}

//设置时区数据库目录
void TimezoneUtils::SetTimezoneDatabase(const std::string& path) {
	date::set_install(path);
	_installed = true;
}

//重新加载时区数据库
void TimezoneUtils::reloadTimezoneDatabase() {
	if (!_installed) {
		spdlog::warn("Timezone database not loaded.");
		return;
	}
	date::reload_tzdb();
}

//获得本地时间
time_t TimezoneUtils::GetLocalTime(const time_t utcTime, const std::string& zoneId) {
	if (!_installed) {
		LoadDefaultTimezoneDatabase();
	}
    if (utcTime<=0) {
        return 0;
    }
	system_clock::time_point timePoint = Timestamp2Timepoint(utcTime);
	auto time = date::make_zoned(date::locate_zone(zoneId), timePoint);
	return Timepoint2Timestamp(std::chrono::time_point_cast<std::chrono::seconds>(time.get_local_time()));
}

//通过本地时间获得UTC时间,当存在夏令时在时钟调整范围内，转换会出现错误
time_t TimezoneUtils::GetUTCTime(const time_t localTime, const std::string& localZoneId) {
	if (!_installed) {
		LoadDefaultTimezoneDatabase();
	}
	auto timepointLoc = std::make_shared<date::local_time<std::chrono::seconds>>(std::chrono::seconds(localTime));
	auto zone = date::locate_zone(localZoneId);
	auto info = zone->get_info(*timepointLoc);
	//cout << "zone info:" << info << endl;
	if (info.result == local_info::nonexistent) {
		//不存在UTC时间
		return INT_MIN;
	}
	if (info.result == local_info::ambiguous) {
		//UTC时间存在二义性（即存在多个值）
		return localTime - info.first.offset.count();
		//return localTime - info.second.offset.count();
	}
	return localTime - info.first.offset.count();
}

//获得zoneId时区与UTC时区的分钟差，例如：utcTime = 0, zoneId = "Asia/Shanghai" 输出：480
int TimezoneUtils::GetTimezoneOffset(const time_t utcTime, const std::string& zoneId) {
	if (!_installed) {
		LoadDefaultTimezoneDatabase();
	}
	auto utc = Timestamp2Timepoint(utcTime);
	auto zone = date::locate_zone(zoneId);
	auto info = zone->get_info(utc);
	return (int)info.offset.count() / 60;
}

int TimezoneUtils::GetTimezoneOffset(const time_t startUtcTime, const std::string& startZoneId,
	const time_t& endUtcTime, const std::string& endZoneId) {
	if (!_installed) {
		LoadDefaultTimezoneDatabase();
	}
	auto startUtc = Timestamp2Timepoint(startUtcTime);
	auto startZone = date::locate_zone(startZoneId); //起飞地点
	auto startInfo = startZone->get_info(startUtc);
	//auto startLocalTime = date::make_zoned(startZone, startUtc);

	auto endUtc = Timestamp2Timepoint(endUtcTime);
	auto endZone = date::locate_zone(endZoneId); //落地地点
	auto endInfo = endZone->get_info(endUtc);
	//auto endLocalTime = date::make_zoned(endZone, endUtc);

	//stringstream ss;
	//ss << "startZoneId:"<< startZoneId << ", startUtc: "<< startUtc <<", startLocalTime: "<< startLocalTime 
	//   << ", TZ Offset: "<< startInfo.offset.count() / 60  << " minutes "<< endl
	//   << "\t-> endZoneId: "<< endZoneId <<", endUtc:" << endUtc << ", endLocalTime: "<< endLocalTime <<", TZ Offset:"<< endInfo.offset.count() / 60  <<"  minutes;" << endl
	//   << "\t-> TZ diff: "<< (endInfo.offset.count() - startInfo.offset.count()) / 60  <<" minutes";
	//spdlog::info(ss.str());

	//spdlog::info("startZoneId:{}, startUtc:{}, startLocalTime:{}, TZ Offset:{} minutes -> endZoneId:{}, endUtc:{}, endLocalTime:{}, TZ Offset:{}  minutes;\r\nTZ diff: {} minutes",
	//	startZoneId, startUtc, startLocalTime, startInfo.offset.count() / 60, 
	//	endZoneId, endUtc, endLocalTime, endInfo.offset.count() / 60,
	//	(endInfo.offset.count() - startInfo.offset.count()) / 60 );
	return static_cast<int>(endInfo.offset.count() - startInfo.offset.count()) / 60;
}

//已开始地点时间为基准来计算，获得二个地点时区的时区分钟差
int TimezoneUtils::GetTimezoneOffsetByStart(const time_t startUtcTime, const std::string& startZoneId,
	const std::string& endZoneId) {
	return GetTimezoneOffset(startUtcTime, startZoneId, startUtcTime, endZoneId);
}

//已结束地点时间为基准来计算，获得二个地点时区的时区分钟差
int TimezoneUtils::GetTimezoneOffsetByEnd(const time_t endUtcTime, const std::string& startZoneId,
	const std::string& endZoneId) {
	return GetTimezoneOffset(endUtcTime, startZoneId, endUtcTime, endZoneId);
}

//时间戳转换时间点
std::chrono::system_clock::time_point TimezoneUtils::Timestamp2Timepoint(const time_t timestamp)
{
	//return time_point_cast<system_clock::duration>(
	//	sys_time<seconds>{seconds{ timestamp }});
	return std::chrono::system_clock::from_time_t(timestamp);
}


//时间点转换时间戳
time_t TimezoneUtils::Timepoint2Timestamp(const std::chrono::system_clock::time_point& timePoint)
{
	return std::chrono::system_clock::to_time_t(timePoint);
}

//本地时间转换时间戳
time_t TimezoneUtils::Timepoint2Timestamp(const date::local_seconds& localTime)
{
	return std::chrono::duration_cast<std::chrono::seconds>(localTime.time_since_epoch()).count();
}

//获得时区差的绝对值(单位：分钟)
int TimezoneUtils::abs(const int timeZoneDiff) {
	int absTimeZoneDiff = std::abs(timeZoneDiff);
	absTimeZoneDiff = absTimeZoneDiff >= 12 * 60 ? 24 * 60 - absTimeZoneDiff : absTimeZoneDiff;//时差最大12小时，从+8到-6，时区差14转换成10
	return std::abs(absTimeZoneDiff);
}

void TimezoneUtils::LoadDefaultTimezoneDatabase() {
	std::vector<std::string> candidates;
	const auto exeDir = executable_directory();
	if (!exeDir.empty()) {
		candidates.push_back((exeDir / "tzdata").string());
		candidates.push_back((exeDir / ".." / "tzdata").string());
		candidates.push_back((exeDir / ".." / ".." / "tzdata").string());
	}
	int len = sizeof(TZDB_DEFAULT_PATH) / sizeof(TZDB_DEFAULT_PATH[0]);
	for (int i = 0; i < len; i++) {
		candidates.push_back(TZDB_DEFAULT_PATH[i]);
	}
	for (const auto& path : candidates) {
		if (file_exists(path)) {
			date::set_install(path);
			_installed = true;
			break;
		}
	}
}

time_t TimezoneUtils::LocalDateToUtc_StartOfDay(
	const std::string& ymd,     // "YYYY-MM-DD"
	const std::string& tzName)  // "Asia/Singapore"
{
	using namespace date;
	using namespace std::chrono;

	if (!_installed) {
		LoadDefaultTimezoneDatabase();
	}

	year_month_day d;
	std::istringstream in{ ymd };
	in >> parse("%F", d); // %F == YYYY-MM-DD
	if (!in) throw std::runtime_error("Invalid date format: " + ymd);

	const time_zone* tz = locate_zone(tzName);

	// local midnight at that date
	local_seconds ls = local_days{ d };

	auto info = tz->get_info(ls);
	if (info.result == local_info::nonexistent) {
		return INT_MIN;
	}

	auto offset = info.first.offset; // pick earliest when ambiguous
	sys_seconds sysTp{ ls.time_since_epoch() - offset };
	return system_clock::to_time_t(sysTp);
}

time_t TimezoneUtils::LocalDateToUtc_EndOfDay(
	const std::string& ymd,
	const std::string& tzName)
{
	using namespace date;

	// Parse date
	year_month_day d;
	std::istringstream in{ ymd };
	in >> parse("%F", d);
	if (!in) throw std::runtime_error("Invalid date format: " + ymd);

	// Compute next local date
	year_month_day next = year_month_day{ sys_days{ d } + days{ 1 } };

	time_t startNextDay =
		LocalDateToUtc_StartOfDay(
			format("%F", next), tzName);

	if (startNextDay == INT_MIN) {
		return INT_MIN;
	}

	// End of current local day
	return startNextDay - 1;
}

time_t TimezoneUtils::LocalDateTimeToUtc(
	const std::string& localStr,      // "YYYY-MM-DD HH:MM:SS"
	const std::string& tzName,        // "Europe/London"
	date::choose ambiguousChoice)
{
	using namespace date;
	using namespace std::chrono;

	if (!_installed) {
		LoadDefaultTimezoneDatabase();
	}

	// Parse local datetime
	local_time<seconds> lt;
	std::istringstream in{ localStr };
	in >> parse("%F %T", lt); // %F=YYYY-MM-DD, %T=HH:MM:SS
	if (!in) throw std::runtime_error("Invalid datetime format: " + localStr);

	const time_zone* tz = locate_zone(tzName);

	auto info = tz->get_info(lt);
	if (info.result == local_info::nonexistent) {
		return INT_MIN;
	}

	auto offset = info.first.offset;
	if (info.result == local_info::ambiguous && ambiguousChoice == choose::latest) {
		offset = info.second.offset;
	}

	sys_seconds sysTp{ lt.time_since_epoch() - offset };
	return system_clock::to_time_t(sysTp);
}
