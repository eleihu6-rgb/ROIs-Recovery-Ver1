#include <gtest/gtest.h>

#include <array>
#include <cstdlib>
#include <ctime>
#include <string>

#include "orUtil/time64.h"

namespace {

struct UtcCase {
    int year;
    int month;
    int day;
    int hour;
    int minute;
    int second;
    t64 expected;
};

struct RoundTripCase {
    t64 timestamp;
    int year;
    int month;
    int day;
    int hour;
    int minute;
    int second;
};

tm makeUtcTm(int year, int month, int day, int hour, int minute, int second) {
    tm value{};
    value.tm_year = year - 1900;
    value.tm_mon = month - 1;
    value.tm_mday = day;
    value.tm_hour = hour;
    value.tm_min = minute;
    value.tm_sec = second;
    value.tm_isdst = 0;
    return value;
}

void expectTmUtcEq(const tm& actual, const RoundTripCase& expected) {
    EXPECT_EQ(expected.year - 1900, actual.tm_year);
    EXPECT_EQ(expected.month - 1, actual.tm_mon);
    EXPECT_EQ(expected.day, actual.tm_mday);
    EXPECT_EQ(expected.hour, actual.tm_hour);
    EXPECT_EQ(expected.minute, actual.tm_min);
    EXPECT_EQ(expected.second, actual.tm_sec);
}

#ifndef _WIN32
class ScopedTimezone {
public:
    explicit ScopedTimezone(const char* tzValue) {
        const char* current = getenv("TZ");
        if (current != nullptr) {
            _hadOriginal = true;
            _original = current;
        }

        setenv("TZ", tzValue, 1);
        tzset();
    }

    ~ScopedTimezone() {
        if (_hadOriginal) {
            setenv("TZ", _original.c_str(), 1);
        } else {
            unsetenv("TZ");
        }
        tzset();
    }

private:
    bool _hadOriginal = false;
    std::string _original;
};
#endif

}  // namespace

TEST(Mktime64Test, DirectUtcCasesReturnExpectedEpochSeconds) {
    const std::array<UtcCase, 4> cases{{
        {1970, 1, 1, 0, 0, 0, 0},
        {1969, 12, 31, 23, 59, 59, -1},
        {2000, 2, 29, 12, 34, 56, 951827696},
        {2038, 1, 19, 3, 14, 8, 2147483648LL},
    }};

    for (const auto& testCase : cases) {
        tm utcTm = makeUtcTm(
            testCase.year,
            testCase.month,
            testCase.day,
            testCase.hour,
            testCase.minute,
            testCase.second);

        EXPECT_EQ(testCase.expected, mktime_64(&utcTm))
            << "UTC case failed for "
            << testCase.year << "-" << testCase.month << "-" << testCase.day
            << " " << testCase.hour << ":" << testCase.minute << ":" << testCase.second;
    }
}

TEST(Mktime64Test, Gmtime64RoundTripsRepresentativeTimestamps) {
    const std::array<RoundTripCase, 5> cases{{
        {0, 1970, 1, 1, 0, 0, 0},
        {-1, 1969, 12, 31, 23, 59, 59},
        {951827696, 2000, 2, 29, 12, 34, 56},
        {1709251199, 2024, 2, 29, 23, 59, 59},
        {2147483648LL, 2038, 1, 19, 3, 14, 8},
    }};

    for (const auto& testCase : cases) {
        tm* utcTm = gmtime_64(testCase.timestamp);
        ASSERT_NE(nullptr, utcTm);
        expectTmUtcEq(*utcTm, testCase);

        tm roundTripTm = *utcTm;
        EXPECT_EQ(testCase.timestamp, mktime_64(&roundTripTm))
            << "Round-trip failed for timestamp " << testCase.timestamp;
    }
}

TEST(Mktime64Test, Gmtime64SProducesSameUtcBreakdownAsGmtime64) {
    constexpr t64 timestamp = 951827696;

    tm fromSafeApi{};
    gmtime_64_s(timestamp, &fromSafeApi);

    tm* fromStaticApi = gmtime_64(timestamp);
    ASSERT_NE(nullptr, fromStaticApi);

    EXPECT_EQ(fromStaticApi->tm_year, fromSafeApi.tm_year);
    EXPECT_EQ(fromStaticApi->tm_mon, fromSafeApi.tm_mon);
    EXPECT_EQ(fromStaticApi->tm_mday, fromSafeApi.tm_mday);
    EXPECT_EQ(fromStaticApi->tm_hour, fromSafeApi.tm_hour);
    EXPECT_EQ(fromStaticApi->tm_min, fromSafeApi.tm_min);
    EXPECT_EQ(fromStaticApi->tm_sec, fromSafeApi.tm_sec);
    EXPECT_EQ(fromStaticApi->tm_wday, fromSafeApi.tm_wday);
    EXPECT_EQ(fromStaticApi->tm_yday, fromSafeApi.tm_yday);
}

#ifndef _WIN32
TEST(Mktime64LinuxTest, DirectUtcConversionIgnoresProcessTimezone) {
    ScopedTimezone tz("Asia/Shanghai");

    tm utcTm = makeUtcTm(1970, 1, 1, 0, 0, 0);
    tm legacyTm = utcTm;

    const t64 actual = mktime_64(&utcTm);
    const t64 legacyLocalFormula = static_cast<t64>(mktime(&legacyTm)) + legacyTm.tm_gmtoff;

    EXPECT_EQ(0, actual);
    EXPECT_NE(legacyLocalFormula, actual);
}

TEST(Mktime64LinuxTest, Gmtime64RoundTripRemainsStableInNonUtcTimezone) {
    ScopedTimezone tz("America/New_York");

    const std::array<t64, 4> timestamps{{0, -1, 951827696, 2147483648LL}};

    for (t64 timestamp : timestamps) {
        tm* utcTm = gmtime_64(timestamp);
        ASSERT_NE(nullptr, utcTm);

        tm roundTripTm = *utcTm;
        EXPECT_EQ(timestamp, mktime_64(&roundTripTm))
            << "Timezone-sensitive round-trip failed for timestamp " << timestamp;
    }
}
#endif
