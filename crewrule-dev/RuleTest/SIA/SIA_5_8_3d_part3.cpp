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
    rule.params["Min Slip Dep Time after LN"] = "*";
    rule.params["Max Standby periods"] = maxStandbyPeriods;
    rule.params["Max standby hours"] = maxStandbyHours;
    rule.params["Allowed duty within slip"] = allowedDutyWithinSlip;
    // Fill other params with defaults to avoid issues
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

// Test fixture for SIA 5.8 (3d) Part 3 rule tests.
class Sia583dPart3Test : public ::testing::Test {
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
            {"CHC", 780, "Pacific/Auckland"}
        });

        // Location matching (e.g. "NZ") requires airportCodeMap entries.
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
        addAirport("CHC", "NZ", "NZL");
        
        // Part 1: Fly SIN-NZ, slip 2LN, then SBY (max 2 periods, 6h)
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "(3)(d) part 1", "SIN-NZ-SIN", "NZ", 1, "FLY|MVO", "*", "18:00-24:00", "*", "2", "2", "6", "*", "SLIP"));
        // Part 2: Position to NZ, slip 24h/1LN, then FLY or SBY (max 1 period, 6h)
        _input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "(3)(d) part 2", "SIN-NZ-SIN", "NZ", 1, "MVP", "FLY|MVO", "*", "24", "1", "1", "6", "*", "SLIP"));
        // Part 3: Allow positioning within NZ
        _input.dbRules.push_back(makeAcopTableBRow(7421003, 3, "(3)(d) part 3", "SIN-NZ-SIN", "NZ", 1, "*", "*", "*", "*", "1", "*", "*", "POS in NZ", "DUTY"));
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

TEST_F(Sia583dPart3Test, IllegalShortRestBeforeFlight) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: Positioning SIN-CHC (Assignment DHD gives MVP duty)
    time_t posArrUtc = utcFromString("2025-12-01 19:40:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "CHC", utcFromString("2025-12-01 10:00:00"), posArrUtc, "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: Flight CHC-SIN with rest of 23h 50m
    // Rest start is posArrUtc + debrief 30m + transport 60m = 21:10
    // To get 23h50m rest, report for next duty is at 21:10 + 23h50m = 21:00 next day
    // Report is 60m, so flight departs at 22:00
    time_t fltDepUtc = utcFromString("2025-12-02 22:00:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("CHC", "SIN", fltDepUtc, fltDepUtc + 10 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia583dPart3Test, LegalSufficientRestBeforeFlight) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: Positioning SIN-CHC
    time_t posArrUtc = utcFromString("2025-12-01 19:40:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "CHC", utcFromString("2025-12-01 10:00:00"), posArrUtc, "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: Flight CHC-SIN with rest of 24h+
    time_t fltDepUtc = utcFromString("2025-12-02 22:10:00"); // 10 mins later than illegal case
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("CHC", "SIN", fltDepUtc, fltDepUtc + 10 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

TEST_F(Sia583dPart3Test, IllegalMultipleStandbyPeriods) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: Positioning SIN-CHC
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "CHC", utcFromString("2025-12-01 10:00:00"), utcFromString("2025-12-01 19:40:00"), "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Two standby duties, which is not allowed by part 2 of the rule
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("CHC", "CHC", SIATest::utcFromLocal("2025-12-02 10:00:00", "CHC", _ctx), SIATest::utcFromLocal("2025-12-02 13:00:00", "CHC", _ctx), "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("CHC", "CHC", SIATest::utcFromLocal("2025-12-02 14:00:00", "CHC", _ctx), SIATest::utcFromLocal("2025-12-02 17:00:00", "CHC", _ctx), "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    // Final flight
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("CHC", "SIN", utcFromString("2025-12-03 12:00:00"), utcFromString("2025-12-03 22:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia583dPart3Test, LegalSingleStandbyPeriod) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Duty 1: Positioning SIN-CHC
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "CHC", utcFromString("2025-12-01 10:00:00"), utcFromString("2025-12-01 19:40:00"), "DHD", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // One standby duty of 6 hours
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("CHC", "CHC", SIATest::utcFromLocal("2025-12-02 10:00:00", "CHC", _ctx), SIATest::utcFromLocal("2025-12-02 16:00:00", "CHC", _ctx), "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    // Final flight
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("CHC", "SIN", utcFromString("2025-12-03 12:00:00"), utcFromString("2025-12-03 22:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}
