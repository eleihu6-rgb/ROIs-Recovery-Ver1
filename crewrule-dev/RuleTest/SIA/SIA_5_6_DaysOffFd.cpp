// SIA_SUITE_SUMMARY_START
// SuiteId: 5.6
// Name: Minimum Scheduled Days Off at Base – Flight Crew
// SourceCsvRow: 5.6.,Minimum Scheduled Days Off at Base – Flight Crew
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: 5-day SIN-HND-SIN pairing -> 2 ATDOs.
//   - Case #2: 6-day SIN-HND-SIN pairing -> 3 ATDOs.
// Results:
//   - TODO
//   - Notes:
// RemainingWork:
//   - Analyze any test failures.
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
#include "db/Pairing.h"
#include "db/Duty.h"
#include "db/Segment.h"
#include "orUtil/UtilFunc.h"

// Using a clean test structure based on rule7465_gtest.cpp to avoid build issues.

namespace {

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["SIN"] = 8 * 60;
    ctx->airportUtcOffsetMap["HND"] = 9 * 60;
    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
    ctx->airportZoneIdMap["HND"] = "Asia/Tokyo";
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
                                     const std::string& fleet,
                                     const std::string& serviceType) {
    auto seg = std::make_unique<Segment>();
    seg->setDBId(dbId);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setIsOperating(true);
    seg->setFleetCD(fleet);
    seg->setServiceType(serviceType);
    return seg;
}

void addDutyNode(Duty* duty, const std::string& node, int sequence, time_t timeUtc, int baseOffsetMinutes) {
    auto pdn = std::make_shared<PairingDutyNode>();
    pdn->setType("DUTY");
    pdn->setNode(node);
    pdn->setSequence(sequence);
    pdn->setStartTimeUtcAct(timeUtc);
    pdn->setEndTimeUtcAct(timeUtc);
    pdn->setStartTimeLocAct(timeUtc + static_cast<time_t>(baseOffsetMinutes) * 60);
    pdn->setEndTimeLocAct(timeUtc + static_cast<time_t>(baseOffsetMinutes) * 60);
    duty->pairingDutyNodes.push_back(pdn);
}

// Corrected helper: also sets fleet code on the duty.
std::unique_ptr<Duty> makeDutyWithNodes(const std::vector<Segment*>& segments,
                                        time_t briefStartUtc,
                                        time_t debriefEndUtc,
                                        time_t dropoffEndUtc,
                                        int baseOffsetMinutes) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setDepartureStation(segments.front()->getDepSta());
    duty->setArrivalStation(segments.back()->getArrSta());
    duty->setStartTimeUtcAct(briefStartUtc);
    duty->setEndTimeUtcAct(dropoffEndUtc);
    duty->setStartTimeLocAct(briefStartUtc + static_cast<time_t>(baseOffsetMinutes) * 60);
    duty->setEndTimeLocAct(dropoffEndUtc + static_cast<time_t>(baseOffsetMinutes) * 60);
    duty->setFltCD(segments.front()->getFleetCD()); // Propagate fleet to duty
    addDutyNode(duty.get(), "BRIEF", 1, briefStartUtc, baseOffsetMinutes);
    addDutyNode(duty.get(), "DEBRIEF", 2, debriefEndUtc, baseOffsetMinutes);
    addDutyNode(duty.get(), "DROPOFF", 3, dropoffEndUtc, baseOffsetMinutes);
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

// Corrected helper: also sets fleet code on the pairing and aligns base timezone offset.
std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties,
                                     time_t startUtc,
                                     time_t endUtc,
                                     int baseOffsetMinutes) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase("SIN");
    pairing->setStartTimeUtcAct(startUtc);
    pairing->setEndTimeUtcAct(endUtc);
    pairing->setStartTimeLocAct(startUtc + static_cast<time_t>(baseOffsetMinutes) * 60);
    pairing->setEndTimeLocAct(endUtc + static_cast<time_t>(baseOffsetMinutes) * 60);
    pairing->setStartTimeLocSch(pairing->getStartTimeLocAct());
    pairing->setEndTimeLocSch(pairing->getEndTimeLocAct());
    if (!duties.empty()) {
        pairing->setFltCode(duties.front()->getFltCD()); // Propagate fleet to pairing
    }
    return pairing;
}

DBRule makeRule7465Row(int rowNum, const std::string& copLengthRange, int minDaysOff) {
    DBRule rule{};
    rule.idRule = 7465000 + rowNum;
    rule.function = 7465;
    rule.params["COP LENGTH RANGE"] = copLengthRange;
    rule.params["MIN DAYS OFF"] = std::to_string(minDaysOff);
    rule.params["FLEETS"] = "AAA";
    rule.params["SERVICE TYPE"] = "J";
    return rule;
}

}  // namespace

class SIA_5_6_DaysOffFdTest : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

