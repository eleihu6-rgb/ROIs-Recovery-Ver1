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

time_t utcFromLocal(const std::string& localDateTime,
                    const std::string& station,
                    const std::shared_ptr<CrewDataContext>& ctx) {
    return TimezoneUtils::LocalDateTimeToUtc(localDateTime, ctx->getAirportZoneId(station));
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
    seg->setFlightNumber("SQ322");
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
                         const std::string& reportTimeWindow,
                         const std::string& minSlipLocalNights,
                         const std::string& slipDepartDutyReportTime,
                         const std::string& dutyAfterLocalTime,
                         const std::string& maxStandbyPeriods,
                         const std::string& maxStandbyHours,
                         const std::string& allowedDutyWithinSlip,
                         const std::string& group = "DEFAULT") {
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
    rule.params["Slip Arr Is Operating"] = "*";
    rule.params["Slip Dep Is Operating"] = "*";
    rule.params["Reporting time at base"] = reportTimeWindow;
    rule.params["Min slip local nights"] = minSlipLocalNights;
    rule.params["Min Slip Dep Time after LN"] = slipDepartDutyReportTime;
    rule.params["Duty Time After LN"] = dutyAfterLocalTime;
    rule.params["Max Standby periods"] = maxStandbyPeriods;
    rule.params["Max standby hours"] = maxStandbyHours;
    // Fill other params with defaults
    rule.params["Duty Assignment before slip"] = "*";
    rule.params["Duty Assignment after slip"] = "*";
    rule.params["Min slip hours"] = "*";
    rule.params["Previous Slip Local Nights"] = "*";
    rule.params["Previous Slip had standby"] = "*";
    rule.params["Duty After Hours"] = "*";
    rule.params["Duty After Local Nights"] = "*";
    rule.params["Allowed duty within slip"] = allowedDutyWithinSlip;
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

// Test fixture for SIA 5.8 (4a) Part 2 rule tests.
class Sia584aPart2Test : public ::testing::Test {
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
            {"LHR", 0, "Europe/London"}
        });

        auto addAirport = [&](const char* code, const char* country, const char* city, const char* category) {
            auto* a = new DBAirport();
            std::strncpy(a->airport, code, 3);
            a->airport[3] = '\0';
            std::strncpy(a->country, country, 2);
            a->country[2] = '\0';
            std::strncpy(a->city, city, 3);
            a->city[3] = '\0';
            a->category = category;
            _ctx->airportCodeMap[code] = a;
        };
        addAirport("SIN", "SG", "SIN", "SEA");
        addAirport("LHR", "GB", "LON", "EUR");
        
        _input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "(4)(a)(i)", "SIN-CLON-SIN", "CLON", 1, "22:00-02:59", "2", "06:00", "00:00", "2", "6", "*"));
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

TEST_F(Sia584aPart2Test, LegalPairing_TwoStandbysAndLateReturn) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: SIN-LHR, report 22:00LT, dep 23:00LT (Day 1) -> arr 05:00LT (Day 2)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN",
                                       "LHR",
                                       utcFromLocal("2025-12-01 23:00:00", "SIN", _ctx),
                                       utcFromLocal("2025-12-02 03:55:00", "LHR", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Slip for 2 local nights (rest on Day 2, Day 3)
    // Day after arrival is Day 3. Standby allowed.
    // Two standby duties on Day 3
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "LHR",
                                       utcFromLocal("2025-12-03 10:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-03 13:00:00", "LHR", _ctx),
                                       "SBY",
                                       false,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "LHR",
                                       utcFromLocal("2025-12-03 14:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-03 17:00:00", "LHR", _ctx),
                                       "SBY",
                                       false,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    // Following day is Day 4. Operate LHR-SIN after 06:00LT.
    // Duty 4: LHR-SIN, dep 07:01LT (Day 4) so that duty report time (1h) still allows 2 local nights.
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "SIN",
                                       utcFromLocal("2025-12-04 07:01:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-05 04:01:00", "SIN", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    const bool ok = rule.CheckRule(&pairing);
    EXPECT_TRUE(ok);
}

TEST_F(Sia584aPart2Test, IllegalPairing_TooManyStandbys) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: SIN-LHR
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN",
                                       "LHR",
                                       utcFromLocal("2025-12-01 23:00:00", "SIN", _ctx),
                                       utcFromLocal("2025-12-02 05:00:00", "LHR", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Three standby duties on Day 3
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "LHR",
                                       utcFromLocal("2025-12-03 10:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-03 12:00:00", "LHR", _ctx),
                                       "SBY",
                                       false,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "LHR",
                                       utcFromLocal("2025-12-03 13:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-03 15:00:00", "LHR", _ctx),
                                       "SBY",
                                       false,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "LHR",
                                       utcFromLocal("2025-12-03 16:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-03 18:00:00", "LHR", _ctx),
                                       "SBY",
                                       false,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    // Final flight
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "SIN",
                                       utcFromLocal("2025-12-04 07:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-05 04:00:00", "SIN", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia584aPart2Test, IllegalPairing_ReturnFlightTooEarly) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: SIN-LHR
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN",
                                       "LHR",
                                       utcFromLocal("2025-12-01 23:00:00", "SIN", _ctx),
                                       utcFromLocal("2025-12-02 05:00:00", "LHR", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Two standby duties on Day 3
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "LHR",
                                       utcFromLocal("2025-12-03 10:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-03 13:00:00", "LHR", _ctx),
                                       "SBY",
                                       false,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "LHR",
                                       utcFromLocal("2025-12-03 14:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-03 17:00:00", "LHR", _ctx),
                                       "SBY",
                                       false,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    // Duty 4: LHR-SIN, dep 06:00LT (Day 4) -> Not "after" 06:00
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "SIN",
                                       utcFromLocal("2025-12-04 06:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-05 03:00:00", "SIN", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia584aPart2Test, LegalPairing_ReturnFlightAfter6am) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Duty 1: SIN-LHR
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN",
                                       "LHR",
                                       utcFromLocal("2025-12-01 23:00:00", "SIN", _ctx),
                                       utcFromLocal("2025-12-02 05:00:00", "LHR", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Two standby duties on Day 3
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "LHR",
                                       utcFromLocal("2025-12-03 10:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-03 13:00:00", "LHR", _ctx),
                                       "SBY",
                                       false,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "LHR",
                                       utcFromLocal("2025-12-03 14:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-03 17:00:00", "LHR", _ctx),
                                       "SBY",
                                       false,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 4: LHR-SIN, dep 07:01LT (Day 4) so that duty report time (1h) still allows 2 local nights.
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "SIN",
                                       utcFromLocal("2025-12-04 07:01:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-05 04:01:00", "SIN", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    SIATest::applyReportReleaseToDuties(duties, { 60, 30, 60 });
    Pairing pairing(duties);

    const bool ok = rule.CheckRule(&pairing);
    
    EXPECT_TRUE(ok);
}


TEST_F(Sia584aPart2Test, IllegalPairing_NotEnoughSlipNights) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    // Duty 1: SIN-LHR
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN",
                                       "LHR",
                                       utcFromLocal("2025-12-01 23:00:00", "SIN", _ctx),
                                       utcFromLocal("2025-12-02 05:00:00", "LHR", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Only one local night of slip. Return flight on Day 3.
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("LHR",
                                       "SIN",
                                       utcFromLocal("2025-12-03 21:00:00", "LHR", _ctx),
                                       utcFromLocal("2025-12-04 18:00:00", "SIN", _ctx),
                                       "FLY",
                                       true,
                                       _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}
