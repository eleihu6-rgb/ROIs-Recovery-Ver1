#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7421/AcopSlipPatternRule.h"
#include "RuleEngine/rule/rule7421/AcopSlipPatternRuleParam.h"

#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

namespace {

// Helper to create UTC timestamp from a string.
time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

// Helper to create a flight/ground segment.
std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& assignment,
                                     bool isOperating,
                                     CrewDataContext* ctx) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD("SQ");
    seg->setFlightNumber("SQTEST");
    seg->setAssignment(assignment);
    seg->setIsOperating(isOperating);

    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);

    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);

	auto depOffset = ctx->getAirportOffsetMinutes(dep);
	auto arrOffset = ctx->getAirportOffsetMinutes(arr);
    seg->setStartTimeLocAct(start + depOffset * 60);
    seg->setEndTimeLocAct(end + arrOffset * 60);
    seg->setStartTimeLocSch(start + depOffset * 60);
    seg->setEndTimeLocSch(end + arrOffset * 60);

    return seg;
}

// Helper to create a duty from a vector of segments.
std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments) {
    if (segments.empty()) {
        return nullptr;
    }
    auto duty = std::make_unique<Duty>(segments);
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
    duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
    duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
    duty->setDepartureStation(segments.front()->getDepStation());
    duty->setArrivalStation(segments.back()->getArrStation());
    return duty;
}


// Helper to create a DBRule object for the AcopSlipPatternRule (7421).
DBRule makeAcopTableBRow(long long ruleId,
                         int rowNum,
                         const std::string& clause,
                         const std::string& pattern,
                         const std::string& slipStation,
                         int priority,
                         const std::string& dutyBefore,
                         const std::string& dutyAfter,
                         const std::string& reportTimeWindow,
                         const std::string& prevSlipLocalNights,
                         const std::string& prevSlipHadStandby,
                         const std::string& minSlipHours,
                         const std::string& minSlipLocalNights,
                         const std::string& dutyAfterHours,
                         const std::string& dutyAfterLocalNights,
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
    rule.params["Previous Slip Local Nights"] = prevSlipLocalNights;
    rule.params["Previous Slip had standby"] = prevSlipHadStandby;
    rule.params["Min slip hours"] = minSlipHours;
    rule.params["Min slip local nights"] = minSlipLocalNights;
    rule.params["Min Slip Dep Time after LN"] = "*";
    rule.params["Duty After Hours"] = dutyAfterHours;
    rule.params["Duty After Local Nights"] = dutyAfterLocalNights;
    rule.params["Duty Time After LN"] = dutyAfterLocalTime;
    rule.params["Max Standby periods"] = maxStandbyPeriods;
    rule.params["Max standby hours"] = maxStandbyHours;
    rule.params["Allowed duty within slip"] = allowedDutyWithinSlip;
    rule.params["DO after duty"] = doAfterDuty;
    rule.params["Extra Condition"] = extraCondition;
    return rule;
}

// Cleanup helper for violations.
void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

// Creates a data context with necessary airport information.
std::shared_ptr<CrewDataContext> makeCtxWithAirports() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);

    auto add = [&](const char* code, const char* country, const char* category) {
        auto* a = new DBAirport();
        std::strncpy(a->airport, code, 3);
        a->airport[3] = '\0';
        std::strncpy(a->country, country, 2);
        a->country[2] = '\0';
        a->category = category;
        ctx->airportCodeMap[code] = a;
    };

    add("SIN", "SG", "SEA");
    add("CHC", "NZ", "NZL"); 

    ctx->airportUtcOffsetMap["SIN"] = 480;
    ctx->airportUtcOffsetMap["CHC"] = 780; // Assuming NZST/NZDT is UTC+13

	ctx->airportZoneIdMap["SIN"] = "Asia/Singapore"; 
	ctx->airportZoneIdMap["CHC"] = "Pacific/Auckland";

    return ctx;
}

}  // namespace

// Test fixture for SIA 5.8 (3d) Part 2 rule tests.
class Sia583dPart2Test : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
        for (auto& kv : _ctx->airportCodeMap) {
            delete kv.second;
        }
        _ctx->airportCodeMap.clear();
    }

    void SetUp() override {
        _ctx = makeCtxWithAirports();
        
        // As per the user request, define the rule parameters for both parts of (3)(d).
        // Part 1: Fly SIN-NZ, slip 2LN, then SBY (max 2 periods, 6h)
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "(3)(d) part 1", "SIN-NZ-SIN", "NZ", 1,
            "FLY|MVO", "*", "18:00-24:00", "*", "*", "*", "2", "*", "*", "*", "2", "6", "*", "*", "*"));

        // Part 2: Position to NZ, slip 24h/1LN, then FLY or SBY (max 1 period, 6h)
        _input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "(3)(d) part 2", "SIN-NZ-SIN", "NZ", 1,
            "MVP", "FLY|MVO", "*", "*", "*", "24", "1", "24", "1", "*", "1", "6", "*", "*", "*"));
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
};

