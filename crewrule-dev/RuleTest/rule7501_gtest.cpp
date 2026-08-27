#include <gtest/gtest.h>

#include <cstring>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7501/LimitSingleDayFreeFromDutyForCARSRule.h"
#include "db/AssignmentHolder.h"
#include "db/Duty.h"
#include "db/Pairing.h"
#include "db/RuleParams.h"
#include "db/Segment.h"
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

long long nextDutyId() {
    static long long id = 750100100;
    return ++id;
}

long long nextSegmentId() {
    static long long id = 750100200;
    return ++id;
}

long long nextPairingId() {
    static long long id = 750100300;
    return ++id;
}

long long nextRosterId() {
    static long long id = 750100400;
    return ++id;
}

SharedPtr<CrewDataContext> buildContext(const std::string& crewId,
                                         const char* scenarioStartUtc = "2026-03-01 00:00:00",
                                         const char* scenarioEndUtc = "2026-03-31 23:59:59") {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenarioId = 1;
    ctx->scenario.airline = "F8";
    ctx->scenario.bases.push_back("AAA");
    ctx->scenario.startDtUTC = utcFromString(scenarioStartUtc);
    ctx->scenario.endDtUTC = utcFromString(scenarioEndUtc);
    ctx->airportUtcOffsetMap["AAA"] = 0;
    ctx->airportZoneIdMap["AAA"] = "UTC";

    auto assignment = std::make_shared<ASSIGNMENT>();
    assignment->AIRLINE = ctx->scenario.airline;
    assignment->ASSIGNMENT_ID = 7501;
    assignment->assignment = "FLY";
    assignment->TYPE = "FLY";
    ctx->assignmentNameMap["FLY"] = assignment;
    AssignmentHolder::getAirline(ctx->scenario.airline);
    AssignmentHolder::getInst().add(*assignment);

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

std::unique_ptr<Duty> makeDuty(const char* startUtc,
                               const char* endUtc,
                               int dutyEndRefTzMinutes,
                               std::vector<std::unique_ptr<Segment>>& segStore) {
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);

    auto duty = std::make_unique<Duty>();
    duty->setDutyId(nextDutyId());
    duty->setDepartureStation("AAA");
    duty->setArrivalStation("AAA");
    duty->setAssignment("FLY");
    duty->setStartTimeUtcAct(start);
    duty->setEndTimeUtcAct(end);
    duty->setStartTimeLocAct(start);
    duty->setEndTimeLocAct(end);
    duty->setActualPickupMin(0);
    duty->setActualDropoffMin(0);
    duty->setRefTimeZone(dutyEndRefTzMinutes);
    duty->setDutyEndRefTimeZone(dutyEndRefTzMinutes);

    auto seg = std::make_unique<Segment>();
    seg->setSegmentId(nextSegmentId());
    seg->setDepSta("AAA");
    seg->setArrSta("AAA");
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setAssignment("FLY");
    seg->setDutyId(duty->getDutyId());
    segStore.push_back(std::move(seg));
    std::vector<Segment*> segRefs{segStore.back().get()};
    duty->setSegments(segRefs);
    return duty;
}

