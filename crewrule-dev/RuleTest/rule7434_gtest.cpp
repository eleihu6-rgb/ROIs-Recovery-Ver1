#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7434/MaxDutyPeriodRuleForSQ.h"
#include "db/PairingUtil.h"
#include "db/RuleParams.h"
#include "RuleInput.h"
#include "CrewDB.h"
#include "Duty.h"
#include "Pairing.h"
#include "BaseSegment.h"
#include "Segment.h"
#include "Utility.h"
#include "UtilFunc.h"

#include <algorithm>
#include <cstring>
#include <memory>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    char* cstr = const_cast<char*>(s.c_str());
    return utcStrToUtc(cstr);
}

std::unique_ptr<Segment> makeSegment(const std::string& startTime,
                                     const std::string& endTime,
                                     const std::string& assignment,
                                     const std::string& fleet,
                                     bool isOperating) {
    auto seg = std::make_unique<Segment>();
    seg->setStartTimeUtcSch(utcFromString(startTime));
    seg->setEndTimeUtcSch(utcFromString(endTime));
    seg->setAssignment(assignment);
    seg->setFleetCD(fleet.c_str());
    seg->setIsOperating(isOperating);
    return seg;
}

SharedPtr<CrewDataContext> buildDataContextFor7434() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);

    struct AirportConfig {
        const char* code;
        int utcOffsetMinutes;
        const char* zoneId;
    };

    const AirportConfig airports[] = {
        {"SIN", 480, "Asia/Singapore"},
        {"LHR", 0, "Europe/London"},
    };

    for (const auto& airport : airports) {
        DBAirport rec{};
        std::strncpy(rec.airport, airport.code, sizeof(rec.airport) - 1);
        std::strncpy(rec.zoneId, airport.zoneId, sizeof(rec.zoneId) - 1);
        ctx->airportList.push_back(rec);
        ctx->airportUtcOffsetMap[airport.code] = airport.utcOffsetMinutes;
        ctx->airportZoneIdMap[airport.code] = airport.zoneId;
    }

    return ctx;
}

std::unique_ptr<Segment> makePairingSegment(const std::string& dep,
                                            const std::string& arr,
                                            const std::string& startTime,
                                            const std::string& endTime,
                                            const std::string& assignment,
                                            const std::string& fleet,
                                            bool isOperating,
                                            const SharedPtr<CrewDataContext>& ctx) {
    auto seg = makeSegment(startTime, endTime, assignment, fleet, isOperating);
    const time_t start = utcFromString(startTime);
    const time_t end = utcFromString(endTime);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeLocAct(start + ctx->airportUtcOffsetMap.at(dep) * 60);
    seg->setEndTimeLocAct(end + ctx->airportUtcOffsetMap.at(arr) * 60);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocSch(seg->getStartTimeLocAct());
    seg->setEndTimeLocSch(seg->getEndTimeLocAct());
    return seg;
}

std::unique_ptr<Duty> makeDutyForChecker(const std::vector<Segment*>& segments,
                                         int dpMinutes,
                                         int fdpMinutes,
                                         const SharedPtr<CrewDataContext>& ctx,
                                         const std::string& assignment = "FLY",
                                         const std::string& composition = "CP",
                                         const std::string& fleet = "777") {
    auto duty = std::make_unique<Duty>(segments);
    duty->setAssignment(assignment);
    duty->setCompositionName(composition);
    duty->setFltCD(fleet);
    duty->setDPInSecs(dpMinutes * 60);
    duty->setFDPInSecs(fdpMinutes * 60);
    if (!segments.empty()) {
        duty->setDepartureStation(segments.front()->getDepSta());
        duty->setArrivalStation(segments.back()->getArrSta());
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
        duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch());
        duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch());
        duty->setRefTimeZone(ctx->airportUtcOffsetMap.at(segments.front()->getDepSta()));
    }
    duty->resetTypeBySegments();
    return duty;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties,
                                     const std::string& base,
                                     CrewDataContext* ctx) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
        pairing->setStartTimeLocAct(duties.front()->getStartTimeLocAct());
        pairing->setEndTimeLocAct(duties.back()->getEndTimeLocAct());
        pairing->setStartTimeUtcSch(duties.front()->getStartTimeUtcSch());
        pairing->setEndTimeUtcSch(duties.back()->getEndTimeUtcSch());
        pairing->setStartTimeLocSch(duties.front()->getStartTimeLocAct());
        pairing->setEndTimeLocSch(duties.back()->getEndTimeLocAct());
    }
    createPairingNodeOfDuty(pairing.get(), ctx);
    return pairing;
}

