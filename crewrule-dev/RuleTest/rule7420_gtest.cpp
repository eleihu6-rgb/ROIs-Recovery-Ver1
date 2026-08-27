#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7420/AcopFdpPatternRule.h"

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

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     bool isOperating) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD("SQ");
    seg->setFlightNumber("SQTEST");
    seg->setAssignment(isOperating ? "FLY" : "DHD");
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

    duty->setDepartureStation(depStation);
    duty->setArrivalStation(arrStation);

    return duty;
}

DBRule makeAcopTableARow(long long ruleId,
                         int rowNum,
                         const std::string& clause,
                         const std::string& flightDep,
                         const std::string& flightArr,
                         const std::string& reportTimeWindow,
                         int maxOperatingSectors,
                         const std::string& deadheadAllowed,
                         int nextDutyDayOffset,
                         const std::string& forbiddenNextDutyPattern,
                         const std::string& appliesAtSlipStation) {
    DBRule rule{};
    rule.idRule = ruleId;
    rule.function = 7420;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 742000000 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SQ";
    rule.category = "ACOP";
    rule.params["Clause"] = clause;
    rule.params["Flight Dep"] = flightDep;
    rule.params["Flight Arr"] = flightArr;
    rule.params["Reporting time (LT)"] = reportTimeWindow;
    rule.params["Limitation: max operating sectors in FDP"] = std::to_string(maxOperatingSectors);
    rule.params["Limitation: deadhead allowed"] = deadheadAllowed;
    rule.params["Next duty day offset"] = std::to_string(nextDutyDayOffset);
    rule.params["Forbidden next pattern"] = forbiddenNextDutyPattern;
    rule.params["Applies at slip station"] = appliesAtSlipStation;
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

class Rule7420Test : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
    }

    void configureRule(AcopFdpPatternRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }

    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
};

TEST(LocationMatchUtilsTest, MatchesAirportCountryAndRegionTokens) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);

    auto* syd = new DBAirport();
    std::strncpy(syd->airport, "SYD", 3);
    syd->airport[3] = '\0';
    std::strncpy(syd->country, "AU", 2);
    syd->country[2] = '\0';
    syd->category = "AUS";
    ctx->airportCodeMap["SYD"] = syd;

    auto* sin = new DBAirport();
    std::strncpy(sin->airport, "SIN", 3);
    sin->airport[3] = '\0';
    std::strncpy(sin->country, "SG", 2);
    sin->country[2] = '\0';
    sin->category = "SEA";
    ctx->airportCodeMap["SIN"] = sin;

    auto parsed = LocationMatchUtils::ParseLocationSet("AU|RAUS|SIN");
    EXPECT_TRUE(parsed.MatchesAirport("SYD", ctx.get()));
    EXPECT_TRUE(parsed.MatchesAirport("SIN", ctx.get()));
    EXPECT_FALSE(parsed.MatchesAirport("JFK", ctx.get()));

    delete syd;
    delete sin;
}

TEST_F(Rule7420Test, AllowsOneOperatingSectorWithDeadheadWhenInWindow) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420001, 1, "(2)", "SIN", "TYO|OSA|FUK|NGO|SDJ", "22:00-02:59", 1, "Yes", 0, "No", "*"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(
        makeSegment("SIN", "TYO", "2025-01-10 22:30:00", "2025-01-11 05:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(
        makeSegment("TYO", "SIN", "2025-01-11 06:00:00", "2025-01-11 12:00:00", false));
    segs.push_back(segStorage.back().get());

    auto duty = makeDuty(segs, "SIN", "SIN", "2025-01-10 22:30:00", "2025-01-11 12:00:00");
    EXPECT_TRUE(rule.CheckRule(duty.get()));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7420Test, ViolatesWhenMoreThanOneOperatingSectorWithinFdp) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420001, 1, "(2)", "SIN", "TYO|OSA|FUK|NGO|SDJ", "22:00-02:59", 1, "Yes", 0, "No", "*"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(
        makeSegment("SIN", "TYO", "2025-01-10 22:30:00", "2025-01-11 05:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(
        makeSegment("TYO", "SIN", "2025-01-11 06:00:00", "2025-01-11 12:00:00", true));
    segs.push_back(segStorage.back().get());

    auto duty = makeDuty(segs, "SIN", "SIN", "2025-01-10 22:30:00", "2025-01-11 12:00:00");
    EXPECT_FALSE(rule.CheckRule(duty.get()));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("[SQ][ACOP]"), std::string::npos);
}

