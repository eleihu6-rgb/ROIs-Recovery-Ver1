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
#include <map>
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
                                     bool isOperating,
                                     const std::map<std::string, int>& planComp = {}) {
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
    if (!planComp.empty()) {
        seg->setPlanComposition(planComp);
        seg->resetOpenComposition(planComp);
    }
    return seg;
}

std::unique_ptr<Duty> makeDuty(const SharedPtr<CrewDataContext>& ctx,
                               int pairingId,
                               int dutyId,
                               int dutySeq,
                               const std::vector<Segment*>& segments,
                               const std::string& assignment = "FLY",
                               const std::string& composition = "",
                               const std::string& fleet = "",
                               int fdpMinutes = 0) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setId(dutyId);
    duty->setPairingId(pairingId);
    duty->setDutySeq(dutySeq);
    duty->setAssignment(assignment);
    duty->setCompositionName(composition);
    duty->setFltCD(fleet);
    if (fdpMinutes > 0) {
        duty->setFDPInSecs(fdpMinutes * 60);
    }
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

DBRule make7450RuleRow() {
    DBRule row{};
    row.idRule = 7450001;
    row.function = RULES::SQ_CA_FDP_SECTOR_LIMIT;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7450001;
    row.overridebility = "S";
    row.reference = "SQ";
    row.category = "Duty";
    row.params["COMPOSITION"] = "4P";
    row.params["FDP LOWER"] = "00:00";
    row.params["FDP UPPER"] = "99:00";
    row.params["MAX SECTORS"] = "1";
    return row;
}

DBRule make7450ControlRow() {
    DBRule row{};
    row.idRule = 7450001;
    row.function = RULES::SQ_CA_FDP_SECTOR_LIMIT;
    row.tableNum = 2;
    row.rowNum = 1;
    row.idRuleParam = 7450020;
    row.overridebility = "S";
    row.reference = "SQ";
    row.category = "Duty";
    row.params["SERVICE TYPE"] = "*";
    row.params["FLEET GROUP"] = "*";
    row.params["COUNT DEADHEAD SECTORS"] = "Y";
    row.params["EXCLUDE FINAL DEADHEAD SECTORS"] = "Y";
    return row;
}

DBRule make7460RuleRow(const std::string& totalNumberInPairing = "0") {
    DBRule row{};
    row.idRule = 7460001;
    row.function = RULES::RESTRICT_MID_DUTY_BASE_TURN;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7460001;
    row.overridebility = "S";
    row.reference = "SQ";
    row.category = "Duty";
    row.severity = 2;
    row.params["DUTY START STATION"] = "*";
    row.params["DUTY END STATION"] = "*";
    row.params["ACTIVE"] = "Y";
    row.params["TOTAL NUMBER IN PAIRING"] = totalNumberInPairing;
    return row;
}

DBRule make7462RuleRow(const std::string& dutyAssignment = "FLY",
                       const std::string& serviceType = "F",
                       const std::string& allowedSectors = "SYD-AKL-MEL") {
    DBRule row{};
    row.idRule = 7462001;
    row.function = RULES::CHECK_ALLOWED_MULTI_SECTOR_DUTY_FOR_FREIGHTER_FOR_SQ;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7462001;
    row.overridebility = "S";
    row.reference = "SQ";
    row.category = "Duty";
    row.severity = 2;
    row.params["SERVICE TYPE"] = serviceType;
    row.params["SEGMENT NUMBER IN DUTY"] = "2-99";
    row.params["ALLOWED SECTORS"] = allowedSectors;
    row.params["DUTY OPERATING TYPE"] = dutyAssignment;
    return row;
}

DBRule make7469RuleRow() {
    DBRule row{};
    row.idRule = 7469001;
    row.function = RULES::FORCED_COMPLEMENT_BY_DUTY_ROUTE_FOR_SQ;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7469001;
    row.overridebility = "S";
    row.reference = "SQ";
    row.category = "Duty";
    row.severity = 2;
    row.params["DUTY ROUTES"] = "SIN-HKG-SHJ";
    row.params["SERVICE TYPES"] = "F";
    row.params["FLEETS"] = "77F";
    row.params["FLEET GROUPS"] = "B77F";
    row.params["COMPOSITIONS"] = "4P";
    row.params["RANK PLAN"] = "CAP:2+FO:2";
    return row;
}

}  // namespace

