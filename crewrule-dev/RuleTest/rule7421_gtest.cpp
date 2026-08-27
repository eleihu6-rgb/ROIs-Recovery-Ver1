#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7421/AcopSlipPatternRule.h"
#include "RuleEngine/rule/rule7421/AcopSlipPatternRuleParam.h"

#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"

#include <cstring>
#include <atomic>
#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& assignment,
                                     bool isOperating) {
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

    // For unit tests, treat local time as UTC.
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeLocSch(start);
    seg->setEndTimeLocSch(end);

    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments,
                               const std::string& depStation,
                               const std::string& arrStation,
                               const std::string& startLoc,
                               const std::string& endLoc) {
    auto duty = std::make_unique<Duty>(segments);
    const time_t start = utcFromString(startLoc);
    const time_t end = utcFromString(endLoc);

    duty->setStartTimeLocAct(start);
    duty->setEndTimeLocAct(end);
    duty->setStartTimeUtcAct(start);
    duty->setEndTimeUtcAct(end);

    const int fdpMinutes = (end > start) ? static_cast<int>((end - start) / 60) : 0;
    duty->setPlanFDP(fdpMinutes);
    duty->setActualFDP(fdpMinutes);

    duty->setDepartureStation(depStation);
    duty->setArrivalStation(arrStation);
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
                         const std::string& slipDepartDutyReportTime = "*",
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
    rule.params["Min Slip Dep Time after LN"] = slipDepartDutyReportTime;
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

    auto add = [&](const char* code, const char* country, const char* category, const char* city = nullptr) {
        auto* a = new DBAirport();
        std::strncpy(a->airport, code, 3);
        a->airport[3] = '\0';
        std::strncpy(a->country, country, 2);
        a->country[2] = '\0';
        const char* cityCode = (city != nullptr && std::strlen(city) >= 3) ? city : code;
        std::strncpy(a->city, cityCode, 3);
        a->city[3] = '\0';
        a->category = category;
        ctx->airportCodeMap[code] = a;
    };

    add("SIN", "SG", "SEA");
    add("HKG", "HK", "SEA");
    add("SYD", "AU", "AUS");
    add("ADL", "AU", "AUS");
    add("MEL", "AU", "AUS");
    add("FRA", "DE", "EUR");
    add("LHR", "GB", "EUR", "LON");
    add("CDG", "FR", "EUR", "PAR");
    add("JFK", "US", "NOA", "NYC");
    add("EWR", "US", "NOA", "NYC");
    add("LAX", "US", "NOA", "LAX");
    add("AKL", "NZ", "NZL");
    add("CHC", "NZ", "NZL");

    return ctx;
}

}  // namespace

class Rule7421Test : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
        // CrewDataContext owns DBAirport pointers and does not delete them; free for tests.
        for (auto& kv : _ctx->airportCodeMap) {
            delete kv.second;
        }
        _ctx->airportCodeMap.clear();
    }

    void SetUp() override {
        _ctx = makeCtxWithAirports();
    }

    void configureRule(AcopSlipPatternRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }

    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
};

namespace {

DBRule makeAcopTableBRowWithDutyAssignmentFilters(long long ruleId,
                                                 int rowNum,
                                                 const std::string& clause,
                                                 const std::string& pattern,
                                                 const std::string& slipStation,
                                                 int priority,
                                                 const std::string& dutyBeforeFilter,
                                                 const std::string& dutyAfterFilter,
                                                 const std::string& minSlipHours,
                                                 const std::string& minSlipLocalNights,
                                                 const std::string& dutyAfterHours,
                                                 const std::string& dutyAfterLocalNights,
                                                 const std::string& maxStandbyHours) {
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
    rule.params["Group"] = "ULR";
    rule.params["Priority"] = std::to_string(priority);
    rule.params["Slip Arr Is Operating"] = "*";
    rule.params["Slip Dep Is Operating"] = "*";
    rule.params["Duty Assignment before slip"] = dutyBeforeFilter;
    rule.params["Duty Assignment after slip"] = dutyAfterFilter;
    rule.params["Reporting time at base"] = "*";
    rule.params["Previous Slip Local Nights"] = "*";
    rule.params["Previous Slip had standby"] = "*";
    rule.params["Min slip hours"] = minSlipHours;
    rule.params["Min slip local nights"] = minSlipLocalNights;
    rule.params["Max slip hours"] = "*";
    rule.params["Min Slip Dep Time after LN"] = "*";
    rule.params["Duty After Hours"] = dutyAfterHours;
    rule.params["Duty After Local Nights"] = dutyAfterLocalNights;
    rule.params["Duty Time After LN"] = "*";
    rule.params["Max Standby periods"] = "*";
    rule.params["Max standby hours"] = maxStandbyHours;
    rule.params["Allowed duty within slip"] = "*";
    rule.params["DO after duty"] = "0";
    rule.params["Extra Condition"] = "*";
    return rule;
}

DBRule makeUlr7405Row(long long ruleId,
                      int rowNum,
                      const std::string& dep,
                      const std::string& arr,
                      const std::string& fleet,
                      const std::string& fleetGroup) {
    DBRule row{};
    row.idRule = ruleId;
    row.function = RULES::ANR_ULR_DUTY_DEFINITION;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.idRuleParam = 740500000 + rowNum;
    row.params["DEP"] = dep;
    row.params["ARR"] = arr;
    row.params["Fleet"] = fleet;
    row.params["Fleet Group"] = fleetGroup;
    row.params["Effective Date"] = "*";
    row.params["Expiry Date"] = "*";
    return row;
}

}  // namespace

TEST(LocationExprTest, MatchesCountryExceptAirportOrOtherCountry) {
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

    add("SYD", "AU", "AUS");
    add("PER", "AU", "AUS");
    add("AKL", "NZ", "NZL");
    add("SIN", "SG", "SEA");

    const auto expr = AcopLocationExpr::Parse("(AU~PER)|NZ");
    EXPECT_TRUE(expr.MatchesAirport("SYD", ctx.get()));
    EXPECT_FALSE(expr.MatchesAirport("PER", ctx.get()));
    EXPECT_TRUE(expr.MatchesAirport("AKL", ctx.get()));
    EXPECT_FALSE(expr.MatchesAirport("SIN", ctx.get()));

    for (auto& kv : ctx->airportCodeMap) {
        delete kv.second;
    }
    ctx->airportCodeMap.clear();
}

TEST(LocationExprTest, ExplicitWildcardTokenStillMatchesAnyAirport) {
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

    add("LHR", "GB", "EUR");
    add("SIN", "SG", "SEA");

    const auto expr = AcopLocationExpr::Parse("LHR|*");
    EXPECT_TRUE(expr.MatchesAirport("LHR", ctx.get()));
    EXPECT_TRUE(expr.MatchesAirport("SIN", ctx.get()));

    for (auto& kv : ctx->airportCodeMap) {
        delete kv.second;
    }
    ctx->airportCodeMap.clear();
}

TEST(LocationExprTest, TrailingOrDoesNotExpandToWildcard) {
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

    add("FCO", "IT", "EUR");
    add("BRU", "BE", "EUR");
    add("IST", "TR", "IST");
    add("LHR", "GB", "EUR");

    const auto expr = AcopLocationExpr::Parse("(FCO|BRU|IST|)");
    EXPECT_TRUE(expr.MatchesAirport("FCO", ctx.get()));
    EXPECT_TRUE(expr.MatchesAirport("BRU", ctx.get()));
    EXPECT_TRUE(expr.MatchesAirport("IST", ctx.get()));
    EXPECT_FALSE(expr.MatchesAirport("LHR", ctx.get()));

    for (auto& kv : ctx->airportCodeMap) {
        delete kv.second;
    }
    ctx->airportCodeMap.clear();
}

TEST(LocationExprTest, DoubleOrIgnoresEmptyOperand) {
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

    add("FCO", "IT", "EUR");
    add("IST", "TR", "IST");
    add("LHR", "GB", "EUR");

    const auto expr = AcopLocationExpr::Parse("FCO||IST");
    EXPECT_TRUE(expr.MatchesAirport("FCO", ctx.get()));
    EXPECT_TRUE(expr.MatchesAirport("IST", ctx.get()));
    EXPECT_FALSE(expr.MatchesAirport("LHR", ctx.get()));

    for (auto& kv : ctx->airportCodeMap) {
        delete kv.second;
    }
    ctx->airportCodeMap.clear();
}

TEST(LocationExprTest, TrailingOrInDiffRhsDoesNotCollapseToAny) {
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

    add("LHR", "GB", "EUR");
    add("FCO", "IT", "EUR");
    add("SIN", "SG", "SEA");

    const auto expr = AcopLocationExpr::Parse("REUR~(FCO|BRU|IST|)");
    EXPECT_TRUE(expr.MatchesAirport("LHR", ctx.get()));
    EXPECT_FALSE(expr.MatchesAirport("FCO", ctx.get()));
    EXPECT_FALSE(expr.MatchesAirport("SIN", ctx.get()));

    for (auto& kv : ctx->airportCodeMap) {
        delete kv.second;
    }
    ctx->airportCodeMap.clear();
}

TEST(LocationExprTest, MissingDiffOperandIsInvalidAndMatchesNothing) {
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

    add("LHR", "GB", "EUR");
    add("SIN", "SG", "SEA");

    const auto missingRhs = AcopLocationExpr::Parse("REUR~");
    EXPECT_FALSE(missingRhs.MatchesAirport("LHR", ctx.get()));
    EXPECT_FALSE(missingRhs.MatchesAirport("SIN", ctx.get()));

    const auto missingLhs = AcopLocationExpr::Parse("~REUR");
    EXPECT_FALSE(missingLhs.MatchesAirport("LHR", ctx.get()));
    EXPECT_FALSE(missingLhs.MatchesAirport("SIN", ctx.get()));

    for (auto& kv : ctx->airportCodeMap) {
        delete kv.second;
    }
    ctx->airportCodeMap.clear();
}

TEST_F(Rule7421Test, SlipArrFlightNoMatchesAlphaPrefixedToken) {
    DBRule row{};
    row.function = 7421;
    row.tableNum = 1;
    row.params["Slip Arr Flight No"] = "SQ26";

    AcopSlipPatternRuleParam param(nullptr);
    param.ParseParam(row);

    _ctx->scenario.airline = "CX";

    auto seg = makeSegment("FRA", "JFK", "2025-01-01 00:00:00", "2025-01-01 06:00:00", "FLY", true);
    seg->setAirline("SQ");
    seg->setFlightNumber("26");
    std::vector<Segment*> segments{seg.get()};
    auto duty = makeDuty(segments, "FRA", "JFK", "2025-01-01 00:00:00", "2025-01-01 06:00:00");

    EXPECT_TRUE(param.MatchesSlipArrFlightNo(*duty, _ctx.get()));

    seg->setFlightNumber("27");
    EXPECT_FALSE(param.MatchesSlipArrFlightNo(*duty, _ctx.get()));
}

