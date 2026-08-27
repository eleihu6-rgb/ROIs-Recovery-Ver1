#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7009/CheckSingleDutyPerDayRule.h"
#include "db/Pairing.h"
#include "db/Duty.h"
#include "db/Segment.h"
#include "db/RuleParams.h"
#include "db/CrewDB.h"

#include <cstdio>
#include <cstring>
#include <ctime>
#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    int year = 0;
    int month = 0;
    int day = 0;
    int hour = 0;
    int minute = 0;
    int second = 0;
    if (std::sscanf(s.c_str(), "%d-%d-%d %d:%d:%d", &year, &month, &day, &hour, &minute, &second) != 6) {
        return 0;
    }
    std::tm tm{};
    tm.tm_year = year - 1900;
    tm.tm_mon = month - 1;
    tm.tm_mday = day;
    tm.tm_hour = hour;
    tm.tm_min = minute;
    tm.tm_sec = second;
    tm.tm_isdst = 0;
#ifdef _WIN32
    return _mkgmtime(&tm);
#else
    return timegm(&tm);
#endif
}

struct SegmentConfig {
    std::string depStation;
    std::string arrStation;
    std::string startUtc;
    std::string endUtc;
    std::string startLoc;
    std::string endLoc;
    std::string fleet = "777";
};

std::unique_ptr<Segment> makeSegment(const SegmentConfig& cfg) {
    auto seg = std::make_unique<Segment>();
    seg->setDepSta(cfg.depStation);
    seg->setArrSta(cfg.arrStation);
    seg->setStartTimeUtcAct(utcFromString(cfg.startUtc));
    seg->setEndTimeUtcAct(utcFromString(cfg.endUtc));
    const std::string startLoc = cfg.startLoc.empty() ? cfg.startUtc : cfg.startLoc;
    const std::string endLoc = cfg.endLoc.empty() ? cfg.endUtc : cfg.endLoc;
    seg->setStartTimeLocAct(utcFromString(startLoc));
    seg->setEndTimeLocAct(utcFromString(endLoc));
    seg->setFleetCD(cfg.fleet);
    return seg;
}

std::unique_ptr<Duty> makeDuty(std::vector<std::unique_ptr<Segment>>& segments, const SharedPtr<CrewDataContext>& ctx) {
    (void)ctx;
    auto duty = std::make_unique<Duty>();
    std::vector<Segment*> segPtrs;
    for(auto& seg : segments) {
        segPtrs.push_back(seg.get());
    }
    duty->setSegments(segPtrs);

    if (!segments.empty()) {
        const std::string depStation = segments.front()->getDepSta();
        const std::string arrStation = segments.back()->getArrSta();

        duty->setDepartureStation(depStation);
        duty->setArrivalStation(arrStation);
        
        const time_t startUtc = segments.front()->getStartTimeUtcAct();
        const time_t endUtc = segments.back()->getEndTimeUtcAct();

        duty->setStartTimeUtcAct(startUtc);
        duty->setEndTimeUtcAct(endUtc);

        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
        
        duty->setAssignment("FLY"); // Default assignment for duties created in tests
    }
    return duty;
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["SIN"] = 8 * 60;
    ctx->airportUtcOffsetMap["FRA"] = 1 * 60;
    ctx->airportUtcOffsetMap["BJS"] = 8 * 60;
    ctx->airportUtcOffsetMap["JFK"] = -5 * 60; // America/New_York
    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
    ctx->airportZoneIdMap["FRA"] = "Europe/Berlin";
    ctx->airportZoneIdMap["BJS"] = "Asia/Shanghai";
    ctx->airportZoneIdMap["JFK"] = "America/New_York";
    
    FLEET fleet777;
    fleet777.fleet = "777";
    fleet777.fleetGrp = "777";
    ctx->fleetMap["777"] = fleet777;
    
    FLEET fleetA380;
    fleetA380.fleet = "A380";
    fleetA380.fleetGrp = "A380";
    ctx->fleetMap["A380"] = fleetA380;
    
    return ctx;
}

std::unique_ptr<Pairing> makePairingWithBase(const SharedPtr<CrewDataContext>& ctx, const std::string& base, long long pairingId) {
    auto pairing = std::make_unique<Pairing>();
    pairing->setBase(base);
    pairing->setDbId(pairingId);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();
    return pairing;
}

