
#include <gtest/gtest.h>
#include "RuleEngine/rule/framework/utils/TimeUtils.h"

// 辅助函数：根据日期时间生成time_t
inline static time_t createTime(int year, int month, int day, int hour, int minute, int second) {
    struct tm tm_info = {};
    tm_info.tm_year = year - 1900;  // 年份从1900开始计算
    tm_info.tm_mon = month - 1;     // 月份从0开始计算
    tm_info.tm_mday = day;
    tm_info.tm_hour = hour;
    tm_info.tm_min = minute;
    tm_info.tm_sec = second;
    tm_info.tm_isdst = 0;           // 不考虑夏令时

    return TimeUtils::mkgmtime(&tm_info);
}

namespace TimeUtilsTest::GetOverlapPeriods {

    class GetOverlapPeriodsTest : public ::testing::Test {
    protected:
        void SetUp() override {}

        void TearDown() override {}
    };

    TEST_F(GetOverlapPeriodsTest, NoOverlap) {
        // Input: [2023/1/1 10:12, 2023/1/1 21:59] [22:00,05:00]
        // Expected: [] (empty)
        time_t startTime = createTime(2023, 1, 1, 10, 12, 0);  // 2023-01-01 10:12:00
        time_t endTime = createTime(2023, 1, 1, 21, 59, 0);    // 2023-01-01 21:59:00

        auto result = TimeUtils::GetOverlapPeriods(startTime, endTime, 1320, 300);
        
        EXPECT_EQ(result.size(), 0);
    }

    TEST_F(GetOverlapPeriodsTest, PartialOverlapSingleDay) {
        // Input: [2023/1/1 10:12, 2023/1/1 22:00] [22:00,05:00]
        // Expected: [<2023-01-01 22:00,2023-01-02 05:00>]
        time_t startTime = createTime(2023, 1, 1, 10, 12, 0);  // 2023-01-01 10:12:00
        time_t endTime = createTime(2023, 1, 1, 22, 0, 0);     // 2023-01-01 22:00:00

        auto result = TimeUtils::GetOverlapPeriods(startTime, endTime, 1320, 300);
        
        EXPECT_EQ(result.size(), 1);
        time_t expectedStart = createTime(2023, 1, 1, 22, 0, 0);  // 2023-01-01 22:00:00
        time_t expectedEnd = createTime(2023, 1, 2, 5, 0, 0);    // 2023-01-02 05:00:00
        
        EXPECT_EQ(std::get<0>(result[0]), expectedStart);
        EXPECT_EQ(std::get<1>(result[0]), expectedEnd);
    }

    TEST_F(GetOverlapPeriodsTest, FullOverlapSingleDay) {
        // Input: [2023/1/1 20:00, 2023/1/2 10:00] [22:00,05:00]
        // Expected: [<2023-01-01 22:00,2023-01-02 05:00>]
        time_t startTime = createTime(2023, 1, 1, 20, 0, 0);  // 2023-01-01 20:00:00
        time_t endTime = createTime(2023, 1, 2, 10, 0, 0);    // 2023-01-02 10:00:00

        auto result = TimeUtils::GetOverlapPeriods(startTime, endTime, 1320, 300);
        
        EXPECT_EQ(result.size(), 1);
        time_t expectedStart = createTime(2023, 1, 1, 22, 0, 0);  // 2023-01-01 22:00:00
        time_t expectedEnd = createTime(2023, 1, 2, 5, 0, 0);    // 2023-01-02 05:00:00
        
        EXPECT_EQ(std::get<0>(result[0]), expectedStart);
        EXPECT_EQ(std::get<1>(result[0]), expectedEnd);
    }

