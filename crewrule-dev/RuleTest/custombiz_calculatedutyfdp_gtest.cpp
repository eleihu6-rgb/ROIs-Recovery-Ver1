#include <gtest/gtest.h>

#include "CrewDB.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

#include <algorithm>
#include <memory>
#include <string>
#include <vector>

long calculateDutyFdp(Duty* duty, CrewDataContext* dbData, CalculationManday FDP);

namespace {

time_t utcFromString(const std::string& ts) {
    return utcStrToUtc(const_cast<char*>(ts.c_str()));
}

struct RuleParamGuard {
    RuleParams* rp = RuleParams::GetInstancePtr();

    bool bPickupCount = rp->bPickupCount;
    bool bDropoffCount = rp->bDropoffCount;
    bool bPreFerryCount = rp->bPreFerryCount;
    bool bIncludePreSBY = rp->bIncludePreSBY;
    bool bIncludePostSBY = rp->bIncludePostSBY;
    bool bIncludePreGround = rp->bIncludePreGround;
    bool bIncludePostGround = rp->bIncludePostGround;
    bool bIncludePreStay = rp->bIncludePreStay;
    bool bIncludePostStay = rp->bIncludePostStay;
    bool bIncludePreHSB = rp->bIncludePreHSB;
    bool bIncludePostHSB = rp->bIncludePostHSB;
    bool bIncludeCI = rp->bIncludeCI;
    bool bIncludeCO = rp->bIncludeCO;
    bool bIncludeLastDHD = rp->bIncludeLastDHD;
    bool bIncludeLongTransitCI = rp->bIncludeLongTransitCI;
    bool bIncludeLongTransitCO = rp->bIncludeLongTransitCO;
    bool bIncludeLongTransitPickup = rp->bIncludeLongTransitPickup;
    bool bIncludeLongTransitDropoff = rp->bIncludeLongTransitDropoff;
    bool bIncludeLongTransitBreak = rp->bIncludeLongTransitBreak;
    bool bUseStickTime = rp->bUseStickTime;
    int fixedExtension = rp->iFixedValueToFDP;
    int beforeExtension = rp->beforeFixValueToFDP;
    int postActivityThreshold = rp->postActivityThreshold;
    int minConnectionTimeMinutes = rp->minConnectionTimeMinutes;
    std::vector<long_transit*> splitDuty = rp->split_duty;

    ~RuleParamGuard() {
        for (auto* item : rp->split_duty) {
            if (std::find(splitDuty.begin(), splitDuty.end(), item) == splitDuty.end()) {
                delete item;
            }
        }
        rp->split_duty = splitDuty;

        rp->bPickupCount = bPickupCount;
        rp->bDropoffCount = bDropoffCount;
        rp->bPreFerryCount = bPreFerryCount;
        rp->bIncludePreSBY = bIncludePreSBY;
        rp->bIncludePostSBY = bIncludePostSBY;
        rp->bIncludePreGround = bIncludePreGround;
        rp->bIncludePostGround = bIncludePostGround;
        rp->bIncludePreStay = bIncludePreStay;
        rp->bIncludePostStay = bIncludePostStay;
        rp->bIncludePreHSB = bIncludePreHSB;
        rp->bIncludePostHSB = bIncludePostHSB;
        rp->bIncludeCI = bIncludeCI;
        rp->bIncludeCO = bIncludeCO;
        rp->bIncludeLastDHD = bIncludeLastDHD;
        rp->bIncludeLongTransitCI = bIncludeLongTransitCI;
        rp->bIncludeLongTransitCO = bIncludeLongTransitCO;
        rp->bIncludeLongTransitPickup = bIncludeLongTransitPickup;
        rp->bIncludeLongTransitDropoff = bIncludeLongTransitDropoff;
        rp->bIncludeLongTransitBreak = bIncludeLongTransitBreak;
        rp->bUseStickTime = bUseStickTime;
        rp->iFixedValueToFDP = fixedExtension;
        rp->beforeFixValueToFDP = beforeExtension;
        rp->postActivityThreshold = postActivityThreshold;
        rp->minConnectionTimeMinutes = minConnectionTimeMinutes;
    }
};

SharedPtr<CrewDataContext> makeContextWithFlyAssignment(double fdpPct = 1.0) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    auto assignment = std::make_shared<ASSIGNMENT>();
    assignment->assignment = "FLY";
    assignment->FDP_PCT = fdpPct;
    ctx->assignmentNameMap["FLY"] = assignment;
    return ctx;
}