TEST_F(Rule7420Test, DoesNotApplyOutsideReportTimeWindow) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420001, 1, "(2)", "SIN", "TYO|OSA|FUK|NGO|SDJ", "22:00-02:59", 1, "Yes", 0, "No", "*"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(
        makeSegment("SIN", "TYO", "2025-01-10 03:00:00", "2025-01-10 10:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(
        makeSegment("TYO", "SIN", "2025-01-10 11:00:00", "2025-01-10 17:00:00", true));
    segs.push_back(segStorage.back().get());

    auto duty = makeDuty(segs, "SIN", "SIN", "2025-01-10 03:00:00", "2025-01-10 17:00:00");
    EXPECT_TRUE(rule.CheckRule(duty.get()));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7420Test, FlightArrSupportsDiffExpression) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420001, 1, "(2)", "SIN", "(TYO|OSA)~OSA", "22:00-02:59", 1, "Yes", 0, "No", "*"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(
        makeSegment("SIN", "OSA", "2025-01-10 22:30:00", "2025-01-11 05:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(
        makeSegment("OSA", "SIN", "2025-01-11 06:00:00", "2025-01-11 12:00:00", true));
    segs.push_back(segStorage.back().get());

    // Would violate max operating sectors if the rule triggered; diff expression excludes OSA so it should not apply.
    auto duty = makeDuty(segs, "SIN", "SIN", "2025-01-10 22:30:00", "2025-01-11 12:00:00");
    EXPECT_TRUE(rule.CheckRule(duty.get()));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7420Test, AusNextDayForbidsTwoOperatingSectorsBackToSin) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420002,
        1,
        "(3)(a)",
        "SIN",
        "SYD|MEL|ADL|BNE",
        "18:00-00:00",
        1,
        "Yes",
        1,
        "OPERATING_LEGS_TO_SIN >= 2",
        "SYD|MEL|ADL|BNE"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDay0;
    segStorage.push_back(
        makeSegment("SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00", true));
    segsDay0.push_back(segStorage.back().get());
    auto dutyDay0 = makeDuty(segsDay0, "SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00");

    std::vector<Segment*> segsDay1;
    segStorage.push_back(
        makeSegment("SYD", "DPS", "2025-02-04 09:00:00", "2025-02-04 13:00:00", true));
    segsDay1.push_back(segStorage.back().get());
    segStorage.push_back(
        makeSegment("DPS", "SIN", "2025-02-04 15:00:00", "2025-02-04 19:00:00", true));
    segsDay1.push_back(segStorage.back().get());
    auto dutyDay1 = makeDuty(segsDay1, "SYD", "SIN", "2025-02-04 09:00:00", "2025-02-04 19:00:00");

    std::vector<Duty*> duties{dutyDay0.get(), dutyDay1.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("OPERATING_LEGS_TO_SIN"), std::string::npos);
}