struct Rule7009Param {
    std::string level = "D";
    std::string fleetGroups = "*";
    std::string assignmentGroups = "*";
    std::string assignments = "*";
    std::string timeZone = "LOCAL"; // LOCAL/L for current behavior, BASE/B for base time
    std::string prevPeriodHeader = "PREV ROSTER START";
    std::string nextPeriodHeader = "NEXT ROSTER END";
    std::string prevRosterStart = "E"; // E for end time, S for start time
    std::string nextRosterEnd = "S";   // E for end time, S for start time
};

RuleInput makeRuleInput(const Rule7009Param& param) {
    RuleInput input;
    DBRule dbRule;
    dbRule.idRule = 7009;
    dbRule.idRuleParam = 1;
    dbRule.function = 7009;
    std::strncpy(dbRule.classType, "P", sizeof(dbRule.classType) - 1);
    std::strncpy(dbRule.description, "Rule7009 test params", sizeof(dbRule.description) - 1);

    dbRule.params["LEVEL"] = param.level;
    dbRule.params["FLEET GROUPS"] = param.fleetGroups;
    if (!param.timeZone.empty()) {
        dbRule.params["TIME ZONE"] = param.timeZone;
    }
    dbRule.params[param.prevPeriodHeader] = param.prevRosterStart;
    dbRule.params[param.nextPeriodHeader] = param.nextRosterEnd;

    dbRule.params["ASSIGNMENT GROUPS"] = param.assignmentGroups;
    dbRule.params["ASSIGNMENT"] = param.assignments;

    input.dbRules.push_back(std::move(dbRule));
    return input;
}

}  // namespace

class Rule7009Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        violations.clear();
        violationMessages.clear();
    }

    void TearDown() override {
        for (auto* rv : violations) {
            delete rv;
        }
        violations.clear();
    }

    void attachViolations(CheckSingleDutyPerDayRule& rule) {
        rule.setRuleViolation(&violations);
        rule.setViolations(&violationMessages);
    }

    std::vector<RULE_VIOLATION*> violations{};
    std::vector<std::string> violationMessages{};
};

TEST_F(Rule7009Test, SameDayDutyViolation_LocalTime) {
    auto ctx = buildDataContext();
    Rule7009Param ruleParam; // Defaults to Level=D, TimeZone=LOCAL
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"SIN", "FRA",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00",
                                 "2025-06-01 18:00:00", "2025-06-02 00:00:00"})); // Duty ends 2025-06-02 00:00:00 local (SIN)
    auto duty1 = makeDuty(segs1, ctx);

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"FRA", "SIN",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00",
                                 "2025-06-02 06:00:00", "2025-06-02 12:00:00"})); // Duty starts 2025-06-02 06:00:00 local (SIN)
    auto duty2 = makeDuty(segs2, ctx);
    
    std::vector<Duty*> duties = {duty1.get(), duty2.get()};
    
    EXPECT_FALSE(rule.CheckRule(duties));
}

TEST_F(Rule7009Test, SameDayDutyViolation_LocalAlias) {
    auto ctx = buildDataContext();
    Rule7009Param ruleParam; 
    ruleParam.timeZone = "L"; // Alias for LOCAL
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    std::vector<std::unique_ptr<Segment>> segs1;
    // Duty 1 SIN-FRA: ends 2025-06-01 22:00 UTC (2025-06-01 23:00 FRA local)
    segs1.push_back(makeSegment({"SIN", "FRA",
                                 "2025-06-01 10:00:00", "2025-06-01 22:00:00",
                                 "2025-06-01 20:00:00", "2025-06-01 23:00:00"})); 
    auto duty1 = makeDuty(segs1, ctx);

    std::vector<std::unique_ptr<Segment>> segs2;
    // Duty 2 FRA-JFK: starts 2025-06-01 22:30 UTC (2025-06-01 23:30 FRA local)
    segs2.push_back(makeSegment({"FRA", "JFK",
                                 "2025-06-01 22:30:00", "2025-06-02 02:30:00",
                                 "2025-06-01 23:30:00", "2025-06-02 07:30:00"})); 
    auto duty2 = makeDuty(segs2, ctx);
    
    std::vector<Duty*> duties = {duty1.get(), duty2.get()};
    
    EXPECT_FALSE(rule.CheckRule(duties));
}

TEST_F(Rule7009Test, SameDayDutyViolation_NewLevelCheckPeriodHeaders) {
    auto ctx = buildDataContext();
    Rule7009Param ruleParam;
    ruleParam.prevPeriodHeader = "PREV LEVEL CHECK PERIOD";
    ruleParam.nextPeriodHeader = "NEXT LEVEL CHECK PERIOD";
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"SIN", "FRA",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00",
                                 "2025-06-01 18:00:00", "2025-06-02 00:00:00"}));
    auto duty1 = makeDuty(segs1, ctx);

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"FRA", "SIN",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00",
                                 "2025-06-02 06:00:00", "2025-06-02 12:00:00"}));
    auto duty2 = makeDuty(segs2, ctx);

    std::vector<Duty*> duties = {duty1.get(), duty2.get()};

    EXPECT_FALSE(rule.CheckRule(duties));
}

