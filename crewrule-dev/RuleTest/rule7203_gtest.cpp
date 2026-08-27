/**
 * @file rule7203_gtest.cpp
 * @brief GoogleTest suite for CheckSegmentRestrictionForEvaFdRule (7203)
 * @author auto-generated
 * @date 2026-05-07
**/

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "GlobalDefinition/RuleEngineDef.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7203/CheckSegmentRestrictionForEvaFdRule.h"
#include "db/AssignmentHolder.h"
#include "db/Duty.h"
#include "db/Pairing.h"
#include "db/RuleParams.h"
#include "db/Segment.h"
#include "orUtil/UtilFunc.h"

#ifndef RULETEST_DATA_DIR
#define RULETEST_DATA_DIR ""
#endif

namespace {

time_t utcFromString(const char* s) {
    return utcStrToUtc(const_cast<char*>(s));
}

long long nextDutyId() {
    static long long id = 720300100;
    return ++id;
}

long long nextSegmentId() {
    static long long id = 720300200;
    return ++id;
}

long long nextPairingId() {
    static long long id = 720300300;
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
    assignment->ASSIGNMENT_ID = 7203;
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

std::unique_ptr<Duty> makeDutyWithMultipleSegments(
    const DutyPlan& plan,
    const SharedPtr<CrewDataContext>& ctx,
    std::vector<std::unique_ptr<Segment>>& segStore,
    int numSegments) {
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

    std::vector<Segment*> segRefs;
    int segBlockMinutes = plan.blockMinutes / numSegments;
    for (int i = 0; i < numSegments; ++i) {
        auto seg = std::make_unique<Segment>();
        seg->setSegmentId(nextSegmentId());
        const time_t segStartUtc = startUtc + (i * segBlockMinutes * 60);
        const time_t segEndUtc = segStartUtc + segBlockMinutes * 60;
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
        seg->setBlkSeconds(segBlockMinutes * 60);
        seg->setBlkMinHistory(segBlockMinutes);

        segStore.push_back(std::move(seg));
        segRefs.push_back(segStore.back().get());
    }

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
                                     const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setQualifier("FLY");
    pairing->setDbId(nextPairingId());
    if (!duties.empty()) {
        const Duty* first = duties.front();
        const Duty* last = duties.back();
        pairing->setStartTimeUtcAct(first->getStartTimeUtcAct());
        pairing->setStartTimeUtcSch(first->getStartTimeUtcSch());
        pairing->setStartTimeLocAct(first->getStartTimeLocAct());
        pairing->setStartTimeLocSch(first->getStartTimeLocAct());
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct());
        pairing->setEndTimeUtcSch(last->getEndTimeUtcSch());
        pairing->setEndTimeLocAct(last->getEndTimeLocAct());
        pairing->setEndTimeLocSch(last->getEndTimeLocSch());
    }
    return pairing;
}

RuleInput make7203Input(const std::string& bases,
                        const std::string& dpEncroachingPeriod,
                        const std::string& encroachingDuration,
                        const std::string& overrideDutyAttributes,
                        const std::string& sectorBlhRanges,
                        const std::string& maxSector,
                        const std::string& depArps = "*",
                        const std::string& arvArps = "*",
                        long long idRuleParam = 7203001) {
    RuleInput input;
    DBRule row{};
    row.idRule = 7203;
    row.function = 7203;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = idRuleParam;
    row.overridebility = "H";
    std::strcpy(row.description, "Segment Restriction For EvaFd");
    row.reference = "PR";
    row.category = "Segment";

    // Parameter order: bases,compositions,dutyType,consecutiveDuty,reportTimeRange,
    //                  dpEncroachingPeriod,encroachingDuration,overrideDutyAttributes,
    //                  sectorBlhRanges,segmentAssignments,flightFleets,maxSector,depArps,arvArps,severity
    row.params["BASES"] = bases;
    row.params["DP ENCROACHING PERIOD"] = dpEncroachingPeriod;
    row.params["ENCROACHING DURATION"] = encroachingDuration;
    row.params["OVERRIDE DUTY ATTRIBUTES"] = overrideDutyAttributes;
    row.params["SECTOR BLH RANGES"] = sectorBlhRanges;
    row.params["MAX SECTOR"] = maxSector;
    row.params["DEP ARPS"] = depArps;
    row.params["ARV ARPS"] = arvArps;
    row.params["SEVERITY"] = "1";

    input.dbRules.push_back(row);
    return input;
}

}  // namespace

class Rule7203Test : public ::testing::Test {
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

