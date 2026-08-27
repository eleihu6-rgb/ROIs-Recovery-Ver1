// SIA_SUITE_SUMMARY_START
// SuiteId: 6.4
// Name: Transit Time (same aircraft rotation)
// SourceCsvRow: 6.4.,Transit Time (min and max time should be customisable by user) (same aircraft rotation)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Connection of 3h05 with MCT 1h30 -> rule 3001 passes.
//   - Case #2: Connection of 35 minutes with MCT 1h30 -> rule 3001 flags a violation.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Replace simplified AAA/SIN timelines with real station offsets if required by future SIA COP builders.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 6.4 Transit Time (same aircraft rotation) using rule 3001 (MIN_CONN_DIP).

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

DBRule makeRule3001(const std::string& mct, const std::string& maxConn = "*") {
    DBRule row{};
    row.idRule = 3001001;
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
    return row;
}

}  // namespace

class SIA_6_4_TransitSameRotation : public ::testing::Test {
protected:
    void SetUp() override {
        _ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    SharedPtr<CrewDataContext> _ctx;
};

TEST_F(SIA_6_4_TransitSameRotation, Case1_ConnectionAboveMctPasses) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("01:30"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-01-01 00:00:00", "2025-01-01 06:00:00", "FLY", "TAIL1", 300101));
    segStore.push_back(makeSegment("2025-01-01 09:05:00", "2025-01-01 12:00:00", "FLY", "TAIL1", 300102));
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_TRUE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}

TEST_F(SIA_6_4_TransitSameRotation, Case2_ConnectionBelowMctFails) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("01:30"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-02-01 00:00:00", "2025-02-01 06:00:00", "FLY", "TAIL1", 300201));
    segStore.push_back(makeSegment("2025-02-01 06:35:00", "2025-02-01 10:00:00", "FLY", "TAIL1", 300202));
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_FALSE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}