class SqDutyDispatchApiTest : public ::testing::Test {
protected:
    SqDutyDispatchApiTest()
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

TEST_F(SqDutyDispatchApiTest, CheckPGRulesPairingDispatchesRule7450) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"BOM", 330, "Asia/Kolkata"},
    });

    FLEET fleet{};
    fleet.fleet = "77F";
    fleet.fleetGrp = "B77F";
    ctx->fleetMap["77F"] = fleet;

    configureChecker(ctx, {make7450RuleRow(), make7450ControlRow()});

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "SIN", "BOM", "SQ421", "FLY", "F", "77F",
                                       "2026-03-01 00:00:00", "2026-03-01 05:00:00", true));
    segmentStore.push_back(makeSegment(ctx, 1, 1, 2, "BOM", "SIN", "SQ422", "FLY", "F", "77F",
                                       "2026-03-01 07:00:00", "2026-03-01 12:00:00", true));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get(), segmentStore[1].get()},
                                 "FLY",
                                 "4P",
                                 "77F",
                                 14 * 60));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_FALSE(_checker.checkPGRules(pairing.get(), {RULES::SQ_CA_FDP_SECTOR_LIMIT}));
}

TEST_F(SqDutyDispatchApiTest, CheckPGRulesPairingDispatchesRule7460) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"XMN", 480, "Asia/Shanghai"},
        {"COK", 330, "Asia/Kolkata"},
    });
    addBase(ctx, "SIN");

    configureChecker(ctx, {make7460RuleRow()});

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "XMN", "SIN", "SQ8601", "FLY", "J", "359",
                                       "2026-03-02 00:00:00", "2026-03-02 04:00:00", true));
    segmentStore.push_back(makeSegment(ctx, 1, 1, 2, "SIN", "COK", "SQ8602", "FLY", "J", "359",
                                       "2026-03-02 06:00:00", "2026-03-02 10:00:00", true));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get(), segmentStore[1].get()},
                                 "FLY",
                                 "CP",
                                 "359"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_FALSE(_checker.checkPGRules(pairing.get(), {RULES::RESTRICT_MID_DUTY_BASE_TURN}));
}

TEST_F(SqDutyDispatchApiTest, CheckPGRulesPairingAllowsConfiguredRule7460DutyCount) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"XMN", 480, "Asia/Shanghai"},
        {"COK", 330, "Asia/Kolkata"},
    });
    addBase(ctx, "SIN");

    configureChecker(ctx, {make7460RuleRow("1")});

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "XMN", "SIN", "SQ8601", "FLY", "J", "359",
                                       "2026-03-02 00:00:00", "2026-03-02 04:00:00", true));
    segmentStore.push_back(makeSegment(ctx, 1, 1, 2, "SIN", "COK", "SQ8602", "FLY", "J", "359",
                                       "2026-03-02 06:00:00", "2026-03-02 10:00:00", true));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get(), segmentStore[1].get()},
                                 "FLY",
                                 "CP",
                                 "359"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_TRUE(_checker.checkPGRules(pairing.get(), {RULES::RESTRICT_MID_DUTY_BASE_TURN}));
}

TEST_F(SqDutyDispatchApiTest, CheckPGRulesPairingDispatchesRule7460ByPairingCountWhenConfigured) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"XMN", 480, "Asia/Shanghai"},
        {"COK", 330, "Asia/Kolkata"},
    });
    addBase(ctx, "SIN");

    configureChecker(ctx, {make7460RuleRow("1")});

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "XMN", "SIN", "SQ8601", "FLY", "J", "359",
                                       "2026-03-02 00:00:00", "2026-03-02 04:00:00", true));
    segmentStore.push_back(makeSegment(ctx, 1, 1, 2, "SIN", "COK", "SQ8602", "FLY", "J", "359",
                                       "2026-03-02 06:00:00", "2026-03-02 10:00:00", true));
    segmentStore.push_back(makeSegment(ctx, 1, 2, 1, "XMN", "SIN", "SQ8603", "FLY", "J", "359",
                                       "2026-03-03 00:00:00", "2026-03-03 04:00:00", true));
    segmentStore.push_back(makeSegment(ctx, 1, 2, 2, "SIN", "COK", "SQ8604", "FLY", "J", "359",
                                       "2026-03-03 06:00:00", "2026-03-03 10:00:00", true));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get(), segmentStore[1].get()},
                                 "FLY",
                                 "CP",
                                 "359"));
    dutyStore.push_back(makeDuty(ctx, 1, 2, 2,
                                 {segmentStore[2].get(), segmentStore[3].get()},
                                 "FLY",
                                 "CP",
                                 "359"));

    auto pairing = makePairing({dutyStore[0].get(), dutyStore[1].get()}, "SIN", ctx.get(), 1);
    EXPECT_FALSE(_checker.checkPGRules(pairing.get(), {RULES::RESTRICT_MID_DUTY_BASE_TURN}));
}