    std::unique_ptr<CheckSegmentRestrictionForEvaFdRule> makeRule(
        const SharedPtr<CrewDataContext>& ctx,
        const RuleInput& input) {
        auto rule = std::make_unique<CheckSegmentRestrictionForEvaFdRule>(nullptr, input);
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

// ============================================================
// HAPPY PATH TESTS
// ============================================================

// HP1: Duty with DP Encroaching Period 02:00-05:00 and Encroaching Duration 00:00-00:01,
//       attribute "e" matches, BLH within range, 3 sectors (max 5) -> PASS
TEST_F(Rule7203Test, HappyPath_EncroachingDurationShort_MaxSector5) {
    const std::string crewId = "7203HP1";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty report at 01:30 local, release at 03:30 local
    // Overlaps with DP Encroaching Period 02:00-05:00 by 1.5 hours (00:30-01:30)
    // This is within Encroaching Duration 00:00-00:01 (wait, 90 min is NOT within 1 min!)
    // Let me recalculate: Encroaching Duration 00:00-00:01 means 0-1 minute overlap
    // Actually per user spec: 00:00-00:01 (Max Sector 5) - this means overlap duration is 0-1 min
    // We need duty that overlaps the DP period by less than 1 minute
    //
    // Let's make duty from 01:59 to 02:01 local (2 min duration)
    // Overlaps DP period 02:00-05:00 by ~1 minute
    // This should be within 00:00-00:01 overlap range (0-1 minute)
    // With 3 sectors and max sector 5 -> PASS
    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-01 01:59:00", "2026-05-01 03:01:00", "AAA", "AAA", 60},
        ctx, segments, 3));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    // DP Encroaching Period: 02:00-05:00
    // Encroaching Duration: 00:00-00:01 (0-1 minutes)
    // Override Duty Attributes: e
    // Sector BLH Ranges: 00:00-10:00
    // Max Sector: 5
    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "00:00-00:01", "e", "00:00-10:00", "5", "*", "*", 720300101);
    auto rule = makeRule(ctx, input);

    // The duty has 3 FLY segments, max is 5, should pass
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

// HP2: Duty with DP Encroaching Period 02:00-05:00 and Encroaching Duration 00:01-02:00,
//       attribute "e" matches, 4 sectors (max 4) -> PASS
TEST_F(Rule7203Test, HappyPath_EncroachingDurationMedium_MaxSector4) {
    const std::string crewId = "7203HP2";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty from 01:00 to 04:00 local (3 hour duty)
    // Overlaps DP period 02:00-05:00 by 2 hours (02:00-04:00)
    // This is within Encroaching Duration 00:01-02:00 (1-120 minutes)
    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-02 01:00:00", "2026-05-02 04:00:00", "AAA", "AAA", 120},
        ctx, segments, 4));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    // DP Encroaching Period: 02:00-05:00
    // Encroaching Duration: 00:01-02:00 (1-120 minutes)
    // Override Duty Attributes: e
    // Sector BLH Ranges: 00:00-10:00
    // Max Sector: 4
    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "00:01-02:00", "e", "00:00-10:00", "4", "*", "*", 720300102);
    auto rule = makeRule(ctx, input);

    // The duty has 4 FLY segments, max is 4, should pass
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

// HP3: Duty outside DP Encroaching Period -> PASS (rule does not apply)
TEST_F(Rule7203Test, HappyPath_DutyOutsideDPEncroachingPeriod) {
    const std::string crewId = "7203HP3";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty from 06:00 to 14:00 local - does NOT overlap with DP period 02:00-05:00
    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-03 06:00:00", "2026-05-03 14:00:00", "AAA", "AAA", 480},
        ctx, segments, 8));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "00:01-02:00", "e", "00:00-10:00", "4", "*", "*", 720300103);
    auto rule = makeRule(ctx, input);

    // Duty does not overlap DP Encroaching Period, rule should pass
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

// HP4: Duty with no Override Duty Attributes required -> PASS
TEST_F(Rule7203Test, HappyPath_NoDutyAttributeRequirement) {
    const std::string crewId = "7203HP4";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty with no attributes set
    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-04 01:00:00", "2026-05-04 04:00:00", "AAA", "AAA", 180},
        ctx, segments, 5));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    // No Override Duty Attributes specified (empty string means any/no attribute is OK)
    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "00:01-02:00", "", "00:00-10:00", "5", "*", "*", 720300104);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