    TEST_F(GetOverlapPeriodsTest, MultiDayOverlap) {
        // Input: [2023/1/1 10:12, 2023/1/4 15:12] [22:00,05:00]
        // Expected: [<2023-01-01 22:00,2023-01-02 05:00>,<2023-01-02 22:00,2023-01-03 05:00>,<2023-01-03 22:00,2023-01-04 05:00>]
        time_t startTime = createTime(2023, 1, 1, 10, 12, 0);  // 2023-01-01 10:12:00
        time_t endTime = createTime(2023, 1, 4, 15, 12, 0);    // 2023-01-04 15:12:00

        auto result = TimeUtils::GetOverlapPeriods(startTime, endTime, 1320, 300);
        
        EXPECT_EQ(result.size(), 3);
        
        // First overlap: 2023-01-01 22:00 to 2023-01-02 05:00
        time_t expectedStart1 = createTime(2023, 1, 1, 22, 0, 0);
        time_t expectedEnd1 = createTime(2023, 1, 2, 5, 0, 0);
        EXPECT_EQ(std::get<0>(result[0]), expectedStart1);
        EXPECT_EQ(std::get<1>(result[0]), expectedEnd1);
        
        // Second overlap: 2023-01-02 22:00 to 2023-01-03 05:00
        time_t expectedStart2 = createTime(2023, 1, 2, 22, 0, 0);
        time_t expectedEnd2 = createTime(2023, 1, 3, 5, 0, 0);
        EXPECT_EQ(std::get<0>(result[1]), expectedStart2);
        EXPECT_EQ(std::get<1>(result[1]), expectedEnd2);
        
        // Third overlap: 2023-01-03 22:00 to 2023-01-04 05:00
        time_t expectedStart3 = createTime(2023, 1, 3, 22, 0, 0);
        time_t expectedEnd3 = createTime(2023, 1, 4, 5, 0, 0);
        EXPECT_EQ(std::get<0>(result[2]), expectedStart3);
        EXPECT_EQ(std::get<1>(result[2]), expectedEnd3);
    }

    TEST_F(GetOverlapPeriodsTest, SameTimeRange) {
        // Test when time range matches exactly with daily range
        time_t startTime = createTime(2023, 1, 1, 22, 0, 0);  // 2023-01-01 22:00:00
        time_t endTime = createTime(2023, 1, 2, 5, 0, 0);    // 2023-01-02 05:00:00

        auto result = TimeUtils::GetOverlapPeriods(startTime, endTime, 1320, 300);
        
        EXPECT_EQ(result.size(), 1);
        EXPECT_EQ(std::get<0>(result[0]), startTime);
        EXPECT_EQ(std::get<1>(result[0]), endTime);
    }

    TEST_F(GetOverlapPeriodsTest, NonCrossDayRange) {
        // Test with a non-cross-day range like 08:00 to 17:00
        time_t startTime = createTime(2023, 1, 1, 7, 0, 0);   // 2023-01-01 07:00:00
        time_t endTime = createTime(2023, 1, 2, 18, 0, 0);    // 2023-01-02 18:00:00

        auto result = TimeUtils::GetOverlapPeriods(startTime, endTime, 8*60, 17*60);  // 08:00 to 17:00
        
        EXPECT_EQ(result.size(), 2);
        
        // First overlap: 2023-01-01 08:00 to 2023-01-01 17:00
        time_t expectedStart1 = createTime(2023, 1, 1, 8, 0, 0);
        time_t expectedEnd1 = createTime(2023, 1, 1, 17, 0, 0);
        EXPECT_EQ(std::get<0>(result[0]), expectedStart1);
        EXPECT_EQ(std::get<1>(result[0]), expectedEnd1);
        
        // Second overlap: 2023-01-02 08:00 to 2023-01-02 17:00
        time_t expectedStart2 = createTime(2023, 1, 2, 8, 0, 0);
        time_t expectedEnd2 = createTime(2023, 1, 2, 17, 0, 0);
        EXPECT_EQ(std::get<0>(result[1]), expectedStart2);
        EXPECT_EQ(std::get<1>(result[1]), expectedEnd2);
    }

