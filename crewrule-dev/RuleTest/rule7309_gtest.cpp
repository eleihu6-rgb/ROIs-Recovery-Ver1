#include <gtest/gtest.h>

#include <cstring>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "GlobalDefinition/RuleEngineDef.h"
#include "RuleEngine/legacyDefineHelper/RuleLegality.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7309/LimitMinRestBetweenRostersForPRRule.h"
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
    static long long id = 730900100;
    return ++id;
}

long long nextSegmentId() {
    static long long id = 730900200;
    return ++id;
}

long long nextPairingId() {
    static long long id = 730900300;
    return ++id;
}

long long nextRosterId() {
    static long long id = 730900400;
    return ++id;
}

struct DutyPlan {
    std::string reportUtc;
    std::string releaseUtc;
    std::string depStation{"AAA"};
    std::string arrStation{"AAA"};
};

SharedPtr<CrewDataContext> buildContext(const std::string& crewId) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenarioId = 1;
    ctx->scenario.airline = "QQ";
    ctx->scenario.division = "P";
    ctx->scenario.bases.push_back("AAA");
    ctx->scenario.startDtUTC = utcFromString("2026-01-01 00:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-12-31 23:59:59");
    ctx->airportUtcOffsetMap["AAA"] = 0;
    ctx->airportZoneIdMap["AAA"] = "UTC";

    auto assignment = std::make_shared<ASSIGNMENT>();
    assignment->AIRLINE = ctx->scenario.airline;
    assignment->ASSIGNMENT_ID = 7309;
    assignment->assignment = "FLY";
    assignment->TYPE = "FLY";
    assignment->FDP_PCT = 1.0;
    assignment->DP_PCT = 1.0;
    assignment->BT_PCT = 1.0;
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

void attachDutyNodes(Duty& duty, time_t startUtc, time_t endUtc, int offsetMinutes) {
    auto addNode = [&](const std::string& node, time_t nodeStart, time_t nodeEnd, int seq) {
        auto pdn = std::make_shared<PairingDutyNode>();
        pdn->setType("DUTY");
        pdn->setNode(node);
        pdn->setSequence(seq);
        pdn->setDutyId(duty.getDutyId());
        const time_t startLoc = nodeStart + offsetMinutes * 60;
        const time_t endLoc = nodeEnd + offsetMinutes * 60;
        pdn->setStartUtc(nodeStart);
        pdn->setEndUtc(nodeEnd);
        pdn->setStartLoc(startLoc);
        pdn->setEndLoc(endLoc);
        pdn->setStartTimeUtcAct(nodeStart);
        pdn->setEndTimeUtcAct(nodeEnd);
        pdn->setStartTimeUtcSch(nodeStart);
        pdn->setEndTimeUtcSch(nodeEnd);
        pdn->setStartTimeLocAct(startLoc);
        pdn->setEndTimeLocAct(endLoc);
        pdn->setStartTimeLocSch(startLoc);
        pdn->setEndTimeLocSch(endLoc);
        duty.pairingDutyNodes.push_back(pdn);
    };

    addNode("PICKUP", startUtc, startUtc, 1);
    addNode("BRIEF", startUtc, startUtc, 2);
    addNode("DEBRIEF", endUtc, endUtc, 3);
    addNode("DROPOFF", endUtc, endUtc, 4);
}

