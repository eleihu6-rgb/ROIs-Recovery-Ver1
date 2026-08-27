#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "Duty.h"
#include "JsonPairing.h"
#include "Pairing.h"
#include "Segment.h"
#include "orUtil/UtilFunc.h"
#include "rule/framework/utils/DutyUtils.h"

#include <cstring>
#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

namespace {

constexpr long long kComp2p = 1001;
constexpr long long kComp3p = 1002;

void addRank(const SharedPtr<CrewDataContext>& ctx, const std::string& rank, const std::string& division) {
    RANK item;
    item.airline = ctx->scenario.airline;
    item.rank = rank;
    item.division = division;
    item.isMustCrewRank = true;
    item.isCrewRank = true;
    item.isActingRank = true;
    ctx->rankMap[rank] = item;
    ctx->rankList.push_back(item);
}

composition_rank makeCompositionRank(const std::map<std::string, int>& values) {
    composition_rank item;
    item.rankCount = static_cast<int>(values.size());
    int index = 0;
    for (const auto& value : values) {
        std::strncpy(item.rankValue[index].rank, value.first.c_str(), sizeof(item.rankValue[index].rank) - 1);
        item.rankValue[index].plan_value = value.second;
        ++index;
    }
    return item;
}

void addComposition(
    const SharedPtr<CrewDataContext>& ctx,
    long long compositionId,
    const std::string& name,
    int order,
    int optionId,
    const std::map<std::string, int>& values) {
    ctx->compositionList.emplace_back(compositionId, name, order, ctx->scenario.airline, ctx->scenario.division, order);
    composition_rank rankValue = makeCompositionRank(values);
    rankValue.comp_id = compositionId;
    rankValue.hierarchy = order;
    std::strncpy(rankValue.airline, ctx->scenario.airline.c_str(), sizeof(rankValue.airline) - 1);
    std::strncpy(rankValue.division, ctx->scenario.division.c_str(), sizeof(rankValue.division) - 1);
    ctx->compositionRankMap[compositionId] = rankValue;
    ctx->compositionRankOptionMap[compositionId][optionId] = rankValue;
}

SharedPtr<CrewDataContext> makeContext() {
    SharedPtr<CrewDataContext> ctx(new CrewDataContext());
    ctx->scenario.airline = "SQ";
    ctx->scenario.division = "P";
    ctx->scenario.bases.push_back("SIN");
    ctx->airportUtcOffsetMap["SIN"] = 480;
    ctx->airportUtcOffsetMap["HKG"] = 480;
    ctx->airportUtcOffsetMap["JNB"] = 120;
    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
    ctx->airportZoneIdMap["HKG"] = "Asia/Hong_Kong";
    ctx->airportZoneIdMap["JNB"] = "Africa/Johannesburg";
    addRank(ctx, "CPT", "P");
    addRank(ctx, "FO", "P");
    addComposition(ctx, kComp2p, "2P", 1, 1, {{"CPT", 1}, {"FO", 1}});
    addComposition(ctx, kComp3p, "3P", 2, 1, {{"CPT", 1}, {"FO", 2}});
    return ctx;
}

DBRule make7410Row(
    int rowNum,
    const std::string& composition,
    const std::string& maxFdp,
    const std::string& tzDiff = "00:00-23:59") {
    DBRule rule;
    rule.idRule = 7410001;
    rule.function = 7410;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.phase = (int)PHASE::PHASE_PLANNING;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "ANR-121";
    rule.idRuleParam = 208174100 + rowNum;
    rule.params["TZ DIFF"] = tzDiff;
    rule.params["COMPOSITION"] = composition;
    rule.params["REST FACILITY"] = "*";
    rule.params["REPORT START"] = "00:00";
    rule.params["REPORT END"] = "23:59";
    rule.params["SECTOR LOWER"] = "1";
    rule.params["SECTORS UPPER"] = "99";
    rule.params["FDP RANGE"] = "*";
    rule.params["MAX FDP"] = maxFdp;
    return rule;
}

DBRule make7410ControlRow() {
    DBRule rule;
    rule.idRule = 7410001;
    rule.function = 7410;
    rule.tableNum = 2;
    rule.rowNum = 1;
    rule.phase = (int)PHASE::PHASE_PLANNING;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "ANR-121";
    rule.idRuleParam = 208174105;
    rule.params["COUNT DEADHEAD SECTORS"] = "Y";
    rule.params["EXCLUDE FINAL DEADHEAD SECTORS"] = "N";
    rule.params["GLOBAL BUFFER MINUTES"] = "0";
    rule.params["APPLY REPORT TIME DIFFERENCE"] = "N";
    return rule;
}

DBRule make7411Row(
    int rowNum,
    const std::string& sectorLengthLower,
    const std::string& sectorLengthUpper,
    const std::string& tzDiff,
    int sectorValue) {
    DBRule rule;
    rule.idRule = 7411001;
    rule.function = 7411;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.phase = (int)PHASE::PHASE_PLANNING;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "ANR-121";
    rule.idRuleParam = 208174110 + rowNum;
    rule.params["SECTOR LENGTH LOWER"] = sectorLengthLower;
    rule.params["SECTOR LENGTH UPPER"] = sectorLengthUpper;
    rule.params["TZ DIFF"] = tzDiff;
    rule.params["SECTOR VALUE"] = std::to_string(sectorValue);
    return rule;
}

DBRule make7413Row(
    int rowNum,
    const std::string& composition,
    const std::string& maxFdp) {
    DBRule rule;
    rule.idRule = 7413001;
    rule.function = 7413;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.phase = (int)PHASE::PHASE_PLANNING;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "ANR-121";
    rule.idRuleParam = 208174130 + rowNum;
    rule.params["COMPOSITION"] = composition;
    rule.params["REST FACILITY"] = "*";
    rule.params["FDP RANGE"] = "*";
    rule.params["DUTY START STATION"] = "*";
    rule.params["HAS SECTOR"] = "*";
    rule.params["SECTOR MIN FLY TIME"] = "00:00";
    rule.params["MAX FDP"] = maxFdp;
    return rule;
}

void configure7410MinimumComplement(
    const SharedPtr<CrewDataContext>& ctx,
    const std::string& twoPilotMaxFdp,
    const std::string& threePilotMaxFdp) {
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=7410";
    ctx->ruleList.clear();
    ctx->ruleList.push_back(make7410Row(1, "2P", twoPilotMaxFdp));
    ctx->ruleList.push_back(make7410Row(2, "3P", threePilotMaxFdp));
    ctx->ruleList.push_back(make7410ControlRow());
}

DBRule make7400Rule() {
    DBRule rule;
    rule.idRule = 7400001;
    rule.function = 7400;
    rule.tableNum = 1;
    rule.rowNum = 1;
    rule.phase = (int)PHASE::PHASE_PLANNING;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "ANR-121";
    rule.idRuleParam = 208174000;
    rule.params["MIN LN"] = "3";
    rule.params["ACC STATE CURRENT TZ"] = "A";
    rule.params["ACC STATE PREV TZ"] = "B";
    return rule;
}

DBRule makeFailingDutyCount2003Rule() {
    DBRule rule;
    auto parsed = std::make_shared<rule2003>();
    parsed->base = "SIN";
    parsed->maxPgLength = 999;
    parsed->maxDutiesinPG = 1;
    parsed->allowReturnBaseinDuty = "Y";
    parsed->maxBlh = "99:00";
    parsed->allowableLayoverStation = {"*"};
    rule.parsedParam = parsed;
    rule.idRule = 2003001;
    rule.function = 2003;
    rule.tableNum = 1;
    rule.rowNum = 1;
    rule.phase = (int)PHASE::PHASE_PLANNING;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "TEST";
    rule.idRuleParam = 208172003;
    return rule;
}

void configureJnbAcclimatizationMinimumComplement(
    const SharedPtr<CrewDataContext>& ctx,
    bool includeFailingPairingRule = false) {
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=7410";
    ctx->ruleList.clear();
    ctx->ruleList.push_back(make7400Rule());
    ctx->ruleList.push_back(make7410Row(1, "2P", "15:00", "00:00-02:00"));
    ctx->ruleList.push_back(make7410Row(2, "2P", "13:00", "02:01-24:00"));
    ctx->ruleList.push_back(make7410Row(3, "3P", "15:00", "00:00-24:00"));
    ctx->ruleList.push_back(make7410ControlRow());
    if (includeFailingPairingRule) {
        ctx->ruleList.push_back(makeFailingDutyCount2003Rule());
    }
}

std::unique_ptr<Segment> makeSegment(const std::map<std::string, int>& planComposition) {
    static long long nextSegmentId = 100;
    auto segment = std::make_unique<Segment>();
    segment->setDBId(nextSegmentId);
    segment->setSegmentId(nextSegmentId);
    ++nextSegmentId;
    segment->setAssignment("FLY");
    segment->setIsOperating(true);
    segment->setFlightNumber("1");
    segment->setDepStation("SIN");
    segment->setArrStation("HKG");
    segment->setPlanComposition(planComposition);
    segment->resetOpenComposition(planComposition);
    return segment;
}

std::unique_ptr<Segment> makeSegment(
    const SharedPtr<CrewDataContext>& ctx,
    const std::string& dep,
    const std::string& arr,
    const std::string& startUtcString,
    const std::string& endUtcString,
    const std::map<std::string, int>& planComposition) {
    auto segment = makeSegment(planComposition);
    segment->setDepStation(dep);
    segment->setArrStation(arr);
    const time_t startUtc = utcStrToUtc(const_cast<char*>(startUtcString.c_str()));
    const time_t endUtc = utcStrToUtc(const_cast<char*>(endUtcString.c_str()));
    segment->setStartTimeUtcAct(startUtc);
    segment->setEndTimeUtcAct(endUtc);
    segment->setStartTimeUtcSch(startUtc);
    segment->setEndTimeUtcSch(endUtc);
    segment->setStartTimeLocAct(startUtc + static_cast<time_t>(ctx->airportUtcOffsetMap[dep]) * 60);
    segment->setEndTimeLocAct(endUtc + static_cast<time_t>(ctx->airportUtcOffsetMap[arr]) * 60);
    segment->setStartTimeLocSch(segment->getStartTimeLocAct());
    segment->setEndTimeLocSch(segment->getEndTimeLocAct());
    return segment;
}

std::unique_ptr<Segment> makeTimedSegment(const std::map<std::string, int>& planComposition) {
    auto segment = makeSegment(planComposition);
    const time_t startUtc = 1735689600; // 2025-01-01 00:00:00 UTC
    const time_t endUtc = startUtc + 2 * 60 * 60;
    segment->setStartTimeUtcAct(startUtc);
    segment->setEndTimeUtcAct(endUtc);
    segment->setStartTimeUtcSch(startUtc);
    segment->setEndTimeUtcSch(endUtc);
    segment->setStartTimeLocAct(startUtc + 480 * 60);
    segment->setEndTimeLocAct(endUtc + 480 * 60);
    segment->setStartTimeLocSch(segment->getStartTimeLocAct());
    segment->setEndTimeLocSch(segment->getEndTimeLocAct());
    return segment;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setId(10);
    duty->setDutyId(10);
    duty->setDutySeq(1);
    duty->setAssignment("FLY");
    duty->resetTypeBySegments();
    return duty;
}

std::unique_ptr<Duty> makeTimedDuty(
    const std::vector<Segment*>& segments,
    int fdpMinutes) {
    auto duty = makeDuty(segments);
    duty->setPairingId(20);
    duty->setDutyId(duty->getId());
    duty->setDepartureStation("SIN");
    duty->setArrivalStation("HKG");
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
    duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch());
    duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch());
    duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
    duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
    duty->setStartTimeLocSch(segments.front()->getStartTimeLocSch());
    duty->setEndTimeLocSch(segments.back()->getEndTimeLocSch());
    duty->setRefTimeZone(480);
    duty->setFDPInSecs(fdpMinutes * 60);
    return duty;
}

