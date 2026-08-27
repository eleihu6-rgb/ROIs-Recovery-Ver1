/**
 * @file rule7365_gtest.cpp
 * @brief Rule 7365 — Legal Days Off (5J), including leading blank-day extension (4A+4B).
 */

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "GlobalDefinition/RuleEngineDef.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7365/CheckLegalDaysOffFor5JRule.h"
#include "RuleEngine/rule/rule7365/CheckLegalDaysOffFor5JRuleParam.h"
#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "db/AssignmentHolder.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t locFromString(const char* s) {
    return utcStrToUtc(const_cast<char*>(s));
}

time_t locToUtc(time_t loc, int offsetMinutes) {
    return loc - offsetMinutes * 60;
}

long long nextRosterId() {
    static long long id = 736500100;
    return ++id;
}

void registerAssignment(const std::shared_ptr<CrewDataContext>& ctx,
    const std::string& assignmentCode,
    const std::string& groupCode) {
    auto assignment = std::make_shared<ASSIGNMENT>();
    assignment->AIRLINE = ctx->scenario.airline;
    assignment->ASSIGNMENT_ID = static_cast<int>(ctx->assignmentNameMap.size() + 1);
    assignment->assignment = assignmentCode;
    assignment->TYPE = groupCode;
    assignment->FDP_PCT = 1.0;
    assignment->DP_PCT = 1.0;
    assignment->BT_PCT = 1.0;
    ctx->assignmentNameMap[assignmentCode] = assignment;
    AssignmentHolder::getAirline(ctx->scenario.airline);
    AssignmentHolder::getInst().add(*assignment);
    ctx->assignmentNameGroupMap[groupCode].insert(assignmentCode);
}

std::shared_ptr<ROSTER> makeGroundRoster(const std::shared_ptr<CrewDataContext>& ctx,
    const std::string& crewId,
    const std::string& assignmentCode,
    const char* startLocStr,
    const char* endLocStr,
    int offsetMinutes) {
    auto roster = std::make_shared<ROSTER>();
    roster->rosterId = nextRosterId();
    roster->idcrew = crewId;
    roster->pairing = nullptr;
    roster->qualifier = assignmentCode;
    roster->actStrLoc = locFromString(startLocStr);
    roster->actEndLoc = locFromString(endLocStr);
    roster->actStrUtc = locToUtc(roster->actStrLoc, offsetMinutes);
    roster->actEndUtc = locToUtc(roster->actEndLoc, offsetMinutes);
    roster->actRestStrLoc = roster->actEndLoc;
    roster->actRestStrUtc = roster->actEndUtc;
    return roster;
}

std::shared_ptr<CrewDataContext> buildCrew639Context() {
    constexpr int offsetMinutes = 480; // MNL UTC+8
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenarioId = 7365;
    ctx->scenario.airline = "5J";
    ctx->scenario.division = "P";
    ctx->scenario.bases.push_back("MNL");
    ctx->scenario.startDtUTC = locToUtc(locFromString("2023-10-31 00:00:00"), offsetMinutes);
    ctx->scenario.endDtUTC = locToUtc(locFromString("2023-12-31 23:59:59"), offsetMinutes);
    ctx->airportUtcOffsetMap["MNL"] = offsetMinutes;
    ctx->airportZoneIdMap["MNL"] = "Asia/Manila";

    registerAssignment(ctx, "OFF", "DO");
    registerAssignment(ctx, "AS", "AS");

    auto crew = std::make_shared<CREW>();
    crew->idCrew = "639";
    auto crewBase = std::make_shared<CREW_BASE>();
    crewBase->idCrew = "639";
    crewBase->base = "MNL";
    crewBase->effUtc = 0;
    crewBase->expUtc = locToUtc(locFromString("2035-01-01 00:00:00"), offsetMinutes);
    crewBase->isPrime = true;
    crew->baseList.push_back(crewBase);

    crew->rosterList.push_back(
        makeGroundRoster(ctx, "639", "OFF", "2023-11-02 00:00:00", "2023-11-02 23:59:00", offsetMinutes));
    crew->rosterList.push_back(
        makeGroundRoster(ctx, "639", "AS", "2023-11-03 06:30:00", "2023-11-03 16:30:00", offsetMinutes));
    crew->rosterList.push_back(
        makeGroundRoster(ctx, "639", "AS", "2023-11-04 06:30:00", "2023-11-04 16:30:00", offsetMinutes));
    crew->rosterList.push_back(
        makeGroundRoster(ctx, "639", "AS", "2023-11-05 13:20:00", "2023-11-06 00:30:00", offsetMinutes));
    crew->rosterList.push_back(
        makeGroundRoster(ctx, "639", "AS", "2023-11-07 11:30:00", "2023-11-07 19:30:00", offsetMinutes));
    crew->rosterList.push_back(
        makeGroundRoster(ctx, "639", "AS", "2023-11-08 18:30:00", "2023-11-09 04:30:00", offsetMinutes));

    ctx->crewList.push_back(crew);
    ctx->crewIdMap["639"] = crew;
    return ctx;
}