std::unique_ptr<Segment> makeSegment(const std::string& start,
                                     const std::string& end,
                                     long long dbid,
                                     const std::string& assignment = "FLY",
                                     const std::string& dep = "AAA",
                                     const std::string& arr = "BBB",
                                     int blkMinutes = -1) {
    auto seg = std::make_unique<Segment>();
    seg->setAssignment(assignment);
    seg->setIsOperating(true);
    seg->setDBId(dbid);
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setDomIntType("*");
    seg->setFleetCD("ANY");

    const auto startUtc = utcFromString(start);
    const auto endUtc = utcFromString(end);

    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    seg->setStartTimeLocSch(startUtc);
    seg->setEndTimeLocSch(endUtc);
    if (blkMinutes >= 0) {
        seg->setBlkSeconds(static_cast<long>(blkMinutes) * 60);
    }
    return seg;
}

std::vector<Segment*> toRaw(const std::vector<std::unique_ptr<Segment>>& storage) {
    std::vector<Segment*> raw;
    raw.reserve(storage.size());
    for (const auto& seg : storage) {
        raw.push_back(seg.get());
    }
    return raw;
}

std::shared_ptr<PairingDutyNode> makeDutyNode(const std::string& node,
                                              const std::string& start,
                                              const std::string& end) {
    auto dutyNode = std::make_shared<PairingDutyNode>();
    dutyNode->setType("DUTY");
    dutyNode->setNode(node);
    dutyNode->setStartLoc(utcFromString(start));
    dutyNode->setEndLoc(utcFromString(end));
    return dutyNode;
}

void addAssignment(SharedPtr<CrewDataContext> ctx,
                   const std::string& name,
                   double fdpPct,
                   const std::string& group = "") {
    auto assignment = std::make_shared<ASSIGNMENT>();
    assignment->assignment = name;
    assignment->FDP_PCT = fdpPct;
    ctx->assignmentNameMap[name] = assignment;
    if (!group.empty()) {
        ctx->assignmentNameGroupMap[group].insert(name);
    }
}

}  // namespace

TEST(CalculateDutyFdpTest, DutyNodesRespectBasicDefinitionSwitches) {
    RuleParamGuard guard;
    auto* rp = RuleParams::GetInstancePtr();
    rp->bIncludeCI = true;
    rp->bIncludeCO = true;
    rp->bPickupCount = true;
    rp->bDropoffCount = true;
    rp->iFixedValueToFDP = 0;
    rp->beforeFixValueToFDP = 0;
    rp->postActivityThreshold = 0;

    auto ctx = makeContextWithFlyAssignment();

    std::vector<std::unique_ptr<Segment>> storage;
    storage.push_back(makeSegment("2025-01-01 08:00:00", "2025-01-01 10:00:00", 1));
    auto rawSegments = toRaw(storage);

    auto duty = std::make_unique<Duty>();
    duty->setSegments(rawSegments);
    duty->pairingDutyNodes = {
        makeDutyNode("PICKUP", "2025-01-01 07:40:00", "2025-01-01 07:50:00"),
        makeDutyNode("BRIEF", "2025-01-01 07:50:00", "2025-01-01 08:00:00"),
        makeDutyNode("DEBRIEF", "2025-01-01 10:00:00", "2025-01-01 10:35:00"),
        makeDutyNode("DROPOFF", "2025-01-01 10:35:00", "2025-01-01 10:50:00"),
    };

    CalculationManday manday{};
    const auto fdpWithAll = calculateDutyFdp(duty.get(), ctx.get(), manday);
    EXPECT_EQ(fdpWithAll, 11400); // from 07:40 - 10:50, 3 * 3600 + 600 = 11400

    rp->bIncludeCI = false;
    rp->bIncludeCO = false;
    rp->bPickupCount = false;
    rp->bDropoffCount = false;

    const auto fdpWithoutNodes = calculateDutyFdp(duty.get(), ctx.get(), manday);
    EXPECT_EQ(fdpWithoutNodes, 7200);
}

