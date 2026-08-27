// SIA_SUITE_SUMMARY_START
// SuiteId: 6.2
// Name: Maximum FDP for aircraft change (Added by SIA)
// SourceCsvRow: 6.2.,Maximum FDP for aircraft change (Added by SIA)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: value = 14h -> multi-sector duty with FDP 15:15 is illegal.
//   - Case #2: value = 16h -> same duty is legal.
// Results:
//   - TODO
// RemainingWork:
//   - None
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

// SIA 6.2 – Maximum FDP for aircraft change (Added by SIA)
// Rule: rule2004, parameter "Max FDP With Aircraft Change".

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& flightNo,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& tailNum) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setFlightNumber(flightNo);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setTailNum(tailNum);
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
    std::string maxFdpWithAircraftChange = "99:00";
};

std::unique_ptr<DBRule> makeRule2004(const Rule2004Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2004>();
    parsed->maxFdpWithAircraftChange = cfg.maxFdpWithAircraftChange;

    // Set other rule2004 params to permissive values
    parsed->maxFlyTimeInDuty = "999:00";
    parsed->maxNrFlySegsInDuty = "99";
    parsed->maxDutyDP = "99:00";
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
    parsed->isInternationalDHDallowed = "Y";
    parsed->pureDeadheadDutyAllowed = "Y";

    rule->parsedParam = parsed;
    rule->idRule = 2004;
    rule->idRuleParam = 2004;
    return rule;
}

SharedPtr<CrewDataContext> buildCrewDataContext() {
    auto ctx = std::make_shared<CrewDataContext>();
    std::vector<std::string> airports = {"SIN", "CGK", "SGN"};
    for (const auto& code : airports) {
        DBAirport rec{};
        std::strncpy(rec.airport, code.c_str(), sizeof(rec.airport) - 1);
        std::strncpy(rec.zoneId, "Etc/UTC", sizeof(rec.zoneId) - 1);
        ctx->airportList.push_back(rec);
        ctx->airportZoneIdMap[code] = "Etc/UTC";
        ctx->airportUtcOffsetMap[code] = 0;
    }
    return ctx;
}

class SIA_6_2_MaxFdpWithAircraftChangeTest : public ::testing::Test {
protected:
    SIA_6_2_MaxFdpWithAircraftChangeTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext()) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        // FDP calculation depends on these params.
        RuleParams::GetInstancePtr()->bIncludeCI = true;
        RuleParams::GetInstancePtr()->bIncludeCO = false;
        _checker.setDataContext(_dataContext, -1, false);
    }

    std::unique_ptr<Duty> buildDutyWithAircraftChange() {
        std::vector<Segment*> segs;

        // Two segments with tail "9V-AAA"
        segStore.push_back(makeSegment("SQ956", "SIN", "CGK", "2025-12-05 01:25:00", "2025-12-05 03:10:00", "9V-AAA"));
        segs.push_back(segStore.back().get());
        segStore.push_back(makeSegment("SQ957", "CGK", "SIN", "2025-12-05 04:15:00", "2025-12-05 06:05:00", "9V-AAA"));
        segs.push_back(segStore.back().get());
        
        // Two segments with tail "9V-BBB" (simulating aircraft change)
        segStore.push_back(makeSegment("SQ186", "SIN", "SGN", "2025-12-05 09:15:00", "2025-12-05 11:25:00", "9V-BBB"));
        segs.push_back(segStore.back().get());
        segStore.push_back(makeSegment("SQ185", "SGN", "SIN", "2025-12-05 12:40:00", "2025-12-05 14:40:00", "9V-BBB"));
        segs.push_back(segStore.back().get());

        auto duty = makeDuty(segs);
        
        // Per user comments, FDP is 15:15. This implies a 2-hour report time
        // (FDP ends at 14:40, so starts at 14:40 - 15:15 = previous day 23:25.
        // First departure is 01:25, so report time is 2 hours).
        duty->setMinBrief(120); // 120 minutes report time
        
        // Manually calculate and set the FDP for the checker.
        int reportingMinutes = 120; // CC
        time_t fdpStart = duty->getFirstSegment()->getStartTimeUtcAct() - reportingMinutes * 60;
        time_t fdpEnd = duty->getLastFlySegment()->getEndTimeUtcAct();
        duty->setFDPInSecs(fdpEnd - fdpStart);

        return duty;
    }

    std::vector<std::unique_ptr<Segment>> segStore;
    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

// Case #1 (6.2): value = 14h, actual FDP = 15:15 -> illegal.
TEST_F(SIA_6_2_MaxFdpWithAircraftChangeTest, Case1_FdpExceedsLimitIsIllegal) {
    Rule2004Config cfg;
    cfg.maxFdpWithAircraftChange = "14:00";
    auto rule = makeRule2004(cfg);

    auto duty = buildDutyWithAircraftChange();
    std::vector<Duty*> duties{duty.get()};
    
    // Duty FDP is 15h 15m with an aircraft change. Limit is 14h.
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #2 (6.2): value = 16h, actual FDP = 15:15 -> legal.
TEST_F(SIA_6_2_MaxFdpWithAircraftChangeTest, Case2_FdpWithinLimitIsLegal) {
    Rule2004Config cfg;
    cfg.maxFdpWithAircraftChange = "16:00";
    auto rule = makeRule2004(cfg);

    auto duty = buildDutyWithAircraftChange();
    std::vector<Duty*> duties{duty.get()};

    // Duty FDP is 15h 15m with an aircraft change. Limit is 16h.
    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

}  // namespace