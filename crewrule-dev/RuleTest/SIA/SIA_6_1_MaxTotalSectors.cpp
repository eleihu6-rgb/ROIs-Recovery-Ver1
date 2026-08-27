// SIA_SUITE_SUMMARY_START
// SuiteId: 6.1
// Name: Maximum number of total (operating and deadhead) flights / sectors per duty
// SourceCsvRow: 6.1.,Maximum number of total (operating and deadhead) flights / sectors per duty
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: With max total sectors value = 3, a duty containing 4 FLY/DHD sectors is illegal.
//   - Case #2: With max total sectors value = 4, the same duty with 4 sectors is legal.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Consider adding mixed BUS/TRAIN segments once SIA defines whether they should count towards the "total" sector cap.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"

#include "SIA_6_DutyConstructionHelpers.h"

// SIA 6.1 – Maximum number of total (operating and deadhead) flights / sectors per duty
// Best-fit rule: rule2004 (field totalSegsInDuty).

namespace {

using namespace SIA6Duty;

class SIA_6_1_MaxTotalSectorsTest : public ::testing::Test {
protected:
    SIA_6_1_MaxTotalSectorsTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext({{"SIN", "D"}, {"PEN", "D"}, {"KUL", "D"}})) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

DutyBuildResult buildDutyWithFourTotalSectors() {
    std::vector<DutySegmentConfig> segments;
    segments.push_back(makeSegmentConfig("FLY", "SIN", "PEN", 0, 85, "SQ134"));
    segments.push_back(makeSegmentConfig("DHD", "PEN", "SIN", 115, 200, "SQ133", true));
    segments.push_back(makeSegmentConfig("FLY", "SIN", "KUL", 230, 305, "SQ116"));
    segments.push_back(makeSegmentConfig("FLY", "KUL", "SIN", 335, 410, "SQ115"));
    return makeDuty(segments);
}

// Case #1 (6.1): max total sectors = 3, actual total sectors = 4 -> illegal.
TEST_F(SIA_6_1_MaxTotalSectorsTest, FourTotalSectorsExceedLimitOfThree) {
    Rule2004Config cfg;
    cfg.totalSegments = "3";
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    auto dutyData = buildDutyWithFourTotalSectors();
    std::vector<Duty*> duties{dutyData.duty.get()};

    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #2 (6.1): max total sectors = 4, actual total sectors = 4 -> legal.
TEST_F(SIA_6_1_MaxTotalSectorsTest, FourTotalSectorsWithinLimitOfFour) {
    Rule2004Config cfg;
    cfg.totalSegments = "4";
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    auto dutyData = buildDutyWithFourTotalSectors();
    std::vector<Duty*> duties{dutyData.duty.get()};

    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

}  // namespace