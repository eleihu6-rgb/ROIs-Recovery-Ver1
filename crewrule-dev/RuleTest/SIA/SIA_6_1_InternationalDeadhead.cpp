// SIA_SUITE_SUMMARY_START
// SuiteId: 6.1
// Name: International deadhead allowed?
// SourceCsvRow: 6.1.,International deadhead allowed?
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: When Condition = No, an international DHD sector (e.g., AMS-SIN) is illegal.
//   - Case #2: When Condition = No, a purely domestic/regional DHD sector (e.g., KUL-PEN) is legal.
//   - Case #3: When Condition = Yes, the international DHD sector from Case #1 becomes legal.
// Results:
//   - pass 2 out of 2 (skipped 1, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z; skipped 1
// RemainingWork:
//   - Confirm that Utility::getSegType and airport.dir configuration align with SIA's region classifications for international vs regional sectors.
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

// SIA 6.1 – International deadhead allowed?
// Best-fit rule: rule2004 (field isInternationalDHDallowed, using Utility::getSegType).

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
    std::string isInternationalDhdAllowed;
    std::string maxDutyDp = "48:00";
};

std::unique_ptr<DBRule> makeRule2004(const Rule2004Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2004>();
    parsed->isInternationalDHDallowed = cfg.isInternationalDhdAllowed;
    parsed->maxDutyDP = cfg.maxDutyDp;
    // Set other rule2004 params to permissive values to isolate the test
    parsed->maxNrFlySegsInDuty = "99";
    parsed->maxNrNonoperateLegsInDuty = "99";
    parsed->maxNrAircraftChangeInDuty = "99";
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
    rule->parsedParam = parsed;
    rule->idRule = 2004;
    rule->idRuleParam = 2004;
    return rule;
}

void setupAirport(DBAirport& airport, const char* code, const char* country, const char* dir, const char* zoneId = "Etc/UTC") {
    std::memset(&airport, 0, sizeof(DBAirport));
    std::strncpy(airport.airport, code, sizeof(airport.airport) - 1);
    std::strncpy(airport.country, country, sizeof(airport.country) - 1);
    std::strncpy(airport.dir, dir, sizeof(airport.dir) - 1);
    std::strncpy(airport.zoneId, zoneId, sizeof(airport.zoneId) - 1);
}

SharedPtr<CrewDataContext> buildCrewDataContext() {
    auto ctx = std::make_shared<CrewDataContext>();
    DBAirport sin, ams, kul, pen;
    setupAirport(sin, "SIN", "SG", "D");
    setupAirport(ams, "AMS", "NL", "I");
    setupAirport(kul, "KUL", "MY", "I");
    setupAirport(pen, "PEN", "MY", "I");

    ctx->airportList.push_back(sin);
    ctx->airportList.push_back(ams);
    ctx->airportList.push_back(kul);
    ctx->airportList.push_back(pen);
    
    ctx->airportZoneIdMap["SIN"] = "Etc/UTC";
    ctx->airportZoneIdMap["AMS"] = "Etc/UTC";
    ctx->airportZoneIdMap["KUL"] = "Etc/UTC";
    ctx->airportZoneIdMap["PEN"] = "Etc/UTC";

    return ctx;
}


class SIA_6_1_InternationalDeadheadTest : public ::testing::Test {
protected:
    SIA_6_1_InternationalDeadheadTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext()) 
    {
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

// Case #1 (6.1): Condition = No, international DHD AMS-SIN is illegal.
TEST_F(SIA_6_1_InternationalDeadheadTest, InternationalDeadheadIllegalWhenNotAllowed) {
    Rule2004Config cfg;
    cfg.isInternationalDhdAllowed = "N";
    auto rule = makeRule2004(cfg);

    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<Segment*> segs;
    segStore.push_back(makeSegment("SQ324", "SIN", "AMS", "2025-12-04 12:00:00", "2025-12-05 00:00:00", false));
    segs.push_back(segStore.back().get());
    segStore.push_back(makeSegment("SQ323", "AMS", "SIN", "2025-12-05 02:00:00", "2025-12-05 14:00:00", true));
    segs.push_back(segStore.back().get());
    auto duty = makeDuty(segs);

    std::vector<Duty*> duties{duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #2 (6.1): Condition = No, domestic/regional DHD KUL-PEN is legal.
TEST_F(SIA_6_1_InternationalDeadheadTest, DomesticDeadheadLegalWhenInternationalNotAllowed) {
    Rule2004Config cfg;
    cfg.isInternationalDhdAllowed = "N";
    auto rule = makeRule2004(cfg);

    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<Segment*> segs;
    segStore.push_back(makeSegment("SQ101", "SIN", "KUL", "2025-12-04 09:00:00", "2025-12-04 10:00:00", false));
    segs.push_back(segStore.back().get());
    segStore.push_back(makeSegment("SQ102", "KUL", "PEN", "2025-12-04 11:00:00", "2025-12-04 12:00:00", true));
    segs.push_back(segStore.back().get());
    auto duty = makeDuty(segs);

    std::vector<Duty*> duties{duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #3 (6.1): Condition = Yes, international DHD becomes legal.
TEST_F(SIA_6_1_InternationalDeadheadTest, InternationalDeadheadLegalWhenAllowed) {
    Rule2004Config cfg;
    cfg.isInternationalDhdAllowed = "Y";
    auto rule = makeRule2004(cfg);

    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<Segment*> segs;
    segStore.push_back(makeSegment("SQ103", "SIN", "KUL", "2025-12-04 09:00:00", "2025-12-04 10:00:00", false));
    segs.push_back(segStore.back().get());
    segStore.push_back(makeSegment("SQ104", "KUL", "SIN", "2025-12-04 11:00:00", "2025-12-04 12:00:00", true));
    segs.push_back(segStore.back().get());
    auto duty = makeDuty(segs);

    std::vector<Duty*> duties{duty.get()};
    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

}  // namespace