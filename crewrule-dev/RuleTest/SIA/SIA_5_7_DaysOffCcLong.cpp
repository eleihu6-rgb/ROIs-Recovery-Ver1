// SIA_SUITE_SUMMARY_START
// SuiteId: 5.7
// Name: Minimum Scheduled Days Off at Base – Cabin Crew
// SourceCsvRow: 5.7.,Minimum Scheduled Days Off at Base 每 Cabin Crew
// Status: PARTIAL
// ImplementedCases:
//   - Case #1: 13 base-local calendar days away -> 4 ATDOs (rule 7465).
//   - Case #2: 15 base-local calendar days away -> 5 ATDOs (rule 7465).
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2026-01-07T18:48:48Z
// RemainingWork:
//   - Add Case #3 (9 days away -> 3 ATDOs) and Case #4 (1 ATDO + 1 EXDO) in the companion short-COP suite file.
//   - Replace synthetic pairing windows with COP-derived duty nodes once a SIA pairing builder is available for these patterns.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7465/CalculateMinScheDaysOffAtBaseForSQRule.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

namespace {

constexpr int kSinOffsetSeconds = 8 * 60 * 60;
constexpr int kSinOffsetMinutes = 8 * 60;

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

time_t utcFromSinLocal(const std::string& localDateTime) {
    // Treat the input as "local", then convert to UTC by subtracting SIN's offset.
    return utcFromString(localDateTime) - kSinOffsetSeconds;
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["SIN"] = 480;
    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
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
                                     time_t startUtc,
                                     time_t endUtc,
                                     int depOffsetMinutes,
                                     int arrOffsetMinutes) {
    auto seg = std::make_unique<Segment>();
    seg->setDBId(dbId);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
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
    seg->setAssignment("FLY");
    seg->setIsOperating(true);
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

DBRule makeRule7465Row(int rowNum, const std::string& copLengthRange, int minDaysOff) {
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
    return rule;
}

}  // namespace

class Sia57MinScheduledDaysOffCabinCrewLongTest : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    SIATest::SiaRuleParamGuard _paramGuard;
};

TEST_F(Sia57MinScheduledDaysOffCabinCrewLongTest, Case1_ThirteenDaysAway_RequiresFourAtdo) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 56001, "333", "J");
    registerFlight(ctx, 56002, "333", "J");

    // Pairing length is measured (base-local) from first BRIEF to last DEBRIEF (inclusive calendar days).
    // Construct a 13-day pairing window: Day 1 00:00 (SIN local) -> Day 13 00:00 (SIN local).
    const time_t firstBriefUtc = utcFromSinLocal("2025-01-01 00:00:00");
    const time_t lastDebriefUtc = utcFromSinLocal("2025-01-13 00:00:00");
    const time_t lastDropoffUtc = lastDebriefUtc;  // align rest start to local midnight (no rounding padding)

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(56001, "SIN", "SIN", firstBriefUtc, firstBriefUtc + 3600,
                                   kSinOffsetMinutes, kSinOffsetMinutes));
    segments.push_back(makeSegment(56002, "SIN", "SIN", lastDebriefUtc - 3600, lastDebriefUtc,
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
    input.dbRules.push_back(makeRule7465Row(1, "13-13", 4));
    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    // With rest start aligned to local midnight, minRestAtBase is exactly N*24h.
    EXPECT_EQ(duties.back()->getMinRestAtBase(), 4 * 24 * 60);
}

TEST_F(Sia57MinScheduledDaysOffCabinCrewLongTest, Case2_FifteenDaysAway_RequiresFiveAtdo) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 56011, "333", "J");
    registerFlight(ctx, 56012, "333", "J");

    const time_t firstBriefUtc = utcFromSinLocal("2025-02-01 00:00:00");
    const time_t lastDebriefUtc = utcFromSinLocal("2025-02-15 00:00:00");
    const time_t lastDropoffUtc = lastDebriefUtc;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(56011, "SIN", "SIN", firstBriefUtc, firstBriefUtc + 3600,
                                   kSinOffsetMinutes, kSinOffsetMinutes));
    segments.push_back(makeSegment(56012, "SIN", "SIN", lastDebriefUtc - 3600, lastDebriefUtc,
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
    input.dbRules.push_back(makeRule7465Row(1, "15-15", 5));
    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    EXPECT_EQ(duties.back()->getMinRestAtBase(), 5 * 24 * 60);
}
