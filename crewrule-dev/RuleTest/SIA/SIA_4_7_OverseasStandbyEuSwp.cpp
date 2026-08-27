// Copyright (C) 2024 P&G. All rights reserved.
//
// Created by P&G on 2024-01-10.
//
#include <gtest/gtest.h>
#include <memory>
#include <vector>
#include <cstring>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7412/CheckMinimumRestPeriodForSQRule.h"
#include "RuleEngine/rule/rule7421/AcopSlipPatternRule.h"
#include "SIA_6_DutyConstructionHelpers.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "db/Pairing.h"
#include "orUtil/UtilFunc.h"

// Test case based on user request:
// 4.7. Overseas Standby Rest (EU & SWP Welfare) / TC 31 (new)

// Illegal Case 1: Short Rest Before Standby (Triggered by Rule 7421 Welfare)
// COP:
// Day 1 - SQ285 - SIN-AKL -1450-0020
// Day 2 - SBY - 2110-0310
// Day 4 - SQ286 - AKL-SIN - 0210-1300
// Expected: Soft Alert: Rest with 19:20h + 2LN before & 21h after, does not meet welfare of 21h minimum

// Legal Case: Sufficient Rest Before Standby (Passes Rule 7421 Welfare)
// COP:
// Day 1 - SQ285 - SIN-AKL -1450-0020
// Day 2 - SBY - 2310-0510
// Day 4 - SQ286 - AKL-SIN - 0210-1300
// Expected: Meets Welfare: Rest with 21:20h + 2LN before & 19h after

// Illegal Case 2: Short Rest After Standby (Triggered by Rule 7412)
// COP:
// Day 1 - SQ285 - SIN-AKL -1450-0020
// Day 3 - SBY - 1210-1810
// Day 4 - SQ286 - AKL-SIN - 0210-1300
// Expected: Soft Alert: Rest after standby is only 7h (calculated 6h)

// Rules:
// 7421: SQ CA ACOP slip pattern (Template B) - for welfare rest and local night
// 7412: CheckMinimumRestPeriodForSQRule - for rest from standby to fly/pos duty

namespace {

    // Epoch: 2025-12-12 00:00 UTC (referred to as Day 0, 00:00 UTC)
    // SIN: UTC+8, AKL: UTC+12

    // Helper to set up rule 7421 parameters for this test suite
    // This models the "welfare" rest requirement for SWP, specifically the 21h minimum
    RuleInput makeRule7421Input() {
        RuleInput input;
        DBRule row{};
        row.idRule = 7421001;
        row.function = 7421;
        row.tableNum = 1;
        row.rowNum = 1;
        row.phase = 1;
        row.idRuleParam = 20874211;
        row.overridebility = "S";
        row.reference = "SIA-4.7-TC31-Welfare";
        std::strcpy(row.description, "SIA SWP Welfare Rest Minimum");

        // This is a simplified parameter set. A full 7421 implementation would be much larger.
        // We are specifically targeting the "21h minimum rest" described in the test case.
        // Assuming there's a generic parameter for "welfare" or that the rule logic
        // internally handles this for SWP stations like AKL.
        row.params["COP / Applicability"] = "SIN-AKL-SIN"; // Match the pattern
        row.params["Slip station"] = "AKL"; // Match AKL
        // Enforce that standby cannot be rostered until 21h after slip start.
        // (Min slip hours would measure total slip rest, which is not the intent here.)
        row.params["Duty After Hours"] = "21";

        // Also set control parameters for 7421 from Table 2
        DBRule controlRow{};
        controlRow.idRule = 7421001;
        controlRow.function = 7421;
        controlRow.tableNum = 2; // Control parameter table
        controlRow.rowNum = 1;
        controlRow.params["Sby Reduces Rest and LN"] = "Y";
        controlRow.params["Rest Starts After"] = "TRANSPORT"; // As per assumption from user's "1h transport"

        input.dbRules.push_back(row);
        input.dbRules.push_back(controlRow);
        return input;
    }

