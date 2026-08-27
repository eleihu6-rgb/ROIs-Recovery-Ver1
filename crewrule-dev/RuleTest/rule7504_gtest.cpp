#include <gtest/gtest.h>

#include <cstring>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7504/CheckMinSpaceBetweenDutyForF8Rule.h"
#include "db/RuleParams.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "orUtil/UtilFunc.h"

#ifndef RULETEST_DATA_DIR
#define RULETEST_DATA_DIR ""
#endif

namespace {

void ensureTimezoneDatabaseForTests() {
    static bool loaded = false;
    if (loaded) {
        return;
    }
    std::filesystem::path installDir;
    const std::filesystem::path dataDir = RULETEST_DATA_DIR;
    if (!dataDir.empty()) {
        const auto repoRoot = dataDir.parent_path().parent_path();
        installDir = repoRoot / "orUtil" / "TimeZoneUtil" / "tzdata";
    } else {
        installDir = std::filesystem::path("orUtil") / "TimeZoneUtil" / "tzdata";
    }
    if (!std::filesystem::exists(installDir)) {
        installDir = std::filesystem::absolute(installDir);
    }
    TimezoneUtils::SetTimezoneDatabase(installDir.string());
    loaded = true;
}

time_t utcFromString(const char* s) {
    return utcStrToUtc(const_cast<char*>(s));
}

long long nextRosterId() {
    static long long id = 750400100;
    return ++id;
}

void configureYegContext(const SharedPtr<CrewDataContext>& ctx) {
    ctx->scenario.airline = "F8";
    ctx->scenario.bases.push_back("YEG");
    ctx->scenario.startDtUTC = utcFromString("2026-05-01 00:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-05-31 23:59:59");
    ctx->scenario.division = "P";

    ctx->airportUtcOffsetMap["YEG"] = -360;
    ctx->airportZoneIdMap["YEG"] = "America/Edmonton";
    ctx->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"] = "YEG";
}

SharedPtr<CrewDataContext> buildYegCrewContext(const std::string& crewId) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenarioId = 1;
    configureYegContext(ctx);

    auto crew = std::make_shared<CREW>();
    crew->idCrew = crewId;
    crew->division = "P";

    auto crewBase = std::make_shared<CREW_BASE>();
    crewBase->idCrew = crewId;
    crewBase->base = "YEG";
    crewBase->effUtc = 0;
    crewBase->expUtc = utcFromString("2035-01-01 00:00:00");
    crewBase->isPrime = true;
    crew->baseList.push_back(crewBase);

    ctx->crewIdMap[crewId] = crew;
    ctx->crewList.push_back(crew);
    return ctx;
}

// Pre-assigned ground (GRD) reserve roster at YEG with no pairing.
SharedPtr<ROSTER> makeGroundRoster(const std::string& crewId,
                                   const char* startUtc,
                                   const char* restUtc,
                                   const char* startLoc,
                                   const char* restLoc) {
    auto r = std::make_shared<ROSTER>();
    r->idcrew = crewId;
    r->rosterId = nextRosterId();
    r->pairing = nullptr;
    r->location = "YEG";
    r->qualifier = "GRD";
    r->duty = "GRD";

    const time_t start = utcFromString(startUtc);
    const time_t rest = utcFromString(restUtc);
    const time_t startL = utcFromString(startLoc);
    const time_t restL = utcFromString(restLoc);

    r->actStrUtc = start;
    r->actEndUtc = rest;
    r->actRestStrUtc = rest;
    r->actStrLoc = startL;
    r->actEndLoc = restL;
    r->actRestStrLoc = restL;
    r->setStartTimeLocSch(startL);
    r->restStrUtc = rest + 3600;
    r->source = "PA";
    r->sourceType = ROSTER_SOURCE_PRE_ASSIGN;
    r->needRuleCheck = true;
    return r;
}

// 7504003: Spacing Rule - WOCL, LEVEL=D, MIN PERIOD=55 RH, PREV/NEXT ATTRIBUTES=WOCL,
// APPLY PRELABELLED ATTRIBUTES=N (WOCL determined by acclimatized time window).
RuleInput make7504WoclSpacingInput() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7504003;
    row.function = 7504;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 750400301;
    row.overridebility = "S";
    std::strcpy(row.classType, "R");
    std::strcpy(row.description, "Spacing Rule - WOCL");
    row.params["APPLY PRELABELLED ATTRIBUTES"] = "N";
    row.params["BASES"] = "*";
    row.params["FLEETS"] = "*";
    row.params["RANKS"] = "*";
    row.params["TEAMS"] = "*";
    row.params["LEVEL"] = "D";
    row.params["MIN PERIOD"] = "55";
    row.params["UNIT"] = "RH";
    row.params["PREV ASSIGNMENT GROUPS"] = "*";
    row.params["NEXT ASSIGNMENT GROUPS"] = "*";
    row.params["PREV ASSIGNMENTS"] = "*";
    row.params["NEXT ASSIGNMENTS"] = "*";
    row.params["PREV ATTRIBUTES"] = "WOCL";
    row.params["NEXT ATTRIBUTES"] = "WOCL";
    row.params["UTILIZE POST REST"] = "Y";
    input.dbRules.push_back(row);
    return input;
}