std::unique_ptr<Duty> makeDuty(const DutyPlan& plan,
                               const SharedPtr<CrewDataContext>& ctx,
                               std::vector<std::unique_ptr<Segment>>& segStore,
                               int blockMinutes = 0) {
    auto duty = std::make_unique<Duty>();
    const time_t startUtc = utcFromString(plan.reportUtc.c_str());
    const time_t endUtc = utcFromString(plan.releaseUtc.c_str());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at(plan.depStation);
    const time_t startLoc = startUtc + offsetMinutes * 60;
    const time_t endLoc = endUtc + offsetMinutes * 60;

    duty->setDutyId(nextDutyId());
    duty->setStartTimeUtcAct(startUtc);
    duty->setStartTimeUtcSch(startUtc);
    duty->setEndTimeUtcAct(endUtc);
    duty->setEndTimeUtcSch(endUtc);
    duty->setStartTimeLocAct(startLoc);
    duty->setStartTimeLocSch(startLoc);
    duty->setEndTimeLocAct(endLoc);
    duty->setEndTimeLocSch(endLoc);
    duty->setDepartureStation(plan.depStation);
    duty->setArrivalStation(plan.arrStation);
    duty->setAssignment("FLY");
    duty->setActualPickupMin(0);
    duty->setActualDropoffMin(0);
    duty->setActualBriefMin(0);
    duty->setActualDebriefMin(0);
    duty->setMinPickup(0);
    duty->setMinDropoff(0);
    duty->setMinBrief(0);
    duty->setMinDebrief(0);

    attachDutyNodes(*duty, startUtc, endUtc, offsetMinutes);

    auto seg = std::make_unique<Segment>();
    seg->setSegmentId(nextSegmentId());
    const time_t segStartUtc = startUtc;
    const time_t segEndUtc = segStartUtc + blockMinutes * 60;
    const time_t segStartLoc = segStartUtc + offsetMinutes * 60;
    const time_t segEndLoc = segEndUtc + offsetMinutes * 60;
    seg->setDepSta(plan.depStation);
    seg->setArrSta(plan.arrStation);
    seg->setStartTimeUtcAct(segStartUtc);
    seg->setEndTimeUtcAct(segEndUtc);
    seg->setStartTimeUtcSch(segStartUtc);
    seg->setEndTimeUtcSch(segEndUtc);
    seg->setStartTimeLocAct(segStartLoc);
    seg->setEndTimeLocAct(segEndLoc);
    seg->setStartTimeLocSch(segStartLoc);
    seg->setEndTimeLocSch(segEndLoc);
    seg->setAssignment("FLY");
    seg->setDutyId(duty->getDutyId());
    seg->setIsOperating(true);
    seg->setBlkSeconds(blockMinutes * 60);
    seg->setBlkMinHistory(blockMinutes);

    segStore.push_back(std::move(seg));
    std::vector<Segment*> segRefs{segStore.back().get()};
    duty->setSegments(segRefs);

    return duty;
}

std::vector<Duty*> asRaw(const std::vector<std::unique_ptr<Duty>>& storage) {
    std::vector<Duty*> raw;
    raw.reserve(storage.size());
    for (const auto& duty : storage) {
        raw.push_back(duty.get());
    }
    return raw;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties,
                                     const std::string& base,
                                     const std::string& attribute) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setQualifier("FLY");
    pairing->setDbId(nextPairingId());
    pairing->setAttribute(attribute);
    if (!duties.empty()) {
        const Duty* first = duties.front();
        const Duty* last = duties.back();
        pairing->setStartTimeUtcAct(first->getStartTimeUtcAct());
        pairing->setStartTimeUtcSch(first->getStartTimeUtcSch());
        pairing->setStartTimeLocAct(first->getStartTimeLocAct());
        pairing->setStartTimeLocSch(first->getStartTimeLocSch());
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct());
        pairing->setEndTimeUtcSch(last->getEndTimeUtcSch());
        pairing->setEndTimeLocAct(last->getEndTimeLocAct());
        pairing->setEndTimeLocSch(last->getEndTimeLocSch());
    }
    return pairing;
}

SharedPtr<ROSTER> makeFlyRoster(const std::string& crewId,
                                Pairing* pairing,
                                time_t dutyStartUtc,
                                time_t dutyEndUtc,
                                time_t restStartUtc,
                                time_t qualWindowEndUtc) {
    auto r = std::make_shared<ROSTER>();
    r->idcrew = crewId;
    r->pairing = pairing;
    if (pairing != nullptr) {
        r->pairId = pairing->getDbId();
    }
    r->rosterId = nextRosterId();
    r->qualifier = "FLY";
    r->duty = "FLY";
    r->callinSBY_FDPMins = 0;

    r->setStartTimeUtcAct(dutyStartUtc);
    r->setEndTimeUtcAct(dutyEndUtc);
    r->setStartTimeLocAct(dutyStartUtc);
    r->setEndTimeLocAct(dutyEndUtc);
    r->setRestStartUtcAct(restStartUtc);
    r->setRestStartLocAct(restStartUtc);

    r->setStartTimeUtcSch(dutyStartUtc);
    r->setEndTimeUtcSch(dutyEndUtc);
    r->setStartTimeLocSch(dutyStartUtc);
    r->setEndTimeLocSch(dutyEndUtc);
    r->setRestStartUtcSch(restStartUtc);
    r->setRestStartLocSch(restStartUtc);

    r->restStrUtc = qualWindowEndUtc;
    return r;
}