TEST_F(SIA_5_6_DaysOffFdTest, Case1_FiveDayCop_RequiresTwoAtdo) {
    auto ctx = buildDataContext();
    const int baseOffsetMinutes = ctx->airportUtcOffsetMap["SIN"];

    const time_t pairingStartUtc = SIATest::utcFromLocal("2025-12-12 06:05:00", "SIN", ctx);
    const time_t pairingEndUtc = SIATest::utcFromLocal("2025-12-16 21:20:00", "SIN", ctx);

    const time_t duty1BriefStart = SIATest::utcFromLocal("2025-12-12 05:05:00", "SIN", ctx);
    const time_t duty1DebriefEnd = SIATest::utcFromLocal("2025-12-12 13:10:00", "HND", ctx);
    const time_t duty1DropoffEnd = duty1DebriefEnd + static_cast<time_t>(SIATest::kTransportTimeMinutes) * 60;
    
    const time_t duty2BriefStart = SIATest::utcFromLocal("2025-12-16 12:55:00", "HND", ctx);
    const time_t duty2DebriefEnd = SIATest::utcFromLocal("2025-12-16 21:50:00", "SIN", ctx);
    const time_t duty2DropoffEnd = duty2DebriefEnd + static_cast<time_t>(SIATest::kTransportTimeMinutes) * 60;

    std::vector<std::unique_ptr<Segment>> segments;
    registerFlight(ctx, 560101, "AAA", "J");
    registerFlight(ctx, 560102, "AAA", "J");
    segments.push_back(makeSegment(560101,
                                   "SIN",
                                   "HND",
                                   SIATest::utcFromLocal("2025-12-12 06:05:00", "SIN", ctx),
                                   SIATest::utcFromLocal("2025-12-12 12:40:00", "HND", ctx),
                                   "AAA",
                                   "J"));
    segments.push_back(makeSegment(560102,
                                   "HND",
                                   "SIN",
                                   SIATest::utcFromLocal("2025-12-16 13:55:00", "HND", ctx),
                                   SIATest::utcFromLocal("2025-12-16 21:20:00", "SIN", ctx),
                                   "AAA",
                                   "J"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()}, duty1BriefStart, duty1DebriefEnd, duty1DropoffEnd, baseOffsetMinutes));
    duties.push_back(makeDutyWithNodes({segments[1].get()}, duty2BriefStart, duty2DebriefEnd, duty2DropoffEnd, baseOffsetMinutes));

    auto pairing = makePairing(asRaw(duties), pairingStartUtc, pairingEndUtc, baseOffsetMinutes);

    RuleInput input;
    input.dbRules.push_back(makeRule7465Row(1, "5-5", 2));
    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    // Rule 7465 aligns ATDO to next midnight; rest starts at 22:50 LT, so add 70 minutes.
    EXPECT_EQ(duties.back()->getMinRestAtBase(), 2 * 24 * 60 + 70);
}

TEST_F(SIA_5_6_DaysOffFdTest, Case2_SixDayCop_RequiresThreeAtdo) {
    auto ctx = buildDataContext();
    const int baseOffsetMinutes = ctx->airportUtcOffsetMap["SIN"];

    const time_t pairingStartUtc = SIATest::utcFromLocal("2025-12-12 06:05:00", "SIN", ctx);
    const time_t pairingEndUtc = SIATest::utcFromLocal("2025-12-17 21:20:00", "SIN", ctx);

    const time_t duty1BriefStart = SIATest::utcFromLocal("2025-12-12 05:05:00", "SIN", ctx);
    const time_t duty1DebriefEnd = SIATest::utcFromLocal("2025-12-12 13:10:00", "HND", ctx);
    const time_t duty1DropoffEnd = duty1DebriefEnd + static_cast<time_t>(SIATest::kTransportTimeMinutes) * 60;
    
    const time_t duty2BriefStart = SIATest::utcFromLocal("2025-12-17 12:55:00", "HND", ctx);
    const time_t duty2DebriefEnd = SIATest::utcFromLocal("2025-12-17 21:50:00", "SIN", ctx);
    const time_t duty2DropoffEnd = duty2DebriefEnd + static_cast<time_t>(SIATest::kTransportTimeMinutes) * 60;

    std::vector<std::unique_ptr<Segment>> segments;
    registerFlight(ctx, 560201, "AAA", "J");
    registerFlight(ctx, 560202, "AAA", "J");
    segments.push_back(makeSegment(560201,
                                   "SIN",
                                   "HND",
                                   SIATest::utcFromLocal("2025-12-12 06:05:00", "SIN", ctx),
                                   SIATest::utcFromLocal("2025-12-12 12:40:00", "HND", ctx),
                                   "AAA",
                                   "J"));
    segments.push_back(makeSegment(560202,
                                   "HND",
                                   "SIN",
                                   SIATest::utcFromLocal("2025-12-17 13:55:00", "HND", ctx),
                                   SIATest::utcFromLocal("2025-12-17 21:20:00", "SIN", ctx),
                                   "AAA",
                                   "J"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()}, duty1BriefStart, duty1DebriefEnd, duty1DropoffEnd, baseOffsetMinutes));
    duties.push_back(makeDutyWithNodes({segments[1].get()}, duty2BriefStart, duty2DebriefEnd, duty2DropoffEnd, baseOffsetMinutes));

    auto pairing = makePairing(asRaw(duties), pairingStartUtc, pairingEndUtc, baseOffsetMinutes);

    RuleInput input;
    input.dbRules.push_back(makeRule7465Row(1, "6-6", 3));
    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    // Rule 7465 aligns ATDO to next midnight; rest starts at 22:50 LT, so add 70 minutes.
    EXPECT_EQ(duties.back()->getMinRestAtBase(), 3 * 24 * 60 + 70);
}