std::unique_ptr<Duty> makeDuty(
    const SharedPtr<CrewDataContext>& ctx,
    const std::vector<Segment*>& segments,
    int dutyId,
    int dutySeq,
    int fdpMinutes,
    const std::string& compositionName = "2P") {
    auto duty = makeDuty(segments);
    duty->setId(dutyId);
    duty->setDutyId(dutyId);
    duty->setDutySeq(dutySeq);
    duty->setPairingId(20);
    duty->setCompositionName(compositionName);
    duty->setDepartureStation(segments.front()->getDepStation());
    duty->setArrivalStation(segments.back()->getArrStation());
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
    duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch());
    duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch());
    duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
    duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
    duty->setStartTimeLocSch(segments.front()->getStartTimeLocSch());
    duty->setEndTimeLocSch(segments.back()->getEndTimeLocSch());
    duty->setActualPickupMin(0);
    duty->setActualDropoffMin(60);
    duty->setMinPickup(0);
    duty->setMinDropoff(60);
    duty->setRefTimeZone(ctx->airportUtcOffsetMap[duty->getDepartureStation()]);
    duty->setFDPInSecs(fdpMinutes * 60);
    for (auto* segment : segments) {
        segment->setDutyId(dutyId);
        segment->setDutySeq(dutySeq);
        segment->setPairingId(20);
    }
    return duty;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setId(20);
    pairing->setDbId(20);
    pairing->setBase("SIN");
    pairing->setDivision("P");
    pairing->setFiliale("SQ");
    pairing->setPrimeActivity("FLY");
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
        pairing->setStartTimeLocAct(duties.front()->getStartTimeLocAct());
        pairing->setEndTimeLocAct(duties.back()->getEndTimeLocAct());
    }
    return pairing;
}