TEST_F(Rule7421Test, SlipArrFlightNoNumericTokenUsesScenarioAirline) {
    DBRule row{};
    row.function = 7421;
    row.tableNum = 1;
    row.params["Slip Arr Flight No"] = "26/285";

    AcopSlipPatternRuleParam param(nullptr);
    param.ParseParam(row);

    auto seg = makeSegment("SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true);
    seg->setAirline("SQ");
    seg->setFlightNumber("285");
    std::vector<Segment*> segments{seg.get()};
    auto duty = makeDuty(segments, "SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    _ctx->scenario.airline = "SQ";
    EXPECT_TRUE(param.MatchesSlipArrFlightNo(*duty, _ctx.get()));

    _ctx->scenario.airline = "CX";
    EXPECT_FALSE(param.MatchesSlipArrFlightNo(*duty, _ctx.get()));
}

TEST_F(Rule7421Test, SlipDepFlightNoMatchesAlphaPrefixedToken) {
    DBRule row{};
    row.function = 7421;
    row.tableNum = 1;
    row.params["Slip Dep Flight No"] = "SQ865";

    AcopSlipPatternRuleParam param(nullptr);
    param.ParseParam(row);

    _ctx->scenario.airline = "CX";

    auto seg = makeSegment("HKG", "SIN", "2025-01-02 00:00:00", "2025-01-02 04:00:00", "FLY", true);
    seg->setAirline("SQ");
    seg->setFlightNumber("865");
    std::vector<Segment*> segments{seg.get()};
    auto duty = makeDuty(segments, "HKG", "SIN", "2025-01-02 00:00:00", "2025-01-02 04:00:00");

    EXPECT_TRUE(param.MatchesSlipDepFlightNo(*duty, _ctx.get()));

    seg->setFlightNumber("866");
    EXPECT_FALSE(param.MatchesSlipDepFlightNo(*duty, _ctx.get()));
}

TEST_F(Rule7421Test, SlipDepFlightNoNumericTokenUsesScenarioAirline) {
    DBRule row{};
    row.function = 7421;
    row.tableNum = 1;
    row.params["Slip Dep Flight No"] = "865/866";

    AcopSlipPatternRuleParam param(nullptr);
    param.ParseParam(row);

    auto seg = makeSegment("HKG", "SIN", "2025-01-02 00:00:00", "2025-01-02 04:00:00", "FLY", true);
    seg->setAirline("SQ");
    seg->setFlightNumber("866");
    std::vector<Segment*> segments{seg.get()};
    auto duty = makeDuty(segments, "HKG", "SIN", "2025-01-02 00:00:00", "2025-01-02 04:00:00");

    _ctx->scenario.airline = "SQ";
    EXPECT_TRUE(param.MatchesSlipDepFlightNo(*duty, _ctx.get()));

    _ctx->scenario.airline = "CX";
    EXPECT_FALSE(param.MatchesSlipDepFlightNo(*duty, _ctx.get()));
}

TEST_F(Rule7421Test, SlipDepFlightNoFiltersApplicableRows) {
    RuleInput input;
    auto row = makeAcopTableBRow(
        7421001,
        1,
        "(dep-flight-filter)",
        "SIN-HKG-SIN",
        "HKG",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "24",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*");
    row.params["Slip Dep Flight No"] = "865";
    input.dbRules.push_back(row);

    auto runCase = [&](const std::string& departFlightNo, bool expectViolation) {
        std::vector<std::unique_ptr<Segment>> segStorage;

        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "HKG", "2025-01-01 00:00:00", "2025-01-01 04:00:00", "FLY", true));
        segStorage.back()->setAirline("SQ");
        segStorage.back()->setFlightNumber("860");
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "HKG", "2025-01-01 00:00:00", "2025-01-01 04:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("HKG", "SIN", "2025-01-01 20:00:00", "2025-01-02 00:00:00", "FLY", true));
        segStorage.back()->setAirline("SQ");
        segStorage.back()->setFlightNumber(departFlightNo);
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "HKG", "SIN", "2025-01-01 20:00:00", "2025-01-02 00:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);
        AcopSlipPatternRule rule(nullptr, input);
        configureRule(rule);

        if (expectViolation) {
            EXPECT_FALSE(rule.CheckRule(&pairing));
            ASSERT_EQ(_violationStorage.size(), 1u);
            EXPECT_NE(_violationStorage.front()->violation_msg.find("min slip hours"), std::string::npos);
            deleteViolations(_violationStorage);
        } else {
            EXPECT_TRUE(rule.CheckRule(&pairing));
            EXPECT_TRUE(_violationStorage.empty());
        }
    };

    _ctx->scenario.airline = "SQ";

    runCase("865", true);
    runCase("866", false);
}

TEST_F(Rule7421Test, MelSlipRequiresTwoLocalNightsForSingleFdpSequence) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        1,
        "(3)(b)",
        "SIN-ADL-MEL in single FDP",
        "MEL",
        1,
        "FLY|MVO",
        "*",
        "18:00-04:00",
        "*",
        "*",
        "*",
        "2",
        "*",
        "*",
        "*",
        "2",
        "6",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "ADL", "2025-01-01 19:00:00", "2025-01-01 23:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment("ADL", "MEL", "2025-01-02 00:00:00", "2025-01-02 02:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 19:00:00", "2025-01-02 02:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    const std::string msg = _violationStorage.front()->violation_msg;
    EXPECT_NE(msg.find("min slip local nights"), std::string::npos);
    EXPECT_NE(msg.find("local nights"), std::string::npos);
    EXPECT_NE(msg.find("< min 2"), std::string::npos);
}

TEST_F(Rule7421Test, EurReturnUsesMoreSpecificPrevSlipThresholdRow) {
    RuleInput input;
    // If previous slip (RNOA) >= 1 LN => require 2 LNs at REUR 2
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        1,
        "6(c)",
        "SIN-REUR-RNOA-REUR-SIN",
        "REUR 2",
        1,
        "*",
        "*",
        "*",
        "1",
        "*",
        "*",
        "2",
        "*",
        "*",
        "*",
        "2",
        "6",
        "*",
        "0",
        "*"));
    // If previous slip (RNOA) >= 2 LNs => require 1 LN at REUR 2
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        2,
        "6(c)",
        "SIN-REUR-RNOA-REUR-SIN",
        "REUR 2",
        1,
        "*",
        "*",
        "*",
        "2",
        "*",
        "*",
        "1",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // SIN -> FRA
    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 20:00:00", "2025-01-02 08:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "FRA", "2025-01-01 20:00:00", "2025-01-02 08:00:00");

    // FRA -> JFK (depart after long slip in FRA)
    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("FRA", "JFK", "2025-01-04 10:00:00", "2025-01-04 18:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "FRA", "JFK", "2025-01-04 10:00:00", "2025-01-04 18:00:00");

    // JFK -> FRA (depart after 2+ local nights in JFK)
    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("JFK", "FRA", "2025-01-07 10:00:00", "2025-01-07 18:00:00", "FLY", true));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "JFK", "FRA", "2025-01-07 10:00:00", "2025-01-07 18:00:00");

    // FRA -> SIN (depart after 1 local night in FRA; should match the >=2 previous-slip row that requires only 1 LN)
    std::vector<Segment*> segs3;
    segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-09 10:00:00", "2025-01-09 20:00:00", "FLY", true));
    segs3.push_back(segStorage.back().get());
    auto duty3 = makeDuty(segs3, "FRA", "SIN", "2025-01-09 10:00:00", "2025-01-09 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, MinSlipHoursUsesPickupAndDropoffByDefault) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        20,
        "X",
        "SIN-AKL-SIN",
        "AKL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "24",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 02:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 02:00:00");
    duty0->setMinDropoff(60);
    duty0->setActualDropoffMin(60);

    // by default, includes

    // Gap between duty end and next duty start is 26h20m; subtract dropoff(90m) and pickup(60m) => 23h50m < 24h.
    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("AKL", "SIN", "2025-01-02 03:20:00", "2025-01-02 11:20:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "AKL", "SIN", "2025-01-02 02:20:00", "2025-01-02 11:20:00");
    duty1->setMinPickup(0);
    duty1->setActualPickupMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    const std::string msg = _violationStorage.front()->violation_msg;
    EXPECT_NE(msg.find("min slip hours"), std::string::npos);
    EXPECT_NE(msg.find("effective rest"), std::string::npos);
    EXPECT_NE(msg.find("24:00"), std::string::npos);
}

TEST_F(Rule7421Test, MinSlipHoursSupportsMinutes) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        22,
        "X",
        "SIN-AKL-SIN",
        "AKL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "10:30",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 02:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 02:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("AKL", "SIN", "2025-01-01 12:15:00", "2025-01-01 20:15:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "AKL", "SIN", "2025-01-01 12:15:00", "2025-01-01 20:15:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    const std::string msg = _violationStorage.front()->violation_msg;
    EXPECT_NE(msg.find("min slip hours"), std::string::npos);
    EXPECT_NE(msg.find("10:30"), std::string::npos);
}

TEST_F(Rule7421Test, RestStartsAfterDebriefControlCountsTransportAsRest) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        21,
        "X",
        "SIN-AKL-SIN",
        "AKL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "24",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    DBRule control{};
    control.idRule = 7421001;
    control.function = 7421;
    control.tableNum = 2;
    control.rowNum = 1;
    control.params["REST STARTS AFTER"] = "DEBRIEF";
    input.dbRules.push_back(control);

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 01:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 01:00:00");
    duty0->setMinDropoff(90);
    duty0->setActualDropoffMin(90);

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("AKL", "SIN", "2025-01-02 03:20:00", "2025-01-02 11:20:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "AKL", "SIN", "2025-01-02 03:20:00", "2025-01-02 11:20:00");
    duty1->setMinPickup(60);
    duty1->setActualPickupMin(60);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, DutyAfterHoursDoesNotApplyToDepartDutyOutsideSlip) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        10,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "24",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-01 18:00:00", "2025-01-02 02:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "SIN", "2025-01-01 18:00:00", "2025-01-02 02:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, StandbyDutyWithinSlipViolatesDutyAfterHours) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        11,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "24",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00", "SBY", false));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_EQ(_violationStorage.front()->startDTUtc, utcFromString("2025-01-01 18:00:00"));
    EXPECT_NE(_violationStorage.front()->violation_msg.find("internal duty within slip"), std::string::npos);
}

