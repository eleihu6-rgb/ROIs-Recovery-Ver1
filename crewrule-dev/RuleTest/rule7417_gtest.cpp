#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>
#include <cstring>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7417/CheckAnrReportingDebriefRule.h"

std::shared_ptr<ruleParams> parseRuleParam3021(DBRule& item);
std::shared_ptr<ruleParams> parseRuleParam3022(DBRule& item);

namespace {

RuleInput makeRuleInput7417() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7417001;
    row.function = 7417;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 208279003;
    row.overridebility = "S";
    row.reference = "ANR";
    std::strcpy(row.description, "ANR reporting + debrief minimum minutes");
    row.params["SERVICE TYPE"] = "*";
    row.params["FLEET GROUP"] = "*";
    row.params["DUTY ASSIGNMENT"] = "MVO|FLY|MVP";
    row.params["MIN TOTAL BRIEF+DEBRIEF"] = "01:30";
    row.params["MIN BRIEF"] = "*";
    input.dbRules.push_back(row);
    return input;
}

std::unique_ptr<CheckAnrReportingDebriefRule> makeRule7417(
    const SharedPtr<CrewDataContext>& ctx) {
    RuleInput input = makeRuleInput7417();
    auto rule = std::make_unique<CheckAnrReportingDebriefRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

std::unique_ptr<CheckAnrReportingDebriefRule> makeRule7417(
    const SharedPtr<CrewDataContext>& ctx,
    const RuleInput& input) {
    auto rule = std::make_unique<CheckAnrReportingDebriefRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

DBRule makeRule3022(int rowNum,
                    int ruleParamId,
                    const std::string& assignment,
                    const std::string& debriefTime) {
    DBRule row{};
    row.idRule = 3022001;
    row.function = 3022;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.phase = 1;
    row.idRuleParam = ruleParamId;
    row.overridebility = "S";
    row.reference = "ANR";
    std::strcpy(row.description, "Duty debrief");
    row.params["AIRPORT"] = "*";
    row.params["DUTY TYPE"] = "*";
    row.params["FLT NUMS"] = "*";
    row.params["FLEETS"] = "*";
    row.params["ASSIGNMENT"] = assignment;
    row.params["DEBRIEF TIME"] = debriefTime;
    row.parsedParam = parseRuleParam3022(row);
    return row;
}

DBRule makeRule3021(int rowNum,
                    int ruleParamId,
                    const std::string& assignment,
                    const std::string& briefTime,
                    const std::string& dutyAssignment = "*") {
    DBRule row{};
    row.idRule = 3021001;
    row.function = 3021;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.phase = 1;
    row.idRuleParam = ruleParamId;
    row.overridebility = "S";
    row.reference = "ANR";
    std::strcpy(row.description, "Duty brief");
    row.params["AIRPORT"] = "*";
    row.params["DEPSTART"] = "*";
    row.params["DEPEND"] = "*";
    row.params["DUTY TYPE"] = "*";
    row.params["FLT NUMS"] = "*";
    row.params["FLEETS"] = "*";
    row.params["ASSIGNMENT"] = assignment;
    row.params["DUTY ASSIGNMENTS"] = dutyAssignment;
    row.params["BRIEF TIME"] = briefTime;
    row.parsedParam = parseRuleParam3021(row);
    return row;
}

void addRule3021(const SharedPtr<CrewDataContext>& ctx, DBRule row) {
    ctx->addRuleFunction(3021, row);
}

void addRule3022(const SharedPtr<CrewDataContext>& ctx, DBRule row) {
    ctx->addRuleFunction(3022, row);
}

}  // namespace

std::unique_ptr<Segment> makeSegment7417(const std::string& assignment,
                                         bool isOperating) {
    auto segment = std::make_unique<Segment>();
    segment->setAssignment(assignment);
    segment->setIsOperating(isOperating);
    return segment;
}

TEST(Rule7417Test, FailsWhenBriefPlusDebriefBelowMinimum) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8001);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(3600);
    duty->setAssignment("MVO");
    duty->setFleetType("A350");
    duty->setActualBriefMin(60);
    duty->setActualDebriefMin(29);
    auto flySegment = makeSegment7417("FLY", true);
    duty->appendSegment(flySegment.get());

    EXPECT_FALSE(rule->CheckRule(duty.get()));
    ASSERT_FALSE(violations.empty());
    const std::string msg = violations.front()->violation_msg;
    EXPECT_NE(msg.find("[ANR]"), std::string::npos);
    EXPECT_NE(msg.find("reporting"), std::string::npos);
    EXPECT_NE(msg.find("debrief"), std::string::npos);
    EXPECT_NE(msg.find("total"), std::string::npos);
    EXPECT_NE(msg.find("violated"), std::string::npos);
    EXPECT_NE(msg.find("assignment"), std::string::npos);
    EXPECT_NE(msg.find("service type"), std::string::npos);
    EXPECT_NE(msg.find("fleet"), std::string::npos);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, UsesExistingDutyBriefBefore3021Fallback) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    addRule3021(ctx, makeRule3021(1, 302100101, "FLY", "00:45"));
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8008);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(3600);
    duty->setAssignment("MVO");
    duty->setActualBriefMin(20);
    duty->setActualDebriefMin(60);

    auto flySegment = makeSegment7417("FLY", true);
    duty->appendSegment(flySegment.get());

    EXPECT_FALSE(rule->CheckRule(duty.get()));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_EQ(violations.front()->operation_result["reporting"], "00:20");

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, UsesFirstForwardMatched3021BriefWhenDutyBriefMissing) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    addRule3021(ctx, makeRule3021(1, 302100102, "BUS", "00:00"));
    addRule3021(ctx, makeRule3021(2, 302100103, "FLY", "00:30"));
    addRule3022(ctx, makeRule3022(1, 302200106, "FLY", "01:00"));
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8009);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(7200);
    duty->setAssignment("MVO");
    duty->setActualBriefMin(0);
    duty->setActualDebriefMin(0);

    auto busSegment = makeSegment7417("BUS", false);
    auto flySegment = makeSegment7417("FLY", true);
    duty->appendSegment(busSegment.get());
    duty->appendSegment(flySegment.get());

    EXPECT_TRUE(rule->CheckRule(duty.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, FailsWhenNoForward3021BriefMatchExists) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    addRule3021(ctx, makeRule3021(1, 302100104, "FLY", "00:30"));
    addRule3022(ctx, makeRule3022(1, 302200107, "FLY", "00:30"));
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8010);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(7200);
    duty->setAssignment("MVO");
    duty->setActualBriefMin(0);
    duty->setActualDebriefMin(0);

    auto busSegment = makeSegment7417("BUS", false);
    auto flySegment = makeSegment7417("FLY", true);
    duty->appendSegment(busSegment.get());
    duty->appendSegment(flySegment.get());

    EXPECT_FALSE(rule->CheckRule(duty.get()));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_EQ(violations.front()->operation_result["reporting"], "00:30");

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, UsesExistingDutyDebriefBefore3022Fallback) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    addRule3022(ctx, makeRule3022(1, 302200101, "FLY", "00:30"));
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8004);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(3600);
    duty->setAssignment("MVO");
    duty->setActualBriefMin(60);
    duty->setActualDebriefMin(15);

    auto flySegment = makeSegment7417("FLY", true);
    duty->appendSegment(flySegment.get());

    EXPECT_FALSE(rule->CheckRule(duty.get()));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_EQ(violations.front()->operation_result["debrief"], "00:15");

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, UsesLastBackwardMatched3022DebriefWhenDutyDebriefMissing) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    addRule3022(ctx, makeRule3022(1, 302200102, "FLY", "00:30"));
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8005);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(7200);
    duty->setAssignment("MVO");
    duty->setActualBriefMin(60);
    duty->setActualDebriefMin(0);

    auto firstFlySegment = makeSegment7417("FLY", true);
    auto busSegment = makeSegment7417("BUS", false);
    duty->appendSegment(firstFlySegment.get());
    duty->appendSegment(busSegment.get());

    EXPECT_TRUE(rule->CheckRule(duty.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, SkipsZeroDebrief3022MatchesAndKeepsScanningBackward) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    addRule3022(ctx, makeRule3022(1, 302200103, "BUS", "00:00"));
    addRule3022(ctx, makeRule3022(2, 302200104, "FLY", "00:30"));
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8006);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(7200);
    duty->setAssignment("MVO");
    duty->setActualBriefMin(60);
    duty->setActualDebriefMin(0);

    auto flySegment = makeSegment7417("FLY", true);
    auto busSegment = makeSegment7417("BUS", false);
    duty->appendSegment(flySegment.get());
    duty->appendSegment(busSegment.get());

    EXPECT_TRUE(rule->CheckRule(duty.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, FailsWhenNoBackward3022DebriefMatchExists) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    addRule3022(ctx, makeRule3022(1, 302200105, "BUS", "00:30"));
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8007);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(7200);
    duty->setAssignment("MVO");
    duty->setActualBriefMin(60);
    duty->setActualDebriefMin(0);

    auto flySegment = makeSegment7417("FLY", true);
    auto busSegment = makeSegment7417("BUS", false);
    duty->appendSegment(flySegment.get());
    duty->appendSegment(busSegment.get());

    EXPECT_FALSE(rule->CheckRule(duty.get()));
    ASSERT_EQ(violations.size(), 1u);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, SkipsWhenDutyAssignmentNotMatched) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8002);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(3600);
    duty->setAssignment("SBY");
    duty->setActualBriefMin(0);
    duty->setActualDebriefMin(0);

    EXPECT_TRUE(rule->CheckRule(duty.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, SkipsWhenDutyHasNoFlyOrDhdSegments) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8011);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(3600);
    duty->setAssignment("MVP");
    duty->setActualBriefMin(0);
    duty->setActualDebriefMin(0);

    auto trainSegment = makeSegment7417("TRAIN", false);
    duty->appendSegment(trainSegment.get());

    EXPECT_TRUE(rule->CheckRule(duty.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, FallbackUsesOnlyFlyOrDhdSegments) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    addRule3021(ctx, makeRule3021(1, 302100108, "TRAIN", "00:01"));
    addRule3021(ctx, makeRule3021(2, 302100109, "FLY", "00:30"));
    addRule3022(ctx, makeRule3022(1, 302200108, "TRAIN", "00:01"));
    addRule3022(ctx, makeRule3022(2, 302200109, "FLY", "01:00"));
    auto rule = makeRule7417(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8012);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(7200);
    duty->setAssignment("MVO");
    duty->setActualBriefMin(0);
    duty->setActualDebriefMin(0);

    auto trainStart = makeSegment7417("TRAIN", false);
    auto flyMiddle = makeSegment7417("FLY", true);
    auto trainEnd = makeSegment7417("TRAIN", false);
    duty->appendSegment(trainStart.get());
    duty->appendSegment(flyMiddle.get());
    duty->appendSegment(trainEnd.get());

    EXPECT_TRUE(rule->CheckRule(duty.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST(Rule7417Test, AppliesAllMatchedConfigsForDuty) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);

    RuleInput input;
    DBRule row1{};
    row1.idRule = 7417001;
    row1.function = 7417;
    row1.tableNum = 1;
    row1.rowNum = 1;
    row1.phase = 1;
    row1.idRuleParam = 208279101;
    row1.overridebility = "S";
    row1.reference = "ANR";
    std::strcpy(row1.description, "Lenient row");
    row1.params["SERVICE TYPE"] = "*";
    row1.params["FLEET GROUP"] = "*";
    row1.params["DUTY ASSIGNMENT"] = "MVO";
    row1.params["MIN TOTAL BRIEF+DEBRIEF"] = "01:00";
    row1.params["MIN BRIEF"] = "00:30";
    input.dbRules.push_back(row1);

    DBRule row2 = row1;
    row2.rowNum = 2;
    row2.idRuleParam = 208279102;
    std::strcpy(row2.description, "Strict row");
    row2.params["MIN TOTAL BRIEF+DEBRIEF"] = "01:30";
    input.dbRules.push_back(row2);

    auto rule = makeRule7417(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(1);
    duty->setPairingId(8003);
    duty->setStartTimeUtcAct(0);
    duty->setEndTimeUtcAct(3600);
    duty->setAssignment("MVO");
    duty->setActualBriefMin(45);
    duty->setActualDebriefMin(15);
    auto flySegment = makeSegment7417("FLY", true);
    duty->appendSegment(flySegment.get());

    EXPECT_FALSE(rule->CheckRule(duty.get()));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_EQ(violations.front()->ruleParamId, 208279102);

    for (auto* rv : violations) {
        delete rv;
    }
}
