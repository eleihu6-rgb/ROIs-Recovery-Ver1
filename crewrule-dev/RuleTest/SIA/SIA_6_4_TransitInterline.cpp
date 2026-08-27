// SIA_SUITE_SUMMARY_START
// SuiteId: 6.4
// Name: Transit Time (interline)
// SourceCsvRow: 6.4.,Transit Time (interline)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Connection 2h40 with MCT 2h and max 6h -> rule 3001 passes.
//   - Case #2: Connection 10h40 with max 6h -> rule 3001 flags a violation.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Add airline-change filtering if SIA requires it; timelines remain simplified.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 6.4 Transit Time (interline) using rule 3001 with max-connection guard.

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
    seg->setDepSta("NRT");
    seg->setArrSta("HNL");
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

DBRule makeRule3001(const std::string& mct, const std::string& maxConn) {
    DBRule row{};
    row.idRule = 3001300;
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
    row.params["AIRLINE CHANGE"] = "*";
    row.params["FLEETS"] = "*";
    row.params["SUB FLEETS"] = "*";
    return row;
}

}  // namespace

class SIA_6_4_TransitInterline : public ::testing::Test {
protected:
    void SetUp() override {
        _ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    SharedPtr<CrewDataContext> _ctx;
};

TEST_F(SIA_6_4_TransitInterline, Case1_WithinMaxConnPasses) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("02:00", "06:00"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-12-01 00:00:00", "2025-12-01 08:00:00", "FLY", "TAILX", 641401));
    segStore.push_back(makeSegment("2025-12-01 10:40:00", "2025-12-01 18:00:00", "FLY", "TAILY", 641402)); // 2h40 connection
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_TRUE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}

TEST_F(SIA_6_4_TransitInterline, Case2_ExceedsMaxConnFails) {
    RuleInput input;
    input.dbRules.push_back(makeRule3001("02:00", "06:00"));

    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);
    registerRules(input, _ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("2025-12-01 00:00:00", "2025-12-01 08:00:00", "FLY", "TAILX", 641501));
    segStore.push_back(makeSegment("2025-12-01 18:40:00", "2025-12-02 05:00:00", "FLY", "TAILY", 641502)); // 10h40 connection
    registerSegmentsInContext(_ctx, segStore);

    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    EXPECT_FALSE(checker.checkPGRules(segs, {RULES::MIN_CONN_DIP}));
}