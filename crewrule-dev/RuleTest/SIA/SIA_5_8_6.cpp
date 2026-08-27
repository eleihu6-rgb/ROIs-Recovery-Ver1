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

// Test fixture for SIA 5.8 (6) Trans-Atlantic rule tests.
class Sia586Test : public ::testing::Test {
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
            {"FRA", 60, "Europe/Berlin"},
            {"JFK", -300, "America/New_York"}
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
        addAirport("FRA", "DE", "EUR", "FRA");
        addAirport("JFK", "US", "NOA", "NYC");
        
        const std::string cop = "SIN-REUR-RNOA-REUR-SIN";
        // 6(a)
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "6(a)", cop, "REUR 1", 1, "*", "*", "*", "*", "*", "*", "2", "*", "*", "1", "*", "2", "6", "*", "*", "*"));
        // 6(b)
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 2, "6(b)", cop, "RNOA", 1, "*", "*", "*", "*", "*", "*", "2", "*", "*", "1", "*", "2", "6", "*", "*", "*"));
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 3, "6(b)", cop, "RNOA", 1, "*", "*", "*", "*", "*", "*", "1", "*", "*", "*", "*", "*", "*", "*", "*", "*"));
        // 6(c)
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 4, "6(c)", cop, "REUR 2", 1, "*", "*", "*", "1", "*", "*", "2", "*", "*", "1", "*", "2", "6", "*", "*", "*"));
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 5, "6(c)", cop, "REUR 2", 1, "*", "*", "*", "2", "*", "*", "1", "*", "*", "*", "*", "*", "*", "*", "*", "*"));

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

