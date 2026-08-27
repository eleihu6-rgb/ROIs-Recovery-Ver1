#ifdef _TEST_

#include <iostream>
#include <ratio>
#include <chrono>
#include <time.h>


#include "date/date.h"
#include "date/tz.h"

using namespace std;
using namespace std::chrono;

void Test1();
void Test2();
void Test3();
void TestInstallTZDB();
void TestTimezoneList();
void TestTimezone();
void TestTimezone2();
void TestTimezoneOffset();
void TestTimezoneOffForAustraliaDaylight();
void TestTimezoneOffForAustraliaDaylight2();
void TestTimezoneOffForAustraliaDaylight3();
void TestTimezoneFlight();
void TestAustraliaTimeZone();
void TestAustraliaDaylightByLocalZone();
void TestAustraliaDaylightByUtc();
void TestLocalZoneByUtc();
void TestTimepoint2Timestamp();

std::chrono::system_clock::time_point Timestamp2Timepoint(const time_t& timestamp);
std::chrono::system_clock::time_point Timestamp2Timepoint(std::string const& s);

time_t Timepoint2Timestamp(const std::chrono::system_clock::time_point& timePoint);
time_t Timepoint2Timestamp(const date::local_seconds& timePoint);

int main2(int argc, char *argv[]) 
{
	//Test1();
	//Test2();
	//Test3();
	//TestTimepoint2Timestamp();
	TestInstallTZDB();
	//TestTimezoneList();
	//TestTimezoneFlight();
	//TestTimezone();
	//TestTimezone2();
	//TestTimezoneOffset();
	//TestTimezoneOffForAustraliaDaylight();
	TestTimezoneOffForAustraliaDaylight2();
	TestTimezoneOffForAustraliaDaylight3();
	//TestAustraliaTimeZone();
	//TestAustraliaDaylightByLocalZone();
	//TestAustraliaDaylightByUtc();
	//TestLocalZoneByUtc();
	return 0;
}

std::chrono::hours utc_offset_Eastern_US(std::chrono::system_clock::time_point tp);

void Test1() {
	cout << "test1=============" << endl;
	auto tp = system_clock::now();
	tp += utc_offset_Eastern_US(tp);// tp now in Eastern US timezone
	time_t ttp = std::chrono::system_clock::to_time_t(tp);

	char szTime[30];
	// strTime表示当地时间的字符串指针，字符串形式 day month year hours:minutes:seconds year\n\0。
	ctime_s(szTime, sizeof szTime, &ttp);
	std::cout << "timestamp: " << ttp << ", time: " << szTime << endl;
}

void Test2() {
	cout << "test2=============" << endl;
	auto tNow = system_clock::now();
	auto tmNow = system_clock::to_time_t(tNow);

	struct tm locNow;
	localtime_s(&locNow, &tmNow);

	char szTime[24] = {};
	strftime(szTime, sizeof(szTime), "%Y-%m-%d %H:%M:%S", &locNow);
	cout << szTime << endl; //本地时间: 2023-11-30 19:32:10
}

void Test3() {
	cout << "test3=============" << endl;
	time_t  now = time(0);
	char szTime[30] = {};
	// strTime表示当地时间的字符串指针，字符串形式 day month year hours:minutes:seconds year\n\0。
	ctime_s(szTime, sizeof szTime, &now);

	cout << now << endl;  //输出一个时间戳    1970 年 1 月 1 日以来经过的秒数。如果系统没有时间，则返回 .1。
	cout << szTime << endl;  //字符串时间  

	//转换UTC时间
	struct tm gm;
	gmtime_s(&gm, &now);

	char szTime2[30] = {};
	asctime_s(szTime2, sizeof szTime2, &gm);
	cout << szTime2 << endl; //UTC时间

	
}

