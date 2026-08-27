#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7422/CalculateAtdoAfterSlipForSQRule.h"
#include "RuleEngine/rule/rule7422/AtdoAfterSlipForSQRuleParam.h"

#include "SIA_CommonTestConfig.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"
#include "RuleEngine/rule/framework/utils/TimeUtils.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

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
std::unique_ptr<Duty> makeDuty(const std::vector<std::unique_ptr<Segment>>& segments, bool isSby = false) {
    if (segments.empty()) {
        return nullptr;
    }
    
    std::vector<Segment*> segPtrs;
    for (const auto& s : segments) {
        segPtrs.push_back(s.get());
    }

    auto reportTime = isSby ? 0 : 60 * 60;  // 1 hour report time
	auto debriefTime = isSby ? 0 : 30 * 60; // 30 minutes debrief
	auto transportTime = isSby ? 0 : 60 * 60; // 1 hour transportation

    auto duty = std::make_unique<Duty>(segPtrs);
    if (!segments.empty()) {
        duty->setAssignment(segments.front()->getAssignment());
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct() - reportTime);
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct() + debriefTime);
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct() - reportTime);
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct() + debriefTime);
        duty->setDepartureStation(segments.front()->getDepStation());
        duty->setArrivalStation(segments.back()->getArrStation());
    }
    duty->setMinBrief(reportTime / 60);
	duty->setActualBriefMin(reportTime / 60);
	duty->setMinDebrief(debriefTime / 60);
	duty->setActualDebriefMin(debriefTime / 60);
	duty->setMinDropoff(transportTime / 60);
	duty->setActualDropoffMin(transportTime / 60);
    return duty;
}

DBRule makeRule7422Row(long long ruleId,
                       int rowNum,
                       const std::string& clause,
                       const std::string& pattern,
                       const std::string& slipStation,
                       int slipLtHours,
                       const std::string& slipArrIsOperating,
                       const std::string& slipDepIsOperating,
                       int atdoDays,
                       const std::string& followingDoAllowAfter,
                       int maxPairingDays) {
    DBRule rule{};
    rule.idRule = ruleId;
    rule.function = 7422;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 742200000 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SIA";
    rule.params["Clause"] = clause;
    rule.params["Pattern"] = pattern;
    rule.params["Slip station"] = slipStation;
    rule.params["Slip < hours"] = std::to_string(slipLtHours);
    rule.params["Slip arr is operating"] = slipArrIsOperating;
    rule.params["Slip dep is operating"] = slipDepIsOperating;
    rule.params["ATDO days"] = std::to_string(atdoDays);
    rule.params["Following DO allow after"] = followingDoAllowAfter;
    rule.params["Max pairing days"] = std::to_string(maxPairingDays);
    return rule;
}

}  // namespace

// Test fixture for SIA 5.8 General rule tests.
class Sia5_8_10_GeneralTest : public ::testing::Test {
protected:
    void SetUp() override {
        _ctx = SIATest::buildCrewDataContext({
            {"SIN", 480, "Asia/Singapore"},
            {"AMS", 60, "Europe/Amsterdam"},
            {"SFO", -480, "America/Los_Angeles"}
        });

        auto addAirport = [&](const char* code, const char* country, const char* category, const char* city) {
            auto* a = new DBAirport();
            std::strncpy(a->airport, code, 3);
            a->airport[3] = '\0';
            std::strncpy(a->city, city, 3);
            a->city[3] = '\0';
            std::strncpy(a->country, country, 2);
            a->country[2] = '\0';
            a->category = category;
            _ctx->airportCodeMap[code] = a;
        };
        addAirport("SIN", "SG", "SEA", "SIN");
        addAirport("AMS", "NL", "EUR", "AMS"); // AMS is in region EUR
        // LocationMatchUtils city tokens use 3-letter IATA city code (e.g. CSFO => "SFO").
        addAirport("SFO", "US", "USA", "SFO");

        // Rule 11(b) Europe
        _input.dbRules.push_back(makeRule7422Row(7422003, 1, "11(b)", "SIN-REUR-SIN", "REUR", 9999, "Y", "Y", 2, "00:00", 6));
        // Rule 11(b) West Coast USA
        _input.dbRules.push_back(makeRule7422Row(7422004, 2, "11(b)", "SIN-CSFO-SIN", "CSFO", 9999, "Y", "Y", 2, "00:00", 6));

        // Control Parameters
        DBRule controlRule{};
        controlRule.idRule = 7422003;
        controlRule.function = 7422;
        controlRule.tableNum = 2;
        controlRule.rowNum = 1;
        controlRule.params["Rest starts after"] = "TRANSPORT";
        controlRule.params["Operating definition"] = "SEGMENT_IS_OPERATING";
        _input.dbRules.push_back(controlRule);
        DBRule controlRule2 = controlRule;
        controlRule2.idRule = 7422004;
        _input.dbRules.push_back(controlRule2);
    }
    
    void configureRule(CalculateAtdoAfterSlipForSQRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
    }
    
