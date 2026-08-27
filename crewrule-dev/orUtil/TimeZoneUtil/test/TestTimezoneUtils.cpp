//#define _TEST_
#ifdef _TEST_

#include <iostream>
#include <ratio>
#include <chrono>
#include <time.h>


#include "date/date.h"
#include "date/tz.h"
#include "TimezoneUtils.h"

void TestGetLocalTime();
void TestGetTimezoneOffset();
void TestGetUTCTime();

using namespace std;

int main(int argc, char *argv[])
{
	TestGetLocalTime();
	TestGetTimezoneOffset();
    TestGetUTCTime();
	return 0;
}

void TestGetLocalTime() {
	std::cout << "TestGetLocalTime=============" << endl;
	TimezoneUtils::SetTimezoneDatabase("D:\\git\\crewrule\\timezoneUtil\\tzdata");

	time_t utcTime = 0;
	std::cout << "timestamp UTC:" << utcTime << endl;
	time_t locTime = TimezoneUtils::GetLocalTime(utcTime, "Etc/UTC");
	std::cout << "Etc/UTC:" << locTime << '\n';

	locTime = TimezoneUtils::GetLocalTime(utcTime, "Asia/Shanghai");
	std::cout << "Asia/Shanghai:" << locTime << '\n';

	locTime = TimezoneUtils::GetLocalTime(utcTime, "Australia/Melbourne");
	std::cout << "Australia/Melbourne:" << locTime << '\n';

	std::cout << "---------------" << '\n';
	utcTime = std::time(nullptr);
	std::cout << "timestamp UTC:" << utcTime << endl;
	locTime = TimezoneUtils::GetLocalTime(utcTime, "Etc/UTC");
	std::cout << "Etc/UTC:" << locTime << '\n';

	locTime = TimezoneUtils::GetLocalTime(utcTime, "Asia/Shanghai");
	std::cout << "Asia/Shanghai:" << locTime << '\n';

	locTime = TimezoneUtils::GetLocalTime(utcTime, "Australia/Melbourne");
	std::cout << "Australia/Melbourne:" << locTime << '\n';
}