void TestTimepoint2Timestamp() {
	cout << "TestTimepoint2Timestamp=============" << endl;
	using namespace std;
	using namespace std::chrono;
	using namespace date;
	time_t timestamp = 0;
	std::cout << "src timestamp UTC:" << timestamp << endl;
	system_clock::time_point timePoint = Timestamp2Timepoint(timestamp);
	std::cout << "dest date UTC:" << timePoint << endl;

	time_t timestamp2 = Timepoint2Timestamp(timePoint);
	std::cout << "dest timestamp UTC:" << timestamp2 << endl;
}
/**
* 安装IANA的时区数据库
*/
void TestInstallTZDB() {
	date::set_install("D:\\git\\crewrule\\timezoneUtil\\tzdata");
}

void TestTimezoneList() {

	date::tzdb_list& tzdb_list = date::get_tzdb_list();
	date::tzdb& tzdb = tzdb_list.front();
	cout << "timezone list=============" << endl;
	for (auto& timezone : tzdb.zones) {
		std::cout << timezone.name() << endl;
	}
	cout << "timezone link list=============" << endl;
	for (auto& timezoneLink : tzdb.links) {
		std::cout << timezoneLink.name() << endl;
	}
}

void TestTimezone() {
	cout << "testTimezone=============" << endl;
	using namespace date;
	using namespace std::chrono;

	auto t = date::make_zoned(current_zone(), system_clock::now());
	std::cout << t << '\n';
}

void TestTimezone2() {
	cout << "testTimezone2=============" << endl;
	using namespace date;
	using namespace std::chrono;

	auto t = date::make_zoned(current_zone(), system_clock::now());
	std::cout <<"local time:"<< t << '\n';

	t = date::make_zoned(locate_zone("America/New_York"), system_clock::now());
	std::cout << "America/New_York time:" << t << '\n';

}

void TestTimezoneOffset() {
	using namespace date;

	auto zone = date::locate_zone("America/New_York");
	auto tp = date::sys_days{ month(1) / 1 / 1970 };
	auto info = zone->get_info(tp);
	printf("America/New_York offset seconds:%d\n", info.offset.count());

	
	zone = date::locate_zone("Asia/Shanghai");
	tp = date::sys_days{ month(1) / 1 / 1970 };
	info = zone->get_info(tp);
	printf("Asia/Shanghai offset seconds:%d\n", info.offset.count());

	//Pacific/Auckland非夏令时，UTC+12:00
	zone = date::locate_zone("Pacific/Auckland");
	tp = date::sys_days{ month(1) / 1 / 1970 };
	info = zone->get_info(tp);
	printf("Pacific/Auckland offset seconds:%d\n", info.offset.count());

	//Pacific/Auckland夏令时，UTC+13:00
	zone = date::locate_zone("Pacific/Auckland");
	tp = date::sys_days{ month(11) / 1 / 2023 };
	info = zone->get_info(tp);
	printf("Pacific/Auckland daylight offset seconds:%d\n", info.offset.count());

}

void TestTimezoneFlight() {
	cout << "testTimezoneFlight=============" << endl;
	using namespace std::chrono_literals;
	using namespace date;
	
	auto departure = make_zoned(locate_zone("America/New_York"), local_days{ December / 30 / 1978 } +12h + 1min);
	auto flight_length = 14h + 44min;
	auto arrival = make_zoned(locate_zone("Asia/Tehran"), departure.get_sys_time() + flight_length);

	std::cout << "departure NYC time:  " << departure << '\n';
	std::cout << "departure SYS time:  " << departure.get_sys_time() << '\n';
	std::cout << "flight time is       " << make_time(flight_length) << '\n';
	std::cout << "arrival Tehran time: " << arrival << '\n';
}

