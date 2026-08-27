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
std::unique_ptr<Duty> makeDuty(const std::vector<std::unique_ptr<Segment>>& segments) {
    if (segments.empty()) {
        return nullptr;
    }
    bool isSby = false;
    std::vector<Segment*> segPtrs;
    for (const auto& s : segments) {
        if (s->getAssignment() == "SBY") {
            isSby = true;
		}   
        segPtrs.push_back(s.get());
    }

    auto reportTime = 60 * 60;  // 1 hour report time
	auto debriefTime = 30 * 60; // 30 minutes debrief
	auto transportTime = 60 * 60; // 1 hour transportation
    if (isSby || segments.front()->getAssignment() == "DHD") { // Positioning duties have 0 ancillary time
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
                         const std::string& minSlipHours,
                         const std::string& minSlipLocalNights,
                         const std::string& maxStandbyPeriods,
                         const std::string& maxStandbyHours,
                         const std::string& allowedDutyWithinSlip,
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
    rule.params["Min slip hours"] = minSlipHours;
    rule.params["Min slip local nights"] = minSlipLocalNights;
    rule.params["Max Standby periods"] = maxStandbyPeriods;
    rule.params["Max standby hours"] = maxStandbyHours;
    rule.params["Allowed duty within slip"] = allowedDutyWithinSlip;
    // Fill other params with defaults to avoid issues
    rule.params["Min Slip Dep Time after LN"] = "*";
    rule.params["Previous Slip Local Nights"] = "*";
    rule.params["Previous Slip had standby"] = "*";
    rule.params["Duty After Hours"] = "*";
    rule.params["Duty After Local Nights"] = "*";
    rule.params["Duty Time After LN"] = "*";
    rule.params["DO after duty"] = "*";
    rule.params["Extra Condition"] = "*";
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

// Test fixture for SIA 5.8 (4e) EUR-SIN positioning
class Sia584eTest : public ::testing::Test {
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
            {"BCN", 60, "Europe/Madrid"} // Barcelona, Spain is UTC+1 (standard)
        });

        auto addAirport = [&](const char* code, const char* country, const char* category) {
            auto* a = new DBAirport();
            std::strncpy(a->airport, code, 3);
            a->airport[3] = '\0';
            std::strncpy(a->country, country, 2);
            a->country[2] = '\0';
            a->category = category;
            _ctx->airportCodeMap[code] = a;
        };
        addAirport("SIN", "SG", "SEA");
        // Per search results, "REUR" matches category "EUR"
        addAirport("BCN", "ES", "EUR"); 
        
        // Rule (4)(e): If positioning back to SIN from Europe, require slip of >= 24h and 1 LN.
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "(4)(e)", "SIN-REUR-SIN", "REUR", 1, "MVO|FLY", "MVP", "*", "24", "1", "0", "0", "0"));

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

// Test case 1: "Legal, rule doesn’t apply to operating"
// The rule is for positioning (MVP) after the slip. An operating flight (FLY) should not trigger it.
TEST_F(Sia584eTest, LegalRuleDoesNotApplyForOperating) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: SIN-BCN (Operating)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BCN", utcFromString("2025-12-01 04:00:00"), utcFromString("2025-12-01 17:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: BCN-SIN (Operating) after a short rest.
    // Rest should be < 24h.
    // Duty 1 ends 17:00 UTC. Rest starts 17:00 + 1.5h = 18:30 UTC.
    // Next duty starts on Day 2. Report at 16:00 UTC so rest is < 24h.
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "SIN", utcFromString("2025-12-02 17:00:00"), utcFromString("2025-12-03 06:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    
    // Rule should not fail because the duty after slip is FLY, not MVP.
    EXPECT_TRUE(rule.CheckRule(&pairing));
}


// Test case 2: "Legal, includes 24h and a LN"
TEST_F(Sia584eTest, LegalSufficientRestAndLN) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: SIN-BCN (Operating)
    time_t fltArrUtc = utcFromString("2025-12-01 17:00:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BCN", utcFromString("2025-12-01 04:00:00"), fltArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: BCN-SIN (Positioning) after > 24h rest with a local night.
    // Rest starts: 17:00 UTC + 1.5h (debrief/transport) = 18:30 UTC on Day 1.
    // To get > 24h rest, next duty must report after 18:30 UTC on Day 2.
    // Let's make it Day 3 to be safe.
    // Report at Day 3, 09:00 UTC. Rest is ~38.5 hours. It includes a LN.
    time_t posDepUtc = utcFromString("2025-12-03 10:00:00"); // Report at 09:00 UTC
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "SIN", posDepUtc, posDepUtc + 13 * 3600, "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Test case 3: "Illegal, does not have 24h although with a LN"
TEST_F(Sia584eTest, IllegalInsufficientRest) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: SIN-BCN (Operating)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BCN", utcFromString("2025-12-01 04:00:00"), utcFromString("2025-12-01 17:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: BCN-SIN (Positioning) after < 24h rest.
    // Rest starts: 17:00 UTC + 1.5h = 18:30 UTC on Day 1. (19:30 local)
    // Next duty reports at Day 2, 17:00 UTC (18:00 local).
    // Rest duration: (Day 2, 17:00 UTC) - (Day 1, 18:30 UTC) = 22.5 hours.
    // This rest from 19:30 local to 18:00 local next day includes a local night (02:00-04:00).
    time_t posDepUtc = utcFromString("2025-12-02 18:00:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "SIN", posDepUtc, posDepUtc + 13 * 3600, "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test case 4: "Illegal, no LN"
// This test creates a scenario with a short rest period that also does not contain a local night.
// The pairing should be illegal because the slip is < 24h and has 0 LNs.
TEST_F(Sia584eTest, IllegalNoLocalNight) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: SIN-BCN (Operating), arriving in the afternoon.
    // Arrive BCN 14:00 local (13:00 UTC)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "BCN", utcFromString("2025-12-01 00:00:00"), utcFromString("2025-12-01 13:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: BCN-SIN (Positioning) the same evening.
    // Rest starts: Day 1, 13:00 UTC + 30m debrief = 13:30 UTC (14:30 local)
    // Next duty (DHD) starts at 20:00 UTC (21:00 local)
    // Rest duration: 6.5 hours.
    // Rest period in local time: Day 1 14:30 -> Day 1 21:00.
    // This period is < 24h and contains no local night (22:00-08:00).
    time_t posDepUtc = utcFromString("2025-12-01 21:00:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("BCN", "SIN", posDepUtc, posDepUtc + 13 * 3600, "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    Pairing pairing(duties);
    
    // The rule requires >=24h AND 1LN. This pairing fails both conditions.
    EXPECT_FALSE(rule.CheckRule(&pairing));
}