TEST_F(Sia586Test, Legal_2LN_in_EUR_with_SBY) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SQ026 SIN-FRA
    time_t sinFraArrUtc = SIATest::utcFromLocal("2025-12-02 05:05:00", "FRA", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "FRA", sinFraArrUtc - 13*3600-10*60, sinFraArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    //local night 1 Dec02 2200 - Dec03 06:00
    // Day 3: SBY 0900-1500
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t sbyStart = SIATest::utcFromLocal("2025-12-03 09:00:00", "FRA", _ctx);
        dutySegs.push_back(makeSegment("FRA", "FRA", sbyStart, sbyStart + 6 * 3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    //local night 2 Dec03 2200 - Dec04 06:00
    // Day 4: SQ026 FRA-JFK
    // For 2 local nights in EUR with SIA local-night definition (22:00-08:00, min 8h) and 1h report time,
    // the depart duty report time must be >= 06:00 on the second night. Use 07:35 local departure (06:35 report).
    time_t fraJfkDepUtc = SIATest::utcFromLocal("2025-12-04 07:35:00", "FRA", _ctx);
    time_t fraJfkArrUtc = fraJfkDepUtc + 8*3600+35*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "JFK", fraJfkDepUtc, fraJfkArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Add remaining flights to satisfy COP pattern SIN-REUR-RNOA-REUR-SIN.
    // JFK-FRA (ensure >= 1 local night at JFK so 6(b) passes).
    time_t jfkFraDepUtc = fraJfkArrUtc + 50*3600;
    time_t jfkFraArrUtc = jfkFraDepUtc + 7*3600+45*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("JFK", "FRA", jfkFraDepUtc, jfkFraArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // FRA-SIN (return leg; keep plenty of rest so 6(c) passes regardless of which row matches).
    time_t fraSinDepUtc = SIATest::utcFromLocal("2025-12-08 08:00:00", "FRA", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "SIN", fraSinDepUtc, fraSinDepUtc + 12*3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

TEST_F(Sia586Test, Illegal_LessThan2LN_in_EUR) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SQ026 SIN-FRA
    time_t sinFraArrUtc = SIATest::utcFromLocal("2025-12-02 05:05:00", "FRA", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "FRA", sinFraArrUtc - 13*3600-10*60, sinFraArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 3: SQ026 FRA-JFK (not enough rest)
    time_t fraJfkDepUtc = SIATest::utcFromLocal("2025-12-03 06:35:00", "FRA", _ctx);
    time_t fraJfkArrUtc = fraJfkDepUtc + 8*3600+35*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "JFK", fraJfkDepUtc, fraJfkArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Add remaining flights to satisfy COP
    time_t jfkFraDepUtc = fraJfkArrUtc + 50*3600; // Legal rest
    time_t jfkFraArrUtc = jfkFraDepUtc + 7*3600+45*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("JFK", "FRA", jfkFraDepUtc, jfkFraArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    time_t fraSinDepUtc = jfkFraArrUtc + 50*3600; // Legal rest
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "SIN", fraSinDepUtc, fraSinDepUtc + 12*3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia586Test, Legal_FullRotation_2LN_EUR_1LN_AME) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // SIN-FRA
    time_t sinFraArrUtc = SIATest::utcFromLocal("2025-12-02 05:05:00", "FRA", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "FRA", sinFraArrUtc - 13*3600-10*60, sinFraArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // SBY in FRA (kept after the first local night so the crew can still achieve 2 local nights before FRA-JFK)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t sbyStart = SIATest::utcFromLocal("2025-12-03 09:00:00", "FRA", _ctx);
        dutySegs.push_back(makeSegment("FRA", "FRA", sbyStart, sbyStart + 6 * 3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // FRA-JFK (ensure 2 local nights at FRA before departure; see note in Legal_2LN_in_EUR_with_SBY).
    time_t fraJfkDepUtc = SIATest::utcFromLocal("2025-12-04 07:35:00", "FRA", _ctx);
    time_t fraJfkArrUtc = fraJfkDepUtc + 8*3600+35*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "JFK", fraJfkDepUtc, fraJfkArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // JFK-FRA (1LN rest)
    time_t jfkFraDepUtc = fraJfkArrUtc + 28*3600;
    time_t jfkFraArrUtc = jfkFraDepUtc + 7*3600+45*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("JFK", "FRA", jfkFraDepUtc, jfkFraArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // FRA-SIN (rest in FRA is conditional, 1LN in JFK means 2LN in FRA)
    // Ensure 2 local nights in FRA after JFK-FRA arrival (22:00-08:00, min 8h; report time 1h).
    time_t fraSinDepUtc = SIATest::utcFromLocal("2025-12-08 08:00:00", "FRA", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "SIN", fraSinDepUtc, fraSinDepUtc + 12*3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

TEST_F(Sia586Test, Illegal_LessThan1LN_in_AME) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // SIN-FRA
    time_t sinFraArrUtc = SIATest::utcFromLocal("2025-12-02 05:05:00", "FRA", _ctx);
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "FRA", sinFraArrUtc - 13*3600-10*60, sinFraArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // SBY in FRA (after 1LN so the 2LN-in-EUR requirement can still be met)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t sbyStart = SIATest::utcFromLocal("2025-12-03 09:00:00", "FRA", _ctx);
        dutySegs.push_back(makeSegment("FRA", "FRA", sbyStart, sbyStart + 6 * 3600, "SBY", false, _ctx));
        duties.push_back(makeDuty(dutySegs, true).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // FRA-JFK (ensure 2 local nights at FRA before departure; see note in Legal_2LN_in_EUR_with_SBY).
    time_t fraJfkDepUtc = SIATest::utcFromLocal("2025-12-04 07:35:00", "FRA", _ctx);
    time_t fraJfkArrUtc = fraJfkDepUtc + 8*3600+35*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "JFK", fraJfkDepUtc, fraJfkArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // JFK-FRA (less than 1LN rest)
    time_t jfkFraDepUtc = fraJfkArrUtc + 15*3600;
    time_t jfkFraArrUtc = jfkFraDepUtc + 7*3600+45*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("JFK", "FRA", jfkFraDepUtc, jfkFraArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // FRA-SIN
    time_t fraSinDepUtc = jfkFraArrUtc + 50*3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "SIN", fraSinDepUtc, fraSinDepUtc + 12*3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}
