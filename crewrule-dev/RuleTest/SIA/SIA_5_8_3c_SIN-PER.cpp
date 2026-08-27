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

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
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
    rule.reference = "SQ";
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

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

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
    add("PER", "AU", "AUS"); // Perth

    return ctx;
}

}  // namespace

class SIA_5_8_3c_SIN_PER : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
        _segStorage.clear();
        for (auto& kv : _ctx->airportCodeMap) {
            delete kv.second;
        }
        _ctx->airportCodeMap.clear();
    }

    void SetUp() override {
        _ctx = makeCtxWithAirports();
        
        _ruleInput.dbRules.push_back(makeAcopTableBRow(
            7421001,
            1,
            "(3)(c)",          // Clause
            "SIN–PER flight",  // COP / Applicability
            "PER",             // Slip station
            1,                 // Priority
            "FLY|MVO",         // Duty Assignment before slip
            "*",               // Duty Assignment after slip
            "18:00-24:00",     // Reporting time at base
            "*",               // Previous Slip Local Nights
            "*",               // Previous Slip had standby
            "10",              // Min slip hours
            "*",               // Min slip local nights
            "*", "*", "*", "*", "*", "*", "0", "*"));
    }

    void configureRule(AcopSlipPatternRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }

    // Helper to format time_t to string for segments
    static std::string formatTime(time_t t) {
        char buf[20];
        strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", gmtime(&t));
        return buf;
    }

    Segment* createSegment(const std::string& dep,
                           const std::string& arr,
                           const std::string& startUtc,
                           const std::string& endUtc,
                           const std::string& assignment,
                           bool isOperating) {
        auto seg = std::make_unique<Segment>();
        seg->setDepStation(dep);
        seg->setArrStation(arr);
        seg->setFleetCD("SQ");
        seg->setFlightNumber("215");  // generic flight number for test
        seg->setAssignment(assignment);
        seg->setIsOperating(isOperating);

        const time_t start = utcFromString(startUtc);
        const time_t end = utcFromString(endUtc);

        seg->setStartTimeUtcAct(start);
        seg->setEndTimeUtcAct(end);
        seg->setStartTimeUtcSch(start);
        seg->setEndTimeUtcSch(end);

        // For unit tests, treat local time as UTC (SIN and PER are both UTC+8).
        seg->setStartTimeLocAct(start);
        seg->setEndTimeLocAct(end);
        seg->setStartTimeLocSch(start);
        seg->setEndTimeLocSch(end);

        _segStorage.push_back(std::move(seg));
        return _segStorage.back().get();
    }

    // Create one duty containing SIN-PER and PER-SIN in the same duty (no slip at PER).
    std::unique_ptr<Duty> createTurnaroundDuty(time_t reportTimeLocal) {
        std::vector<Segment*> segments;

        // Flight 1: SIN-PER
        time_t flight1StartLocal = reportTimeLocal + (1 * 3600);
        time_t flight1EndLocal = flight1StartLocal + (4 * 3600) + (56 * 60);
        segments.push_back(createSegment("SIN",
                                         "PER",
                                         formatTime(flight1StartLocal),
                                         formatTime(flight1EndLocal),
                                         "FLY",
                                         true));

        // Ground time in PER (1 hour turnaround)
        time_t flight2StartLocal = flight1EndLocal + (1 * 3600);
        time_t flight2EndLocal = flight2StartLocal + (4 * 3600) + (45 * 60);
        segments.push_back(createSegment("PER",
                                         "SIN",
                                         formatTime(flight2StartLocal),
                                         formatTime(flight2EndLocal),
                                         "FLY",
                                         true));

        // Duty end: last flight end + 30 min debrief + 1 hr transportation
        time_t dutyEndLocal = flight2EndLocal + (30 * 60) + (1 * 3600);

        auto duty = std::make_unique<Duty>(segments);
        duty->setStartTimeLocAct(reportTimeLocal);
        duty->setEndTimeLocAct(dutyEndLocal);
        duty->setStartTimeUtcAct(reportTimeLocal);
        duty->setEndTimeUtcAct(dutyEndLocal);
        duty->setDepartureStation("SIN");
        duty->setArrivalStation("SIN");
        return duty;
    }

    RuleInput _ruleInput;
    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<std::unique_ptr<Segment>> _segStorage;
    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
};

TEST_F(SIA_5_8_3c_SIN_PER, SinPerTurn_Legal_Reporting1759) {
    // This test case corresponds to "Legal, out of window"
    // The pairing's duty reports at 17:59, which is outside the prohibited 18:00-24:00 window.
    
    AcopSlipPatternRule rule(nullptr, _ruleInput);
    configureRule(rule);

    // Reporting at 2025-12-25 17:59:00 local time
    auto duty = createTurnaroundDuty(utcFromString("2025-12-25 17:59:00"));
    
    std::vector<Duty*> duties{duty.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(SIA_5_8_3c_SIN_PER, SinPerTurn_Illegal_Reporting1800) {
    // This test case corresponds to "Illegal to turn"
    // The pairing's duty reports at 18:00, which is inside the prohibited 18:00-24:00 window.
    
    AcopSlipPatternRule rule(nullptr, _ruleInput);
    configureRule(rule);

    // Reporting at 2025-12-25 18:00:00 local time
    auto duty = createTurnaroundDuty(utcFromString("2025-12-25 18:00:00"));
    
    std::vector<Duty*> duties{duty.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("must end at slip station"), std::string::npos);
}

TEST_F(SIA_5_8_3c_SIN_PER, SinPerTurn_Illegal_Reporting2359) {
    // This test case corresponds to the second "Illegal to turn" (originally 00:00LT)
    // The pairing's duty reports at 23:59, which is inside the prohibited 18:00-24:00 window.
    
    AcopSlipPatternRule rule(nullptr, _ruleInput);
    configureRule(rule);

    // Reporting at 2025-12-25 23:59:00 local time
    auto duty = createTurnaroundDuty(utcFromString("2025-12-25 23:59:00"));
    
    std::vector<Duty*> duties{duty.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("must end at slip station"), std::string::npos);
}