std::vector<const ROSTER*> asConstRosterPtrs(const std::vector<SharedPtr<ROSTER>>& rosters) {
    std::vector<const ROSTER*> out;
    out.reserve(rosters.size());
    for (const auto& r : rosters) {
        out.push_back(r.get());
    }
    return out;
}

}  // namespace

class Rule7504Test : public ::testing::Test {
protected:
    void SetUp() override {
        ensureTimezoneDatabaseForTests();
        RuleParams::GetInstancePtr()->setApplication(ROSTER_OPTIMIZER);
        _legality.crewIndex = 0;
        _legality.isLegal = true;
        _legality.skipCheckInLaterIterations = false;
        _legality.legalMessage.clear();
    }

    void TearDown() override {
        for (auto* v : _violations) {
            delete v;
        }
        _violations.clear();
        _violationMessages.clear();
    }

    std::unique_ptr<CheckMinSpaceBetweenDutyForF8Rule> makeRule(const SharedPtr<CrewDataContext>& ctx,
                                                               const RuleInput& input) {
        auto rule = std::make_unique<CheckMinSpaceBetweenDutyForF8Rule>(nullptr, input);
        rule->setDataContext(ctx);
        rule->setApplication(ROSTER_OPTIMIZER);
        rule->setRuleViolation(&_violations);
        rule->setViolations(&_violationMessages);
        rule->setRuleLegality(&_legality);
        return rule;
    }

    RULE_LEGALITY _legality{};
    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
};

// Regression for the ground-roster WOCL mis-classification bug.
// Crew 1427-like case: two pre-assigned GRD reserves at YEG local 14:00-23:59 on
// consecutive days. YEG is UTC-6 (MDT), so 23:59 local == 05:59 UTC next day. The old
// code compared the work-period times in raw UTC (the ground roster never sets an
// acclimatized timezone), so 05:59 UTC fell inside the WOCL window 02:00-05:59 and both
// duties were wrongly treated as WOCL, triggering a false 55RH spacing violation.
// After the fix the WOCL window is evaluated in crew-base local time, so a 14:00-23:59
// reserve is NOT WOCL and the spacing rule must not fire.
TEST_F(Rule7504Test, DaytimeGroundReserveIsNotWoclAndPassesSpacing) {
    const std::string crewId = "1427";
    auto ctx = buildYegCrewContext(crewId);
    auto crew = ctx->crewIdMap[crewId];

    // GRD May 24, YEG local 14:00 -> 23:59 (UTC 20:00 -> next day 05:59).
    crew->rosterList.push_back(makeGroundRoster(crewId,
                                                "2026-05-24 20:00:00", "2026-05-25 05:59:00",
                                                "2026-05-24 14:00:00", "2026-05-24 23:59:00"));
    // GRD May 25, YEG local 14:00 -> 23:59.
    crew->rosterList.push_back(makeGroundRoster(crewId,
                                                "2026-05-25 20:00:00", "2026-05-26 05:59:00",
                                                "2026-05-25 14:00:00", "2026-05-25 23:59:00"));

    auto rule = makeRule(ctx, make7504WoclSpacingInput());
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)))
        << "Daytime (14:00-23:59) ground reserves are not WOCL; 7504 WOCL spacing must not reject them";
    EXPECT_TRUE(_violations.empty());
}

// Positive control: genuine WOCL ground reserves (YEG local 00:00-05:00 overlap the
// 02:00-05:59 window) spaced less than 55RH apart must still be flagged, proving the fix
// did not disable WOCL detection.
TEST_F(Rule7504Test, OvernightGroundReserveIsWoclAndFailsSpacing) {
    const std::string crewId = "1427";
    auto ctx = buildYegCrewContext(crewId);
    auto crew = ctx->crewIdMap[crewId];

    // GRD May 24, YEG local 00:00 -> 05:00 (UTC 06:00 -> 11:00) -> WOCL.
    crew->rosterList.push_back(makeGroundRoster(crewId,
                                                "2026-05-24 06:00:00", "2026-05-24 11:00:00",
                                                "2026-05-24 00:00:00", "2026-05-24 05:00:00"));
    // GRD May 25, YEG local 00:00 -> 05:00 -> WOCL; gap ~19h < 55RH.
    crew->rosterList.push_back(makeGroundRoster(crewId,
                                                "2026-05-25 06:00:00", "2026-05-25 11:00:00",
                                                "2026-05-25 00:00:00", "2026-05-25 05:00:00"));

    auto rule = makeRule(ctx, make7504WoclSpacingInput());
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)))
        << "Overnight WOCL ground reserves spaced under 55RH must be rejected by 7504";
}
