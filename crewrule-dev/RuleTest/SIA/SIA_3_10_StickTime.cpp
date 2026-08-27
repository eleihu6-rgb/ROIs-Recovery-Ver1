// SIA_SUITE_SUMMARY_START
// SuiteId: 3.10
// Name: Stick Time
// SourceCsvRow: 3.10.,Stick Time
// Status: IMPLEMENTED
// ImplementedCases:
//   - Single fictitious flight with no explicit stick time entry; verifies FDP falls back to block time when USE STICK TIME is enabled but stick data is missing.
// Results:
//   - pass 1 out of 1 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:20Z
// RemainingWork:
//   - Optionally add a multi-sector case combining stick-time sectors and a fictitious sector to demonstrate mixed behaviour in one duty.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "CrewDB.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

#include <memory>
#include <string>
#include <vector>

extern long calculateDutyFdp(Duty* duty, CrewDataContext* dbData, CalculationManday FDP);

namespace {

time_t utcFromString(const std::string& ts) {
    return utcStrToUtc(const_cast<char*>(ts.c_str()));
}

struct RuleParamGuard {
    RuleParams* rp = RuleParams::GetInstancePtr();

    bool bUseStickTime = rp->bUseStickTime;

    ~RuleParamGuard() {
        auto* rp = RuleParams::GetInstancePtr();
        rp->bUseStickTime = bUseStickTime;
    }
};

SharedPtr<CrewDataContext> makeContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    auto assignment = std::make_shared<ASSIGNMENT>();
    assignment->assignment = "FLY";
    assignment->FDP_PCT = 1.0;
    ctx->assignmentNameMap["FLY"] = assignment;
    return ctx;
}

std::unique_ptr<Segment> makeSegment(const std::string& start,
                                     const std::string& end,
                                     long long dbid,
                                     int blkMinutes,
                                     const std::string& dep = "AAA",
                                     const std::string& arr = "BBB") {
    auto seg = std::make_unique<Segment>();
    seg->setAssignment("FLY");
    seg->setIsOperating(true);
    seg->setDBId(dbid);
    seg->setDepStation(dep);
    seg->setArrStation(arr);

    const auto startUtc = utcFromString(start);
    const auto endUtc = utcFromString(end);

    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    seg->setStartTimeLocSch(startUtc);
    seg->setEndTimeLocSch(endUtc);
    seg->setBlkSeconds(static_cast<long>(blkMinutes) * 60);
    return seg;
}

std::vector<Segment*> toRaw(const std::vector<std::unique_ptr<Segment>>& storage) {
    std::vector<Segment*> raw;
    raw.reserve(storage.size());
    for (const auto& seg : storage) {
        raw.push_back(seg.get());
    }
    return raw;
}

}  // namespace

// SIA 3.10 Stick Time
// If a fictitious flight has no stick time, block time should be used.
TEST(SIA_3_10_StickTime, FallsBackToBlockTimeWhenNoStickTime) {
    RuleParamGuard guard;
    auto* rp = RuleParams::GetInstancePtr();
    rp->bUseStickTime = true;

    auto ctx = makeContext();

    std::vector<std::unique_ptr<Segment>> storage;

    // Flight without explicit stick time (blkMinutes used instead).
    storage.push_back(makeSegment("2025-10-01 08:00:00", "2025-10-01 10:00:00", 9001, 120));

    auto duty = std::make_unique<Duty>();
    auto segments = toRaw(storage);
    duty->setSegments(segments);

    CalculationManday manday{};
    const long fdpSeconds = calculateDutyFdp(duty.get(), ctx.get(), manday);

    // With USE STICK TIME enabled but no stick time table entry,
    // FDP should equal the provided block time (2h = 7200 sec).
    EXPECT_EQ(fdpSeconds, 120 * 60);
}
