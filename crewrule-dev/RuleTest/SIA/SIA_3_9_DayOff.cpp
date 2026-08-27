// SIA_SUITE_SUMMARY_START
// SuiteId: 3.9
// Name: Day Off
// SourceCsvRow: 3.9.,Day Off
// Status: PARTIAL
// ImplementedCases:
//   - Skeleton SIN-based duty ending shortly after midnight on Day 2; placeholder wiring for CheckAnrDayOffSpacingRule (7415) only.
//   - Added check for rule 7465 to verify ATDO calculation.
// Results:
//   - TODO
//   - Notes:
// RemainingWork:
//   - Full roster-level ATDO computation is needed for a complete test of rule 7415.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7415/CheckAnrDayOffSpacingRule.h"
#include "RuleEngine/rule/rule7465/CalculateMinScheDaysOffAtBaseForSQRule.h"

#include "db/RuleParams.h"
#include "db/Pairing.h"
#include "db/Duty.h"
#include "orUtil/UtilFunc.h"
#include "SIA_CommonTestConfig.h"

namespace {

// Using a test fixture to avoid potential macro expansion issues with TEST()
class SIA_3_9_DayOff_Test : public ::testing::Test {
protected:
    void SetUp() override {
        _paramsGuard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
    std::unique_ptr<SIATest::SiaRuleParamGuard> _paramsGuard;
};

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
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
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setDBId(dbId);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeLocSch(start);
    seg->setEndTimeLocSch(end);
    seg->setIsOperating(true);
    return seg;
}

void applyOffsetToSegment(Segment* segment, time_t offsetSec) {
    const time_t startUtc = segment->getStartTimeUtcAct();
    const time_t endUtc = segment->getEndTimeUtcAct();
    segment->setStartTimeLocAct(startUtc + offsetSec);
    segment->setEndTimeLocAct(endUtc + offsetSec);
    segment->setStartTimeLocSch(startUtc + offsetSec);
    segment->setEndTimeLocSch(endUtc + offsetSec);
}

void addDutyNode(Duty* duty, const std::string& node, int sequence, time_t timeUtc) {
    auto pdn = std::make_shared<PairingDutyNode>();
    pdn->setType("DUTY");
    pdn->setNode(node);
    pdn->setSequence(sequence);
    pdn->setStartTimeUtcAct(timeUtc);
    pdn->setEndTimeUtcAct(timeUtc);
    pdn->setStartTimeLocAct(timeUtc);
    pdn->setEndTimeLocAct(timeUtc);
    duty->pairingDutyNodes.push_back(pdn);
}

void applyOffsetToDutyNodes(Duty* duty, time_t offsetSec) {
    for (const auto& node : duty->pairingDutyNodes) {
        const time_t startUtc = node->getStartTimeUtcAct();
        const time_t endUtc = node->getEndTimeUtcAct();
        node->setStartTimeLocAct(startUtc + offsetSec);
        node->setEndTimeLocAct(endUtc + offsetSec);
        node->setStartTimeLocSch(startUtc + offsetSec);
        node->setEndTimeLocSch(endUtc + offsetSec);
    }
}

std::unique_ptr<Duty> makeDutyWithNodes(const std::vector<Segment*>& segments,
                                        time_t briefStartUtc,
                                        time_t debriefEndUtc,
                                        time_t dropoffEndUtc,
                                        int seq,
                                        long long pairingId,
                                        time_t offsetSec) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setDutySeq(seq);
    duty->setPairingId(pairingId);
    duty->setDepartureStation(segments.front()->getDepSta());
    duty->setArrivalStation(segments.back()->getArrSta());
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
    duty->setStartTimeLocAct(segments.front()->getStartTimeUtcAct() + offsetSec);
    duty->setEndTimeLocAct(segments.back()->getEndTimeUtcAct() + offsetSec);

    addDutyNode(duty.get(), "BRIEF", 1, briefStartUtc);
    addDutyNode(duty.get(), "DEBRIEF", 2, debriefEndUtc);
    addDutyNode(duty.get(), "DROPOFF", 3, dropoffEndUtc);
    applyOffsetToDutyNodes(duty.get(), offsetSec);

    return duty;
}

std::vector<Duty*> asRaw(const std::vector<std::unique_ptr<Duty>>& duties) {
    std::vector<Duty*> raw;
    raw.reserve(duties.size());
    for (const auto& d : duties) {
        raw.push_back(d.get());
    }
    return raw;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase("SIN");
    pairing->setPrimeActivity("FLY");
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

RuleInput makeSimpleDayOffRuleInput() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7415001;
    row.function = 7415;
    row.params["MAX WORKING DAYS"] = "7";
    row.params["LAST DAY BUFFER HHMM"] = "21:00";
    input.dbRules.push_back(row);
    return input;
}