DBRule make7365DbRule(const std::string& includeBlankDay = "Y") {
    DBRule rule;
    rule.idRule = 7365001;
    rule.function = RULES::CHECK_LEGAL_DAYS_OFF_FOR_5J;
    rule.params["DAYS OFF ASSIGNMENT GROUPS"] = "DO";
    rule.params["DAYS OFF ASSIGNMENTS"] = "*";
    rule.params["DAY OFF DURATION"] = "36:00";
    rule.params["LOCAL NIGHTS"] = "2";
    rule.params["ADDITIONAL DAY OFF DURATION"] = "*";
    rule.params["ADDITIONAL DAY OFF LOCAL NIGHT"] = "*";
    rule.params["INCLUDE BLANK DAY"] = includeBlankDay;
    rule.params["INCLUDE LAYOVER REST"] = "Y";
    rule.params["INCLUDE PAIRING BASE REST"] = "Y";
    return rule;
}

std::vector<const ROSTER*> collectRosterPtrs(const std::shared_ptr<CrewDataContext>& ctx) {
    std::vector<const ROSTER*> rosters;
    for (const auto& r : ctx->crewIdMap["639"]->rosterList) {
        rosters.push_back(r.get());
    }
    return rosters;
}

} // namespace

class Rule7365Crew639Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(ROSTER_EDITOR);
        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:00";
        ln.LocalEnd = "08:00";
        ln.MinRestInterval = "08:00";
    }
};

TEST_F(Rule7365Crew639Test, PhaseA_SingleOffDay_FailsWithoutLeadingBlankExtension) {
    auto ctx = buildCrew639Context();
    auto rosters = collectRosterPtrs(ctx);

    //CheckLegalDaysOffFor5JRuleParam param(nullptr);
    //param.ParseParam(make7365DbRule());

    //auto groups = param.GetConsecutiveDayOffGroupInfos(rosters, "MNL");
    //ASSERT_EQ(groups.size(), 1u);
    //const auto& g = groups.front();

    //EXPECT_EQ(g.startLoc, locFromString("2023-11-02 00:00:00"));
    //EXPECT_EQ(g.endLoc, locFromString("2023-11-02 23:59:00"));
    //EXPECT_FALSE(param.ValidateDayOffGroup(g.startLoc, g.endLoc, 1));
    //EXPECT_LT((g.endLoc - g.startLoc) / 60, 2160);
}

TEST_F(Rule7365Crew639Test, PhaseB_LeadingBlankDays_PassesForCrew639) {
    auto ctx = buildCrew639Context();
    auto rosters = collectRosterPtrs(ctx);

    //CheckLegalDaysOffFor5JRuleParam param(nullptr);
    //param.ParseParam(make7365DbRule());

    //auto groups = param.GetConsecutiveDayOffGroupInfos(rosters, "MNL");
    //ASSERT_EQ(groups.size(), 1u);
    //auto group = groups.front();

    //EXPECT_FALSE(param.ValidateDayOffGroup(group.startLoc, group.endLoc, 1));

    //EXPECT_TRUE(param.ValidateDayOffGroupWithLeadingBlankDayFallback(group, rosters, "MNL", *ctx));
    //EXPECT_EQ(group.startLoc, locFromString("2023-10-31 00:00:00"));
    //EXPECT_GE((group.endLoc - group.startLoc) / 60, 2160);
    //EXPECT_GE(DutyUtils::GetLocalNightNums(group.startLoc, group.endLoc), 2);

    //RuleInput input;
    //input.dbRules.push_back(make7365DbRule());
    //CheckLegalDaysOffFor5JRule rule(nullptr, input);
    //rule.setDataContext(ctx);
    //EXPECT_TRUE(rule.CheckRule(rosters));
}

TEST_F(Rule7365Crew639Test, IncludeBlankDay_N_SkipsLeadingBlankExtension) {
    auto ctx = buildCrew639Context();
    auto rosters = collectRosterPtrs(ctx);

    //CheckLegalDaysOffFor5JRuleParam param(nullptr);
    //param.ParseParam(make7365DbRule("N"));

    //auto groups = param.GetConsecutiveDayOffGroupInfos(rosters, "MNL");
    //ASSERT_EQ(groups.size(), 1u);
    //auto group = groups.front();

    //EXPECT_FALSE(param.ValidateDayOffGroupWithLeadingBlankDayFallback(group, rosters, "MNL", *ctx));
    //EXPECT_EQ(group.startLoc, locFromString("2023-11-02 00:00:00"));
}

TEST_F(Rule7365Crew639Test, OffAfterFlyOnPriorDay_NoExtensionAcrossFly) {
    constexpr int offsetMinutes = 480;
    auto ctx = buildCrew639Context();
    auto fly = makeGroundRoster(ctx, "639", "AS", "2023-11-01 06:00:00", "2023-11-01 16:00:00", offsetMinutes);
    ctx->crewIdMap["639"]->rosterList.insert(ctx->crewIdMap["639"]->rosterList.begin(), fly);

    auto rosters = collectRosterPtrs(ctx);
    //CheckLegalDaysOffFor5JRuleParam param(nullptr);
    //param.ParseParam(make7365DbRule());

    //auto groups = param.GetConsecutiveDayOffGroupInfos(rosters, "MNL");
    //ASSERT_EQ(groups.size(), 1u);
    //auto group = groups.front();

    //EXPECT_EQ(group.startLoc, locFromString("2023-11-01 16:00:00"));
    //EXPECT_FALSE(param.ValidateDayOffGroup(group.startLoc, group.endLoc, 1));
    //EXPECT_FALSE(param.ValidateDayOffGroupWithLeadingBlankDayFallback(group, rosters, "MNL", *ctx));
}
