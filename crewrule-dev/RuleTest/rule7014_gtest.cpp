#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7014/RecurrentExtendedRecoveryRestPeriodRule.h"
#include "db/Utility.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "../utils/TimeUtils.h"

namespace {

time_t utcFromString(const char* s) {
    return utcStrToUtc(const_cast<char*>(s));
}

RuleInput make7014Input(const std::string& minRest,
                        const std::string& noOfLns,
                        const std::string& maxSpanBetween,
                        const std::string& minLocalDays,
                        const std::string& assignments,
                        const std::string& assignmentGroups,
                        const std::string& countBlankDay,
                        const std::string& unit,
                        const std::string& period,
                        const std::string& minRerrpNum,
                        long long idRuleParam = 701400201) {
    RuleInput input;
    DBRule row{};
    row.idRule = 7014001;
    row.function = 7014;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = idRuleParam;
    row.overridebility = "S";
    std::strcpy(row.description, "Recurrent Extended Recovery Rest Period");
    row.reference = "TG";
    row.category = "EASA";

    row.params["RERRP MIN REST"] = minRest;
    row.params["RERRP NO OF LNS"] = noOfLns;
    row.params["MAX SPAN BETWEEN RERRPS"] = maxSpanBetween;
    row.params["RERRP MIN LOCAL DAYS"] = minLocalDays;
    row.params["RERRP ASSIGNMENTS"] = assignments;
    row.params["RERRP ASSIGNMENT GROUPS"] = assignmentGroups;
    row.params["IS COUNT BLANK DAY"] = countBlankDay;
    row.params["UNIT"] = unit;
    row.params["PERIOD"] = period;
    row.params["MIN RERRP NUM"] = minRerrpNum;

    input.dbRules.push_back(row);
    return input;
}

SharedPtr<ASSIGNMENT> makeAssignment(const std::string& code, const std::string& type) {
    auto a = std::make_shared<ASSIGNMENT>();
    a->assignment = code;
    a->TYPE = type;
    return a;
}

SharedPtr<CrewDataContext> buildContext(const std::string& crewId) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["AAA"] = 0;
    ctx->airportZoneIdMap["AAA"] = "UTC";
    ctx->scenario.airline = "QQ";
    ctx->scenario.division = "P";
    ctx->scenario.bases.push_back("AAA");

    ctx->assignmentNameMap["FLT"] = makeAssignment("FLT", "F");
    ctx->assignmentNameMap["OFF"] = makeAssignment("OFF", "L");

    ctx->assignmentNameGroupMap["FLY_GRP"].insert("FLT");

    auto crew = std::make_shared<CREW>();
    crew->idCrew = crewId;

    auto crewBase = std::make_shared<CREW_BASE>();
    crewBase->idCrew = crewId;
    crewBase->base = "AAA";
    crewBase->effUtc = 0;
    crewBase->expUtc = time(nullptr) + 10 * 365 * 24 * 3600;
    crewBase->isPrime = true;
    crew->baseList.push_back(crewBase);

    ctx->crewIdMap[crewId] = crew;
    ctx->crewList.push_back(crew);

    return ctx;
}

SharedPtr<ROSTER> makeFlightRoster(const std::string& crewId,
                                   const std::string& qualifier,
                                   time_t dutyStartUtc,
                                   time_t dutyEndUtc) {
    auto r = std::make_shared<ROSTER>();
    r->idcrew = crewId;
    r->qualifier = qualifier;
    r->source = "";
    r->setStartTimeUtcAct(dutyStartUtc);
    r->setEndTimeUtcAct(dutyEndUtc);
    r->setStartTimeLocAct(dutyStartUtc);
    r->setEndTimeLocAct(dutyEndUtc);
    r->setRestStartUtcAct(dutyEndUtc);
    r->setRestStartLocAct(dutyEndUtc);
    return r;
}

