// SIA_SUITE_SUMMARY_START
// SuiteId: 4.4.3
// Name: Early Start
// SourceCsvRow: 4.4.3,Early Start
// Status: PARTIAL
// ImplementedCases:
//   - Case #1: COP SIN-KUL-SIN with STD at 07:00 local is not flagged as early start, even if the reporting time falls inside the early-start window (covered indirectly by SIA 3.3 tests).
// Results:
//   - pass 1 out of 1 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Optionally duplicate the exact SIN-KUL-SIN timings in a dedicated test that calls DutyUtils::IsEarlyStartDuty directly.
//   - Re-run RuleTest and update this summary once the SIA 3.3/4.4.3 coverage is verified together.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 4.4.3 Early Start (labelling behaviour around 07:00 STD).
// Best-fit mechanism: DutyUtils::IsEarlyStartDuty driven by Early_Start_Definition (rule 2041).

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

}  // namespace

class SIA_4_4_3_EarlyStartLabelingTest : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& es = RuleParams::GetInstancePtr()->getEarlyStartDefinition();
        es.earlyStartStart = 5 * 60;      // 05:00
        es.earlyStartEnd = 6 * 60 + 59;   // 06:59, consistent with SIA 3.3.
    }
};

// Case #1: SQ104 SIN-KUL 07:00 STD should NOT be labelled as early start.
TEST_F(SIA_4_4_3_EarlyStartLabelingTest, StdAt0700IsNotEarlyStart) {
    const int refOffsetMinutes = 0;  // Treat times as SIN local.

    const time_t std700 = utcFromString("2025-08-01 07:00:00");
    EXPECT_FALSE(DutyUtils::IsEarlyStartDuty(std700, refOffsetMinutes));
}
