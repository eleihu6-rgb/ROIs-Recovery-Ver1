#include <gtest/gtest.h>

#include <ctime>

#include "Utility.h"

namespace {

// Cross-platform gmtime wrapper.
void GmTimeUtc(const time_t& t, tm& out) {
#ifdef WIN32
    _gmtime32_s(&out, (const __time32_t*)&t);
#else
    gmtime_r(&t, &out);
#endif
}

}  // namespace

class UtilityWeekStartTest : public ::testing::Test {};

// For offset 0 and weekdayStartFrom="SUN", the start should be a Sunday
// not later than the input time and within 7 days.
TEST_F(UtilityWeekStartTest, SundayWeekStartUtcZero) {
    auto* util = Utility::GetInstancePtr();
	time_t utc = util->UTCStrToUTC(const_cast<char*>("2025-11-20 12:00:00")); // Thursday 12pm

    time_t startUtc = util->getLocalWeekStartInUTC(utc, "SUN", 0);

    tm startTm{};
    GmTimeUtc(startUtc, startTm);

    // Week start is Sunday in UTC when weekdayStartFrom = SUN.
    EXPECT_EQ(0, startTm.tm_wday);

    // Start must not be after the input time and must be within the last 7 days.
    EXPECT_LE(startUtc, utc);
    EXPECT_LT(utc - startUtc, 7 * 24 * 60 * 60);
	EXPECT_EQ(utc - startUtc, (4 * 24 + 12) * 60 * 60); // Sunday 00:00 to Thursday 12:00
}

// For offset 0 and weekdayStartFrom="MON", the start should be a Monday
// not later than the input time and within 7 days.
TEST_F(UtilityWeekStartTest, MondayWeekStartUtcZero) {
    auto* util = Utility::GetInstancePtr();
    time_t utc = util->UTCStrToUTC(const_cast<char*>("2025-11-20 12:00:00")); // Thursday 12pm

    time_t startUtc = util->getLocalWeekStartInUTC(utc, "MON", 0);

    tm startTm{};
    GmTimeUtc(startUtc, startTm);

    EXPECT_EQ(1, startTm.tm_wday);  // Monday
    EXPECT_LE(startUtc, utc);
    EXPECT_LT(utc - startUtc, 7 * 24 * 60 * 60);
	EXPECT_EQ(utc - startUtc, (3 * 24 + 12) * 60 * 60); // Monday 00:00 to Thursday 12:00
}

// For a non-zero offset, the local week start should align to the requested weekday
// in local time (UTC + offsetMinutes).
TEST_F(UtilityWeekStartTest, WednesdayWeekStartWithOffset) {
    auto* util = Utility::GetInstancePtr();

    // Arbitrary UTC time; we only care about relative behaviour.
	time_t utc = util->UTCStrToUTC(const_cast<char*>("2024-03-15 10:30:00")); // Friday 10:30am UTC, which is Friday 18:30 in UTC+8

    const int offsetMinutes = 480; // UTC+8
    time_t startUtc = util->getLocalWeekStartInUTC(utc, "WED", offsetMinutes); // local week start should be Tuesday 16:00 in UTC

    // Convert to local time by adding offset and check weekday.
	time_t localStart = startUtc + static_cast<time_t>(offsetMinutes) * 60; 

    tm localTm{};
    GmTimeUtc(localStart, localTm);
    tm utcTm{};
    GmTimeUtc(startUtc, utcTm);

    // Wednesday in tm_wday is 3 (0=Sun,1=Mon,...).
    EXPECT_EQ(3, localTm.tm_wday);

    // Local week start must not be after the original local time and must be within 7 days.
    time_t localInput = utc + static_cast<time_t>(offsetMinutes) * 60;
    EXPECT_LE(startUtc, utc + 7 * 24 * 60 * 60); // sanity bound in UTC space
    EXPECT_LE(localStart, localInput);
    EXPECT_LT(localInput - localStart, 7 * 24 * 60 * 60);
	
    EXPECT_EQ(utcTm.tm_wday, 2);
    EXPECT_EQ(utcTm.tm_hour, 16);
    EXPECT_EQ(utcTm.tm_min, 0);
    EXPECT_EQ(utcTm.tm_sec, 0);
}

// If week starts on Monday, a local time on Sunday should map back to
// the Monday of that same week.
TEST_F(UtilityWeekStartTest, MondayWeekStartMapsSundayToPreviousMonday) {
    auto* util = Utility::GetInstancePtr();

    const int offsetMinutes = -240;
	time_t utcSundayNoon = util->UTCStrToUTC(const_cast<char*>("2025-11-24 03:59:59")); // UTC-4, which is Sunday 11:59:59 local time 
    
    time_t startUtc = util->getLocalWeekStartInUTC(utcSundayNoon, "MON", offsetMinutes);

    time_t localStart = startUtc + static_cast<time_t>(offsetMinutes) * 60;
    time_t localInput = utcSundayNoon + static_cast<time_t>(offsetMinutes) * 60;

    tm startTm{};
    GmTimeUtc(localStart, startTm);

    // Week start should be Monday.
    EXPECT_EQ(1, startTm.tm_wday);

    // Monday must be strictly before Sunday noon and within 7 days.
    EXPECT_LT(localStart, localInput);
    int daysDiff = static_cast<int>((localInput - localStart) / (24 * 60 * 60));
    EXPECT_EQ(6, daysDiff);  // Monday to Sunday spans 6 full days.
}

// If week starts on Sunday, a local time exactly at Sunday 00:00 should
// return the same timestamp.
TEST_F(UtilityWeekStartTest, SundayWeekStartFromSundayMidnightReturnsSameTime) {
    auto* util = Utility::GetInstancePtr();

    // 1970-01-04 00:00:00 local (Sunday midnight).
    time_t utcSundayMidnight = util->UTCStrToUTC(const_cast<char*>("1970-01-04 00:00:00"));

    const int offsetMinutes = 0;
    time_t startUtc = util->getLocalWeekStartInUTC(utcSundayMidnight, "SUN", offsetMinutes);

    EXPECT_EQ(utcSundayMidnight, startUtc);
}