TEST_F(SqDutyDispatchApiTest, CheckPGRulesPairingDispatchesRule7462) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"CAN", 480, "Asia/Shanghai"},
    });

    configureChecker(ctx, {make7462RuleRow()});

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "SIN", "CAN", "SQ8701", "FLY", "F", "77F",
                                       "2026-03-03 00:00:00", "2026-03-03 04:00:00", true));
    segmentStore.push_back(makeSegment(ctx, 1, 1, 2, "CAN", "SIN", "SQ8702", "FLY", "F", "77F",
                                       "2026-03-03 06:00:00", "2026-03-03 10:00:00", true));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get(), segmentStore[1].get()},
                                 "FLY",
                                 "4P",
                                 "77F"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_FALSE(_checker.checkPGRules(pairing.get(), {RULES::CHECK_ALLOWED_MULTI_SECTOR_DUTY_FOR_FREIGHTER_FOR_SQ}));
}

TEST_F(SqDutyDispatchApiTest, CheckPGRulesPairingDispatchesRule7462AllowsAnyMixedDutyWhenWhitelistRowMatches) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"CAN", 480, "Asia/Shanghai"},
        {"HKG", 480, "Asia/Hong_Kong"},
    });

    configureChecker(ctx, {make7462RuleRow("ANY", "*", "SIN-CAN-HKG")});

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "SIN", "CAN", "SQ8701", "FLY", "F", "77F",
                                       "2026-03-03 00:00:00", "2026-03-03 04:00:00", true));
    segmentStore.push_back(makeSegment(ctx, 1, 1, 2, "CAN", "HKG", "SQ8702", "DHD", "", "77F",
                                       "2026-03-03 06:00:00", "2026-03-03 10:00:00", false));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get(), segmentStore[1].get()},
                                 "MVP",
                                 "77F"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_TRUE(_checker.checkPGRules(pairing.get(), {RULES::CHECK_ALLOWED_MULTI_SECTOR_DUTY_FOR_FREIGHTER_FOR_SQ}));
}

TEST_F(SqDutyDispatchApiTest, CheckPGRulesPairingDispatchesRule7469) {
    auto ctx = buildDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"HKG", 480, "Asia/Hong_Kong"},
        {"SHJ", 240, "Asia/Dubai"},
    });

    FLEET fleet{};
    fleet.fleet = "77F";
    fleet.fleetGrp = "B77F";
    ctx->fleetMap["77F"] = fleet;

    RANK cap{};
    cap.rank = "CAP";
    cap.division = "P";
    cap.isMustCrewRank = true;
    ctx->rankMap["CAP"] = cap;

    RANK fo{};
    fo.rank = "FO";
    fo.division = "P";
    fo.isMustCrewRank = true;
    ctx->rankMap["FO"] = fo;

    configureChecker(ctx, {make7469RuleRow()});

    std::vector<std::unique_ptr<Segment>> segmentStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    std::map<std::string, int> firstSegmentPlan = {{"CAP", 2}, {"FO", 2}};
    std::map<std::string, int> secondSegmentPlan = {{"CAP", 2}, {"FO", 1}};

    segmentStore.push_back(makeSegment(ctx, 1, 1, 1, "SIN", "HKG", "7801", "FLY", "F", "77F",
                                       "2026-03-04 00:00:00", "2026-03-04 06:00:00", true, firstSegmentPlan));
    segmentStore.push_back(makeSegment(ctx, 1, 1, 2, "HKG", "SHJ", "7802", "FLY", "F", "77F",
                                       "2026-03-04 08:00:00", "2026-03-04 14:00:00", true, secondSegmentPlan));
    dutyStore.push_back(makeDuty(ctx, 1, 1, 1,
                                 {segmentStore[0].get(), segmentStore[1].get()},
                                 "FLY",
                                 "4P",
                                 "77F"));

    auto pairing = makePairing({dutyStore[0].get()}, "SIN", ctx.get(), 1);
    EXPECT_FALSE(_checker.checkPGRules(pairing.get(), {RULES::FORCED_COMPLEMENT_BY_DUTY_ROUTE_FOR_SQ}));
}