TEST_F(Rule7420Test, AusNextDayAllowsSplitReturnOverTwoDuties) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420002,
        1,
        "(3)(a)",
        "SIN",
        "SYD|MEL|ADL|BNE",
        "18:00-00:00",
        1,
        "Yes",
        1,
        "OPERATING_LEGS_TO_SIN >= 2",
        "SYD|MEL|ADL|BNE"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDay0;
    segStorage.push_back(
        makeSegment("SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00", true));
    segsDay0.push_back(segStorage.back().get());
    auto dutyDay0 = makeDuty(segsDay0, "SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00");

    std::vector<Segment*> segsDay1a;
    segStorage.push_back(
        makeSegment("SYD", "DPS", "2025-02-04 09:00:00", "2025-02-04 13:00:00", true));
    segsDay1a.push_back(segStorage.back().get());
    auto dutyDay1a = makeDuty(segsDay1a, "SYD", "DPS", "2025-02-04 09:00:00", "2025-02-04 13:00:00");

    std::vector<Segment*> segsDay1b;
    segStorage.push_back(
        makeSegment("DPS", "SIN", "2025-02-04 15:00:00", "2025-02-04 19:00:00", true));
    segsDay1b.push_back(segStorage.back().get());
    auto dutyDay1b = makeDuty(segsDay1b, "DPS", "SIN", "2025-02-04 15:00:00", "2025-02-04 19:00:00");

    std::vector<Duty*> duties{dutyDay0.get(), dutyDay1a.get(), dutyDay1b.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7420Test, AusNextDayAllowsDirectReturnToSin) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420002,
        1,
        "(3)(a)",
        "SIN",
        "SYD|MEL|ADL|BNE",
        "18:00-00:00",
        1,
        "Yes",
        1,
        "OPERATING_LEGS_TO_SIN >= 2",
        "SYD|MEL|ADL|BNE"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDay0;
    segStorage.push_back(
        makeSegment("SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00", true));
    segsDay0.push_back(segStorage.back().get());
    auto dutyDay0 = makeDuty(segsDay0, "SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00");

    std::vector<Segment*> segsDay1;
    segStorage.push_back(
        makeSegment("SYD", "SIN", "2025-02-04 09:00:00", "2025-02-04 19:00:00", true));
    segsDay1.push_back(segStorage.back().get());
    auto dutyDay1 = makeDuty(segsDay1, "SYD", "SIN", "2025-02-04 09:00:00", "2025-02-04 19:00:00");

    std::vector<Duty*> duties{dutyDay0.get(), dutyDay1.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7420Test, NextDutyOffsetOneForbidsSameDayDutyAtSlip) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420002,
        1,
        "(3)(a)",
        "SIN",
        "SYD|MEL|ADL|BNE",
        "18:00-00:00",
        1,
        "Yes",
        1,
        "No",
        "SYD|MEL|ADL|BNE"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDay0;
    segStorage.push_back(
        makeSegment("SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00", true));
    segsDay0.push_back(segStorage.back().get());
    auto dutyDay0 = makeDuty(segsDay0, "SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00");

    std::vector<Segment*> segsSameDay;
    segStorage.push_back(
        makeSegment("SYD", "SIN", "2025-02-03 10:00:00", "2025-02-03 18:00:00", true));
    segsSameDay.push_back(segStorage.back().get());
    auto dutySameDay = makeDuty(segsSameDay, "SYD", "SIN", "2025-02-03 10:00:00", "2025-02-03 18:00:00");

    std::vector<Duty*> duties{dutyDay0.get(), dutySameDay.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("day+1"), std::string::npos);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("actual starts on day+0"), std::string::npos);
}

TEST_F(Rule7420Test, OptimizerPassLevelBypassesLowSeverityViolations) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420001, 1, "(2)", "SIN", "TYO|OSA|FUK|NGO|SDJ", "22:00-02:59", 1, "Yes", 0, "No", "*"));

    DBRule control{};
    control.idRule = 7420001;
    control.function = 7420;
    control.tableNum = 2;
    control.rowNum = 1;
    control.params["OPTIMIZER PASS LEVEL"] = "2";
    input.dbRules.push_back(control);

    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);
    rule.setApplication(PAIRING_OPTIMIZER);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment("SIN", "TYO", "2025-01-01 22:00:00", "2025-01-02 02:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment("TYO", "OSA", "2025-01-02 03:00:00", "2025-01-02 04:00:00", true));
    segs.push_back(segStorage.back().get());

    auto duty = makeDuty(segs, "SIN", "OSA", "2025-01-01 22:00:00", "2025-01-02 04:00:00");
    std::vector<Duty*> duties{duty.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));

    // Without the optimizer bypass, the same violation should fail under optimizer as well.
    RuleInput strictInput;
    strictInput.dbRules.push_back(makeAcopTableARow(
        7420001, 1, "(2)", "SIN", "TYO|OSA|FUK|NGO|SDJ", "22:00-02:59", 1, "Yes", 0, "No", "*"));
    AcopFdpPatternRule strictRule(nullptr, strictInput);
    configureRule(strictRule);
    strictRule.setApplication(PAIRING_OPTIMIZER);
    EXPECT_FALSE(strictRule.CheckRule(&pairing));
}

