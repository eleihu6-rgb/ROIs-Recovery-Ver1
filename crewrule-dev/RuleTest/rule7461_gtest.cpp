#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngineDef.h"
#include "db/PairingUtil.h"
#include "db/RuleParams.h"
#include "CrewDB.h"
#include "Duty.h"
#include "Pairing.h"
#include "Segment.h"
#include "orUtil/UtilFunc.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

struct AirportConfig {
    const char* code;
    int utcOffsetMinutes;
    const char* zoneId;
};

SharedPtr<CrewDataContext> buildDataContext(const std::vector<AirportConfig>& airports) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    for (const auto& airport : airports) {
        DBAirport rec{};
        std::strncpy(rec.airport, airport.code, sizeof(rec.airport) - 1);
        std::strncpy(rec.zoneId, airport.zoneId, sizeof(rec.zoneId) - 1);
        ctx->airportList.push_back(rec);
        ctx->airportUtcOffsetMap[airport.code] = airport.utcOffsetMinutes;
        ctx->airportZoneIdMap[airport.code] = airport.zoneId;
    }
    return ctx;
}

void addBase(const SharedPtr<CrewDataContext>& ctx, const std::string& base) {
    BASE baseRec;
    baseRec.airline = "SQ";
    baseRec.base = base;
    baseRec.baseId = static_cast<int>(ctx->baseList.size()) + 1;
    ctx->baseList.push_back(baseRec);
    ctx->scenario.bases.push_back(base);
}

std::unique_ptr<Segment> makeSegment(const SharedPtr<CrewDataContext>& ctx,
                                     int pairingId,
                                     int dutyId,
                                     int segSeq,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& flightNumber,
                                     const std::string& assignment,
                                     const std::string& serviceType,
                                     const std::string& fleet,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     bool isOperating) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    const int depOffsetMinutes = ctx->airportUtcOffsetMap.at(dep);
    const int arrOffsetMinutes = ctx->airportUtcOffsetMap.at(arr);

    seg->setPairingId(pairingId);
    seg->setDutyId(dutyId);
    seg->setSegSeq(segSeq);
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setAirline("SQ");
    seg->setFlightNumber(flightNumber);
    seg->setAssignment(assignment);
    seg->setServiceType(serviceType);
    seg->setFleetCD(fleet);
    seg->setIsOperating(isOperating);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocAct(start + static_cast<time_t>(depOffsetMinutes) * 60);
    seg->setEndTimeLocAct(end + static_cast<time_t>(arrOffsetMinutes) * 60);
    seg->setStartTimeLocSch(seg->getStartTimeLocAct());
    seg->setEndTimeLocSch(seg->getEndTimeLocAct());
    return seg;
}

std::unique_ptr<Duty> makeDuty(const SharedPtr<CrewDataContext>& ctx,
                               int pairingId,
                               int dutyId,
                               int dutySeq,
                               const std::vector<Segment*>& segments,
                               const std::string& assignment,
                               const std::string& fleet) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setId(dutyId);
    duty->setPairingId(pairingId);
    duty->setDutySeq(dutySeq);
    duty->setAssignment(assignment);
    duty->setFltCD(fleet);
    if (!segments.empty()) {
        duty->setDepartureStation(segments.front()->getDepStationRead());
        duty->setArrivalStation(segments.back()->getArrStationRead());
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
        duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch());
        duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch());
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
        duty->setStartTimeLocSch(segments.front()->getStartTimeLocSch());
        duty->setEndTimeLocSch(segments.back()->getEndTimeLocSch());
        duty->setRefTimeZone(ctx->airportUtcOffsetMap.at(segments.front()->getDepStationRead()));
    }
    duty->resetTypeBySegments();
    return duty;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties,
                                     const std::string& base,
                                     CrewDataContext* ctx,
                                     int pairingId = 1) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setId(pairingId);
    pairing->setBase(base);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
        pairing->setStartTimeUtcSch(duties.front()->getStartTimeUtcSch());
        pairing->setEndTimeUtcSch(duties.back()->getEndTimeUtcSch());
        pairing->setStartTimeLocAct(duties.front()->getStartTimeLocAct());
        pairing->setEndTimeLocAct(duties.back()->getEndTimeLocAct());
        pairing->setStartTimeLocSch(duties.front()->getStartTimeLocSch());
        pairing->setEndTimeLocSch(duties.back()->getEndTimeLocSch());
    }
    createPairingNodeOfDuty(pairing.get(), ctx);
    return pairing;
}