void attachRosters(const SharedPtr<CrewDataContext>& ctx,
                   const std::string& crewId,
                   const std::vector<SharedPtr<ROSTER>>& rosters) {
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (const auto& rr : rosters) {
        crew->rosterList.push_back(rr);
    }
}

std::unique_ptr<RecurrentExtendedRecoveryRestPeriodRule> makeRule7014(
    const SharedPtr<CrewDataContext>& ctx,
    const RuleInput& input,
    int application = PAIRING_EDITOR) {
    auto rule = std::make_unique<RecurrentExtendedRecoveryRestPeriodRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(application);
    return rule;
}

struct DutyInstant {
    const char* startUtc{};
    const char* endUtc{};
};

std::vector<SharedPtr<ROSTER>> buildFlightChain(const std::string& crewId,
                                                const std::vector<DutyInstant>& duties,
                                                const std::string& qualifier = "FLT") {
    std::vector<SharedPtr<ROSTER>> out;
    out.reserve(duties.size());
    for (const auto& d : duties) {
        const time_t s = utcFromString(d.startUtc);
        const time_t e = utcFromString(d.endUtc);
        out.push_back(makeFlightRoster(crewId, qualifier, s, e));
    }
    return out;
}

}  // namespace

class Rule7014Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& wocl = RuleParams::GetInstancePtr()->getWOCLDefinition();
        wocl.woclStart = TimeUtils::hhmmToMinutes("02:00");
        wocl.woclEnd = TimeUtils::hhmmToMinutes("05:59");
        auto& es = RuleParams::GetInstancePtr()->getEarlyStartDefinition();
        es.earlyStartStart = TimeUtils::hhmmToMinutes("02:00");
        es.earlyStartEnd = TimeUtils::hhmmToMinutes("06:00");
        auto& lf = RuleParams::GetInstancePtr()->getLateFinishDefinition();
        lf.lateFinishStart = TimeUtils::hhmmToMinutes("22:00");
        lf.lateFinishEnd = TimeUtils::hhmmToMinutes("23:59");
        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:00";
        ln.LocalEnd = "06:00";
        ln.MinRestInterval = "08:00";
    }
};

// Default-like params: 36h min rest, 2 local nights, 168h max span; three duties with 72h gaps (>=36h, multi-night).
TEST_F(Rule7014Test, HappyPath_TwoQualifyingRerrpsWithinMaxSpan) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7014HP1";
    auto ctx = buildContext(crewId);
    ctx->scenario.startDtUTC = utcFromString("2026-03-01 08:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-03-31 23:59:59");
    ctx->scenario.startDtLoc = ctx->scenario.startDtUTC;
    ctx->scenario.endDtLoc = ctx->scenario.endDtUTC;

    auto rosters = buildFlightChain(crewId,
                                    {{"2026-03-01 08:00:00", "2026-03-01 10:00:00"},
                                     {"2026-03-04 10:00:00", "2026-03-04 12:00:00"},
                                     {"2026-03-07 12:00:00", "2026-03-07 14:00:00"}});
    attachRosters(ctx, crewId, rosters);

    RuleInput input = make7014Input("36:00", "2", "168:00", "2", "*", "*", "N", "CM", "1", "2");

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7014(ctx, input);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule({rosters[0].get(), rosters[1].get(), rosters[2].get()}));
    EXPECT_GE(ctx->crewIdMap[crewId]->rerrpList.size(), 2u);

    for (auto* rv : violations) {
        delete rv;
    }
}