//澳大利亚时区
void TestAustraliaTimeZone() {
	cout << "testAustraliaTimeZone=============" << endl;
	using namespace date;
	using namespace std::chrono;

	auto t = date::make_zoned(current_zone(), system_clock::now());
	std::cout << current_zone() << " local time:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Lindeman"), system_clock::now());
	std::cout << "Australia/Lindeman:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Eucla"), system_clock::now());
	std::cout << "Australia/Eucla:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Sydney"), system_clock::now());
	std::cout << "Australia/Sydney:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/ACT"), system_clock::now());
	std::cout << "Australia/ACT:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Lord_Howe"), system_clock::now());
	std::cout << "Australia/Lord_Howe:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/LHI"), system_clock::now());
	std::cout << "Australia/LHI:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/NSW"), system_clock::now());
	std::cout << "Australia/NSW:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Darwin"), system_clock::now());
	std::cout << "Australia/Darwin:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/North"), system_clock::now());
	std::cout << "Australia/North:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Brisbane"), system_clock::now());
	std::cout << "Australia/Brisbane:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Queensland"), system_clock::now());
	std::cout << "Australia/Queensland:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Adelaide"), system_clock::now());
	std::cout << "Australia/Adelaide:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/South"), system_clock::now());
	std::cout << "Australia/South:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Hobart"), system_clock::now());
	std::cout << "Australia/Hobart:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Tasmania"), system_clock::now());
	std::cout << "Australia/Tasmania:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Melbourne"), system_clock::now());
	std::cout << "Australia/Melbourne:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Victoria"), system_clock::now());
	std::cout << "Australia/Victoria:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Perth"), system_clock::now());
	std::cout << "Australia/Perth:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/West"), system_clock::now());
	std::cout << "Australia/West:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Broken_Hill"), system_clock::now());
	std::cout << "Australia/Broken_Hill:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Yancowinna"), system_clock::now());
	std::cout << "Australia/Yancowinna:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Canberra"), system_clock::now());
	std::cout << "Australia/Canberra:" << t << '\n';

	t = date::make_zoned(locate_zone("Australia/Currie"), system_clock::now());
	std::cout << "Australia/Currie:" << t << '\n';
}

//澳大利亚夏令时(通过本地时区转换)
void TestAustraliaDaylightByLocalZone() {
	cout << "testAustraliaDaylightByLocalZone=============" << endl;
	using namespace date;
	using namespace std::chrono;

	
	//夏令时开始:墨尔本在当地时间 2023年10月01日，02:00 : 00(UTC+10) 时钟向前调整 1 小时 变为 2023年10月01日，03 : 00 : 00(UTC+11)，开始夏令时
	//夏令时结束: 墨尔本在当地时间 2024年04月07日，03:00 : 00 时钟向后调整 1 小时(UTC+11) 变为 2024年04月02日，02 : 00 : 00(UTC+10)，结束夏令时
	auto time = make_zoned(current_zone(), local_days{ month{12} / 4 / 2023 } +12h + 1min);

	auto t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{6} / 2 / 2023 } +3h + 1min);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{10} / 1 / 2023 } +1h + 59min);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{10} / 1 / 2023 } +1h + 59min - 3h);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{10} / 1 / 2023 } +2h + 0min);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{10} / 1 / 2023 } +2h + 0min - 3h);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{10} / 1 / 2023 } +2h + 1min);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{10} / 1 / 2023 } +2h + 1min - 3h);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{4} / 2 / 2023 } +2h + 59min);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{4} / 2 / 2023 } +2h + 59min - 3h);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{4} / 2 / 2023 } +3h + 0min);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{4} / 2 / 2023 } +3h + 0min - 3h);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{4} / 2 / 2023 } +3h + 1min);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{4} / 2 / 2023 } +3h + 1min - 3h);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(current_zone(), local_days{ month{4} / 3 / 2023 } +3h + 1min);
	t = date::make_zoned(current_zone(), time);
	std::cout << "source " <<current_zone()->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';
}

