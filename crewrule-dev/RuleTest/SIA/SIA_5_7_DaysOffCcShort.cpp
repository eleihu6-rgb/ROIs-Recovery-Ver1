// SIA_SUITE_SUMMARY_START
// SuiteId: 5.7
// Name: Minimum Scheduled Days Off at Base – Cabin Crew
// SourceCsvRow: 5.7.,Minimum Scheduled Days Off at Base 每 Cabin Crew
// Status: PARTIAL
// ImplementedCases:
//   - Case #3: 9 base-local calendar days away -> 3 ATDOs (rule 7465).
//   - Case #4: SIN-BRU positioning + BRU-SIN operating -> 1 ATDO + 1 EXDO (rules 7465 + 7466).
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2026-01-07T18:48:48Z
// RemainingWork:
//   - Align fleet/service-type and EXDO flight-number filters with the production configuration once confirmed.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7465/CalculateMinScheDaysOffAtBaseForSQRule.h"
#include "RuleEngine/rule/rule7466/CalculateExtraDaysOffAtBaseForSQRule.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

namespace {

constexpr int kSinOffsetSeconds = 8 * 60 * 60;
constexpr int kSinOffsetMinutes = 8 * 60;
constexpr int kBruOffsetMinutes = 2 * 60;

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

time_t utcFromSinLocal(const std::string& localDateTime) {
    return utcFromString(localDateTime) - kSinOffsetSeconds;
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["SIN"] = 480;
    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
    ctx->airportUtcOffsetMap["BRU"] = 120;
    ctx->airportZoneIdMap["BRU"] = "Europe/Brussels";
    return ctx;
}

void registerFlight(const SharedPtr<CrewDataContext>& ctx,
                    long long dbId,
                    const std::string& fleet,
                    const std::string& serviceType) {
    auto flight = std::make_shared<Segment>();
    flight->setDBId(dbId);
    flight->setFleetCD(fleet);
    flight->setServiceType(serviceType);
    ctx->flightIdMap[dbId] = flight;
}

std::unique_ptr<Segment> makeSegment(long long dbId,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& flightNumber,
                                     const std::string& assignment,
                                     time_t startUtc,
                                     time_t endUtc,
                                     int depOffsetMinutes,
                                     int arrOffsetMinutes) {
    auto seg = std::make_unique<Segment>();
    seg->setDBId(dbId);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setFlightNumber(flightNumber);
    seg->setAssignment(assignment);
    seg->setIsOperating(assignment == "FLY" || assignment == "OPR");
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    const time_t startLoc = startUtc + static_cast<time_t>(depOffsetMinutes) * 60;
    const time_t endLoc = endUtc + static_cast<time_t>(arrOffsetMinutes) * 60;
    seg->setStartTimeLocAct(startLoc);
    seg->setEndTimeLocAct(endLoc);
    seg->setStartTimeLocSch(startLoc);
    seg->setEndTimeLocSch(endLoc);
    return seg;
}

void addDutyNode(Duty* duty, const std::string& node, int sequence, time_t timeUtc, time_t timeLoc) {
    auto pdn = std::make_shared<PairingDutyNode>();
    pdn->setType("DUTY");
    pdn->setNode(node);
    pdn->setSequence(sequence);
    pdn->setStartTimeUtcAct(timeUtc);
    pdn->setEndTimeUtcAct(timeUtc);
    pdn->setStartTimeLocAct(timeLoc);
    pdn->setEndTimeLocAct(timeLoc);
    duty->pairingDutyNodes.push_back(pdn);
}

std::unique_ptr<Duty> makeDutyWithNodes(const std::vector<Segment*>& segments,
                                        int dutySeq,
                                        time_t briefStartUtc,
                                        time_t debriefEndUtc,
                                        time_t dropoffEndUtc,
                                        int depOffsetMinutes,
                                        int arrOffsetMinutes) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setPairingId(1);
    duty->setDutySeq(dutySeq);
    duty->setDepartureStation(segments.front()->getDepSta());
    duty->setArrivalStation(segments.back()->getArrSta());
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
    duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
    duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
    addDutyNode(duty.get(),
                "BRIEF",
                1,
                briefStartUtc,
                briefStartUtc + static_cast<time_t>(depOffsetMinutes) * 60);
    addDutyNode(duty.get(),
                "DEBRIEF",
                2,
                debriefEndUtc,
                debriefEndUtc + static_cast<time_t>(arrOffsetMinutes) * 60);
    addDutyNode(duty.get(),
                "DROPOFF",
                3,
                dropoffEndUtc,
                dropoffEndUtc + static_cast<time_t>(arrOffsetMinutes) * 60);
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

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties,
                                     time_t pairingStartUtc,
                                     time_t pairingEndUtc) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase("SIN");
    pairing->setPrimeActivity("FLY");
    pairing->setStartTimeUtcAct(pairingStartUtc);
    pairing->setEndTimeUtcAct(pairingEndUtc);
    pairing->setStartTimeLocAct(pairingStartUtc + kSinOffsetSeconds);
    pairing->setEndTimeLocAct(pairingEndUtc + kSinOffsetSeconds);
    return pairing;
}

