#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7453/RequireSameCityAroundUlrDutyForSQRule.h"

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

void addAirport(std::shared_ptr<CrewDataContext>& dbData, const std::string& airport, const std::string& city) {
    DBAirport record{};
    std::strncpy(record.airport, airport.c_str(), sizeof(record.airport) - 1);
    std::strncpy(record.city, city.c_str(), sizeof(record.city) - 1);
    dbData->airportList.push_back(record);
    dbData->airportCodeMap[airport] = &dbData->airportList.back();
}

std::shared_ptr<CrewDataContext> buildContext() {
    auto dbData = std::make_shared<CrewDataContext>();
    dbData->airportList.clear();
    dbData->airportCodeMap.clear();
    dbData->airportList.reserve(16);

    addAirport(dbData, "SIN", "SIN");
    addAirport(dbData, "JFK", "NYC");
    addAirport(dbData, "EWR", "NYC");
    addAirport(dbData, "LAX", "LAX");
    addAirport(dbData, "NRT", "NRT");

    FLEET fleet359{};
    fleet359.fleet = "A359";
    fleet359.fleetGrp = "359";
    dbData->fleetMap["A359"] = fleet359;

    FLEET fleet333{};
    fleet333.fleet = "A333";
    fleet333.fleetGrp = "333";
    dbData->fleetMap["A333"] = fleet333;

    return dbData;
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& fleet,
                                     const std::string& assignment,
                                     bool isOperating,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD(fleet);
    seg->setAssignment(assignment);
    seg->setIsOperating(isOperating);
    seg->setStartTimeUtcAct(utcFromString(startUtc));
    seg->setEndTimeUtcAct(utcFromString(endUtc));
    seg->setStartTimeUtcSch(seg->getStartTimeUtcAct());
    seg->setEndTimeUtcSch(seg->getEndTimeUtcAct());
    return seg;
}

DBRule makeRuleRow(int rowNum, const std::string& bases, const std::string& fleetGroups, const std::string& active) {
    DBRule rule{};
    rule.idRule = 7453001;
    rule.function = RULES::SQ_CA_SAME_CITY_AROUND_ULR_DUTY;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 208174530 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SQ";
    rule.category = "Pairing";
    rule.params["BASES"] = bases;
    rule.params["FLEET GROUP"] = fleetGroups;
    rule.params["ACTIVE"] = active;
    return rule;
}

RuleInput buildDefaultRuleInput() {
    RuleInput input;
    input.dbRules.push_back(makeRuleRow(1, "SIN", "359", "Y"));
    return input;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

Duty* addDuty(std::vector<std::unique_ptr<Segment>>& segmentStorage,
              std::vector<std::unique_ptr<Duty>>& dutyStorage,
              const std::string& dep,
              const std::string& arr,
              const std::string& fleet,
              const std::string& assignment,
              bool isOperating,
              bool isUlr,
              int dutySeq,
              int pairingId,
              const std::string& startUtc,
              const std::string& endUtc) {
    auto segment = makeSegment(dep, arr, fleet, assignment, isOperating, startUtc, endUtc);
    Segment* segmentPtr = segment.get();
    segmentStorage.push_back(std::move(segment));

    std::vector<Segment*> segments{segmentPtr};
    auto duty = std::make_unique<Duty>(segments);
    duty->setDepartureStation(dep);
    duty->setArrivalStation(arr);
    duty->setBase("SIN");
    duty->setPairingId(pairingId);
    duty->setDutySeq(dutySeq);
    duty->setULR(isUlr);
    duty->setStartTimeUtcAct(segmentPtr->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segmentPtr->getEndTimeUtcAct());
    Duty* dutyPtr = duty.get();
    dutyStorage.push_back(std::move(duty));
    return dutyPtr;
}

}  // namespace

class Rule7453Test : public ::testing::Test {
protected:
    void SetUp() override {
        _ctx = buildContext();
    }

    void TearDown() override {
        deleteViolations(_violations);
    }

    void configureRule(RequireSameCityAroundUlrDutyForSQRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
        rule.setRuleViolation(&_violations);
        rule.setViolations(&_violationMessages);
    }

    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
};

TEST_F(Rule7453Test, CoterminalUlrLayoverCitiesPass) {
    RequireSameCityAroundUlrDutyForSQRule rule(nullptr, buildDefaultRuleInput());
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutiesStorage;
    std::vector<Duty*> duties;

    duties.push_back(addDuty(segments, dutiesStorage, "SIN", "JFK", "A359", "FLY", true, true, 1, 10001,
                             "2025-01-01 00:00:00", "2025-01-01 12:00:00"));
    duties.push_back(addDuty(segments, dutiesStorage, "EWR", "SIN", "A359", "FLY", true, true, 2, 10001,
                             "2025-01-03 00:00:00", "2025-01-03 12:00:00"));

    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7453Test, DifferentCitiesAcrossUlrDutiesFail) {
    RequireSameCityAroundUlrDutyForSQRule rule(nullptr, buildDefaultRuleInput());
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutiesStorage;
    std::vector<Duty*> duties;

    duties.push_back(addDuty(segments, dutiesStorage, "SIN", "JFK", "A359", "FLY", true, true, 1, 10002,
                             "2025-01-01 00:00:00", "2025-01-01 12:00:00"));
    duties.push_back(addDuty(segments, dutiesStorage, "LAX", "SIN", "A359", "FLY", true, true, 2, 10002,
                             "2025-01-03 00:00:00", "2025-01-03 12:00:00"));

    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violations.size(), 1u);
    EXPECT_NE(_violations.front()->violation_msg.find("NYC"), std::string::npos);
    EXPECT_NE(_violations.front()->violation_msg.find("LAX"), std::string::npos);
}