TEST_F(Rule7009Test, BaseTimeOverridesLocalDay) {
    auto ctx = buildDataContext();
    auto pairing = makePairingWithBase(ctx, "SIN", 1001);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"FRA", "FRA",
                                 "2025-06-01 20:00:00", "2025-06-01 22:30:00",
                                 "2025-06-01 21:00:00", "2025-06-01 23:30:00"})); // Local day 2025-06-01 (FRA)
    auto duty1 = makeDuty(segs1, ctx);
    duty1->setPairingId(pairing->getDbId());

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"JFK", "JFK",
                                 "2025-06-02 05:30:00", "2025-06-02 09:30:00",
                                 "2025-06-02 00:30:00", "2025-06-02 04:30:00"})); // Local day 2025-06-02 (JFK)
    auto duty2 = makeDuty(segs2, ctx);
    duty2->setPairingId(pairing->getDbId());

    std::vector<Duty*> duties = {duty1.get(), duty2.get()};

    Rule7009Param baseParam;
    baseParam.timeZone = "BASE";
    auto baseRule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(baseParam));
    baseRule.setDataContext(ctx);
    attachViolations(baseRule);

    Rule7009Param localParam;
    localParam.timeZone = "LOCAL";
    auto localRule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(localParam));
    localRule.setDataContext(ctx);
    attachViolations(localRule);

    EXPECT_FALSE(baseRule.CheckRule(duties)); // Base day is the same (SIN)
    EXPECT_TRUE(localRule.CheckRule(duties)); // Local days differ (FRA vs JFK)
}

TEST_F(Rule7009Test, BaseTimeOverridesLocalDay_WithMixedPeriodHeaders) {
    auto ctx = buildDataContext();
    auto pairing = makePairingWithBase(ctx, "SIN", 1002);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"FRA", "FRA",
                                 "2025-06-01 20:00:00", "2025-06-01 22:30:00",
                                 "2025-06-01 21:00:00", "2025-06-01 23:30:00"}));
    auto duty1 = makeDuty(segs1, ctx);
    duty1->setPairingId(pairing->getDbId());

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"JFK", "JFK",
                                 "2025-06-02 05:30:00", "2025-06-02 09:30:00",
                                 "2025-06-02 00:30:00", "2025-06-02 04:30:00"}));
    auto duty2 = makeDuty(segs2, ctx);
    duty2->setPairingId(pairing->getDbId());

    std::vector<Duty*> duties = {duty1.get(), duty2.get()};

    Rule7009Param baseParam;
    baseParam.timeZone = "BASE";
    baseParam.prevPeriodHeader = "PREV LEVEL CHECK PERIOD";
    auto baseRule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(baseParam));
    baseRule.setDataContext(ctx);
    attachViolations(baseRule);

    EXPECT_FALSE(baseRule.CheckRule(duties));
}

TEST_F(Rule7009Test, BaseTimeAliasB) {
    auto ctx = buildDataContext();
    auto pairing = makePairingWithBase(ctx, "SIN", 1002);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"FRA", "FRA",
                                 "2025-06-01 20:00:00", "2025-06-01 22:30:00",
                                 "2025-06-01 21:00:00", "2025-06-01 23:30:00"}));
    auto duty1 = makeDuty(segs1, ctx);
    duty1->setPairingId(pairing->getDbId());

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"JFK", "JFK",
                                 "2025-06-02 05:30:00", "2025-06-02 09:30:00",
                                 "2025-06-02 00:30:00", "2025-06-02 04:30:00"}));
    auto duty2 = makeDuty(segs2, ctx);
    duty2->setPairingId(pairing->getDbId());

    std::vector<Duty*> duties = {duty1.get(), duty2.get()};

    Rule7009Param ruleParam;
    ruleParam.timeZone = "B"; // Alias for BASE
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    EXPECT_FALSE(rule.CheckRule(duties));
}