TEST_F(Rule7421Test, DutyAfterTargetsStandbyOnlyWhenStandbyCapsConfigured) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        111,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "24",
        "*",
        "*",
        "1",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    // Internal non-standby duty starts before 24h, but this row targets duty-after to standby only.
    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, DutyAfterTargetsAllowedDutyOnlyWhenAllowedDutyConfigured) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        112,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "24",
        "*",
        "*",
        "*",
        "*",
        "FDP <=6h",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    // Internal standby duty starts before 24h, but this row targets duty-after to allowed non-standby duties only.
    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00", "SBY", false));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00");
    duty1->setAssignment("SBY");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, DutyAfterTargetsBothStandbyAndAllowedDutyWhenBothConfigured_StandbyViolation) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        113,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "24",
        "*",
        "*",
        "1",
        "*",
        "FDP <=6h",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    // Standby duty violates duty-after hours.
    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00", "SBY", false));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00");
    duty1->setAssignment("SBY");

    // Allowed non-standby duty is after threshold and should not fail.
    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("MEL", "ADL", "2025-01-02 14:00:00", "2025-01-02 16:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "MEL", "ADL", "2025-01-02 14:00:00", "2025-01-02 16:00:00");

    std::vector<Segment*> segsDuty3;
    segStorage.push_back(makeSegment("ADL", "SIN", "2025-01-03 12:00:00", "2025-01-03 20:00:00", "FLY", true));
    segsDuty3.push_back(segStorage.back().get());
    auto duty3 = makeDuty(segsDuty3, "ADL", "SIN", "2025-01-03 12:00:00", "2025-01-03 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_EQ(_violationStorage.front()->startDTUtc, utcFromString("2025-01-01 18:00:00"));
}

TEST_F(Rule7421Test, DutyAfterTargetsBothStandbyAndAllowedDutyWhenBothConfigured_AllowedDutyViolation) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        114,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "24",
        "*",
        "*",
        "1",
        "*",
        "FDP <=6h",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    // Allowed non-standby duty within slip violates duty-after hours.
    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_EQ(_violationStorage.front()->startDTUtc, utcFromString("2025-01-01 18:00:00"));
}

TEST_F(Rule7421Test, TotalStandbyHoursWithinSlipCappedByMaxStandbyHours) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        13,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "6",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 12:00:00", "2025-01-01 16:00:00", "SBY", false));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 12:00:00", "2025-01-01 16:00:00");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 22:00:00", "SBY", false));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 22:00:00");

    std::vector<Segment*> segsDuty3;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty3.push_back(segStorage.back().get());
    auto duty3 = makeDuty(segsDuty3, "MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    const std::string msg = _violationStorage.front()->violation_msg;
    EXPECT_NE(msg.find("internal standby caps"), std::string::npos);
    EXPECT_NE(msg.find("standby time"), std::string::npos);
    EXPECT_NE(msg.find("08:00"), std::string::npos);
    EXPECT_NE(msg.find("06:00"), std::string::npos);
}

TEST_F(Rule7421Test, StandbySegmentHoursAreSummedForMaxStandbyHours) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        14,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "6",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 12:00:00", "2025-01-01 15:00:00", "SBY", false));
    segsDuty1.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 16:00:00", "2025-01-01 19:00:00", "SBY", false));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 12:00:00", "2025-01-01 19:00:00");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, MalformedOutboundStandbyDoesNotEndSlipBeforeStandbyCaps) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        14,
        "X",
        "SIN-NZ-SIN",
        "NZ",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*"));
    input.dbRules.back().params["Reporting time at base"] = "*";
    input.dbRules.back().params["Departure time at base"] = "*";
    input.dbRules.back().params["Max Standby periods"] = "2";
    input.dbRules.back().params["Max standby hours"] = "6";
    input.dbRules.back().params["DO after duty"] = "0";

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-04 00:00:00", "2025-12-04 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "CHC", "2025-12-04 00:00:00", "2025-12-04 10:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-05 12:00:00", "2025-12-05 14:00:00", "SBY", false));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "CHC", "SIN", "2025-12-05 12:00:00", "2025-12-05 14:00:00");
    duty1->setAssignment("SBY");
    duty1->setActualDP(120);

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-05 16:00:00", "2025-12-05 18:00:00", "SBY", false));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "CHC", "SIN", "2025-12-05 16:00:00", "2025-12-05 18:00:00");
    duty2->setAssignment("SBY");
    duty2->setActualDP(120);

    std::vector<Segment*> segsDuty3;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-05 20:00:00", "2025-12-05 22:00:00", "SBY", false));
    segsDuty3.push_back(segStorage.back().get());
    auto duty3 = makeDuty(segsDuty3, "CHC", "SIN", "2025-12-05 20:00:00", "2025-12-05 22:00:00");
    duty3->setAssignment("SBY");
    duty3->setActualDP(120);

    std::vector<Segment*> segsDuty4;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-06 12:00:00", "2025-12-06 20:00:00", "FLY", true));
    segsDuty4.push_back(segStorage.back().get());
    auto duty4 = makeDuty(segsDuty4, "CHC", "SIN", "2025-12-06 12:00:00", "2025-12-06 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get(), duty4.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    const std::string msg = _violationStorage.front()->violation_msg;
    EXPECT_NE(msg.find("max standby periods"), std::string::npos);
    EXPECT_NE(msg.find("standby periods 3 > max 2"), std::string::npos);
}

TEST_F(Rule7421Test, FlightDutyWithinSlipViolatesAllowedDutyWithinSlip) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        12,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "POS | FDP <=6h",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "ADL", "2025-01-01 20:00:00", "2025-01-02 00:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment("ADL", "MEL", "2025-01-02 00:30:00", "2025-01-02 04:30:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 20:00:00", "2025-01-02 04:30:00");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-03 10:00:00", "2025-01-03 18:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-03 10:00:00", "2025-01-03 18:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_EQ(_violationStorage.front()->startDTUtc, utcFromString("2025-01-01 20:00:00"));
    EXPECT_NE(_violationStorage.front()->violation_msg.find("allowed duty within slip"), std::string::npos);
}

TEST_F(Rule7421Test, AllowedDutyNoneDisallowsInternalNonStandbyDuty) {
    const std::vector<std::string> tokens{"NONE", "NO"};
    for (const auto& token : tokens) {
        RuleInput input;
        input.dbRules.push_back(makeAcopTableBRow(
            7421001,
            13,
            "X",
            "*",
            "MEL",
            1,
            "*",
            "*",
            "*",
            "*",
            "*",
            "0",
            "0",
            "*",
            "*",
            "*",
            "*",
            "*",
            token,
            "0",
            "*"));

        AcopSlipPatternRule rule(nullptr, input);
        configureRule(rule);

        std::vector<std::unique_ptr<Segment>> segStorage;

        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "ADL", "2025-01-01 20:00:00", "2025-01-02 00:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        segStorage.push_back(makeSegment("ADL", "MEL", "2025-01-02 00:30:00", "2025-01-02 04:30:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 20:00:00", "2025-01-02 04:30:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-03 10:00:00", "2025-01-03 18:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-03 10:00:00", "2025-01-03 18:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing)) << "Expected violation for token: " << token;
        ASSERT_EQ(_violationStorage.size(), 1u);
        EXPECT_NE(_violationStorage.front()->violation_msg.find("allowed duty within slip"), std::string::npos);

        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }
}

TEST_F(Rule7421Test, AllowedDutyNoneDoesNotBlockStandby) {
    const std::vector<std::string> tokens{"NONE", "NO"};
    for (const auto& token : tokens) {
        RuleInput input;
        input.dbRules.push_back(makeAcopTableBRow(
            7421001,
            14,
            "X",
            "*",
            "MEL",
            1,
            "*",
            "*",
            "*",
            "*",
            "*",
            "0",
            "0",
            "*",
            "*",
            "*",
            "*",
            "*",
            token,
            "0",
            "*"));

        AcopSlipPatternRule rule(nullptr, input);
        configureRule(rule);

        std::vector<std::unique_ptr<Segment>> segStorage;

        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 20:00:00", "2025-01-01 23:00:00", "SBY", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 20:00:00", "2025-01-01 23:00:00");
        duty1->setAssignment("SBY");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 10:00:00", "2025-01-02 18:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-02 10:00:00", "2025-01-02 18:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing)) << "Standby should be allowed for token: " << token;
        EXPECT_TRUE(_violationStorage.empty());

        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }
}

TEST_F(Rule7421Test, AllowedDutyPosInRegionEurope) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        20,
        "X",
        "*",
        "FRA",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "POS in REUR",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

    std::vector<Segment*> segsDuty1;
    // Use DHD to produce duty assignment "MVP" via Duty::calcAssignment.
    segStorage.push_back(makeSegment("FRA", "FRA", "2025-01-01 20:00:00", "2025-01-01 22:00:00", "DHD", false));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "FRA", "FRA", "2025-01-01 20:00:00", "2025-01-01 22:00:00");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-02 10:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "FRA", "SIN", "2025-01-02 10:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, AllowedDutyDutyInRegionNorthAmerica) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        21,
        "X",
        "*",
        "JFK",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "DUTY in RNOA",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 12:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 12:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("JFK", "JFK", "2025-01-01 20:00:00", "2025-01-01 22:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "JFK", "JFK", "2025-01-01 20:00:00", "2025-01-01 22:00:00");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("JFK", "SIN", "2025-01-02 10:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "JFK", "SIN", "2025-01-02 10:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, SlipDepartDutyReportTimeConstraint) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        30,
        "X",
        "SIN-MEL-SIN",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "1",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*",
        "06:00"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing 1: depart duty starts before 06:00 -> illegal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 10:00:00", "2025-01-01 18:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 10:00:00", "2025-01-01 18:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 05:59:00", "2025-01-02 13:59:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "SIN", "2025-01-02 05:59:00", "2025-01-02 13:59:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        EXPECT_FALSE(_violationStorage.empty());
        // violation due to local night
        //EXPECT_NE(_violationStorage.front()->violation_msg.find("actual 05:59"), std::string::npos);
        //EXPECT_NE(_violationStorage.front()->violation_msg.find("min 06:00"), std::string::npos);
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Pairing 2: depart duty starts at 06:00 -> legal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 10:00:00", "2025-01-01 18:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 10:00:00", "2025-01-01 18:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 06:00:00", "2025-01-02 14:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "SIN", "2025-01-02 06:00:00", "2025-01-02 14:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }

    // Pairing 3: slip contains more than minimum local nights -> not checked.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 10:00:00", "2025-01-01 18:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 10:00:00", "2025-01-01 18:00:00");

        // LN 1: 2025-01-01 22:00:00 to 2025-01-02 06:00:00
        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-03 05:59:00", "2025-01-03 13:59:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "SIN", "2025-01-03 05:59:00", "2025-01-03 13:59:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }
}

TEST_F(Rule7421Test, DepartureTimeAtBaseWindowFiltersPairing) {
    RuleInput input;
    auto row = makeAcopTableBRow(
        7421001,
        31,
        "X",
        "SIN-MEL-SIN",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "24",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*",
        "*");
    row.params["Departure time at base"] = "18:00-24:00";
    input.dbRules.push_back(row);

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing 1: first departure at 19:00 (in window) -> min slip hours violated.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 19:00:00", "2025-01-01 23:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 19:00:00", "2025-01-01 23:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 04:00:00", "2025-01-02 08:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "SIN", "2025-01-02 04:00:00", "2025-01-02 08:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        EXPECT_FALSE(_violationStorage.empty());
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Pairing 2: first departure at 10:00 (out of window) -> row skipped, pairing passes.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 10:00:00", "2025-01-01 14:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 10:00:00", "2025-01-01 14:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-01 19:00:00", "2025-01-01 23:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "SIN", "2025-01-01 19:00:00", "2025-01-01 23:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }
}