DBRule makeRule7465Row(int rowNum,
                       const std::string& copLengthRange,
                       int minDaysOff,
                       const std::string& doStartsAfter = "") {
    DBRule rule{};
    rule.idRule = 7465000 + rowNum;
    rule.function = 7465;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 7465000 + rowNum;
    rule.overridebility = "S";
    rule.reference = "SIA";
    rule.severity = 2;
    rule.params["COP LENGTH RANGE"] = copLengthRange;
    rule.params["MIN DAYS OFF"] = std::to_string(minDaysOff);
    if (!doStartsAfter.empty()) {
        rule.params["DO STARTS AFTER"] = doStartsAfter;
    }
    return rule;
}

DBRule makeRule7466Row(int rowNum,
                       const std::string& slipStation,
                       const std::string& slipArrIsOperating,
                       const std::string& slipDepIsOperating,
                       const std::string& slipLocalNightRange,
                       const std::string& copStartDow,
                       const std::string& flightNumbers,
                       const std::string& periodStart,
                       const std::string& periodEnd,
                       int extraDaysOff) {
    DBRule rule{};
    rule.idRule = 7466000 + rowNum;
    rule.function = 7466;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 7466000 + rowNum;
    rule.overridebility = "S";
    rule.reference = "SIA";
    rule.severity = 2;
    rule.params["SLIP STATION"] = slipStation;
    rule.params["SLIP ARR IS OPERATING"] = slipArrIsOperating;
    rule.params["SLIP DEP IS OPERATING"] = slipDepIsOperating;
    rule.params["SLIP LOCAL NIGHT RANGE"] = slipLocalNightRange;
    rule.params["COP START DOW"] = copStartDow;
    rule.params["FLIGHT NUMBERS"] = flightNumbers;
    rule.params["PERIOD START DATE"] = periodStart;
    rule.params["PERIOD END DATE"] = periodEnd;
    rule.params["EXTRA DAYS OFF"] = std::to_string(extraDaysOff);
    return rule;
}

}  // namespace

class Sia57MinScheduledDaysOffCabinCrewShortTest : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    SIATest::SiaRuleParamGuard _paramGuard;
};

TEST_F(Sia57MinScheduledDaysOffCabinCrewShortTest, Case3_NineDaysAway_RequiresThreeAtdo) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 56021, "333", "J");
    registerFlight(ctx, 56022, "333", "J");

    const time_t firstBriefUtc = utcFromSinLocal("2025-03-01 00:00:00");
    const time_t lastDebriefUtc = utcFromSinLocal("2025-03-09 00:00:00");
    const time_t lastDropoffUtc = lastDebriefUtc;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(56021, "SIN", "SIN", "26", "FLY",
                                   firstBriefUtc, firstBriefUtc + 3600,
                                   kSinOffsetMinutes, kSinOffsetMinutes));
    segments.push_back(makeSegment(56022, "SIN", "SIN", "25", "FLY",
                                   lastDebriefUtc - 3600, lastDebriefUtc,
                                   kSinOffsetMinutes, kSinOffsetMinutes));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()}, 1,
                                       firstBriefUtc, firstBriefUtc + 3600, firstBriefUtc + 3600,
                                       kSinOffsetMinutes, kSinOffsetMinutes));
    duties.push_back(makeDutyWithNodes({segments[1].get()}, 2,
                                       lastDebriefUtc - 3600, lastDebriefUtc, lastDropoffUtc,
                                       kSinOffsetMinutes, kSinOffsetMinutes));

    auto pairing = makePairing(asRaw(duties), firstBriefUtc, lastDebriefUtc);

    RuleInput input;
    input.dbRules.push_back(makeRule7465Row(1, "9-9", 3));
    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    EXPECT_EQ(duties.back()->getMinRestAtBase(), 3 * 24 * 60);
}

