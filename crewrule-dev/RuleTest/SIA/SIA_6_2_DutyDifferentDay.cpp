// SIA_SUITE_SUMMARY_START
// SuiteId: 6.2
// Name: Is Duty Belong to Different Day (pairing base local time)
// SourceCsvRow: 6.2.,Is Duty Belong to Different Day (pairing base local time)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Condition=No (duties must not start on the same base-local day) -> two duties starting same day should violate rule 2004.
//   - Case #2: Condition=Yes -> same pattern is allowed.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Populate full rule2004 parameters (e.g., totalSegsInDuty) and verify duty start-day comparison logic for allow/deny modes.
//   - Extend with additional SIA 6.2 rows if provided; currently mirrors row 80 intent with base-local calendar-day check.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"
#include "SIA_6_DutyConstructionHelpers.h"

// SIA 6.2 Is Duty Belong to Different Day (pairing base local time)
// Best-fit rule: rule2004 (isDutyBelongToDifferentDayChecked).

using namespace SIA6Duty;

class SIA_6_2_DutyDifferentDayTest : public ::testing::Test {
protected:
    SIA_6_2_DutyDifferentDayTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(SIA6Duty::buildCrewDataContext({{"SIN", "D"}})) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

TEST_F(SIA_6_2_DutyDifferentDayTest, Case1_DisallowSameDayStarts) {
    Rule2004Config cfg;
	cfg.isDutyBelongDifferentDay = "Y";
    auto rule = makeRule2004(cfg);

    // Two duties starting on the same base-local day -> illegal.
    std::vector<SIA6Duty::DutySegmentConfig> duty1Segs{
        SIA6Duty::makeSegmentConfig("FLY", "SIN", "SIN", 8 * 60, 12 * 60, "A1")};
    std::vector<SIA6Duty::DutySegmentConfig> duty2Segs{
        SIA6Duty::makeSegmentConfig("FLY", "SIN", "SIN", 14 * 60, 18 * 60, "A1")};

    auto duty1 = SIA6Duty::makeDuty(duty1Segs);
    auto duty2 = SIA6Duty::makeDuty(duty2Segs);

    std::vector<Duty*> duties{duty1.duty.get(), duty2.duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

TEST_F(SIA_6_2_DutyDifferentDayTest, Case2_AllowSameDayStarts) {
    Rule2004Config cfg;
	cfg.isDutyBelongDifferentDay = "N";
    auto rule = makeRule2004(cfg);

    // Same pattern but allowed.
    std::vector<SIA6Duty::DutySegmentConfig> duty1Segs{
        SIA6Duty::makeSegmentConfig("FLY", "SIN", "SIN", 8 * 60, 12 * 60, "A1")};
    std::vector<SIA6Duty::DutySegmentConfig> duty2Segs{
        SIA6Duty::makeSegmentConfig("FLY", "SIN", "SIN", 14 * 60, 18 * 60, "A1")};

    auto duty1 = SIA6Duty::makeDuty(duty1Segs);
    auto duty2 = SIA6Duty::makeDuty(duty2Segs);

    std::vector<Duty*> duties{duty1.duty.get(), duty2.duty.get()};
    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}