    TEST_F(GetOverlapPeriodsTest, WithTimeZoneOffset) {
        // Test with timezone offset
        time_t startTime = createTime(2023, 1, 1, 20, 0, 0);  // 2023-01-01 20:00:00 UTC
        time_t endTime = createTime(2023, 1, 2, 10, 0, 0);    // 2023-01-02 10:00:00 UTC

        // Using +8 hours timezone offset
        auto result = TimeUtils::GetOverlapPeriods(startTime, endTime, 1320, 300, 8 * 60);
        
        // With +8 hours offset: UTC 20:00 becomes local 04:00, UTC 10:00 next day becomes local 18:00
        // So we're looking for overlaps between [2023-01-02 04:00, 2023-01-02 18:00] local time
        // and daily range [22:00, 05:00] (crossing midnight)
        EXPECT_EQ(result.size(), 1);
        
        // The overlap occurs during the second day in local time
        time_t expectedStart = createTime(2023, 1, 1, 14, 0, 0);  //2023-01-01 14:00 UTC+8 -> 2023-01-01 22:00 Local
        time_t expectedEnd = createTime(2023, 1, 1, 21, 0, 0);    // 2023-01-01 21:00 UTC+8 -> 2023-01-02 05:00 Local
        
        EXPECT_EQ(std::get<0>(result[0]), expectedStart);
        EXPECT_EQ(std::get<1>(result[0]), expectedEnd);
    }

    TEST_F(GetOverlapPeriodsTest, EdgeCaseExactMatch) {
        // Test edge case where the input time range exactly matches a single daily period
        time_t startTime = createTime(2023, 1, 1, 22, 0, 0);  // 2023-01-01 22:00:00
        time_t endTime = createTime(2023, 1, 2, 5, 0, 0);    // 2023-01-02 05:00:00

        auto result = TimeUtils::GetOverlapPeriods(startTime, endTime, 1320, 300);
        
        EXPECT_EQ(result.size(), 1);
        EXPECT_EQ(std::get<0>(result[0]), startTime);
        EXPECT_EQ(std::get<1>(result[0]), endTime);
    }

    TEST_F(GetOverlapPeriodsTest, EmptyRange) {
        // Test with empty input time range
        time_t startTime = createTime(2023, 1, 1, 10, 0, 0);  // 2023-01-01 10:00:00
        time_t endTime = createTime(2023, 1, 1, 9, 0, 0);     // 2023-01-01 09:00:00 (before start)

        auto result = TimeUtils::GetOverlapPeriods(startTime, endTime, 1320, 300);
        
        EXPECT_EQ(result.size(), 0);
    }

}

namespace TimeUtilsTest::CalculateFullDaysBetweenTimes{
    class CalculateFullDaysBetweenTimesTest : public ::testing::Test {
    protected:
        void SetUp() override {}

        void TearDown() override {}
    };