TEST_F(Rule7421Test, OptimizerPassLevelBypassesLowSeverityViolations) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        20,
        "X",
        "SIN-AKL-SIN",
        "AKL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "24",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    DBRule control{};
    control.idRule = 7421001;
    control.function = 7421;
    control.tableNum = 2;
    control.rowNum = 1;
    control.params["OPTIMIZER PASS LEVEL"] = "2";
    input.dbRules.push_back(control);

    AcopSlipPatternRule rule(nullptr, input);
    rule.setApplication(PAIRING_OPTIMIZER);
    rule.setDataContext(_ctx);
    rule.setRuleViolation(&_violationStorage);
    rule.setViolations(&_violationMessages);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 02:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "AKL", "2025-01-01 00:00:00", "2025-01-01 02:00:00");
    duty0->setMinDropoff(60);
    duty0->setActualDropoffMin(60);

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("AKL", "SIN", "2025-01-02 03:20:00", "2025-01-02 11:20:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "AKL", "SIN", "2025-01-02 02:20:00", "2025-01-02 11:20:00");
    duty1->setMinPickup(0);
    duty1->setActualPickupMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));

    // Without the optimizer bypass, the same violation should fail under optimizer as well.
    RuleInput strictInput = input;
    strictInput.dbRules.pop_back();  // remove control
    AcopSlipPatternRule strictRule(nullptr, strictInput);
    strictRule.setApplication(PAIRING_OPTIMIZER);
    strictRule.setDataContext(_ctx);
    strictRule.setRuleViolation(&_violationStorage);
    strictRule.setViolations(&_violationMessages);
    EXPECT_FALSE(strictRule.CheckRule(&pairing));
}

TEST_F(Rule7421Test, OptimizerPassLevelStillFailsHighSeverityViolations) {
    RuleInput input;
    auto row = makeAcopTableBRow(
        7421001,
        1,
        "(3)(b)",
        "SIN-ADL-MEL in single FDP",
        "MEL",
        1,
        "FLY|MVO",
        "*",
        "18:00-04:00",
        "*",
        "*",
        "*",
        "2",
        "*",
        "*",
        "*",
        "2",
        "6",
        "*",
        "0",
        "*");
    row.severity = 5;
    input.dbRules.push_back(row);

    DBRule control{};
    control.idRule = 7421001;
    control.function = 7421;
    control.tableNum = 2;
    control.rowNum = 1;
    control.params["OPTIMIZER PASS LEVEL"] = "4";
    input.dbRules.push_back(control);

    AcopSlipPatternRule rule(nullptr, input);
    rule.setApplication(PAIRING_OPTIMIZER);
    rule.setDataContext(_ctx);
    rule.setRuleViolation(&_violationStorage);
    rule.setViolations(&_violationMessages);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "ADL", "2025-01-01 19:00:00", "2025-01-01 23:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment("ADL", "MEL", "2025-01-02 00:00:00", "2025-01-02 02:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 19:00:00", "2025-01-02 02:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Rule7421Test, DutyTimeAfterLNAppliesOnlyWhenLocalNightsEqualsMinimum) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        31,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "1",
        "06:00",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing 1: internal duty starts before 06:00 on the minimum-local-night day -> illegal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-02 05:59:00", "2025-01-02 08:00:00", "SBY", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-02 05:59:00", "2025-01-02 08:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-03 12:00:00", "2025-01-03 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-03 12:00:00", "2025-01-03 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        EXPECT_FALSE(_violationStorage.empty());
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Pairing 2: internal duty starts earlier than 06:00 after more than the minimum local nights -> not checked.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        // LN 1: 2025-01-01 22:00:00 to 2025-01-02 06:00:00

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-03 05:00:00", "2025-01-03 08:00:00", "SBY", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-03 05:00:00", "2025-01-03 08:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-04 12:00:00", "2025-01-04 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-04 12:00:00", "2025-01-04 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }
}

TEST_F(Rule7421Test, Clause9Ai1InternalDutyRequiresLocalNightBeforeDuty) {
    RuleInput input;
    auto row = makeAcopTableBRow(
        7421001,
        33,
        "9(a)(i)1",
        "SIN-JNB-SIN",
        "JNB",
        1,
        "*",
        "*",
        "23:00-05:00",
        "*",
        "*",
        "*",
        "2",
        "*",
        "1",
        "*",
        "2",
        "6",
        "DUTY IN (JNB-CPT-JNB; JNB-DUR-JNB)",
        "0",
        "*",
        "*",
        "DUTY");
    row.params["Departure time at base"] = "*";
    input.dbRules.push_back(row);

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing 1: 1 local night before internal duty -> legal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "JNB", "2025-01-01 23:30:00", "2025-01-02 10:30:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "JNB", "2025-01-01 23:30:00", "2025-01-02 10:30:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("JNB", "CPT", "2025-01-03 10:00:00", "2025-01-03 12:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        segStorage.push_back(makeSegment("CPT", "JNB", "2025-01-03 13:00:00", "2025-01-03 15:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "JNB", "JNB", "2025-01-03 10:00:00", "2025-01-03 15:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("JNB", "SIN", "2025-01-05 10:00:00", "2025-01-05 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "JNB", "SIN", "2025-01-05 10:00:00", "2025-01-05 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }

    // Pairing 2: internal duty starts before any local night -> illegal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "JNB", "2025-01-01 23:30:00", "2025-01-02 10:30:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "JNB", "2025-01-01 23:30:00", "2025-01-02 10:30:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("JNB", "CPT", "2025-01-02 20:00:00", "2025-01-02 21:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        segStorage.push_back(makeSegment("CPT", "JNB", "2025-01-02 21:30:00", "2025-01-02 22:30:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "JNB", "JNB", "2025-01-02 20:00:00", "2025-01-02 22:30:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("JNB", "SIN", "2025-01-05 10:00:00", "2025-01-05 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "JNB", "SIN", "2025-01-05 10:00:00", "2025-01-05 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        ASSERT_EQ(_violationStorage.size(), 1u);
        const std::string msg = _violationStorage.front()->violation_msg;
        EXPECT_NE(msg.find("duty after local nights"), std::string::npos);
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }
}

TEST_F(Rule7421Test, Clause9AiStandbyPeriodsByCrewComposition) {
    RuleInput input;
    auto row = makeAcopTableBRow(
        7421001,
        34,
        "9(a)(i)2",
        "SIN-JNB-SIN",
        "JNB",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "2",
        "6",
        "*",
        "0",
        "9AI_STBY",
        "*",
        "DUTY");
    row.params["Departure time at base"] = "*";
    input.dbRules.push_back(row);

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    const std::map<std::string, int> basicCrew = {{"CAP", 1}, {"FO", 1}};
    const std::map<std::string, int> additionalCrew = {{"CAP", 1}};

    // Pairing 1: CAP+FO -> max standby periods = 1, but 2 standby duties -> illegal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "JNB", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "JNB", "2025-01-01 00:00:00", "2025-01-01 10:00:00");
        duty0->setAssignment("FLY");
        duty0->setComplementMap(basicCrew);

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("JNB", "JNB", "2025-01-02 08:00:00", "2025-01-02 11:00:00", "SBY", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "JNB", "JNB", "2025-01-02 08:00:00", "2025-01-02 11:00:00");
        duty1->setAssignment("SBY");
        duty1->setActualDP(180);
        duty1->setComplementMap(basicCrew);

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("JNB", "JNB", "2025-01-02 12:00:00", "2025-01-02 15:00:00", "SBY", false));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "JNB", "JNB", "2025-01-02 12:00:00", "2025-01-02 15:00:00");
        duty2->setAssignment("SBY");
        duty2->setActualDP(180);
        duty2->setComplementMap(basicCrew);

        std::vector<Segment*> segsDuty3;
        segStorage.push_back(makeSegment("JNB", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00", "FLY", true));
        segsDuty3.push_back(segStorage.back().get());
        auto duty3 = makeDuty(segsDuty3, "JNB", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00");
        duty3->setAssignment("FLY");
        duty3->setComplementMap(basicCrew);

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        ASSERT_EQ(_violationStorage.size(), 1u);
        const std::string msg = _violationStorage.front()->violation_msg;
        EXPECT_NE(msg.find("max standby periods"), std::string::npos);
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Pairing 2: total rank <= 1 -> allow 2 standby duties -> legal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "JNB", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "JNB", "2025-01-01 00:00:00", "2025-01-01 10:00:00");
        duty0->setAssignment("FLY");
        duty0->setComplementMap(additionalCrew);

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("JNB", "JNB", "2025-01-02 08:00:00", "2025-01-02 11:00:00", "SBY", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "JNB", "JNB", "2025-01-02 08:00:00", "2025-01-02 11:00:00");
        duty1->setAssignment("SBY");
        duty1->setActualDP(180);
        duty1->setComplementMap(additionalCrew);

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("JNB", "JNB", "2025-01-02 12:00:00", "2025-01-02 15:00:00", "SBY", false));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "JNB", "JNB", "2025-01-02 12:00:00", "2025-01-02 15:00:00");
        duty2->setAssignment("SBY");
        duty2->setActualDP(180);
        duty2->setComplementMap(additionalCrew);

        std::vector<Segment*> segsDuty3;
        segStorage.push_back(makeSegment("JNB", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00", "FLY", true));
        segsDuty3.push_back(segStorage.back().get());
        auto duty3 = makeDuty(segsDuty3, "JNB", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00");
        duty3->setAssignment("FLY");
        duty3->setComplementMap(additionalCrew);

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }
}

TEST_F(Rule7421Test, DoAfterDutyAfterAssignmentRequiresDayOffAfterStandbyDuty) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        32,
        "X",
        "*",
        "MEL",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "1 AFTER SBY",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing 1: standby within slip, then depart next day -> illegal (requires 1 DO after standby).
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00", "SBY", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-02 12:00:00", "2025-01-02 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        EXPECT_FALSE(_violationStorage.empty());
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Pairing 2: standby within slip, then depart day+2 -> legal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00", "SBY", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "MEL", "MEL", "2025-01-01 18:00:00", "2025-01-01 20:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-03 12:00:00", "2025-01-03 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "MEL", "SIN", "2025-01-03 12:00:00", "2025-01-03 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }
}

