// SIA_SUITE_SUMMARY_START
// SuiteId: 6.2
// Name: Pure deadhead Duty Allowed
// SourceCsvRow: 6.2.,Pure deadhead Duty Allowed
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Condition = No -> pure [DU] SIN-PEN, [DU] PEN-SIN duty is illegal.
//   - Case #2: Condition = Yes -> the same pure DHD duty is legal.
// Results:
//   - TODO
// RemainingWork:
//   - None.
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

// SIA 6.2 – Pure deadhead Duty Allowed
// Rule: rule2004, parameter "Pure Deadhead Duty Allowed".

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
    
    if (isDeadhead) {
        seg->setIsOperating(false);
        seg->setIsDeadhead(true);
        seg->setAssignment("DHD");
    } else {
        seg->setIsOperating(true);
        seg->setIsDeadhead(false);
        seg->setAssignment("FLY");
    }
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
    std::string pureDeadheadDutyAllowed = "Y";
};

std::unique_ptr<DBRule> makeRule2004(const Rule2004Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2004>();
    parsed->pureDeadheadDutyAllowed = cfg.pureDeadheadDutyAllowed;

    // Set other rule2004 params to permissive values to isolate the test
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
	parsed->maxFdpWithAircraftChange = "99:00";

    rule->parsedParam = parsed;
    rule->idRule = 2004;
    rule->idRuleParam = 2004;
    return rule;
}

SharedPtr<CrewDataContext> buildCrewDataContext() {
    auto ctx = std::make_shared<CrewDataContext>();
    std::vector<std::string> airports = {"SIN", "PEN"};
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

class SIA_6_2_PureDeadheadDutyAllowedTest : public ::testing::Test {
protected:
    SIA_6_2_PureDeadheadDutyAllowedTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext()) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _checker.setDataContext(_dataContext, -1, false);
    }

    std::unique_ptr<Duty> buildPureDeadheadDuty() {
        std::vector<Segment*> segs;

        segStore.push_back(makeSegment("SQ8001", "SIN", "PEN", "2025-12-05 08:00:00", "2025-12-05 09:30:00", true));
        segs.push_back(segStore.back().get());
        segStore.push_back(makeSegment("SQ8002", "PEN", "SIN", "2025-12-05 11:00:00", "2025-12-05 12:30:00", true));
        segs.push_back(segStore.back().get());

        return makeDuty(segs);
    }

    std::vector<std::unique_ptr<Segment>> segStore;
    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

// Case #1 (6.2): Condition = No -> pure deadhead duty is illegal.
TEST_F(SIA_6_2_PureDeadheadDutyAllowedTest, Case1_PureDeadheadIsIllegal) {
    Rule2004Config cfg;
    cfg.pureDeadheadDutyAllowed = "N";
    auto rule = makeRule2004(cfg);

    auto duty = buildPureDeadheadDuty();
    std::vector<Duty*> duties{duty.get()};

    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #2 (6.2): Condition = Yes -> pure deadhead duty is legal.
TEST_F(SIA_6_2_PureDeadheadDutyAllowedTest, Case2_PureDeadheadIsLegal) {
    Rule2004Config cfg;
    cfg.pureDeadheadDutyAllowed = "Y";
    auto rule = makeRule2004(cfg);

    auto duty = buildPureDeadheadDuty();
    std::vector<Duty*> duties{duty.get()};

    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

}  // namespace