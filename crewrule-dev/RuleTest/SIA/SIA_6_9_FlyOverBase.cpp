#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7460/RestrictMidDutyBaseTurnRule.h"

#include <memory>
#include <string>
#include <vector>
#include <chrono> // For time calculations

// Helper functions (copied from rule7460_gtest.cpp and adapted)
namespace {

Segment* makeSimpleSegment(const std::string& dep,
                           const std::string& arr,
                           time_t startUtc,
                           time_t endUtc) {
    auto* seg = new Segment();
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeLocAct(startUtc); // For simplicity, assume local same as UTC for this rule
    seg->setEndTimeLocAct(endUtc);     // For simplicity, assume local same as UTC for this rule
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segs) {
    auto duty = std::make_unique<Duty>(segs);
    if (!segs.empty()) {
        duty->setDepartureStation(segs.front()->getDepSta());
        duty->setArrivalStation(segs.back()->getArrSta());
        duty->setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
        duty->setStartTimeLocAct(segs.front()->getStartTimeLocAct()); // For simplicity
        duty->setEndTimeLocAct(segs.back()->getEndTimeLocAct());     // For simplicity
    }
    return duty;
}

SharedPtr<CrewDataContext> buildDataContextWithBaseSIN() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);

    BASE sinBase;
    sinBase.airline = "SQ";
    sinBase.base = "SIN";
    sinBase.baseId = 1;
    ctx->baseList.push_back(sinBase);

    // Airport offsets are needed for time calculations.
    // IST: UTC+3, SIN: UTC+8. Offset in minutes.
    ctx->airportUtcOffsetMap["SIN"] = 8 * 60; // +8 hours
    ctx->airportUtcOffsetMap["IST"] = 3 * 60; // +3 hours

    return ctx;
}

std::unique_ptr<RestrictMidDutyBaseTurnRule> makeRule7460(const SharedPtr<CrewDataContext>& ctx,
                                                          const std::vector<std::string>& paramStrings) {
    RuleInput input;
    input.ruleParamString = paramStrings;
    auto rule = std::make_unique<RestrictMidDutyBaseTurnRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(PAIRING_EDITOR); // This is typically for pairing editor or similar
    return rule;
}

// Convert hours/minutes to seconds
constexpr time_t H(int h) { return h * 3600; }
constexpr time_t M(int m) { return m * 60; }
constexpr time_t D(int d) { return d * 24 * 3600; }

// Epoch start: Jan 1, 2025 00:00:00 UTC (1735689600)
// This is used as a reference point for all flight times.
// Use 2024-12-31 for base_day_start_utc to align with SQ392 starting day 1 local time but Day 0 UTC
time_t base_day_start_utc = 1735603200; // 2024-12-31 00:00:00 UTC

} // namespace

// SIA 6.9 – Fly Over Base
// Best-fit rule(s): SIA-specific COP/base pattern rule layered on pairing construction.

// Test cases based on the provided excel data.
// Rule 7460 params: !(SIN),!(SIN),Y means "active restriction when duty avoids SIN at boundaries"
// This rule checks if a duty that starts and ends outside SIN passes through SIN mid-duty.

TEST(SIA_6_9_FlyOverBase, FlyOverBase_IST_SIN_IST_Illegal) {
    auto ctx = buildDataContextWithBaseSIN();
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    // Rule parameter: If duty starts and ends NOT at SIN, then intermediate SIN is illegal.
    std::vector<std::string> params = {
        "!(SIN),!(SIN),Y"
    };
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    // Test Case 1:
    // "COP: Day 1 - SQ391 - IST-SIN - 1020-2055, Day 3- SQ392 - SIN-IST - 1815-0530"
    // Interpreted as a single duty: IST-SIN-IST
    // Dep IST 13:15 (local Day 1) -> UTC 10:15 (Day 1)
    // Arr SIN 04:45 (local Day 2) -> UTC 20:45 (Day 1)
    //
    // Dep SIN 01:50 (local Day 3) -> UTC 17:50 (Day 2)
    // Arr IST 08:45 (local Day 3) -> UTC 05:45 (Day 3)
    
    // Duty: IST -> SIN -> IST
    std::vector<Segment*> duty1Segs;
    // Segment 1: SQ391 IST-SIN
    duty1Segs.push_back(makeSimpleSegment("IST", "SIN",
                                          base_day_start_utc + H(10) + M(15),  // 2025-01-01 10:15 UTC
                                          base_day_start_utc + H(20) + M(45))); // 2025-01-01 20:45 UTC
    // Segment 2: SQ392 SIN-IST
    duty1Segs.push_back(makeSimpleSegment("SIN", "IST",
                                          base_day_start_utc + D(2) + H(17) + M(50), // 2025-01-02 17:50 UTC
                                          base_day_start_utc + D(3) + H(5) + M(45))); // 2025-01-03 05:45 UTC
    auto duty1 = makeDuty(duty1Segs);

    // Expectation: Illegal, as duty starts at IST (!SIN), ends at IST (!SIN), and passes through SIN mid-duty.
    EXPECT_FALSE(rule->CheckRule(duty1.get()))
        << "Duty IST-SIN-IST should be illegal by Rule 7460.";

    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear(); // Clear violations for next test
}