DBRule make7461RuleRow(const std::string& isHomeBase) {
    DBRule row{};
    row.idRule = 7461001;
    row.function = RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7461001;
    row.overridebility = "S";
    row.reference = "SQ";
    row.category = "Duty";
    row.severity = 2;
    row.params["IS HOME BASE"] = isHomeBase;
    row.params["DEADHEAD AND POSITIONING ASSIGNMENTS"] = "DHD|MVP";
    row.params["FREIGHT FLEET TYPES"] = "77F|77X";
    return row;
}

}  // namespace

class Rule7461Test : public ::testing::Test {
protected:
    Rule7461Test()
        : _checker(PAIRING_OPTIMIZER, false) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_OPTIMIZER);
    }

    void configureChecker(const SharedPtr<CrewDataContext>& dataContext,
                          const std::vector<DBRule>& rules) {
        _dataContext = dataContext;
        _dataContext->ruleList = rules;
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

TEST_F(Rule7461Test, PairingDispatchUsesActualBaseForDutyLocalFreighterDeadhead) {
    auto ctx = buildDataContext({
        {"BKK", 420, "Asia/Bangkok"},
        {"SIN", 480, "Asia/Singapore"},
        {"ICN", 540, "Asia/Seoul"},
    });
    addBase(ctx, "SIN");

    configureChecker(ctx, {make7461RuleRow("Y")});

    auto passengerAlt = makeSegment(ctx, 99, 99, 1, "SIN", "ICN", "600", "FLY", "J", "787",
                                    "2026-03-04 00:00:00", "2026-03-04 06:00:00", true);
    ctx->flightIdMap[600] = std::shared_ptr<Segment>(passengerAlt.release());

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "BKK", "SIN", "901", "FLY", "J", "787",
                                       "2026-03-03 12:00:00", "2026-03-03 14:00:00", true));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get()},
                                 "FLY",
                                 "787"));

    segmentStore.push_back(makeSegment(ctx, 1, 2, 1, "SIN", "ICN", "7444", "DHD", "F", "77F",
                                       "2026-03-04 01:00:00", "2026-03-04 07:00:00", false));
    dutyStore.push_back(makeDuty(ctx, 1, 2, 2,
                                 {segmentStore[1].get()},
                                 "DHD",
                                 "77F"));

    auto pairing = makePairing({dutyStore[0].get(), dutyStore[1].get()}, "SIN", ctx.get(), 1);
    EXPECT_FALSE(_checker.checkPGRules(pairing.get(), {RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ}));
}

TEST_F(Rule7461Test, PairingDispatchAllowsFreighterDeadheadWithoutPassengerAlternative) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"ICN", 540, "Asia/Seoul"},
    });
    addBase(ctx, "SIN");

    configureChecker(ctx, {make7461RuleRow("Y")});

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "SIN", "ICN", "7444", "DHD", "F", "77F",
                                       "2026-03-04 01:00:00", "2026-03-04 07:00:00", false));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get()},
                                 "DHD",
                                 "77F"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_TRUE(_checker.checkPGRules(pairing.get(), {RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ}));
}

TEST_F(Rule7461Test, MultiDeadheadChainWithSameFlightNumberAlternative) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"HKG", 480, "Asia/Hong_Kong"},
        {"LAX", -480, "America/Los_Angeles"},
    });
    addBase(ctx, "SIN");

    configureChecker(ctx, {make7461RuleRow("Y")});

    // Same flight number SQ012 for both legs: SIN-HKG + HKG-LAX (through-flight)
    auto altFirst = makeSegment(ctx, 99, 99, 1, "SIN", "HKG", "012", "FLY", "J", "787",
                                "2026-03-04 03:00:00", "2026-03-04 07:00:00", true);
    auto altSecond = makeSegment(ctx, 99, 99, 2, "HKG", "LAX", "012", "FLY", "J", "787",
                                 "2026-03-04 08:30:00", "2026-03-04 18:30:00", true);
    ctx->pairingInputFerrys.push_back(altFirst.release());
    ctx->pairingInputFerrys.push_back(altSecond.release());

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty with 2 deadhead segments: SIN-HKG (passenger DHD) + HKG-LAX (freight DHD)
    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "SIN", "HKG", "7444", "DHD", "J", "787",
                                       "2026-03-04 02:00:00", "2026-03-04 06:00:00", false));
    segmentStore.push_back(makeSegment(ctx, 1, 1, 2, "HKG", "LAX", "7410", "DHD", "F", "77F",
                                       "2026-03-04 08:00:00", "2026-03-04 18:00:00", false));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get(), segmentStore[1].get()},
                                 "DHD",
                                 "77F"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_FALSE(_checker.checkPGRules(pairing.get(), {RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ}));
}

