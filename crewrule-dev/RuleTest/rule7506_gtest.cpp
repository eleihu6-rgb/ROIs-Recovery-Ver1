#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/legacyDefineHelper/RuleLegality.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7506/SingleDailyCheckinForCARSRule.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t utcFromString(const char* s) {
    return utcStrToUtc(const_cast<char*>(const_cast<char*>(s)));
}

long long nextRosterId() {
    static long long id = 750600100;
    return ++id;
}

SharedPtr<CrewDataContext> buildContext(const std::string& crewId) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenarioId = 1;
    ctx->scenario.airline = "F8";
    ctx->scenario.bases.push_back("AAA");
    ctx->scenario.startDtUTC = utcFromString("2026-01-01 00:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-12-31 23:59:59");
    ctx->airportUtcOffsetMap["AAA"] = 0;
    ctx->airportZoneIdMap["AAA"] = "UTC";

    auto crew = std::make_shared<CREW>();
    crew->idCrew = crewId;

    auto crewBase = std::make_shared<CREW_BASE>();
    crewBase->idCrew = crewId;
    crewBase->base = "AAA";
    crewBase->effUtc = 0;
    crewBase->expUtc = utcFromString("2035-01-01 00:00:00");
    crewBase->isPrime = true;
    crew->baseList.push_back(crewBase);

    ctx->crewIdMap[crewId] = crew;
    ctx->crewList.push_back(crew);
    return ctx;
}

SharedPtr<ROSTER> makeGroundRoster(const std::string& crewId,
                                   const char* startUtc,
                                   const char* endUtc,
                                   const char* restUtc,
                                   const std::string& station = "AAA",
                                   const std::string& dutyGroup = "FLY") {
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    const time_t rest = utcFromString(restUtc);

    auto r = std::make_shared<ROSTER>();
    r->idcrew = crewId;
    r->rosterId = nextRosterId();
    r->pairing = nullptr;
    r->location = station;
    r->qualifier = "GND";
    r->duty = dutyGroup;

    r->actStrUtc = start;
    r->actEndUtc = end;
    r->actRestStrUtc = rest;
    r->actStrLoc = start;
    r->actEndLoc = end;
    r->actRestStrLoc = rest;
    r->restStrUtc = rest + 3600;
    r->needRuleCheck = true;
    return r;
}

RuleInput make7506Input(const std::string& checkedGroups = "FLY") {
    RuleInput input;
    DBRule row{};
    row.idRule = 7506001;
    row.function = 7506;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 750600201;
    row.overridebility = "H";
    std::strcpy(row.description, "Single daily checkin for CARS");
    row.params["BASES"] = "*";
    row.params["RANKS"] = "*";
    row.params["FLEETS"] = "*";
    row.params["CREW TEAMS"] = "*";
    row.params["ASSIGNMENTS"] = checkedGroups;
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

class Rule7506Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
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

    std::unique_ptr<SingleDailyCheckinForCARSRule> makeRule(const SharedPtr<CrewDataContext>& ctx,
                                                            const RuleInput& input) {
        auto rule = std::make_unique<SingleDailyCheckinForCARSRule>(nullptr, input);
        rule->setDataContext(ctx);
        rule->setApplication(PAIRING_EDITOR);
        rule->setRuleViolation(&_violations);
        rule->setViolations(&_violationMessages);
        rule->setRuleLegality(&_legality);
        return rule;
    }

    RULE_LEGALITY _legality{};
    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
};

// Two roster starts on different local days (UTC base) — pass.
TEST_F(Rule7506Test, AllowsDifferentStartLocalDays) {
    const std::string crewId = "7506OK";
    auto ctx = buildContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    crew->rosterList = {
        makeGroundRoster(crewId, "2026-03-01 08:00:00", "2026-03-01 18:00:00", "2026-03-01 18:00:00"),
        makeGroundRoster(crewId, "2026-03-02 08:00:00", "2026-03-02 18:00:00", "2026-03-02 18:00:00"),
    };

    auto rule = makeRule(ctx, make7506Input());
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// Two roster starts on the same local day — fail.
TEST_F(Rule7506Test, RejectsSameStartLocalDay) {
    const std::string crewId = "7506BAD";
    auto ctx = buildContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    crew->rosterList = {
        makeGroundRoster(crewId, "2026-03-01 08:00:00", "2026-03-01 16:00:00", "2026-03-01 16:00:00"),
        makeGroundRoster(crewId, "2026-03-01 20:00:00", "2026-03-01 23:00:00", "2026-03-01 23:00:00"),
    };

    auto rule = makeRule(ctx, make7506Input());
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_FALSE(_violations.empty());
}

// Previous roster ends and next starts on the same local day, but starts are on different days — pass.
TEST_F(Rule7506Test, AllowsSameEndAndNextStartDayWhenStartsDiffer) {
    const std::string crewId = "7506EDGE";
    auto ctx = buildContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    crew->rosterList = {
        makeGroundRoster(crewId, "2026-03-01 08:00:00", "2026-03-02 06:00:00", "2026-03-02 06:00:00"),
        makeGroundRoster(crewId, "2026-03-02 07:00:00", "2026-03-02 18:00:00", "2026-03-02 18:00:00"),
    };

    auto rule = makeRule(ctx, make7506Input());
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// Non-checked assignment groups are ignored.
TEST_F(Rule7506Test, IgnoresUncheckedAssignmentGroups) {
    const std::string crewId = "7506SKIP";
    auto ctx = buildContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    crew->rosterList = {
        makeGroundRoster(crewId, "2026-03-01 08:00:00", "2026-03-01 16:00:00", "2026-03-01 16:00:00", "AAA", "DO"),
        makeGroundRoster(crewId, "2026-03-01 20:00:00", "2026-03-01 23:00:00", "2026-03-01 23:00:00", "AAA", "FLY"),
    };

    auto rule = makeRule(ctx, make7506Input("DO"));
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}