TEST(SIA_6_9_FlyOverBase, FlyOverBase_SIN_IST_SIN_IST_Legal) {
    auto ctx = buildDataContextWithBaseSIN();
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    // Rule parameter: If duty starts and ends NOT at SIN, then intermediate SIN is illegal.
    std::vector<std::string> params = {
        "!(SIN),!(SIN),Y"
    };
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    // Test Case 2:
    // "COP: Day 1 - SQ392 - SIN-IST - 1815-0530, Day 4 - SQ391 - IST-SIN - 1020-2055, Day 6 - SQ392 - SIN-IST - 1815-0530"
    // Interpreted as a single duty: SIN-IST-SIN-IST
    // Dep SIN 01:50 (local Day 1) -> UTC 17:50 (Day 0)
    // Arr IST 08:45 (local Day 1) -> UTC 05:45 (Day 1)
    //
    // Dep IST 13:15 (local Day 4) -> UTC 10:15 (Day 4)
    // Arr SIN 04:45 (local Day 5) -> UTC 20:45 (Day 4)
    //
    // Dep SIN 01:50 (local Day 6) -> UTC 17:50 (Day 5)
    // Arr IST 08:45 (local Day 6) -> UTC 05:45 (Day 6)

    // Duty: SIN -> IST -> SIN -> IST
    std::vector<Segment*> duty2Segs;
    // Segment 1: SQ392 SIN-IST (Starts on UTC Day 0, based on local Day 1)
    duty2Segs.push_back(makeSimpleSegment("SIN", "IST",
                                          base_day_start_utc + H(17) + M(50),  // 2024-12-31 17:50 UTC (for local 2025-01-01 01:50 SIN)
                                          base_day_start_utc + D(1) + H(5) + M(45))); // 2025-01-01 05:45 UTC
    // Segment 2: SQ391 IST-SIN (Day 4)
    duty2Segs.push_back(makeSimpleSegment("IST", "SIN",
                                          base_day_start_utc + D(4) + H(10) + M(15), // 2025-01-04 10:15 UTC
                                          base_day_start_utc + D(4) + H(20) + M(45))); // 2025-01-04 20:45 UTC
    // Segment 3: SQ392 SIN-IST (Day 6)
    duty2Segs.push_back(makeSimpleSegment("SIN", "IST",
                                          base_day_start_utc + D(5) + H(17) + M(50), // 2025-01-05 17:50 UTC
                                          base_day_start_utc + D(6) + H(5) + M(45))); // 2025-01-06 05:45 UTC

    auto duty2 = makeDuty(duty2Segs);

    // Expectation: Legal, as duty starts at SIN (not !SIN), even though it passes through SIN mid-duty.
    // The original test case states "Illegal: Incomplete COP, trip does not end in SIN",
    // which indicates a pairing-level check, not a duty-level check by Rule 7460.
    // Based on Rule 7460's logic (starts and ends NOT at SIN), this duty should be legal.
    EXPECT_TRUE(rule->CheckRule(duty2.get()))
        << "Duty SIN-IST-SIN-IST should be legal by Rule 7460 because it starts at SIN.";

    for (auto* rv : violations) {
        delete rv;
    }
}