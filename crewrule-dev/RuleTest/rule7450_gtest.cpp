#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7450/FdpSectorLimitForSQRule.h"

#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"

#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& fleet,
                                     const std::string& flightNumber,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     bool isOperating) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD(fleet);
    seg->setFlightNumber(flightNumber);
    seg->setAssignment(isOperating ? "FLY" : "DHD");
    seg->setIsOperating(isOperating);
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    return seg;
}

DBRule makeSqRuleRow(int rowNum,
                     const std::string& composition,
                     const std::string& fdpLower,
                     const std::string& fdpUpper,
                     int maxSectors) {
    DBRule rule{};
    rule.idRule = 7450001;
    rule.function = 7450;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 208174500 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SQ";
    rule.category = "Duty";
    rule.params["COMPOSITION"] = composition;
    rule.params["FDP LOWER"] = fdpLower;
    rule.params["FDP UPPER"] = fdpUpper;
    rule.params["MAX SECTORS"] = std::to_string(maxSectors);
    return rule;
}

DBRule makeSqControlRow(bool countDeadhead, bool excludeFinal) {
    DBRule rule{};
    rule.idRule = 7450001;
    rule.function = 7450;
    rule.tableNum = 2;
    rule.rowNum = 1;
    rule.idRuleParam = 208174520;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SQ-CA";
    rule.category = "Duty";
    rule.params["SERVICE TYPE"] = "*";
    rule.params["FLEET GROUP"] = "*";
    rule.params["COUNT DEADHEAD SECTORS"] = countDeadhead ? "Y" : "N";
    rule.params["EXCLUDE FINAL DEADHEAD SECTORS"] = excludeFinal ? "Y" : "N";
    return rule;
}

RuleInput buildDefaultSqRuleInput() {
    RuleInput input;
    input.dbRules.push_back(makeSqRuleRow(1, "3P|4P", "00:00", "13:00", 2));
    input.dbRules.push_back(makeSqRuleRow(2, "3P|4P", "13:01", "99:00", 1));
    input.dbRules.push_back(makeSqControlRow(true, true));
    return input;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

class Rule7450Test : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
    }

    void setDutyCommonFields(Duty& duty,
                             int fdpMinutes,
                             const std::string& composition,
                             const std::string& fleet) {
        duty.setFDPInSecs(fdpMinutes * 60);
        duty.setCompositionName(composition);
        duty.setFltCD(fleet);
    }

    void configureRule(FdpSectorLimitForSQRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }

    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
};

TEST_F(Rule7450Test, AllowsTwoSectorsUnder13Hours) {
    auto input = buildDefaultSqRuleInput();
    FdpSectorLimitForSQRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
        "SIN", "BOM", "SQF", "SQ001", "2025-01-10 00:00:00", "2025-01-10 05:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "BOM", "SIN", "SQF", "SQ002", "2025-01-10 07:00:00", "2025-01-10 12:00:00", true));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
    setDutyCommonFields(duty, 12 * 60, "3P", "SQF");

    EXPECT_TRUE(rule.CheckRule(&duty));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7450Test, ViolatesWhenFdpAbove13WithTooManySectors) {
    auto input = buildDefaultSqRuleInput();
    FdpSectorLimitForSQRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
        "SIN", "FRA", "SQF", "SQ326", "2025-02-01 00:00:00", "2025-02-01 08:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "FRA", "SIN", "SQF", "SQ327", "2025-02-01 10:00:00", "2025-02-01 18:00:00", true));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
    setDutyCommonFields(duty, 14 * 60, "4P", "SQF");

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1u);
    EXPECT_NE(_violationStorage.front()->violation_msg.find("[SQ][Duty]"), std::string::npos);
}

TEST_F(Rule7450Test, TrailingDeadheadDoesNotIncreaseSectorCount) {
    auto input = buildDefaultSqRuleInput();
    input.dbRules.push_back(makeSqControlRow(true, true));
    FdpSectorLimitForSQRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
        "SIN", "LHR", "SQF", "SQ318", "2025-03-05 00:00:00", "2025-03-05 08:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "LHR", "SIN", "SQF", "SQ319", "2025-03-05 09:00:00", "2025-03-05 17:00:00", false));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
    setDutyCommonFields(duty, 14 * 60, "3P", "SQF");

    EXPECT_TRUE(rule.CheckRule(&duty));
    EXPECT_TRUE(_violationStorage.empty());
}

TEST_F(Rule7450Test, TrailingDeadheadCountsWhenNotExcluded) {
    auto input = buildDefaultSqRuleInput();
    input.dbRules.push_back(makeSqControlRow(true, false));
    FdpSectorLimitForSQRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
        "SIN", "LHR", "SQF", "SQ318", "2025-03-05 00:00:00", "2025-03-05 08:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "LHR", "SIN", "SQF", "SQ319", "2025-03-05 09:00:00", "2025-03-05 17:00:00", false));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
    setDutyCommonFields(duty, 14 * 60, "3P", "SQF");

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1u);
}

TEST_F(Rule7450Test, DeadheadSegmentsIgnoredWhenDisabled) {
    auto input = buildDefaultSqRuleInput();
    input.dbRules.push_back(makeSqControlRow(false, false));
    FdpSectorLimitForSQRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
        "SIN", "KUL", "SQF", "SQ101", "2025-04-01 00:00:00", "2025-04-01 01:00:00", false));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "KUL", "SIN", "SQF", "SQ102", "2025-04-01 02:00:00", "2025-04-01 07:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "SIN", "KUL", "SQF", "SQ103", "2025-04-01 08:00:00", "2025-04-01 09:00:00", false));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
    setDutyCommonFields(duty, 14 * 60, "4P", "SQF");

    EXPECT_TRUE(rule.CheckRule(&duty));
    EXPECT_TRUE(_violationStorage.empty());
}
