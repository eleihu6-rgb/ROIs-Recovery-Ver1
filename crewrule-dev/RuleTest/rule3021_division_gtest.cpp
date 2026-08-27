#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleSystemDefine.h"

#include <cstring>
#include <memory>
#include <sstream>
#include <vector>

// Declared in db/RuleParseParams.cpp (no header today).
void parseRuleParams(std::vector<DBRule>& list, std::vector<SharedPtr<DBRule_8014>>& assignsAndGrps);

namespace {

DBRule make3021Rule(const std::string& division, int briefMinutes) {
    DBRule rule{};
    rule.function = RULES::CHECK_IN_OUT_BRIEF; // 3021
    rule.tableNum = 1;
    rule.rowNum = 1;
    std::strncpy(rule.classType, "B", RULE_INFO_LEN - 1);
    rule.phase = 0;

    rule.params["AIRPORT"] = "SIN";
    rule.params["DEPSTART"] = "00:00";
    rule.params["DEPEND"] = "23:59";
    rule.params["DUTY TYPE"] = "*";
    rule.params["FLT NUMS"] = "*";
    rule.params["FLEETS"] = "*";
    rule.params["ASSIGNMENT"] = "*";
    {
        const int hours = briefMinutes / 60;
        const int minutes = briefMinutes % 60;
        std::ostringstream ss;
        ss << (hours < 10 ? "0" : "") << hours << ":";
        ss << (minutes < 10 ? "0" : "") << minutes;
        rule.params["BRIEF TIME"] = ss.str();
    }

    if (!division.empty()) {
        rule.params["DIVISION"] = division;
    }
    return rule;
}

std::unique_ptr<Segment> makeSinSegment() {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation("SIN");
    seg->setArrStation("SIN");
    seg->setAssignment("FLY");
    seg->setIsOperating(true);
    seg->setFlightNumber("SQ000");
    seg->setFleetCD("350");
    seg->setStartTimeLocAct(8 * 3600); // 08:00 local, arbitrary epoch day
    seg->setEndTimeLocAct(9 * 3600);
    return seg;
}

SharedPtr<CrewDataContext> buildMinimalContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["SIN"] = 480;
    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
    return ctx;
}

} // namespace

TEST(Rule3021Division, ParsesOptionalDivision) {
    DBRule wildcard = make3021Rule("", 75); // no DIVISION provided => "*"
    DBRule crewP = make3021Rule("P", 60);

    std::vector<DBRule> rules = {wildcard, crewP};
    std::vector<SharedPtr<DBRule_8014>> assigns;
    parseRuleParams(rules, assigns);

    auto* w = static_cast<rule3021*>(rules[0].parsedParam.get());
    ASSERT_NE(w, nullptr);
    EXPECT_EQ(w->division, "*");

    auto* p = static_cast<rule3021*>(rules[1].parsedParam.get());
    ASSERT_NE(p, nullptr);
    EXPECT_EQ(p->division, "P");
}

TEST(Rule3021Division, Parse3021WithExactSequence) {
    // Wildcard row first to validate exact-division preference.
    DBRule crewP = make3021Rule("P", 60);
    DBRule crewC = make3021Rule("C", 90);
    DBRule wildcard = make3021Rule("", 75); // "*"

    auto ctx = buildMinimalContext();
    ctx->ruleList = {crewP, crewC, wildcard};

    parseRuleParams(ctx->ruleList, ctx->rule_8014);

    auto seg = makeSinSegment();
    std::vector<Segment*> segs{seg.get()};
    Duty duty(segs);

    LegalityChecker checker(BATCH_LEGALITY, false);
    checker.setDataContext(ctx, -1, false);

    ctx->scenario.division = "P";
    EXPECT_EQ(checker.calculateDutyBrief(&duty), 60);

    ctx->scenario.division = "C";
    EXPECT_EQ(checker.calculateDutyBrief(&duty), 90);
}
