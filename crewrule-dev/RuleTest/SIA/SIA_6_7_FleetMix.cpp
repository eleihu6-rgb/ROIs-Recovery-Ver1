// SIA_SUITE_SUMMARY_START
// SuiteId: 6.7
// Name: Fleet Mix
// SourceCsvRow: 6.7.,Fleet Mix
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Mixed 320/32A pairing allowed by allowable fleet mix -> rule 2112 passes.
//   - Case #2: Mixed 320/777 pairing not in allowable mix -> rule 2112 flags a violation.
//   - Case #3: Single-fleet pairing with fleet not in any row -> allowed (no mixing).
//   - Case #4: Mixed unlisted fleet with listed fleet -> disallowed.
//   - Case #5: Mixed two unlisted fleets -> disallowed.
//   - Case #6: Check_Mode=D enforces duty-level mixing checks.
//   - Case #7: Check_Mode=P enforces pairing-level mixing checks.
//   - Case #8: Duty/pairing rule rows differ; repeated checks remain correct.
//   - Case #9: Check_Mode=* applies to both duty and pairing checks.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Extend allowable mix list if SIA supplies more combos; timelines remain simplified.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 6.7 Fleet Mix using rule 2112 allowable fleet mix table.

namespace {

constexpr long long kFleetMixRuleId = 2112001;

DBRule makeTable1Row(int rowNum, const std::string& fleet) {
    DBRule row{};
    row.idRule = kFleetMixRuleId;
    row.function = 2112;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.params["Fleet"] = fleet;
    row.params["Bunk_Number"] = "0";
    row.params["Filter_Flight"] = "Y";
    row.params["Fleet_group"] = fleet;
    return row;
}

DBRule makeTable2Row(int rowNum, const std::string& mix) {
    DBRule row{};
    row.idRule = kFleetMixRuleId;
    row.function = 2112;
    row.tableNum = 2;
    row.rowNum = rowNum;
    row.params["Comb"] = std::to_string(rowNum);
    row.params["ALLOWABLE_FLEET_MIX"] = mix;
    return row;
}

DBRule makeTable2Row(int rowNum, const std::string& mix, const std::string& checkMode) {
    DBRule row = makeTable2Row(rowNum, mix);
    row.params["CHECK_MODE"] = checkMode;
    return row;
}

std::unique_ptr<Segment> makeSegment(const std::string& tail,
                                     const std::string& fleet) {
    auto seg = std::make_unique<Segment>();
    seg->setTailNum(tail.c_str());
    seg->setFleetCD(fleet);
    seg->setDepSta("SIN");
    seg->setArrSta("SIN");
    seg->setAssignment("FLY");
    seg->setStartTimeUtcAct(0);
    seg->setEndTimeUtcAct(0);
    seg->setStartTimeUtcSch(0);
    seg->setEndTimeUtcSch(0);
    seg->setStartTimeLocAct(0);
    seg->setEndTimeLocAct(0);
    seg->setStartTimeLocSch(0);
    seg->setEndTimeLocSch(0);
    return seg;
}

void registerRules(const RuleInput& input, const SharedPtr<CrewDataContext>& ctx) {
    for (const auto& rule : input.dbRules) {
        ctx->ruleList.push_back(rule);
        ctx->addRuleFunction(rule.function, rule);
    }
}

RuleInput buildRuleInput() {
    RuleInput input;
    // Table1: define fleets 320 and 32A (and wildcard for permissive coverage).
    input.dbRules.push_back(makeTable1Row(1, "320"));
    input.dbRules.push_back(makeTable1Row(2, "32A"));
    input.dbRules.push_back(makeTable1Row(3, "*"));
    // Table2: allowable mix 320|32A
    input.dbRules.push_back(makeTable2Row(1, "320|32A"));
    return input;
}

RuleInput buildRuleInputWithAllowableMix(const std::string& mix) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(1, "*"));
    input.dbRules.push_back(makeTable2Row(1, mix));
    return input;
}

}  // namespace

class SIA_6_7_FleetMix : public ::testing::Test {
};

TEST_F(SIA_6_7_FleetMix, Case1_AllowedMixPasses) {
    RuleInput input = buildRuleInput();
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    checker.setDataContext(ctx, -1, false);
    registerRules(input, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("TAIL1", "320"));
    segStore.push_back(makeSegment("TAIL2", "32A"));
    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};

    EXPECT_TRUE(checker.checkPGRules(segs, {RULES::BUNK_SETTING}));
}

TEST_F(SIA_6_7_FleetMix, Case2_DisallowedMixFails) {
    RuleInput input = buildRuleInput();
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    checker.setDataContext(ctx, -1, false);
    registerRules(input, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("TAIL1", "320"));
    segStore.push_back(makeSegment("TAIL3", "777"));
    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};

    EXPECT_FALSE(checker.checkPGRules(segs, {RULES::BUNK_SETTING}));
}

TEST_F(SIA_6_7_FleetMix, Case3_UnlistedSingleFleetPasses) {
    RuleInput input = buildRuleInputWithAllowableMix("359");
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    checker.setDataContext(ctx, -1, false);
    registerRules(input, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("TAIL1", "350"));
    segStore.push_back(makeSegment("TAIL2", "350"));
    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};

    EXPECT_TRUE(checker.checkPGRules(segs, {RULES::BUNK_SETTING}));
}