TEST_F(Rule7009Test, MissingTimeZoneDefaultsToLocal) {
    auto ctx = buildDataContext();
    Rule7009Param ruleParam;
    ruleParam.timeZone.clear(); // Do not set TIME ZONE param
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"SIN", "FRA",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00",
                                 "2025-06-01 18:00:00", "2025-06-02 00:00:00"}));
    auto duty1 = makeDuty(segs1, ctx);

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"FRA", "SIN",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00",
                                 "2025-06-02 06:00:00", "2025-06-02 12:00:00"}));
    auto duty2 = makeDuty(segs2, ctx);

    std::vector<Duty*> duties = {duty1.get(), duty2.get()};

    EXPECT_FALSE(rule.CheckRule(duties));
}

TEST_F(Rule7009Test, DifferentDayDutyPass) {
    auto ctx = buildDataContext();
    Rule7009Param ruleParam;
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"SIN", "BJS",
                                 "2025-06-01 10:00:00", "2025-06-01 12:00:00",
                                 "2025-06-01 10:00:00", "2025-06-01 12:00:00"}));
    auto duty1 = makeDuty(segs1, ctx);

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"BJS", "SIN",
                                 "2025-06-02 18:00:00", "2025-06-02 20:00:00",
                                 "2025-06-02 18:00:00", "2025-06-02 20:00:00"}));
    auto duty2 = makeDuty(segs2, ctx);
    
    std::vector<Duty*> duties = {duty1.get(), duty2.get()};
    
    EXPECT_TRUE(rule.CheckRule(duties));
}

TEST_F(Rule7009Test, FleetGroupFilterFail) {
    auto ctx = buildDataContext();
    Rule7009Param ruleParam;
    ruleParam.fleetGroups = "777"; // Rule applies to 777
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"SIN", "FRA",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00",
                                 "777"}));
    auto duty1 = makeDuty(segs1, ctx);

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"FRA", "SIN",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00",
                                 "777"}));
    auto duty2 = makeDuty(segs2, ctx);
    
    std::vector<Duty*> duties = {duty1.get(), duty2.get()};
    
    EXPECT_FALSE(rule.CheckRule(duties)); // Should fail because duties are on same day and fleet matches
}

TEST_F(Rule7009Test, FleetGroupFilterPass) {
    auto ctx = buildDataContext();
    Rule7009Param ruleParam;
    ruleParam.fleetGroups = "A380"; // Rule applies to A380
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"SIN", "FRA",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00",
                                 "777"}));
    auto duty1 = makeDuty(segs1, ctx);

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"FRA", "SIN",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00",
                                 "777"}));
    auto duty2 = makeDuty(segs2, ctx);
    
    std::vector<Duty*> duties = {duty1.get(), duty2.get()};
    
    EXPECT_TRUE(rule.CheckRule(duties)); // Should pass because duties are 777, rule is for A380
}

TEST_F(Rule7009Test, AssignmentFilterFail) {
    auto ctx = buildDataContext();
    Rule7009Param ruleParam;
    ruleParam.assignments = "FLY"; // Rule applies to FLY assignments
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"SIN", "FRA",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00"}));
    auto duty1 = makeDuty(segs1, ctx);
    duty1->setAssignment("FLY");

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"FRA", "SIN",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00"}));
    auto duty2 = makeDuty(segs2, ctx);
    duty2->setAssignment("FLY");
    
    std::vector<Duty*> duties = {duty1.get(), duty2.get()};
    
    EXPECT_FALSE(rule.CheckRule(duties)); // Should fail because duties are on same day and assignment matches
}

TEST_F(Rule7009Test, AssignmentFilterPass) {
    auto ctx = buildDataContext();
    Rule7009Param ruleParam;
    ruleParam.assignments = "SBY"; // Rule applies to SBY assignments
    auto rule = CheckSingleDutyPerDayRule(nullptr, makeRuleInput(ruleParam));
    rule.setDataContext(ctx);
    attachViolations(rule);

    std::vector<std::unique_ptr<Segment>> segs1;
    segs1.push_back(makeSegment({"SIN", "FRA",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00",
                                 "2025-06-01 10:00:00", "2025-06-01 16:00:00"}));
    auto duty1 = makeDuty(segs1, ctx);
    duty1->setAssignment("FLY");

    std::vector<std::unique_ptr<Segment>> segs2;
    segs2.push_back(makeSegment({"FRA", "SIN",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00",
                                 "2025-06-01 22:00:00", "2025-06-02 04:00:00"}));
    auto duty2 = makeDuty(segs2, ctx);
    duty2->setAssignment("FLY");
    
    std::vector<Duty*> duties = {duty1.get(), duty2.get()};
    
    EXPECT_TRUE(rule.CheckRule(duties)); // Should pass because duties are FLY, rule is for SBY
}
