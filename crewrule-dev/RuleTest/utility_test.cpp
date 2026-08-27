#include "Utility.h"
#include <vector>

#ifndef ASSERT
#define ASSERT(x)                                                       \
{    if (!(x)) {                                                        \
        abort ();                                                       \
    }                                                                   \
}
#endif

using namespace std;

namespace offset_tests {

	bool getLocalDayStartInUTC_test() {

		std::vector<std::tuple<time_t, int, time_t>> testing = {
			// utc, offset minutes, local start in utc
		  {1682299500, 570, 1682260200}, // 1682299500 converts to Monday April 24, 2023 10:55:00 (am) in time zone Australia/Darwin (ACST)
		  {1680567600, 480, 1680537600}, // 2023年4月4日星期二早上8点20分 GMT+08:00
		  {1682299500, -420, 1682233200}, // Sunday April 23, 2023 18:25:00 -7:00 LAX
		  {1682683200, 0, 1682640000}, // UTC Friday, 28 April 2023 12:00:00.000
		  {1682640000, 0, 1682640000}, // UTC Friday, 28 April 2023 00:00:00.000
		};
		for (const auto& p : testing) {
			auto utc = get<0>(p);
			auto offset = get<1>(p);
			auto utcDayStart = get<2>(p);
			ASSERT(Utility::GetInstancePtr()->getLocalDayStartInUTC(utc, offset) == utcDayStart);
		}
		return true;
	}

	bool getLocalMonthStartInUTC_test() {

		std::vector<std::tuple<time_t, int, time_t>> testing = {
		// utc, offset minutes, local start in utc
		  {1682299500, 570, 1680273000}, // 1682299500 converts to Monday April 24, 2023 10:55:00 (am) in time zone Australia/Darwin (ACST)
		  {1680567600, 480, 1680278400}, // 2023年4月4日星期二早上8点20分 GMT+08:00
		  {1682299500, -420, 1680332400}, // Sunday April 23, 2023 18:25:00 -7:00 LAX
		  {1682683200, 0, 1680307200}, // UTC Friday, 28 April 2023 12:00:00.000
		  {1682640000, 0, 1680307200}, // UTC Friday, 28 April 2023 00:00:00.000
		};
		for (const auto& p : testing) {
			auto utc = get<0>(p);
			auto offset = get<1>(p);
			auto utcDayStart = get<2>(p);
			ASSERT(Utility::GetInstancePtr()->getLocalMonthStartInUTC(utc, offset) == utcDayStart);
		}
		return true;
	}

	bool run() {
		return getLocalDayStartInUTC_test() &&
			getLocalMonthStartInUTC_test();
	}
}

bool utility_test() {
	return offset_tests::run();
}
