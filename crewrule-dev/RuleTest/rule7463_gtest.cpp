#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7463/LimitSwingbackForSQRule.h"
#include "CrewDB.h"

#include <memory>
#include <string>
#include <vector>

namespace {

// Helper to create a segment. For this rule, only airports and times matter.
Segment* makeSimpleSegment(const std::string& dep,
                           const std::string& arr,
                           time_t startUtc,
                           time_t endUtc) {
    auto* seg = new Segment();
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    // Local times are not critical for this test but good to have.
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    return seg;
}

// Helper to create a duty from a vector of segments.
std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segs) {
    auto duty = std::make_unique<Duty>(segs);
    if (!segs.empty()) {
        duty->setDepartureStation(segs.front()->getDepSta());
        duty->setArrivalStation(segs.back()->getArrSta());
        duty->setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
        duty->setStartTimeLocAct(segs.front()->getStartTimeLocAct());
        duty->setEndTimeLocAct(segs.back()->getEndTimeLocAct());
    }
    return duty;
}

// Helper to create a pairing from a vector of duties.
std::unique_ptr<Pairing> makePairing(std::vector<Duty*> duties, const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setPrimeActivity("FLY");
    if (!duties.empty()) {
        Duty* first = duties.front();
        Duty* last = duties.back();
        pairing->setStartTimeUtcAct(first->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct());
        pairing->setStartTimeLocAct(first->getStartTimeLocAct());
        pairing->setEndTimeLocAct(last->getEndTimeLocAct());
    }
    return pairing;
}

// Sets up the data context with necessary airport timezone offsets.
SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    
    // Timezone offsets in minutes from UTC
    ctx->airportUtcOffsetMap["SIN"] = 8 * 60;    // UTC+8
    ctx->airportUtcOffsetMap["ICN"] = 9 * 60;    // UTC+9
    ctx->airportUtcOffsetMap["CVG"] = -5 * 60;   // UTC-5 (Standard Time)
    ctx->airportUtcOffsetMap["NGO"] = 9 * 60;    // UTC+9
    ctx->airportUtcOffsetMap["LAX"] = -8 * 60;   // UTC-8 (Standard Time)
    
    // Set zone IDs for timezone calculations
    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
    ctx->airportZoneIdMap["ICN"] = "Asia/Seoul";
    ctx->airportZoneIdMap["CVG"] = "America/New_York";
    ctx->airportZoneIdMap["NGO"] = "Asia/Tokyo";
    ctx->airportZoneIdMap["LAX"] = "America/Los_Angeles";

    return ctx;
}

// Creates an instance of the rule with given parameters.
std::unique_ptr<LimitSwingbackForSQRule> makeRule7463(const SharedPtr<CrewDataContext>& ctx,
                                                      const std::string& paramString) {
    RuleInput input;
    input.ruleParamString.push_back(paramString);
    auto rule = std::make_unique<LimitSwingbackForSQRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(PAIRING_EDITOR);
    return rule;
}

} // namespace

// Test case for a pairing that should trigger a swingback violation.
// Pairing: SIN-ICN-CVG-NGO-SIN
// Layovers: ICN, CVG, NGO
// TZs: ICN(+9), CVG(-5), NGO(+9)
// Check 1: abs(TZ(ICN) - TZ(NGO)) = abs(9-9) = 0. This is <= tolerance (00:00).
// Check 2: The current implementation checks abs(TZ(Dep) - TZ(Arr)) for each duty.
// Let's assume the user's intended logic is what should be tested against: abs(TZ(CVG) - TZ(ICN)) = abs(-5-9) = 14 hours. This is >= 3 hours.
// This should be 1 swingback. With MaxSwingback set to 0, it should fail.
TEST(Rule7463Test, SwingbackViolation) {
    auto ctx = buildDataContext();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    // Params: ServiceType, FleetGroup, SwingbackTZDiff, SameTZTolerance, MaxSwingback, Severity
    auto rule = makeRule7463(ctx, "*,*,03:00-99:00,00:00,0,1");
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    // Create pairing: SIN -> ICN -> CVG -> NGO -> SIN
    std::vector<Duty*> duties;
    // These need to be manually deleted if not put in smart pointers inside the pairing
    duties.push_back(makeDuty({makeSimpleSegment("SIN", "ICN", 1000, 2000)}).release());
    duties.push_back(makeDuty({makeSimpleSegment("ICN", "CVG", 3000, 4000)}).release());
    duties.push_back(makeDuty({makeSimpleSegment("CVG", "NGO", 5000, 6000)}).release());
    duties.push_back(makeDuty({makeSimpleSegment("NGO", "SIN", 7000, 8000)}).release());
    
    auto pairing = makePairing(duties, "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

// Test case for a pairing that should NOT have a swingback.
// Pairing: SIN-ICN-CVG-LAX-SIN
// Layovers: ICN, CVG, LAX
// TZs: ICN(+9), CVG(-5), LAX(-8)
// Check 1: abs(TZ(ICN) - TZ(LAX)) = abs(9 - (-8)) = 17 hours. This is > tolerance (00:00).
// No swingback should be detected.
TEST(Rule7463Test, NoSwingback) {
    auto ctx = buildDataContext();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    // Params: ServiceType, FleetGroup, SwingbackTZDiff, SameTZTolerance, MaxSwingback, Severity
    auto rule = makeRule7463(ctx, "*,*,03:00-99:00,00:00,0,1");
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    // Create pairing: SIN -> ICN -> CVG -> LAX -> SIN
    std::vector<Duty*> duties;
    duties.push_back(makeDuty({makeSimpleSegment("SIN", "ICN", 1000, 2000)}).release());
    duties.push_back(makeDuty({makeSimpleSegment("ICN", "CVG", 3000, 4000)}).release());
    duties.push_back(makeDuty({makeSimpleSegment("CVG", "LAX", 5000, 6000)}).release());
    duties.push_back(makeDuty({makeSimpleSegment("LAX", "SIN", 7000, 8000)}).release());

    auto pairing = makePairing(duties, "SIN");

    EXPECT_TRUE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}