TEST_F(Sia57MinScheduledDaysOffCabinCrewShortTest, Case3_NineDaysAway_DebriefNxdoTreatsExactMidnightAsNextDay) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 56121, "333", "J");
    registerFlight(ctx, 56122, "333", "J");

    const time_t firstBriefUtc = utcFromSinLocal("2025-03-01 00:00:00");
    const time_t lastDebriefUtc = utcFromSinLocal("2025-03-09 00:00:00");
    const time_t lastDropoffUtc = lastDebriefUtc;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(56121, "SIN", "SIN", "26", "FLY",
                                   firstBriefUtc, firstBriefUtc + 3600,
                                   kSinOffsetMinutes, kSinOffsetMinutes));
    segments.push_back(makeSegment(56122, "SIN", "SIN", "25", "FLY",
                                   lastDebriefUtc - 3600, lastDebriefUtc,
                                   kSinOffsetMinutes, kSinOffsetMinutes));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()}, 1,
                                       firstBriefUtc, firstBriefUtc + 3600, firstBriefUtc + 3600,
                                       kSinOffsetMinutes, kSinOffsetMinutes));
    duties.push_back(makeDutyWithNodes({segments[1].get()}, 2,
                                       lastDebriefUtc - 3600, lastDebriefUtc, lastDropoffUtc,
                                       kSinOffsetMinutes, kSinOffsetMinutes));

    auto pairing = makePairing(asRaw(duties), firstBriefUtc, lastDebriefUtc);

    RuleInput input;
    input.dbRules.push_back(makeRule7465Row(1, "9-9", 3, "DEBRIEF_NXDO"));
    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    EXPECT_EQ(duties.back()->getMinRestAtBase(), 4 * 24 * 60);
}

TEST_F(Sia57MinScheduledDaysOffCabinCrewShortTest, Case4_PositioningPlusOperating_AddsOneExdo) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 56031, "333", "J");
    registerFlight(ctx, 56032, "333", "J");

    // Model a 3-day pairing (inclusive) and trigger EXDO via the operating flight number "303".
    const time_t firstBriefUtc = utcFromSinLocal("2025-04-01 00:00:00");
    const time_t lastDebriefUtc = utcFromSinLocal("2025-04-03 00:00:00");
    const time_t lastDropoffUtc = lastDebriefUtc;

    std::vector<std::unique_ptr<Segment>> segments;
    // Day 1 positioning: SIN-BRU SQ304 (assignment not operating for 7466's filter).
    segments.push_back(makeSegment(56031, "SIN", "BRU", "304", "DHD",
                                   firstBriefUtc, firstBriefUtc + 3600,
                                   kSinOffsetMinutes, kBruOffsetMinutes));
    // Day 3 operating: BRU-SIN SQ303 (assignment FLY so 7466 can match FLIGHT NUMBERS=303).
    segments.push_back(makeSegment(56032, "BRU", "SIN", "303", "FLY",
                                   lastDebriefUtc - 3600, lastDebriefUtc,
                                   kBruOffsetMinutes, kSinOffsetMinutes));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()}, 1,
                                       firstBriefUtc, firstBriefUtc + 3600, firstBriefUtc + 3600,
                                       kSinOffsetMinutes, kBruOffsetMinutes));
    duties.push_back(makeDutyWithNodes({segments[1].get()}, 2,
                                       lastDebriefUtc - 3600, lastDebriefUtc, lastDropoffUtc,
                                       kBruOffsetMinutes, kSinOffsetMinutes));

    auto pairing = makePairing(asRaw(duties), firstBriefUtc, lastDebriefUtc);

    // Apply ATDO first (7465), then EXDO (7466) on top.
    RuleInput input7465;
    input7465.dbRules.push_back(makeRule7465Row(1, "3-3", 1));
    CalculateMinScheDaysOffAtBaseForSQRule rule7465(nullptr, input7465);
    rule7465.setDataContext(ctx);
    rule7465.setApplication(PAIRING_EDITOR);
    rule7465.CalculateDuty(pairing.get());

    RuleInput input7466;
    input7466.dbRules.push_back(makeRule7466Row(1,
                                                "*",
                                                "*",
                                                "*",
                                                "0-99",
                                                "1-7",
                                                "303",
                                                "1970-01-01 00:00:00",
                                                "2099-12-31 00:00:00",
                                                1));
    CalculateExtraDaysOffAtBaseForSQRule rule7466(nullptr, input7466);
    rule7466.setDataContext(ctx);
    rule7466.setApplication(PAIRING_EDITOR);
    rule7466.CalculateDuty(pairing.get());

    // 1 ATDO + 1 EXDO => 2 full days off when rest start is aligned to midnight.
    EXPECT_EQ(duties.back()->getMinRestAtBase(), 2 * 24 * 60);
}