    TEST_F(CalculateFullDaysBetweenTimesTest, NormalCase) {
        // 正常情况下，计算两个日期之间的完整天数
        // 例如：2023年1月1日到2023年1月5日之间应该有4个完整天数
        time_t time1 = createTime(2023, 1, 1, 0, 0, 0);  // 2023-01-01 00:00:00
        time_t time2 = createTime(2023, 1, 5, 0, 0, 0);  // 2023-01-05 00:00:00

        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 4);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, SameDay) {
        // 同一天的情况，应该返回0
        time_t time1 = createTime(2023, 1, 1, 10, 30, 0);  // 2023-01-01 10:30:00
        time_t time2 = createTime(2023, 1, 1, 18, 45, 0);  // 2023-01-01 18:45:00

        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 0);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, ConsecutiveDays) {
        // 连续两天的情况，应该返回1
        time_t time1 = createTime(2023, 1, 1, 0, 0, 0);   // 2023-01-01 00:00:00
        time_t time2 = createTime(2023, 1, 2, 0, 0, 0);   // 2023-01-02 00:00:00

        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 1);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, LessThanOneDay) {
        // 少于一天的情况，应该返回0
        time_t time1 = createTime(2023, 1, 1, 0, 0, 0);   // 2023-01-01 00:00:00
        time_t time2 = createTime(2023, 1, 1, 23, 59, 59); // 2023-01-01 23:59:59

        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 0);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, WithTimeZoneOffset) {
        // 使用时区偏移的情况
        time_t time1 = createTime(2023, 1, 1, 16, 0, 0);  // 2023-01-01 16:00:00 UTC
        time_t time2 = createTime(2023, 1, 2, 5, 0, 0);   // 2023-01-02 05:00:00 UTC

        // 使用+8小时时区偏移，time1变成2023-01-02 00:00:00，time2变成2023-01-02 13:00:00
        // 所以应该返回0
        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2, 8 * 60);
        EXPECT_EQ(result, 0);

        // 使用-5小时时区偏移，time1变成2023-01-01 11:00:00，time2变成2023-01-01 00:00:00
        // 但因为算法会调整非0点开始的时间，所以仍会返回正确的结果
        result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2, -5 * 60);
        // time1变成2022-12-31 11:00:00，time2变成2022-12-31 19:00:00
        // 所以仍然返回0
        EXPECT_EQ(result, 0);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, EqualTimes) {
        // 相等时间的情况，应该返回0
        time_t time1 = createTime(2023, 1, 1, 12, 30, 45);  // 2023-01-01 12:30:45
        time_t time2 = createTime(2023, 1, 1, 12, 30, 45);  // 2023-01-01 12:30:45

        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 0);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, AcrossMonths) {
        // 跨越月份的情况
        time_t time1 = createTime(2023, 1, 31, 0, 0, 0);  // 2023-01-31 00:00:00
        time_t time2 = createTime(2023, 2, 2, 0, 0, 0);   // 2023-02-02 00:00:00

        // 从2023-01-31 00:00:00 到 2023-02-02 00:00:00
        // 完整天数：2023-01-31, 2023-02-01 (2天)
        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 2);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, AcrossYears) {
        // 跨越年份的情况
        time_t time1 = createTime(2022, 12, 31, 0, 0, 0);  // 2022-12-31 00:00:00
        time_t time2 = createTime(2023, 1, 3, 0, 0, 0);    // 2023-01-03 00:00:00

        // 从2022-12-31 00:00:00 到 2023-01-03 00:00:00
        // 完整天数：2022-12-31, 2023-01-01, 2023-01-02 (3天)
        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 3);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, NonMidnightStartTimeAdjustment) {
        // 非午夜开始时间调整的测试
        time_t time1 = createTime(2023, 1, 1, 10, 30, 0);  // 2023-01-01 10:30:00
        time_t time2 = createTime(2023, 1, 2, 0, 0, 0);   // 2023-01-02 00:00:00

        // 根据函数实现，如果开始时间不是午夜，会将其视为第二天的午夜
        // 也就是说，1月1日10:30:00会被当作1月2日00:00:00来处理
        // 所以这里应该是1月2日00:00:00到1月2日00:00:00，结果是0
        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 0);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, LeapYearFeb) {
        // 测试闰年2月的情况 - 2024年是闰年
        time_t time1 = createTime(2024, 2, 28, 0, 0, 0);  // 2024-02-28 00:00:00
        time_t time2 = createTime(2024, 3, 2, 0, 0, 0);   // 2024-03-02 00:00:00

        // 从2024-02-28 00:00:00 到 2024-03-02 00:00:00
        // 完整天数：2024-02-28, 2024-02-29, 2024-03-01 (3天)
        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 3);
    }

    TEST_F(CalculateFullDaysBetweenTimesTest, NonLeapYearFeb) {
        // 测试非闰年2月的情况 - 2023年不是闰年
        time_t time1 = createTime(2023, 2, 28, 0, 0, 0);  // 2023-02-28 00:00:00
        time_t time2 = createTime(2023, 3, 2, 0, 0, 0);   // 2023-03-02 00:00:00

        // 从2023-02-28 00:00:00 到 2023-03-02 00:00:00
        // 完整天数：2023-02-28, 2023-03-01 (2天)
        int result = TimeUtils::CalculateFullDaysBetweenTimes(time1, time2);
        EXPECT_EQ(result, 2);
    }

}

namespace TimeUtilsTest::GetCalendarDaysInBetween {

    class GetCalendarDaysInBetweenTest : public ::testing::Test {
    protected:
        void SetUp() override {}

        void TearDown() override {}
    };

