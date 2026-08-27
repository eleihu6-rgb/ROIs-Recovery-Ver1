// SIA_SUITE_SUMMARY_START
// SuiteId: 6.1
// Name: Maximum number of ground sectors per duty
// SourceCsvRow: 6.1.,Maximum number of ground sectors per duty
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: With max ground sectors value = 1, a duty containing a single BUS/ground sector is legal.
//   - Case #2: With max ground sectors value = 0, the same duty becomes illegal because one ground sector is present.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Extend coverage if SIA later introduces duties with multiple ground sectors interleaved with DHD/FLY legs.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"

#include "SIA_6_DutyConstructionHelpers.h"

// SIA 6.1 – Maximum number of ground sectors per duty
// Best-fit rule: rule2004 (field maxNrGRDCommuteInDuty).

namespace {

using namespace SIA6Duty;

class SIA_6_1_MaxGroundSectorsTest : public ::testing::Test {
protected:
    SIA_6_1_MaxGroundSectorsTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext({{"SIN", "D"}, {"DXB", "D"}, {"SHJ", "D"}, {"BRU", "D"}, {"AMS", "D"}})) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

DutyBuildResult buildDutyWithOneGroundSector() {
    std::vector<DutySegmentConfig> segments;
    segments.push_back(makeSegmentConfig("FLY", "SIN", "DXB", 0, 480, "SQ494"));
    segments.push_back(makeSegmentConfig("FLY", "SHJ", "BRU", 600, 960, "SQ7366"));
    // Represent BRU-AMS ground transport as BUS so rule2004 counts it as ground commute.
    segments.push_back(makeSegmentConfig("BUS", "BRU", "AMS", 1000, 1180, "GT1", false, true));
    segments.push_back(makeSegmentConfig("FLY", "AMS", "SIN", 1440, 1985, "SQ7373"));
    return makeDuty(segments);
}

// Case #1 (6.1): max ground sectors = 1, actual ground sectors = 1 -> legal.
TEST_F(SIA_6_1_MaxGroundSectorsTest, OneGroundSectorWithinLimitOfOne) {
    Rule2004Config cfg;
    cfg.maxGroundCommute = "1";
    cfg.maxDutyDp = "48:00";
    auto rule = makeRule2004(cfg);

    auto dutyData = buildDutyWithOneGroundSector();
    std::vector<Duty*> duties{dutyData.duty.get()};

    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #2 (6.1): max ground sectors = 0, actual ground sectors = 1 -> illegal.
TEST_F(SIA_6_1_MaxGroundSectorsTest, OneGroundSectorExceedsLimitOfZero) {
    Rule2004Config cfg;
    cfg.maxGroundCommute = "0";
    cfg.maxDutyDp = "48:00";
    auto rule = makeRule2004(cfg);

    auto dutyData = buildDutyWithOneGroundSector();
    std::vector<Duty*> duties{dutyData.duty.get()};

    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

}  // namespace