// SIA_SUITE_SUMMARY_START
// SuiteId: 4.6.1
// Name: CC Layover Rest (NAM ULR Welfare)
// SourceCsvRow: 4.6.1,CC Layover Rest (NAM ULR Welfare)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Hard Rule (48h+2LN): Verifies that both a ~48h and ~72h rest period pass the ANR minimum.
//   - Soft Rule (60h+3LN): Verifies that a ~48h rest period fails the welfare rule, while a ~72h rest period passes.
// Results:
//   - TODO
//   - Notes: last run 1970-01-01T08:00:00Z;
// RemainingWork:
//   - Analyze test failures. The rule logic for welfare may be different from the simple parameterization used.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>
#include <memory>
#include <vector>
#include <cstring>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7421/AcopSlipPatternRule.h"
#include "SIA_6_DutyConstructionHelpers.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "db/Pairing.h"
#include "orUtil/UtilFunc.h"

// Test case based on user request:
// 4.6.1 CC Layover Rest (NAM ULR Welfare) / TC 29
// Rule 7421 (AcopSlipPatternRule) is used to test two scenarios:
// 1. Hard Rule: ANR minimum of 48 hours + 2 local nights for ULR.
// 2. Soft/Welfare Rule: 60 hours + 3 local nights for ULR.

namespace {

// Factory for a rule 7421 instance with specific parameters
std::unique_ptr<AcopSlipPatternRule> makeRule7421(const SharedPtr<CrewDataContext>& ctx, const std::string& minSlipHours, const std::string& minSlipLocalNights, bool isSoftRule) {
    RuleInput input;
    DBRule row{};
    row.idRule = isSoftRule ? 7421002 : 7421001;
    row.function = 7421;
    row.tableNum = 1;
    row.rowNum = isSoftRule ? 2 : 1;
    row.phase = 1;
    row.idRuleParam = isSoftRule ? 20874212 : 20874211;
    row.overridebility = isSoftRule ? "W" : "S"; // Soft rule is a warning
    row.reference = isSoftRule ? "SIA-4.6.1-Welfare" : "SIA-4.6.1-Hard";
    std::strcpy(row.description, isSoftRule ? "ULR NAM Welfare Rest" : "ULR NAM ANR Minimum Rest");

    row.params["COP / Applicability"] = "SIN-EWR-SIN";
    row.params["Slip station"] = "EWR";
    row.params["Duty Assignment before slip"] = "ULR_DUTY";
    row.params["Min slip hours"] = minSlipHours;
    row.params["Min slip local nights"] = minSlipLocalNights;

    // Control parameters
    DBRule controlRow{};
    controlRow.idRule = row.idRule;
    controlRow.function = 7421;
    controlRow.tableNum = 2;
    controlRow.rowNum = 1;
    controlRow.params["Sby Reduces Rest and LN"] = "N"; // Standby not relevant here
    controlRow.params["Rest Starts After"] = "TRANSPORT";

    input.dbRules.push_back(row);
    input.dbRules.push_back(controlRow);
    
    auto rule = std::make_unique<AcopSlipPatternRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(PAIRING_OPTIMIZER);
    return rule;
}

} // namespace