    TEST_F(GetCalendarDaysInBetweenTest, SameDay) {
        // [2024/11/3 0:00:00, 2024/11/3 23:59:59] 间隔 0个日历天
        time_t startTime = createTime(2024, 11, 3, 0, 0, 0);
        time_t endTime = createTime(2024, 11, 3, 23, 59, 59);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 0);
    }

    TEST_F(GetCalendarDaysInBetweenTest, ConsecutiveDaysAtMidnight) {
        // [2024/11/3 0:00:00, 2024/11/4 0:00:00] 间隔 0个日历天
        time_t startTime = createTime(2024, 11, 3, 0, 0, 0);
        time_t endTime = createTime(2024, 11, 4, 0, 0, 0);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 0);
    }

    TEST_F(GetCalendarDaysInBetweenTest, ConsecutiveDaysWithSmallDifference) {
        // [2024/11/3 0:00:01, 2024/11/4 23:59:59] 间隔 0个日历天
        time_t startTime = createTime(2024, 11, 3, 0, 0, 1);
        time_t endTime = createTime(2024, 11, 4, 23, 59, 59);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 0);
    }

    TEST_F(GetCalendarDaysInBetweenTest, OneDayGapAtMidnight) {
        // [2024/11/3 0:00:00, 2024/11/5 00:00:00] 间隔 1个日历天
        time_t startTime = createTime(2024, 11, 3, 0, 0, 0);
        time_t endTime = createTime(2024, 11, 5, 0, 0, 0);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 1);
    }

    TEST_F(GetCalendarDaysInBetweenTest, OneDayGapDifferentTimes) {
        // [2024/11/3 23:59:59, 2024/11/5 23:59:59] 间隔 1个日历天
        time_t startTime = createTime(2024, 11, 3, 23, 59, 59);
        time_t endTime = createTime(2024, 11, 5, 23, 59, 59);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 1);
    }

    TEST_F(GetCalendarDaysInBetweenTest, TwoDayGap) {
        // [2024/11/3 00:00:00, 2024/11/6 23:59:59] 间隔 2个日历天
        time_t startTime = createTime(2024, 11, 3, 0, 0, 0);
        time_t endTime = createTime(2024, 11, 6, 23, 59, 59);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 2);
    }

    TEST_F(GetCalendarDaysInBetweenTest, WithTimeZoneOffset) {
        // 测试带有时区偏移的情况
        time_t startTime = createTime(2024, 11, 3, 23, 59, 59); // 2024/11/3 23:59:59 UTC
        time_t endTime = createTime(2024, 11, 5, 0, 0, 0);      // 2024/11/5 00:00:00 UTC

        // 使用+8小时时区偏移，这会将开始时间调整到下一天
        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime, 8 * 60);
        EXPECT_EQ(result, 0); // 在+8时区下，开始时间变成了11/4 07:59:59，与结束时间11/5 8:00在相邻日期

        // 使用-8小时时区偏移，这会将开始时间保持在原日期
        result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime, -8 * 60);
        EXPECT_EQ(result, 0); // 在-8时区下，开始时间变成了11/3 15:59:59，与结束时间11/4 16:00在相邻日期

        startTime = createTime(2024, 11, 3, 23, 59, 59); // 2024/11/3 23:59:59 UTC
        endTime = createTime(2024, 11, 5, 12, 0, 0);      // 2024/11/5 12:00:00 UTC
        result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime, -8 * 60);
        EXPECT_EQ(result, 1); // 在-8时区下，开始时间变成了11/3 15:59:59，与结束时间11/5 04:00隔了一天
    }

    TEST_F(GetCalendarDaysInBetweenTest, StartTimeGreaterThanEndTime) {
        // 测试开始时间大于结束时间的情况
        time_t startTime = createTime(2024, 11, 5, 0, 0, 0); // 2024/11/5 00:00:00
        time_t endTime = createTime(2024, 11, 3, 0, 0, 0);   // 2024/11/3 00:00:00

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 0);
    }

    TEST_F(GetCalendarDaysInBetweenTest, EqualTimes) {
        // 测试相同时间的情况
        time_t startTime = createTime(2024, 11, 3, 12, 30, 45); // 2024/11/3 12:30:45

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, startTime);
        EXPECT_EQ(result, 0);
    }

    TEST_F(GetCalendarDaysInBetweenTest, CrossMonth) {
        // 测试跨月的情况 - 从一月的最后几天跨越到二月
        // [2024/1/29 0:00:00, 2024/2/2 0:00:00] 间隔 2个日历天 (1/30, 1/31, 2/1)
        time_t startTime = createTime(2024, 1, 29, 0, 0, 0);
        time_t endTime = createTime(2024, 2, 2, 0, 0, 0);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 3); // 中间有1月30日、1月31日、2月1日三天，但因为不包括结束时间所在天，所以是3天

        // 再次测试一个简单的跨月例子
        // [2024/1/30 0:00:00, 2024/2/2 0:00:00] 间隔 2个日历天 (1/31,2/1)
        startTime = createTime(2024, 1, 30, 0, 0, 0);
        endTime = createTime(2024, 2, 2, 0, 0, 0);

        result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 2); // 中间1月31日、2月1日这二天
    }

    TEST_F(GetCalendarDaysInBetweenTest, CrossYear) {
        // 测试跨年的情况
        // [2023/12/30 0:00:00, 2024/1/3 0:00:00] 间隔 3个日历天 (12/31, 1/1, 1/2)
        time_t startTime = createTime(2023, 12, 30, 0, 0, 0);
        time_t endTime = createTime(2024, 1, 3, 0, 0, 0);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 3); // 中间有12/31, 1/1, 1/2三天
    }

    TEST_F(GetCalendarDaysInBetweenTest, LeapYear) {
        // 测试闰年情况 - 2024年是闰年，2月有29天
        // [2024/2/25 0:00:00, 2024/3/2 0:00:00] 间隔 5个日历天 (2/26, 2/27, 2/28, 2/29, 3/1)
        time_t startTime = createTime(2024, 2, 25, 0, 0, 0);
        time_t endTime = createTime(2024, 3, 2, 0, 0, 0);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 5); // 中间有2/26, 2/27, 2/28, 2/29, 3/1五天

        // 非闰年情况对比 - 2023年不是闰年，2月只有28天
        // [2023/2/25 0:00:00, 2023/3/2 0:00:00] 间隔 5个日历天 (2/26, 2/27, 2/28, 3/1)
        startTime = createTime(2023, 2, 25, 0, 0, 0);
        endTime = createTime(2023, 3, 2, 0, 0, 0);

        result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 4); // 中间有2/26, 2/27, 2/28, 3/1四天
    }

    TEST_F(GetCalendarDaysInBetweenTest, LongInterval) {
        // 测试较长的时间间隔
        // [2024/1/1 0:00:00, 2024/1/10 0:00:00] 间隔 8个日历天 (1/2 - 1/9)
        time_t startTime = createTime(2024, 1, 1, 0, 0, 0);
        time_t endTime = createTime(2024, 1, 10, 0, 0, 0);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 8); // 中间有1/2, 1/3, 1/4, 1/5, 1/6, 1/7, 1/8, 1/9八天
    }

    TEST_F(GetCalendarDaysInBetweenTest, AcrossMonthsMultiple) {
        // 测试跨越多个月的情况
        // [2024/1/28 0:00:00, 2024/3/5 0:00:00] 间隔 36个日历天 (1/29-1/31: 3天, 2月: 29天, 3/1-3/4: 4天)
        time_t startTime = createTime(2024, 1, 28, 0, 0, 0);
        time_t endTime = createTime(2024, 3, 5, 0, 0, 0);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        EXPECT_EQ(result, 36); // 1月29-31日(3天) + 整个2月(29天，因为2024是闰年) + 3月1-4日(4天) = 36天
    }

    TEST_F(GetCalendarDaysInBetweenTest, AcrossYearsLong) {
        // 测试跨越多年的情况
        // [2023/11/28 0:00:00, 2024/2/5 0:00:00] 间隔 68个日历天
        time_t startTime = createTime(2023, 11, 28, 0, 0, 0);
        time_t endTime = createTime(2024, 2, 5, 0, 0, 0);

        int result = TimeUtils::GetCalendarDaysInBetween(startTime, endTime);
        // 11月29-30日(2天) + 12月(31天) + 1月(31天) + 2月1-4日(4天) = 68天
        EXPECT_EQ(result, 68);
    }

}