std::unique_ptr<Pairing> makeSinJnbSinPairing(
    const SharedPtr<CrewDataContext>& ctx,
    const std::string& returnStartUtc,
    const std::string& returnEndUtc,
    const std::string& returnCompositionName,
    std::vector<std::unique_ptr<Segment>>& segmentStore,
    std::vector<std::unique_ptr<Duty>>& dutyStore) {
    const std::map<std::string, int> twoPilotComposition = {{"CPT", 1}, {"FO", 1}};
    segmentStore.push_back(makeSegment(
        ctx, "SIN", "JNB",
        "2025-01-01 00:00:00",
        "2025-01-01 10:00:00",
        twoPilotComposition));
    dutyStore.push_back(makeDuty(ctx, {segmentStore.back().get()}, 10, 1, 12 * 60, "2P"));

    segmentStore.push_back(makeSegment(
        ctx, "JNB", "SIN",
        returnStartUtc,
        returnEndUtc,
        twoPilotComposition));
    dutyStore.push_back(makeDuty(ctx, {segmentStore.back().get()}, 11, 2, 14 * 60, returnCompositionName));

    return makePairing({dutyStore[0].get(), dutyStore[1].get()});
}

MinimumLegalComplementRange calculateRange(
    const SharedPtr<CrewDataContext>& ctx,
    Duty* duty) {
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(ctx, -1, false);
    return checker.calculateMinimumLegalComplementRange(duty, {"2P", "3P"});
}