TEST_F(Rule7461Test, MultiDeadheadChainDoesNotUseDifferentFlightNumbers) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"HKG", 480, "Asia/Hong_Kong"},
        {"LAX", -480, "America/Los_Angeles"},
    });
    addBase(ctx, "SIN");

    configureChecker(ctx, {make7461RuleRow("Y")});

    // Different flight numbers SQ600 + SQ601 — should NOT match as alternative
    auto altFirst = makeSegment(ctx, 99, 99, 1, "SIN", "HKG", "600", "FLY", "J", "787",
                                "2026-03-04 03:00:00", "2026-03-04 07:00:00", true);
    auto altSecond = makeSegment(ctx, 99, 99, 2, "HKG", "LAX", "601", "FLY", "J", "787",
                                 "2026-03-04 08:30:00", "2026-03-04 18:30:00", true);
    ctx->flightIdMap[600] = std::shared_ptr<Segment>(altFirst.release());
    ctx->flightIdMap[601] = std::shared_ptr<Segment>(altSecond.release());

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Duty with 2 deadhead segments: SIN-HKG (passenger DHD) + HKG-LAX (freight DHD)
    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "SIN", "HKG", "7444", "DHD", "J", "787",
                                       "2026-03-04 02:00:00", "2026-03-04 06:00:00", false));
    segmentStore.push_back(makeSegment(ctx, 1, 1, 2, "HKG", "LAX", "7410", "DHD", "F", "77F",
                                       "2026-03-04 08:00:00", "2026-03-04 18:00:00", false));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get(), segmentStore[1].get()},
                                 "DHD",
                                 "77F"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_TRUE(_checker.checkPGRules(pairing.get(), {RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ}));
}

TEST_F(Rule7461Test, SingleFreightDeadheadWithSameFlightNumberMultiLegAlternative) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"HKG", 480, "Asia/Hong_Kong"},
        {"LAX", -480, "America/Los_Angeles"},
    });
    addBase(ctx, "SIN");

    configureChecker(ctx, {make7461RuleRow("Y")});

    // Same flight number SQ012 for both legs: SIN-HKG and HKG-LAX (through-flight)
    auto altFirst = makeSegment(ctx, 99, 99, 1, "SIN", "HKG", "012", "FLY", "J", "787",
                                "2026-03-04 03:00:00", "2026-03-04 07:00:00", true);
    auto altSecond = makeSegment(ctx, 99, 99, 2, "HKG", "LAX", "012", "FLY", "J", "787",
                                 "2026-03-04 08:30:00", "2026-03-04 18:30:00", true);
    ctx->pairingInputFerrys.push_back(altFirst.release());
    ctx->pairingInputFerrys.push_back(altSecond.release());

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Single freight deadhead: SIN-LAX on freighter
    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "SIN", "LAX", "7444", "DHD", "F", "77F",
                                       "2026-03-04 02:00:00", "2026-03-04 18:00:00", false));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get()},
                                 "DHD",
                                 "77F"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_FALSE(_checker.checkPGRules(pairing.get(), {RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ}));
}

TEST_F(Rule7461Test, SingleFreightDeadheadDoesNotUseDifferentFlightNumbers) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"HKG", 480, "Asia/Hong_Kong"},
        {"LAX", -480, "America/Los_Angeles"},
    });
    addBase(ctx, "SIN");

    configureChecker(ctx, {make7461RuleRow("Y")});

    // Different flight numbers: SQ001 SIN-HKG + SQ002 HKG-LAX — should NOT count as 1 flight
    auto altFirst = makeSegment(ctx, 99, 99, 1, "SIN", "HKG", "001", "FLY", "J", "787",
                                "2026-03-04 03:00:00", "2026-03-04 07:00:00", true);
    auto altSecond = makeSegment(ctx, 99, 99, 2, "HKG", "LAX", "002", "FLY", "J", "787",
                                 "2026-03-04 08:30:00", "2026-03-04 18:30:00", true);
    ctx->flightIdMap[1] = std::shared_ptr<Segment>(altFirst.release());
    ctx->flightIdMap[2] = std::shared_ptr<Segment>(altSecond.release());

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    // Single freight deadhead: SIN-LAX on freighter
    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "SIN", "LAX", "7444", "DHD", "F", "77F",
                                       "2026-03-04 02:00:00", "2026-03-04 18:00:00", false));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get()},
                                 "DHD",
                                 "77F"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_TRUE(_checker.checkPGRules(pairing.get(), {RULES::CHECK_DHD_AND_POSITIONING_ON_FREIGHTER_FOR_SQ}));
}
