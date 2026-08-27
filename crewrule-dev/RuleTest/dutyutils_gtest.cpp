#include <gtest/gtest.h>

#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"

#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

}  // namespace

class DutyUtilsTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Configure default local night definition: 8 hours within 22:00–08:00.
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:00";
        ln.LocalEnd = "08:00";
        ln.MinRestInterval = "08:00";
    }
};

// Test basic local night calculation with UTC times and timezone offset
TEST_F(DutyUtilsTest, BasicLocalNightCalculation_UTC) {
    // Test case: Rest period from 2025-06-01 20:00 UTC to 2025-06-02 10:00 UTC
    // Timezone: UTC+2 (120 minutes), so local times are:
    // Start: 2025-06-01 22:00 local
    // End: 2025-06-02 12:00 local
    // Expected: 1 local night (covers 22:00-08:00 on June 1-2)

    time_t startUtc = utcFromString("2025-06-01 20:00:00");
    time_t endUtc = utcFromString("2025-06-02 10:00:00");
    int offsetTZMinute = 120; // UTC+2

    int result = DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute);

    EXPECT_EQ(result, 1);
}

// Test local night calculation with local times (no timezone conversion)
TEST_F(DutyUtilsTest, BasicLocalNightCalculation_LocalTime) {
    // Test case: Rest period from 2025-06-01 22:00 local to 2025-06-02 08:00 local
    // Expected: 1 local night (exactly covers one local night period)

    time_t startLoc = utcFromString("2025-06-01 22:00:00");
    time_t endLoc = utcFromString("2025-06-02 08:00:00");

    int result = DutyUtils::GetLocalNightNums(startLoc, endLoc);

    EXPECT_EQ(result, 1);
}

// Test multiple local nights calculation
TEST_F(DutyUtilsTest, MultipleLocalNights) {
    // Test case: Rest period from 2025-06-01 20:00 UTC to 2025-06-04 10:00 UTC
    // Timezone: UTC+2 (120 minutes), so local times are:
    // Start: 2025-06-01 22:00 local
    // End: 2025-06-04 12:00 local
    // Expected: 3 local nights (June 1-2, June 2-3, June 3-4)

    time_t startUtc = utcFromString("2025-06-01 20:00:00");
    time_t endUtc = utcFromString("2025-06-04 10:00:00");
    int offsetTZMinute = 120; // UTC+2

    int result = DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute);

    EXPECT_EQ(result, 3);
}

// Test zero local nights (rest period too short)
TEST_F(DutyUtilsTest, ZeroLocalNights_ShortRest) {
    // Test case: Rest period from 2025-06-01 22:00 UTC to 2025-06-02 02:00 UTC
    // Timezone: UTC+2 (120 minutes), so local times are:
    // Start: 2025-06-02 00:00 local
    // End: 2025-06-02 04:00 local
    // Expected: 0 local nights (doesn't cover full 8-hour local night)

    time_t startUtc = utcFromString("2025-06-01 22:00:00");
    time_t endUtc = utcFromString("2025-06-02 02:00:00");
    int offsetTZMinute = 120; // UTC+2

    int result = DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute);

    EXPECT_EQ(result, 0);
}

// Test edge case: rest period exactly at local night end boundaries
TEST_F(DutyUtilsTest, ExactLocalNightBoundaries) {
    // Test case: Rest period from 2025-06-01 22:00 UTC to 2025-06-02 06:00 UTC
    // Timezone: UTC+2 (120 minutes), so local times are:
    // Start: 2025-06-02 00:00 local 
    // End: 2025-06-02 08:00 local 
    // Expected: 1 local night

    time_t startUtc = utcFromString("2025-06-01 22:00:00");
    time_t endUtc = utcFromString("2025-06-02 06:00:00");
    int offsetTZMinute = 120; // UTC+2

    int result = DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute);

    EXPECT_EQ(result, 1);
}

// Test with custom local night definition
TEST_F(DutyUtilsTest, CustomLocalNightDefinition) {
    // Test case: Custom local night definition 23:00-07:00 (8 hours)
    // Rest period from 2025-06-01 21:00 UTC to 2025-06-02 05:00 UTC
    // Timezone: UTC+2 (120 minutes), so local times are:
    // Start: 2025-06-01 23:00 local (exactly custom local night start)
    // End: 2025-06-02 07:00 local (exactly custom local night end)
    // Expected: 1 local night

    time_t startUtc = utcFromString("2025-06-01 21:00:00");
    time_t endUtc = utcFromString("2025-06-02 05:00:00");
    int offsetTZMinute = 120; // UTC+2

    int result = DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute,
                                              "23:00", "07:00", "08:00");

    EXPECT_EQ(result, 1);
}

