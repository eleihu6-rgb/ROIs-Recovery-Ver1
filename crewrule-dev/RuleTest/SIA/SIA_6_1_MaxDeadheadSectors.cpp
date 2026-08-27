// SIA_SUITE_SUMMARY_START
// SuiteId: 6.1
// Name: Maximum number of deadhead sectors per duty
// SourceCsvRow: 6.1.,Maximum number of deadhead sectors per duty
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: With max deadhead sectors value = 1, a duty containing two DHD legs is illegal.
//   - Case #2: With max deadhead sectors value = 2, the same duty with two DHD legs is legal.
// Results:
//   - pass 3 out of 3 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Add additional combinations if SIA later specifies different mixes of DHD and FLY sectors that should still count towards this cap.
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

// SIA 6.1 – Maximum number of deadhead sectors per duty
// Best-fit rule: rule2004 (field maxNrDHDInDuty).

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& flightNo,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     bool isDeadhead) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setFlightNumber(flightNo);
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
    seg->setIsOperating(!isDeadhead);
    seg->setIsDeadhead(isDeadhead);
    seg->setAssignment(isDeadhead ? "DHD" : "FLY");
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
    std::string maxDhd;
    std::string maxDutyDp = "24:00";
};

std::unique_ptr<DBRule> makeRule2004(const Rule2004Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2004>();
    parsed->maxNrDHDInDuty = cfg.maxDhd;
    parsed->maxDutyDP = cfg.maxDutyDp;
    // Set other rule2004 params to permissive values to isolate the test
    parsed->maxNrFlySegsInDuty = "99";
    parsed->maxNrNonoperateLegsInDuty = "99";
    parsed->maxNrAircraftChangeInDuty = "99";
    parsed->maxNrConsecutiveDhd = "99";
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
    DBAirport sin, pen, kul;
    setupAirport(sin, "SIN", "SG", "D");
    setupAirport(pen, "PEN", "MY", "I");
    setupAirport(kul, "KUL", "MY", "I");

    ctx->airportList.push_back(sin);
    ctx->airportList.push_back(pen);
    ctx->airportList.push_back(kul);
    
    ctx->airportZoneIdMap["SIN"] = "Etc/UTC";
    ctx->airportZoneIdMap["PEN"] = "Etc/UTC";
    ctx->airportZoneIdMap["KUL"] = "Etc/UTC";

    return ctx;
}


class SIA_6_1_MaxDeadheadSectorsTest : public ::testing::Test {
protected:
    SIA_6_1_MaxDeadheadSectorsTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext()) 
    {
        _checker.setDataContext(_dataContext, -1, false);
    }

    std::unique_ptr<Duty> buildDutyWithTrailingDeadheads() {
        _segStore.clear();
        std::vector<Segment*> segs;
        _segStore.push_back(makeSegment("SQ134", "SIN", "PEN", "2025-12-04 01:45:00", "2025-12-04 03:10:00", false));
        segs.push_back(_segStore.back().get());
        _segStore.push_back(makeSegment("SQ133", "PEN", "SIN", "2025-12-04 04:00:00", "2025-12-04 05:40:00", false));
        segs.push_back(_segStore.back().get());
        _segStore.push_back(makeSegment("SQ116", "SIN", "KUL", "2025-12-04 06:55:00", "2025-12-04 08:10:00", true));
        segs.push_back(_segStore.back().get());
        _segStore.push_back(makeSegment("SQ115", "KUL", "SIN", "2025-12-04 08:55:00", "2025-12-04 10:10:00", true));
        segs.push_back(_segStore.back().get());
        return makeDuty(segs);
    }

    std::unique_ptr<Duty> buildDutyWithLeadingDeadheads() {
        _segStore.clear();
        std::vector<Segment*> segs;
        _segStore.push_back(makeSegment("SQ134", "SIN", "PEN", "2025-12-04 01:45:00", "2025-12-04 03:10:00", true));
        segs.push_back(_segStore.back().get());
        _segStore.push_back(makeSegment("SQ133", "PEN", "SIN", "2025-12-04 04:00:00", "2025-12-04 05:40:00", true));
        segs.push_back(_segStore.back().get());
        _segStore.push_back(makeSegment("SQ116", "SIN", "KUL", "2025-12-04 06:55:00", "2025-12-04 08:10:00", false));
        segs.push_back(_segStore.back().get());
        _segStore.push_back(makeSegment("SQ115", "KUL", "SIN", "2025-12-04 08:55:00", "2025-12-04 10:10:00", false));
        segs.push_back(_segStore.back().get());
        return makeDuty(segs);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
    std::vector<std::unique_ptr<Segment>> _segStore;
};


// Case #1 (Table): 2 trailing DHDs are illegal with a limit of 1
TEST_F(SIA_6_1_MaxDeadheadSectorsTest, TrailingDeadheadsExceedLimitOfOne) {
    Rule2004Config cfg;
    cfg.maxDhd = "1";
    auto rule = makeRule2004(cfg);

    auto duty = buildDutyWithTrailingDeadheads();
    std::vector<Duty*> duties{duty.get()};

    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #2 (Table): 2 leading DHDs are illegal with a limit of 1
TEST_F(SIA_6_1_MaxDeadheadSectorsTest, LeadingDeadheadsExceedLimitOfOne) {
    Rule2004Config cfg;
    cfg.maxDhd = "1";
    auto rule = makeRule2004(cfg);

    auto duty = buildDutyWithLeadingDeadheads();
    std::vector<Duty*> duties{duty.get()};

    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #3 (Table): 2 leading DHDs are legal with a limit of 2
TEST_F(SIA_6_1_MaxDeadheadSectorsTest, LeadingDeadheadsWithinLimitOfTwo) {
    Rule2004Config cfg;
    cfg.maxDhd = "2";
    auto rule = makeRule2004(cfg);

    auto duty = buildDutyWithLeadingDeadheads();
    std::vector<Duty*> duties{duty.get()};

    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

}  // namespace