RuleInput make7309Input(const std::string& assignments,
                        const std::string& attributes,
                        const std::string& consecType,
                        const std::string& consecTimes,
                        const std::string& includePairRest,
                        const std::string& countFromEndDay,
                        const std::string& direction,
                        const std::string& restType,
                        const std::string& minRest,
                        long long idRuleParam = 730900201) {
    RuleInput input;
    DBRule row{};
    row.idRule = 7309001;
    row.function = 7309;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = idRuleParam;
    row.overridebility = "H";
    std::strcpy(row.description, "Minimum Rest After Ultra Long Haul Flight");
    row.reference = "PR";
    row.category = "Rest";

    row.params["ASSIGNMENTS"] = assignments;
    row.params["ATTRIBUTES"] = attributes;
    row.params["CONSECUTIVE TYPE"] = consecType;
    row.params["CONSECUTIVE TIMES"] = consecTimes;
    row.params["INCLUDE PAIRING REST(Y/N)"] = includePairRest;
    row.params["COUNTING REST FROM PAIRING END DAY(Y/N)"] = countFromEndDay;
    row.params["DIRECTION"] = direction;
    row.params["REST TYPE"] = restType;
    row.params["MIN REST"] = minRest;

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

class Rule7309Test : public ::testing::Test {
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

    std::unique_ptr<LimitMinRestBetweenRostersForPRRule> makeRule(const SharedPtr<CrewDataContext>& ctx,
                                                                   const RuleInput& input) {
        auto rule = std::make_unique<LimitMinRestBetweenRostersForPRRule>(nullptr, input);
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

// Consecutive type T, attributes EM, After, Min Rest 36:00 — three qualifying rosters then spacer before breaker.
TEST_F(Rule7309Test, HappyPath_TypeT_AttributeEM_After_MinRestHHmm) {
    const std::string crewId = "7309HP1";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    auto pushPairing = [&](const char* report, const char* release, const std::string& attr) {
        dutyStore.push_back(makeDuty(DutyPlan{report, release}, ctx, segments));
        auto raw = asRaw(dutyStore);
        pairingStore.push_back(makePairing({raw.back()}, "AAA", attr));
        ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    };

    pushPairing("2026-02-02 08:00:00", "2026-02-02 16:00:00", "EM");
    pushPairing("2026-02-03 08:00:00", "2026-02-03 16:00:00", "EM");
    pushPairing("2026-02-04 08:00:00", "2026-02-04 16:00:00", "EM");
    pushPairing("2026-02-06 08:00:00", "2026-02-06 16:00:00", "");

    const time_t winEnd = utcFromString("2030-01-01 00:00:00");
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (size_t k = 0; k < pairingStore.size(); ++k) {
        Pairing* p = pairingStore[k].get();
        const time_t ds = p->getStartTimeUtcAct();
        const time_t de = p->getEndTimeUtcAct();
        crew->rosterList.push_back(makeFlyRoster(crewId, p, ds, de, de, winEnd));
    }

    RuleInput input =
        make7309Input("FLY", "EM", "T", "3-6", "Y", "Y", "AFTER", "R", "36:00", 730900301);
    auto rule = makeRule(ctx, input);
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7309Test, HappyPath_TypeT_AttributeND_After) {
    const std::string crewId = "7309HP2";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    auto pushPairing = [&](const char* report, const char* release, const std::string& attr) {
        dutyStore.push_back(makeDuty(DutyPlan{report, release}, ctx, segments));
        pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA", attr));
        ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    };

    pushPairing("2026-03-02 09:00:00", "2026-03-02 17:00:00", "ND");
    pushPairing("2026-03-03 09:00:00", "2026-03-03 17:00:00", "ND");
    pushPairing("2026-03-04 09:00:00", "2026-03-04 17:00:00", "ND");
    pushPairing("2026-03-06 10:00:00", "2026-03-06 14:00:00", "EM");

    const time_t winEnd = utcFromString("2030-01-01 00:00:00");
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& pr : pairingStore) {
        Pairing* p = pr.get();
        const time_t ds = p->getStartTimeUtcAct();
        const time_t de = p->getEndTimeUtcAct();
        crew->rosterList.push_back(makeFlyRoster(crewId, p, ds, de, de, winEnd));
    }

    RuleInput input = make7309Input("FLY", "ND", "T", "3-6", "Y", "Y", "AFTER", "R", "40:00", 730900302);
    auto rule = makeRule(ctx, input);
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7309Test, HappyPath_TypeT_AttributeEmPipeNd_OnPairing) {
    const std::string crewId = "7309HP3";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    auto pushPairing = [&](const char* report, const char* release, const std::string& attr) {
        dutyStore.push_back(makeDuty(DutyPlan{report, release}, ctx, segments));
        pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA", attr));
        ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    };

    pushPairing("2026-04-02 07:00:00", "2026-04-02 15:00:00", "EM|ND");
    pushPairing("2026-04-03 07:00:00", "2026-04-03 15:00:00", "EM|ND");
    pushPairing("2026-04-04 07:00:00", "2026-04-04 15:00:00", "EM|ND");
    pushPairing("2026-04-06 07:00:00", "2026-04-06 15:00:00", "XX");

    const time_t winEnd = utcFromString("2030-01-01 00:00:00");
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& pr : pairingStore) {
        Pairing* p = pr.get();
        const time_t ds = p->getStartTimeUtcAct();
        const time_t de = p->getEndTimeUtcAct();
        crew->rosterList.push_back(makeFlyRoster(crewId, p, ds, de, de, winEnd));
    }

    RuleInput input = make7309Input("FLY", "EM|ND", "T", "3-6", "Y", "Y", "*", "R", "36:00", 730900303);
    auto rule = makeRule(ctx, input);
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// Include pairing rest N & counting from end day N: rest measure starts next local midnight after duty end (UTC+0 base).
TEST_F(Rule7309Test, HappyPath_IncludePairingRestNo_CountFromEndNo_After) {
    const std::string crewId = "7309HP4";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    auto pushPairing = [&](const char* report, const char* release, const std::string& attr) {
        dutyStore.push_back(makeDuty(DutyPlan{report, release}, ctx, segments));
        pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA", attr));
        ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    };

    pushPairing("2026-05-02 08:00:00", "2026-05-02 18:00:00", "EM");
    pushPairing("2026-05-03 08:00:00", "2026-05-03 18:00:00", "EM");
    pushPairing("2026-05-04 08:00:00", "2026-05-04 18:00:00", "EM");
    pushPairing("2026-05-07 08:00:00", "2026-05-07 12:00:00", "");

    const time_t winEnd = utcFromString("2030-01-01 00:00:00");
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& pr : pairingStore) {
        Pairing* p = pr.get();
        const time_t ds = p->getStartTimeUtcAct();
        const time_t de = p->getEndTimeUtcAct();
        crew->rosterList.push_back(makeFlyRoster(crewId, p, ds, de, de, winEnd));
    }

    RuleInput input = make7309Input("FLY", "EM", "T", "3-6", "N", "N", "AFTER", "R", "36:00", 730900304);
    auto rule = makeRule(ctx, input);
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

// Rest type D: min 1.5 day off between qualifying block and next work; gap spans two full calendar days.
TEST_F(Rule7309Test, HappyPath_RestTypeD_MinOnePointFiveDays_After) {
    const std::string crewId = "7309HP5";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    auto pushPairing = [&](const char* report, const char* release, const std::string& attr) {
        dutyStore.push_back(makeDuty(DutyPlan{report, release}, ctx, segments));
        pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA", attr));
        ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    };

    pushPairing("2026-06-02 08:00:00", "2026-06-02 16:00:00", "EM");
    pushPairing("2026-06-03 08:00:00", "2026-06-03 16:00:00", "EM");
    pushPairing("2026-06-04 08:00:00", "2026-06-04 16:00:00", "EM");
    pushPairing("2026-06-07 08:00:00", "2026-06-07 12:00:00", "");

    const time_t winEnd = utcFromString("2030-01-01 00:00:00");
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& pr : pairingStore) {
        Pairing* p = pr.get();
        const time_t ds = p->getStartTimeUtcAct();
        const time_t de = p->getEndTimeUtcAct();
        crew->rosterList.push_back(makeFlyRoster(crewId, p, ds, de, de, winEnd));
    }

    RuleInput input = make7309Input("FLY", "EM", "T", "3-6", "Y", "Y", "AFTER", "D", "1.5", 730900305);
    auto rule = makeRule(ctx, input);
    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7309Test, Reject_TypeT_After_ShortRest) {
    const std::string crewId = "7309RJ1";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    auto pushPairing = [&](const char* report, const char* release, const std::string& attr) {
        dutyStore.push_back(makeDuty(DutyPlan{report, release}, ctx, segments));
        pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA", attr));
        ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    };

    pushPairing("2026-07-02 08:00:00", "2026-07-02 16:00:00", "EM");
    pushPairing("2026-07-03 08:00:00", "2026-07-03 16:00:00", "EM");
    pushPairing("2026-07-04 08:00:00", "2026-07-04 16:00:00", "EM");
    pushPairing("2026-07-05 02:00:00", "2026-07-05 10:00:00", "");

    const time_t winEnd = utcFromString("2030-01-01 00:00:00");
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& pr : pairingStore) {
        Pairing* p = pr.get();
        const time_t ds = p->getStartTimeUtcAct();
        const time_t de = p->getEndTimeUtcAct();
        crew->rosterList.push_back(makeFlyRoster(crewId, p, ds, de, de, winEnd));
    }

    RuleInput input = make7309Input("FLY", "EM", "T", "3-6", "Y", "Y", "AFTER", "R", "48:00", 730900401);
    auto rule = makeRule(ctx, input);
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_FALSE(_violations.empty());
}