void TestLocalZoneByUtc() {
	cout << "testLocalZoneByUtc=============" << endl;
	using namespace std;
	using namespace std::chrono;
	using namespace date;
	time_t utcTime = 0;
	std::cout << "timestamp UTC:" << utcTime << endl;
	system_clock::time_point timePoint = Timestamp2Timepoint(utcTime);
	std::cout << timePoint << endl;

	auto time = make_zoned(locate_zone("Etc/UTC"), timePoint);
	std::cout << "Etc/UTC:" << time << '\n';

	time = date::make_zoned(locate_zone("Etc/UTC"), timePoint);
	std::cout << "source Etc/UTC:" << time << '\n';

	auto t = date::make_zoned(locate_zone("Asia/Shanghai"), time);
	std::cout << "dest Asia/Shanghai:" << t << '\n';
	std::cout << "dest timestamp Asia/Shanghai UTC:" << Timepoint2Timestamp(t.get_sys_time()) << '\n';
	std::cout << "dest timestamp Asia/Shanghai loc:" << Timepoint2Timestamp(std::chrono::time_point_cast<std::chrono::seconds>(t.get_local_time())) << '\n';

	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "dest timestamp Australia/Melbourne UTC:" << Timepoint2Timestamp(t.get_sys_time()) << '\n';
	std::cout << "dest timestamp Asia/Shanghai loc:" << Timepoint2Timestamp(std::chrono::time_point_cast<std::chrono::seconds>(t.get_local_time())) << '\n';
	std::cout << "------------------" << '\n';


	utcTime = std::time(nullptr);
	std::cout << "timestamp UTC:" << utcTime << endl;
	timePoint = Timestamp2Timepoint(utcTime);
	std::cout << timePoint << endl;

	time = make_zoned(locate_zone("Etc/UTC"), timePoint);
	std::cout << "Etc/UTC:" << time << '\n';

	time = date::make_zoned(locate_zone("Etc/UTC"), timePoint);
	std::cout << "source Etc/UTC:" << time << '\n';

	t = date::make_zoned(locate_zone("Asia/Shanghai"), time);
	std::cout << "dest Asia/Shanghai:" << t << '\n';
    //auto t2 = std::chrono::time_point_cast<std::chrono::seconds>(t.get_local_time());
	//date::make_time();
	std::cout << "dest timestamp Asia/Shanghai Utc:" << Timepoint2Timestamp(t.get_sys_time()) << '\n';
	std::cout << "dest timestamp Asia/Shanghai Loc:" << Timepoint2Timestamp(std::chrono::time_point_cast<std::chrono::seconds>(t.get_local_time())) << '\n';

	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "dest timestamp Australia/Melbourne Utc:" << Timepoint2Timestamp(t.get_sys_time()) << '\n';
	std::cout << "dest timestamp Australia/Melbourne Loc:" << Timepoint2Timestamp(std::chrono::time_point_cast<std::chrono::seconds>(t.get_local_time())) << '\n';
	std::cout << "------------------" << '\n';

}

//澳大利亚夏令时(通过UTC时间戳转换)
void TestAustraliaDaylightByUtc() {
	cout << "testAustraliaDaylightByTimestamp=============" << endl;
	using namespace date;
	using namespace std::chrono;

	//夏令时开始:墨尔本在当地时间 2023年10月01日，02:00 : 00(UTC+10) 时钟向前调整 1 小时 变为 2023年10月01日，03 : 00 : 00(UTC+11)，开始夏令时
	//夏令时结束: 墨尔本在当地时间 2024年04月07日，03:00 : 00 时钟向后调整 1 小时(UTC+11) 变为 2024年04月02日，02 : 00 : 00(UTC+10)，结束夏令时
	auto time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{12} / 4 / 2023 } +12h + 1min);

	auto t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{6} / 2 / 2023 } +3h + 1min);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{10} / 1 / 2023 } +1h + 59min);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{10} / 1 / 2023 } +1h + 59min - 3h);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{10} / 1 / 2023 } +2h + 0min);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{10} / 1 / 2023 } +2h + 0min - 3h);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{10} / 1 / 2023 } +2h + 1min);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{10} / 1 / 2023 } +2h + 1min - 3h);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{4} / 2 / 2023 } +2h + 59min);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{4} / 2 / 2023 } +2h + 59min - 3h);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{4} / 2 / 2023 } +3h + 0min);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{4} / 2 / 2023 } +3h + 0min - 3h);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{4} / 2 / 2023 } +3h + 1min);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{4} / 2 / 2023 } +3h + 1min - 3h);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';

	time = make_zoned(locate_zone("Etc/UTC"), local_days{ month{4} / 3 / 2023 } +3h + 1min);
	t = date::make_zoned(locate_zone("Etc/UTC"), time);
	std::cout << "source " << locate_zone("Etc/UTC")->name() << ":" << t << '\n';
	t = date::make_zoned(locate_zone("Australia/Melbourne"), time);
	std::cout << "dest Australia/Melbourne:" << t << '\n';
	std::cout << "------------------" << '\n';
}

