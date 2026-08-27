#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7421/AcopSlipPatternRule.h"
#include "RuleEngine/rule/rule7421/AcopSlipPatternRuleParam.h"

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

    auto reportTime = 60 * 60;  // 1 hour report time
	auto debriefTime = 30 * 60; // 30 minutes debrief
	auto transportTime = 60 * 60; // 1 hour transportation
    if (isSby) {
        reportTime = 0;
        debriefTime = 0;
		transportTime = 0;
    }

    auto duty = std::make_unique<Duty>(segPtrs);
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct() - reportTime);
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct() + debriefTime);
    duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct() - reportTime);
    duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct() + debriefTime);
    duty->setDepartureStation(segments.front()->getDepStation());
    duty->setArrivalStation(segments.back()->getArrStation());
    duty->setMinBrief(reportTime / 60);
	duty->setActualBriefMin(reportTime / 60);
	duty->setMinDebrief(debriefTime / 60);
	duty->setActualDebriefMin(debriefTime / 60);
	duty->setMinDropoff(transportTime / 60);
	duty->setActualDropoffMin(transportTime / 60);

    const time_t dutyStartUtc = duty->getStartTimeUtcAct();
    const time_t dutyEndUtc = duty->getEndTimeUtcAct();
    const int fdpMinutes = (dutyEndUtc > dutyStartUtc) ? static_cast<int>((dutyEndUtc - dutyStartUtc) / 60) : 0;
    duty->setPlanFDP(fdpMinutes);
    duty->setActualFDP(fdpMinutes);

    return duty;
}

DBRule makeAcopTableBRowFromParamString(long long ruleId, int rowNum, const std::string& paramString) {
    std::vector<std::string> params;
    split(paramString, params, ",");

    DBRule rule{};
    rule.idRule = ruleId;
    rule.function = 7421;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 742100000 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SIA";
    rule.params["Clause"] = params[0];
    rule.params["Pattern"] = params[1];
    rule.params["Slip station"] = params[2];
    rule.params["Group"] = params[3];
    rule.params["Priority"] = params[4];
    rule.params["Slip Arr Is Operating"] = params[5];
    rule.params["Slip Dep Is Operating"] = params[6];
    rule.params["Duty Assignment before slip"] = "*";
    rule.params["Duty Assignment after slip"] = "*";
    const bool hasDepartureTimeAtBase = params.size() > 23;
    rule.params["Reporting time at base"] = params[9];
    rule.params["Departure time at base"] = hasDepartureTimeAtBase ? params[10] : "*";
    const std::size_t offset = hasDepartureTimeAtBase ? 1 : 0;
    rule.params["Previous Slip Local Nights"] = params[10 + offset];
    rule.params["Previous Slip had standby"] = params[11 + offset];
    rule.params["Min slip hours"] = params[12 + offset];
    rule.params["Min slip local nights"] = params[13 + offset];
    rule.params["Min Slip Dep Time after LN"] = params[14 + offset];
    rule.params["Duty After Hours"] = params[15 + offset];
    rule.params["Duty After Local Nights"] = params[16 + offset];
    rule.params["Duty Time After LN"] = params[17 + offset];
    rule.params["Max Standby periods"] = params[18 + offset];
    rule.params["Max standby hours"] = params[19 + offset];
    rule.params["Allowed duty within slip"] = params[20 + offset];
    rule.params["DO after duty"] = params[21 + offset];
    rule.params["Extra Condition"] = params[22 + offset];
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

// Test fixture for SIA 5.8 (4b) rule tests.
class Sia584bPart2Test : public ::testing::Test {
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
        _ctx = SIATest::buildCrewDataContext({
            {"SIN", 480, "Asia/Singapore"},
            {"BCN", 60, "Europe/Madrid"},
            {"MXP", 60, "Europe/Rome"}
        });

        auto addAirport = [&](const char* code, const char* country, const char* category, const char* city) {
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
        };
        addAirport("SIN", "SG", "SEA", "SIN");
        addAirport("BCN", "ES", "EUR", "BCN");
        addAirport("MXP", "IT", "EUR", "MXP");
        
        // Rule 5.8.(4b)
        const std::string paramString =
            "4(b),(SIN|BKK|CMB|MLE)-REUR-*,REUR,SLIP,1,*,*,*,*,*,*,*,*,2,*,*,*,00:00,2,6,POS IN REUR|FDP <=6H IN REUR,1,EUR_4B";
        _input.dbRules.push_back(makeAcopTableBRowFromParamString(7421001, 25, paramString));
    
        // Control Parameters - Table 2
        DBRule controlRule{};
        controlRule.idRule = 7421001;
        controlRule.function = 7421;
        controlRule.tableNum = 2;
        controlRule.rowNum = 1;
        controlRule.params["SBY REDUCES REST AND LN"] = "Y";
        controlRule.params["REST STARTS AFTER"] = "Transport";
        controlRule.params["STANDBY ASSIGNMENTS"] = "SBY";
        _input.dbRules.push_back(controlRule);
    }

    void configureRule(AcopSlipPatternRule& rule) {
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

// Test Case 1: Legal, day free after positioning
TEST_F(Sia584bPart2Test, Legal_PositioningWithDayFree) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-BCN (flight time ~13h)
    time_t sinBcnDepUtc = utcFromString("2025-12-10 00:00:00");
    time_t sinBcnArrUtc = sinBcnDepUtc + 13 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BCN", sinBcnDepUtc, sinBcnArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: [PU] BCN-MXP (positioning, day after arrival)
    time_t bcnMxpDepUtc = SIATest::utcFromLocal("2025-12-11 10:00:00", "BCN", _ctx);
    time_t bcnMxpArrUtc = bcnMxpDepUtc + 90 * 60; // 1.5h flight
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "MXP", bcnMxpDepUtc, bcnMxpArrUtc, "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 4: MXP-SIN, provides day free on Day 3
    time_t mxpSinDepUtc = SIATest::utcFromLocal("2025-12-13 12:00:00", "MXP", _ctx);
    time_t mxpSinArrUtc = mxpSinDepUtc + 12 * 3600 + 1800;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MXP", "SIN", mxpSinDepUtc, mxpSinArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Test Case 2: Legal, FDP of up to 6h in EUR + day free of duty
TEST_F(Sia584bPart2Test, Legal_FDP6hWithDayFree) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-BCN
    time_t sinBcnDepUtc = utcFromString("2025-12-10 00:00:00");
    time_t sinBcnArrUtc = sinBcnDepUtc + 13 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BCN", sinBcnDepUtc, sinBcnArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: BCN-MXP-BCN (FDP <= 6h)
    time_t bcnMxpDepUtc = SIATest::utcFromLocal("2025-12-11 10:00:00", "BCN", _ctx);
    time_t bcnMxpArrUtc = bcnMxpDepUtc + 90 * 60;
    time_t mxpBcnDepUtc = bcnMxpArrUtc + 60 * 60; // 1h turnaround
    time_t mxpBcnArrUtc = mxpBcnDepUtc + 90 * 60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "MXP", bcnMxpDepUtc, bcnMxpArrUtc, "FLY", true, _ctx));
        dutySegs.push_back(makeSegment("MXP", "BCN", mxpBcnDepUtc, mxpBcnArrUtc, "FLY", true, _ctx));
        // FDP = (1h report) + 1.5h flight + 1h ground + 1.5h flight = 5h
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 4: BCN-SIN, provides day free on Day 3
    time_t bcnSinDepUtc = SIATest::utcFromLocal("2025-12-13 12:00:00", "BCN", _ctx);
    time_t bcnSinArrUtc = bcnSinDepUtc + 13 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "SIN", bcnSinDepUtc, bcnSinArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Test Case 3: Illegal, no day free of duty