TEST_F(Rule7421Test, DoAfterTriggerDayAfterArrivalAppliesOnlyToArrivalNextDayDuty) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        33,
        "4(b)",
        "*",
        "REUR",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "2",
        "*",
        "*",
        "*",
        "*",
        "*",
        "POS IN REUR | FDP <=6H IN REUR",
        "1",
        "EUR_4B;DO_AFTER_TRIGGER=DAY_AFTER_ARRIVAL"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing 1: Europe FDP on the day after arrival, then immediate depart next day -> illegal (1 DO required).
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("FRA", "LHR", "2025-01-02 07:00:00", "2025-01-02 10:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "FRA", "LHR", "2025-01-02 07:00:00", "2025-01-02 10:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("LHR", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "LHR", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        EXPECT_FALSE(_violationStorage.empty());
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Pairing 2: Europe FDP occurs on day+2 after arrival, so clause 4(b) DO-after trigger does not apply.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("FRA", "LHR", "2025-01-03 07:00:00", "2025-01-03 10:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "FRA", "LHR", "2025-01-03 07:00:00", "2025-01-03 10:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("LHR", "SIN", "2025-01-04 10:00:00", "2025-01-04 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "LHR", "SIN", "2025-01-04 10:00:00", "2025-01-04 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }
}

TEST_F(Rule7421Test, DoAfterTriggerRestLt24hAppliesOnlyWhenPredutyRestIsBelowTwentyFourHours) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        34,
        "(4)(d)(ii)",
        "*",
        "REUR",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "1",
        "*",
        "*",
        "*",
        "*",
        "*",
        "POS IN REUR | FDP <=6H IN REUR",
        "1",
        "DO_AFTER_TRIGGER=REST_LT_24H"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing 1: pre-duty rest is below 24:00, so 1 DO after the Europe duty is required.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "MVP", false));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("FRA", "LHR", "2025-01-02 07:00:00", "2025-01-02 10:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "FRA", "LHR", "2025-01-02 07:00:00", "2025-01-02 10:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("LHR", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "LHR", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        EXPECT_FALSE(_violationStorage.empty());
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Pairing 2: pre-duty rest is at least 24:00, so the DO-after trigger does not apply.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "MVP", false));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("FRA", "LHR", "2025-01-02 12:00:00", "2025-01-02 15:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "FRA", "LHR", "2025-01-02 12:00:00", "2025-01-02 15:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("LHR", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "LHR", "SIN", "2025-01-03 10:00:00", "2025-01-03 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }
}

TEST_F(Rule7421Test, AllowedDutyFdpAndPosSupportDurationAndLocation) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        33,
        "X",
        "*",
        "REUR",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "POS <=1:00 IN REUR | FDP <=3:30 IN REUR",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing 1: POS duty within REUR exceeds 1:00 -> illegal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("FRA", "LHR", "2025-01-02 08:00:00", "2025-01-02 09:30:00", "DHD", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "FRA", "LHR", "2025-01-02 08:00:00", "2025-01-02 09:30:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("LHR", "SIN", "2025-01-03 12:00:00", "2025-01-03 22:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "LHR", "SIN", "2025-01-03 12:00:00", "2025-01-03 22:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        EXPECT_FALSE(_violationStorage.empty());
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Pairing 2: FDP duty within REUR exceeds 3:30 -> illegal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("FRA", "LHR", "2025-01-02 08:00:00", "2025-01-02 12:00:00", "FLY", true));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "FRA", "LHR", "2025-01-02 08:00:00", "2025-01-02 12:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("LHR", "SIN", "2025-01-03 12:00:00", "2025-01-03 22:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "LHR", "SIN", "2025-01-03 12:00:00", "2025-01-03 22:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        EXPECT_FALSE(_violationStorage.empty());
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Pairing 3: POS (1:00) and FDP (3:30) limits met -> legal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("FRA", "LHR", "2025-01-02 08:00:00", "2025-01-02 09:00:00", "DHD", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "FRA", "LHR", "2025-01-02 08:00:00", "2025-01-02 09:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("LHR", "CDG", "2025-01-02 10:00:00", "2025-01-02 13:30:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "LHR", "CDG", "2025-01-02 10:00:00", "2025-01-02 13:30:00");

        std::vector<Segment*> segsDuty3;
        segStorage.push_back(makeSegment("CDG", "SIN", "2025-01-03 12:00:00", "2025-01-03 22:00:00", "FLY", true));
        segsDuty3.push_back(segStorage.back().get());
        auto duty3 = makeDuty(segsDuty3, "CDG", "SIN", "2025-01-03 12:00:00", "2025-01-03 22:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }
}

TEST_F(Rule7421Test, ExtraConditionEur4BAllowsNextDayCopAndEnforces0600) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        34,
        "4(b)",
        "*",
        "REUR",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "2",
        "*",
        "*",
        "*",
        "2",
        "6",
        "POS IN REUR | FDP <=6H IN REUR",
        "1",
        "EUR_4B"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing 1: standby day+1, COP within Europe day+2 at/after 06:00, plus 1 DO -> legal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("FRA", "FRA", "2025-01-02 09:00:00", "2025-01-02 13:00:00", "SBY", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "FRA", "FRA", "2025-01-02 09:00:00", "2025-01-02 13:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("FRA", "LHR", "2025-01-03 07:00:00", "2025-01-03 14:30:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "FRA", "LHR", "2025-01-03 07:00:00", "2025-01-03 14:30:00");

        std::vector<Segment*> segsDuty3;
        segStorage.push_back(makeSegment("LHR", "SIN", "2025-01-05 10:00:00", "2025-01-05 20:00:00", "FLY", true));
        segsDuty3.push_back(segStorage.back().get());
        auto duty3 = makeDuty(segsDuty3, "LHR", "SIN", "2025-01-05 10:00:00", "2025-01-05 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }

    // Pairing 2: standby day+1, COP within Europe day+2 before 06:00 -> illegal.
    {
        std::vector<Segment*> segsDuty0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00", "FLY", true));
        segsDuty0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00");

        std::vector<Segment*> segsDuty1;
        segStorage.push_back(makeSegment("FRA", "FRA", "2025-01-02 09:00:00", "2025-01-02 13:00:00", "SBY", false));
        segsDuty1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segsDuty1, "FRA", "FRA", "2025-01-02 09:00:00", "2025-01-02 13:00:00");

        std::vector<Segment*> segsDuty2;
        segStorage.push_back(makeSegment("FRA", "LHR", "2025-01-03 05:59:00", "2025-01-03 13:00:00", "FLY", true));
        segsDuty2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segsDuty2, "FRA", "LHR", "2025-01-03 05:59:00", "2025-01-03 13:00:00");

        std::vector<Segment*> segsDuty3;
        segStorage.push_back(makeSegment("LHR", "SIN", "2025-01-05 10:00:00", "2025-01-05 20:00:00", "FLY", true));
        segsDuty3.push_back(segStorage.back().get());
        auto duty3 = makeDuty(segsDuty3, "LHR", "SIN", "2025-01-05 10:00:00", "2025-01-05 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        EXPECT_FALSE(_violationStorage.empty());
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }
}

TEST_F(Rule7421Test, ExtraConditionEur4BDepartOutOfEuropeNextDayRequires2ExtraDaysOffAtBase) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        35,
        "4(b)",
        "*",
        "REUR",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "2",
        "*",
        "*",
        "*",
        "2",
        "6",
        "POS IN REUR | FDP <=6H IN REUR",
        "1",
        "EUR_4B"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("FRA", "FRA", "2025-01-02 09:00:00", "2025-01-02 13:00:00", "SBY", false));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "FRA", "FRA", "2025-01-02 09:00:00", "2025-01-02 13:00:00");

    std::vector<Segment*> segsDuty2;
    segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00", "FLY", true));
    segsDuty2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segsDuty2, "FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00");
    duty2->setMinDropoff(0);
    duty2->setActualDropoffMin(0);
    duty2->setMinRest(8 * 60, true);
    duty2->setMinRestAtBase(8 * 60, true);

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());

    const time_t restStartLoc = utcFromString("2025-01-03 20:00:00");
    // EXDO behaves as additional ATDO day-off requirement from next midnight.
    time_t alignDay = restStartLoc - (restStartLoc % (24 * 3600));
    time_t alignLoc = (restStartLoc == alignDay) ? alignDay : (alignDay + 24 * 3600);
    time_t restEndLoc = alignLoc + 2 * 24 * 3600;
    const int expectedMinRest = static_cast<int>((restEndLoc - restStartLoc) / 60);
    EXPECT_EQ(duty2->getMinRestAtBase(), expectedMinRest);
    EXPECT_EQ(duty2->getMinRest(), expectedMinRest);
    EXPECT_EQ(duty2->getMinEXDO(), 2);
}

TEST_F(Rule7421Test, ExtraConditionAtdoTokenSetsExtraDaysOffAtBase) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        36,
        "ATDO",
        "*",
        "REUR",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "ATDO=1"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00");
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);
    duty1->setMinRest(8 * 60, true);
    duty1->setMinRestAtBase(8 * 60, true);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());

    const time_t restStartLoc = utcFromString("2025-01-03 20:00:00");
    // ATDO semantics: define N full calendar days off from next midnight (7465-style), not an extension on top of minRest.
    time_t alignDay = restStartLoc - (restStartLoc % (24 * 3600));
    time_t alignLoc = (restStartLoc == alignDay) ? alignDay : (alignDay + 24 * 3600);
    time_t restEndLoc = alignLoc + 1 * 24 * 3600;
    const int expectedMinRest = static_cast<int>((restEndLoc - restStartLoc) / 60);
    EXPECT_EQ(duty1->getMinRestAtBase(), expectedMinRest);
    EXPECT_EQ(duty1->getMinRest(), expectedMinRest);
    EXPECT_EQ(duty1->getMinATDO(), 1);
}

TEST_F(Rule7421Test, ExtraConditionAtdoTokenSubtractsDropoffMinutes) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        36,
        "ATDO",
        "*",
        "REUR",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "ATDO=1"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00");
    duty1->setMinDropoff(60);
    duty1->setActualDropoffMin(60);
    duty1->setMinRest(8 * 60, true);
    duty1->setMinRestAtBase(8 * 60, true);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());

    const time_t restStartLoc = utcFromString("2025-01-03 20:00:00");
    time_t alignDay = restStartLoc - (restStartLoc % (24 * 3600));
    time_t alignLoc = (restStartLoc == alignDay) ? alignDay : (alignDay + 24 * 3600);
    time_t restEndLoc = alignLoc + 1 * 24 * 3600;
    const int expectedMinRest = static_cast<int>((restEndLoc - restStartLoc) / 60) - 60;
    EXPECT_EQ(duty1->getMinRestAtBase(), expectedMinRest);
    EXPECT_EQ(duty1->getMinRest(), expectedMinRest);
    EXPECT_EQ(duty1->getMinATDO(), 1);
}

