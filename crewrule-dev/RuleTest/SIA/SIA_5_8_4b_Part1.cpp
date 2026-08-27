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
    return duty;
}

DBRule makeAcopTableBRow(long long ruleId,
                         int rowNum,
                         const std::string& clause,
                         const std::string& pattern,
                         const std::string& slipStation,
                         int priority,
                         const std::string& dutyBefore,
                         const std::string& dutyAfter,
                         const std::string& reportTimeWindow,
                         const std::string& prevSlipLN,
                         const std::string& prevSlipSby,
                         const std::string& minSlipHours,
                         const std::string& minSlipLocalNights,
                         const std::string& slipDepartDutyReportTime,
                         const std::string& dutyAfterHours,
                         const std::string& dutyAfterLN,
                         const std::string& dutyAfterLocalTime,
                         const std::string& maxStandbyPeriods,
                         const std::string& maxStandbyHours,
                         const std::string& allowedDutyWithinSlip,
                         const std::string& doAfterDuty,
                         const std::string& extraCondition,
                         const std::string& group = "DEFAULT") {
    auto deriveSlipIsOperating = [](const std::string& dutyAssignmentFilter) -> std::string {
        const std::string trimmedUpper = strToUpper(trim(dutyAssignmentFilter));
        if (trimmedUpper.empty() || trimmedUpper == "*") {
            return "*";
        }

        std::vector<std::string> tokens;
        split(trimmedUpper.c_str(), '|', tokens);
        std::vector<std::string> normalized;
        normalized.reserve(tokens.size());
        for (auto& t : tokens) {
            const std::string token = strToUpper(trim(t));
            if (!token.empty()) {
                normalized.push_back(token);
            }
        }

        if (normalized.size() == 1 && normalized.front() == "MVP") {
            return "N";
        }
        for (const auto& token : normalized) {
            if (token == "FLY" || token == "MVO") {
                return "Y";
            }
        }
        return "*";
    };

    DBRule rule{};
    rule.idRule = ruleId;
    rule.function = 7421;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 742100000 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SIA";
    rule.params["Clause"] = clause;
    rule.params["Pattern"] = pattern;
    rule.params["Slip station"] = slipStation;
    rule.params["Group"] = group;
    rule.params["Priority"] = std::to_string(priority);
    rule.params["Slip Arr Is Operating"] = deriveSlipIsOperating(dutyBefore);
    rule.params["Slip Dep Is Operating"] = deriveSlipIsOperating(dutyAfter);
    rule.params["Duty Assignment before slip"] = "*";
    rule.params["Duty Assignment after slip"] = "*";
    rule.params["Reporting time at base"] = reportTimeWindow;
    rule.params["Previous Slip Local Nights"] = prevSlipLN;
    rule.params["Previous Slip had standby"] = prevSlipSby;
    rule.params["Min slip hours"] = minSlipHours;
    rule.params["Min slip local nights"] = minSlipLocalNights;
    rule.params["Min Slip Dep Time after LN"] = slipDepartDutyReportTime;
    rule.params["Duty After Hours"] = dutyAfterHours;
    rule.params["Duty After Local Nights"] = dutyAfterLN;
    rule.params["Duty Time After LN"] = dutyAfterLocalTime;
    rule.params["Max Standby periods"] = maxStandbyPeriods;
    rule.params["Max standby hours"] = maxStandbyHours;
    rule.params["Allowed duty within slip"] = allowedDutyWithinSlip;
    rule.params["DO after duty"] = doAfterDuty;
    rule.params["Extra Condition"] = extraCondition;
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

// Test fixture for SIA 5.8 (4b) SIN-EUR slip rule tests.
class Sia584bSinEurSlipTest : public ::testing::Test {
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
            {"AMS", 60, "Europe/Amsterdam"},
            {"BRU", 60, "Europe/Brussels"},
            {"MXP", 60, "Europe/Rome"},
            {"BCN", 60, "Europe/Madrid"}
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
        addAirport("AMS", "NL", "EUR", "AMS");
        addAirport("BRU", "BE", "EUR", "BRU");
        addAirport("MXP", "IT", "EUR", "MIL");
        addAirport("BCN", "ES", "EUR", "BCN");
        
        // Rule 5.8.(4b) from provided SQL
        _input.dbRules.push_back(makeAcopTableBRow(
            7421001, 1, "4(b)", "(SIN|BKK|CMB|MLE)-REUR-*", "REUR", 1, 
            "MVO|FLY", "*", "*", "*", "*", "*", "2", "*", "*", "*", "00:00",
            "2", "6", "POS IN REUR | FDP <=6H IN REUR", "1", "EUR_4B"
        ));
    
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

// Test Case 1: Legal, two LN and standby up to 6h in 2 blocks max
// Day 1: SIN-AMS; Day 2: STBY 2x3h; Day 3: AMS-SIN 
TEST_F(Sia584bSinEurSlipTest, Legal_SIN_AMS_2LN_SBY) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-AMS, arr "2025-12-01 06:00" local
    time_t sinAmsArrUtc = SIATest::utcFromLocal("2025-12-01 06:00:00", "AMS", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "AMS", sinAmsArrUtc - 13 * 3600, sinAmsArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Standby 2x3h. This is day after arrival.
    time_t sby1StartUtc = SIATest::utcFromLocal("2025-12-02 10:00:00", "AMS", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("AMS", "AMS", sby1StartUtc, sby1StartUtc + 3 * 3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    time_t sby2StartUtc = SIATest::utcFromLocal("2025-12-02 15:00:00", "AMS", _ctx);
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("AMS", "AMS", sby2StartUtc, sby2StartUtc + 3 * 3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 3: AMS-SIN. Departure after 2 local nights.
    // Arr day is Dec 1. Rest is all of Dec 1, Dec 2. Dep on Dec 3 is after 2LN.
    time_t amsSinDepUtc = SIATest::utcFromLocal("2025-12-03 11:00:00", "AMS", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("AMS", "SIN", amsSinDepUtc, amsSinDepUtc + 13 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});

    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Test Case 2: Illegal, without 2LN rest
// Day 1: SIN-BRU; Day 2: STBY 2x3h; Day 2: BRU-SIN
TEST_F(Sia584bSinEurSlipTest, Illegal_SIN_BRU_No2LN) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-BRU, arr "2025-12-01 06:00" local
    time_t sinBruArrUtc = SIATest::utcFromLocal("2025-12-01 06:00:00", "BRU", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BRU", sinBruArrUtc - 13 * 3600, sinBruArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Standby 2x3h.
    time_t sby1StartUtc = SIATest::utcFromLocal("2025-12-02 10:00:00", "BRU", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BRU", "BRU", sby1StartUtc, sby1StartUtc + 3 * 3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    // Day 2: BRU-SIN flight on the same day. This is less than 2LN.
    time_t bruSinDepUtc = SIATest::utcFromLocal("2025-12-02 21:00:00", "BRU", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BRU", "SIN", bruSinDepUtc, bruSinDepUtc + 13 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test Case 3: Illegal, cannot be required to position on same day as standby
// Day 1: SIN-MXP; Day 2: STBY 2x3h; Day 2: [PU] MXP-BCN
TEST_F(Sia584bSinEurSlipTest, Illegal_SIN_MXP_SBYAndPosSameDay) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-MXP, arr "2025-12-01 06:00" local
    time_t sinMxpArrUtc = SIATest::utcFromLocal("2025-12-01 06:00:00", "MXP", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "MXP", sinMxpArrUtc - 12 * 3600, sinMxpArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Standby 2x3h.
    time_t sby1StartUtc = SIATest::utcFromLocal("2025-12-02 10:00:00", "MXP", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MXP", "MXP", sby1StartUtc, sby1StartUtc + 3 * 3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    // Day 2: Positioning flight on the same day.
    time_t mxpBcnDepUtc = SIATest::utcFromLocal("2025-12-02 21:00:00", "MXP", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MXP", "BCN", mxpBcnDepUtc, mxpBcnDepUtc + 2 * 3600, "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Add a return flight to satisfy the COP. Not strictly required for this test.
    time_t bcnSinDepUtc = SIATest::utcFromLocal("2025-12-04 11:00:00", "BCN", _ctx);
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "SIN", bcnSinDepUtc, bcnSinDepUtc + 13 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}


// Test Case 4: Illegal, must have CA day free after positioning (24 hours)
// Day 1: SIN-BCN; Day 2: [PU] BCN-MXP; Day 3: MXP-SIN
TEST_F(Sia584bSinEurSlipTest, Illegal_SIN_BCN_NoDayFreeAfterPos) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-BCN, arr "2025-12-01 07:00" local
    time_t sinBcnArrUtc = SIATest::utcFromLocal("2025-12-01 07:00:00", "BCN", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BCN", sinBcnArrUtc - 13 * 3600, sinBcnArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: Positioning BCN-MXP on day after arrival.
    time_t bcnMxpDepUtc = SIATest::utcFromLocal("2025-12-02 12:00:00", "BCN", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "MXP", bcnMxpDepUtc, bcnMxpDepUtc + 2 * 3600, "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    // Day 3: Flight MXP-SIN. This is the day after positioning, which is not a "day free".
    time_t mxpSinDepUtc = SIATest::utcFromLocal("2025-12-03 11:00:00", "MXP", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MXP", "SIN", mxpSinDepUtc, mxpSinDepUtc + 12 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}
