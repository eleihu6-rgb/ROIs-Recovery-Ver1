#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7420/AcopFdpPatternRule.h"
#include "RuleEngine/rule/rule7420/AcopFdpPatternRuleParam.h"

#include "SIA_CommonTestConfig.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

namespace {

// Helper to create a flight/ground segment.
std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     time_t startUtc,
                                     time_t endUtc,
                                     const std::string& assignment,
                                     bool isOperating,
                                     const std::shared_ptr<CrewDataContext>& ctx) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD("SQ");
    seg->setFlightNumber("SQTEST");
    seg->setAssignment(assignment);
    seg->setIsOperating(isOperating);

    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);

    const std::string depZoneId = ctx->getAirportZoneId(dep);
    const std::string arrZoneId = ctx->getAirportZoneId(arr);
    seg->setStartTimeLocAct(TimezoneUtils::GetLocalTime(startUtc, depZoneId));
    seg->setEndTimeLocAct(TimezoneUtils::GetLocalTime(endUtc, arrZoneId));
    seg->setStartTimeLocSch(seg->getStartTimeLocAct());
    seg->setEndTimeLocSch(seg->getEndTimeLocAct());

    return seg;
}

// Helper to create a duty from a vector of segments.
std::unique_ptr<Duty> makeDuty(const std::vector<std::unique_ptr<Segment>>& segments, time_t reportTime, time_t debriefTime) {
    if (segments.empty()) {
        return nullptr;
    }
    
    std::vector<Segment*> segPtrs;
    for (const auto& s : segments) {
        segPtrs.push_back(s.get());
    }

    auto duty = std::make_unique<Duty>(segPtrs);
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct() - reportTime);
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct() + debriefTime);
    duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct() - reportTime);
    duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct() + debriefTime);
	duty->setDepartureStation(segments.front()->getDepStation());
	duty->setArrivalStation(segments.back()->getArrStation());
	duty->setMinBrief(static_cast<long>(reportTime / 60));
	duty->setActualBriefMin(static_cast<long>(reportTime / 60));
	duty->setMinDebrief(static_cast<long>(debriefTime / 60));
	duty->setActualDebriefMin(static_cast<long>(debriefTime / 60));
	// In this test, transportation time is not relevant to the FDP rule logic.
	duty->setMinDropoff(0);
	duty->setActualDropoffMin(0);
    return duty;
}

DBRule makeAcopFdpPatternRule(long long ruleId,
                         int rowNum,
                         const std::string& clause,
                         const std::string& flightDep,
                         const std::string& flightArr,
                         const std::string& reportTimeWindow,
                         const std::string& maxOpSectors,
                         const std::string& deadheadAllowed,
                         const std::string& nextDutyDayOffset,
                         const std::string& forbiddenNextPattern,
                         const std::string& appliesAtSlipStation,
                         const std::string& group = "DEFAULT") {
    DBRule rule{};
    rule.idRule = ruleId;
    rule.function = 7420;
    rule.tableNum = 1; // Template A
    rule.rowNum = rowNum;
    rule.idRuleParam = 742000000 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SIA";
    rule.params["Clause"] = clause;
    rule.params["Flight Dep"] = flightDep;
    rule.params["Flight Arr"] = flightArr;
    rule.params["Reporting time (LT)"] = reportTimeWindow;
    rule.params["Limitation: max operating sectors in FDP"] = maxOpSectors;
    rule.params["Limitation: deadhead allowed"] = deadheadAllowed;
    rule.params["Next duty day offset"] = nextDutyDayOffset;
    rule.params["Forbidden next pattern"] = forbiddenNextPattern;
    rule.params["Applies at slip station"] = appliesAtSlipStation;
    rule.params["Group"] = group;
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

// Test fixture for SIA 5.8 (2) Orient rule tests.
class Sia582OrientTest : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
        if (_ctx) {
            for (auto& kv : _ctx->airportCodeMap) {
                delete kv.second;
            }
            _ctx->airportCodeMap.clear();
        }
    }

    void SetUp() override {
        _ctx = SIATest::buildCrewDataContext({});

        auto addAirport = [&](const char* code, int tzOffset, const char* tzId, const char* country, const char* category, const char* city) {
            auto* a = new DBAirport();
            std::strncpy(a->airport, code, 3);
            a->airport[3] = '\0';
            if (city != nullptr) {
                std::strncpy(a->city, city, 3);
                a->city[3] = '\0';
            }
            std::strncpy(a->country, country, 2);
            a->country[2] = '\0';
            a->category = category;
            _ctx->airportCodeMap[code] = a;

            _ctx->airportUtcOffsetMap[code] = tzOffset;
			_ctx->airportZoneIdMap[code] = tzId;
        };

        addAirport("SIN", 480, "Asia/Singapore", "SG", "SEA", "SIN");
        addAirport("HND", 540, "Asia/Tokyo", "JP", "ASIA", "TYO");
        addAirport("KIX", 540, "Asia/Tokyo", "JP", "ASIA", "OSA");
        addAirport("FUK", 540, "Asia/Tokyo", "JP", "ASIA", "FUK");
        addAirport("ICN", 540, "Asia/Seoul", "KR", "ASIA", "SEL");

        // Rule 5.8.(2) Orient
        // Use city tokens (CTYO/COSA) so HND (TYO) / KIX (OSA) match via DBAirport.city.
        _input.dbRules.push_back(makeAcopFdpPatternRule(7420001, 1, "(2) Orient", "SIN", "CTYO|COSA|CFUK|CNGO|CSDJ",
            "22:00-02:59", "1", "Yes", "0", "No", "*"));
    }

    void configureRule(AcopFdpPatternRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }
    
    RuleInput _input;
    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
    SIATest::SiaRuleParamGuard _paramGuard;
};