TEST_F(Rule7420Test, OptimizerPassLevelStillFailsHighSeverityViolations) {
    RuleInput input;
    auto row = makeAcopTableARow(
        7420001, 1, "(2)", "SIN", "TYO|OSA|FUK|NGO|SDJ", "22:00-02:59", 1, "Yes", 0, "No", "*");
    row.severity = 5;
    input.dbRules.push_back(row);

    DBRule control{};
    control.idRule = 7420001;
    control.function = 7420;
    control.tableNum = 2;
    control.rowNum = 1;
    control.params["OPTIMIZER PASS LEVEL"] = "4";
    input.dbRules.push_back(control);

    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);
    rule.setApplication(PAIRING_OPTIMIZER);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment("SIN", "TYO", "2025-01-01 22:00:00", "2025-01-02 02:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment("TYO", "OSA", "2025-01-02 03:00:00", "2025-01-02 04:00:00", true));
    segs.push_back(segStorage.back().get());

    auto duty = makeDuty(segs, "SIN", "OSA", "2025-01-01 22:00:00", "2025-01-02 04:00:00");
    std::vector<Duty*> duties{duty.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Rule7420Test, AppliesAtSlipStationSupportsDiffExpression) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420002,
        1,
        "(3)(a)",
        "SIN",
        "SYD|MEL",
        "18:00-00:00",
        1,
        "Yes",
        1,
        "No",
        "(SYD|MEL)~MEL"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDay0;
    segStorage.push_back(
        makeSegment("SIN", "MEL", "2025-02-02 19:00:00", "2025-02-03 03:00:00", true));
    segsDay0.push_back(segStorage.back().get());
    auto dutyDay0 = makeDuty(segsDay0, "SIN", "MEL", "2025-02-02 19:00:00", "2025-02-03 03:00:00");

    std::vector<Segment*> segsSameDay;
    segStorage.push_back(
        makeSegment("MEL", "SIN", "2025-02-03 10:00:00", "2025-02-03 18:00:00", true));
    segsSameDay.push_back(segStorage.back().get());
    auto dutySameDay = makeDuty(segsSameDay, "MEL", "SIN", "2025-02-03 10:00:00", "2025-02-03 18:00:00");

    // Next-duty offset restriction is defined, but appliesAtSlipStation excludes MEL, so no violation should be raised.
    std::vector<Duty*> duties{dutyDay0.get(), dutySameDay.get()};
    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7420Test, ForbiddenNextDutyPatternCheckedEvenWhenOffsetZero) {
    RuleInput input;
    input.dbRules.push_back(makeAcopTableARow(
        7420002,
        1,
        "(3)(a)",
        "SIN",
        "SYD|MEL|ADL|BNE",
        "18:00-00:00",
        1,
        "Yes",
        0,
        "OPERATING_LEGS_TO_SIN >= 2",
        "SYD|MEL|ADL|BNE"));
    AcopFdpPatternRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segsDay0;
    segStorage.push_back(
        makeSegment("SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00", true));
    segsDay0.push_back(segStorage.back().get());
    auto dutyDay0 = makeDuty(segsDay0, "SIN", "SYD", "2025-02-02 19:00:00", "2025-02-03 03:00:00");

    std::vector<Segment*> segsSameDay;
    segStorage.push_back(
        makeSegment("SYD", "DPS", "2025-02-03 10:00:00", "2025-02-03 14:00:00", true));
    segsSameDay.push_back(segStorage.back().get());
    segStorage.push_back(
        makeSegment("DPS", "SIN", "2025-02-03 15:00:00", "2025-02-03 19:00:00", true));
    segsSameDay.push_back(segStorage.back().get());
    auto dutySameDay = makeDuty(segsSameDay, "SYD", "SIN", "2025-02-03 10:00:00", "2025-02-03 19:00:00");

    std::vector<Duty*> duties{dutyDay0.get(), dutySameDay.get()};
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("OPERATING_LEGS_TO_SIN"), std::string::npos);
}