TEST_F(SIA_6_7_FleetMix, Case4_UnlistedMixedWithListedFails) {
    RuleInput input = buildRuleInputWithAllowableMix("359");
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    checker.setDataContext(ctx, -1, false);
    registerRules(input, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("TAIL1", "350"));
    segStore.push_back(makeSegment("TAIL2", "359"));
    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};

    EXPECT_FALSE(checker.checkPGRules(segs, {RULES::BUNK_SETTING}));
}

TEST_F(SIA_6_7_FleetMix, Case5_MixedTwoUnlistedFleetsFails) {
    RuleInput input = buildRuleInputWithAllowableMix("359");
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    checker.setDataContext(ctx, -1, false);
    registerRules(input, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("TAIL1", "350"));
    segStore.push_back(makeSegment("TAIL2", "380"));
    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};

    EXPECT_FALSE(checker.checkPGRules(segs, {RULES::BUNK_SETTING}));
}

TEST_F(SIA_6_7_FleetMix, Case6_CheckModeD_EnforcesDutyLevelMixing) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row(1, "359", "D"));
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    checker.setDataContext(ctx, -1, false);
    registerRules(input, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("TAIL1", "350"));
    segStore.push_back(makeSegment("TAIL2", "359"));
    std::vector<Segment*> dutySegs{segStore[0].get(), segStore[1].get()};

    auto duty = std::make_unique<Duty>(dutySegs);
    std::vector<Duty*> duties{duty.get()};

    EXPECT_FALSE(checker.checkPGRules(duties, {RULES::BUNK_SETTING}));
}

TEST_F(SIA_6_7_FleetMix, Case7_CheckModeP_EnforcesPairingLevelMixing) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row(1, "359", "P"));
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    checker.setDataContext(ctx, -1, false);
    registerRules(input, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("TAIL1", "350"));
    segStore.push_back(makeSegment("TAIL2", "359"));

    std::vector<Segment*> duty1Segs{segStore[0].get()};
    std::vector<Segment*> duty2Segs{segStore[1].get()};
    auto duty1 = std::make_unique<Duty>(duty1Segs);
    auto duty2 = std::make_unique<Duty>(duty2Segs);
    std::vector<Duty*> duties{duty1.get(), duty2.get()};

    EXPECT_FALSE(checker.checkPGRules(duties, {RULES::BUNK_SETTING}));
}

TEST_F(SIA_6_7_FleetMix, Case8_DutyAndPairingRulesIndependentAndRepeatable) {
    RuleInput input;
    // Duty rules: allow 350|359 but do NOT mention 380.
    input.dbRules.push_back(makeTable2Row(1, "350|359", "D"));
    input.dbRules.push_back(makeTable2Row(2, "7M8|738", "D"));
    // Pairing rules: allow 359|380 but do NOT mention 350.
    input.dbRules.push_back(makeTable2Row(3, "359|380", "P"));
    input.dbRules.push_back(makeTable2Row(4, "320|32A", "P"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    checker.setDataContext(ctx, -1, false);
    registerRules(input, ctx);

    // Scenario A: duty mix is allowed (350|359), but pairing mix is NOT allowed because 350 is not in any pairing row.
    {
        std::vector<std::unique_ptr<Segment>> segStore;
        segStore.push_back(makeSegment("TAIL1", "350"));
        segStore.push_back(makeSegment("TAIL2", "359"));
        std::vector<Segment*> dutySegs{segStore[0].get(), segStore[1].get()};
        auto duty = std::make_unique<Duty>(dutySegs);
        std::vector<Duty*> duties{duty.get()};

        EXPECT_FALSE(checker.checkPGRules(duties, {RULES::BUNK_SETTING}));
        EXPECT_FALSE(checker.checkPGRules(duties, {RULES::BUNK_SETTING}));
    }

    // Scenario B: pairing mix is allowed (359|380), but duty mix is NOT allowed because 380 is not in any duty row.
    {
        std::vector<std::unique_ptr<Segment>> segStore;
        segStore.push_back(makeSegment("TAIL3", "359"));
        segStore.push_back(makeSegment("TAIL4", "380"));
        std::vector<Segment*> dutySegs{segStore[0].get(), segStore[1].get()};
        auto duty = std::make_unique<Duty>(dutySegs);
        std::vector<Duty*> duties{duty.get()};

        EXPECT_FALSE(checker.checkPGRules(duties, {RULES::BUNK_SETTING}));
        EXPECT_FALSE(checker.checkPGRules(duties, {RULES::BUNK_SETTING}));
    }
}

TEST_F(SIA_6_7_FleetMix, Case9_CheckModeWildcardEnforcesDutyAndPairingMixing) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row(1, "77W", "*"));
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    checker.setDataContext(ctx, -1, false);
    registerRules(input, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("TAIL1", "77W"));
    segStore.push_back(makeSegment("TAIL2", "77X"));

    std::vector<Segment*> duty1Segs{segStore[0].get()};
    std::vector<Segment*> duty2Segs{segStore[1].get()};
    auto duty1 = std::make_unique<Duty>(duty1Segs);
    auto duty2 = std::make_unique<Duty>(duty2Segs);
    std::vector<Duty*> duties{duty1.get(), duty2.get()};

    EXPECT_FALSE(checker.checkPGRules(duties, {RULES::BUNK_SETTING}));
}