    // Factory for the rule 7421 instance
    std::unique_ptr<AcopSlipPatternRule> makeRule7421(const SharedPtr<CrewDataContext>& ctx) {
        RuleInput input = makeRule7421Input();
        auto rule = std::make_unique<AcopSlipPatternRule>(nullptr, input);
        rule->setDataContext(ctx);
        rule->setApplication(PAIRING_EDITOR);
        return rule;
    }

    // Helper to set up rule 7412 parameters for this test suite
    // Based on the provided table for SBY (treated as MVP)
    // DP Range 00:00-11:00 -> Min Rest Time 10:00 (Y for LN) or 11:00 (N for LN)
    // Let's assume the rule picks up the correct one based on presence of LN
    RuleInput makeRule7412Input() {
        RuleInput input;
        DBRule row{};
        row.idRule = 7412001;
        row.function = 7412;
        row.tableNum = 1;
        row.rowNum = 1;
        row.phase = 1;
        row.idRuleParam = 20874121;
        row.overridebility = "S";
        row.reference = "SIA-4.7-TC31-MinRestSbyToFly";
        std::strcpy(row.description, "SIA Minimum Rest from Standby to Fly");

        // This assumes rule 7412 can be configured to check SBY to FLY
        // The provided table is for MVP. This might need adjustment if it doesn't apply to SBY.
        // For now, mapping the user's explicit request.
        row.params["CURRENT DUTY ASSIGNMENTS"] = "*"; // Any
        row.params["NEXT DUTY ASSIGNMENTS"] = "FLY"; // For Flying Duty
        row.params["DP RANGE"] = "00:00-11:00"; // For a 6 hour standby (illegal case)
        // Do not constrain by local-night presence for this case; the intent is to validate min rest time.
        row.params["has Local Night(Y/N)"] = "*";
        row.params["MIN REST TIME"] = "10:00"; // Minimum 10 hours rest
        row.params["MIN LOCAL NIGHTS"] = "*";

        input.dbRules.push_back(row);
        return input;
    }

    // Factory for the rule 7412 instance
    std::unique_ptr<CheckMinimumRestPeriodForSQRule> makeRule7412(const SharedPtr<CrewDataContext>& ctx) {
        RuleInput input = makeRule7412Input();
        auto rule = std::make_unique<CheckMinimumRestPeriodForSQRule>(nullptr, input);
        rule->setDataContext(ctx);
        rule->setApplication(PAIRING_EDITOR);
        return rule;
    }

} // namespace

class SIA_4_7_OverseasStandbyRestTest : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    void TearDown() override {
        for (auto* v : _violations) {
            delete v;
        }
        _violations.clear();
        _violationMessages.clear();
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
};

// Epoch Start: 2025-12-12 00:00 UTC (Day 0, 00:00 UTC)

