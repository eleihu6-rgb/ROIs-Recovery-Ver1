// SIA_SUITE_SUMMARY_START
// SuiteId: 6.1
// Name: Allow deadhead in the middle of duty
// SourceCsvRow: 6.1.,Allow deadhead in the middle of duty
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: When Condition = No, a DHD leg surrounded by FLY legs makes the duty illegal.
//   - Case #2: When Condition = Yes, the same pattern with a middle DHD leg is legal.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Extend coverage for duties containing multiple DHD segments interspersed with FLY once additional SIA examples are available.
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

// SIA 6.1 – Allow deadhead in the middle of duty
// Best-fit rule: rule2004 (field isDhdAllowedInMiddleDuty).

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
    std::string maxDutyDp;
    std::string isDhdAllowedMiddle;
};

std::unique_ptr<DBRule> makeRule2004(const Rule2004Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2004>();
    parsed->isDhdAllowedInMiddleDuty = cfg.isDhdAllowedMiddle;
    parsed->maxDutyDP = cfg.maxDutyDp;
    // Set other rule2004 params to permissive values to isolate the test
    parsed->maxNrFlySegsInDuty = "99";
    parsed->maxNrNonoperateLegsInDuty = "99";
    parsed->maxNrAircraftChangeInDuty = "99";
    parsed->maxNrConsecutiveDhd = "99";
    parsed->maxNrDHDInDuty = "99";
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

SharedPtr<CrewDataContext> buildCrewDataContext() {
    auto ctx = std::make_shared<CrewDataContext>();
    std::vector<std::string> airports = {"SIN", "PEN", "KUL"};
    for (const auto& code : airports) {
        DBAirport rec{};
        std::strncpy(rec.airport, code.c_str(), sizeof(rec.airport) - 1);
        std::strncpy(rec.zoneId, "Etc/UTC", sizeof(rec.zoneId) - 1);
        ctx->airportList.push_back(rec);
        ctx->airportZoneIdMap[code] = "Etc/UTC";
    }
    return ctx;
}


class SIA_6_1_AllowDeadheadMiddleTest : public ::testing::Test {
protected:
    SIA_6_1_AllowDeadheadMiddleTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext()) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

// Case #1 (6.1): Condition = No (isDhdAllowedInMiddleDuty = "N") -> illegal.
TEST_F(SIA_6_1_AllowDeadheadMiddleTest, MiddleDeadheadIllegalWhenNotAllowed) {
    Rule2004Config cfg;
    cfg.isDhdAllowedMiddle = "N";
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<Segment*> segs;

    segStore.push_back(makeSegment("SQ134", "SIN", "PEN", "2025-12-04 01:45:00", "2025-12-04 03:10:00", false));
    segs.push_back(segStore.back().get());
    segStore.push_back(makeSegment("SQ133", "PEN", "SIN", "2025-12-04 04:00:00", "2025-12-04 05:40:00", true)); // middle DHD
    segs.push_back(segStore.back().get());
    segStore.push_back(makeSegment("SQ116", "SIN", "KUL", "2025-12-04 06:55:00", "2025-12-04 08:10:00", false));
    segs.push_back(segStore.back().get());
    segStore.push_back(makeSegment("SQ115", "KUL", "SIN", "2025-12-04 08:55:00", "2025-12-04 10:10:00", false));
    segs.push_back(segStore.back().get());

    auto duty = makeDuty(segs);
    
    std::vector<Duty*> duties{duty.get()};

    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #2 (6.1): Condition = Yes (isDhdAllowedInMiddleDuty = "Y") -> legal.
TEST_F(SIA_6_1_AllowDeadheadMiddleTest, MiddleDeadheadLegalWhenAllowed) {
    Rule2004Config cfg;
    cfg.isDhdAllowedMiddle = "Y";
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<Segment*> segs;

    segStore.push_back(makeSegment("SQ134", "SIN", "PEN", "2025-12-04 01:45:00", "2025-12-04 03:10:00", false));
    segs.push_back(segStore.back().get());
    segStore.push_back(makeSegment("SQ133", "PEN", "SIN", "2025-12-04 04:00:00", "2025-12-04 05:40:00", true)); // middle DHD
    segs.push_back(segStore.back().get());
    segStore.push_back(makeSegment("SQ116", "SIN", "KUL", "2025-12-04 06:55:00", "2025-12-04 08:10:00", false));
    segs.push_back(segStore.back().get());
    segStore.push_back(makeSegment("SQ115", "KUL", "SIN", "2025-12-04 08:55:00", "2025-12-04 10:10:00", false));
    segs.push_back(segStore.back().get());

    auto duty = makeDuty(segs);
    std::vector<Duty*> duties{duty.get()};

    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

}  // namespace