// Test Case: Legal scenario with 2 standby blocks of 3 hours each.
// This should be valid under "part 1" of the rule.
TEST_F(Sia583dPart2Test, Legal2x3hStandby) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: Duty 1 (Flight SIN-CHC) - Departs 18:01 LT SIN
    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-01 10:01:00", "2025-12-01 19:40:00", "FLY", true, _ctx.get()));
    duties.push_back(makeDuty({segStorage.back().get()}).release());

    // Day 2: Duty 2 (Standby 1)
    segStorage.push_back(makeSegment("CHC", "CHC", "2025-12-02 21:00:00", "2025-12-03 00:00:00", "SBY", false, _ctx.get())); // 10:00-13:00 LT
    duties.push_back(makeDuty({segStorage.back().get()}).release());

    // Day 2: Duty 3 (Standby 2)
    segStorage.push_back(makeSegment("CHC", "CHC", "2025-12-03 01:00:00", "2025-12-03 04:00:00", "SBY", false, _ctx.get())); // 14:00-17:00 LT
    duties.push_back(makeDuty({segStorage.back().get()}).release());
    
    // Day 3: Duty 4 (Flight CHC-SIN)
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-03 23:00:00", "2025-12-04 09:00:00", "FLY", true, _ctx.get())); // 12:00 LT CHC -> 17:00 LT SIN
    duties.push_back(makeDuty({segStorage.back().get()}).release());
    
    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());

    for (auto* d : duties) delete d;
}

// Test Case: Illegal scenario with 3 standby blocks of 2 hours each.
TEST_F(Sia583dPart2Test, Illegal3x2hStandby) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: Duty 1 (Flight SIN-CHC)
    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-01 10:01:00", "2025-12-01 19:40:00", "FLY", true, _ctx.get()));
    duties.push_back(makeDuty({segStorage.back().get()}).release());

    // Day 2: Standby duties
    segStorage.push_back(makeSegment("CHC", "CHC", "2025-12-02 21:00:00", "2025-12-02 23:00:00", "SBY", false, _ctx.get())); // 10:00-12:00 LT
    duties.push_back(makeDuty({segStorage.back().get()}).release());
    segStorage.push_back(makeSegment("CHC", "CHC", "2025-12-03 00:00:00", "2025-12-03 02:00:00", "SBY", false, _ctx.get())); // 13:00-15:00 LT
    duties.push_back(makeDuty({segStorage.back().get()}).release());
    segStorage.push_back(makeSegment("CHC", "CHC", "2025-12-03 03:00:00", "2025-12-03 05:00:00", "SBY", false, _ctx.get())); // 16:00-18:00 LT
    duties.push_back(makeDuty({segStorage.back().get()}).release());

    // Day 3: Flight CHC-SIN
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-03 23:00:00", "2025-12-04 09:00:00", "FLY", true, _ctx.get()));
    duties.push_back(makeDuty({segStorage.back().get()}).release());
    
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("max standby periods"), std::string::npos);

    for (auto* d : duties) delete d;
}

// Test Case: Illegal scenario with 1 standby block of 7 hours.
TEST_F(Sia583dPart2Test, Illegal1x7hStandby) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: Duty 1 (Flight SIN-CHC)
    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-01 10:01:00", "2025-12-01 19:40:00", "FLY", true, _ctx.get()));
    duties.push_back(makeDuty({segStorage.back().get()}).release());

    // Day 2: Standby duty
    segStorage.push_back(makeSegment("CHC", "CHC", "2025-12-02 21:00:00", "2025-12-03 04:00:00", "SBY", false, _ctx.get())); // 10:00-17:00 LT (7 hours)
    duties.push_back(makeDuty({segStorage.back().get()}).release());

    // Day 3: Flight CHC-SIN
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-03 23:00:00", "2025-12-04 09:00:00", "FLY", true, _ctx.get()));
    duties.push_back(makeDuty({segStorage.back().get()}).release());
    
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("max standby hours"), std::string::npos);

    for (auto* d : duties) delete d;
}

TEST_F(Sia583dPart2Test, IllegalStandbyHoursAndDutyAfterHoursEmitTwoViolations) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(7421999, 1, "dual failure", "SIN-NZ-SIN", "CHC", 1,
        "FLY|MVO", "*", "*", "*", "*", "*", "*", "21", "*", "*", "*", "6", "*", "*", "*", "SBY"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-01 10:01:00", "2025-12-01 19:40:00", "FLY", true, _ctx.get()));
    duties.push_back(makeDuty({segStorage.back().get()}).release());

    // 19:20 after slip start, so this violates the 21:00 duty-after threshold.
    // The 7-hour standby also violates the 06:00 max standby-hours cap.
    segStorage.push_back(makeSegment("CHC", "CHC", "2025-12-02 15:00:00", "2025-12-02 22:00:00", "SBY", false, _ctx.get()));
    duties.push_back(makeDuty({segStorage.back().get()}).release());

    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-03 23:00:00", "2025-12-04 09:00:00", "FLY", true, _ctx.get()));
    duties.push_back(makeDuty({segStorage.back().get()}).release());

    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 2u);

    int standbyCapCount = 0;
    int dutyAfterCount = 0;
    bool sawDetailedDutyAfterMessage = false;
    for (const auto* violation : _violationStorage) {
        if (violation == nullptr) {
            continue;
        }
        if (violation->violation_msg.find("max standby hours") != std::string::npos) {
            ++standbyCapCount;
        }
        if (violation->violation_msg.find("duty after hours") != std::string::npos) {
            ++dutyAfterCount;
            if (violation->violation_msg.find("standby duty (sequence ") != std::string::npos &&
                violation->violation_msg.find(" after slip start < min 21:00") != std::string::npos) {
                sawDetailedDutyAfterMessage = true;
            }
        }
    }

    EXPECT_EQ(standbyCapCount, 1);
    EXPECT_EQ(dutyAfterCount, 1);
    EXPECT_TRUE(sawDetailedDutyAfterMessage);

    for (auto* d : duties) delete d;
}
