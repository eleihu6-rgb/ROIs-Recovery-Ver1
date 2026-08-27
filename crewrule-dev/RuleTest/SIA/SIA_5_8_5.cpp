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

// Test fixture for SIA 5.8 (5) rule tests.
class Sia585Test : public ::testing::Test {
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
            {"NRT", 540, "Asia/Tokyo"},
            {"LAX", -480, "America/Los_Angeles"}
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
        addAirport("NRT", "JP", "ASIA", "TYO");
        addAirport("LAX", "US", "USA", "LAX");
        
        // Rule 5.8.(5)
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "5(h)", "SIN-CTYO-LAX-CTYO-SIN", "LAX", 1, "*", "*", "*", "*", "*", "*", "2", "*", "*", "*", "*", "2", "6", "*", "*", "*"));
        _input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "5(h)", "SIN-CTYO-LAX-CTYO-SIN", "CTYO 1", 1, "*", "*", "*", "*", "*", "*", "1", "*", "*", "*", "*", "*", "*", "*", "*", "*"));
        _input.dbRules.push_back(makeAcopTableBRow(7421003, 3, "5(h)", "SIN-CTYO-LAX-CTYO-SIN", "CTYO 2", 1, "*", "*", "*", "*", "*", "*", "1", "*", "*", "*", "*", "*", "*", "*", "*", "*"));
    
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

// Test Case 1: Legal, 1 LN before NRT-LAX
TEST_F(Sia585Test, Legal_1LN_at_TYO) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-NRT
    time_t sinNrtArrUtc = utcFromString("2025-12-01 17:00:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "NRT", sinNrtArrUtc - 7 * 3600, sinNrtArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: NRT-LAX. Rest > 1LN
    time_t nrtLaxDepUtc = SIATest::utcFromLocal("2025-12-03 09:00:00", "NRT", _ctx);
    time_t nrtLaxArrUtc = nrtLaxDepUtc + 10 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("NRT", "LAX", nrtLaxDepUtc, nrtLaxArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Add remaining flights to satisfy COP
    // Need 2 local nights at LAX per SIA local-night definition (22:00-08:00, min 8h).
    time_t laxNrtDepUtc = SIATest::utcFromLocal("2025-12-05 07:00:00", "LAX", _ctx);
    time_t laxNrtArrUtc = laxNrtDepUtc + 12 * 3600;
      {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LAX", "NRT", laxNrtDepUtc, laxNrtArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    time_t nrtSinDepUtc = laxNrtArrUtc + 30 * 3600; // Legal 1LN rest
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("NRT", "SIN", nrtSinDepUtc, nrtSinDepUtc + 7 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Test Case 2: Illegal, less than 1LN before NRT-LAX
TEST_F(Sia585Test, Illegal_LessThan1LN_at_TYO) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-NRT
    time_t sinNrtArrUtc = utcFromString("2025-12-01 17:00:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "NRT", sinNrtArrUtc - 7 * 3600, sinNrtArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: NRT-LAX. Rest < 1LN
    time_t nrtLaxDepUtc = sinNrtArrUtc + 15 * 3600; // Not enough rest for 1LN
    time_t nrtLaxArrUtc = nrtLaxDepUtc + 10 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("NRT", "LAX", nrtLaxDepUtc, nrtLaxArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    // Add remaining flights to satisfy COP
    time_t laxNrtDepUtc = SIATest::utcFromLocal("2025-12-05 07:00:00", "LAX", _ctx);
    time_t laxNrtArrUtc = laxNrtDepUtc + 12 * 3600;
     {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LAX", "NRT", laxNrtDepUtc, laxNrtArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    time_t nrtSinDepUtc = laxNrtArrUtc + 30 * 3600; // Legal 1LN rest
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("NRT", "SIN", nrtSinDepUtc, nrtSinDepUtc + 7 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test Case 3: Illegal, less than 2LN at LAX
TEST_F(Sia585Test, Illegal_LessThan2LN_at_LAX) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-NRT
    time_t sinNrtArrUtc = utcFromString("2025-12-01 17:00:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "NRT", sinNrtArrUtc - 7 * 3600, sinNrtArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 2: NRT-LAX
    time_t nrtLaxDepUtc = SIATest::utcFromLocal("2025-12-03 09:00:00", "NRT", _ctx);
    time_t nrtLaxArrUtc = nrtLaxDepUtc + 10 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("NRT", "LAX", nrtLaxDepUtc, nrtLaxArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 3: LAX-NRT, rest < 2LN
    time_t laxNrtDepUtc = nrtLaxArrUtc + 30 * 3600; // Not enough rest for 2LN
    time_t laxNrtArrUtc = laxNrtDepUtc + 12 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LAX", "NRT", laxNrtDepUtc, laxNrtArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Add remaining flights to satisfy COP
    time_t nrtSinDepUtc = laxNrtArrUtc + 30 * 3600; // Legal 1LN rest
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("NRT", "SIN", nrtSinDepUtc, nrtSinDepUtc + 7 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test Case 4: Legal, 2LN at LAX
TEST_F(Sia585Test, Legal_2LN_at_LAX) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-NRT
    time_t sinNrtArrUtc = utcFromString("2025-12-01 17:00:00");
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "NRT", sinNrtArrUtc - 7 * 3600, sinNrtArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 2: NRT-LAX
    time_t nrtLaxDepUtc = SIATest::utcFromLocal("2025-12-03 09:00:00", "NRT", _ctx);
    time_t nrtLaxArrUtc = nrtLaxDepUtc + 10 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("NRT", "LAX", nrtLaxDepUtc, nrtLaxArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 4: LAX-NRT, rest >= 2LN
    time_t laxNrtDepUtc = SIATest::utcFromLocal("2025-12-05 07:00:00", "LAX", _ctx);
    time_t laxNrtArrUtc = laxNrtDepUtc + 12 * 3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LAX", "NRT", laxNrtDepUtc, laxNrtArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Add remaining flights to satisfy COP
    time_t nrtSinDepUtc = laxNrtArrUtc + 30 * 3600; // Legal 1LN rest
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("NRT", "SIN", nrtSinDepUtc, nrtSinDepUtc + 7 * 3600, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}
