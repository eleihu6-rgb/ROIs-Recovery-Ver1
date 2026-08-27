#include <gtest/gtest.h>

#include <climits>
#include <filesystem>
#include "UtilFunc.h"
#include "TimezoneUtils.h"

static void EnsureTimezoneDbLoaded() {
    static bool loaded = false;
    if (loaded) {
        return;
    }
    std::filesystem::path installDir;

#ifndef RULETEST_DATA_DIR
#define RULETEST_DATA_DIR ""
#endif

    const std::filesystem::path dataDir = RULETEST_DATA_DIR;
    if (!dataDir.empty()) {
        const auto repoRoot = dataDir.parent_path().parent_path();
        installDir = repoRoot / "orUtil" / "TimeZoneUtil" / "tzdata";
    } else {
        installDir = std::filesystem::path("orUtil") / "TimeZoneUtil" / "tzdata";
    }

    if (!std::filesystem::exists(installDir)) {
        installDir = std::filesystem::absolute(installDir);
    }

    TimezoneUtils::SetTimezoneDatabase(installDir.string());
    loaded = true;
}

TEST(TimezoneUtilsTest, LocalDateToUtcStartAndEndOfDay_NoDst) {
    EnsureTimezoneDbLoaded();
    const std::string zoneId = "Asia/Singapore";

    const time_t startUtc = TimezoneUtils::LocalDateToUtc_StartOfDay("2025-01-02", zoneId);
    const time_t endUtc = TimezoneUtils::LocalDateToUtc_EndOfDay("2025-01-02", zoneId);

    ASSERT_NE(startUtc, INT_MIN);
    ASSERT_NE(endUtc, INT_MIN);
	EXPECT_EQ(startUtc, 1735747200);
    EXPECT_EQ(endUtc - startUtc, 24 * 60 * 60 - 1);

    const time_t nextStartUtc = TimezoneUtils::LocalDateToUtc_StartOfDay("2025-01-03", zoneId);
    ASSERT_NE(nextStartUtc, INT_MIN);
    EXPECT_EQ(endUtc, nextStartUtc - 1);
}

TEST(TimezoneUtilsTest, LocalDateTimeToUtc_NonexistentLocalTime_ReturnsIntMin) {
    EnsureTimezoneDbLoaded();
    const std::string tzName = "Europe/London";
    EXPECT_EQ(TimezoneUtils::LocalDateTimeToUtc("2024-03-31 01:30:00", tzName), INT_MIN);
}

TEST(TimezoneUtilsTest, LocalDateTimeToUtc_AmbiguousLocalTime_ChooseEarliestVsLatest) {
    EnsureTimezoneDbLoaded();
    const std::string tzName = "Europe/London";

    const time_t earliest =
        TimezoneUtils::LocalDateTimeToUtc("2024-10-27 01:30:00", tzName, date::choose::earliest);
    const time_t latest =
        TimezoneUtils::LocalDateTimeToUtc("2024-10-27 01:30:00", tzName, date::choose::latest);

    ASSERT_NE(earliest, INT_MIN);
    ASSERT_NE(latest, INT_MIN);
    EXPECT_EQ(earliest, 1729989000); //GMT: 2024年10月27日SundayAM12点30分
    EXPECT_EQ(latest - earliest, 60 * 60);
}

TEST(TimezoneUtilsTest, LocalDateToUtcEndOfDay_DstStartDay_Is23Hours) {
    EnsureTimezoneDbLoaded();
    const std::string tzName = "Europe/London";

    const time_t startUtc = TimezoneUtils::LocalDateToUtc_StartOfDay("2024-03-31", tzName);
    const time_t endUtc = TimezoneUtils::LocalDateToUtc_EndOfDay("2024-03-31", tzName);

    ASSERT_NE(startUtc, INT_MIN);
    ASSERT_NE(endUtc, INT_MIN);
	EXPECT_EQ(startUtc, 1711843200); //GMT: 2024年3月31日SundayAM0点0分
    EXPECT_EQ(endUtc - startUtc, 23 * 60 * 60 - 1);
}

TEST(TimezoneUtilsTest, LocalDateToUtcEndOfDay_DstEndDay_Is25Hours) {
    EnsureTimezoneDbLoaded();
    const std::string tzName = "Europe/London";

    const time_t startUtc = TimezoneUtils::LocalDateToUtc_StartOfDay("2024-10-27", tzName);
    const time_t endUtc = TimezoneUtils::LocalDateToUtc_EndOfDay("2024-10-27", tzName);

    ASSERT_NE(startUtc, INT_MIN);
    ASSERT_NE(endUtc, INT_MIN);
    EXPECT_EQ(endUtc - startUtc, 25 * 60 * 60 - 1);
}
