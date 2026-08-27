#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7420/AcopFdpPatternRule.h"
#include "SIA_CommonTestConfig.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"

#include <memory>
#include <vector>

namespace {

// Using helpers from the common test config where possible.
// Note: These helpers are simplified versions from other test files.
// They are sufficient for AcopFdpPatternRule which mainly cares about segments and duty properties.

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     time_t startUtc,
                                     time_t endUtc,
                                     bool isOperating,
                                     const std::shared_ptr<CrewDataContext>& ctx,
                                     const std::string& flightNum = "SQTEST",
                                     const std::string& assignment = "FLY") {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD("SQ");
    seg->setFlightNumber(flightNum);
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

std::unique_ptr<Duty> makeDuty(const std::vector<std::unique_ptr<Segment>>& segments, time_t reportTime, time_t debriefTime) {
    if (segments.empty()) return nullptr;
    std::vector<Segment*> segPtrs;
    for (const auto& s : segments) segPtrs.push_back(s.get());

    auto duty = std::make_unique<Duty>(segPtrs);
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct() - reportTime);
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct() + debriefTime);
    duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct() - reportTime);
    duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct() + debriefTime);
    duty->setDepartureStation(segments.front()->getDepStation());
    duty->setArrivalStation(segments.back()->getArrStation());
    duty->setActualBriefMin(static_cast<long>(reportTime / 60));
    duty->setActualDebriefMin(static_cast<long>(debriefTime / 60));
    return duty;
}

DBRule makeAcopFdpPatternRule(long long ruleId, int rowNum, const std::string& clause, const std::string& flightDep, const std::string& flightArr, const std::string& reportTimeWindow, const std::string& maxOpSectors, const std::string& deadheadAllowed, const std::string& nextDutyDayOffset, const std::string& forbiddenNextPattern, const std::string& appliesAtSlipStation) {
    DBRule rule{};
    rule.idRule = ruleId;
    rule.function = 7420;
    rule.tableNum = 1; // Template A
    rule.rowNum = rowNum;
    rule.idRuleParam = 742000000 + rowNum;
    rule.params["Clause"] = clause;
    rule.params["Flight Dep"] = flightDep;
    rule.params["Flight Arr"] = flightArr;
    rule.params["Reporting time (LT)"] = reportTimeWindow;
    rule.params["Limitation: max operating sectors in FDP"] = maxOpSectors;
    rule.params["Limitation: deadhead allowed"] = deadheadAllowed;
    rule.params["Next duty day offset"] = nextDutyDayOffset;
    rule.params["Forbidden next pattern"] = forbiddenNextPattern;
    rule.params["Applies at slip station"] = appliesAtSlipStation;
    return rule;
}

} // namespace

class Sia583aAnzTest : public ::testing::Test {
protected:
    void TearDown() override {
        for (auto* rv : _violationStorage) {
            delete rv;
        }
        _violationStorage.clear();

        if (_ctx) {
            for (auto& kv : _ctx->airportCodeMap) {
                delete kv.second;
            }
            _ctx->airportCodeMap.clear();
        }
    }

    void SetUp() override {
        _ctx = SIATest::buildCrewDataContext({});
        auto addAirport = [&](const char* code,
                              int tzOffsetMinutes,
                              const char* tzId,
                              const char* country,
                              const char* city = nullptr) {
            auto* a = new DBAirport();
            std::strncpy(a->airport, code, 3); a->airport[3] = '\0';
            if (city) { std::strncpy(a->city, city, 3); a->city[3] = '\0'; }
            std::strncpy(a->country, country, 2); a->country[2] = '\0';
            _ctx->airportCodeMap[code] = a;
            _ctx->airportUtcOffsetMap[code] = tzOffsetMinutes;
            _ctx->airportZoneIdMap[code] = tzId;
        };

        // Note: `SIATest::utcFromLocal` uses `airportUtcOffsetMap` (fixed offsets), so populate it.
        addAirport("SIN", 480, "Asia/Singapore", "SG");
        // Use Dec offsets (DST in SYD/MEL/ADL; no DST in BNE).
        addAirport("SYD", 660, "Australia/Sydney", "AU");
        addAirport("MEL", 660, "Australia/Melbourne", "AU");
        addAirport("ADL", 630, "Australia/Adelaide", "AU");
        addAirport("BNE", 600, "Australia/Brisbane", "AU");

        _input.dbRules.push_back(makeAcopFdpPatternRule(7420002, 2, "(3) ANZ (a)", "SIN", "SYD|MEL|ADL|BNE",
            "18:00-00:00", "1", "Yes", "1", "OPERATING_LEGS_TO_SIN >= 2", "SYD|MEL|ADL|BNE"));
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

// Test Cases for "max operating sectors"
TEST_F(Sia583aAnzTest, Legal_ReportBeforeWindow) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-01 17:59:00", "SIN", _ctx);
    time_t sinSydDep = reportTimeSin + 3600;
    time_t sinSydArr = sinSydDep + 8 * 3600;
    time_t sydMelDep = sinSydArr + 2 * 3600;
    time_t sydMelArr = sydMelDep + 90 * 60;

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment("SIN", "SYD", sinSydDep, sinSydArr, true, _ctx));
    segs.push_back(makeSegment("SYD", "MEL", sydMelDep, sydMelArr, true, _ctx));
    