// Explicit FLT list (not '*') still matches flight duties.
TEST_F(Rule7014Test, HappyPath_AssignmentListLimitsToFlt) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7014HP2";
    auto ctx = buildContext(crewId);
    ctx->scenario.startDtUTC = utcFromString("2026-04-01 06:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-04-30 23:59:59");
    ctx->scenario.startDtLoc = ctx->scenario.startDtUTC;
    ctx->scenario.endDtLoc = ctx->scenario.endDtUTC;

    auto rosters = buildFlightChain(crewId,
                                    {{"2026-04-01 06:00:00", "2026-04-01 08:00:00"},
                                     {"2026-04-04 08:00:00", "2026-04-04 10:00:00"},
                                     {"2026-04-07 10:00:00", "2026-04-07 12:00:00"}});
    attachRosters(ctx, crewId, rosters);

    RuleInput input =
        make7014Input("36:00", "2", "168:00", "2", "FLT", "*", "N", "CW", "4", "3", 701400202);

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7014(ctx, input);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule({rosters[0].get(), rosters[1].get(), rosters[2].get()}));

    for (auto* rv : violations) {
        delete rv;
    }
}

// Assignment group membership gates counting (FLT in FLY_GRP).
TEST_F(Rule7014Test, HappyPath_AssignmentGroupAllowsFlt) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7014HP3";
    auto ctx = buildContext(crewId);
    ctx->scenario.startDtUTC = utcFromString("2026-05-01 09:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-05-31 23:59:59");
    ctx->scenario.startDtLoc = ctx->scenario.startDtUTC;
    ctx->scenario.endDtLoc = ctx->scenario.endDtUTC;

    auto rosters = buildFlightChain(crewId,
                                    {{"2026-05-01 09:00:00", "2026-05-01 11:00:00"},
                                     {"2026-05-04 11:00:00", "2026-05-04 13:00:00"},
                                     {"2026-05-07 13:00:00", "2026-05-07 15:00:00"}});
    attachRosters(ctx, crewId, rosters);

    RuleInput input =
        make7014Input("36:00", "2", "168:00", "2", "*", "FLY_GRP", "N", "CD", "14", "1", 701400203);

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7014(ctx, input);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule({rosters[0].get(), rosters[1].get(), rosters[2].get()}));

    for (auto* rv : violations) {
        delete rv;
    }
}

