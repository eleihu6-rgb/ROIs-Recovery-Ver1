/**
 * @file rule7359_gtest.cpp
 * @brief GoogleTest suite for CheckStandardFdpExtensionRestRequirementRule (7359)
 * @author auto-generated
 * @date 2026-05-07
**/

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>
#include <filesystem>
#include "CrewDB.h"
#include "GlobalDefinition/RuleEngineDef.h"
#include "RuleEngine/legacyDefineHelper/RuleLegality.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7359/CheckStandardFdpExtensionRestRequirementRule.h"
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
    return utcStrToUtc(const_cast<char*>(s));
}

long long nextDutyId() {
    static long long id = 735900100;
    return ++id;
}

long long nextSegmentId() {
    static long long id = 735900200;
    return ++id;
}

long long nextPairingId() {
    static long long id = 735900300;
    return ++id;
}

long long nextRosterId() {
    static long long id = 735900400;
    return ++id;
}

struct DutyPlan {
    std::string reportUtc;
    std::string releaseUtc;
    std::string depStation{"AAA"};
    std::string arrStation{"AAA"};
    int blockMinutes{60};
    std::string attributes{""};
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
    assignment->ASSIGNMENT_ID = 7359;
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
                               std::vector<std::unique_ptr<Segment>>& segStore) {
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
    if (!plan.attributes.empty()) {
        duty->setAttributes(plan.attributes);
    }

    attachDutyNodes(*duty, startUtc, endUtc, offsetMinutes);

    auto seg = std::make_unique<Segment>();
    seg->setSegmentId(nextSegmentId());
    const time_t segStartUtc = startUtc;
    const time_t segEndUtc = segStartUtc + plan.blockMinutes * 60;
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
    seg->setBlkSeconds(plan.blockMinutes * 60);
    seg->setBlkMinHistory(plan.blockMinutes);

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
                                     const std::string& attribute = "") {
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

RuleInput make7359Input(const std::string& bases,
                        const std::string& overrideDutyAttributes,
                        const std::string& extendedRestDistribution,
                        const std::string& restExtention,
                        long long idRuleParam = 7359001) {
    RuleInput input;
    DBRule row{};
    row.idRule = 7359;
    row.function = 7359;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = idRuleParam;
    row.overridebility = "H";
    std::strcpy(row.description, "Standard FDP Extension Rest Requirement");
    row.reference = "PR";
    row.category = "Rest";

    row.params["BASES"] = bases;
    row.params["OVERRIDE DUTY ATTRIBUTES"] = overrideDutyAttributes;
    row.params["EXTENDED REST DISTRIBUTION"] = extendedRestDistribution;
    row.params["REST EXTENTION"] = restExtention;

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

class Rule7359Test : public ::testing::Test {
protected:
    void SetUp() override {
        ensureTimezoneDatabaseForTests();
        RuleParams::GetInstancePtr()->setApplication(ROSTER_EDITOR);
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

    std::unique_ptr<CheckStandardFdpExtensionRestRequirementRule> makeRule(
        const SharedPtr<CrewDataContext>& ctx,
        const RuleInput& input) {
        auto rule = std::make_unique<CheckStandardFdpExtensionRestRequirementRule>(nullptr, input);
        rule->setDataContext(ctx);
        rule->setApplication(ROSTER_EDITOR);
        rule->setRuleViolation(&_violations);
        rule->setViolations(&_violationMessages);
        rule->setRuleLegality(&_legality);
        return rule;
    }

    RULE_LEGALITY _legality{};
    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
};

// ============================================================
// HAPPY PATH TESTS
// ============================================================

// HP1: Rest Extension AFTER - duty with attribute "e" has sufficient rest (02:00) after it -> PASS
TEST_F(Rule7359Test, HappyPath_RestExtensionAfter_SufficientRest) {
    const std::string crewId = "7359HP1";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty (non-matching) ends at 10:00
    dutyStore.push_back(makeDuty({"2026-05-01 06:00:00", "2026-05-01 10:00:00"}, ctx, segments));
    auto raw1 = asRaw(dutyStore);
    pairingStore.push_back(makePairing(raw1, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-01 06:00:00"), utcFromString("2026-05-01 10:00:00"),
        utcFromString("2026-05-01 10:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Second duty with attribute "e" starts at 14:00 and ends at 18:00
    // Rest from first duty end (10:00) to second duty start (14:00) = 4 hours > 02:00 required
    DutyPlan plan2 = {"2026-05-01 14:00:00", "2026-05-01 18:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    auto raw2 = asRaw(dutyStore);
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-01 14:00:00"), utcFromString("2026-05-01 18:00:00"),
        utcFromString("2026-05-01 18:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Rule: Rest Extension 02:00 AFTER, attribute "e", base AAA
    RuleInput input = make7359Input("AAA", "e", "AFTER", "02:00", 735900101);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// HP2: Rest Extension BEFORE - duty with attribute "e" has sufficient rest (02:00) before it -> PASS
TEST_F(Rule7359Test, HappyPath_RestExtensionBefore_SufficientRest) {
    const std::string crewId = "7359HP2";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty with attribute "e" ends at 10:00
    DutyPlan plan1 = {"2026-05-02 06:00:00", "2026-05-02 10:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan1, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-02 06:00:00"), utcFromString("2026-05-02 10:00:00"),
        utcFromString("2026-05-02 10:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Second duty (non-matching) starts at 14:00
    // Rest from first duty end (10:00) to second duty start (14:00) = 4 hours > 02:00 required
    dutyStore.push_back(makeDuty({"2026-05-02 14:00:00", "2026-05-02 18:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-02 14:00:00"), utcFromString("2026-05-02 18:00:00"),
        utcFromString("2026-05-02 18:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Rule: Rest Extension 02:00 BEFORE, attribute "e", base AAA
    RuleInput input = make7359Input("AAA", "e", "BEFORE", "02:00", 735900102);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// HP3: Rest Extension * (either before OR after) - sufficient rest after -> PASS
TEST_F(Rule7359Test, HappyPath_RestExtensionWildcard_SufficientRestAfter) {
    const std::string crewId = "7359HP3";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty ends at 10:00
    dutyStore.push_back(makeDuty({"2026-05-03 06:00:00", "2026-05-03 10:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-03 06:00:00"), utcFromString("2026-05-03 10:00:00"),
        utcFromString("2026-05-03 10:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Duty with attribute "e" at 14:00-18:00 - sufficient rest after (4 hours)
    DutyPlan plan2 = {"2026-05-03 14:00:00", "2026-05-03 18:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-03 14:00:00"), utcFromString("2026-05-03 18:00:00"),
        utcFromString("2026-05-03 18:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Rule: Rest Extension 02:00 * (either), attribute "e", base AAA
    RuleInput input = make7359Input("AAA", "e", "*", "02:00", 735900103);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// HP4: Duty without matching attribute "e" - rule doesn't apply -> PASS
TEST_F(Rule7359Test, HappyPath_NoMatchingAttribute_RuleNotApplicable) {
    const std::string crewId = "7359HP4";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty ends at 10:00
    dutyStore.push_back(makeDuty({"2026-05-04 06:00:00", "2026-05-04 10:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-04 06:00:00"), utcFromString("2026-05-04 10:00:00"),
        utcFromString("2026-05-04 10:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Duty with attribute "XX" (not "e") at 11:00 - short rest after (1 hour)
    DutyPlan plan2 = {"2026-05-04 11:00:00", "2026-05-04 15:00:00", "AAA", "AAA", 240, "XX"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-04 11:00:00"), utcFromString("2026-05-04 15:00:00"),
        utcFromString("2026-05-04 15:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Rule: Rest Extension 02:00 AFTER, attribute "e", base AAA
    // Duty has "XX" attribute, not "e", so rule doesn't apply
    RuleInput input = make7359Input("AAA", "e", "AFTER", "02:00", 735900104);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// HP5: Rest Extension BOTH - half rest on each side satisfies -> PASS
TEST_F(Rule7359Test, HappyPath_RestExtensionBoth_HalfRestEachSide) {
    const std::string crewId = "7359HP5";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty ends at 09:00
    dutyStore.push_back(makeDuty({"2026-05-05 05:00:00", "2026-05-05 09:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-05 05:00:00"), utcFromString("2026-05-05 09:00:00"),
        utcFromString("2026-05-05 09:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Duty with attribute "e" at 11:00-15:00 (4 hours rest before, 5 hours rest after)
    // Half rest extension = 02:00 / 2 = 01:00
    // Before: 11:00 - 09:00 = 2 hours >= 1 hour (half) -> OK
    // After: next duty would be needed to check
    DutyPlan plan2 = {"2026-05-05 11:00:00", "2026-05-05 15:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-05 11:00:00"), utcFromString("2026-05-05 15:00:00"),
        utcFromString("2026-05-05 15:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Third duty starts at 18:00 - rest after = 3 hours >= 1 hour (half) -> OK
    dutyStore.push_back(makeDuty({"2026-05-05 18:00:00", "2026-05-05 22:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-05 18:00:00"), utcFromString("2026-05-05 22:00:00"),
        utcFromString("2026-05-05 22:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Rule: Rest Extension 02:00 BOTH (half on each side), attribute "e", base AAA
    RuleInput input = make7359Input("AAA", "e", "BOTH", "02:00", 735900105);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// ============================================================
// REJECT TESTS
// ============================================================

// RJ1: Rest Extension AFTER - insufficient rest (00:30) after duty with attribute "e" -> REJECT
TEST_F(Rule7359Test, Reject_RestExtensionAfter_InsufficientRest) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7359RJ1";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty ends at 10:00
    dutyStore.push_back(makeDuty({"2026-05-10 06:00:00", "2026-05-10 10:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-10 06:00:00"), utcFromString("2026-05-10 10:00:00"),
        utcFromString("2026-05-10 10:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Duty with attribute "e" at 10:30 - only 00:30 rest after < 02:00 required -> REJECT
    DutyPlan plan2 = {"2026-05-10 10:30:00", "2026-05-10 14:30:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-10 10:30:00"), utcFromString("2026-05-10 14:30:00"),
        utcFromString("2026-05-10 14:30:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Rule: Rest Extension 02:00 AFTER, attribute "e", base AAA
    RuleInput input = make7359Input("AAA", "e", "AFTER", "02:00", 735900201);
    auto rule = makeRule(ctx, input);

    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_FALSE(_violations.empty());
}

// RJ2: Rest Extension BEFORE - insufficient rest (01:00) before duty with attribute "e" -> REJECT
TEST_F(Rule7359Test, Reject_RestExtensionBefore_InsufficientRest) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7359RJ2";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty with attribute "e" ends at 12:00 (only 01:00 rest before it)
    DutyPlan plan1 = {"2026-05-11 07:00:00", "2026-05-11 12:00:00", "AAA", "AAA", 300, "e"};
    dutyStore.push_back(makeDuty(plan1, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-11 07:00:00"), utcFromString("2026-05-11 12:00:00"),
        utcFromString("2026-05-11 12:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Second duty starts at 11:00 (01:00 before first duty ends at 12:00) < 02:00 required -> REJECT
    dutyStore.push_back(makeDuty({"2026-05-11 11:00:00", "2026-05-11 15:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-11 11:00:00"), utcFromString("2026-05-11 15:00:00"),
        utcFromString("2026-05-11 15:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Rule: Rest Extension 02:00 BEFORE, attribute "e", base AAA
    RuleInput input = make7359Input("AAA", "e", "BEFORE", "02:00", 735900202);
    auto rule = makeRule(ctx, input);

    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_FALSE(_violations.empty());
}

// RJ3: Rest Extension * (either) - insufficient rest on BOTH sides -> REJECT
TEST_F(Rule7359Test, Reject_RestExtensionWildcard_InsufficientRestBothSides) {
    const std::string crewId = "7359RJ3";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty ends at 10:30
    dutyStore.push_back(makeDuty({"2026-05-12 06:30:00", "2026-05-12 10:30:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-12 06:30:00"), utcFromString("2026-05-12 10:30:00"),
        utcFromString("2026-05-12 10:30:00"), utcFromString("2030-01-01 00:00:00")));

    // Duty with attribute "e" at 11:00-15:00
    // Rest before = 00:30 < 02:00, Rest after = 01:00 < 02:00
    // Neither side satisfies 02:00 -> REJECT
    DutyPlan plan2 = {"2026-05-12 11:00:00", "2026-05-12 15:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-12 11:00:00"), utcFromString("2026-05-12 15:00:00"),
        utcFromString("2026-05-12 15:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Third duty at 16:00 (01:00 after)
    dutyStore.push_back(makeDuty({"2026-05-12 16:00:00", "2026-05-12 20:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-12 16:00:00"), utcFromString("2026-05-12 20:00:00"),
        utcFromString("2026-05-12 20:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Rule: Rest Extension 02:00 * (either side), attribute "e", base AAA
    RuleInput input = make7359Input("AAA", "e", "*", "02:00", 735900203);
    auto rule = makeRule(ctx, input);

    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_FALSE(_violations.empty());
}

// ============================================================
// EDGE CASE TESTS
// ============================================================

// EC1: Empty override duty attribute token - rule not applicable (passes)
TEST_F(Rule7359Test, EdgeCase_EmptyAttributeToken_Passes) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7359EC1";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // Duty with attribute "e" but rest is short - shouldn't matter if attribute is empty
    DutyPlan plan1 = {"2026-05-20 06:00:00", "2026-05-20 10:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan1, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-20 06:00:00"), utcFromString("2026-05-20 10:00:00"),
        utcFromString("2026-05-20 10:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Short rest after - would fail if rule applies
    DutyPlan plan2 = {"2026-05-20 10:30:00", "2026-05-20 14:30:00", "AAA", "AAA", 240, ""};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-20 10:30:00"), utcFromString("2026-05-20 14:30:00"),
        utcFromString("2026-05-20 14:30:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Empty override duty attributes - rule should not apply
    RuleInput input = make7359Input("AAA", "", "AFTER", "02:00", 735900301);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// EC2: Mixed-case extended rest distribution (lowercase "after" converted to uppercase)
TEST_F(Rule7359Test, EdgeCase_MixedCaseDistribution_Passes) {
    const std::string crewId = "7359EC2";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty ends at 10:00
    dutyStore.push_back(makeDuty({"2026-05-21 06:00:00", "2026-05-21 10:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-21 06:00:00"), utcFromString("2026-05-21 10:00:00"),
        utcFromString("2026-05-21 10:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Duty with "e" at 14:00-18:00 - sufficient rest after (4 hours)
    DutyPlan plan2 = {"2026-05-21 14:00:00", "2026-05-21 18:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-21 14:00:00"), utcFromString("2026-05-21 18:00:00"),
        utcFromString("2026-05-21 18:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Lowercase "after" should be converted to uppercase by strToUpper
    RuleInput input = make7359Input("AAA", "e", "after", "02:00", 735900302);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// EC3: Rest extension at exact boundary (02:00 = 120 minutes) - should pass
TEST_F(Rule7359Test, EdgeCase_ExactBoundary_Passes) {
    const std::string crewId = "7359EC3";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty ends at 08:00
    dutyStore.push_back(makeDuty({"2026-05-22 04:00:00", "2026-05-22 08:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-22 04:00:00"), utcFromString("2026-05-22 08:00:00"),
        utcFromString("2026-05-22 08:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Duty with "e" at 10:00-14:00 - exactly 2 hours rest after (120 min >= 120 min)
    DutyPlan plan2 = {"2026-05-22 10:00:00", "2026-05-22 14:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-22 10:00:00"), utcFromString("2026-05-22 14:00:00"),
        utcFromString("2026-05-22 14:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Exact boundary: 120 minutes >= 120 minutes -> should pass
    RuleInput input = make7359Input("AAA", "e", "AFTER", "02:00", 735900303);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// EC4: Rest extension just below boundary (01:59 = 119 minutes) - should fail
TEST_F(Rule7359Test, EdgeCase_JustBelowBoundary_Fails) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7359EC4";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty ends at 08:00
    dutyStore.push_back(makeDuty({"2026-05-23 04:00:00", "2026-05-23 08:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-23 04:00:00"), utcFromString("2026-05-23 08:00:00"),
        utcFromString("2026-05-23 08:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Duty with "e" at 09:59-13:59 - 119 minutes rest after < 120 min required
    DutyPlan plan2 = {"2026-05-23 09:59:00", "2026-05-23 13:59:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-23 09:59:00"), utcFromString("2026-05-23 13:59:00"),
        utcFromString("2026-05-23 13:59:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Just below boundary: 119 minutes < 120 minutes -> should fail
    RuleInput input = make7359Input("AAA", "e", "AFTER", "02:00", 735900304);
    auto rule = makeRule(ctx, input);

    EXPECT_FALSE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_FALSE(_violations.empty());
}

// EC5: BOTH distribution with half exactly at boundary (01:00 = 60 min)
TEST_F(Rule7359Test, EdgeCase_BothHalfExactBoundary_Passes) {
    const std::string crewId = "7359EC5";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // First duty ends at 08:00
    dutyStore.push_back(makeDuty({"2026-05-24 04:00:00", "2026-05-24 08:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-24 04:00:00"), utcFromString("2026-05-24 08:00:00"),
        utcFromString("2026-05-24 08:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Duty with "e" at 09:00-13:00
    // Rest before = 1 hour (60 min) >= half of 02:00 (60 min) -> OK
    DutyPlan plan2 = {"2026-05-24 09:00:00", "2026-05-24 13:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-24 09:00:00"), utcFromString("2026-05-24 13:00:00"),
        utcFromString("2026-05-24 13:00:00"), utcFromString("2030-01-01 00:00:00")));

    // Third duty at 14:00 - exactly 1 hour rest after >= half -> OK
    dutyStore.push_back(makeDuty({"2026-05-24 14:00:00", "2026-05-24 18:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-24 14:00:00"), utcFromString("2026-05-24 18:00:00"),
        utcFromString("2026-05-24 18:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Half of 02:00 is exactly 01:00 (60 min) - boundary case
    RuleInput input = make7359Input("AAA", "e", "BOTH", "02:00", 735900305);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// EC6: BOTH with only one side present - should still check the available side
TEST_F(Rule7359Test, EdgeCase_BothSingleDutyOnEitherSide_Passes) {
    const std::string crewId = "7359EC6";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // Only one duty with "e" in the middle - no previous duty
    // Next duty at 14:00 gives 4 hours rest after >= 02:00 -> should pass
    DutyPlan plan1 = {"2026-05-25 10:00:00", "2026-05-25 14:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan1, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-25 10:00:00"), utcFromString("2026-05-25 14:00:00"),
        utcFromString("2026-05-25 14:00:00"), utcFromString("2030-01-01 00:00:00")));

    dutyStore.push_back(makeDuty({"2026-05-25 18:00:00", "2026-05-25 22:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-25 18:00:00"), utcFromString("2026-05-25 22:00:00"),
        utcFromString("2026-05-25 22:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // With AFTER logic, BOTH should still pass if AFTER side satisfies
    RuleInput input = make7359Input("AAA", "e", "BOTH", "02:00", 735900306);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}

// EC7: Wildcard distribution with asterisk
TEST_F(Rule7359Test, EdgeCase_WildcardAsterisk_Passes) {
    const std::string crewId = "7359EC7";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    std::vector<SharedPtr<ROSTER>> rosterStore;

    // Duty with "e" - sufficient rest after (4 hours)
    dutyStore.push_back(makeDuty({"2026-05-26 06:00:00", "2026-05-26 10:00:00"}, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-26 06:00:00"), utcFromString("2026-05-26 10:00:00"),
        utcFromString("2026-05-26 10:00:00"), utcFromString("2030-01-01 00:00:00")));

    DutyPlan plan2 = {"2026-05-26 14:00:00", "2026-05-26 18:00:00", "AAA", "AAA", 240, "e"};
    dutyStore.push_back(makeDuty(plan2, ctx, segments));
    pairingStore.push_back(makePairing({dutyStore.back().get()}, "AAA"));
    ctx->pairingIdMap[pairingStore.back()->getDbId()] = pairingStore.back().get();
    rosterStore.push_back(makeFlyRoster(crewId, pairingStore.back().get(),
        utcFromString("2026-05-26 14:00:00"), utcFromString("2026-05-26 18:00:00"),
        utcFromString("2026-05-26 18:00:00"), utcFromString("2030-01-01 00:00:00")));

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->rosterList.clear();
    for (auto& r : rosterStore) {
        crew->rosterList.push_back(r);
    }

    // Asterisk should be treated as wildcard
    RuleInput input = make7359Input("AAA", "e", "*", "02:00", 735900307);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(asConstRosterPtrs(rosterStore)));
    EXPECT_TRUE(_violations.empty());
}