//澳大利亚夏令时与UTC时差
void TestTimezoneOffForAustraliaDaylight() {
	cout << "TestTimezoneOffForAustraliaDaylight=============" << endl;
	using namespace date;
	using namespace std::chrono;

	//夏令时开始:墨尔本在当地时间 2023年10月01日，02:00 : 00(UTC+10) 时钟向前调整 1 小时 变为 2023年10月01日，03 : 00 : 00(UTC+11)，开始夏令时
	//夏令时结束: 墨尔本在当地时间 2024年04月07日，03:00 : 00 时钟向后调整 1 小时(UTC+11) 变为 2024年04月02日，02 : 00 : 00(UTC+10)，结束夏令时
	//sys_days为utc时间
	auto tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 00min - 10h;
	auto zone = date::locate_zone("Australia/Melbourne");
	auto info = zone->get_info(tp);
	auto localTime = date::make_zoned(locate_zone("Australia/Melbourne"), tp);
	std::cout << "Australia/Melbourne utc:" << tp << ", local time:" << localTime << " zonetime offset seconds:" << info.offset.count() << endl;

	tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 00min - 1min - 10h;
	zone = date::locate_zone("Australia/Melbourne");
	info = zone->get_info(tp);
	localTime = date::make_zoned(locate_zone("Australia/Melbourne"), tp);
	std::cout << "Australia/Melbourne utc:" << tp << ", local time:" << localTime << " zonetime offset seconds:" << info.offset.count() << endl;

	tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 0min + 1min - 10h;
	zone = date::locate_zone("Australia/Melbourne");
	info = zone->get_info(tp);
	localTime = date::make_zoned(locate_zone("Australia/Melbourne"), tp);
	std::cout << "Australia/Melbourne utc:" << tp << ", local time:" << localTime << " zonetime offset seconds:" << info.offset.count() << endl;

	std::cout << "--------------------" << endl;

	tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 00min - 11h;
	zone = date::locate_zone("Australia/Melbourne");
	info = zone->get_info(tp);
	localTime = date::make_zoned(locate_zone("Australia/Melbourne"), tp);
	std::cout << "Australia/Melbourne utc:" << tp << ", local time:" << localTime << " zonetime offset seconds:" << info.offset.count() << endl;

	tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 00min - 1min - 11h;
	zone = date::locate_zone("Australia/Melbourne");
	info = zone->get_info(tp);
	localTime = date::make_zoned(locate_zone("Australia/Melbourne"), tp);
	std::cout << "Australia/Melbourne utc:" << tp << ", local time:" << localTime << " zonetime offset seconds:" << info.offset.count() << endl;

	tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 00min + 1min - 11h;
	zone = date::locate_zone("Australia/Melbourne");
	info = zone->get_info(tp);
	localTime = date::make_zoned(locate_zone("Australia/Melbourne"), tp);
	std::cout << "Australia/Melbourne utc:" << tp << ", local time:" << localTime << " zonetime offset seconds:" << info.offset.count() << endl;

	//std::cout << "--------------------" << endl;

	//for (int i = -20; i < 20; i++) {
	//	auto tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 00min + hours(i);
	//	auto zone = date::locate_zone("Australia/Melbourne");
	//	auto info = zone->get_info(tp);
	//	auto localTime = date::make_zoned(locate_zone("Australia/Melbourne"), tp);
	//	std::cout << "Australia/Melbourne utc:" << tp << ", local time:" << localTime << " zonetime offset seconds:" << info.offset.count() << endl;
	//	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());
	//}

	//std::cout << "--------------------" << endl;
	//for (int i = -20; i < 50; i++) {
	//	auto localTime = date::local_days{ month{10} / 1 / 2023 } +2h + 00min + hours(i);
	//	auto zone = date::locate_zone("Australia/Melbourne");
	//	auto info = zone->get_info(tp);
	//	std::cout << "Australia/Melbourne localTime:" << localTime << " zonetime offset seconds:" << info.offset << endl;
	//	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());
	//}
}