TEST(CalculateDutyFdpTest, LongTransitAndFixedExtensionsFollowBasicDefinitionFlags) {
    RuleParamGuard guard;
    auto* rp = RuleParams::GetInstancePtr();
    rp->bIncludeCI = false;
    rp->bIncludeCO = false;
    rp->bPickupCount = false;
    rp->bDropoffCount = false;
    rp->bIncludeLongTransitCI = true;
    rp->bIncludeLongTransitCO = true;
    rp->bIncludeLongTransitPickup = true;
    rp->bIncludeLongTransitDropoff = true;
    rp->bIncludeLongTransitBreak = true;
    rp->iFixedValueToFDP = 5;    // 5 minutes fixed extension
    rp->beforeFixValueToFDP = 2; // 2 minutes before start extension
    rp->postActivityThreshold = 0;

    auto* longTransit = new long_transit();
    longTransit->inbound = "*";
    longTransit->outbound = "*";
    longTransit->airport = "*";
    longTransit->fleetsVec.push_back("*");
    longTransit->maxTurnTimeMins = 120;
    longTransit->pseudoCI = 20;
    longTransit->pseudoCO = 15;
    longTransit->pseudoPickup = 10;
    longTransit->pseudoDropoff = 5;
    rp->split_duty.clear();
    rp->split_duty.push_back(longTransit);

    auto ctx = makeContextWithFlyAssignment();

    std::vector<std::unique_ptr<Segment>> storage;
    storage.push_back(makeSegment("2025-01-01 08:00:00", "2025-01-01 09:00:00", 100));
    
	// 3 hours long transit, bIncludeLongTransitBreak = true
    // FDP = 60min fly + 60min fly + 3 hours break + 5min fixed + 2min before = 307min = 18420 sec

    auto seg2 = makeSegment("2025-01-01 12:00:00", "2025-01-01 13:00:00", 200);
    storage.push_back(std::move(seg2));

    auto rawSegments = toRaw(storage);
    auto duty = std::make_unique<Duty>();
    duty->setSegments(rawSegments);

    CalculationManday manday{};
    const auto fdpWithLongTransit = calculateDutyFdp(duty.get(), ctx.get(), manday);
    EXPECT_EQ(fdpWithLongTransit, 18420);

    rp->bIncludeLongTransitCI = true;
    rp->bIncludeLongTransitCO = true;
    rp->bIncludeLongTransitPickup = true;
    rp->bIncludeLongTransitDropoff = true;
    rp->bIncludeLongTransitBreak = false;

    const auto fdpWithoutLongTransitExtras = calculateDutyFdp(duty.get(), ctx.get(), manday);
    // 3 hours long transit, bIncludeLongTransitBreak = false, 
    // FDP = 60min fly + 60min fly + 20 CI + 15 CO + 10 pickup + 5 drop off + 5min fixed + 2min before = 177min = 10620 sec

    EXPECT_EQ(fdpWithoutLongTransitExtras, 10620);
}

TEST(CalculateDutyFdpTest, PreFerryAndLastDhdHonorsFlags) {
    RuleParamGuard guard;
    auto* rp = RuleParams::GetInstancePtr();
    rp->bPickupCount = false;
    rp->bDropoffCount = false;
    rp->bPreFerryCount = true;
    rp->bIncludeLastDHD = true;
    rp->bIncludeCI = false;
    rp->bIncludeCO = false;

    auto ctx = makeContextWithFlyAssignment();
    addAssignment(ctx, "FERRY", 0.0, "FERRY");

    std::vector<std::unique_ptr<Segment>> storage;
    storage.push_back(makeSegment("2025-01-01 08:00:00", "2025-01-01 09:00:00", 10, "FERRY"));
    storage.push_back(makeSegment("2025-01-01 09:00:00", "2025-01-01 10:00:00", 11, "FLY"));
    storage.push_back(makeSegment("2025-01-01 10:00:00", "2025-01-01 11:00:00", 12, "FERRY"));

    auto duty = std::make_unique<Duty>();
    auto segments = toRaw(storage);
    duty->setSegments(segments);

    CalculationManday manday{};
    const auto fdpWithFerry = calculateDutyFdp(duty.get(), ctx.get(), manday);
    EXPECT_EQ(fdpWithFerry, 10800); // 1h pre-ferry + 1h fly + 1h post-ferry

    rp->bPreFerryCount = false;
    rp->bIncludeLastDHD = false;
    const auto fdpWithoutFerry = calculateDutyFdp(duty.get(), ctx.get(), manday);
    EXPECT_EQ(fdpWithoutFerry, 3600); // only fly segment
}

