#include <gtest/gtest.h>

#include <cstdio>
#include <cstring>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7505/MinimumDaysOffForCARSRule.h"
#include "db/AssignmentHolder.h"
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
    return utcStrToUtc(const_cast<char*>(const_cast<char*>(s)));
}

long long nextRosterId() {
    static long long id = 750500100;
    return ++id;
}

void addAssignmentGroupEntry(const SharedPtr<CrewDataContext>& ctx,
                             const std::string& group,
                             const std::string& assignment) {
    auto item = std::make_shared<DBRule_8014>();
    item->airline = ctx->scenario.airline;
    item->assignemnt = assignment;
    item->assignmentGroup = group;
    ctx->rule_8014.push_back(item);
}

void configureYegYvrContext(const SharedPtr<CrewDataContext>& ctx) {
    ctx->scenario.airline = "F8";
    ctx->scenario.bases.push_back("YEG");
    ctx->scenario.startDtUTC = utcFromString("2026-06-01 00:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-06-30 23:59:59");
    ctx->scenario.division = "P";

    ctx->airportUtcOffsetMap["YEG"] = -360;
    ctx->airportUtcOffsetMap["YVR"] = -420;
    ctx->airportZoneIdMap["YEG"] = "America/Edmonton";
    ctx->airportZoneIdMap["YVR"] = "America/Vancouver";
    ctx->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"] = "YVR";

    addAssignmentGroupEntry(ctx, "DO", "DO");
    addAssignmentGroupEntry(ctx, "DO", "RDO");
    addAssignmentGroupEntry(ctx, "DO", "RRDO");
    addAssignmentGroupEntry(ctx, "DO", "SDO");
    addAssignmentGroupEntry(ctx, "DO", "PDO");
    addAssignmentGroupEntry(ctx, "DO", "LDO");
    addAssignmentGroupEntry(ctx, "SBY", "PRPM");
    addAssignmentGroupEntry(ctx, "SBY", "PRAM");
    addAssignmentGroupEntry(ctx, "SBY", "SBY");
    addAssignmentGroupEntry(ctx, "LEA", "VAC");
}

SharedPtr<CrewDataContext> buildYegCrewContext(const std::string& crewId) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenarioId = 1;
    configureYegYvrContext(ctx);

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