//澳大利亚夏令时与UTC时差
void TestTimezoneOffForAustraliaDaylight2() {
	cout << "TestTimezoneOffForAustraliaDaylight2=============" << endl;
	using namespace date;
	using namespace std::chrono;

	//夏令时开始:墨尔本在当地时间 2023年10月01日，02:00 : 00(UTC+10) 时钟向前调整 1 小时 变为 2023年10月01日，03 : 00 : 00(UTC+11)，开始夏令时
	//夏令时结束: 墨尔本在当地时间 2024年04月07日，03:00 : 00 时钟向后调整 1 小时(UTC+11) 变为 2024年04月02日，02 : 00 : 00(UTC+10)，结束夏令时
	//sys_days为utc时间
	auto depUtc = date::sys_days{ month{10} / 1 / 2023 } +2h + 00min - 10h;//起飞地点的UTC时间
	auto depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	auto arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	auto depInfo = depZone->get_info(depUtc);
	auto arrInfo = arrZone->get_info(depUtc);
	auto depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	auto arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60  << endl <<"\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;

	depUtc = date::sys_days{ month{10} / 1 / 2023 } +2h + 00min - 1min - 10h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;

	depUtc = date::sys_days{ month{10} / 1 / 2023 } +2h + 0min + 1min - 10h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;

	std::cout << "--------------------" << endl;

	depUtc = date::sys_days{ month{4} / 2 / 2023 } +3h + 00min - 11h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;


	depUtc = date::sys_days{ month{4} / 2 / 2023 } +3h + 00min - 1min - 11h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;

	depUtc = date::sys_days{ month{4} / 2 / 2023 } +3h + 00min + 1min - 11h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;


	//auto zone = date::locate_zone("Australia/Melbourne");
	//auto tp = date::sys_days{ month{10} / 1 / 2023 } +1h + 59min;
	//auto info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +1h + 59min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 0min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 0min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 1min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 1min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	///////////
	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 00min - 10h - 1min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 00min - 10h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	///////////////////////

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +2h + 59min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +2h + 59min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 0min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 0min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 1min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 1min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 3 / 2023 } +3h + 1min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

}