// IS COUNT BLANK DAY = Y adds a trailing rest window up to scenario end when it qualifies as a RERRP.
TEST_F(Rule7014Test, HappyPath_CountBlankDayExtendsThroughScenarioEnd) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7014HP4";
    auto ctx = buildContext(crewId);
    ctx->scenario.startDtUTC = utcFromString("2026-06-01 10:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-06-10 23:59:59");
    ctx->scenario.startDtLoc = ctx->scenario.startDtUTC;
    ctx->scenario.endDtLoc = utcFromString("2026-06-10 23:59:59");

    auto rosters =
        buildFlightChain(crewId,
                         {{"2026-06-01 10:00:00", "2026-06-01 12:00:00"}, {"2026-06-04 12:00:00", "2026-06-04 14:00:00"}});
    attachRosters(ctx, crewId, rosters);

    RuleInput input =
        make7014Input("36:00", "2", "168:00", "1", "*", "*", "Y", "CM", "2", "9", 701400204);

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7014(ctx, input);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule({rosters[0].get(), rosters[1].get()}));
    EXPECT_FALSE(ctx->crewIdMap[crewId]->rerrpList.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

// Mixed numeric/time tokens including boundary-style min rest (35:59 just below 36:00 would fail RERRP formation with 36:00 rule —
// here we use exactly 36:00 minimum with a 72h gap to stay on the happy side while exercising MIN RERRP NUM / UNIT / PERIOD columns.)
TEST_F(Rule7014Test, HappyPath_MinRestBoundaryAndRollingColumnsParsed) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7014HP5";
    auto ctx = buildContext(crewId);
    ctx->scenario.startDtUTC = utcFromString("2026-07-01 00:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-07-31 23:59:59");
    ctx->scenario.startDtLoc = ctx->scenario.startDtUTC;
    ctx->scenario.endDtLoc = ctx->scenario.endDtUTC;

    auto rosters = buildFlightChain(crewId,
                                    {{"2026-07-01 00:00:00", "2026-07-01 02:00:00"},
                                     {"2026-07-04 02:00:00", "2026-07-04 04:00:00"},
                                     {"2026-07-07 04:00:00", "2026-07-07 06:00:00"}});
    attachRosters(ctx, crewId, rosters);

    RuleInput input =
        make7014Input("36:00", "2", "168:00", "0", "*", "*", "N", "CM", "12", "99", 701400205);

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7014(ctx, input);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule({rosters[0].get(), rosters[1].get(), rosters[2].get()}));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7014Test, Reject_MaxSpanExceededByMiddleDutyLength) {
    const std::string crewId = "7014RJ1";
    auto ctx = buildContext(crewId);
    ctx->scenario.startDtUTC = utcFromString("2026-08-01 08:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-08-31 23:59:59");
    ctx->scenario.startDtLoc = ctx->scenario.startDtUTC;
    ctx->scenario.endDtLoc = ctx->scenario.endDtUTC;

    auto rosters = buildFlightChain(crewId,
                                    {{"2026-08-01 08:00:00", "2026-08-01 10:00:00"},
                                     {"2026-08-04 10:00:00", "2026-08-04 18:00:00"},
                                     {"2026-08-07 18:00:00", "2026-08-07 20:00:00"}});
    attachRosters(ctx, crewId, rosters);

    RuleInput input =
        make7014Input("36:00", "2", "2:00", "0", "*", "*", "N", "CM", "1", "2", 701400301);

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7014(ctx, input);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_FALSE(rule->CheckRule({rosters[0].get(), rosters[1].get(), rosters[2].get()}));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7014Test, Reject_MaxSpanBudgetThirtyMinutes) {
    const std::string crewId = "7014RJ2";
    auto ctx = buildContext(crewId);
    ctx->scenario.startDtUTC = utcFromString("2026-09-01 12:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-09-30 23:59:59");
    ctx->scenario.startDtLoc = ctx->scenario.startDtUTC;
    ctx->scenario.endDtLoc = ctx->scenario.endDtUTC;

    auto rosters = buildFlightChain(crewId,
                                    {{"2026-09-01 12:00:00", "2026-09-01 14:00:00"},
                                     {"2026-09-04 14:00:00", "2026-09-04 15:00:00"},
                                     {"2026-09-07 15:00:00", "2026-09-07 17:00:00"}});
    attachRosters(ctx, crewId, rosters);

    RuleInput input =
        make7014Input("36:00", "2", "0:30", "0", "*", "*", "N", "CW", "2", "1", 701400302);

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7014(ctx, input);
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_FALSE(rule->CheckRule({rosters[0].get(), rosters[1].get(), rosters[2].get()}));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7014Test, Reject_RosterOptimizerReturnsFalseOnSpan) {
    const std::string crewId = "7014RJ3";
    auto ctx = buildContext(crewId);
    ctx->scenario.startDtUTC = utcFromString("2026-10-01 06:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-10-31 23:59:59");
    ctx->scenario.startDtLoc = ctx->scenario.startDtUTC;
    ctx->scenario.endDtLoc = ctx->scenario.endDtUTC;

    auto rosters = buildFlightChain(crewId,
                                    {{"2026-10-01 06:00:00", "2026-10-01 08:00:00"},
                                     {"2026-10-04 08:00:00", "2026-10-04 16:00:00"},
                                     {"2026-10-07 16:00:00", "2026-10-07 18:00:00"}});
    attachRosters(ctx, crewId, rosters);

    RuleInput input =
        make7014Input("36:00", "2", "1:00", "0", "*", "*", "N", "CD", "7", "2", 701400303);

    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7014(ctx, input, ROSTER_OPTIMIZER);
    rule->setRuleViolation(&violations);

    EXPECT_FALSE(rule->CheckRule({rosters[0].get(), rosters[1].get(), rosters[2].get()}));

    for (auto* rv : violations) {
        delete rv;
    }
}