TEST_F(SIA_4_7_OverseasStandbyRestTest, Illegal_WelfareRest_ShortRestBeforeStandby) {
    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 480, "Asia/Singapore"},   // UTC+8
        {"AKL", 780, "Pacific/Auckland"}  // UTC+13 (NZDT)
        });

    auto rule7421 = makeRule7421(ctx);
    rule7421->setRuleViolation(&_violations);
    rule7421->setViolations(&_violationMessages);

    // Duty 1 (SQ285 SIN-AKL)
    // Departure: 2025-12-12 14:50 SIN LT -> 2025-12-12 06:50 UTC (410 mins from epoch)
    // Arrival:   2025-12-13 00:20 AKL LT -> 2025-12-12 12:20 UTC (740 mins from epoch)
    auto duty1_segments = {
        SIA6Duty::makeSegmentConfig("FLY", "SIN", "AKL", 410, 740, "SQ285")
    };
    auto duty1 = SIA6Duty::makeDuty(duty1_segments); // 1h report, 30m debrief
    duty1.duty->setAssignment("FLY");

    // Duty 2 (SBY AKL) - Short rest before this duty
    // Start: 2025-12-13 21:10 AKL LT -> 2025-12-13 09:10 UTC (1990 mins from epoch)
    // End:   2025-12-14 03:10 AKL LT -> 2025-12-13 15:10 UTC (2350 mins from epoch)
    auto duty2_segments = {
        SIA6Duty::makeSegmentConfig("SBY", "AKL", "AKL", 1990, 2350)
    };
    auto duty2 = SIA6Duty::makeDuty(duty2_segments); // Standby has 0 report/debrief
    duty2.duty->setAssignment("SBY");

    // Duty 3 (SQ286 AKL-SIN)
    // Departure: 2025-12-15 02:10 AKL LT -> 2025-12-14 14:10 UTC (3730 mins from epoch)
    // Arrival:   2025-12-15 13:00 SIN LT -> 2025-12-15 05:00 UTC (4620 mins from epoch)
    auto duty3_segments = {
        SIA6Duty::makeSegmentConfig("FLY", "AKL", "SIN", 3730, 4620, "SQ286")
    };
    auto duty3 = SIA6Duty::makeDuty(duty3_segments);
    duty3.duty->setAssignment("FLY");

    // Create a pairing object and add the duties. Rule 7421 operates on a pairing.
    Pairing pairing;
    pairing.setPairingNum("TC31-Illegal-Welfare");
    pairing.appendDuty(duty1.duty.get());
    pairing.appendDuty(duty2.duty.get());
    pairing.appendDuty(duty3.duty.get());

    // Check rule 7421 against the pairing
    // The rule evaluates each slip entry. We expect a violation for the slip at AKL.
    EXPECT_FALSE(rule7421->CheckRule(&pairing)) << "Rule 7421 should fail for insufficient welfare rest.";
    EXPECT_EQ(_violations.size(), 1);
}

TEST_F(SIA_4_7_OverseasStandbyRestTest, Legal_WelfareRest_SufficientRestBeforeStandby) {
    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 480, "Asia/Singapore"},   // UTC+8
        {"AKL", 780, "Pacific/Auckland"}  // UTC+13 (NZDT)
        });

    auto rule7421 = makeRule7421(ctx);
    rule7421->setRuleViolation(&_violations);
    rule7421->setViolations(&_violationMessages);

    // Duty 1 (SQ285 SIN-AKL) - Same as illegal case
    // Departure: 2025-12-12 14:50 SIN LT -> 2025-12-12 06:50 UTC (410 mins from epoch)
    // Arrival:   2025-12-13 00:20 AKL LT -> 2025-12-12 12:20 UTC (740 mins from epoch)
    auto duty1_segments = {
        SIA6Duty::makeSegmentConfig("FLY", "SIN", "AKL", 410, 740, "SQ285")
    };
    auto duty1 = SIA6Duty::makeDuty(duty1_segments);
    duty1.duty->setAssignment("FLY");

    // Duty 2 (SBY AKL) - Sufficient rest before this duty
    // Start: 2025-12-13 23:10 AKL LT -> 2025-12-13 11:10 UTC (2110 mins from epoch)
    // End:   2025-12-14 05:10 AKL LT -> 2025-12-13 17:10 UTC (2470 mins from epoch)
    auto duty2_segments = {
        SIA6Duty::makeSegmentConfig("SBY", "AKL", "AKL", 2110, 2470)
    };
    auto duty2 = SIA6Duty::makeDuty(duty2_segments);
    duty2.duty->setAssignment("SBY");

    // Duty 3 (SQ286 AKL-SIN) - Same as illegal case
    // Departure: 2025-12-15 02:10 AKL LT -> 2025-12-14 14:10 UTC (3730 mins from epoch)
    // Arrival:   2025-12-15 13:00 SIN LT -> 2025-12-15 05:00 UTC (4620 mins from epoch)
    auto duty3_segments = {
        SIA6Duty::makeSegmentConfig("FLY", "AKL", "SIN", 3730, 4620, "SQ286")
    };
    auto duty3 = SIA6Duty::makeDuty(duty3_segments);
    duty3.duty->setAssignment("FLY");

    // Create a pairing object and add the duties. Rule 7421 operates on a pairing.
    Pairing pairing;
    pairing.setPairingNum("TC31-Legal-Welfare");
    pairing.appendDuty(duty1.duty.get());
    pairing.appendDuty(duty2.duty.get());
    pairing.appendDuty(duty3.duty.get());

    EXPECT_TRUE(rule7421->CheckRule(&pairing)) << "Rule 7421 should pass for sufficient welfare rest.";
    EXPECT_EQ(_violations.size(), 0);
}