// Note: PAIRING_OPTIMIZER skips minimum-legal-complement calculation
// (SGPO-834).  Use PAIRING_EDITOR in tests that verify min complement.
void calculatePairingMinimumComplements(
    const SharedPtr<CrewDataContext>& ctx,
    Pairing* pairing) {
    LegalityChecker checker(PAIRING_EDITOR, false);
    checker.setDataContext(ctx, -1, false);
    checker.calculateMinimumLegalComplements(pairing);
}

void calculatePairingMinimumComplementsAfterAnrAcclimatization(
    const SharedPtr<CrewDataContext>& ctx,
    Pairing* pairing) {
    createPairingNodeOfDuty(pairing, ctx.get());
    LegalityChecker checker(PAIRING_EDITOR, false);
    checker.setDataContext(ctx, -1, false);
    checker.setAcclimationStateOfANR(pairing);
    checker.calculateMinimumLegalComplements(pairing);
}

bool checkPairingRules(
    const SharedPtr<CrewDataContext>& ctx,
    Pairing* pairing,
    const std::vector<int>& rules) {
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(ctx, -1, false);
    return checker.checkPGRules(pairing, rules);
}

// When the duty has its composition explicitly set (as applyCandidateToDuty
// does during min-legal-complement candidate checking), GetCompositionByDutyFor3
// returns it directly without falling back to the flight-to-pairing derivation.
// This is tested by Z_EditorModeEscalates... at the end of this file.

} // namespace

