#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7460/RestrictMidDutyBaseTurnRule.h"

#include <memory>
#include <string>
#include <vector>

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
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    return seg;
}

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

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& base) {
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

SharedPtr<CrewDataContext> buildDataContextWithBaseSIN() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);

    BASE sinBase;
    sinBase.airline = "SQ";
    sinBase.base = "SIN";
    sinBase.baseId = 1;
    ctx->baseList.push_back(sinBase);

    // Airport offsets are not used directly by rule 7460 but are required elsewhere.
    ctx->airportUtcOffsetMap["SIN"] = 480;
    ctx->airportUtcOffsetMap["XMN"] = 480;
    ctx->airportUtcOffsetMap["COK"] = 330;
    ctx->airportUtcOffsetMap["MXP"] = 60;
    ctx->airportUtcOffsetMap["BCN"] = 60;

    return ctx;
}

std::unique_ptr<RestrictMidDutyBaseTurnRule> makeRule7460(const SharedPtr<CrewDataContext>& ctx,
                                                          const std::vector<std::string>& paramStrings) {
    RuleInput input;
    input.ruleParamString = paramStrings;
    auto rule = std::make_unique<RestrictMidDutyBaseTurnRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(PAIRING_EDITOR);
    return rule;
}

} // namespace

// With restriction table configured via ACTIVE flag and negated patterns:
// - Table rows:
//     *,!(SIN|KUL),N  (explicitly disabled)
//     !(SIN),!(SIN),Y (active restriction when duty avoids SIN at boundaries)
// - XMN-SIN-COK is illegal (matches the active row and turns at base mid-duty)
// - SIN-COK-SIN-KUL is legal since duty starts at base and does not match the active row
TEST(Rule7460Test, WithRestrictionTableExcludeSINForActiveRows) {
    auto ctx = buildDataContextWithBaseSIN();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    std::vector<std::string> params = {
        "*,!(SIN|KUL),N",
        "!(SIN),!(SIN),Y"
    };
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    // Duty 1: XMN-SIN-COK (mid-duty SIN, not start/end) -> illegal
    std::vector<Segment*> d1Segs;
    d1Segs.push_back(makeSimpleSegment("XMN", "SIN", 0, 1));
    d1Segs.push_back(makeSimpleSegment("SIN", "COK", 2, 3));
    auto duty1 = makeDuty(d1Segs);

    EXPECT_FALSE(rule->CheckRule(duty1.get()));

    // Duty 2: SIN-COK-SIN-KUL (starts at base) -> legal
    std::vector<Segment*> d2Segs;
    d2Segs.push_back(makeSimpleSegment("SIN", "COK", 10, 11));
    d2Segs.push_back(makeSimpleSegment("COK", "SIN", 12, 13));
    d2Segs.push_back(makeSimpleSegment("SIN", "KUL", 14, 15));
    auto duty2 = makeDuty(d2Segs);

    EXPECT_TRUE(rule->CheckRule(duty2.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

// With restriction table configured to restrict any airports:
// - XMN-SIN-COK is illegal
// - SIN-COK-SIN-KUL is illegal (mid-duty SIN and baseList contains SIN)
// - MXP-BCN-MXP is legal since SIN is not in the middle
TEST(Rule7460Test, WithRestrictionTableAllForActiveRows) {
    auto ctx = buildDataContextWithBaseSIN();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    // restrict any airports
    std::vector<std::string> params = {
    "*,*,Y"
    };
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    // XMN-SIN-COK -> illegal
    std::vector<Segment*> d1Segs;
    d1Segs.push_back(makeSimpleSegment("XMN", "SIN", 0, 1));
    d1Segs.push_back(makeSimpleSegment("SIN", "COK", 2, 3));
    auto duty1 = makeDuty(d1Segs);
    EXPECT_FALSE(rule->CheckRule(duty1.get()));

    // SIN-COK-SIN-KUL -> illegal (mid-duty SIN, start at SIN does not bypass base check)
    std::vector<Segment*> d2Segs;
    d2Segs.push_back(makeSimpleSegment("SIN", "COK", 10, 11));
    d2Segs.push_back(makeSimpleSegment("COK", "SIN", 12, 13));
    d2Segs.push_back(makeSimpleSegment("SIN", "KUL", 14, 15));
    auto duty2 = makeDuty(d2Segs);
    EXPECT_FALSE(rule->CheckRule(duty2.get()));

    // MXP-BCN-MXP -> legal (no SIN in middle)
    std::vector<Segment*> d3Segs;
    d3Segs.push_back(makeSimpleSegment("MXP", "BCN", 20, 21));
    d3Segs.push_back(makeSimpleSegment("BCN", "MXP", 22, 23));
    auto duty3 = makeDuty(d3Segs);
    EXPECT_TRUE(rule->CheckRule(duty3.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

// With no restriction table (empty ruleParamString/dbRules):
// - XMN-SIN-COK is legal since no rule is active
// - SIN-COK-SIN-KUL is legal since no rule is active
// - MXP-BCN-MXP is legal since no rule is active
TEST(Rule7460Test, WithoutRestrictionTable) {
    auto ctx = buildDataContextWithBaseSIN();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    // No params -> rule enabled with no exceptions
    std::vector<std::string> params;
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    // XMN-SIN-COK -> illegal
    std::vector<Segment*> d1Segs;
    d1Segs.push_back(makeSimpleSegment("XMN", "SIN", 0, 1));
    d1Segs.push_back(makeSimpleSegment("SIN", "COK", 2, 3));
    auto duty1 = makeDuty(d1Segs);
    EXPECT_TRUE(rule->CheckRule(duty1.get()));

    // SIN-COK-SIN-KUL -> illegal (mid-duty SIN, start at SIN does not bypass base check)
    std::vector<Segment*> d2Segs;
    d2Segs.push_back(makeSimpleSegment("SIN", "COK", 10, 11));
    d2Segs.push_back(makeSimpleSegment("COK", "SIN", 12, 13));
    d2Segs.push_back(makeSimpleSegment("SIN", "KUL", 14, 15));
    auto duty2 = makeDuty(d2Segs);
    EXPECT_TRUE(rule->CheckRule(duty2.get()));

    // MXP-BCN-MXP -> legal (no SIN in middle)
    std::vector<Segment*> d3Segs;
    d3Segs.push_back(makeSimpleSegment("MXP", "BCN", 20, 21));
    d3Segs.push_back(makeSimpleSegment("BCN", "MXP", 22, 23));
    auto duty3 = makeDuty(d3Segs);
    EXPECT_TRUE(rule->CheckRule(duty3.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

// Rows marked as ACTIVE != Y are ignored entirely; rule behaves as if the row wasn't present.
TEST(Rule7460Test, InactiveRowsIgnored) {
    auto ctx = buildDataContextWithBaseSIN();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    std::vector<std::string> params = {
        "!(SIN),!(SIN),N"
    };
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    std::vector<Segment*> segs;
    segs.push_back(makeSimpleSegment("XMN", "SIN", 0, 1));
    segs.push_back(makeSimpleSegment("SIN", "COK", 2, 3));
    auto duty = makeDuty(segs);

    EXPECT_TRUE(rule->CheckRule(duty.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7460Test, DutyCheckIgnoresRowsConfiguredForPairingCount) {
    auto ctx = buildDataContextWithBaseSIN();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    std::vector<std::string> params = {
        "*,*,Y,1"
    };
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    std::vector<Segment*> segs;
    segs.push_back(makeSimpleSegment("XMN", "SIN", 0, 1));
    segs.push_back(makeSimpleSegment("SIN", "COK", 2, 3));
    auto duty = makeDuty(segs);

    EXPECT_TRUE(rule->CheckRule(duty.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7460Test, PairingCheckFailsWhenViolatingDutyCountExceedsConfiguredTotal) {
    auto ctx = buildDataContextWithBaseSIN();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    std::vector<std::string> params = {
        "*,*,Y,1"
    };
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    std::vector<Segment*> d1Segs;
    d1Segs.push_back(makeSimpleSegment("XMN", "SIN", 0, 1));
    d1Segs.push_back(makeSimpleSegment("SIN", "COK", 2, 3));
    auto duty1 = makeDuty(d1Segs);

    std::vector<Segment*> d2Segs;
    d2Segs.push_back(makeSimpleSegment("MXP", "SIN", 10, 11));
    d2Segs.push_back(makeSimpleSegment("SIN", "BCN", 12, 13));
    auto duty2 = makeDuty(d2Segs);

    auto pairing = makePairing({duty1.get(), duty2.get()}, "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7460Test, PairingCheckEvaluatesOverlappingRowsIndependently) {
    auto ctx = buildDataContextWithBaseSIN();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    std::vector<std::string> params = {
        "*,!(SIN),Y,1",
        "SIN,!(SIN),Y,2"
    };
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    std::vector<Segment*> d1Segs;
    d1Segs.push_back(makeSimpleSegment("SIN", "MXP", 0, 1));
    d1Segs.push_back(makeSimpleSegment("MXP", "SIN", 2, 3));
    d1Segs.push_back(makeSimpleSegment("SIN", "COK", 4, 5));
    auto duty1 = makeDuty(d1Segs);

    std::vector<Segment*> d2Segs;
    d2Segs.push_back(makeSimpleSegment("SIN", "BCN", 10, 11));
    d2Segs.push_back(makeSimpleSegment("BCN", "SIN", 12, 13));
    d2Segs.push_back(makeSimpleSegment("SIN", "COK", 14, 15));
    auto duty2 = makeDuty(d2Segs);

    auto pairing = makePairing({duty1.get(), duty2.get()}, "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_NE(violations.front()->violation_msg.find("starting at (SIN) and ending at (COK)"), std::string::npos);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7460Test, DutyCheckDeduplicatesIdenticalViolationsFromOverlappingRows) {
    auto ctx = buildDataContextWithBaseSIN();

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;

    std::vector<std::string> params = {
        "*,!(SIN),Y",
        "SIN,!(SIN),Y"
    };
    auto rule = makeRule7460(ctx, params);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    std::vector<Segment*> segs;
    segs.push_back(makeSimpleSegment("SIN", "MXP", 0, 1));
    segs.push_back(makeSimpleSegment("MXP", "SIN", 2, 3));
    segs.push_back(makeSimpleSegment("SIN", "COK", 4, 5));
    auto duty = makeDuty(segs);

    EXPECT_FALSE(rule->CheckRule(duty.get()));
    EXPECT_EQ(violations.size(), 1u);

    for (auto* rv : violations) {
        delete rv;
    }
}