DBRule make7434RuleRow(int rowNum,
                       const std::string& fleet,
                       const std::string& composition,
                       const std::string& fleetChange,
                       const std::string& fleetGroupChange,
                       const std::string& assignmentsAfterFDP,
                       const std::string& maxDp,
                       const std::string& maxFdp) {
    DBRule rule;
    rule.function = 7434;
    rule.rowNum = rowNum;
    rule.params["FLEET"] = fleet;
    rule.params["COMPOSITION"] = composition;
    rule.params["FLEET CHANGE"] = fleetChange;
    rule.params["FLEET GROUP CHANGE"] = fleetGroupChange;
    rule.params["HAS ASSIGNMENT AFTER FDP"] = assignmentsAfterFDP;
    rule.params["MAX DP"] = maxDp;
    rule.params["MAX FDP"] = maxFdp;
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

} // namespace

class Rule7434Test : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
    }

    void configureRule(Rule& rule) {
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }

    void setDutyCommonFields(Duty& duty, int dpMinutes, const std::string& composition, const std::string& fleet) {
        duty.setDPInSecs(dpMinutes * 60);
        duty.setCompositionName(composition);
        duty.setFltCD(fleet);
    }

    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
};

class Rule7434CheckApiTest : public ::testing::Test {
protected:
    Rule7434CheckApiTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildDataContextFor7434()) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_OPTIMIZER);
    }

    void configureChecker(const std::vector<DBRule>& rules) {
        _dataContext->ruleList = rules;
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
    std::vector<std::unique_ptr<Segment>> _segmentStore;
    std::vector<std::unique_ptr<Duty>> _dutyStore;
};

// Test Case: Fleet Change 'Y' - Violation
TEST_F(Rule7434Test, ViolationOnFleetChangeY_WithFleetChange) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "Y", "*", "*", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 12:00", "FLY", "777", true));
    segStorage.push_back(makeSegment("2025-12-01 13:00", "2025-12-01 18:00", "FLY", "A350", true));
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "MIX");

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1);
}

// Test Case: Fleet Change 'Y' - Pass
TEST_F(Rule7434Test, PassOnFleetChangeY_WithoutFleetChange) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "Y", "*", "*", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 18:00", "FLY", "777", true));
    segments.push_back(segStorage[0].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "777");

    EXPECT_TRUE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 0);
}

// Test Case: Fleet Change 'N' - Violation
TEST_F(Rule7434Test, ViolationOnFleetChangeN_WithoutFleetChange) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "N", "*", "*", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 18:00", "FLY", "777", true));
    segments.push_back(segStorage[0].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "777");

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1);
}

// Test Case: Has Assignment After FDP - Violation
TEST_F(Rule7434Test, ViolationOnAssignmentAfterFDP) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "*", "*", "DHD|POS", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 18:00", "FLY", "777", true));
    segStorage.push_back(makeSegment("2025-12-01 19:00", "2025-12-01 22:00", "DHD", "", false));
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "777");

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1);
}

// Test Case: Has Assignment After FDP - Pass (non-matching assignment)
TEST_F(Rule7434Test, PassOnAssignmentAfterFDP_WithNonMatchingAssignment) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "*", "*", "DHD|POS", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 18:00", "FLY", "777", true));
    segStorage.push_back(makeSegment("2025-12-01 19:00", "2025-12-01 22:00", "SIM", "", false));
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "777");

    EXPECT_TRUE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 0);
}

// Test Case: Combined Logic - Violation
TEST_F(Rule7434Test, ViolationOnCombinedFleetChangeAndAssignment) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "N", "*", "DHD", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 18:00", "FLY", "777", true));
    segStorage.push_back(makeSegment("2025-12-01 19:00", "2025-12-01 22:00", "DHD", "747", false));
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());
    
    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "777");
	// deadhead does not count as fleet change, matching fleet change = "N", need to check rule
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1);
}