TEST(MinimumLegalComplement, FallsBackToFlightCompositionWhenSystemParameterMissing) {
    auto ctx = makeContext();
    auto segment = makeSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty({segment.get()});

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
}

TEST(MinimumLegalComplement, FallsBackToFlightCompositionWhenScopedSystemParameterDoesNotMatch) {
    auto ctx = makeContext();
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:C=7410";
    auto segment = makeSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty({segment.get()});

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
}

TEST(MinimumLegalComplement, Configured8091ReturnsFlightComposition) {
    auto ctx = makeContext();
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=8091";
    auto segment = makeSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty({segment.get()});

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
}

TEST(MinimumLegalComplement, Configured7410KeepsFlightCompositionWhenLegal) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "14:00", "15:00");
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 13 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp2p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, Configured7410EscalatesToNextCompositionWhenFlightCompositionIllegal) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "13:00", "15:00");
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp3p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, Configured7410FallsBackToAllCompositionsWhenFlightCompositionMissing) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "13:00", "15:00");
    auto segment = makeTimedSegment({});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp3p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, UnsupportedConfiguredRulesFallBackToFlightComposition) {
    auto ctx = makeContext();
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=9999";
    auto segment = makeSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty({segment.get()});

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
}

TEST(MinimumLegalComplement, DivisionOnlyScopeMatchesAnyAirline) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "13:00", "15:00");
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "P=7410";
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp3p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, AirlineOnlyScopeMatchesAnyDivision) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "13:00", "15:00");
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:7410";
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp3p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, ExactScopeOverridesAirlineDivisionAndGlobalScopes) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "13:00", "15:00");
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "7410;P=9999;SQ:9999;SQ:P=8091";
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp2p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_TRUE(result.from8091);
}

TEST(MinimumLegalComplement, UnsupportedRuleBefore7410IsSkipped) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "13:00", "15:00");
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=9999|7410";
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp3p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, UnsupportedRuleAfter7410IsSkipped) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "13:00", "15:00");
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=7410|9999";
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp3p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, Configured8091TakesPrecedenceOver7410Calculation) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "13:00", "15:00");
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=8091|7410";
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp2p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_TRUE(result.from8091);
}