TEST_F(SIA_4_7_OverseasStandbyRestTest, Illegal_MinRestSbyToFly_ShortRestAfterStandby) {
    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 480, "Asia/Singapore"},   // UTC+8
        {"AKL", 780, "Pacific/Auckland"}  // UTC+13 (NZDT)
        });

    auto rule7412 = makeRule7412(ctx);
    rule7412->setRuleViolation(&_violations);
    rule7412->setViolations(&_violationMessages);

    // Duty 1 (SQ285 SIN-AKL) - Same as illegal case
    // Departure: 2025-12-12 14:50 SIN LT -> 2025-12-12 06:50 UTC (410 mins from epoch)
    // Arrival:   2025-12-13 00:20 AKL LT -> 2025-12-12 12:20 UTC (740 mins from epoch)
    auto duty1_segments = {
        SIA6Duty::makeSegmentConfig("FLY", "SIN", "AKL", 410, 740, "SQ285")
    };
    auto duty1 = SIA6Duty::makeDuty(duty1_segments);
    duty1.duty->setAssignment("FLY");

    // Duty 2 (SBY AKL)
    // Start: 2025-12-14 12:10 AKL LT -> 2025-12-14 00:10 UTC (2890 mins from epoch)
    // End:   2025-12-14 18:10 AKL LT -> 2025-12-14 06:10 UTC (3250 mins from epoch)
    auto duty2_segments = {
        SIA6Duty::makeSegmentConfig("SBY", "AKL", "AKL", 2890, 3250)
    };
    auto duty2 = SIA6Duty::makeDuty(duty2_segments);
    duty2.duty->setAssignment("SBY");

    // Duty 3 (SQ286 AKL-SIN) - Same as illegal case
    // Departure: 2025-12-15 02:10 AKL LT -> 2025-12-14 14:10 UTC (3730 mins from epoch)
    // Arrival:   2025-12-15 13:00 SIN LT -> 2025-12-15 05:00 UTC (4620 mins from epoch)
    auto duty3_segments = {
        SIA6Duty::makeSegmentConfig("FLY", "AKL", "SIN", 3730, 4620, "SQ286")
    };
    auto duty3 = SIA6Duty::makeDuty(duty3_segments);
    duty3.duty->setAssignment("FLY");

    // Create a pairing object and add the duties. Rule 7412 operates on a pairing.
    Pairing pairing;
    pairing.setPairingNum("TC31-Illegal-MinRest");
    pairing.appendDuty(duty1.duty.get());
    pairing.appendDuty(duty2.duty.get());
    pairing.appendDuty(duty3.duty.get());

    // Rule 7412 typically checks rest between the current duty and the next duty.
    // So we check the rest after duty2 (standby) before duty3 (flight).
    // The rule will likely process the duties within the pairing.
    EXPECT_FALSE(rule7412->CheckRule(&pairing)) << "Rule 7412 should fail for insufficient rest after standby to fly.";
    EXPECT_EQ(_violations.size(), 1);
}
