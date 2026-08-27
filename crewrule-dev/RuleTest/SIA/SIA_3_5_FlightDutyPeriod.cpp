// SIA_SUITE_SUMMARY_START
// SuiteId: 3.5
// Name: Flight Duty Period (FDP)
// SourceCsvRow: 3.5.,Flight Duty Period (FDP)
// Status: IMPLEMENTED
// ImplementedCases:
//   - SIN-KUL-SIN two-sector duty where FDP is built from stick time for each sector and minimum connection time (55 minutes) is enforced between sectors.
// Results:
//   - pass 1 out of 1 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:20Z
// RemainingWork:
//   - None for basic FDP single-duty behaviour; multi-sector FDP with FTL limits is tracked separately in SIA_3_5_FDP_MultiSector_Deadhead.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "CrewDB.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "SIA_CommonTestConfig.h"

#include <memory>
#include <string>
#include <vector>

extern long calculateDutyFdp(Duty* duty, CrewDataContext* dbData, CalculationManday FDP);

namespace {

time_t utcFromString(const std::string& ts) {
    return utcStrToUtc(const_cast<char*>(ts.c_str()));
}

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
                                     const std::string& dep = "SIN",
                                     const std::string& arr = "KUL") {
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

// SIA 3.5 Flight Duty Period (FDP) – SIN-KUL-SIN SQ104/3
// Validates that FDP is built from stick time and that a
// minimum connection time is enforced between sectors.
TEST(SIA_3_5_FlightDutyPeriod, UsesStickTimeAndMinConnection) {
    SIATest::SiaRuleParamGuard paramsGuard;

    auto ctx = makeContext();

    std::vector<std::unique_ptr<Segment>> storage;

    // Stick time 2h40m, actual 2h25m for both sectors.
    storage.push_back(makeSegment("2025-08-01 02:00:00", "2025-08-01 02:45:00", 104, 80)); // SIN-KUL
    storage.push_back(makeSegment("2025-08-01 03:30:00", "2025-08-01 04:15:00", 103, 80)); // KUL-SIN

    auto duty = std::make_unique<Duty>();
    auto segments = toRaw(storage);
    duty->setSegments(segments);

    CalculationManday manday{};
    const long fdpSeconds = calculateDutyFdp(duty.get(), ctx.get(), manday);

    // Expected FDP: 2x 80min stick + max(connection, 55min) = 80 + 80 + 55 = 215min.
    // 215 * 60 = 12900 seconds.
    EXPECT_EQ(fdpSeconds, 215 * 60);
}
