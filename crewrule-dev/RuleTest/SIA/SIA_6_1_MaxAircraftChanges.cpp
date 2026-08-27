// SIA_SUITE_SUMMARY_START
// SuiteId: 6.1
// Name: Maximum number of aircraft changes in a duty
// SourceCsvRow: 6.1.,Maximum number of aircraft changes in a duty
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: With max aircraft changes value = 0, a duty that switches aircraft type once is illegal.
//   - Case #2: With max aircraft changes value = 1, the same duty is legal.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Add coverage for long-transit-driven aircraft-change accounting if needed once SIA clarifies requirements.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"
#include "CrewDB.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

// SIA 6.1 – Maximum number of aircraft changes in a duty
// Best-fit rule: rule2004 (field maxNrAircraftChangeInDuty).

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& flightNo,
                                     const std::string& tailNum,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setFlightNumber(flightNo);
    seg->setTailNum(tailNum);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeLocSch(start);
    seg->setEndTimeLocSch(end);
    seg->setIsOperating(true);
    seg->setIsDeadhead(false);
    seg->setAssignment("FLY");
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments) {
    auto duty = std::make_unique<Duty>(segments);
    if (!segments.empty()) {
        duty->setDepartureStation(segments.front()->getDepSta());
        duty->setArrivalStation(segments.back()->getArrSta());
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
        duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch());
        duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch());
    }
    duty->resetTypeBySegments();
    return duty;
}

struct Rule2004Config {
    std::string maxAircraftChanges;
    std::string maxDutyDp = "24:00";
};

std::unique_ptr<DBRule> makeRule2004(const Rule2004Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2004>();
    parsed->maxNrAircraftChangeInDuty = cfg.maxAircraftChanges;
    parsed->maxDutyDP = cfg.maxDutyDp;
    // Set other rule2004 params to permissive values to isolate the test
    parsed->maxNrFlySegsInDuty = "99";
    parsed->maxNrNonoperateLegsInDuty = "99";
    parsed->maxNrConsecutiveDhd = "99";
    parsed->maxNrDHDInDuty = "99";
    parsed->isDhdAllowedInMiddleDuty = "Y";
    parsed->isDutySegmentsInSameCalendarDay = "N";
    parsed->maxNrGRDCommuteInDuty = "99";
    parsed->isDutyBelongToDifferentDayChecked = "N";
    parsed->maxNrAircraftchangsAndLTInDuty = "99";
    parsed->isDHDmustBetweenBaseAndLOStation = "N";
    parsed->totalSegsInDuty = "99";
    parsed->maxFlightBLHAllowDHD = "999:00";
    parsed->isInternationalDHDallowed = "Y";
    rule->parsedParam = parsed;
    rule->idRule = 2004;
    rule->idRuleParam = 2004;
    return rule;
}

void setupAirport(DBAirport& airport, const char* code, const char* country, const char* dir) {
    std::memset(&airport, 0, sizeof(DBAirport));
    std::strncpy(airport.airport, code, sizeof(airport.airport) - 1);
    std::strncpy(airport.country, country, sizeof(airport.country) - 1);
    std::strncpy(airport.dir, dir, sizeof(airport.dir) - 1);
}

SharedPtr<CrewDataContext> buildCrewDataContext() {
    auto ctx = std::make_shared<CrewDataContext>();
    DBAirport sin, cgk, kul;
    setupAirport(sin, "SIN", "SG", "D");
    setupAirport(cgk, "CGK", "ID", "I");
    setupAirport(kul, "KUL", "MY", "I");

    ctx->airportList.push_back(sin);
    ctx->airportList.push_back(cgk);
    ctx->airportList.push_back(kul);
    
    ctx->airportZoneIdMap["SIN"] = "Etc/UTC";
    ctx->airportZoneIdMap["CGK"] = "Etc/UTC";
    ctx->airportZoneIdMap["KUL"] = "Etc/UTC";

    return ctx;
}


class SIA_6_1_MaxAircraftChangesTest : public ::testing::Test {
protected:
    SIA_6_1_MaxAircraftChangesTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext()) 
    {
        _checker.setDataContext(_dataContext, -1, false);
    }

    std::vector<std::unique_ptr<Segment>> segStore;

    std::unique_ptr<Duty> buildDutyWithSingleAircraftChange() {
        std::vector<Segment*> segs;

        segStore.push_back(makeSegment("SQ956", "A350", "SIN", "CGK", "2025-12-04 01:25:00", "2025-12-04 03:10:00"));
        segs.push_back(segStore.back().get());
        segStore.push_back(makeSegment("SQ957", "A350", "CGK", "SIN", "2025-12-04 04:15:00", "2025-12-04 06:05:00"));
        segs.push_back(segStore.back().get());
        segStore.push_back(makeSegment("SQ122", "B787", "SIN", "KUL", "2025-12-04 08:25:00", "2025-12-04 09:40:00"));
        segs.push_back(segStore.back().get());
        segStore.push_back(makeSegment("SQ121", "B787", "KUL", "SIN", "2025-12-04 10:40:00", "2025-12-04 11:50:00"));
        segs.push_back(segStore.back().get());

        return makeDuty(segs);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};


// Case #1 (6.1): max aircraft changes = 0, actual aircraft changes = 1 -> illegal.
TEST_F(SIA_6_1_MaxAircraftChangesTest, SingleAircraftChangeExceedsLimitOfZero) {
    Rule2004Config cfg;
    cfg.maxAircraftChanges = "0";
    auto rule = makeRule2004(cfg);

    auto duty = buildDutyWithSingleAircraftChange();
    std::vector<Duty*> duties{duty.get()};

    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #2 (6.1): max aircraft changes = 1, actual aircraft changes = 1 -> legal.
TEST_F(SIA_6_1_MaxAircraftChangesTest, SingleAircraftChangeWithinLimitOfOne) {
    Rule2004Config cfg;
    cfg.maxAircraftChanges = "1";
    auto rule = makeRule2004(cfg);

    auto duty = buildDutyWithSingleAircraftChange();
    std::vector<Duty*> duties{duty.get()};

    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

}  // namespace