TEST_F(Rule7421Test, ExtraConditionExdoTokenExtendsExistingMinRestAtBase) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        37,
        "EXDO",
        "*",
        "REUR",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "EXDO=1"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00");
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);
    duty1->setMinRest(8 * 60, true);
    duty1->setMinRestAtBase(8 * 60, true);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());

    const time_t restStartLoc = utcFromString("2025-01-03 20:00:00");
    time_t alignDay = restStartLoc - (restStartLoc % (24 * 3600));
    time_t alignLoc = (restStartLoc == alignDay) ? alignDay : (alignDay + 24 * 3600);
    time_t restEndLoc = alignLoc + 1 * 24 * 3600;
    const int expectedMinRest = static_cast<int>((restEndLoc - restStartLoc) / 60);
    EXPECT_EQ(duty1->getMinRestAtBase(), expectedMinRest);
    EXPECT_EQ(duty1->getMinRest(), expectedMinRest);
    EXPECT_EQ(duty1->getMinEXDO(), 1);
}

TEST_F(Rule7421Test, ExtraConditionExdoTokenSubtractsDropoffMinutes) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        37,
        "EXDO",
        "*",
        "REUR",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "EXDO=1"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDuty0;
    segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00", "FLY", true));
    segsDuty0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segsDuty0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 20:00:00");

    std::vector<Segment*> segsDuty1;
    segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00", "FLY", true));
    segsDuty1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segsDuty1, "FRA", "SIN", "2025-01-03 07:00:00", "2025-01-03 20:00:00");
    duty1->setMinDropoff(60);
    duty1->setActualDropoffMin(60);
    duty1->setMinRest(8 * 60, true);
    duty1->setMinRestAtBase(8 * 60, true);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());

    const time_t restStartLoc = utcFromString("2025-01-03 20:00:00");
    time_t alignDay = restStartLoc - (restStartLoc % (24 * 3600));
    time_t alignLoc = (restStartLoc == alignDay) ? alignDay : (alignDay + 24 * 3600);
    time_t restEndLoc = alignLoc + 1 * 24 * 3600;
    const int expectedMinRest = static_cast<int>((restEndLoc - restStartLoc) / 60) - 60;
    EXPECT_EQ(duty1->getMinRestAtBase(), expectedMinRest);
    EXPECT_EQ(duty1->getMinRest(), expectedMinRest);
    EXPECT_EQ(duty1->getMinEXDO(), 1);
}

TEST_F(Rule7421Test, PatternStarTokenDoesNotMatchPrevOrNextToken) {
    // Pattern "SIN-*-AU-SIN": '*' must not be SIN and must not be in country AU.
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        38,
        "STAR",
        "SIN-*-AU-SIN",
        "AU",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "10",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Should match: SIN-HKG-SYD-SIN (HKG is '*', SYD is AU).
    {
        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "HKG", "2025-01-01 00:00:00", "2025-01-01 04:00:00", "FLY", true));
        segs0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segs0, "SIN", "HKG", "2025-01-01 00:00:00", "2025-01-01 04:00:00");

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("HKG", "SYD", "2025-01-01 05:00:00", "2025-01-01 15:00:00", "FLY", true));
        segs1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segs1, "HKG", "SYD", "2025-01-01 05:00:00", "2025-01-01 15:00:00");

        std::vector<Segment*> segs2;
        segStorage.push_back(makeSegment("SYD", "SIN", "2025-01-01 16:00:00", "2025-01-01 20:00:00", "FLY", true));
        segs2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segs2, "SYD", "SIN", "2025-01-01 16:00:00", "2025-01-01 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        // Slip at AU (SYD) is only 1 hour (15:00 -> 16:00) which violates min slip hours 10.
        EXPECT_FALSE(rule.CheckRule(&pairing));
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }

    // Should NOT match: SIN-SYD-MEL-SIN (here '*' would have to match SYD, but SYD is AU and is disallowed).
    {
        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "SYD", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segs0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segs0, "SIN", "SYD", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("SYD", "MEL", "2025-01-01 12:00:00", "2025-01-01 13:00:00", "FLY", true));
        segs1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segs1, "SYD", "MEL", "2025-01-01 12:00:00", "2025-01-01 13:00:00");

        std::vector<Segment*> segs2;
        segStorage.push_back(makeSegment("MEL", "SIN", "2025-01-01 14:00:00", "2025-01-01 20:00:00", "FLY", true));
        segs2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segs2, "MEL", "SIN", "2025-01-01 14:00:00", "2025-01-01 20:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);

        // Pattern should not match, so the rule row should not apply and no violation should be raised.
        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }
}

TEST_F(Rule7421Test, PatternDoubleStarCanMatchAnyPrefixAndSuffixIncludingZero) {
    // "**-FRA-**" should match any pairing that has FRA somewhere in its station chain.
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        41,
        "DSTAR",
        "**-FRA-**",
        "FRA",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "10",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Pairing starts at SIN (not FRA), but contains FRA as a mid slip: should match and violate.
    {
        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segs0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segs0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-01 11:00:00", "2025-01-01 21:00:00", "FLY", true));
        segs1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segs1, "FRA", "SIN", "2025-01-01 11:00:00", "2025-01-01 21:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);

        // FRA stay is only 1 hour => violates min slip hours 10.
        EXPECT_FALSE(rule.CheckRule(&pairing));
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }
}

TEST_F(Rule7421Test, PatternDoubleStarCanMatchZeroTailStations) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        45,
        "DSTAR_ZERO",
        "SIN-NZ-**",
        "NZ",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "24", // min slip hour
        "0",  // min slip LN
        "10",  // duty after hour
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Station chain = SIN-CHC-AKL, so trailing "**" must match zero stations.
    {
        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "CHC", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segs0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segs0, "SIN", "CHC", "2025-01-01 00:00:00", "2025-01-01 10:00:00");

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("CHC", "AKL", "2025-01-01 11:00:00", "2025-01-01 12:00:00", "FLY", true));
        segs1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segs1, "CHC", "AKL", "2025-01-01 11:00:00", "2025-01-01 12:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);

        // Slip at CHC is only 1 hour, so it should violate if the pattern matches.
        EXPECT_FALSE(rule.CheckRule(&pairing));
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }
}

TEST_F(Rule7421Test, CopPatternMatchesMultiStopChain) {
    std::vector<std::string> shouldMatchPatterns{
        "SIN-AU-SIN",
        "SIN-MEL-SYD-SIN",
        "SIN-CMEL-CSYD-SIN",
        "SIN-**-SIN",
    };
    std::vector<std::string> shouldNotMatchPatterns{
        "SIN-AU-NZ-SIN",
        "SIN-MEL-SIN",
        "SIN-*-SIN",
    };

    auto pairingViolatesForPattern = [&](const std::string& pattern) -> bool {
        RuleInput input;
        input.dbRules.push_back(makeAcopTableBRow(
            7421001,
            42,
            "CHAIN",
            pattern,
            "SYD",
            1,
            "*",
            "*",
            "*",
            "*",
            "*",
            "100",
            "0",
            "*",
            "*",
            "*",
            "*",
            "*",
            "*",
            "0",
            "*"));

        AcopSlipPatternRule rule(nullptr, input);
        configureRule(rule);

        std::vector<std::unique_ptr<Segment>> segStorage;

        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 08:00:00", "FLY", true));
        segs0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segs0, "SIN", "MEL", "2025-01-01 00:00:00", "2025-01-01 08:00:00");

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("MEL", "SYD", "2025-01-01 09:00:00", "2025-01-01 13:00:00", "FLY", true));
        segs1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segs1, "MEL", "SYD", "2025-01-01 09:00:00", "2025-01-01 13:00:00");

        std::vector<Segment*> segs2;
        segStorage.push_back(makeSegment("SYD", "SIN", "2025-01-01 14:00:00", "2025-01-01 22:00:00", "FLY", true));
        segs2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segs2, "SYD", "SIN", "2025-01-01 14:00:00", "2025-01-01 22:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);
        pairing.setBase("SIN");

        const bool ok = rule.CheckRule(&pairing);
        const bool violated = (!ok && !_violationStorage.empty());

        deleteViolations(_violationStorage);
        _violationMessages.clear();
        return violated;
    };

    for (const auto& pattern : shouldMatchPatterns) {
        EXPECT_TRUE(pairingViolatesForPattern(pattern)) << "Pattern should match and violate: " << pattern;
    }

    for (const auto& pattern : shouldNotMatchPatterns) {
        EXPECT_FALSE(pairingViolatesForPattern(pattern)) << "Pattern should not match: " << pattern;
    }
}

TEST_F(Rule7421Test, CopPatternMatchesSinMelAklSinChain) {
    // Ensure RSWP (region token) matches MEL and AKL for this test.
    _ctx->airportCodeMap["MEL"]->category = "SWP";
    _ctx->airportCodeMap["AKL"]->category = "SWP";

    std::vector<std::string> shouldMatchPatterns{
        "SIN-AU-NZ-SIN",
        "SIN-AU|NZ-SIN",
        "SIN-RSWP-SIN",
        "**-AKL-**",
    };
    std::vector<std::string> shouldNotMatchPatterns{
        "SIN-AU-SIN",
        "SIN-NZ-SIN",
        "**-MEL-SIN",
    };

    auto pairingViolatesForPattern = [&](const std::string& pattern) -> bool {
        RuleInput input;
        input.dbRules.push_back(makeAcopTableBRow(
            7421001,
            43,
            "CHAIN2",
            pattern,
            "AKL",
            1,
            "*",
            "*",
            "*",
            "*",
            "*",
            "100",
            "0",
            "*",
            "*",
            "*",
            "*",
            "*",
            "*",
            "0",
            "*"));

        AcopSlipPatternRule rule(nullptr, input);
        configureRule(rule);

        std::vector<std::unique_ptr<Segment>> segStorage;

        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "MEL", "2025-01-02 00:00:00", "2025-01-02 08:00:00", "FLY", true));
        segs0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segs0, "SIN", "MEL", "2025-01-02 00:00:00", "2025-01-02 08:00:00");

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("MEL", "AKL", "2025-01-02 09:00:00", "2025-01-02 19:00:00", "FLY", true));
        segs1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segs1, "MEL", "AKL", "2025-01-02 09:00:00", "2025-01-02 19:00:00");

        std::vector<Segment*> segs2;
        segStorage.push_back(makeSegment("AKL", "SIN", "2025-01-02 20:00:00", "2025-01-03 04:00:00", "FLY", true));
        segs2.push_back(segStorage.back().get());
        auto duty2 = makeDuty(segs2, "AKL", "SIN", "2025-01-02 20:00:00", "2025-01-03 04:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
        Pairing pairing(duties);
        pairing.setBase("SIN");

        const bool ok = rule.CheckRule(&pairing);
        const bool violated = (!ok && !_violationStorage.empty());

        deleteViolations(_violationStorage);
        _violationMessages.clear();
        return violated;
    };

    for (const auto& pattern : shouldMatchPatterns) {
        EXPECT_TRUE(pairingViolatesForPattern(pattern)) << "Pattern should match and violate: " << pattern;
    }

    for (const auto& pattern : shouldNotMatchPatterns) {
        EXPECT_FALSE(pairingViolatesForPattern(pattern)) << "Pattern should not match: " << pattern;
    }
}