// Test with different timezone offsets
TEST_F(DutyUtilsTest, DifferentTimezoneOffsets) {
    // Test case: Same UTC times, different timezone offsets
    // Rest period from 2025-06-01 20:00 UTC to 2025-06-02 10:00 UTC

    time_t startUtc = utcFromString("2025-06-01 20:00:00");
    time_t endUtc = utcFromString("2025-06-02 10:00:00");

    // UTC+0: Start 20:00 local, End 10:00 local -> 1 local night
    int result1 = DutyUtils::GetLocalNightNums(startUtc, endUtc, 0);
    EXPECT_EQ(result1, 1);

    // UTC+4: Start 00:00 local, End 14:00 local -> 1 local night
    int result2 = DutyUtils::GetLocalNightNums(startUtc, endUtc, 240);
    EXPECT_EQ(result2, 1);

    // UTC-5: Start 15:00 local, End 05:00 local -> 0 local night
    int result3 = DutyUtils::GetLocalNightNums(startUtc, endUtc, -300);
    EXPECT_EQ(result3, 0);
}

TEST_F(DutyUtilsTest, MinimumRestIntervalRequirement) {
    // Test case: Custom minimum rest interval of 10 hours
    // Rest period from 2025-06-01 20:00 UTC to 2025-06-02 10:00 UTC
    // Timezone: UTC+2 (120 minutes), so local times are:
    // Start: 2025-06-01 22:00 local
    // End: 2025-06-02 07:00 local
    // Duration: 09 hours, but minimum rest is 10 hours
    // Expected: 0 local night

    time_t startUtc = utcFromString("2025-06-01 20:00:00");
    time_t endUtc = utcFromString("2025-06-02 05:00:00");
    int offsetTZMinute = 120; // UTC+2

    int result = DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute,
                                              "22:00", "08:00", "10:00");

    EXPECT_EQ(result, 0);
}

// Test with very short minimum rest interval
TEST_F(DutyUtilsTest, ShortMinimumRestInterval) {
    // Test case: Custom minimum rest interval of 4 hours
    // Rest period from 2025-06-01 23:00 UTC to 2025-06-02 03:00 UTC
    // Timezone: UTC+2 (120 minutes), so local times are:
    // Start: 2025-06-02 01:00 local
    // End: 2025-06-02 05:00 local
	// Duration: 4 hours, minimum rest is 4 hours
    // Expected: 1 local nights 

    time_t startUtc = utcFromString("2025-06-01 23:00:00");
    time_t endUtc = utcFromString("2025-06-02 03:00:00");
    int offsetTZMinute = 120; // UTC+2

    int result = DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute,
                                              "22:00", "08:00", "04:00");

    EXPECT_EQ(result, 1);
}

// Test boundary case: rest period exactly equal to minimum rest interval
TEST_F(DutyUtilsTest, ExactMinimumRestInterval) {
    // Test case: Rest period exactly 8 hours
    // From 2025-06-01 20:00 UTC to 2025-06-02 04:00 UTC
    // Timezone: UTC+2 (120 minutes), so local times are:
    // Start: 2025-06-01 22:00 local
    // End: 2025-06-02 06:00 local
    // Expected: 1 local night

    time_t startUtc = utcFromString("2025-06-01 20:00:00");
    time_t endUtc = utcFromString("2025-06-02 04:00:00");
    int offsetTZMinute = 120; // UTC+2

    int result = DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute);

    EXPECT_EQ(result, 1);
}

// Test negative timezone offset
TEST_F(DutyUtilsTest, NegativeTimezoneOffset) {
    // Test case: Rest period from 2025-06-01 02:00 UTC to 2025-06-01 16:00 UTC
    // Timezone: UTC-5 (-300 minutes), so local times are:
    // Start: 2025-05-31 21:00 local
    // End: 2025-06-01 11:00 local
    // Expected: 1 local night (covers 22:00-08:00 on May 31-June 1)

    time_t startUtc = utcFromString("2025-06-01 02:00:00");
    time_t endUtc = utcFromString("2025-06-01 16:00:00");
    int offsetTZMinute = -300; // UTC-5

    int result = DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute);

    EXPECT_EQ(result, 1);
}