TEST_F(Rule7453Test, NonUlrMiddleBetweenDifferentUlrCitiesFails) {
    RequireSameCityAroundUlrDutyForSQRule rule(nullptr, buildDefaultRuleInput());
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutiesStorage;
    std::vector<Duty*> duties;

    duties.push_back(addDuty(segments, dutiesStorage, "SIN", "JFK", "A359", "FLY", true, true, 1, 10003,
                             "2025-01-01 00:00:00", "2025-01-01 12:00:00"));
    duties.push_back(addDuty(segments, dutiesStorage, "JFK", "LAX", "A333", "FLY", true, false, 2, 10003,
                             "2025-01-02 00:00:00", "2025-01-02 07:00:00"));
    duties.push_back(addDuty(segments, dutiesStorage, "LAX", "SIN", "A359", "FLY", true, true, 3, 10003,
                             "2025-01-04 00:00:00", "2025-01-04 12:00:00"));

    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violations.size(), 1u);
    EXPECT_NE(_violations.front()->violation_msg.find("NYC"), std::string::npos);
    EXPECT_NE(_violations.front()->violation_msg.find("LAX"), std::string::npos);
}

TEST_F(Rule7453Test, SingleUlrWithMatchingAdjacentCityPasses) {
    RequireSameCityAroundUlrDutyForSQRule rule(nullptr, buildDefaultRuleInput());
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutiesStorage;
    std::vector<Duty*> duties;

    duties.push_back(addDuty(segments, dutiesStorage, "SIN", "JFK", "A359", "FLY", true, true, 1, 10004,
                             "2025-01-01 00:00:00", "2025-01-01 12:00:00"));
    duties.push_back(addDuty(segments, dutiesStorage, "JFK", "NRT", "A333", "FLY", true, false, 2, 10004,
                             "2025-01-02 00:00:00", "2025-01-02 07:00:00"));
    duties.push_back(addDuty(segments, dutiesStorage, "NRT", "SIN", "A333", "FLY", true, false, 3, 10004,
                             "2025-01-04 00:00:00", "2025-01-04 07:00:00"));

    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7453Test, PositioningDutyAfterUlrIsIgnoredBecauseNotUlr) {
    RequireSameCityAroundUlrDutyForSQRule rule(nullptr, buildDefaultRuleInput());
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutiesStorage;
    std::vector<Duty*> duties;

    duties.push_back(addDuty(segments, dutiesStorage, "SIN", "JFK", "A359", "FLY", true, true, 1, 10005,
                             "2025-01-01 00:00:00", "2025-01-01 12:00:00"));
    duties.push_back(addDuty(segments, dutiesStorage, "JFK", "LAX", "A333", "FLY", true, false, 2, 10005,
                             "2025-01-02 00:00:00", "2025-01-02 07:00:00"));
    duties.push_back(addDuty(segments, dutiesStorage, "LAX", "SIN", "A359", "MVP", false, false, 3, 10005,
                             "2025-01-04 00:00:00", "2025-01-04 12:00:00"));

    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7453Test, BoundaryWithoutAdjacentUlrSidePasses) {
    RequireSameCityAroundUlrDutyForSQRule rule(nullptr, buildDefaultRuleInput());
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutiesStorage;
    std::vector<Duty*> duties;

    duties.push_back(addDuty(segments, dutiesStorage, "SIN", "JFK", "A359", "FLY", true, true, 1, 10006,
                             "2025-01-01 00:00:00", "2025-01-01 12:00:00"));

    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7453Test, UnmatchedFleetFilterSkipsRule) {
    RuleInput input;
    input.dbRules.push_back(makeRuleRow(1, "SIN", "777", "Y"));

    RequireSameCityAroundUlrDutyForSQRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutiesStorage;
    std::vector<Duty*> duties;

    duties.push_back(addDuty(segments, dutiesStorage, "SIN", "JFK", "A359", "FLY", true, true, 1, 10007,
                             "2025-01-01 00:00:00", "2025-01-01 12:00:00"));
    duties.push_back(addDuty(segments, dutiesStorage, "LAX", "SIN", "A359", "FLY", true, true, 2, 10007,
                             "2025-01-03 00:00:00", "2025-01-03 12:00:00"));

    Pairing pairing(duties);
    pairing.setBase("SIN");

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violations.empty());
}