TEST(MinimumLegalComplement, JnbReturnAfterThreeLocalNightsUsesTwoPilotMinimum) {
    auto ctx = makeContext();
    configureJnbAcclimatizationMinimumComplement(ctx);
    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    auto pairing = makeSinJnbSinPairing(
        ctx,
        "2025-01-05 10:00:00",
        "2025-01-05 20:00:00",
        "2P",
        segmentStore,
        dutyStore);

    calculatePairingMinimumComplementsAfterAnrAcclimatization(ctx, pairing.get());

    const Duty* returnDuty = dutyStore[1].get();
    EXPECT_EQ("A", returnDuty->getAcclimatisedState());
    EXPECT_EQ(ctx->airportUtcOffsetMap["JNB"], returnDuty->getRefTimeZone());
    const MinimalLegalComplementRef& result = returnDuty->getMinimumLegalComplement();
    EXPECT_EQ(kComp2p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, JnbReturnBeforeAcclimatizedEscalatesEmptyInputCompositionToThreePilot) {
    auto ctx = makeContext();
    configureJnbAcclimatizationMinimumComplement(ctx);
    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    auto pairing = makeSinJnbSinPairing(
        ctx,
        "2025-01-03 10:00:00",
        "2025-01-03 20:00:00",
        "",
        segmentStore,
        dutyStore);

    calculatePairingMinimumComplementsAfterAnrAcclimatization(ctx, pairing.get());

    const Duty* returnDuty = dutyStore[1].get();
    EXPECT_EQ("B", returnDuty->getAcclimatisedState());
    EXPECT_EQ(ctx->airportUtcOffsetMap["SIN"], returnDuty->getRefTimeZone());
    EXPECT_TRUE(returnDuty->getCompositionName().empty());
    const MinimalLegalComplementRef& result = returnDuty->getMinimumLegalComplement();
    EXPECT_EQ(kComp3p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, OtherRuleViolationStillOutputsThreePilotMinimum) {
    auto ctx = makeContext();
    configureJnbAcclimatizationMinimumComplement(ctx, true);
    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    auto pairing = makeSinJnbSinPairing(
        ctx,
        "2025-01-03 10:00:00",
        "2025-01-03 20:00:00",
        "2P",
        segmentStore,
        dutyStore);

    calculatePairingMinimumComplementsAfterAnrAcclimatization(ctx, pairing.get());
    EXPECT_FALSE(checkPairingRules(ctx, pairing.get(), {2003}));

    const Duty* returnDuty = dutyStore[1].get();
    const MinimalLegalComplementRef& result = returnDuty->getMinimumLegalComplement();
    EXPECT_EQ(kComp3p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}

TEST(MinimumLegalComplement, NoPairingRangeReturnsPartialThenFirstFullCoverage) {
    auto ctx = makeContext();
    configureJnbAcclimatizationMinimumComplement(ctx);
    auto segment = makeSegment(
        ctx,
        "JNB",
        "SIN",
        "2025-01-03 10:00:00",
        "2025-01-03 20:00:00",
        {{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty(ctx, {segment.get()}, 11, 1, 14 * 60, "");

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(2, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Partial, range.options[0].coverage);
    EXPECT_EQ("3P", range.options[1].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Full, range.options[1].coverage);
    EXPECT_TRUE(duty->getCompositionName().empty());
}

TEST(MinimumLegalComplement, NoPairingRangeStopsWhenFlightCompositionFullyCoversTzDiff) {
    auto ctx = makeContext();
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=7410";
    ctx->ruleList.clear();
    ctx->ruleList.push_back(make7410Row(1, "2P", "15:00", "00:00-24:00"));
    ctx->ruleList.push_back(make7410Row(2, "3P", "16:00", "00:00-24:00"));
    ctx->ruleList.push_back(make7410ControlRow());
    auto segment = makeSegment(
        ctx,
        "JNB",
        "SIN",
        "2025-01-03 10:00:00",
        "2025-01-03 20:00:00",
        {{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty(ctx, {segment.get()}, 11, 1, 14 * 60, "");

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Full, range.options[0].coverage);
}

TEST(MinimumLegalComplement, BaseStartNoPairingUsesTzDiffZeroOnly) {
    auto ctx = makeContext();
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=7410";
    ctx->ruleList.clear();
    ctx->ruleList.push_back(make7410Row(1, "2P", "15:00", "00:00-00:00"));
    ctx->ruleList.push_back(make7410Row(2, "3P", "15:00", "00:00-24:00"));
    ctx->ruleList.push_back(make7410ControlRow());
    auto segment = makeSegment(
        ctx,
        "SIN",
        "JNB",
        "2025-01-01 00:00:00",
        "2025-01-01 10:00:00",
        {{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty(ctx, {segment.get()}, 10, 1, 14 * 60, "");

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Full, range.options[0].coverage);
}

TEST(MinimumLegalComplement, NoPairingRangeApplies7411SectorAdjustment) {
    auto ctx = makeContext();
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=7410";
    ctx->ruleList.clear();
    DBRule twoPilot = make7410Row(1, "2P", "15:00", "00:00-24:00");
    twoPilot.params["SECTORS UPPER"] = "2";
    ctx->ruleList.push_back(twoPilot);
    ctx->ruleList.push_back(make7410Row(2, "3P", "15:00", "00:00-24:00"));
    ctx->ruleList.push_back(make7410ControlRow());
    ctx->ruleList.push_back(make7411Row(1, "09:00", "99:00", "00:00-02:00", 2));
    ctx->ruleList.push_back(make7411Row(2, "09:00", "99:00", "02:01-24:00", 3));
    auto segment = makeSegment(
        ctx,
        "JNB",
        "SIN",
        "2025-01-03 10:00:00",
        "2025-01-03 20:00:00",
        {{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty(ctx, {segment.get()}, 11, 1, 14 * 60, "");

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Full, range.options[0].coverage);
}

TEST(MinimumLegalComplement, NoPairingRangeUses7413ToCompletePartial7410Coverage) {
    auto ctx = makeContext();
    configureJnbAcclimatizationMinimumComplement(ctx);
    ctx->ruleList.push_back(make7413Row(1, "2P", "15:00"));
    auto segment = makeSegment(
        ctx,
        "JNB",
        "SIN",
        "2025-01-03 10:00:00",
        "2025-01-03 20:00:00",
        {{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty(ctx, {segment.get()}, 11, 1, 14 * 60, "");

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Full, range.options[0].coverage);
}

TEST(MinimumLegalComplement, NoPairingRangeUsesExactReportGroupForPoCoveragePath) {
    auto ctx = makeContext();
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=7410";
    ctx->ruleList.clear();
    DBRule morningTwoPilot = make7410Row(1, "2P", "13:00", "00:00-24:00");
    morningTwoPilot.params["REST FACILITY"] = "0";
    morningTwoPilot.params["REPORT START"] = "00:00";
    morningTwoPilot.params["REPORT END"] = "11:59";
    DBRule eveningTwoPilot = make7410Row(2, "2P", "15:00", "00:00-24:00");
    eveningTwoPilot.params["REST FACILITY"] = "0";
    eveningTwoPilot.params["REPORT START"] = "12:00";
    eveningTwoPilot.params["REPORT END"] = "23:59";
    DBRule threePilot = make7410Row(3, "3P", "15:00", "00:00-24:00");
    threePilot.params["REST FACILITY"] = "0";
    ctx->ruleList.push_back(morningTwoPilot);
    ctx->ruleList.push_back(eveningTwoPilot);
    ctx->ruleList.push_back(threePilot);
    ctx->ruleList.push_back(make7410ControlRow());

    FLEET fleet{};
    fleet.fleet = "359";
    fleet.restfacility = 0;
    ctx->fleetMap[fleet.fleet] = fleet;

    auto morningSegment = makeSegment(
        ctx,
        "JNB",
        "SIN",
        "2025-01-03 04:00:00",
        "2025-01-03 14:00:00",
        {{"CPT", 1}, {"FO", 1}});
    morningSegment->setFleetCD("359");
    auto morningDuty = makeDuty(ctx, {morningSegment.get()}, 11, 1, 14 * 60, "");

    const MinimumLegalComplementRange morningRange = calculateRange(ctx, morningDuty.get());

    ASSERT_EQ(1, morningRange.options.size());
    EXPECT_EQ("3P", morningRange.options[0].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Full, morningRange.options[0].coverage);

    auto eveningSegment = makeSegment(
        ctx,
        "JNB",
        "SIN",
        "2025-01-03 10:00:00",
        "2025-01-03 20:00:00",
        {{"CPT", 1}, {"FO", 1}});
    eveningSegment->setFleetCD("359");
    auto eveningDuty = makeDuty(ctx, {eveningSegment.get()}, 12, 1, 14 * 60, "");

    const MinimumLegalComplementRange eveningRange = calculateRange(ctx, eveningDuty.get());

    ASSERT_EQ(1, eveningRange.options.size());
    EXPECT_EQ("2P", eveningRange.options[0].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Full, eveningRange.options[0].coverage);
}

TEST(MinimumLegalComplement, NoPairingRangeUses7413WhenExact7410GroupIsAboveMax) {
    auto ctx = makeContext();
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=7410";
    ctx->ruleList.clear();
    DBRule twoPilot = make7410Row(1, "2P", "13:00", "00:00-24:00");
    twoPilot.params["REST FACILITY"] = "0";
    ctx->ruleList.push_back(twoPilot);
    ctx->ruleList.push_back(make7410Row(2, "3P", "16:00", "00:00-24:00"));
    ctx->ruleList.push_back(make7410ControlRow());
    ctx->ruleList.push_back(make7413Row(1, "2P", "15:00"));

    FLEET fleet{};
    fleet.fleet = "359";
    fleet.restfacility = 0;
    ctx->fleetMap[fleet.fleet] = fleet;

    auto segment = makeSegment(
        ctx,
        "JNB",
        "SIN",
        "2025-01-03 10:00:00",
        "2025-01-03 20:00:00",
        {{"CPT", 1}, {"FO", 1}});
    segment->setFleetCD("359");
    auto duty = makeDuty(ctx, {segment.get()}, 11, 1, 14 * 60, "");

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("2P", range.options[0].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Full, range.options[0].coverage);
}

TEST(MinimumLegalComplement, NoPairingRangeReturnsUlrExemptionComposition) {
    auto ctx = makeContext();
    ctx->systemParamMap["MIN_LEGAL_COMPLEMENT_RULES"] = "SQ:P=7410";
    ctx->ruleList.clear();
    ctx->ruleList.push_back(make7410Row(1, "2P", "13:00", "00:00-24:00"));
    ctx->ruleList.push_back(make7410Row(2, "3P", "13:00", "00:00-24:00"));
    DBRule control = make7410ControlRow();
    control.params["ULR EXEMPTION COMPOSITION"] = "3P";
    control.params["ULR EXEMPTION REST FACILITY"] = "0";
    ctx->ruleList.push_back(control);
    auto segment = makeSegment(
        ctx,
        "JNB",
        "SIN",
        "2025-01-03 10:00:00",
        "2025-01-03 20:00:00",
        {{"CPT", 1}, {"FO", 1}});
    auto duty = makeDuty(ctx, {segment.get()}, 11, 1, 14 * 60, "");
    duty->setULR(true);

    const MinimumLegalComplementRange range = calculateRange(ctx, duty.get());

    ASSERT_EQ(1, range.options.size());
    EXPECT_EQ("3P", range.options[0].compositionName);
    EXPECT_EQ(MinimumLegalComplementCoverage::Full, range.options[0].coverage);
}

TEST(MinimumLegalComplement, PairingJsonOutputsMinimumLegalComplementRankValues) {
    auto ctx = makeContext();
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    duty->setMinimumLegalComplement({kComp3p, 1, false});
    auto pairing = makePairing({duty.get()});
    std::vector<Pairing*> pairings = {pairing.get()};
    std::map<long long, std::vector<RULE_VIOLATION*>> violations;
    std::ostringstream out;

    formatToJson_PairingList(out, pairings, violations, ctx.get());
    const std::string json = out.str();

    EXPECT_NE(std::string::npos, json.find("\"minimumLegalComplement\""));
    EXPECT_NE(std::string::npos, json.find("\"minimumLegalComplement\":{\n\t\t\t\"compositionId\":1002,"));
    EXPECT_NE(std::string::npos, json.find("\n\t\t\t\"optionId\":1,"));
    EXPECT_NE(std::string::npos, json.find("\n\t\t\t\"compositionName\":\"3P\","));
    EXPECT_NE(std::string::npos, json.find("\n\t\t\t\"from8091\":false,"));
    EXPECT_NE(std::string::npos, json.find("\n\t\t\t\"rankValueMap\":{\"CPT\":1,\"FO\":2}\n\t\t}"));
}

// Regression test: in editor mode, the min-legal-complement calculation
// temporarily sets the duty's composition to each candidate.  Verify that
// GetCompositionByDutyFor3 uses the duty's own complement map (set by
// applyCandidateToDuty) instead of deriving a different composition from
// the flight-to-pairing index, so candidates are tested against their
// real FDP limits.  Runs last to avoid cross-test contamination (SGPO-797).
TEST(MinimumLegalComplement, Z_EditorModeEscalatesToNextCompositionWhenFlightCompositionIllegal) {
    auto ctx = makeContext();
    configure7410MinimumComplement(ctx, "13:00", "15:00");
    auto segment = makeTimedSegment({{"CPT", 1}, {"FO", 1}});
    auto duty = makeTimedDuty({segment.get()}, 14 * 60);
    auto pairing = makePairing({duty.get()});

    calculatePairingMinimumComplements(ctx, pairing.get());

    const MinimalLegalComplementRef& result = duty->getMinimumLegalComplement();
    EXPECT_EQ(kComp3p, result.compositionId);
    EXPECT_EQ(1, result.optionId);
    EXPECT_FALSE(result.from8091);
}
