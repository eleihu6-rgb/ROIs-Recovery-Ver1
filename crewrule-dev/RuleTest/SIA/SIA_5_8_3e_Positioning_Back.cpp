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
                         const std::string& minSlipHours,
                         const std::string& minSlipLocalNights,
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
    rule.params["Min slip hours"] = minSlipHours;
    rule.params["Min slip local nights"] = minSlipLocalNights;
    rule.params["Min Slip Dep Time after LN"] = "*";
    // Fill other params with defaults to avoid issues
    rule.params["Reporting time at base"] = "*";
    rule.params["Previous Slip Local Nights"] = "*";
    rule.params["Previous Slip had standby"] = "*";
    rule.params["Duty After Hours"] = "*";
    rule.params["Duty After Local Nights"] = "*";
    rule.params["Duty Time After LN"] = "*";
    rule.params["Max Standby periods"] = "*";
    rule.params["Max standby hours"] = "*";
    rule.params["Allowed duty within slip"] = "*";
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

// Test fixture for SIA 5.8 (3e) rule tests.
class Sia583eTest : public ::testing::Test {
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
            {"SYD", 600, "Australia/Sydney"},
            {"PER", 480, "Australia/Perth"}
        });

        // Location matching requires airportCodeMap entries.
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
        addAirport("SYD", "AU", "AUS");
        addAirport("PER", "AU", "AUS");
        
        // (3)(e) part 1: Positioning from AU~PER or NZ requires 1LN rest
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "(3)(e) part 1", "SIN-(AU~PER)|NZ-SIN", "(AU~PER)|NZ", 1, "FLY|MVO", "MVP", "0", "1"));
        // (3)(e) part 2: Positioning from PER requires 10h rest
        _input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "(3)(e) part 2", "SIN-PER-SIN", "PER", 1, "FLY|MVO", "MVP", "10", "*"));
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

// Test Case 1: Legal - Positioning back from SYD after 1 Local Night rest.
TEST_F(Sia583eTest, LegalAfterOneLocalNightRest) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: Operating flight SIN-SYD (SQ241)
    // Dep SIN 20:45 (12:45Z), Arr SYD 07:45+1 (21:45Z) -> 9h flight
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "SYD", utcFromString("2025-12-10 12:45:00"), utcFromString("2025-12-10 21:45:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: Positioning back SYD-SIN (SQ212) after a rest including 1 local night.
    // Duty 1 release time at SYD: 07:45 + 30m debrief + 60m transport = 09:15 local
    // Rest start: 2025-12-11 09:15 SYD local.
    // To include 1LN, rest must span a 02:00-06:00 window.
    // Let's schedule Duty 2 report on 2025-12-12 at 10:00 SYD local (for 11:00 departure).
    // Rest is from 09:15 on Dec 11 to 10:00 on Dec 12. This includes a local night.
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        // SQ212 is DHD (positioning)
        dutySegs.push_back(makeSegment("SYD", "SIN", SIATest::utcFromLocal("2025-12-12 11:00:00", "SYD", _ctx), SIATest::utcFromLocal("2025-12-12 16:30:00", "SIN", _ctx), "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Test Case 2: Illegal - Positioning back from SYD without 1 Local Night rest.
TEST_F(Sia583eTest, IllegalWithoutOneLocalNightRest) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: Operating flight SIN-SYD (SQ211)
    // Dep SIN 09:30 (01:30Z), Arr SYD 20:30 (10:30Z) -> 9h flight
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "SYD", utcFromString("2025-12-15 01:30:00"), utcFromString("2025-12-15 10:30:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: Positioning back SYD-SIN (SQ212) without 1LN rest.
    // Duty 1 release time at SYD: 20:30 + 30m debrief + 60m transport = 22:00 local
    // Rest start: 2025-12-15 22:00 SYD local.
    // Local night is 02:00-06:00. To be illegal, next report must be before 06:00 on Dec 16.
    // Let's schedule Duty 2 report on 2025-12-16 at 01:00 SYD local.
    // Rest is from 22:00 to 01:00. No local night included.
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        // SQ212 is DHD (positioning)
        dutySegs.push_back(makeSegment("SYD", "SIN", SIATest::utcFromLocal("2025-12-16 02:00:00", "SYD", _ctx), SIATest::utcFromLocal("2025-12-16 07:30:00", "SIN", _ctx), "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test Case 3: Legal - Operating back from SYD without 1 Local Night rest.
TEST_F(Sia583eTest, LegalWhenOperatingNotPositioning) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Same setup as the illegal case.
    // Duty 1: Operating flight SIN-SYD (SQ211)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "SYD", utcFromString("2025-12-18 01:30:00"), utcFromString("2025-12-18 10:30:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: Operating back SYD-SIN (SQ212) without 1LN rest.
    // The rule only applies to positioning (MVP), not operating (MVO).
    // This should be legal as the rule condition on assignment 'MVP' is not met.
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        // Dep SYD 22:50, Arr SIN 06:50+1 (given in test case, seems long, using as is)
        dutySegs.push_back(makeSegment("SYD", "SIN", SIATest::utcFromLocal("2025-12-19 22:50:00", "SYD", _ctx), SIATest::utcFromLocal("2025-12-20 06:50:00", "SIN", _ctx), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Test Case 4: Legal - Positioning from PER with >=10h rest, no LN required.
TEST_F(Sia583eTest, LegalPositioningFromPerthWithMinRest) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: Operating flight SIN-PER (SQ215)
    // Dep SIN 18:45 (10:45Z), Arr PER 23:55 (15:55Z) -> 5h 10m flight
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "PER", utcFromString("2025-12-22 10:45:00"), utcFromString("2025-12-22 15:55:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: Positioning PER-SIN after 10h rest.
    // Duty 1 release time at PER: 23:55 + 30m debrief + 60m transport = 01:25 on Dec 23.
    // Rest start: 2025-12-23 01:25 PER local.
    // Rule for PER requires 10h min slip.
    // Next report can be at 01:25 + 10h = 11:25 on Dec 23. This rest does not include a local night.
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("PER", "SIN", SIATest::utcFromLocal("2025-12-23 12:25:00", "PER", _ctx), SIATest::utcFromLocal("2025-12-23 17:50:00", "SIN", _ctx), "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Test Case 5: Illegal - Positioning from PER with <10h rest.
TEST_F(Sia583eTest, IllegalPositioningFromPerthWithLessThanMinRest) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Duty 1: Operating flight SIN-PER (SQ215)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "PER", utcFromString("2025-12-22 10:45:00"), utcFromString("2025-12-22 15:55:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: Positioning PER-SIN after 9h 50m rest.
    // Duty 1 release time at PER: 23:55 + 90m = 01:25 on Dec 23.
    // Next report is at 01:25 + 9h 50m = 11:15 on Dec 23.
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("PER", "SIN", SIATest::utcFromLocal("2025-12-23 12:15:00", "PER", _ctx), SIATest::utcFromLocal("2025-12-23 17:40:00", "SIN", _ctx), "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}
