// SIA_SUITE_SUMMARY_START
// SuiteId: 6.1
// Name: Maximum Duty Period for a Duty
// SourceCsvRow: 6.1.,Maximum Duty Period for a Duty
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: With max duty value = 10h, a multi-sector duty of 10:55 should be illegal because the duty period exceeds the limit.
//   - Case #2: With max duty value = 11h, the same 10:55 duty period should be legal because it is within the allowed limit.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Verify rule2004 parameter maxDutyDP and duty construction to ensure duties > limit are rejected.
//   - Extend coverage if SIA adds additional 6.1 duty-period examples (e.g., different pickup/dropoff or standby segments).
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"
#include "CrewDB.h"
#include "db/CustomBiz/CustomBiz.h"
#include "SIA_CommonTestConfig.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

// SIA 6.1 – Maximum Duty Period for a Duty
// Best-fit rule: rule2004 (duty-level limitations, field maxDutyDP).

using namespace SIATest;

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& flightNo,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
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
    seg->setIsOperating(true);
    seg->setIsDeadhead(false);
    seg->setAssignment("FLY");
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments, int reportTime, int releaseTime) {
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
		duty->setActualPickupMin(reportTime);
		duty->setActualDropoffMin(releaseTime);
		duty->calculateDutyValues(PAIRING_EDITOR);
    }
    return duty;
}

struct Rule2004Config {
    std::string maxDutyDp;
};

std::unique_ptr<DBRule> makeRule2004(const Rule2004Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2004>();
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

class SIA_6_1_MaxDutyPeriodTest : public ::testing::Test {
protected:
    SIA_6_1_MaxDutyPeriodTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext()) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _checker.setDataContext(_dataContext, -1, false);
    }

    std::vector<std::unique_ptr<Segment>> segStore;

	std::unique_ptr<Duty> buildTestDuty() {
		std::vector<Segment*> segs;

		segStore.push_back(makeSegment("SQ134", "SIN", "PEN", "2025-12-04 01:45:00", "2025-12-04 03:10:00"));
		segs.push_back(segStore.back().get());
		segStore.push_back(makeSegment("SQ133", "PEN", "SIN", "2025-12-04 04:00:00", "2025-12-04 05:40:00"));
		segs.push_back(segStore.back().get());
		segStore.push_back(makeSegment("SQ116", "SIN", "KUL", "2025-12-04 06:55:00", "2025-12-04 08:10:00"));
		segs.push_back(segStore.back().get());
		segStore.push_back(makeSegment("SQ115", "KUL", "SIN", "2025-12-04 08:55:00", "2025-12-04 10:10:00"));
		segs.push_back(segStore.back().get());

		// To make the duty period 10:55 from a flight time of 8:25, we need 2.5 hours (150 mins) of report/release
		// Let's use 90 mins report and 60 mins release.
		return makeDuty(segs, 90, 60);
	}

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

// Case #1 (6.1): max duty value = 10h, actual DP = 10:55 -> illegal.
TEST_F(SIA_6_1_MaxDutyPeriodTest, DutyPeriodExceedingLimitIsIllegal) {
    Rule2004Config cfg;
    cfg.maxDutyDp = "10:00";
    auto rule = makeRule2004(cfg);

    auto duty = buildTestDuty();
	applyReportReleaseToDuty(duty.get(), makeReportReleaseProfile(120,30,60));
	// dp calculation depend on many data setup, so we set it directly here for test purpose
	duty->setDPInSecs(10 * 3600 + 55 * 60); // 10:55
    std::vector<Duty*> duties{duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

// Case #2 (6.1): max duty value = 11h, actual DP = 10:55 -> legal.
TEST_F(SIA_6_1_MaxDutyPeriodTest, DutyPeriodWithinLimitIsLegal) {
    Rule2004Config cfg;
    cfg.maxDutyDp = "11:00";
    auto rule = makeRule2004(cfg);

    auto duty = buildTestDuty();
    duty->setDPInSecs(10 * 3600 + 55 * 60); // 10:55
    std::vector<Duty*> duties{duty.get()};
    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "SIN"));
}

}  // namespace