// BEFORE: preceding non-matching work roster supplies prevWork; short gap before first EM roster violates min rest.
TEST_F(Rule7309Test, Reject_TypeT_Before_ShortRest_WithPrevWork) {
    const std::string crewId = "7309RJ2";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    auto pushPairing = [&](const char* report, const char* release, const std::string& attr) {
        dutyStore.push_back(makeDuty(DutyPlan{report, release}, ctx, segments));
        pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA", attr));
        ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    };

    pushPairing("2026-08-01 08:00:00", "2026-08-01 12:00:00", "XX");
    pushPairing("2026-08-02 09:00:00", "2026-08-02 16:00:00", "EM");
    pushPairing("2026-08-03 09:00:00", "2026-08-03 16:00:00", "EM");
    pushPairing("2026-08-04 09:00:00", "2026-08-04 16:00:00", "EM");
    pushPairing("2026-08-07 09:00:00", "2026-08-07 16:00:00", "");

    const time_t winEnd = utcFromString("2030-01-01 00:00:00");
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& pr : pairingStore) {
        Pairing* p = pr.get();
        const time_t ds = p->getStartTimeUtcAct();
        const time_t de = p->getEndTimeUtcAct();
        crew->rosterList.push_back(makeFlyRoster(crewId, p, ds, de, de, winEnd));
    }

    RuleInput input = make7309Input("FLY", "EM", "T", "3-6", "Y", "Y", "BEFORE", "R", "48:00", 730900402);
    auto rule = makeRule(ctx, input);
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_FALSE(_violations.empty());
}