// Test Case: fail on change fleet
TEST_F(Rule7434Test, FailOn_WhenChangeFleet) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "Y", "*", "*", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 18:00", "FLY", "777", true));
    segStorage.push_back(makeSegment("2025-12-01 19:00", "2025-12-01 22:00", "FLY", "767", true));
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "777");

    EXPECT_FALSE(rule.CheckRule(&duty));
}

// Test Case: Combined Logic - Pass (deadhead does not count as fleet change)
TEST_F(Rule7434Test, PassOn_WhenDeadheadChangeFleet) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "Y", "*", "*", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 18:00", "FLY", "777", true));
    segStorage.push_back(makeSegment("2025-12-01 19:00", "2025-12-01 22:00", "DHD", "767", false));
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());
    
    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "777");

    EXPECT_TRUE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 0);
}

TEST_F(Rule7434Test, ViolationOnFleetGroupChangeY_WithFleetGroupChange) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "*", "Y", "*", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    auto ctx = std::make_shared<CrewDataContext>();
    FLEET fleet1;
    fleet1.fleet = "777";
    fleet1.fleetGrp = "W";
    ctx->fleetMap["777"] = fleet1;
    FLEET fleet2;
    fleet2.fleet = "A330";
    fleet2.fleetGrp = "Z";
    ctx->fleetMap["A330"] = fleet2;
    rule.setDataContext(ctx);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 12:00", "FLY", "777", true));
    segStorage.push_back(makeSegment("2025-12-01 13:00", "2025-12-01 18:00", "FLY", "A330", true));
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "MIX");

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1);
}

TEST_F(Rule7434Test, PassOnFleetGroupChangeY_WithoutFleetGroupChange) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "*", "Y", "*", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    auto ctx = std::make_shared<CrewDataContext>();
    FLEET fleet1;
    fleet1.fleet = "777";
    fleet1.fleetGrp = "W";
    ctx->fleetMap["777"] = fleet1;
    FLEET fleet2;
    fleet2.fleet = "A350";
    fleet2.fleetGrp = "W"; // different fleet, same group
    ctx->fleetMap["A350"] = fleet2;
    rule.setDataContext(ctx);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 12:00", "FLY", "777", true));
    segStorage.push_back(makeSegment("2025-12-01 13:00", "2025-12-01 18:00", "FLY", "A350", true));
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "MIX");

    EXPECT_TRUE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 0);
}

TEST_F(Rule7434Test, ViolationOnMaxFdp) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "*", "*", "*", "*", "14:00"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 18:00", "FLY", "777", true));
    segments.push_back(segStorage[0].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 13 * 60, "CP", "777");
    duty.setFDPInSecs(15 * 60 * 60);

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1);
}

TEST_F(Rule7434Test, PassOnAssignmentAfterFdp_CaseSensitive) {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "*", "*", "dhd", "14:00", "*"));
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-12-01 08:00", "2025-12-01 18:00", "FLY", "777", true));
    segStorage.push_back(makeSegment("2025-12-01 19:00", "2025-12-01 22:00", "DHD", "", false));
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 15 * 60, "CP", "777");

    EXPECT_TRUE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 0);
}

TEST_F(Rule7434CheckApiTest, CheckPGRulesPairingDispatchesRule7434) {
    std::vector<DBRule> rules;
    rules.push_back(make7434RuleRow(1, "*", "*", "*", "*", "DHD|POS", "14:00", "*"));
    configureChecker(rules);

    _segmentStore.push_back(makePairingSegment(
        "SIN", "LHR", "2025-12-01 08:00:00", "2025-12-01 18:00:00", "FLY", "777", true, _dataContext));
    _segmentStore.push_back(makePairingSegment(
        "LHR", "SIN", "2025-12-01 19:00:00", "2025-12-01 23:00:00", "DHD", "777", false, _dataContext));

    std::vector<Segment*> segments = {_segmentStore[0].get(), _segmentStore[1].get()};
    _dutyStore.push_back(makeDutyForChecker(segments, 15 * 60, 10 * 60, _dataContext));

    std::vector<Duty*> duties = {_dutyStore[0].get()};
    auto pairing = makePairing(duties, "SIN", _dataContext.get());

    EXPECT_FALSE(_checker.checkPGRules(
        pairing.get(), {RULES::SQ_CA_MAX_DUTY_PERIOD_WITH_TRAILING_DEADHEAD}));
}