class SIA_4_6_1_CcLayoverRestNamUlrWelfareTest : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        
        ctx = SIATest::buildCrewDataContext({
            {"SIN", 480, "SGT"},  // UTC+8
            {"EWR", -300, "EST"} // UTC-5
        });

        // Build duties and store them in the fixture to manage their lifetime
        buildDuties();
    }

    void buildDuties() {
        // Epoch: 2025-12-12 00:00 UTC
        // SIN: UTC+8, EWR: UTC-5

        // --- SHORT REST PAIRING DUTIES ---
        // Duty 1 (SQ022 SIN-EWR)
        // Dep: 2025-12-12 15:35 SIN LT -> 2025-12-12 07:35 UTC (455 mins from epoch)
        // Arr: 2025-12-13 10:00 EWR LT -> 2025-12-13 15:00 UTC (2340 mins from epoch)
        auto duty1_segments_short = { SIA6Duty::makeSegmentConfig("FLY", "SIN", "EWR", 455, 2340, "SQ022") };
        _duty1_short = SIA6Duty::makeDuty(duty1_segments_short);
        _duty1_short.duty->setULR(true);
        _duty1_short.duty->setAssignment("ULR_DUTY");
        _duty1_short.duty->setActualDropoffMin(90); // 30m debrief + 60m transport

        // Duty 2 (SQ021 EWR-SIN) for short rest
        // Dep: 2025-12-15 13:35 EWR LT -> 2025-12-15 18:35 UTC (5435 mins from epoch)
        // Arr: 2025-12-17 08:45 SIN LT -> 2025-12-17 00:45 UTC (7245 mins from epoch)
        int duty2_start_short = (3 * 24 * 60) + (18 * 60) + 35; // 5435
        int duty2_end_short = (5 * 24 * 60) + (0 * 60) + 45; // 7245
        auto duty2_segments_short = { SIA6Duty::makeSegmentConfig("FLY", "EWR", "SIN", duty2_start_short, duty2_end_short, "SQ021") };
        _duty2_short = SIA6Duty::makeDuty(duty2_segments_short);
        _duty2_short.duty->setULR(true);
        _duty2_short.duty->setAssignment("ULR_DUTY");
        _duty2_short.duty->setActualPickupMin(120); // 60m transport + 60m report
        
        // --- LONG REST PAIRING DUTIES ---
        // Duty 1 is the same
        auto duty1_segments_long = { SIA6Duty::makeSegmentConfig("FLY", "SIN", "EWR", 455, 2340, "SQ022") };
        _duty1_long = SIA6Duty::makeDuty(duty1_segments_long);
        _duty1_long.duty->setULR(true);
        _duty1_long.duty->setAssignment("ULR_DUTY");
        _duty1_long.duty->setActualDropoffMin(90);

        // Duty 2 (SQ021 EWR-SIN) for long rest
        // Dep: 2025-12-16 13:35 EWR LT -> 2025-12-16 18:35 UTC (6875 mins from epoch)
        // Arr: 2025-12-18 08:45 SIN LT -> 2025-12-18 00:45 UTC (8685 mins from epoch)
        int duty2_start_long = (4 * 24 * 60) + (18 * 60) + 35; // 6875
        int duty2_end_long = (6 * 24 * 60) + (0 * 60) + 45; // 8685
        auto duty2_segments_long = { SIA6Duty::makeSegmentConfig("FLY", "EWR", "SIN", duty2_start_long, duty2_end_long, "SQ021") };
        _duty2_long = SIA6Duty::makeDuty(duty2_segments_long);
        _duty2_long.duty->setULR(true);
        _duty2_long.duty->setAssignment("ULR_DUTY");
        _duty2_long.duty->setActualPickupMin(120);
    }

    void TearDown() override {
        for (auto* v : _violations) {
            delete v;
        }
        _violations.clear();
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
    std::vector<RULE_VIOLATION*> _violations;
    SharedPtr<CrewDataContext> ctx;

    // Keep DutyBuildResult in the fixture to manage object lifetime
    SIA6Duty::DutyBuildResult _duty1_short, _duty2_short;
    SIA6Duty::DutyBuildResult _duty1_long, _duty2_long;
};

TEST_F(SIA_4_6_1_CcLayoverRestNamUlrWelfareTest, HardRule_48h2LN_Check) {
    auto rule = makeRule7421(ctx, "48:00", "2", false);
    rule->setRuleViolation(&_violations);

    // Test short rest pairing (should pass)
    Pairing pairingShortRest;
    pairingShortRest.setPairingNum("TC29-ShortRest");
    pairingShortRest.appendDuty(_duty1_short.duty.get());
    pairingShortRest.appendDuty(_duty2_short.duty.get());
    EXPECT_TRUE(rule->CheckRule(&pairingShortRest)) << "Short rest (~48h) pairing should PASS the 48h/2LN hard rule.";
    
    _violations.clear();
    
    // Test long rest pairing (should pass)
    Pairing pairingLongRest;
    pairingLongRest.setPairingNum("TC29-LongRest");
    pairingLongRest.appendDuty(_duty1_long.duty.get());
    pairingLongRest.appendDuty(_duty2_long.duty.get());
    EXPECT_TRUE(rule->CheckRule(&pairingLongRest)) << "Long rest (~72h) pairing should PASS the 48h/2LN hard rule.";
}

TEST_F(SIA_4_6_1_CcLayoverRestNamUlrWelfareTest, SoftRule_60h3LN_Check) {
    auto rule = makeRule7421(ctx, "60:00", "3", true);
    rule->setRuleViolation(&_violations);

    // Test short rest pairing (should fail)
    Pairing pairingShortRest;
    pairingShortRest.setPairingNum("TC29-ShortRest");
    pairingShortRest.appendDuty(_duty1_short.duty.get());
    pairingShortRest.appendDuty(_duty2_short.duty.get());
    EXPECT_FALSE(rule->CheckRule(&pairingShortRest)) << "Short rest (~48h) pairing should FAIL the 60h/3LN soft rule.";
    
    _violations.clear();

    // Test long rest pairing (should pass)
    Pairing pairingLongRest;
    pairingLongRest.setPairingNum("TC29-LongRest");
    pairingLongRest.appendDuty(_duty1_long.duty.get());
    pairingLongRest.appendDuty(_duty2_long.duty.get());
    EXPECT_TRUE(rule->CheckRule(&pairingLongRest)) << "Long rest (~72h) pairing should PASS the 60h/3LN soft rule.";
}