    std::vector<Duty*> duties;
    duties.push_back(makeDuty(segs, 3600, 1800).release());
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
}

TEST_F(Sia583aAnzTest, Illegal_TwoSectors_ReportInWindow) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-01 18:00:00", "SIN", _ctx);
    time_t sinSydDep = reportTimeSin + 3600;
    time_t sinSydArr = sinSydDep + 8 * 3600;
    time_t sydMelDep = sinSydArr + 2 * 3600;
    time_t sydMelArr = sydMelDep + 90 * 60;

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment("SIN", "SYD", sinSydDep, sinSydArr, true, _ctx));
    segs.push_back(makeSegment("SYD", "MEL", sydMelDep, sydMelArr, true, _ctx));
    
    std::vector<Duty*> duties;
    duties.push_back(makeDuty(segs, 3600, 1800).release());
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia583aAnzTest, Legal_ReportAfterWindow) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-02 00:01:00", "SIN", _ctx);
    time_t sinBneDep = reportTimeSin + 3600;
    time_t sinBneArr = sinBneDep + 8 * 3600;
    time_t bneMelDep = sinBneArr + 2 * 3600;
    time_t bneMelArr = bneMelDep + 2 * 3600;

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment("SIN", "BNE", sinBneDep, sinBneArr, true, _ctx));
    segs.push_back(makeSegment("BNE", "MEL", bneMelDep, bneMelArr, true, _ctx));
    
    std::vector<Duty*> duties;
    duties.push_back(makeDuty(segs, 3600, 1800).release());
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
}

TEST_F(Sia583aAnzTest, Illegal_TwoSectors_ReportAtMidnight) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);

    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-02 00:00:00", "SIN", _ctx);
    time_t sinBneDep = reportTimeSin + 3600;
    time_t sinBneArr = sinBneDep + 8 * 3600;
    time_t bneMelDep = sinBneArr + 2 * 3600;
    time_t bneMelArr = bneMelDep + 2 * 3600;

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment("SIN", "BNE", sinBneDep, sinBneArr, true, _ctx));
    segs.push_back(makeSegment("BNE", "MEL", bneMelDep, bneMelArr, true, _ctx));

    std::vector<Duty*> duties;
    duties.push_back(makeDuty(segs, 3600, 1800).release());
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia583aAnzTest, Illegal_TwoSectors_ReportAtWindowEnd) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-01 23:59:00", "SIN", _ctx);
    time_t sinBneDep = reportTimeSin + 3600;
    time_t sinBneArr = sinBneDep + 8 * 3600;
    time_t bneMelDep = sinBneArr + 2 * 3600;
    time_t bneMelArr = bneMelDep + 2 * 3600;

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment("SIN", "BNE", sinBneDep, sinBneArr, true, _ctx));
    segs.push_back(makeSegment("BNE", "MEL", bneMelDep, bneMelArr, true, _ctx));
    
    std::vector<Duty*> duties;
    duties.push_back(makeDuty(segs, 3600, 1800).release());
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test cases for "next duty" restrictions
TEST_F(Sia583aAnzTest, Illegal_NextDutyOnSameDayOfArrival) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // First duty: SIN-SYD, report at 18:00 (triggers rule)
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-01 18:00:00", "SIN", _ctx);
    time_t sinSydDep = reportTimeSin + 3600;
    time_t sinSydArr = sinSydDep + 8 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "SYD", sinSydDep, sinSydArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Second duty: SYD-SIN, starts on same local day as arrival in SYD
    time_t sydSinDep = sinSydArr + 4 * 3600; // only 4 hours rest
    time_t sydSinArr = sydSinDep + 8 * 3600;
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SYD", "SIN", sydSinDep, sydSinArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia583aAnzTest, Illegal_ForbiddenNextDutyPattern) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // First duty: SIN-MEL, report at 18:00
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-01 18:00:00", "SIN", _ctx);
    time_t sinMelDep = reportTimeSin + 3600;
    time_t sinMelArr = sinMelDep + 8 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "MEL", sinMelDep, sinMelArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Next duty is on the next day, but has 2 operating sectors to SIN
    time_t melSydDep = sinMelArr + 24 * 3600; // Next day rest
    time_t melSydArr = melSydDep + 90 * 60;
    time_t sydSinDep = melSydArr + 2 * 3600;
    time_t sydSinArr = sydSinDep + 8 * 3600;
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MEL", "SYD", melSydDep, melSydArr, true, _ctx));
        dutySegs.push_back(makeSegment("SYD", "SIN", sydSinDep, sydSinArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia583aAnzTest, Legal_AllowedNextDutyPattern) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // First duty: SIN-BNE, report at 18:00
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-01 18:00:00", "SIN", _ctx);
    time_t sinBneDep = reportTimeSin + 3600;
    time_t sinBneArr = sinBneDep + 8 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BNE", sinBneDep, sinBneArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Next duty is on the next day, and has 1 operating sector to SIN
    time_t bneSinDep = sinBneArr + 24 * 3600; // Next day rest
    time_t bneSinArr = bneSinDep + 8 * 3600;
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BNE", "SIN", bneSinDep, bneSinArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    EXPECT_TRUE(rule.CheckRule(&pairing));
}
