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
    duty->setAssignment(segments.front()->getAssignment());
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

// Test fixture for SIA 5.8 (9) Africa rule tests.
class Sia589Test : public ::testing::Test {
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
            {"JNB", 120, "Africa/Johannesburg"},
            {"CPT", 120, "Africa/Johannesburg"},
            {"DUR", 120, "Africa/Johannesburg"}
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
        addAirport("JNB", "ZA", "AFR", "JNB");
        addAirport("CPT", "ZA", "AFR", "CPT");
        addAirport("DUR", "ZA", "AFR", "DUR");
        
        // Rule 9(a)(i) - SIN-JNB-SIN
        // This is the baseline: return flight requires 2LN rest.
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "9(a)", "SIN-JNB-SIN", "JNB", 1, "*", "MVO|FLY", "00:00-06:00", "*", "*", "*", "2", "*", "*", "*", "*", "*", "*", "*", "*", "*", "SLIP"));
        // This allows specific duties after 1LN
        _input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "9(a)(i).1", "SIN-JNB-SIN", "JNB", 1, "*", "*", "00:00-06:00", "*", "*", "*", "*", "*", "*", "1", "*", "*", "*", "Duty IN (JNB-CPT-JNB; JNB-DUR-JNB)", "*", "*", "DUTY"));
        // This allows standby after 1LN
        _input.dbRules.push_back(makeAcopTableBRow(7421003, 3, "9(a)(i).2", "SIN-JNB-SIN", "JNB", 1, "*", "*", "00:00-06:00", "*", "*", "*", "*", "*", "*", "1", "*", "2", "6", "*", "*", "*", "DUTY"));
        // Positioning back to SIN
        _input.dbRules.push_back(makeAcopTableBRow(7421004, 4, "9(a)(i).3", "SIN-JNB-SIN", "JNB", 1, "MVO|FLY", "MVP", "00:00-06:00", "*", "*", "24", "1", "*", "*", "*", "*", "*", "*", "*", "*", "*", "SLIP"));
        // Rule 9(a)(ii)
        _input.dbRules.push_back(makeAcopTableBRow(7421005, 5, "9(a)(ii)", "SIN-JNB-SIN", "JNB", 1, "MVP", "MVO|FLY", "*", "*", "*", "24", "1", "*", "*", "*", "*", "*", "*", "*", "*", "*", "SLIP"));


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

TEST_F(Sia589Test, Illegal_Requires_2LN_in_JNB) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SQ478 SIN-JNB 0210-0650
    time_t sinJnbDepUtc = SIATest::utcFromLocal("2025-12-01 02:10:00", "SIN", _ctx);
    time_t sinJnbArrUtc = sinJnbDepUtc + 10*3600 + 40*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "JNB", sinJnbDepUtc, sinJnbArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 3: SQ479 JNB-SIN 1345-0610 (not enough rest for 2LN)
    time_t jnbSinDepUtc = sinJnbArrUtc + 30*3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("JNB", "SIN", jnbSinDepUtc, jnbSinDepUtc + 10*3600+25*60, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});

    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia589Test, Legal_2LN_in_JNB) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SQ478 SIN-JNB 0210-0650
    time_t sinJnbDepUtc = SIATest::utcFromLocal("2025-12-01 02:10:00", "SIN", _ctx);
    time_t sinJnbArrUtc = sinJnbDepUtc + 10*3600 + 40*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "JNB", sinJnbDepUtc, sinJnbArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 4: SQ479 JNB-SIN 1345-0610 (enough rest for 2LN)
    time_t jnbSinDepUtc = sinJnbArrUtc + 55*3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("JNB", "SIN", jnbSinDepUtc, jnbSinDepUtc + 10*3600+25*60, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

TEST_F(Sia589Test, Legal_OutOfWindow) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SIN-JNB departing at 23:10 (out of 00:00-06:00 window)
    time_t sinJnbDepUtc = SIATest::utcFromLocal("2025-12-01 23:10:00", "SIN", _ctx);
    time_t sinJnbArrUtc = sinJnbDepUtc + 10*3600 + 40*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "JNB", sinJnbDepUtc, sinJnbArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 3: JNB-SIN (short rest, but should be legal as rule doesn't apply)
    time_t jnbSinDepUtc = sinJnbArrUtc + 30*3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("JNB", "SIN", jnbSinDepUtc, jnbSinDepUtc + 10*3600+25*60, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

TEST_F(Sia589Test, Legal_JNBCPT_vv_after_1LN) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SQ478 SIN-JNB 0210-0650
    time_t sinJnbDepUtc = SIATest::utcFromLocal("2025-12-01 02:10:00", "SIN", _ctx);
    time_t sinJnbArrUtc = sinJnbDepUtc + 10*3600 + 40*60;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "JNB", sinJnbDepUtc, sinJnbArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 2: JNB-CPT-JNB after 1LN rest
    time_t jnbCptDepUtc = sinJnbArrUtc + 30*3600;
    time_t jnbCptArrUtc = jnbCptDepUtc + 2*3600;
    time_t cptJnbDepUtc = jnbCptArrUtc + 1*3600;
    time_t cptJnbArrUtc = cptJnbDepUtc + 2*3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("JNB", "CPT", jnbCptDepUtc, jnbCptArrUtc, "FLY", true, _ctx));
        dutySegs.push_back(makeSegment("CPT", "JNB", cptJnbDepUtc, cptJnbArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 4: JNB-SIN (rest after vv duty must be 2LN from original arrival)
    time_t jnbSinDepUtc = sinJnbArrUtc + 55*3600;
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("JNB", "SIN", jnbSinDepUtc, jnbSinDepUtc + 10*3600+25*60, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}
