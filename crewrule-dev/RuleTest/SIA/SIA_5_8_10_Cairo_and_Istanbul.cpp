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
                       const std::string& followingDoAllowAfter) {
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
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

// Test fixture for SIA 5.8 (10) Cairo and Istanbul rule tests.
class Sia589CairoAndIstanbulTest : public ::testing::Test {
protected:
    void TearDown() override {
        // Rule 7422 is a calculator rule, it does not produce violations directly.
        // deleteViolations(_violationStorage);
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
            {"IST", 180, "Europe/Istanbul"},
            {"CAI", 120, "Africa/Cairo"}
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
        addAirport("IST", "TR", "EUR", "IST");
        addAirport("CAI", "EG", "AFR", "CAI");
        
        // Rule 5.8.(10) parameters for Rule 7422
        _input.dbRules.push_back(makeRule7422Row(7422001, 1, "10(a)", "SIN-CAI-SIN", "CAI", 24, "Y", "Y", 1, "06:00"));
        _input.dbRules.push_back(makeRule7422Row(7422002, 2, "10(b)", "SIN-IST-SIN", "IST", 24, "Y", "Y", 1, "06:00"));
    
        // Control Parameters - Table 2
        DBRule controlRule{};
        controlRule.idRule = 7422001;
        controlRule.function = 7422;
        controlRule.tableNum = 2;
        controlRule.rowNum = 1;
        controlRule.params["Rest starts after"] = "Transport"; // From user's Table 2
        controlRule.params["Operating definition"] = "SEGMENT_IS_OPERATING"; // From user's Table 2
        _input.dbRules.push_back(controlRule);
        DBRule controlRule2 = controlRule;
        controlRule2.idRule = 7422002;
        _input.dbRules.push_back(controlRule2);
    }

    void configureRule(CalculateAtdoAfterSlipForSQRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
        // Calculate rules do not set rule violations directly.
        // rule.setRuleViolation(&_violationStorage);
        // rule.setViolations(&_violationMessages);
    }
    
    RuleInput _input;
    std::shared_ptr<CrewDataContext> _ctx;
    // Rule 7422 is a calculator rule, it does not produce violations directly.
    // std::vector<RULE_VIOLATION*> _violationStorage;
    // std::vector<std::string> _violationMessages;
    SIATest::SiaRuleParamGuard _paramGuard;
};

// Test Case 1: SIN-IST, Slip < 24h, operating both ways. Expect ATDO.
TEST_F(Sia589CairoAndIstanbulTest, IST_SlipLessThan24h_Operating_ATDO_Required) {
    CalculateAtdoAfterSlipForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-IST (operating)
    time_t sinIstArrUtc = utcFromString("2025-12-10 05:00:00"); // 08:00 IST
    time_t sinIstDepUtc = sinIstArrUtc - 11 * 3600; // 01:30 SIN
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "IST", sinIstDepUtc, sinIstArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Slip < 24h (e.g., 22h from end of duty)
    // Duty ends at arr + 30m debrief + 60m transport = arr + 1.5h
    // Slip starts: sinIstArrUtc + 1.5 * 3600
    // Slip ends: istSinDepUtc - 1h report
    // Slip duration = (istSinDepUtc - 60*60) - (sinIstArrUtc + 1.5*3600) < 24 * 3600
    // istSinDepUtc < sinIstArrUtc + (24+2.5)*3600
    time_t istSinDepUtc = sinIstArrUtc + 25 * 3600; // results in slip < 24h
    time_t istSinArrUtc = istSinDepUtc + 11 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("IST", "SIN", istSinDepUtc, istSinArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    rule.CalculateDuty(&pairing);

    // Rule requires 1 ATDO, plus availability after 06:00 on the following day.
    Duty* lastDuty = duties.back();
    time_t restStartLoc = lastDuty->getEndTimeLocAct() + lastDuty->getActualDropoffMin() * 60;
    time_t dayOfRestStart = TimeUtils::Truncate(restStartLoc, ChronoUnit::DAYS);
    // The rest must contain one full day off, and then extend until 06:00 on the day after that.
    time_t requiredRestEndLoc = dayOfRestStart + (2 * 24 * 3600) + (6 * 3600);
    int expectedMinRestMinutes = static_cast<int>((requiredRestEndLoc - restStartLoc) / 60);
    
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
}

// Test Case 2: SIN-IST, Slip >= 24h, operating both ways. No ATDO.
TEST_F(Sia589CairoAndIstanbulTest, IST_Slip24hOrMore_Operating_NoATDO) {
    CalculateAtdoAfterSlipForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-IST (operating)
    time_t sinIstArrUtc = utcFromString("2025-12-10 05:00:00");
    time_t sinIstDepUtc = sinIstArrUtc - 11 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "IST", sinIstDepUtc, sinIstArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Slip >= 24h
    time_t istSinDepUtc = sinIstArrUtc + 28 * 3600; // results in slip > 24h
    time_t istSinArrUtc = istSinDepUtc + 11 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("IST", "SIN", istSinDepUtc, istSinArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    rule.CalculateDuty(&pairing);
    
    Duty* lastDuty = duties.back();
    EXPECT_EQ(0, lastDuty->getMinRestAtBase());
}

// Test Case 3: SIN-IST, Slip < 24h, return is positioning. No ATDO.
TEST_F(Sia589CairoAndIstanbulTest, IST_SlipLessThan24h_ReturnPositioning_NoATDO) {
    CalculateAtdoAfterSlipForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-IST (operating)
    time_t sinIstArrUtc = utcFromString("2025-12-10 05:00:00");
    time_t sinIstDepUtc = sinIstArrUtc - 11 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "IST", sinIstDepUtc, sinIstArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Slip < 24h
    time_t istSinDepUtc = sinIstArrUtc + 25 * 3600;
    time_t istSinArrUtc = istSinDepUtc + 11 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("IST", "SIN", istSinDepUtc, istSinArrUtc, "PU", false, _ctx)); // Positioning
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    rule.CalculateDuty(&pairing);
    
    Duty* lastDuty = duties.back();
    EXPECT_EQ(0, lastDuty->getMinRestAtBase());
}

// Test Case 4: SIN-IST, Slip < 24h, outbound is positioning. No ATDO.
TEST_F(Sia589CairoAndIstanbulTest, IST_SlipLessThan24h_OutboundPositioning_NoATDO) {
    CalculateAtdoAfterSlipForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-IST (positioning)
    time_t sinIstArrUtc = utcFromString("2025-12-10 05:00:00");
    time_t sinIstDepUtc = sinIstArrUtc - 11 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "IST", sinIstDepUtc, sinIstArrUtc, "PU", false, _ctx)); // Positioning
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Slip < 24h
    time_t istSinDepUtc = sinIstArrUtc + 25 * 3600;
    time_t istSinArrUtc = istSinDepUtc + 11 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("IST", "SIN", istSinDepUtc, istSinArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    rule.CalculateDuty(&pairing);
    
    Duty* lastDuty = duties.back();
    EXPECT_EQ(0, lastDuty->getMinRestAtBase());
}