SharedPtr<ROSTER> makeRoster(const std::string& crewId,
                             const char* startUtc,
                             const char* endUtc,
                             const char* restUtc,
                             const std::string& qualifier,
                             const std::string& dutyGroup = "SBY") {
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    const time_t rest = utcFromString(restUtc);

    auto r = std::make_shared<ROSTER>();
    r->idcrew = crewId;
    r->rosterId = nextRosterId();
    r->pairing = nullptr;
    r->location = "YEG";
    r->qualifier = qualifier;
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

// PRPM at YEG: local 14:00 start (MDT, UTC-6) => 20:00 UTC, ends next day 05:59 UTC.
SharedPtr<ROSTER> makePrpmRosterForJuneDay(const std::string& crewId, int dayOfMonth) {
    char startUtc[32];
    char endUtc[32];
    char restUtc[32];
    std::snprintf(startUtc, sizeof(startUtc), "2026-06-%02d 20:00:00", dayOfMonth);
    if (dayOfMonth < 20) {
        std::snprintf(endUtc, sizeof(endUtc), "2026-06-%02d 05:59:00", dayOfMonth + 1);
        std::snprintf(restUtc, sizeof(restUtc), "2026-06-%02d 15:59:00", dayOfMonth + 1);
    } else {
        std::snprintf(endUtc, sizeof(endUtc), "2026-06-21 05:59:00");
        std::snprintf(restUtc, sizeof(restUtc), "2026-06-21 15:59:00");
    }
    return makeRoster(crewId, startUtc, endUtc, restUtc, "PRPM", "SBY");
}

void addCrew247LikeJun2026PrpmBlock(const SharedPtr<CrewDataContext>& ctx,
                                    const std::string& crewId,
                                    SharedPtr<CREW>& crew) {
    // Existing GDO spanning May 31 – Jun 1 (ro_input pairing 528898 pattern).
    crew->rosterList.push_back(makeRoster(crewId, "2026-05-31 06:01:00", "2026-06-01 06:00:00",
                                          "2026-06-01 06:00:00", "DO", "DO"));

    // Daily PRPM SBY Jun 1–20: pairing #32 on Jun 1, local 14:00 at YEG.
    for (int day = 1; day <= 20; ++day) {
        crew->rosterList.push_back(makePrpmRosterForJuneDay(crewId, day));
    }
    crew->rosterList.back()->restStrUtc = utcFromString("2026-06-30 23:59:59");
}

RuleInput make7505002JuneRpInput() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7505002;
    row.function = 7505;
    row.tableNum = 1;
    row.rowNum = 15;
    row.phase = 1;
    row.idRuleParam = 750500215;
    row.overridebility = "R";
    std::strcpy(row.description, "Min # GDOs in a RP");
    row.params["BASES"] = "*";
    row.params["RANKS"] = "*";
    row.params["FLEETS"] = "*";
    row.params["CREW TEAMS"] = "*";
    row.params["DO ASSIGNMENT GROUP"] = "DO";
    row.params["MIN DO"] = "12";
    row.params["PERIOD"] = "1";
    row.params["UNIT"] = "RP";
    row.params["RP DAYS RANGE"] = "30-30";
    row.params["UTILIZE POST DUTY REST"] = "Y";
    row.params["COUNT BLANK DAY"] = "Y";
    row.params["COUNT LAYOVER"] = "N";
    row.params["LEAVE ASSIGNMENTS"] = "VAC";
    row.params["LEAVE DAYS RANGE"] = "0-1";
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

int daysOffInViolation(const RULE_VIOLATION* rv) {
    const auto it = rv->operation_result.find("iDaysOff");
    if (it == rv->operation_result.end()) {
        return -1;
    }
    return std::stoi(it->second);
}

bool hasJuneRpMinimumDoViolation(const std::vector<RULE_VIOLATION*>& violations) {
    for (const RULE_VIOLATION* rv : violations) {
        if (rv == nullptr) {
            continue;
        }
        const auto minDoIt = rv->operation_result.find("rMinDO");
        const auto unitIt = rv->operation_result.find("rUnit");
        if (minDoIt != rv->operation_result.end() && minDoIt->second == "12" &&
            unitIt != rv->operation_result.end() && unitIt->second == "RP") {
            const int counted = daysOffInViolation(rv);
            if (counted >= 0 && counted < 12) {
                return true;
            }
        }
    }
    return false;
}

}  // namespace

class Rule7505Test : public ::testing::Test {
protected:
    void SetUp() override {
        ensureTimezoneDatabaseForTests();
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

    std::unique_ptr<MinimumDaysOffForCARSRule> makeRule(const SharedPtr<CrewDataContext>& ctx,
                                                        const RuleInput& input) {
        auto rule = std::make_unique<MinimumDaysOffForCARSRule>(nullptr, input);
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

// Crew 247-like case: PRPM SBY every day Jun 1–20 (YEG local 14:00 / pairing #32 on Jun 1).
// June RP requires 12 DO; SBY does not count and only late-June blank days remain.
TEST_F(Rule7505Test, RejectsCrew247DailyPrpmSbyJun2026InsufficientDaysOff) {
    const std::string crewId = "247";
    auto ctx = buildYegCrewContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    addCrew247LikeJun2026PrpmBlock(ctx, crewId, crew);

    auto rule = makeRule(ctx, make7505002JuneRpInput());
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    ASSERT_FALSE(_violations.empty());
    EXPECT_TRUE(hasJuneRpMinimumDoViolation(_violations))
        << "7505002 June RP must flag DO count below minimum 12";

    int reportedDaysOff = -1;
    for (const RULE_VIOLATION* rv : _violations) {
        const int counted = daysOffInViolation(rv);
        if (counted >= 0 && counted < 12) {
            reportedDaysOff = counted;
            break;
        }
    }
    EXPECT_GE(reportedDaysOff, 0);
    EXPECT_LT(reportedDaysOff, 12);
}
