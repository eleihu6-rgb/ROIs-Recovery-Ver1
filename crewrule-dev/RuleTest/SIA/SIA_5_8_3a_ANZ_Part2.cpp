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

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     time_t startUtc,
                                     time_t endUtc,
                                     bool isOperating,
                                     const std::shared_ptr<CrewDataContext>& ctx) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD("SQ");
    seg->setFlightNumber("SQTEST");
    seg->setAssignment("FLY");
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

class Sia583aAnzPart2Test : public ::testing::Test {
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

// Legal, only operated one sector in FDP, and next duty is compliant.
TEST_F(Sia583aAnzPart2Test, Legal_CompliantPattern) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-SYD, report 22:05 LT (in window)
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-01 22:05:00", "SIN", _ctx);
    time_t sinSydDep = reportTimeSin + 3600; // Dep 23:05
    time_t sinSydArr = SIATest::utcFromLocal("2025-12-02 06:55:00", "SYD", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "SYD", sinSydDep, sinSydArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 3: SYD-SIN, starts on day after arrival
    time_t sydSinDep = SIATest::utcFromLocal("2025-12-03 08:10:00", "SYD", _ctx);
    time_t sydSinArr = sydSinDep + 8 * 3600 + 10 * 60; // Arr ~16:20
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SYD", "SIN", sydSinDep, sydSinArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Illegal, only can operate one sector on day after arrival
TEST_F(Sia583aAnzPart2Test, Illegal_TwoSectorReturnPattern) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-ADL, report 18:40 LT (in window to trigger rule)
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-01 18:40:00", "SIN", _ctx);
    time_t sinAdlDep = reportTimeSin + 3600; // Dep 19:40
    time_t sinAdlArr = SIATest::utcFromLocal("2025-12-02 03:20:00", "ADL", _ctx); // Arrival Day 2
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "ADL", sinAdlDep, sinAdlArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: ADL-MEL-SIN, starts on same day as arrival
    // This violates both "next day offset" and "2 sectors to SIN"
    time_t adlMelDep = SIATest::utcFromLocal("2025-12-02 23:45:00", "ADL", _ctx);
    time_t adlMelArr = SIATest::utcFromLocal("2025-12-03 01:30:00", "MEL", _ctx);
    time_t melSinDep = adlMelArr + 3600;
    time_t melSinArr = melSinDep + 7 * 3600;
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("ADL", "MEL", adlMelDep, adlMelArr, true, _ctx));
        dutySegs.push_back(makeSegment("MEL", "SIN", melSinDep, melSinArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Legal, not operating 2 sector back to SIN
TEST_F(Sia583aAnzPart2Test, Legal_ReturnSplitOverTwoDuties) {
    AcopFdpPatternRule rule(nullptr, _input);
    configureRule(rule);
    
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-BNE, report 20:00 LT (in window)
    time_t reportTimeSin = SIATest::utcFromLocal("2025-12-01 20:00:00", "SIN", _ctx);
    time_t sinBneDep = reportTimeSin + 3600; // Dep 21:00
    time_t sinBneArr = SIATest::utcFromLocal("2025-12-02 04:45:00", "BNE", _ctx); // Arrival Day 2
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BNE", sinBneDep, sinBneArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 3: BNE-MEL. Based on user "Legal" expectation, this must be on Day 3 to satisfy offset.
    time_t bneMelDep = SIATest::utcFromLocal("2025-12-03 20:00:00", "BNE", _ctx);
    time_t bneMelArr = bneMelDep + 2 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BNE", "MEL", bneMelDep, bneMelArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 4: MEL-SIN
    time_t melSinDep = bneMelArr + 15 * 3600; // Next day
    time_t melSinArr = melSinDep + 7 * 3600 + 40 * 60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MEL", "SIN", melSinDep, melSinArr, true, _ctx));
        duties.push_back(makeDuty(dutySegs, 3600, 1800).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    EXPECT_TRUE(rule.CheckRule(&pairing));
}