std::vector<Duty*> asRaw(const std::vector<std::unique_ptr<Duty>>& duties) {
    std::vector<Duty*> raw;
    raw.reserve(duties.size());
    for (const auto& duty : duties) {
        raw.push_back(duty.get());
    }
    return raw;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase("AAA");
    pairing->setQualifier("FLY");
    pairing->setDbId(nextPairingId());
    pairing->setEndArp("AAA");
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

SharedPtr<ROSTER> makeFlyRoster(const std::string& crewId,
                                Pairing* pairing,
                                time_t dutyStartUtc,
                                time_t dutyEndUtc,
                                time_t restStartUtc,
                                const std::string& source = "") {
    auto r = std::make_shared<ROSTER>();
    r->idcrew = crewId;
    r->pairing = pairing;
    r->pairId = pairing != nullptr ? pairing->getDbId() : 0;
    r->rosterId = nextRosterId();
    r->qualifier = "FLY";
    r->duty = "FLY";
    r->location = "AAA";
    r->source = source;

    r->actStrUtc = dutyStartUtc;
    r->actEndUtc = dutyEndUtc;
    r->actRestStrUtc = restStartUtc;
    r->actStrLoc = dutyStartUtc;
    r->actEndLoc = dutyEndUtc;
    r->actRestStrLoc = restStartUtc;
    r->restStrUtc = restStartUtc + 3600;
    r->needRuleCheck = true;
    return r;
}

RuleInput make7501Input(int period, int minLimits, const std::string& unit = "RH", long long idRuleParam = 0) {
    RuleInput input;
    DBRule row{};
    row.idRule = 7501001;
    row.function = 7501;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = idRuleParam == 0 ? 750100200 + period : idRuleParam;
    row.overridebility = "H";
    std::strcpy(row.description, "Minimum SDFD in rolling period for CARS");
    row.params["BASES"] = "*";
    row.params["RANKS"] = "*";
    row.params["FLEETS"] = "*";
    row.params["TEAMS"] = "*";
    row.params["PERIOD"] = std::to_string(period);
    row.params["UNIT"] = unit;
    row.params["DUTY END BUFFER"] = "00:00";
    row.params["MIN LIMITS"] = std::to_string(minLimits);
    input.dbRules.push_back(row);
    return input;
}

RuleInput make7501DualInput() {
    RuleInput input = make7501Input(168, 1, "RH", 750100301);
    DBRule row672 = input.dbRules.front();
    row672.idRuleParam = 750100302;
    row672.params["PERIOD"] = "672";
    row672.params["MIN LIMITS"] = "4";
    input.dbRules.push_back(row672);
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

void addSingleDutyRoster(const SharedPtr<CrewDataContext>& ctx,
                         const std::string& crewId,
                         const char* startUtc,
                         const char* endUtc,
                         std::vector<std::unique_ptr<Duty>>& dutyStore,
                         std::vector<std::unique_ptr<Segment>>& segStore,
                         std::vector<std::unique_ptr<Pairing>>& pairingStore,
                         SharedPtr<CREW>& crew,
                         int dutyEndRefTzMinutes = 0) {
    dutyStore.push_back(makeDuty(startUtc, endUtc, dutyEndRefTzMinutes, segStore));
    auto raw = asRaw(dutyStore);
    pairingStore.push_back(makePairing({raw.back()}));
    Pairing* pairing = pairingStore.back().get();
    ctx->pairingIdMap[pairing->getDbId()] = pairing;
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    crew->rosterList.push_back(makeFlyRoster(crewId, pairing, start, end, end));
}

void configureTorontoJuneContext(const SharedPtr<CrewDataContext>& ctx) {
    ctx->airportUtcOffsetMap["AAA"] = -240;
    ctx->airportZoneIdMap["AAA"] = "America/Toronto";
}

void configureYegJune2026Context(const SharedPtr<CrewDataContext>& ctx) {
    ctx->scenario.airline = "F8";
    ctx->scenario.bases.clear();
    ctx->scenario.bases.push_back("YEG");
    ctx->scenario.startDtUTC = utcFromString("2026-06-01 00:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-06-30 23:59:59");
    ctx->scenario.division = "P";
    ctx->airportUtcOffsetMap["YEG"] = -360;
    ctx->airportUtcOffsetMap["AAA"] = -360;
    ctx->airportZoneIdMap["YEG"] = "America/Edmonton";
    ctx->airportZoneIdMap["AAA"] = "America/Edmonton";
}

SharedPtr<CrewDataContext> buildYegJuneContext(const std::string& crewId) {
    auto ctx = buildContext(crewId, "2026-06-01 00:00:00", "2026-06-30 23:59:59");
    configureYegJune2026Context(ctx);
    auto crew = ctx->crewIdMap[crewId];
    crew->division = "P";
    crew->baseList.front()->base = "YEG";
    return ctx;
}

SharedPtr<ROSTER> makeGroundRoster(const std::string& crewId,
                                   const char* startUtc,
                                   const char* endUtc,
                                   const char* restUtc,
                                   const std::string& qualifier,
                                   const std::string& dutyGroup,
                                   const std::string& source = "") {
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
    r->source = source;
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

void markAllRosterSources(std::vector<SharedPtr<ROSTER>>& rosters, const std::string& source) {
    for (auto& roster : rosters) {
        roster->source = source;
    }
}

/** ro_input crew-247 pattern: May fly/GDO are PA; Jun PRPM SBY (#32) is the new CR assignment. */
void markCrew247PaHistoryCrNewPrpm(std::vector<SharedPtr<ROSTER>>& rosters) {
    for (size_t i = 0; i + 1 < rosters.size(); ++i) {
        rosters[i]->source = "PA";
    }
    if (!rosters.empty()) {
        rosters.back()->source = "CR";
    }
}

void addContinuousDailyDutiesWithoutSdfd(const SharedPtr<CrewDataContext>& ctx,
                                         const std::string& crewId,
                                         int startDay,
                                         int dayCount,
                                         std::vector<std::unique_ptr<Duty>>& dutyStore,
                                         std::vector<std::unique_ptr<Segment>>& segStore,
                                         std::vector<std::unique_ptr<Pairing>>& pairingStore,
                                         SharedPtr<CREW>& crew) {
    for (int day = 0; day < dayCount; ++day) {
        char startBuf[32];
        char endBuf[32];
        std::snprintf(startBuf, sizeof(startBuf), "2026-03-%02d 08:00:00", startDay + day);
        std::snprintf(endBuf, sizeof(endBuf), "2026-03-%02d 18:00:00", startDay + day);
        addSingleDutyRoster(ctx, crewId, startBuf, endBuf, dutyStore, segStore, pairingStore, crew);
    }
}

RuleInput make7501005JuneDualInput() {
    RuleInput input;
    DBRule row168{};
    row168.idRule = 7501005;
    row168.function = 7501;
    row168.tableNum = 1;
    row168.rowNum = 1;
    row168.phase = 1;
    row168.idRuleParam = 750100501;
    row168.overridebility = "R";
    std::strcpy(row168.description, "Minimum SDFD in rolling period for CARS");
    row168.params["BASES"] = "*";
    row168.params["RANKS"] = "*";
    row168.params["FLEETS"] = "*";
    row168.params["TEAMS"] = "*";
    row168.params["PERIOD"] = "168";
    row168.params["UNIT"] = "RH";
    row168.params["DUTY END BUFFER"] = "00:30";
    row168.params["MIN LIMITS"] = "1";
    input.dbRules.push_back(row168);

    DBRule row672 = row168;
    row672.rowNum = 2;
    row672.idRuleParam = 750100502;
    row672.params["PERIOD"] = "672";
    row672.params["MIN LIMITS"] = "4";
    input.dbRules.push_back(row672);
    return input;
}

void addCrew247MayHistoryAndPairing32Prpm(const SharedPtr<CrewDataContext>& ctx,
                                            const std::string& crewId,
                                            std::vector<std::unique_ptr<Duty>>& dutyStore,
                                            std::vector<std::unique_ptr<Segment>>& segStore,
                                            std::vector<std::unique_ptr<Pairing>>& pairingStore,
                                            SharedPtr<CREW>& crew) {
    // Pairing 61411 (May 25 local YEG 14:25 – May 26 00:35, MDT UTC-6).
    addSingleDutyRoster(ctx, crewId, "2026-05-25 20:25:00", "2026-05-26 06:35:00", dutyStore, segStore,
                        pairingStore, crew, -360);
    // Pairing 61556 (May 28 16:50 – May 30 06:10 local).
    addSingleDutyRoster(ctx, crewId, "2026-05-28 22:50:00", "2026-05-30 12:10:00", dutyStore, segStore,
                        pairingStore, crew, -360);
    // GDO pairing 528898 (ro_input roster line, UTC).
    crew->rosterList.push_back(makeGroundRoster(crewId, "2026-05-31 06:01:00", "2026-06-01 06:00:00",
                                                "2026-06-01 06:00:00", "DO", "DO"));
    // Pairing #32 PRPM SBY Jun 1: UTC 20:00 – Jun 2 05:59 (YEG local 14:00–23:59).
    crew->rosterList.push_back(makeGroundRoster(crewId, "2026-06-01 20:00:00", "2026-06-02 05:59:00",
                                                "2026-06-02 15:59:00", "PRPM", "SBY"));
    crew->rosterList.back()->restStrUtc = utcFromString("2026-06-30 23:59:59");
}

void addJune2026FiveOvernightDuties(const SharedPtr<CrewDataContext>& ctx,
                                     const std::string& crewId,
                                     std::vector<std::unique_ptr<Duty>>& dutyStore,
                                     std::vector<std::unique_ptr<Segment>>& segStore,
                                     std::vector<std::unique_ptr<Pairing>>& pairingStore,
                                     SharedPtr<CREW>& crew) {
    const char* dutyStartsUtc[] = {
        "2026-06-03 21:40:00",
        "2026-06-04 21:40:00",
        "2026-06-05 21:40:00",
        "2026-06-07 21:40:00",
        "2026-06-08 21:40:00",
    };
    const char* dutyEndsUtc[] = {
        "2026-06-04 07:45:00",
        "2026-06-05 07:45:00",
        "2026-06-06 07:45:00",
        "2026-06-08 07:45:00",
        "2026-06-09 07:45:00",
    };
    for (size_t i = 0; i < 5; ++i) {
        addSingleDutyRoster(ctx, crewId, dutyStartsUtc[i], dutyEndsUtc[i], dutyStore, segStore, pairingStore, crew,
                            -240);
    }
    crew->rosterList.back()->restStrUtc = utcFromString("2026-06-30 23:59:59");
}

void addCrew387LikeJun2026Duties(const SharedPtr<CrewDataContext>& ctx,
                                 const std::string& crewId,
                                 std::vector<std::unique_ptr<Duty>>& dutyStore,
                                 std::vector<std::unique_ptr<Segment>>& segStore,
                                 std::vector<std::unique_ptr<Pairing>>& pairingStore,
                                 SharedPtr<CREW>& crew) {
    addSingleDutyRoster(ctx, crewId, "2026-05-31 18:40:00", "2026-06-01 03:45:00", dutyStore, segStore, pairingStore,
                        crew, -240);
    addSingleDutyRoster(ctx, crewId, "2026-06-03 18:40:00", "2026-06-04 03:45:00", dutyStore, segStore, pairingStore,
                        crew, -240);
    addSingleDutyRoster(ctx, crewId, "2026-06-04 18:40:00", "2026-06-05 03:45:00", dutyStore, segStore, pairingStore,
                        crew, -240);
    addSingleDutyRoster(ctx, crewId, "2026-06-05 18:40:00", "2026-06-06 03:45:00", dutyStore, segStore, pairingStore,
                        crew, -240);
    addSingleDutyRoster(ctx, crewId, "2026-06-06 15:50:00", "2026-06-06 21:10:00", dutyStore, segStore, pairingStore,
                        crew, -240);
    addSingleDutyRoster(ctx, crewId, "2026-06-07 18:40:00", "2026-06-08 03:45:00", dutyStore, segStore, pairingStore,
                        crew, -240);
    addSingleDutyRoster(ctx, crewId, "2026-06-08 18:40:00", "2026-06-09 03:45:00", dutyStore, segStore, pairingStore,
                        crew, -240);
    crew->rosterList.back()->restStrUtc = utcFromString("2026-06-20 23:59:59");
}

int totalSdfdInViolation(const RULE_VIOLATION* rv) {
    const auto it = rv->operation_result.find("totalSingleDayFreeFromDuty");
    if (it == rv->operation_result.end()) {
        return -1;
    }
    return std::stoi(it->second);
}

void expectNoZeroSdfdViolationAtWindowStart(const std::vector<RULE_VIOLATION*>& violations, time_t windowStartUtc) {
    for (const RULE_VIOLATION* rv : violations) {
        if (rv->startDTUtc != windowStartUtc) {
            continue;
        }
        EXPECT_GE(totalSdfdInViolation(rv), 1) << "168h window must count flexible local-night SDFD";
    }
}

}  // namespace

class Rule7501Test : public ::testing::Test {
protected:
    void SetUp() override {
        ensureTimezoneDatabaseForTests();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:30";
        ln.LocalEnd = "09:30";
        ln.MinRestInterval = "09:00";

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

    std::unique_ptr<LimitSingleDayFreeFromDutyForCARSRule> makeRule(const SharedPtr<CrewDataContext>& ctx,
                                                                    const RuleInput& input) {
        auto rule = std::make_unique<LimitSingleDayFreeFromDutyForCARSRule>(nullptr, input);
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

// Long rest spanning two local nights yields one SDFD within 168 rolling hours.
TEST_F(Rule7501Test, AllowsOneSdfdIn168Hours) {
    const std::string crewId = "7501OK168";
    auto ctx = buildContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    addSingleDutyRoster(ctx, crewId, "2026-01-15 08:00:00", "2026-01-15 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-02-10 08:00:00", "2026-02-10 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-03-01 08:00:00", "2026-03-01 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-03-04 08:00:00", "2026-03-04 18:00:00", dutyStore, segStore,
                        pairingStore, crew);

    auto rule = makeRule(ctx, make7501Input(168, 1));
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// Daily duties with only ~14h rest never accumulate an SDFD in any 168-hour window.
TEST_F(Rule7501Test, RejectsMissingSdfdIn168Hours) {
    const std::string crewId = "7501BAD168";
    auto ctx = buildContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    for (int day = 0; day < 8; ++day) {
        char startBuf[32];
        char endBuf[32];
        std::snprintf(startBuf, sizeof(startBuf), "2026-03-%02d 08:00:00", day + 1);
        std::snprintf(endBuf, sizeof(endBuf), "2026-03-%02d 18:00:00", day + 1);
        addSingleDutyRoster(ctx, crewId, startBuf, endBuf, dutyStore, segStore, pairingStore, crew);
    }

    auto rule = makeRule(ctx, make7501Input(168, 1));
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_FALSE(_violations.empty());
}

// Four long rests across the month satisfy both 168h/1 and 672h/4 requirements.
TEST_F(Rule7501Test, AllowsFourSdfdIn672Hours) {
    const std::string crewId = "7501OK672";
    auto ctx = buildContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    addSingleDutyRoster(ctx, crewId, "2026-01-01 08:00:00", "2026-01-01 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-01-08 08:00:00", "2026-01-08 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-01-15 08:00:00", "2026-01-15 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-01-22 08:00:00", "2026-01-22 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-02-01 08:00:00", "2026-02-01 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-02-05 08:00:00", "2026-02-05 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-02-09 08:00:00", "2026-02-09 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-02-13 08:00:00", "2026-02-13 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-03-01 08:00:00", "2026-03-01 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-03-04 08:00:00", "2026-03-04 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-03-08 08:00:00", "2026-03-08 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-03-12 08:00:00", "2026-03-12 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-03-16 08:00:00", "2026-03-16 18:00:00", dutyStore, segStore,
                        pairingStore, crew);

    auto rule = makeRule(ctx, make7501DualInput());
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// Non-RH units are ignored by rule 7501.
TEST_F(Rule7501Test, IgnoresNonRhUnits) {
    const std::string crewId = "7501UNIT";
    auto ctx = buildContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    for (int day = 0; day < 5; ++day) {
        char startBuf[32];
        char endBuf[32];
        std::snprintf(startBuf, sizeof(startBuf), "2026-03-%02d 08:00:00", day + 1);
        std::snprintf(endBuf, sizeof(endBuf), "2026-03-%02d 18:00:00", day + 1);
        addSingleDutyRoster(ctx, crewId, startBuf, endBuf, dutyStore, segStore, pairingStore, crew);
    }

    auto rule = makeRule(ctx, make7501Input(168, 1, "CD"));
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// A 168h window that only clips the tail of a long rest must still be checked (strict rolling scan).
TEST_F(Rule7501Test, RejectsWindowThatMissesFullRestBlock) {
    const std::string crewId = "7501TAIL";
    auto ctx = buildContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    addSingleDutyRoster(ctx, crewId, "2026-03-01 08:00:00", "2026-03-01 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    addSingleDutyRoster(ctx, crewId, "2026-03-04 08:00:00", "2026-03-04 18:00:00", dutyStore, segStore,
                        pairingStore, crew);
    for (int day = 6; day <= 20; ++day) {
        char startBuf[32];
        char endBuf[32];
        std::snprintf(startBuf, sizeof(startBuf), "2026-03-%02d 08:00:00", day);
        std::snprintf(endBuf, sizeof(endBuf), "2026-03-%02d 18:00:00", day);
        addSingleDutyRoster(ctx, crewId, startBuf, endBuf, dutyStore, segStore, pairingStore, crew);
    }

    auto rule = makeRule(ctx, make7501Input(168, 1));
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_FALSE(_violations.empty());
}

// Consecutive local-night run length maps to SDFD count (run>=2 → run-1 SDFDs per run).
TEST_F(Rule7501Test, ConsecutiveLocalNightRunLengthToSdfdCount) {
    const auto runToSdfd = [](int runLength) { return runLength >= 2 ? runLength - 1 : 0; };
    EXPECT_EQ(runToSdfd(1), 0);
    EXPECT_EQ(runToSdfd(2), 1);
    EXPECT_EQ(runToSdfd(3), 2);
    EXPECT_EQ(runToSdfd(1) + runToSdfd(2), 1);
    EXPECT_EQ(runToSdfd(1) + runToSdfd(1), 0);
}

// A single one-day assignment must pass in both editor and optimizer scan modes.
TEST_F(Rule7501Test, AllowsSingleOneDayDutyInEditorAndOptimizer) {
    auto ctx = buildContext("7501SINGLE");
    auto crew = ctx->crewIdMap["7501SINGLE"];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    addSingleDutyRoster(ctx, "7501SINGLE", "2026-03-15 08:00:00", "2026-03-15 18:00:00", dutyStore, segStore,
                        pairingStore, crew);

    auto editorRule = makeRule(ctx, make7501DualInput());
    EXPECT_TRUE(editorRule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());

    TearDown();
    SetUp();

    auto optimizerRule = makeRule(ctx, make7501DualInput());
    optimizerRule->setApplication(ROSTER_OPTIMIZER);
    EXPECT_TRUE(optimizerRule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// Pairing Apr 13 14:25 – Apr 14 01:00 (local) assigned to an idle crew; checkedEnd may span the scenario.
TEST_F(Rule7501Test, AllowsCrossMidnightPairingAssignedToIdleCrew) {
    const std::string crewId = "7501APR1325";
    auto ctx = buildContext(crewId, "2026-04-01 00:00:00", "2026-04-30 23:59:59");
    ctx->airportUtcOffsetMap["AAA"] = 480;
    ctx->airportZoneIdMap["AAA"] = "Asia/Shanghai";
    auto crew = ctx->crewIdMap[crewId];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    // Local Apr 13 14:25 – Apr 14 01:00 at UTC+8 (cross-midnight single pairing).
    dutyStore.push_back(makeDuty("2026-04-13 06:25:00", "2026-04-13 17:00:00", 480, segStore));
    auto raw = asRaw(dutyStore);
    pairingStore.push_back(makePairing({raw.back()}));
    Pairing* pairing = pairingStore.back().get();
    ctx->pairingIdMap[pairing->getDbId()] = pairing;
    const time_t dutyStartUtc = utcFromString("2026-04-13 06:25:00");
    const time_t dutyEndUtc = utcFromString("2026-04-13 17:00:00");
    crew->rosterList.push_back(makeFlyRoster(crewId, pairing, dutyStartUtc, dutyEndUtc, dutyEndUtc));
    // Production often keeps restStrUtc at scenario/roster-period end even for a single assignment.
    crew->rosterList.back()->restStrUtc = utcFromString("2026-04-30 23:59:59");

    auto rule = makeRule(ctx, make7501DualInput());
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// Jun 2026 five overnight duties at YYZ: 168h/1 fails, 672h/4 passes.
TEST_F(Rule7501Test, June2026FiveOvernightDuties168Fails672Passes) {
    auto ctx = buildContext("7501JUN", "2026-06-01 00:00:00", "2026-06-30 23:59:59");
    configureTorontoJuneContext(ctx);
    auto crew = ctx->crewIdMap["7501JUN"];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    addJune2026FiveOvernightDuties(ctx, "7501JUN", dutyStore, segStore, pairingStore, crew);

    auto rule168 = makeRule(ctx, make7501Input(168, 1));
    EXPECT_FALSE(rule168->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_FALSE(_violations.empty());

    TearDown();
    SetUp();

    auto rule672 = makeRule(ctx, make7501Input(672, 4));
    EXPECT_TRUE(rule672->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// ROSTER_OPTIMIZER: ignore 168/672 RH violations when the window only contains pre-assigned (PA) rosters.
TEST_F(Rule7501Test, DISABLED_OptimizerIgnoresRhViolationWhenWindowIsAllPreAssigned) {
    auto ctx = buildContext("7501PA168", "2026-06-01 00:00:00", "2026-06-30 23:59:59");
    configureTorontoJuneContext(ctx);
    auto crew = ctx->crewIdMap["7501PA168"];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    addJune2026FiveOvernightDuties(ctx, "7501PA168", dutyStore, segStore, pairingStore, crew);
    markAllRosterSources(crew->rosterList, "PA");

    auto editorRule168 = makeRule(ctx, make7501Input(168, 1));
    EXPECT_FALSE(editorRule168->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_FALSE(_violations.empty());

    TearDown();
    SetUp();

    auto optimizerRule168 = makeRule(ctx, make7501Input(168, 1));
    optimizerRule168->setApplication(ROSTER_OPTIMIZER);
    EXPECT_TRUE(optimizerRule168->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());

    crew->rosterList.front()->source = "CR";
    TearDown();
    SetUp();

    auto optimizerWithCrRule168 = makeRule(ctx, make7501Input(168, 1));
    optimizerWithCrRule168->setApplication(ROSTER_OPTIMIZER);
    EXPECT_FALSE(optimizerWithCrRule168->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_FALSE(_violations.empty());

    TearDown();
    SetUp();

    auto ctx672 = buildContext("7501PA672", "2026-03-01 00:00:00", "2026-04-30 23:59:59");
    auto crew672 = ctx672->crewIdMap["7501PA672"];
    std::vector<std::unique_ptr<Duty>> dutyStore672;
    std::vector<std::unique_ptr<Segment>> segStore672;
    std::vector<std::unique_ptr<Pairing>> pairingStore672;
    addContinuousDailyDutiesWithoutSdfd(ctx672, "7501PA672", 1, 35, dutyStore672, segStore672, pairingStore672,
                                        crew672);
    markAllRosterSources(crew672->rosterList, "PA");

    auto editorRule672 = makeRule(ctx672, make7501Input(672, 4));
    EXPECT_FALSE(editorRule672->CheckRule(asConstRosterPtrs(crew672->rosterList)));
    EXPECT_FALSE(_violations.empty());

    TearDown();
    SetUp();

    auto optimizerRule672 = makeRule(ctx672, make7501Input(672, 4));
    optimizerRule672->setApplication(ROSTER_OPTIMIZER);
    EXPECT_TRUE(optimizerRule672->CheckRule(asConstRosterPtrs(crew672->rosterList)));
    EXPECT_TRUE(_violations.empty());

    crew672->rosterList.front()->source = "CR";
    TearDown();
    SetUp();

    auto optimizerWithCrRule672 = makeRule(ctx672, make7501Input(672, 4));
    optimizerWithCrRule672->setApplication(ROSTER_OPTIMIZER);
    EXPECT_FALSE(optimizerWithCrRule672->CheckRule(asConstRosterPtrs(crew672->rosterList)));
    EXPECT_FALSE(_violations.empty());
}

// Crew-387-like Jun 2026: flexible local night (22:31+), sweep regression, Jun 6 day duty breaks SDFD.
TEST_F(Rule7501Test, Crew387LikeJun2026FlexibleLocalNightAndSweepRegression) {
    auto torontoCtx = [](const std::string& crewId) {
        auto ctx = buildContext(crewId, "2026-06-01 00:00:00", "2026-06-30 23:59:59");
        configureTorontoJuneContext(ctx);
        return ctx;
    };

    // Minimal roster: May 31 + Jun 3 — one SDFD, full pass with flexible local night placement.
    {
        auto ctx = torontoCtx("7501JUN387MIN");
        auto crew = ctx->crewIdMap["7501JUN387MIN"];
        std::vector<std::unique_ptr<Duty>> dutyStore;
        std::vector<std::unique_ptr<Segment>> segStore;
        std::vector<std::unique_ptr<Pairing>> pairingStore;
        addSingleDutyRoster(ctx, "7501JUN387MIN", "2026-05-31 18:40:00", "2026-06-01 03:45:00", dutyStore, segStore,
                            pairingStore, crew, -240);
        addSingleDutyRoster(ctx, "7501JUN387MIN", "2026-06-03 18:40:00", "2026-06-04 03:45:00", dutyStore, segStore,
                            pairingStore, crew, -240);
        crew->rosterList.back()->restStrUtc = utcFromString("2026-06-20 23:59:59");

        auto rule = makeRule(ctx, make7501Input(168, 1));
        EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
        EXPECT_TRUE(_violations.empty());
    }

    TearDown();
    SetUp();

    // Full crew-387-like roster: Jun 1 22:30/22:31 windows must count SDFD; Jun 2 01:00 window has 0.
    {
        auto ctx = torontoCtx("7501JUN387");
        auto crew = ctx->crewIdMap["7501JUN387"];
        std::vector<std::unique_ptr<Duty>> dutyStore;
        std::vector<std::unique_ptr<Segment>> segStore;
        std::vector<std::unique_ptr<Pairing>> pairingStore;
        addCrew387LikeJun2026Duties(ctx, "7501JUN387", dutyStore, segStore, pairingStore, crew);

        const time_t jun1Window2230Utc = utcFromString("2026-06-02 02:30:00");
        const time_t jun1Window2231Utc = utcFromString("2026-06-02 02:31:00");
        const time_t jun2WindowStartUtc = utcFromString("2026-06-02 05:00:00");

        auto rule = makeRule(ctx, make7501Input(168, 1));
        EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
        ASSERT_FALSE(_violations.empty());

        expectNoZeroSdfdViolationAtWindowStart(_violations, jun1Window2230Utc);
        expectNoZeroSdfdViolationAtWindowStart(_violations, jun1Window2231Utc);

        bool foundZeroSdfdWindowNearJun2 = false;
        for (const RULE_VIOLATION* rv : _violations) {
            if (totalSdfdInViolation(rv) != 0) {
                continue;
            }
            if (rv->startDTUtc >= jun2WindowStartUtc - 3 * 3600 && rv->startDTUtc <= jun2WindowStartUtc + 3600) {
                foundZeroSdfdWindowNearJun2 = true;
            }
        }
        EXPECT_TRUE(foundZeroSdfdWindowNearJun2)
            << "168h sweep must flag 0-SDFD window near Jun 2 01:00 YYZ";
    }
}

// Crew 247 (ro_input): May FLY history + GDO + pairing #32 PRPM SBY on Jun 1 (YEG local 14:00).
TEST_F(Rule7501Test, Crew247Pairing32PrpmEditorReports168RhViolation) {
    const std::string crewId = "247";
    auto ctx = buildYegJuneContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    addCrew247MayHistoryAndPairing32Prpm(ctx, crewId, dutyStore, segStore, pairingStore, crew);

    auto rule = makeRule(ctx, make7501005JuneDualInput());
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)))
        << "7501005 editor: crew 247 with pairing #32 PRPM violates 168h/1 SDFD";
    EXPECT_FALSE(_violations.empty());
}

TEST_F(Rule7501Test, Crew247Pairing32PrpmOptimizerIgnoresPaOnly168RhViolation) {
    const std::string crewId = "247PA";
    auto ctx = buildYegJuneContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    addCrew247MayHistoryAndPairing32Prpm(ctx, crewId, dutyStore, segStore, pairingStore, crew);
    markAllRosterSources(crew->rosterList, "PA");

    auto rule = makeRule(ctx, make7501005JuneDualInput());
    rule->setApplication(ROSTER_OPTIMIZER);
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)))
        << "7501005 optimizer: ignore 168h SDFD when violation window is all pre-assigned";
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7501Test, Crew247Pairing32PrpmOptimizerReportsWhenCrInViolationWindow) {
    const std::string crewId = "247CR";
    auto ctx = buildYegJuneContext(crewId);
    auto crew = ctx->crewIdMap[crewId];
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    addCrew247MayHistoryAndPairing32Prpm(ctx, crewId, dutyStore, segStore, pairingStore, crew);
    markCrew247PaHistoryCrNewPrpm(crew->rosterList);

    auto rule = makeRule(ctx, make7501005JuneDualInput());
    rule->setApplication(ROSTER_OPTIMIZER);
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)))
        << "7501005 optimizer: new CR PRPM overlaps the 168h SDFD=0 window and must fail";
    EXPECT_FALSE(_violations.empty());
}
