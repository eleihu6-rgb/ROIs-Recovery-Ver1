// SIA_SUITE_SUMMARY_START
// SuiteId: 6.4
// Name: Transit Time (different aircraft rotation, same fleet)
// SourceCsvRow: 6.4.,Transit Time (different aircraft rotation, same fleet)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Connection 1h15 with MCT 2h -> rule 3001 flags a violation.
//   - Case #2: Same connection with MCT 1h -> rule 3001 passes.
//   - Case #3: Connection 1h15 with maxConn 1h -> rule 3001 flags a violation.
//   - Case #4: Same connection with maxConn 2h -> rule 3001 passes.
// Results:
//   - pass 4 out of 4 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Fill in specific fleet/sub-fleet filters if SIA supplies them; timelines remain simplified.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 6.4 Transit Time (different aircraft rotation, same fleet) using rule 3001.

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& assignment,
                                     const std::string& tail,
                                     long long dbId,
                                     const std::string& fleetCd = "A350") {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeLocSch(start);
    seg->setEndTimeLocSch(end);
    seg->setAssignment(assignment);
    seg->setTailNum(tail.c_str());
    seg->setDBId(dbId);
    seg->setFleetCD(fleetCd);
    seg->setDepSta("SIN");
    seg->setArrSta("SIN");
    return seg;
}

void registerSegmentsInContext(const SharedPtr<CrewDataContext>& ctx,
                               const std::vector<std::unique_ptr<Segment>>& segments) {
    for (const auto& seg : segments) {
        auto copy = std::make_shared<Segment>(seg.get());
        ctx->flightIdMap[seg->getDBId()] = copy;
    }
}

void registerRules(const RuleInput& input, const SharedPtr<CrewDataContext>& ctx) {
    for (const auto& rule : input.dbRules) {
        ctx->ruleList.push_back(rule);
        ctx->addRuleFunction(rule.function, rule);
    }
}

DBRule makeRule3001(const std::string& mct,
                    const std::string& maxConn = "*") {
    DBRule row{};
    row.idRule = 3001100;
    row.function = RULES::MIN_CONN_DIP;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.overridebility = "S";
    row.params["MCT"] = mct;
    row.params["MAX CONN"] = maxConn;
    row.params["AIRPORT"] = "*";
    row.params["INBOUND DUTY"] = "*";
    row.params["OUTBOUND DUTY"] = "*";
    row.params["AIRCRAFT CHANGE"] = "*";
    row.params["FLEETS"] = "*";
    row.params["SUB FLEETS"] = "*";
    row.params["FLEET GROUP CHANGE"] = "*";
    return row;
}

}  // namespace

class SIA_6_4_TransitSameFleet : public ::testing::Test {
protected:
    void SetUp() override {
        _ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);

        FLEET wideBody;
        wideBody.fleet = "A350";
        wideBody.fleetGrp = "WB";
        _ctx->fleetMap["A350"] = wideBody;

        FLEET narrowBody;
        narrowBody.fleet = "B737";
        narrowBody.fleetGrp = "NB";
        _ctx->fleetMap["B737"] = narrowBody;
    }

    SharedPtr<CrewDataContext> _ctx;
};

TEST_F(SIA_6_4_TransitSameFleet, Case1_MctTwoHoursFailsForShortConnection) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("02:00"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-03-01 00:00:00", "2025-03-01 06:00:00", "FLY", "TAIL1", 640101));
    segStore.push_back(makeSegment("2025-03-01 07:15:00", "2025-03-01 10:00:00", "FLY", "TAIL1", 640102)); // 1h15 conn
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_FALSE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}

TEST_F(SIA_6_4_TransitSameFleet, Case2_MctOneHourPassesForShortConnection) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("01:00"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-04-01 00:00:00", "2025-04-01 06:00:00", "FLY", "TAIL1", 640201));
    segStore.push_back(makeSegment("2025-04-01 07:15:00", "2025-04-01 10:00:00", "FLY", "TAIL1", 640202));
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_TRUE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}

TEST_F(SIA_6_4_TransitSameFleet, Case3_MaxConnOneHourFails) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("00:30", "01:00"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-05-01 00:00:00", "2025-05-01 06:00:00", "FLY", "TAIL1", 640301));
    segStore.push_back(makeSegment("2025-05-01 07:15:00", "2025-05-01 10:00:00", "FLY", "TAIL1", 640302));
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_FALSE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}

TEST_F(SIA_6_4_TransitSameFleet, Case4_MaxConnTwoHoursPasses) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("00:30", "02:00"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-06-01 00:00:00", "2025-06-01 06:00:00", "FLY", "TAIL1", 640401));
    segStore.push_back(makeSegment("2025-06-01 07:15:00", "2025-06-01 10:00:00", "FLY", "TAIL1", 640402));
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_TRUE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}

TEST_F(SIA_6_4_TransitSameFleet, FleetGroupChangeYes_FailsWhenGroupChanges) {
    RuleInput input;
    auto rule = makeRule3001("02:00");
    rule.params["FLEET GROUP CHANGE"] = "Y";
    input.dbRules.push_back(rule);

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-07-01 00:00:00", "2025-07-01 06:00:00", "FLY", "TAIL1", 640501, "A350"));
    segStore.push_back(makeSegment("2025-07-01 07:00:00", "2025-07-01 10:00:00", "FLY", "TAIL2", 640502, "B737"));
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_FALSE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}

TEST_F(SIA_6_4_TransitSameFleet, FleetGroupChangeYes_SkipsWhenSameGroup) {
    RuleInput input;
    auto rule = makeRule3001("02:00");
    rule.params["FLEET GROUP CHANGE"] = "Y";
    input.dbRules.push_back(rule);

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-08-01 00:00:00", "2025-08-01 06:00:00", "FLY", "TAIL1", 640601, "A350"));
    segStore.push_back(makeSegment("2025-08-01 07:00:00", "2025-08-01 10:00:00", "FLY", "TAIL2", 640602, "A350"));
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_TRUE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}