    RuleInput _input;
    std::shared_ptr<CrewDataContext> _ctx;
    SIATest::SiaRuleParamGuard _paramGuard;
};

// Test Case 1: SIN-AMS with Standby, < 6 days, should get 2 ATDOs
TEST_F(Sia5_8_10_GeneralTest, SinAmsWithStandby_ShouldHave2ATDOs) {
    CalculateAtdoAfterSlipForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-AMS (operating)
    time_t sinAmsDep = SIATest::utcFromLocal("2025-12-01 12:00:00", "SIN", _ctx);
    time_t sinAmsArr = sinAmsDep + 13 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "AMS", sinAmsDep, sinAmsArr, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Standby duties
    time_t sby1_start = sinAmsArr + 10 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("AMS", "AMS", sby1_start, sby1_start + 3*3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    time_t sby2_start = sby1_start + 4 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("AMS", "AMS", sby2_start, sby2_start + 3*3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 3: AMS-SIN (operating)
    time_t amsSinDep = sby2_start + 10 * 3600;
    time_t amsSinArr = amsSinDep + 13 * 3600;
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("AMS", "SIN", amsSinDep, amsSinArr, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    
    SIATest::ReportReleaseProfile operatingProfile = SIATest::makeReportReleaseProfile(60, 30, 60);
    SIATest::ReportReleaseProfile standbyProfile = SIATest::makeReportReleaseProfile(0, 0, 0);
    for (auto* duty : duties) {
        if (duty->getAssignment() == "SBY") {
            SIATest::applyReportReleaseToDuty(duty, standbyProfile);
        } else {
            SIATest::applyReportReleaseToDuty(duty, operatingProfile);
        }
    }

    rule.CalculateDuty(&pairing);

    Duty* lastDuty = duties.back();
    time_t restStartLoc = lastDuty->getEndTimeLocAct() + lastDuty->getActualDropoffMin() * 60;
    time_t endOfRestStartDay = TimeUtils::Truncate(restStartLoc, ChronoUnit::DAYS) + 24 * 3600;
    int minutesToMidnight = static_cast<int>((endOfRestStartDay - restStartLoc) / 60);

    int expectedMinRestMinutes = minutesToMidnight + (2 * 24 * 60);
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
}

// Test Case 2: SIN-SFO, < 6 days, should get 2 ATDOs
TEST_F(Sia5_8_10_GeneralTest, SinSfoLongLayover_ShouldHave2ATDOs) {
    CalculateAtdoAfterSlipForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-SFO (operating)
    time_t sinSfoDep = SIATest::utcFromLocal("2025-12-01 12:00:00", "SIN", _ctx);
    time_t sinSfoArr = sinSfoDep + 15 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "SFO", sinSfoDep, sinSfoArr, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 4: SFO-SIN (operating)
    time_t sfoSinDep = sinSfoArr + (3 * 24 - 10) * 3600; // ~3 days rest
    time_t sfoSinArr = sfoSinDep + 15 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SFO", "SIN", sfoSinDep, sfoSinArr, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    rule.CalculateDuty(&pairing);

    Duty* lastDuty = duties.back();
    time_t restStartLoc = lastDuty->getEndTimeLocAct() + lastDuty->getActualDropoffMin() * 60;
    time_t endOfRestStartDay = TimeUtils::Truncate(restStartLoc, ChronoUnit::DAYS) + 24 * 3600;
    int minutesToMidnight = static_cast<int>((endOfRestStartDay - restStartLoc) / 60);

    int expectedMinRestMinutes = minutesToMidnight + (2 * 24 * 60);
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
}

// Test Case 3: SIN-AMS with positioning, no ATDO required
TEST_F(Sia5_8_10_GeneralTest, SinAmsWithPositioning_ShouldHave0ATDOs) {
    CalculateAtdoAfterSlipForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-AMS (positioning)
    time_t sinAmsDep = SIATest::utcFromLocal("2025-12-01 12:00:00", "SIN", _ctx);
    time_t sinAmsArr = sinAmsDep + 13 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "AMS", sinAmsDep, sinAmsArr, "PU", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Standby duties
    time_t sby1_start = sinAmsArr + 10 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("AMS", "AMS", sby1_start, sby1_start + 3*3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 3: AMS-SIN (operating)
    time_t amsSinDep = sby1_start + 10 * 3600;
    time_t amsSinArr = amsSinDep + 13 * 3600;
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("AMS", "SIN", amsSinDep, amsSinArr, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    
    SIATest::ReportReleaseProfile operatingProfile = SIATest::makeReportReleaseProfile(60, 30, 60);
    SIATest::ReportReleaseProfile standbyProfile = SIATest::makeReportReleaseProfile(0, 0, 0);
    for (auto* duty : duties) {
        if (duty->getAssignment() == "SBY") {
            SIATest::applyReportReleaseToDuty(duty, standbyProfile);
        } else {
            SIATest::applyReportReleaseToDuty(duty, operatingProfile);
        }
    }

    rule.CalculateDuty(&pairing);

    Duty* lastDuty = duties.back();
    EXPECT_EQ(0, lastDuty->getMinRestAtBase());
}
