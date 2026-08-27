#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7451/RestrictCoterminalDutyConnectionForSQRule.h"

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

std::shared_ptr<CrewDataContext> buildAirportCityContext() {
    auto dbData = std::make_shared<CrewDataContext>();
    dbData->airportList.clear();
    dbData->airportCodeMap.clear();
    dbData->airportList.reserve(8);

    addAirport(dbData, "SIN", "SIN");
    addAirport(dbData, "LHR", "LON");
    addAirport(dbData, "LGW", "LON");

    return dbData;
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& assignment,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setAssignment(assignment);
    const bool isOperating = (assignment == "FLY" || assignment == "OPR");
    seg->setIsOperating(isOperating);
    seg->setIsDeadhead(!isOperating);
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeLocSch(start);
    seg->setEndTimeLocSch(end);
    return seg;
}

DBRule makeRestrictionRow(int rowNum,
                          const std::string& prevArr,
                          const std::string& prevAssign,
                          const std::string& nextDep,
                          const std::string& nextAssign) {
    DBRule rule{};
    rule.idRule = 7451001;
    rule.function = 7451;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 208174510 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SQ";

    rule.params["PREV DUTY ARRIVAL"] = prevArr;
    rule.params["PREV DUTY ASSIGNMENT"] = prevAssign;
    rule.params["NEXT DUTY DEPART"] = nextDep;
    rule.params["NEXT DUTY ASSIGNMENT"] = nextAssign;
    return rule;
}

RuleInput buildDefaultRuleInput() {
    RuleInput input;
    input.dbRules.push_back(makeRestrictionRow(1, "LHR", "*", "LGW", "*"));
    input.dbRules.push_back(makeRestrictionRow(2, "LGW", "*", "LHR", "MVP"));
    return input;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

class Rule7451Test : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
    }

    void configureRule(RestrictCoterminalDutyConnectionForSQRule& rule,
                       const std::shared_ptr<CrewDataContext>& dbData) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(dbData);
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }

    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
};

TEST_F(Rule7451Test, RestrictsLhrToLgwRegardlessOfAssignments) {
    auto dbData = buildAirportCityContext();
    auto input = buildDefaultRuleInput();
    RestrictCoterminalDutyConnectionForSQRule rule(nullptr, input);
    configureRule(rule, dbData);

    std::vector<std::unique_ptr<Segment>> segStorage;

    segStorage.push_back(makeSegment("SIN", "LHR", "FLY", "2025-01-01 00:00:00", "2025-01-01 10:00:00"));
    std::vector<Segment*> duty1Segs{segStorage.back().get()};
    Duty duty1(duty1Segs);
    duty1.setDutySeq(1);

    segStorage.push_back(makeSegment("LGW", "SIN", "FLY", "2025-01-02 00:00:00", "2025-01-02 10:00:00"));
    std::vector<Segment*> duty2Segs{segStorage.back().get()};
    Duty duty2(duty2Segs);
    duty2.setDutySeq(2);

    Pairing pairing({&duty1, &duty2});

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violationStorage.empty());
}

TEST_F(Rule7451Test, AllowsLgwToLhrWhenNextDutyIsOperating) {
    auto dbData = buildAirportCityContext();
    auto input = buildDefaultRuleInput();
    RestrictCoterminalDutyConnectionForSQRule rule(nullptr, input);
    configureRule(rule, dbData);

    std::vector<std::unique_ptr<Segment>> segStorage;

    segStorage.push_back(makeSegment("SIN", "LGW", "MVP", "2025-01-01 00:00:00", "2025-01-01 10:00:00"));
    std::vector<Segment*> duty1Segs{segStorage.back().get()};
    Duty duty1(duty1Segs);
    duty1.setDutySeq(1);

    segStorage.push_back(makeSegment("LHR", "SIN", "FLY", "2025-01-02 00:00:00", "2025-01-02 10:00:00"));
    std::vector<Segment*> duty2Segs{segStorage.back().get()};
    Duty duty2(duty2Segs);
    duty2.setDutySeq(2);

    Pairing pairing({&duty1, &duty2});

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7451Test, RestrictsLgwToLhrWhenNextDutyIsDeadhead) {
    auto dbData = buildAirportCityContext();
    auto input = buildDefaultRuleInput();
    RestrictCoterminalDutyConnectionForSQRule rule(nullptr, input);
    configureRule(rule, dbData);

    std::vector<std::unique_ptr<Segment>> segStorage;

    segStorage.push_back(makeSegment("SIN", "LGW", "FLY", "2025-01-01 00:00:00", "2025-01-01 10:00:00"));
    std::vector<Segment*> duty1Segs{segStorage.back().get()};
    Duty duty1(duty1Segs);
    duty1.setDutySeq(1);

    segStorage.push_back(makeSegment("LHR", "SIN", "MVP", "2025-01-02 00:00:00", "2025-01-02 10:00:00"));
    std::vector<Segment*> duty2Segs{segStorage.back().get()};
    Duty duty2(duty2Segs);
    duty2.setDutySeq(2);

    Pairing pairing({&duty1, &duty2});

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_EQ(_violationStorage.size(), 1u);
}

TEST_F(Rule7451Test, DisallowsDeadheadFlightBetweenCoterminalsWithinDuty) {
    auto dbData = buildAirportCityContext();
    auto input = buildDefaultRuleInput();
    RestrictCoterminalDutyConnectionForSQRule rule(nullptr, input);
    configureRule(rule, dbData);

    std::vector<std::unique_ptr<Segment>> segStorage;

    segStorage.push_back(makeSegment("LHR", "LGW", "MVP", "2025-01-01 00:00:00", "2025-01-01 00:30:00"));
    std::vector<Segment*> dutySegs{segStorage.back().get()};
    Duty duty(dutySegs);
    duty.setDutySeq(1);

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("coterminals"), std::string::npos);
}