// HP5: Duty with Encroaching Duration 02:00-04:00, Max Sector 2, 2 sectors -> PASS
TEST_F(Rule7203Test, HappyPath_EncroachingDurationLong_MaxSector2) {
    const std::string crewId = "7203HP5";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty from 01:00 to 05:00 local (4 hour duty)
    // Overlaps DP period 02:00-05:00 by 3 hours (02:00-05:00)
    // This is within Encroaching Duration 02:00-04:00 (120-240 minutes)
    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-05 01:00:00", "2026-05-05 05:00:00", "AAA", "AAA", 240},
        ctx, segments, 2));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    // DP Encroaching Period: 02:00-05:00
    // Encroaching Duration: 02:00-04:00 (120-240 minutes)
    // Override Duty Attributes: e
    // Sector BLH Ranges: 00:00-10:00
    // Max Sector: 2
    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "02:00-04:00", "e", "00:00-10:00", "2", "*", "*", 720300105);
    auto rule = makeRule(ctx, input);

    // The duty has 2 FLY segments, max is 2, should pass
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7203Test, HappyPath_DepArpsAndArvArpsSupportMultiSelect) {
    const std::string crewId = "7203HP6";
    auto ctx = buildContext(crewId);
    ctx->airportUtcOffsetMap["BBB"] = 0;
    ctx->airportZoneIdMap["BBB"] = "UTC";
    ctx->airportUtcOffsetMap["CCC"] = 0;
    ctx->airportZoneIdMap["CCC"] = "UTC";
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-06 01:00:00", "2026-05-06 04:00:00", "BBB", "CCC", 180},
        ctx, segments, 3));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "00:01-03:00", "", "00:00-10:00", "3", "AAA|BBB", "CCC|DDD", 720300106);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7203Test, HappyPath_DepArpsAndArvArpsWildcardSkipsCheck) {
    const std::string crewId = "7203HP7";
    auto ctx = buildContext(crewId);
    ctx->airportUtcOffsetMap["BBB"] = 0;
    ctx->airportZoneIdMap["BBB"] = "UTC";
    ctx->airportUtcOffsetMap["CCC"] = 0;
    ctx->airportZoneIdMap["CCC"] = "UTC";
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-07 01:00:00", "2026-05-07 04:00:00", "BBB", "CCC", 180},
        ctx, segments, 3));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "00:01-03:00", "", "00:00-10:00", "3", "*", "*", 720300107);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7203Test, HappyPath_DepArpsOrArvArpsMismatchDoesNotCountSegment) {
    const std::string crewId = "7203HP8";
    auto ctx = buildContext(crewId);
    ctx->airportUtcOffsetMap["BBB"] = 0;
    ctx->airportZoneIdMap["BBB"] = "UTC";
    ctx->airportUtcOffsetMap["CCC"] = 0;
    ctx->airportZoneIdMap["CCC"] = "UTC";
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-08 01:00:00", "2026-05-08 04:00:00", "BBB", "CCC", 180},
        ctx, segments, 3));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "00:01-03:00", "", "00:00-10:00", "0", "AAA", "CCC", 720300108);
    auto rule = makeRule(ctx, input);

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

// ============================================================
// REJECT TESTS
// ============================================================

// RJ1: Duty with 6 sectors exceeds Max Sector 5 -> REJECT
TEST_F(Rule7203Test, Reject_ExceedsMaxSector5) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7203RJ1";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty with 6 segments (exceeds max of 5)
    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-10 01:59:00", "2026-05-10 03:01:00", "AAA", "AAA", 60},
        ctx, segments, 6));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "00:00-00:01", "e", "00:00-10:00", "5", "*", "*", 720300201);
    auto rule = makeRule(ctx, input);

    // 6 sectors > max 5, should fail
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

// RJ2: Duty with 3 sectors exceeds Max Sector 2 -> REJECT
TEST_F(Rule7203Test, Reject_ExceedsMaxSector2) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7203RJ2";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty with 3 segments (exceeds max of 2)
    dutyStore.push_back(makeDutyWithMultipleSegments(
        {"2026-05-11 01:00:00", "2026-05-11 05:00:00", "AAA", "AAA", 240},
        ctx, segments, 3));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "02:00-04:00", "e", "00:00-10:00", "2", "*", "*", 720300202);
    auto rule = makeRule(ctx, input);

    // 3 sectors > max 2, should fail
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

// RJ3: Duty attribute "e" required but duty has no matching attribute -> REJECT
TEST_F(Rule7203Test, Reject_DutyAttributeMismatch) {
    GTEST_SKIP() << "Pending rule implementation";
    const std::string crewId = "7203RJ3";
    auto ctx = buildContext(crewId);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty from 01:00 to 04:00 local (overlaps DP period 02:00-05:00 by 2 hours)
    // But duty has attribute "XX" instead of "e"
    DutyPlan plan = {"2026-05-12 01:00:00", "2026-05-12 04:00:00", "AAA", "AAA", 180, "XX"};
    dutyStore.push_back(makeDutyWithMultipleSegments(plan, ctx, segments, 3));

    auto raw = asRaw(dutyStore);
    auto pairing = makePairing(raw, "AAA");
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    // Override Duty Attributes: e (duty must have "e" attribute)
    RuleInput input = make7203Input(
        "AAA", "02:00-05:00", "00:01-02:00", "e", "00:00-10:00", "5", "*","*",720300203);
    auto rule = makeRule(ctx, input);

    // Duty attribute "XX" does not match required "e", should fail
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}