// Test Case 1: Violation. "SIN-HND-KIX, Reporting 2210LT". Cannot operate more than 1 sector within a trip.
TEST_F(Sia582OrientTest, Violation_TwoSectors_ReportInWindow) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;
    std::vector<Duty*> duties;

	time_t reportTime = 60 * 60;
	time_t debriefTime = 30 * 60;
    // Duty: SIN-HND-KIX. Report 22:10LT SIN.
    // Flight 1: SIN-HND 23:10 - 07:10+1 (local) -> HND is UTC+9, SIN is UTC+8.
    time_t sinHndDepUtc = SIATest::utcFromLocal("2025-12-01 23:10:00", "SIN", _ctx);
    time_t sinHndArrUtc = sinHndDepUtc + 7 * 3600;
    // Flight 2: HND-KIX 08:10 - 09:10 (local) -> 1h flight, same timezone.
    time_t hndKixDepUtc = SIATest::utcFromLocal("2025-12-02 08:10:00", "HND", _ctx);
    time_t hndKixArrUtc = hndKixDepUtc + 1 * 3600;

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "HND", sinHndDepUtc, sinHndArrUtc, "FLY", true, _ctx));
        dutySegs.push_back(makeSegment("HND", "KIX", hndKixDepUtc, hndKixArrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs, reportTime, debriefTime));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test Case 2: Violation. "SIN-FUK-ICN, Reporting 0230LT". Cannot operate more than 1 sector within a trip.
TEST_F(Sia582OrientTest, Violation_TwoSectors_ReportInWindow_Fuk) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;
    std::vector<Duty*> duties;

	time_t reportTime = 60 * 60;
	time_t debriefTime = 30 * 60;
    // Duty: SIN-FUK-ICN. Report 02:30LT SIN.
    // Flight 1: SIN-FUK 03:30 - 10:30 (local) -> 6h flight, FUK is UTC+9, SIN is UTC+8
    time_t sinFukDepUtc = SIATest::utcFromLocal("2025-12-01 03:30:00", "SIN", _ctx);
    time_t sinFukArrUtc = sinFukDepUtc + 6 * 3600;
    // Flight 2: FUK-ICN 11:30 - 12:50 (local) -> 1h 20m flight, ICN is UTC+9
    time_t fukIcnDepUtc = SIATest::utcFromLocal("2025-12-01 11:30:00", "FUK", _ctx);
    time_t fukIcnArrUtc = fukIcnDepUtc + 1 * 3600 + 20 * 60;

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "FUK", sinFukDepUtc, sinFukArrUtc, "FLY", true, _ctx));
        dutySegs.push_back(makeSegment("FUK", "ICN", fukIcnDepUtc, fukIcnArrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs, reportTime, debriefTime));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test Case 3: Legal. "SIN-HND-KIX, Reporting 2110LT". Reporting time is not in the window.
TEST_F(Sia582OrientTest, Legal_TwoSectors_ReportOutsideWindow) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;
    std::vector<Duty*> duties;

	time_t reportTime = 60 * 60;
	time_t debriefTime = 30 * 60;
    // Duty: SIN-HND-KIX. Report 21:10LT SIN.
    // Flight 1: SIN-HND 22:10 - 06:10+1 (local) -> HND is UTC+9, SIN is UTC+8.
    time_t sinHndDepUtc = SIATest::utcFromLocal("2025-12-01 22:10:00", "SIN", _ctx);
    time_t sinHndArrUtc = sinHndDepUtc + 7 * 3600;
    // Flight 2: HND-KIX 07:10 - 08:10 (local) -> 1h flight, same timezone.
    time_t hndKixDepUtc = SIATest::utcFromLocal("2025-12-02 07:10:00", "HND", _ctx);
    time_t hndKixArrUtc = hndKixDepUtc + 1 * 3600;

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "HND", sinHndDepUtc, sinHndArrUtc, "FLY", true, _ctx));
        dutySegs.push_back(makeSegment("HND", "KIX", hndKixDepUtc, hndKixArrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs, reportTime, debriefTime));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}
