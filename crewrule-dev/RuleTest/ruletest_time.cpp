#include <gtest/gtest.h>
#include <string>
#include <tuple>
#include <vector>

#include "utils/TimeUtils.h"

namespace {

TEST(TimeUtilsTest, AddWeekAndIsSameHandleLeapBoundaries) {
    const time_t aprilFirst2024Utc = 1711929600;  // 2024-04-01 00:00:00 UTC
    EXPECT_EQ(TimeUtils::AddWeek(aprilFirst2024Utc, 2), 1713139200);
    EXPECT_EQ(TimeUtils::AddWeek(aprilFirst2024Utc, -2), 1710720000);

    EXPECT_TRUE(TimeUtils::IsSame(1677542400, 1677542401, ChronoUnit::DAYS));   // 2023-02-28
    EXPECT_TRUE(TimeUtils::IsSame(1709164800, 1709164801, ChronoUnit::DAYS));   // 2024-02-29
}

TEST(TimeUtilsTest, FloorAndCeilReturnExpectedEpochs) {
    const time_t time = 1672569629;  // 2023-01-01 10:40:29 UTC
    EXPECT_EQ(TimeUtils::Floor(time, ChronoUnit::HOURS), 1672567200);
    EXPECT_EQ(TimeUtils::Ceil(time, ChronoUnit::HOURS), 1672570800);

    EXPECT_EQ(TimeUtils::Floor(time, ChronoUnit::DAYS), 1672531200);
    EXPECT_EQ(TimeUtils::Ceil(time, ChronoUnit::DAYS), 1672617600);

    const time_t dayBoundary = 1672531200;  // already aligned to midnight
    EXPECT_EQ(TimeUtils::Floor(dayBoundary, ChronoUnit::DAYS), dayBoundary);
}

TEST(TimeUtilsTest, GetAbsoluteTimeResolvesSameAndNextDayRanges) {
    time_t startTime = 0;
    time_t endTime = 0;
    const time_t baseTime = 1672567920;  // 2023-01-01 10:12:00 UTC

    TimeUtils::GetAbsoluteTime(startTime, endTime, baseTime, "22:00", "05:00");
    EXPECT_EQ(startTime, 1672610400);  // 2023-01-01 22:00:00 UTC
    EXPECT_EQ(endTime, 1672635600);    // 2023-01-02 05:00:00 UTC

    TimeUtils::GetAbsoluteTime(startTime, endTime, baseTime, "22:00", "23:00");
    EXPECT_EQ(startTime, 1672610400);  // 2023-01-01 22:00:00 UTC
    EXPECT_EQ(endTime, 1672614000);    // 2023-01-01 23:00:00 UTC
}

TEST(TimeUtilsTest, TruncateNormalizesToRequestedUnits) {
    const time_t source = 1672569629;  // 2023-01-01 10:40:29 UTC

    struct TruncateCase {
        ChronoUnit unit;
        time_t expected;
    };

    const std::vector<TruncateCase> cases = {
        {ChronoUnit::SECONDS, 1672569600},
        {ChronoUnit::MINUTES, 1672567200},
        {ChronoUnit::HOURS, 1672567200},
        {ChronoUnit::DAYS, 1672531200},
        {ChronoUnit::WEEKS, 1672531200},
        {ChronoUnit::MONTHS, 1672531200},
        {ChronoUnit::YEARS, 1672531200},
    };

    for (const auto& tc : cases) {
        SCOPED_TRACE(static_cast<int>(tc.unit));
        EXPECT_EQ(TimeUtils::Truncate(source, tc.unit), tc.expected);
    }

    const time_t janThird = 1672711956;  // 2023-01-03 02:12:36 UTC
    EXPECT_EQ(TimeUtils::Truncate(janThird, ChronoUnit::WEEKS), 1672531200);
    EXPECT_EQ(TimeUtils::Truncate(janThird, ChronoUnit::MONTHS), 1672531200);
}

TEST(TimeUtilsTest, IsTimesCoveredHandlesCrossMidnightWindows) {
    struct CoverageCase {
        time_t start;
        time_t end;
        bool expected;
    };

    const std::vector<CoverageCase> cases = {
        {1728950400, 1728970140, true},
        {1728950400, 1728970200, true},
        {1728970200, 1729033200, true},
        {1728970260, 1729033140, false},
        {1729033140, 1729036740, true},
        {1729033200, 1729056600, true},
        {1729036800, 1729056600, true},
        {1729056600, 1729119540, true},
        {1729056660, 1729119540, false},
        {1729056660, 1729119600, true},
    };

    for (const auto& tc : cases) {
        SCOPED_TRACE(::testing::Message()
                     << "start=" << tc.start << " end=" << tc.end);
        EXPECT_EQ(TimeUtils::IsTimesCovered(tc.start, tc.end, 1380, 330), tc.expected);
    }
}

TEST(TimeUtilsTest, IsTimesCoveredHandlesSameDayWindows) {
    struct CoverageCase {
        time_t start;
        time_t end;
        bool expected;
    };

    const std::vector<CoverageCase> cases = {
        {1728950400, 1728957540, false},
        {1728950400, 1728957600, true},
        {1728957600, 1728968400, true},
        {1728957540, 1728968460, true},
        {1728968400, 1729044000, true},
        {1728968460, 1729043940, false},
        {1728968460, 1729130340, true},
        {1728968460, 1729044000, true},
    };

    for (const auto& tc : cases) {
        SCOPED_TRACE(::testing::Message()
                     << "start=" << tc.start << " end=" << tc.end);
        EXPECT_EQ(TimeUtils::IsTimesCovered(tc.start, tc.end, 120, 300), tc.expected);
    }
}

TEST(TimeUtilsTest, IsTimesCoveredHandlesArbitraryIntervals) {
    struct ArbitraryCase {
        time_t start;
        time_t end;
        int targetStart;
        int targetEnd;
        bool expected;
    };

    const std::vector<ArbitraryCase> cases = {
        {1729032900, 1729061640, 1380, 330, true},
        {1729476600, 1729498800, 1380, 330, true},
        {1729032900, 1729061640, 480, 1375, true},
        {1729032900, 1729061640, 414, 1374, true},
        {1729032900, 1729061640, 415, 1374, false},
        {1729032900, 1729061640, 480, 1374, false},
    };

    for (const auto& tc : cases) {
        SCOPED_TRACE(::testing::Message()
                     << "start=" << tc.start << " end=" << tc.end
                     << " targetStart=" << tc.targetStart
                     << " targetEnd=" << tc.targetEnd);
        EXPECT_EQ(TimeUtils::IsTimesCovered(tc.start, tc.end, tc.targetStart, tc.targetEnd),
                  tc.expected);
    }
}

}  // namespace