void TestGetUTCTime() {
    std::cout << "TestGetUTCTime=============" << endl;
    TimezoneUtils::SetTimezoneDatabase("D:\\git\\crewrule\\timezoneUtil\\tzdata");

//	  std::cout << "-------------"<< '\n'; 
 //   time_t locTime = 28800; //1970-01-01 08:00:00 时间戳  28800，针对utcTime=0
 //   std::cout << "timestamp UTC:" << locTime << endl;
 //   time_t utcTime = TimezoneUtils::GetUTCTime(locTime, "Asia/Shanghai");
 //   std::cout << "Asia/Shanghai:" << utcTime << '\n'; //

	//std::cout << "-------------"<< '\n'; 
	//utcTime = TimezoneUtils::GetUTCTime(locTime, "Etc/UTC");
	//std::cout << "Etc/UTC:" << utcTime << '\n'; //

	std::cout << "-------------" << '\n';
	//夏令时开始:墨尔本在当地时间 2023年10月01日，02:00 : 00(UTC+10) 时钟向前调整 1 小时 变为 2023年10月01日，03 : 00 : 00(UTC+11)，开始夏令时
	//夏令时结束: 墨尔本在当地时间 2024年04月07日，03:00 : 00 时钟向后调整 1 小时(UTC+11) 变为 2024年04月07日，02 : 00 : 00(UTC+10)，结束夏令时
	time_t locTime = 1696125600; //墨尔本在当地时间 2023-10-01 02:00:00(UTC+10)  （由于夏令时该时间不存在） ,对应  UTC时间实际不存在（2023-09-30 16:00:00(UTC+0)
	time_t utcTime = TimezoneUtils::GetUTCTime(locTime, "Australia/Melbourne");
	std::cout << "Australia/Melbourne:" << "locTime:" << locTime << ", utcTime:" << utcTime << '\n';

	std::cout << "-------------" << '\n';
	//注意：由于夏令时原因 墨尔本在当地时间  [2023-10-01 02:00:00, 2023-10-01 03:00:00） 之间不存在
	locTime = 1696125601; //墨尔本在当地时间 2023-10-01 02:00:01(UTC+10) （该时间不存在） ,对应  UTC时间实际不存在 （2023-09-30 16:00:01(UTC+0)
	utcTime = TimezoneUtils::GetUTCTime(locTime, "Australia/Melbourne");
	std::cout << "Australia/Melbourne:" << "locTime:" << locTime << ", utcTime:" << utcTime << '\n';

	std::cout << "-------------" << '\n';
	//注意：由于夏令时原因 墨尔本在当地时间 2023-10-01 02:00:00(UTC+10)（该时间实际不存在）   与 墨尔本在当地时间 2023-10-01 03:00:00(UTC+11)  对应的 UTC 时间相同，均为： 2023-09-30 16:00:00(UTC+0) 
	locTime = 1696129200; //墨尔本在当地时间 2023-10-01 03:00:00(UTC+11) ,对应  UTC时间： 2023-09-30 16:00:00(UTC+0) 
	utcTime = TimezoneUtils::GetUTCTime(locTime, "Australia/Melbourne");
	std::cout << "Australia/Melbourne:" << "locTime:" << locTime << ", utcTime:" << utcTime << '\n';

	std::cout << "-------------" << '\n';
	//for (int i = 0; i < 24; i++) {
	//  std::cout << "\t+++++++++"<< '\n'; 
	//	locTime = 1696089601 + i*3600; //墨尔本在当地时间 2023-10-01 03:00:01(UTC+11) ,对应  UTC时间： 2023-09-30 16:00:01(UTC+0) ？？？？
	//	utcTime = TimezoneUtils::GetUTCTime(locTime, "Australia/Melbourne");
	//	std::cout << "Australia/Melbourne:i=" << i << "==="<<"locTime:"<< locTime << ", utcTime:"<< utcTime << '\n';

	//}

	std::cout << "-------------" << '\n';
	locTime = 1696860000; //墨尔本在当地时间 2023-10-10 00:00:00(UTC+11) ,对应  UTC时间： 2023-10-09 14:00:00(UTC+0) 
	utcTime = TimezoneUtils::GetUTCTime(locTime, "Australia/Melbourne");
	std::cout << "Australia/Melbourne:" << "locTime:" << locTime << ", utcTime:" << utcTime << '\n';

	std::cout << "-------------" << '\n';
	//注意：由于夏令时回调1小时原因，墨尔本在当地时间 2024-04-07 02:00:00 可能存在二个时区 UTC+11 或 UTC+10
	locTime = 1712455200; //墨尔本在当地时间 2024-04-07 02:00:00(UTC+11) 或者 2024-04-07 02:00:00(UTC+10) ,对应  UTC时间： 2024-04-01 15:00:00(UTC+0)  或者 2024-04-01 16:00:00(UTC+0) 
	utcTime = TimezoneUtils::GetUTCTime(locTime, "Australia/Melbourne");
	std::cout << "Australia/Melbourne:" << "locTime:" << locTime << ", utcTime:" << utcTime << '\n';

	//注意：由于夏令时回调1小时原因, 墨尔本在当地时间 [2024-04-07 02:00:00, 2024-04-07 03:00:00） 之间，转出 UTC 时间存在二义性
	locTime = 1712455201; //墨尔本在当地时间 2024-04-07 02:00:01(UTC+11) 或者 2024-04-07 02:00:01(UTC+10) ,对应  UTC时间： 2024-04-01 15:00:01(UTC+0)  或者 2024-04-01 16:00:01(UTC+0) 
	utcTime = TimezoneUtils::GetUTCTime(locTime, "Australia/Melbourne");
	std::cout << "Australia/Melbourne:" << "locTime:" << locTime << ", utcTime:" << utcTime << '\n';

	std::cout << "-------------" << '\n';
	locTime = 1712458800; //墨尔本在当地时间 2024-04-07 03:00:00(UTC+11) ,对应  UTC时间： 2024-04-01 16:00:00(UTC+0) 
	utcTime = TimezoneUtils::GetUTCTime(locTime, "Australia/Melbourne");
	std::cout << "Australia/Melbourne:" << "locTime:" << locTime << ", utcTime:" << utcTime << '\n';

	//std::cout << "-------------" << '\n';
	//for (int i = 0; i < 24; i++) {
	//  std::cout << "\t+++++++++"<< '\n'; 
	//	locTime = 1712458800 + i*3600; //墨尔本在当地时间 2023-10-01 03:00:01(UTC+11) ,对应  UTC时间： 2023-09-30 16:00:01(UTC+0) ？？？？
	//	utcTime = TimezoneUtils::GetUTCTime(locTime, "Australia/Melbourne");
	//	std::cout << "Australia/Melbourne:i=" << i << "==="<<"locTime:"<< locTime << ", utcTime:"<< utcTime << '\n';
	//}
}

void TestGetTimezoneOffset() {
	std::cout << "TestGetTimezoneOffset=============" << endl;
	auto startTime = std::chrono::high_resolution_clock::now();

	time_t utcTime = std::time(nullptr);
	int count = 1;
	for (int i = 0; i < count; i++) {
		int offset = TimezoneUtils::GetTimezoneOffsetByStart(utcTime, "Asia/Shanghai", "Australia/Melbourne");
		//std::cout << "TZ offset:" << offset << endl;

	}
	auto endTime = std::chrono::high_resolution_clock::now();
	auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
	std::cout << "TestGetTimezoneOffset end, count:" << count << ", speed time:" << duration <<" milliseconds =============" << endl;
	duration = std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count();
	std::cout << "TestGetTimezoneOffset end, count:" << count << ", speed time:" << duration << " microseconds =============" << endl;
	duration = std::chrono::duration_cast<std::chrono::nanoseconds>(endTime - startTime).count();
	std::cout << "TestGetTimezoneOffset end, count:" << count << ", speed time:" << duration << " nanoseconds =============" << endl;
}

#endif //_TEST_