TEST_F(DutyUtilsTest, RestEndTimeMeetingSingleLocalNight) {
    // Local night definition: 22:00-08:00, minimum 8 hours
    // Rest starts at 2025-06-01 22:00 (local == UTC), need 1 local night.
    // Expected earliest end time: 2025-06-02 06:00 (8 hours later, fully within the first local night).
    time_t startUtc = utcFromString("2025-06-01 22:00:00");
    int offsetTZMinute = 0;

    time_t expectedEndUtc = utcFromString("2025-06-02 06:00:00");
    time_t result = DutyUtils::GetRestEndTimeMeetingNumLocalNights(startUtc, offsetTZMinute, "", 1);

    EXPECT_EQ(result, expectedEndUtc);
}

TEST_F(DutyUtilsTest, RestEndTimeMeetingSingleLocalNight2) {
    // Local night definition: 22:00-08:00, minimum 8 hours
    // Rest starts at 2025-06-01 22:00 (local == UTC), need 1 local night.
    // Expected earliest end time: 2025-06-02 06:00 (8 hours later, fully within the first local night).
    time_t startUtc = utcFromString("2025-06-01 23:00:00");
    int offsetTZMinute = 0;

    time_t expectedEndUtc = utcFromString("2025-06-02 07:00:00");
    time_t result = DutyUtils::GetRestEndTimeMeetingNumLocalNights(startUtc, offsetTZMinute, "", 1);

    EXPECT_EQ(result, expectedEndUtc);
}

TEST_F(DutyUtilsTest, RestEndTimeMeetingTwoLocalNights) {
    // Rest starts at 2025-06-01 01:00 (local == UTC), need 2 local nights.
    // Expected earliest end time: 2025-06-03 06:00 (covers local nights 22:00-08:00 on two consecutive days).
    time_t startUtc = utcFromString("2025-06-01 01:00:00");
    int offsetTZMinute = 0;

    time_t expectedEndUtc = utcFromString("2025-06-03 06:00:00");
    time_t result = DutyUtils::GetRestEndTimeMeetingNumLocalNights(startUtc, offsetTZMinute, "", 2);

    EXPECT_EQ(result, expectedEndUtc);
}

TEST_F(DutyUtilsTest, LocalNightNumsExcludingIntervals) {
    // Local night definition: 22:00-08:00, minimum 8 hours.
    // Rest window fully covers 22:00-06:00 (8h) => 1 local night.
    const time_t startUtc = utcFromString("2025-06-01 22:00:00");
    const time_t endUtc = utcFromString("2025-06-02 06:00:00");
    const int offsetTZMinute = 0;

    EXPECT_EQ(DutyUtils::GetLocalNightNums(startUtc, endUtc, offsetTZMinute), 1);
    EXPECT_EQ(DutyUtils::GetLocalNightNumsExcludingIntervals(startUtc, endUtc, offsetTZMinute, {}), 1);

    // Exclude a 1-hour interval inside the night window -> breaks continuous 8h requirement.
    std::vector<std::pair<time_t, time_t>> excluded = {
        {utcFromString("2025-06-02 01:00:00"), utcFromString("2025-06-02 02:00:00")},
    };
    EXPECT_EQ(DutyUtils::GetLocalNightNumsExcludingIntervals(startUtc, endUtc, offsetTZMinute, excluded), 0);

    // Exclude an interval outside the local night window -> should not change the result.
    excluded = {
        {utcFromString("2025-06-01 20:00:00"), utcFromString("2025-06-01 21:00:00")},
    };
    EXPECT_EQ(DutyUtils::GetLocalNightNumsExcludingIntervals(startUtc, endUtc, offsetTZMinute, excluded), 1);
}

TEST_F(DutyUtilsTest, LocalNightNums_DstFallbackUsesRestEndOffset) {
    // Europe/Rome falls back from UTC+2 to UTC+1 on 2025-10-26.
    // Rest: 2025-10-25 22:30 UTC -> 2025-10-26 06:30 UTC.
    // With a fixed start offset (+2), this only covers 00:30-08:00 local -> 7.5h, so no local night.
    // With dynamic start/end offsets (+2 -> +1), the real local coverage is 00:30-07:30 with the extra DST hour,
    // which is 8h inside the local-night window and should count.
    const time_t startUtc = utcFromString("2025-10-25 22:30:00");
    const time_t endUtc = utcFromString("2025-10-26 06:30:00");

    EXPECT_EQ(DutyUtils::GetLocalNightNums(startUtc, endUtc, 120), 0);
    EXPECT_EQ(DutyUtils::GetLocalNightNums(startUtc, endUtc, 120, 60, "Europe/Rome"), 1);
}