TEST(CalculateDutyFdpTest, PreAndPostGroundStayHsbSegmentsToggleWithFlags) {
    RuleParamGuard guard;
    auto* rp = RuleParams::GetInstancePtr();
    rp->bIncludePreGround = true;
    rp->bIncludePostStay = true;
    rp->bIncludePostHSB = true;
    rp->bIncludeCI = false;
    rp->bIncludeCO = false;
    rp->bPickupCount = false;
    rp->bDropoffCount = false;
    rp->bPreFerryCount = false;

    auto ctx = makeContextWithFlyAssignment();
    addAssignment(ctx, "GND", 0.0, "GND");
    addAssignment(ctx, "STAY", 0.0, "STAY");
    addAssignment(ctx, "HSB", 0.0, "HSB");

    std::vector<std::unique_ptr<Segment>> storage;
    storage.push_back(makeSegment("2025-02-01 07:00:00", "2025-02-01 08:00:00", 20, "GND"));
    storage.push_back(makeSegment("2025-02-01 08:00:00", "2025-02-01 09:00:00", 21, "FLY"));
    storage.push_back(makeSegment("2025-02-01 09:00:00", "2025-02-01 10:00:00", 22, "STAY"));
    storage.push_back(makeSegment("2025-02-01 10:00:00", "2025-02-01 11:00:00", 23, "HSB"));

    auto duty = std::make_unique<Duty>();
    auto segments = toRaw(storage);
    duty->setSegments(segments);

    CalculationManday manday{};
    const auto fdpWithGroundAndStay = calculateDutyFdp(duty.get(), ctx.get(), manday);
    EXPECT_EQ(fdpWithGroundAndStay, 14400); // ground + fly + stay + hsb

    rp->bIncludePreGround = false;
    rp->bIncludePostStay = false;
    rp->bIncludePostHSB = false;
    const auto fdpWithoutGroundAndStay = calculateDutyFdp(duty.get(), ctx.get(), manday);
    EXPECT_EQ(fdpWithoutGroundAndStay, 3600); // only fly segment
}

TEST(CalculateDutyFdpTest, StickTimeOverridesActualWhenEnabled) {
    RuleParamGuard guard;
    auto* rp = RuleParams::GetInstancePtr();
    rp->bUseStickTime = true;
    rp->minConnectionTimeMinutes = 0;
    rp->bIncludeCI = false;
    rp->bIncludeCO = false;
    rp->bPickupCount = false;
    rp->bDropoffCount = false;

    auto ctx = makeContextWithFlyAssignment();

    std::vector<std::unique_ptr<Segment>> storage;
    storage.push_back(makeSegment("2025-03-01 08:00:00", "2025-03-01 08:20:00", 301, "FLY", "AAA", "BBB", 90));

    auto duty = std::make_unique<Duty>();
    auto segments = toRaw(storage);
    duty->setSegments(segments);

    CalculationManday manday{};
    const auto fdp = calculateDutyFdp(duty.get(), ctx.get(), manday);
    EXPECT_EQ(fdp, 5400); // 90 minutes stick time instead of 20 minutes actual
}

TEST(CalculateDutyFdpTest, MinConnectionTimeAppliesBetweenFlights) {
    RuleParamGuard guard;
    auto* rp = RuleParams::GetInstancePtr();
    rp->bUseStickTime = true;
    rp->minConnectionTimeMinutes = 55;
    rp->bIncludeCI = false;
    rp->bIncludeCO = false;
    rp->bPickupCount = false;
    rp->bDropoffCount = false;
    rp->bPreFerryCount = false;
    rp->bIncludeLastDHD = false;

    auto ctx = makeContextWithFlyAssignment();

    std::vector<std::unique_ptr<Segment>> storage;
    storage.push_back(makeSegment("2025-03-01 08:00:00", "2025-03-01 08:40:00", 401, "FLY", "AAA", "BBB", 60)); // assumed arrival = 09:00
	storage.push_back(makeSegment("2025-03-01 09:30:00", "2025-03-01 10:10:00", 402, "FLY", "BBB", "CCC", 60)); // connection = 30 mins, adjust to 55 mins

    auto duty = std::make_unique<Duty>();
    auto segments = toRaw(storage);
    duty->setSegments(segments);

    CalculationManday manday{};
    const auto fdp = calculateDutyFdp(duty.get(), ctx.get(), manday);
    EXPECT_EQ(fdp, 10500); // 60 + 60 + max(30, 55) minutes
}