//澳大利亚夏令时与UTC时差
void TestTimezoneOffForAustraliaDaylight3() {
	cout << "TestTimezoneOffForAustraliaDaylight3=============" << endl;
	using namespace date;
	using namespace std::chrono;

	//夏令时开始:墨尔本在当地时间 2023年10月01日，02:00 : 00(UTC+10) 时钟向前调整 1 小时 变为 2023年10月01日，03 : 00 : 00(UTC+11)，开始夏令时
	//夏令时结束: 墨尔本在当地时间 2024年04月07日，03:00 : 00 时钟向后调整 1 小时(UTC+11) 变为 2024年04月02日，02 : 00 : 00(UTC+10)，结束夏令时
	//sys_days为utc时间
	auto depUtc = date::sys_days{ month{10} / 1 / 2032 } +2h + 00min - 10h;//起飞地点的UTC时间
	auto depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	auto arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	auto depInfo = depZone->get_info(depUtc);
	auto arrInfo = arrZone->get_info(depUtc);
	auto depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	auto arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;

	depUtc = date::sys_days{ month{10} / 1 / 2032 } +2h + 00min - 1min - 10h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;

	depUtc = date::sys_days{ month{10} / 1 / 2032 } +2h + 0min + 1min - 10h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;

	std::cout << "--------------------" << endl;

	depUtc = date::sys_days{ month{4} / 2 / 2032 } +3h + 00min - 11h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;


	depUtc = date::sys_days{ month{4} / 2 / 2032 } +3h + 00min - 1min - 11h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;

	depUtc = date::sys_days{ month{4} / 2 / 2032 } +3h + 00min + 1min - 11h;
	depZone = date::locate_zone("Australia/Melbourne"); //起飞地点
	arrZone = date::locate_zone("Asia/Shanghai"); //落地地点
	depInfo = depZone->get_info(depUtc);
	arrInfo = arrZone->get_info(depUtc);
	depLocalTime = date::make_zoned(locate_zone("Australia/Melbourne"), depUtc);
	arrLocalTime = date::make_zoned(locate_zone("Asia/Shanghai"), depUtc);
	std::cout << "utc:" << depUtc << ", Australia/Melbourne local time:" << depLocalTime << ", zonetime offset minutes:" << depInfo.offset.count() / 60 << endl << "\t-> "
		<< "Asia/Shanghai local time:" << arrLocalTime << ", zonetime offset minutes:" << arrInfo.offset.count() / 60 << endl << "\t-> "
		<< "zonetime diff minutes:" << (arrInfo.offset.count() - depInfo.offset.count()) / 60 << endl;


	//auto zone = date::locate_zone("Australia/Melbourne");
	//auto tp = date::sys_days{ month{10} / 1 / 2023 } +1h + 59min;
	//auto info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +1h + 59min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 0min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 0min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 1min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 1min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	///////////
	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 00min - 10h - 1min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{10} / 1 / 2023 } +2h + 00min - 10h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	///////////////////////

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +2h + 59min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +2h + 59min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 0min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 0min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 1min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 2 / 2023 } +3h + 1min - 3h;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

	//zone = date::locate_zone("Australia/Melbourne");
	//tp = date::sys_days{ month{4} / 3 / 2023 } +3h + 1min;
	//info = zone->get_info(tp);
	//printf("Australia/Melbourne offset seconds:%d\n", info.offset.count());

}

std::chrono::hours utc_offset_Eastern_US(std::chrono::system_clock::time_point tp)
{
	using namespace date;
	using namespace std::chrono;
	constexpr auto EST = -5h;
	constexpr auto EDT = -4h;
	const auto y = year_month_day{ floor<days>(tp) }.year();
	const auto begin = sys_days{ Sunday[2] / March / y } +2h - EST; // EDT begins at this UTC time
	const auto end = sys_days{ Sunday[1] / November / y } +2h - EDT; // EST begins at this UTC time
	if (tp < begin || end <= tp)
		return EST;
	return EDT;
}

void TestConvert() {
	using date::operator<<;
	std::cout << Timestamp2Timepoint("1613466103.2977877") << '\n';
}

//时间戳转换时间（支持纳秒）
std::chrono::system_clock::time_point Timestamp2Timepoint(std::string const& timestamp)
{
	using namespace std;
	using namespace std::chrono;
	using namespace date;

	istringstream in{ timestamp };
	in.exceptions(ios::failbit);
	int sec, ns;
	char decimal_point;
	in >> sec >> decimal_point >> ns;
	if (decimal_point != '.')
		in.setstate(ios::failbit);
	return time_point_cast<system_clock::duration>(
		sys_time<nanoseconds>{seconds{ sec } +nanoseconds{ ns }});
}

//时间戳转换时间点
std::chrono::system_clock::time_point Timestamp2Timepoint(const time_t& timestamp)
{
	using namespace std;
	using namespace std::chrono;
	using namespace date;

	//return time_point_cast<system_clock::duration>(
	//	sys_time<seconds>{seconds{ timestamp }});
	return std::chrono::system_clock::from_time_t(timestamp);
}

//时间点转换时间戳
time_t Timepoint2Timestamp(const std::chrono::system_clock::time_point& timePoint)
{
	return std::chrono::system_clock::to_time_t(timePoint);
}

//时间点转换时间戳
time_t Timepoint2Timestamp(const date::local_seconds& timePoint)
{
	return std::chrono::duration_cast<std::chrono::seconds>(timePoint.time_since_epoch()).count();
}

#endif //_TEST_