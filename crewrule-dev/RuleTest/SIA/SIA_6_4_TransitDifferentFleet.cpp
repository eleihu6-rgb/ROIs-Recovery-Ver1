// SIA_SUITE_SUMMARY_START
// SuiteId: 6.4
// Name: Transit Time (different fleet aircraft)
// SourceCsvRow: 6.4.,Transit Time (different fleet aircraft)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Connection 2h30 with aircraft change required and MCT 2h -> rule 3001 passes.
//   - Case #2: Connection 1h20 with aircraft change required and MCT 3h30 -> rule 3001 flags a violation.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Add fleet/sub-fleet filtering if SIA provides them; timelines simplified to AAA base.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 6.4 Transit Time (different fleet aircraft) using rule 3001 with aircraft change required.

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& assignment,
                                     const std::string& tail,
                                     long long dbId) {
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

DBRule makeRule3001(const std::string& mct) {
    DBRule row{};
    row.idRule = 3001200;
    row.function = RULES::MIN_CONN_DIP;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.overridebility = "S";
    row.params["MCT"] = mct;
    row.params["AIRCRAFT CHANGE"] = "Y";
    row.params["AIRPORT"] = "*";
    row.params["INBOUND DUTY"] = "*";
    row.params["OUTBOUND DUTY"] = "*";
    row.params["FLEETS"] = "*";
    row.params["SUB FLEETS"] = "*";
    return row;
}

}  // namespace

class SIA_6_4_TransitDifferentFleet : public ::testing::Test {
protected:
    void SetUp() override {
        _ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    SharedPtr<CrewDataContext> _ctx;
};

TEST_F(SIA_6_4_TransitDifferentFleet, Case1_ConnectionMeetsTwoHourMctPasses) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("02:00"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-07-01 00:00:00", "2025-07-01 08:00:00", "FLY", "TAILA", 641201));
    segStore.push_back(makeSegment("2025-07-01 10:30:00", "2025-07-01 14:00:00", "FLY", "TAILB", 641202)); // 2h30 connection, different tail
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_TRUE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}

TEST_F(SIA_6_4_TransitDifferentFleet, Case2_ConnectionBelowThreeHourThirtyMctFails) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("03:30"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-08-01 00:00:00", "2025-08-01 08:00:00", "FLY", "TAILA", 641301));
    segStore.push_back(makeSegment("2025-08-01 09:20:00", "2025-08-01 14:00:00", "FLY", "TAILB", 641302)); // 1h20 connection
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_FALSE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}