DBRule makeRule7465Row(int rowNum, const std::string& copLengthRange, int minDaysOff) {
    DBRule rule{};
    rule.idRule = 7465000 + rowNum;
    rule.function = 7465;
    rule.params["COP LENGTH RANGE"] = copLengthRange;
    rule.params["MIN DAYS OFF"] = std::to_string(minDaysOff);
    return rule;
}

}  // namespace

TEST_F(SIA_3_9_DayOff_Test, LastDutyDayBufferRespected) {
    // Case: 3.9 Day Off
    // 2025/12/12 (Day 1) duty: SIN-BKK-SIN (schedule shown as 0930-1535).
    // Because duty ends on Day 2 00:05 (base local), that entire day (Day 2) should be clear,
    // and the 1 ATDO should begin on Day 3 00:00.

    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"BKK", 420, "Asia/Bangkok"},
    });
    std::vector<RULE_VIOLATION*> violations;

    // Model the schedule time in UTC and apply base offset to local time so that
    // 15:35Z (arrival) + 00:30 debrief => 16:05Z, which is 00:05 at SIN (+08:00).
    const time_t offsetSec = 8 * 60 * 60;
    const long long pairingId = 3909001;

    registerFlight(ctx, 39090011, "330", "P");
    auto segment = makeSegment(39090011, "SIN", "SIN",
                               "2025-12-12 09:30:00",
                               "2025-12-12 15:35:00");
    applyOffsetToSegment(segment.get(), offsetSec);

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(std::move(segment));

    const time_t briefStartUtc = utcFromString("2025-12-12 09:30:00");
    const time_t debriefEndUtc = utcFromString("2025-12-12 16:05:00");
    const time_t dropoffEndUtc = utcFromString("2025-12-12 16:05:00");

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments.front().get()},
                                       briefStartUtc,
                                       debriefEndUtc,
                                       dropoffEndUtc,
                                       1,
                                       pairingId,
                                       offsetSec));

    auto pairing = makePairing(asRaw(duties));
    pairing->setId(pairingId);
    pairing->setStartTimeUtcAct(briefStartUtc);
    pairing->setEndTimeUtcAct(dropoffEndUtc);
    pairing->setStartTimeLocAct(briefStartUtc + offsetSec);
    pairing->setEndTimeLocAct(dropoffEndUtc + offsetSec);

    // --- Check Rule 7415 (Day Off Spacing) ---
    CheckAnrDayOffSpacingRule rule7415(nullptr, makeSimpleDayOffRuleInput());
    rule7415.setDataContext(ctx);
    rule7415.setRuleViolation(&violations);
    EXPECT_TRUE(rule7415.CheckRule(pairing.get()));
    
    // --- Check Rule 7465 (ATDO Calculation) ---
    RuleInput atdoInput;
    atdoInput.dbRules.push_back(makeRule7465Row(1, "2-2", 1));
    CalculateMinScheDaysOffAtBaseForSQRule rule7465(nullptr, atdoInput);
    rule7465.setDataContext(ctx);
    rule7465.setApplication(PAIRING_EDITOR);
    rule7465.CalculateDuty(pairing.get());

    Duty* lastDuty = duties.back().get();
    const time_t restStartLoc = lastDuty->getLastDropoff()->getEndTimeUtcAct() + offsetSec;
    const int expectedMinRestAtBaseMinutes = (2 * 24 * 60) - 5; // 47:55 from Day2 00:05 to Day4 00:00
    EXPECT_EQ(expectedMinRestAtBaseMinutes, lastDuty->getMinRestAtBase());

    const time_t expectedRestStartLoc = utcFromString("2025-12-13 00:05:00");
    const time_t expectedAtdoStartLoc = utcFromString("2025-12-14 00:00:00");
    const time_t expectedRestEndLoc = utcFromString("2025-12-15 00:00:00");

    EXPECT_EQ(expectedRestStartLoc, restStartLoc);
    const time_t atdoStartLoc = (restStartLoc / (24 * 3600) + 1) * (24 * 3600);
    EXPECT_EQ(expectedAtdoStartLoc, atdoStartLoc);
    const time_t restEndLoc = restStartLoc + static_cast<time_t>(lastDuty->getMinRestAtBase()) * 60;
    EXPECT_EQ(expectedRestEndLoc, restEndLoc);

    for (auto* rv : violations) {
        delete rv;
    }
}