TEST_F(Rule7421Test, CopPatternIgnoresStandbyDutyLocationChanges) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        89,
        "NZ_CHAIN",
        "SIN-NZ-SIN",
        "NZ",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "999:00",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-04 00:00:00", "2025-12-04 10:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CHC", "2025-12-04 00:00:00", "2025-12-04 10:00:00");

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-05 12:00:00", "2025-12-05 14:00:00", "SBY", false));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CHC", "SIN", "2025-12-05 12:00:00", "2025-12-05 14:00:00");
    duty1->setActualDP(120);

    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("CHC", "CHC", "2025-12-05 16:00:00", "2025-12-05 18:00:00", "SBY", false));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "CHC", "CHC", "2025-12-05 16:00:00", "2025-12-05 18:00:00");
    duty2->setActualDP(120);

    std::vector<Segment*> segs3;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-06 12:00:00", "2025-12-06 20:00:00", "FLY", true));
    segs3.push_back(segStorage.back().get());
    auto duty3 = makeDuty(segs3, "CHC", "SIN", "2025-12-06 12:00:00", "2025-12-06 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violationStorage.empty());
    EXPECT_EQ(_violationStorage.front()->ruleParamId, 742100000 + 89);
}

TEST_F(Rule7421Test, SlipOccurrenceIgnoresStandbyDutyLocationChanges) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        90,
        "NZ_OCCURRENCE",
        "SIN-NZ-SIN",
        "NZ 2",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "999:00",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-04 00:00:00", "2025-12-04 10:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CHC", "2025-12-04 00:00:00", "2025-12-04 10:00:00");
    duty0->setAssignment("FLY");

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-05 12:00:00", "2025-12-05 20:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CHC", "SIN", "2025-12-05 12:00:00", "2025-12-05 20:00:00");
    duty1->setAssignment("FLY");

    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-06 08:00:00", "2025-12-06 10:00:00", "SBY", false));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "SIN", "CHC", "2025-12-06 08:00:00", "2025-12-06 10:00:00");
    duty2->setAssignment("SBY");
    duty2->setActualDP(120);

    std::vector<Segment*> segs3;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-06 12:00:00", "2025-12-06 20:00:00", "FLY", true));
    segs3.push_back(segStorage.back().get());
    auto duty3 = makeDuty(segs3, "CHC", "SIN", "2025-12-06 12:00:00", "2025-12-06 20:00:00");
    duty3->setAssignment("FLY");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, PreviousSlipFiltersIgnoreStandbyDutyLocationChanges) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRow(
        7421001,
        91,
        "NZ_PREV_SLIP",
        "SIN-NZ-SIN-NZ-SIN",
        "NZ",
        1,
        "*",
        "*",
        "*",
        "1",
        "*",
        "999:00",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-01 00:00:00", "2025-12-01 10:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CHC", "2025-12-01 00:00:00", "2025-12-01 10:00:00");
    duty0->setAssignment("FLY");

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-01 20:00:00", "2025-12-02 06:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CHC", "SIN", "2025-12-01 20:00:00", "2025-12-02 06:00:00");
    duty1->setAssignment("FLY");

    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-03 20:00:00", "2025-12-03 22:00:00", "SBY", false));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "CHC", "SIN", "2025-12-03 20:00:00", "2025-12-03 22:00:00");
    duty2->setAssignment("SBY");
    duty2->setActualDP(120);

    std::vector<Segment*> segs3;
    segStorage.push_back(makeSegment("SIN", "CHC", "2025-12-03 23:00:00", "2025-12-04 09:00:00", "FLY", true));
    segs3.push_back(segStorage.back().get());
    auto duty3 = makeDuty(segs3, "SIN", "CHC", "2025-12-03 23:00:00", "2025-12-04 09:00:00");
    duty3->setAssignment("FLY");

    std::vector<Segment*> segs4;
    segStorage.push_back(makeSegment("CHC", "SIN", "2025-12-05 12:00:00", "2025-12-05 20:00:00", "FLY", true));
    segs4.push_back(segStorage.back().get());
    auto duty4 = makeDuty(segs4, "CHC", "SIN", "2025-12-05 12:00:00", "2025-12-05 20:00:00");
    duty4->setAssignment("FLY");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get(), duty3.get(), duty4.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violationStorage.empty());
    EXPECT_EQ(_violationStorage.front()->ruleParamId, 742100000 + 91);
}

TEST_F(Rule7421Test, CopPatternMatchesSinLhrSinChain) {
    std::vector<std::string> shouldMatchPatterns{
        "SIN-CLON-SIN",
        "SIN-LHR-SIN",
        "SIN-GB-SIN",
    };
    std::vector<std::string> shouldNotMatchPatterns{
        "SIN-LON-SIN",
        "SIN-REUR~GB-SIN",
    };

    auto pairingViolatesForPattern = [&](const std::string& pattern) -> bool {
        RuleInput input;
        input.dbRules.push_back(makeAcopTableBRow(
            7421001,
            44,
            "CHAIN3",
            pattern,
            "LHR",
            1,
            "*",
            "*",
            "*",
            "*",
            "*",
            "100",
            "0",
            "*",
            "*",
            "*",
            "*",
            "*",
            "*",
            "0",
            "*"));

        AcopSlipPatternRule rule(nullptr, input);
        configureRule(rule);

        std::vector<std::unique_ptr<Segment>> segStorage;

        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "LHR", "2025-01-03 00:00:00", "2025-01-03 12:00:00", "FLY", true));
        segs0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segs0, "SIN", "LHR", "2025-01-03 00:00:00", "2025-01-03 12:00:00");

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("LHR", "SIN", "2025-01-03 13:00:00", "2025-01-03 23:00:00", "FLY", true));
        segs1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segs1, "LHR", "SIN", "2025-01-03 13:00:00", "2025-01-03 23:00:00");

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);
        pairing.setBase("SIN");

        const bool ok = rule.CheckRule(&pairing);
        const bool violated = (!ok && !_violationStorage.empty());

        deleteViolations(_violationStorage);
        _violationMessages.clear();
        return violated;
    };

    for (const auto& pattern : shouldMatchPatterns) {
        EXPECT_TRUE(pairingViolatesForPattern(pattern)) << "Pattern should match and violate: " << pattern;
    }

    for (const auto& pattern : shouldNotMatchPatterns) {
        EXPECT_FALSE(pairingViolatesForPattern(pattern)) << "Pattern should not match: " << pattern;
    }
}

TEST_F(Rule7421Test, FleetControlFiltersPairingsByOperatingSegmentFleet) {
    RuleInput input;
    auto row = makeAcopTableBRow(
        7421001,
        39,
        "FLEET",
        "*",
        "FRA",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "10",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*");
    input.dbRules.push_back(row);

    DBRule controlRule{};
    controlRule.idRule = 7421001;
    controlRule.function = 7421;
    controlRule.tableNum = 2;
    controlRule.rowNum = 1;
    controlRule.params["Fleets"] = "744F";
    input.dbRules.push_back(controlRule);

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Not allowed fleet => rule ignored (even though slip would violate min slip hours at FRA).
    {
        std::vector<std::unique_ptr<Duty>> dutyStorage;

        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segStorage.back()->setFleetCD("777F");
        segs0.push_back(segStorage.back().get());
        dutyStorage.push_back(makeDuty(segs0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00"));

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-01 11:00:00", "2025-01-01 21:00:00", "FLY", true));
        segStorage.back()->setFleetCD("777F");
        segs1.push_back(segStorage.back().get());
        dutyStorage.push_back(makeDuty(segs1, "FRA", "SIN", "2025-01-01 11:00:00", "2025-01-01 21:00:00"));

        std::vector<Duty*> duties{dutyStorage[0].get(), dutyStorage[1].get()};
        Pairing pairing(duties);

        EXPECT_TRUE(rule.CheckRule(&pairing));
        EXPECT_TRUE(_violationStorage.empty());
    }

    // Allowed fleet => rule applies and violates min slip hours (FRA stay is only 1 hour).
    {
        std::vector<std::unique_ptr<Duty>> dutyStorage;

        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
        segStorage.back()->setFleetCD("744F");
        segs0.push_back(segStorage.back().get());
        dutyStorage.push_back(makeDuty(segs0, "SIN", "FRA", "2025-01-01 00:00:00", "2025-01-01 10:00:00"));

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-01 11:00:00", "2025-01-01 21:00:00", "FLY", true));
        segStorage.back()->setFleetCD("744F");
        segs1.push_back(segStorage.back().get());
        dutyStorage.push_back(makeDuty(segs1, "FRA", "SIN", "2025-01-01 11:00:00", "2025-01-01 21:00:00"));

        std::vector<Duty*> duties{dutyStorage[0].get(), dutyStorage[1].get()};
        Pairing pairing(duties);

        EXPECT_FALSE(rule.CheckRule(&pairing));
        deleteViolations(_violationStorage);
        _violationMessages.clear();
    }
}

TEST_F(Rule7421Test, MaxSlipHoursUsesWindowMinutesNotStandbyReducedRest) {
    RuleInput input;
    DBRule row = makeAcopTableBRow(
        7421001,
        40,
        "MAX",
        "*",
        "FRA",
        1,
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*",
        "*",
        "*",
        "*",
        "*",
        "*",
        "0",
        "*");
    row.params["Max slip hours"] = "8";
    input.dbRules.push_back(row);

    DBRule controlRule{};
    controlRule.idRule = 7421001;
    controlRule.function = 7421;
    controlRule.tableNum = 2;
    controlRule.rowNum = 1;
    controlRule.params["Sby Reduces Rest and LN"] = "Y";
    controlRule.params["Standby Assignments"] = "SBY";
    input.dbRules.push_back(controlRule);

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "FRA", "2024-12-31 14:00:00", "2025-01-01 00:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "FRA", "2024-12-31 14:00:00", "2025-01-01 00:00:00");

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("FRA", "FRA", "2025-01-01 01:00:00", "2025-01-01 05:00:00", "SBY", false));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "FRA", "FRA", "2025-01-01 01:00:00", "2025-01-01 05:00:00");

    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("FRA", "SIN", "2025-01-01 10:00:00", "2025-01-01 20:00:00", "FLY", true));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "FRA", "SIN", "2025-01-01 10:00:00", "2025-01-01 20:00:00");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);

    // Slip window at FRA: 00:00 -> 10:00 = 10h > max 8h, even though standby-reduced rest is 6h.
    EXPECT_FALSE(rule.CheckRule(&pairing));
    deleteViolations(_violationStorage);
    _violationMessages.clear();
}

