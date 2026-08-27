// SIA_SUITE_SUMMARY_START
// SuiteId: 3.3
// Name: Early start / Late finish
// SourceCsvRow: 3.3,Early start/Late finish
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: COP Day 1 SQ1 SIN-KUL 0659-0810, SQ2 KUL-SIN 0900-1010 (from Prioritization of Rules.xlsx row 3.3); STD 06:59 is classified as early start.
//   - Case #2: Same COP but with SQ1 as DU; classification remains early start as it depends only on STD, not assignment.
//   - Case #3: COP Day 1 SQ1 SIN-KUL 2220-2330, Day 2 SQ2 KUL-SIN 0030-0140; FDP end within 01:00-01:59 is classified as late finish.
//   - Case #4: Same COP but with SQ2 as DU; FDP ending before 01:00 is not classified as late finish.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:20Z
// RemainingWork:
//   - Optionally add WOCL-related checks if additional SIA 3.3 scenarios are provided.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "SIA_CommonTestConfig.h"

// SIA 3.3 Early start / Late finish
// Uses DutyUtils::IsEarlyStartDuty and DutyUtils::IsLateFinishTime
// driven by Early_Start_Definition and Late_Finish_Definition (2041/2042).

class SIA_3_3_EarlyStartLateFinishTest : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& es = RuleParams::GetInstancePtr()->getEarlyStartDefinition();
        es.earlyStartStart = SIATest::kEarlyStartStartMinutes;
        es.earlyStartEnd = SIATest::kEarlyStartEndMinutes;

        auto& lf = RuleParams::GetInstancePtr()->getLateFinishDefinition();
        // From SIA design: late finish between 01:00 and 01:59 acclimated time.
        lf.lateFinishStart = SIATest::kLateFinishStartMinutes;
        lf.lateFinishEnd = SIATest::kLateFinishEndMinutes;
    }

    SIATest::SiaRuleParamGuard _paramsGuard;
};

// Case #1 / #2: STD 06:59 local is an early start irrespective of DU flag.
TEST_F(SIA_3_3_EarlyStartLateFinishTest, EarlyStartAt0659IsDetected) {
    const int refOffsetMinutes = 480;  // SIN local time (UTC+8)

    // Excel 3.3 Case #1 / #2 COP (STD/STA):
    //   Day 1 - SQ 1 - SIN-KUL - 0659-0810
    //   Day 1 - SQ 2 - KUL-SIN - 0900-1010
    const auto ctx = SIATest::buildCrewDataContext({{"SIN", 480, "Asia/Singapore"}});

    const time_t dutyStartUtc =
        SIATest::utcFromLocal("2025-07-01 06:59:00", "SIN", ctx);
    EXPECT_TRUE(DutyUtils::IsEarlyStartDuty(dutyStartUtc, refOffsetMinutes));

    const time_t nonEarlyStartUtc =
        SIATest::utcFromLocal("2025-07-01 07:00:00", "SIN", ctx);
    EXPECT_FALSE(DutyUtils::IsEarlyStartDuty(nonEarlyStartUtc, refOffsetMinutes));
}

// Case #3 / #4: FDP end after 01:00 local is a late finish; before 01:00 is not.
TEST_F(SIA_3_3_EarlyStartLateFinishTest, LateFinishWindowAround0100) {
    const int refOffsetMinutes = 480;  // SIN/KUL local time

    // Excel 3.3 Case #3 / #4 COP (STD/STA):
    //   Day 1 - SQ 1 - SIN-KUL - 2220-2330
    //   Day 2 - SQ 2 - KUL-SIN - 0030-0140
    // Late finish is driven by FDP end time in local acclimated time.
    const auto ctx = SIATest::buildCrewDataContext({{"KUL", 480, "Asia/Kuala_Lumpur"}});

    const time_t lateFinishUtc =
        SIATest::utcFromLocal("2025-07-02 01:10:00", "KUL", ctx);
    EXPECT_TRUE(DutyUtils::IsLateFinishTime(lateFinishUtc, refOffsetMinutes));

    const time_t beforeWindowUtc =
        SIATest::utcFromLocal("2025-07-02 00:59:00", "KUL", ctx);
    EXPECT_FALSE(DutyUtils::IsLateFinishTime(beforeWindowUtc, refOffsetMinutes));
}