TEST_F(Rule7309Test, Reject_RestTypeD_MinTwoDays_BelowMinimum) {
    const std::string crewId = "7309RJ3";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;

    auto pushPairing = [&](const char* report, const char* release, const std::string& attr) {
        dutyStore.push_back(makeDuty(DutyPlan{report, release}, ctx, segments));
        pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA", attr));
        ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    };

    pushPairing("2026-09-02 08:00:00", "2026-09-02 16:00:00", "EM");
    pushPairing("2026-09-03 08:00:00", "2026-09-03 16:00:00", "EM");
    pushPairing("2026-09-04 08:00:00", "2026-09-04 16:00:00", "EM");
    pushPairing("2026-09-06 08:00:00", "2026-09-06 12:00:00", "");

    const time_t winEnd = utcFromString("2030-01-01 00:00:00");
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& pr : pairingStore) {
        Pairing* p = pr.get();
        const time_t ds = p->getStartTimeUtcAct();
        const time_t de = p->getEndTimeUtcAct();
        crew->rosterList.push_back(makeFlyRoster(crewId, p, ds, de, de, winEnd));
    }

    RuleInput input = make7309Input("FLY", "EM", "T", "3-6", "Y", "Y", "AFTER", "D", "2", 730900403);
    auto rule = makeRule(ctx, input);
    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(crew->rosterList)));
    EXPECT_FALSE(_violations.empty());
}