TEST_F(Rule7421Test, UlrDutyTokenAllowsStandbyAfterTwentyFourHoursAndOneLocalNight) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRowWithDutyAssignmentFilters(
        7421013,
        1,
        "ULR Annex E 6.2.2",
        "*",
        "*",
        1,
        "ULR_DUTY",
        "*",
        "48",
        "2",
        "24",
        "1",
        "6"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK",
                                     "2025-01-01 00:00:00",
                                     "2025-01-01 10:00:00",
                                     "FLY",
                                     true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 10:00:00");
    duty0->setAssignment("FLY");
    duty0->setULR(true);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "JFK",
                                     "2025-01-02 12:00:00",
                                     "2025-01-02 18:00:00",
                                     "SBY",
                                     false));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "JFK", "2025-01-02 12:00:00", "2025-01-02 18:00:00");
    duty1->setAssignment("SBY");

    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("JFK", "SIN",
                                     "2025-01-03 16:00:00",
                                     "2025-01-04 02:00:00",
                                     "FLY",
                                     true));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "JFK", "SIN", "2025-01-03 16:00:00", "2025-01-04 02:00:00");
    duty2->setAssignment("FLY");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7421Test, UlrDutyTokenRejectsStandbyBeforeTwentyFourHoursOrLocalNight) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRowWithDutyAssignmentFilters(
        7421013,
        1,
        "ULR Annex E 6.2.2",
        "*",
        "*",
        1,
        "ULR_DUTY",
        "*",
        "48",
        "2",
        "24",
        "1",
        "6"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK",
                                     "2025-01-01 00:00:00",
                                     "2025-01-01 10:00:00",
                                     "FLY",
                                     true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 10:00:00");
    duty0->setAssignment("FLY");
    duty0->setULR(true);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "JFK",
                                     "2025-01-02 06:00:00",
                                     "2025-01-02 12:00:00",
                                     "SBY",
                                     false));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "JFK", "2025-01-02 06:00:00", "2025-01-02 12:00:00");
    duty1->setAssignment("SBY");

    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("JFK", "SIN",
                                     "2025-01-03 16:00:00",
                                     "2025-01-04 02:00:00",
                                     "FLY",
                                     true));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "JFK", "SIN", "2025-01-03 16:00:00", "2025-01-04 02:00:00");
    duty2->setAssignment("FLY");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violationStorage.empty());
    const std::string msg = _violationStorage.front()->violation_msg;
    EXPECT_NE(msg.find("duty after"), std::string::npos);
}

TEST_F(Rule7421Test, SlipStationStarMatchesSingleCityForSinLaxSin) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRowWithDutyAssignmentFilters(
        7421081,
        1,
        "ULR Rest (ANR and CA)",
        "*",
        "*",
        1,
        "ULR_DUTY",
        "*",
        "48",
        "2",
        "*",
        "*",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "LAX",
                                     "2025-12-12 12:45:00",
                                     "2025-12-13 03:55:00",
                                     "FLY",
                                     true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "LAX", "2025-12-12 11:45:00", "2025-12-13 04:25:00");
    duty0->setAssignment("FLY");
    duty0->setULR(true);
    duty0->setActualDropoffMin(60);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("LAX", "SIN",
                                     "2025-12-15 03:50:00",
                                     "2025-12-15 21:30:00",
                                     "FLY",
                                     true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "LAX", "SIN", "2025-12-15 02:50:00", "2025-12-15 22:00:00");
    duty1->setAssignment("FLY");

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violationStorage.empty());
    EXPECT_NE(_violationStorage.front()->violation_msg.find("min slip hours"), std::string::npos);
}

TEST_F(Rule7421Test, SlipStationStarTreatsCoterminalAsOneCity) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRowWithDutyAssignmentFilters(
        7421081,
        1,
        "ULR Rest (ANR and CA)",
        "*",
        "*",
        1,
        "ULR_DUTY",
        "*",
        "30",
        "1",
        "*",
        "*",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK",
                                     "2025-01-01 00:00:00",
                                     "2025-01-01 12:00:00",
                                     "FLY",
                                     true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 12:00:00");
    duty0->setAssignment("FLY");
    duty0->setULR(true);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("EWR", "SIN",
                                     "2025-01-02 14:00:00",
                                     "2025-01-03 02:00:00",
                                     "FLY",
                                     true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "EWR", "SIN", "2025-01-02 14:00:00", "2025-01-03 02:00:00");
    duty1->setAssignment("FLY");

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violationStorage.empty());
    EXPECT_NE(_violationStorage.front()->violation_msg.find("min slip hours"), std::string::npos);
}

TEST_F(Rule7421Test, SlipStationPercentTreatsCoterminalAsDifferentAirports) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRowWithDutyAssignmentFilters(
        7421082,
        1,
        "ULR Rest (ANR and CA)",
        "*",
        "%",
        1,
        "ULR_DUTY",
        "*",
        "48",
        "2",
        "*",
        "*",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK",
                                     "2025-01-01 00:00:00",
                                     "2025-01-01 12:00:00",
                                     "FLY",
                                     true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 12:00:00");
    duty0->setAssignment("FLY");
    duty0->setULR(true);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "EWR",
                                     "2025-01-02 10:00:00",
                                     "2025-01-02 11:00:00",
                                     "MVP",
                                     false));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "EWR", "2025-01-02 10:00:00", "2025-01-02 11:00:00");
    duty1->setAssignment("MVP");

    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("EWR", "SIN",
                                     "2025-01-03 14:00:00",
                                     "2025-01-04 02:00:00",
                                     "FLY",
                                     true));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "EWR", "SIN", "2025-01-03 14:00:00", "2025-01-04 02:00:00");
    duty2->setAssignment("FLY");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violationStorage.empty());
    const std::string msg = _violationStorage.front()->violation_msg;
    EXPECT_TRUE(msg.find("min slip hours") != std::string::npos ||
                msg.find("min slip local nights") != std::string::npos);
}

TEST_F(Rule7421Test, SlipStationStarAllowsCoterminalGroundTransportWithinSameCity) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableBRowWithDutyAssignmentFilters(
        7421083,
        1,
        "ULR Rest (ANR and CA)",
        "*",
        "*",
        1,
        "ULR_DUTY",
        "*",
        "48",
        "2",
        "*",
        "*",
        "*"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK",
                                     "2025-01-01 00:00:00",
                                     "2025-01-01 12:00:00",
                                     "FLY",
                                     true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 12:00:00");
    duty0->setAssignment("FLY");
    duty0->setULR(true);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "EWR",
                                     "2025-01-02 10:00:00",
                                     "2025-01-02 11:00:00",
                                     "MVP",
                                     false));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "EWR", "2025-01-02 10:00:00", "2025-01-02 11:00:00");
    duty1->setAssignment("MVP");

    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("EWR", "SIN",
                                     "2025-01-03 14:00:00",
                                     "2025-01-04 02:00:00",
                                     "FLY",
                                     true));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "EWR", "SIN", "2025-01-03 14:00:00", "2025-01-04 02:00:00");
    duty2->setAssignment("FLY");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}
//
//TEST_F(Rule7421Test, PairingOptimizerMultithreadRejectsUlrLayoverBelowMinSlip) {
//    RuleInput input;
//    input.dbRules.push_back(makeAcopTableBRowWithDutyAssignmentFilters(
//        7421018,
//        18,
//        "ULR Rest (ANR and CA)",
//        "*",
//        "LAX",
//        1,
//        "ULR_DUTY",
//        "*",
//        "48",
//        "2",
//        "*",
//        "*",
//        "*"));
//
//    AcopSlipPatternRule rule(nullptr, input);
//    rule.setApplication(PAIRING_OPTIMIZER);
//    rule.setDataContext(_ctx);
//
//    std::vector<std::unique_ptr<Segment>> segStorage;
//
//    std::vector<Segment*> segs0;
//    segStorage.push_back(makeSegment("SIN", "LAX",
//                                     "2025-12-12 12:45:00",
//                                     "2025-12-13 03:55:00",
//                                     "FLY",
//                                     true));
//    segStorage.back()->setFleetCD("359");
//    segs0.push_back(segStorage.back().get());
//    auto duty0 = makeDuty(segs0, "SIN", "LAX", "2025-12-12 11:45:00", "2025-12-13 04:25:00");
//    duty0->setAssignment("FLY");
//    duty0->setULR(true);
//    duty0->setActualDropoffMin(60);
//
//    std::vector<Segment*> segs1;
//    segStorage.push_back(makeSegment("LAX", "SIN",
//                                     "2025-12-15 03:50:00",
//                                     "2025-12-15 21:30:00",
//                                     "FLY",
//                                     true));
//    segStorage.back()->setFleetCD("359");
//    segs1.push_back(segStorage.back().get());
//    auto duty1 = makeDuty(segs1, "LAX", "SIN", "2025-12-15 02:50:00", "2025-12-15 22:00:00");
//    duty1->setAssignment("FLY");
//
//    std::vector<Duty*> duties{duty0.get(), duty1.get()};
//    Pairing pairing(duties);
//    pairing.setBase("SIN");
//
//    EXPECT_FALSE(rule.CheckRule(&pairing));
//
//    std::atomic<bool> sawPass{false};
//    std::vector<std::thread> threads;
//    threads.reserve(8);
//    for (int t = 0; t < 8; ++t) {
//        threads.emplace_back([&]() {
//            for (int i = 0; i < 2000 && !sawPass.load(); ++i) {
//                if (rule.CheckRule(&pairing)) {
//                    sawPass.store(true);
//                    break;
//                }
//            }
//        });
//    }
//    for (auto& th : threads) {
//        th.join();
//    }
//    EXPECT_FALSE(sawPass.load());
//}

TEST_F(Rule7421Test, UlrEquivalentPositionTokenMatchesPositioningThatSatisfies7405Rows) {
    FLEET fleet;
    fleet.airline = "SQ";
    fleet.fleet = "359";
    fleet.fleetGrp = "350";
    _ctx->fleetMap[fleet.fleet] = fleet;

    RuleInput input;
    input.dependDbRules[RULES::ANR_ULR_DUTY_DEFINITION].push_back(
        makeUlr7405Row(7405001, 1, "SIN", "JFK", "*", "350"));
    input.dbRules.push_back(makeAcopTableBRowWithDutyAssignmentFilters(
        7421013,
        1,
        "ULR Annex E 6.2.2 (equivalent positioning)",
        "*",
        "*",
        1,
        "ULR_EQUIVALENT_POS",
        "*",
        "48",
        "2",
        "24",
        "1",
        "6"));

    AcopSlipPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK",
                                     "2025-01-01 00:00:00",
                                     "2025-01-01 10:00:00",
                                     "MVP",
                                     false));
    segStorage.back()->setFleetCD("359");
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 10:00:00");
    duty0->setAssignment("MVP");

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "JFK",
                                     "2025-01-02 12:00:00",
                                     "2025-01-02 18:00:00",
                                     "SBY",
                                     false));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "JFK", "2025-01-02 12:00:00", "2025-01-02 18:00:00");
    duty1->setAssignment("SBY");

    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("JFK", "SIN",
                                     "2025-01-03 16:00:00",
                                     "2025-01-04 02:00:00",
                                     "FLY",
                                     true));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "JFK", "SIN", "2025-01-03 16:00:00", "2025-01-04 02:00:00");
    duty2->setAssignment("FLY");

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}