TEST_F(Sia584bPart2Test, Illegal_NoDayFree) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-BCN
    time_t sinBcnDepUtc = utcFromString("2025-12-10 00:00:00");
    time_t sinBcnArrUtc = sinBcnDepUtc + 13 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BCN", sinBcnDepUtc, sinBcnArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: BCN-MXP-BCN
    time_t bcnMxpDepUtc = SIATest::utcFromLocal("2025-12-11 10:00:00", "BCN", _ctx);
    time_t bcnMxpArrUtc = bcnMxpDepUtc + 90 * 60;
    time_t mxpBcnDepUtc = bcnMxpArrUtc + 60 * 60;
    time_t mxpBcnArrUtc = mxpBcnDepUtc + 90 * 60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "MXP", bcnMxpDepUtc, bcnMxpArrUtc, "FLY", true, _ctx));
        dutySegs.push_back(makeSegment("MXP", "BCN", mxpBcnDepUtc, mxpBcnArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 3: BCN-SIN, no day free
    time_t bcnSinDepUtc = SIATest::utcFromLocal("2025-12-12 12:00:00", "BCN", _ctx);
    time_t bcnSinArrUtc = bcnSinDepUtc + 13 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "SIN", bcnSinDepUtc, bcnSinArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test Case 4: Illegal, FDP of more than 6h in EUR
TEST_F(Sia584bPart2Test, Illegal_FDPgt6h) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-BCN
    time_t sinBcnDepUtc = utcFromString("2025-12-10 00:00:00");
    time_t sinBcnArrUtc = sinBcnDepUtc + 13 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BCN", sinBcnDepUtc, sinBcnArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: BCN-MXP-BCN (FDP > 6h)
    time_t bcnMxpDepUtc = SIATest::utcFromLocal("2025-12-11 10:00:00", "BCN", _ctx);
    time_t bcnMxpArrUtc = bcnMxpDepUtc + 90 * 60;
    time_t mxpBcnDepUtc = bcnMxpArrUtc + 4 * 3600; // 4h turnaround
    time_t mxpBcnArrUtc = mxpBcnDepUtc + 90 * 60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "MXP", bcnMxpDepUtc, bcnMxpArrUtc, "FLY", true, _ctx));
        dutySegs.push_back(makeSegment("MXP", "BCN", mxpBcnDepUtc, mxpBcnArrUtc, "FLY", true, _ctx));
        // FDP = (1h report) + 1.5h flight + 4h ground + 1.5h flight = 8h
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 4: BCN-SIN, provides day free
    time_t bcnSinDepUtc = SIATest::utcFromLocal("2025-12-13 12:00:00", "BCN", _ctx);
    time_t bcnSinArrUtc = bcnSinDepUtc + 13 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "SIN", bcnSinDepUtc, bcnSinArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}
