#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

using namespace std;

#include "GlobalDefinition/RuleEngineDef.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7205/CheckMaxFlightTimeInPeriodForEvaFdRule.h"
#include "RuleSystemDefine.h"
#include "db/AssignmentHolder.h"
#include "db/CrewDB.h"
#include "db/Pairing.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

struct DutyPlan {
    std::string reportUtc;
    std::string releaseUtc;
    std::string depStation{"AAA"};
    std::string arrStation{"AAA"};
};

long long nextDutyId() {
    static long long id = 10000;
    return ++id;
}

long long nextSegmentId() {
    static long long id = 20000;
    return ++id;
}

SharedPtr<CrewDataContext> buildBasicContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenario.airline = "SQ";
    ctx->scenario.division = "P";
    ctx->scenario.startDtUTC = utcFromString("2025-01-01 00:00:00");
    ctx->scenario.endDtUTC = utcFromString("2025-12-31 23:59:59");
    ctx->airportUtcOffsetMap["AAA"] = 0;
    ctx->airportZoneIdMap["AAA"] = "UTC";

    CalculationManday actDp{};
    actDp.airline = ctx->scenario.airline;
    actDp.type = "ACT DP";
    actDp.str = "ACT";
    actDp.end = "ACT";
    ctx->addCalculationManday("ACT DP", actDp);

    CalculationManday actFdp{};
    actFdp.airline = ctx->scenario.airline;
    actFdp.type = "ACT FDP";
    actFdp.str = "ACT";
    actFdp.end = "ACT";
    ctx->addCalculationManday("ACT FDP", actFdp);

    return ctx;
}

void ensureFlyAssignment(const SharedPtr<CrewDataContext>& ctx) {
    if (ctx->assignmentNameMap.find("FLY") != ctx->assignmentNameMap.end()) {
        return;
    }
    auto assignment = std::make_shared<ASSIGNMENT>();
    assignment->AIRLINE = ctx->scenario.airline;
    assignment->ASSIGNMENT_ID = 1;
    assignment->assignment = "FLY";
    assignment->TYPE = "FLY";
    assignment->FDP_PCT = 1.0;
    assignment->DP_PCT = 1.0;
    assignment->BT_PCT = 1.0;
    ctx->assignmentNameMap["FLY"] = assignment;
    AssignmentHolder::getAirline(ctx->scenario.airline);
    AssignmentHolder::getInst().add(*assignment);
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
                               std::vector<std::unique_ptr<Segment>>& segStore,
                               int blockMinutes = 0) {
    auto duty = std::make_unique<Duty>();
    const time_t startUtc = utcFromString(plan.reportUtc);
    const time_t endUtc = utcFromString(plan.releaseUtc);
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

    attachDutyNodes(*duty, startUtc, endUtc, offsetMinutes);

    auto seg = std::make_unique<Segment>();
    seg->setSegmentId(nextSegmentId());
    const time_t segStartUtc = startUtc;
    const time_t segEndUtc = segStartUtc + blockMinutes * 60;
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
    seg->setBlkSeconds(blockMinutes * 60);
    seg->setBlkMinHistory(blockMinutes);

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

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setQualifier("FLY");
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

struct RuleLimits {
    std::string dp = "*";
    std::string fdp = "*";
    std::string blh = "*";
};

}  // namespace

class Rule7205Test : public ::testing::Test {
protected:
    void SetUp() override { RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR); }

    void TearDown() override { clearViolations(); }

    void clearViolations() {
        for (auto* rv : _violations) {
            delete rv;
        }
        _violations.clear();
        _violationMessages.clear();
    }

    std::unique_ptr<CheckMaxFlightTimeInPeriodForEvaFdRule> makeRule(int period,
                                                                     const std::string& unit,
                                                                     const RuleLimits& limits,
                                                                     const SharedPtr<CrewDataContext>& ctx) {
        RuleInput input;
        input.ruleParamString.push_back("*,*,*,*,*,*,*," + std::to_string(period) + "," + unit + "," +
                                        limits.blh + "," + limits.fdp + "," + limits.dp + ",2");
        auto rule = std::make_unique<CheckMaxFlightTimeInPeriodForEvaFdRule>(nullptr, input);
        rule->setApplication(PAIRING_EDITOR);
        rule->setDataContext(ctx);
        rule->setRuleViolation(&_violations);
        rule->setViolations(&_violationMessages);
        return rule;
    }

    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
};

TEST_F(Rule7205Test, PairingShorterThanWindowViolatesWhenDPExceedsLimit) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({"2025-01-01 08:00:00", "2025-01-01 16:00:00"}, ctx, segments));
    dutyStore.push_back(makeDuty({"2025-01-02 08:00:00", "2025-01-02 15:00:00"}, ctx, segments));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205001);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

	// Limit DP to 9 hours over 4 days
    auto rule = makeRule(4, "CD", { "00:00-09:00" }, ctx);
	// two day DP is 8 + 7 = 15 hours, which exceeds 9 hours limit
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_FALSE(_violations.empty());
    auto it = _violations.front()->operation_result.find("limitDPRange");
    ASSERT_NE(it, _violations.front()->operation_result.end());
    EXPECT_EQ(it->second, "00:00-09:00");
}

TEST_F(Rule7205Test, RollingWindowDetectsViolationOnLongPairing) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({"2025-01-01 08:00:00", "2025-01-01 14:00:00"}, ctx, segments));
    dutyStore.push_back(makeDuty({"2025-01-03 08:00:00", "2025-01-03 14:00:00"}, ctx, segments));
    dutyStore.push_back(makeDuty({"2025-01-05 08:00:00", "2025-01-05 14:00:00"}, ctx, segments));
    dutyStore.push_back(makeDuty({"2025-01-07 08:00:00", "2025-01-07 14:00:00"}, ctx, segments));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205002);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(3, "CD", { "00:00-10:00" }, ctx);
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_FALSE(_violations.empty());
}

TEST_F(Rule7205Test, RollingWindowPassesWhenDpWithinLimit) {
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({"2025-02-01 08:00:00", "2025-02-01 14:00:00"}, ctx, segments));
    dutyStore.push_back(makeDuty({"2025-02-03 08:00:00", "2025-02-03 14:00:00"}, ctx, segments));
    dutyStore.push_back(makeDuty({"2025-02-05 08:00:00", "2025-02-05 14:00:00"}, ctx, segments));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205003);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(2, "CD", { "00:00-12:00" }, ctx);
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7205Test, SingleDutyExceedCalendarDayLimit) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({ "2025-03-01 10:00:00", "2025-03-01 20:00:00" }, ctx, segments));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205004);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(1, "CD", { "00:00-09:00" }, ctx);
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

TEST_F(Rule7205Test, DutyOverMidnightPassesWithCalendarDayLimit) {
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    
    dutyStore.push_back(makeDuty({"2025-03-01 18:00:00", "2025-03-02 04:00:00"}, ctx, segments));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205004);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(1, "CD", { "00:00-09:00" }, ctx);
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7205Test, DutyOverMidnightViolatesMultiDayLimit) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({"2025-03-10 20:00:00", "2025-03-11 02:00:00"}, ctx, segments));
    dutyStore.push_back(makeDuty({"2025-03-12 10:00:00", "2025-03-12 15:00:00"}, ctx, segments));
    dutyStore.push_back(makeDuty({"2025-03-13 10:00:00", "2025-03-13 14:00:00"}, ctx, segments));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205005);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(3, "CD", { "00:00-10:00" }, ctx);
	// day 2025-03-10 to 2025-03-12: 6 + 5 = 11 hours, exceeds 10 hours limit
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_FALSE(_violations.empty());
}

TEST_F(Rule7205Test, AccumulatedPortionsOfDutiesOnSameDayViolateLimit) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({"2025-04-01 18:00:00", "2025-04-02 02:00:00"}, ctx, segments));
    dutyStore.push_back(makeDuty({"2025-04-02 16:00:00", "2025-04-03 01:00:00"}, ctx, segments));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205006);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(1, "CD", { "00:00-09:00" }, ctx);
	// day 2025-04-02 DP is 2 + 8 = 10 hours, exceeds 9 hours limit
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_FALSE(_violations.empty());
}

TEST_F(Rule7205Test, TwoMidnightDutiesExceedsTwoDayLimit) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({ "2025-01-01 22:00:00", "2025-01-02 05:00:00" }, ctx, segments));
    dutyStore.push_back(makeDuty({ "2025-01-02 19:00:00", "2025-01-03 06:00:00" }, ctx, segments));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205001);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(2, "CD", { "00:00-15:00" }, ctx);
	// day 025-01-02 to 025-01-03 DP is 5 + 11 = 16 hours, exceeds 15 hours limit
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

// FDP Pass - Single Day
TEST_F(Rule7205Test, LimitFDPRangePassesWhenFdpIsWithinLimit) {
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    dutyStore.push_back(makeDuty({"2025-05-01 08:00:00", "2025-05-01 18:00:00"}, ctx, segments, 8 * 60));
    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    auto rule = makeRule(1, "CD", {"*", "00:00-09:00"}, ctx);
	// FDP is 8 hours, within 9 hours limit
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

// FDP Pass - Multi Day
TEST_F(Rule7205Test, LimitFDPRangePassesForMultiDay) {
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    dutyStore.push_back(makeDuty({"2025-05-01 08:00:00", "2025-05-01 14:00:00"}, ctx, segments, 5 * 60));
    dutyStore.push_back(makeDuty({"2025-05-02 08:00:00", "2025-05-02 14:00:00"}, ctx, segments, 4 * 60));
    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    auto rule = makeRule(2, "CD", {"*", "00:00-10:00"}, ctx);
	// FDP is 5 + 4 = 9 hours, within 10 hours limit
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

// FDP Fail - Single Day
TEST_F(Rule7205Test, LimitFDPRangeViolatesWhenFdpExceedsLimit) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    dutyStore.push_back(makeDuty({"2025-06-01 08:00:00", "2025-06-01 18:00:00"}, ctx, segments, 10 * 60));
    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    auto rule = makeRule(1, "CD", {"*", "00:00-09:00"}, ctx);
	// FDP is 10 hours, exceeds 9 hours limit
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

// FDP Fail - Multi Day
TEST_F(Rule7205Test, LimitFDPRangeViolatesForMultiDay) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    dutyStore.push_back(makeDuty({"2025-06-01 08:00:00", "2025-06-01 18:00:00"}, ctx, segments, 6 * 60));
    dutyStore.push_back(makeDuty({"2025-06-02 08:00:00", "2025-06-02 15:00:00"}, ctx, segments, 6 * 60));
    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    auto rule = makeRule(2, "CD", {"*", "00:00-11:00"}, ctx);
	// FDP is 6 + 6 = 12 hours, exceeds 11 hours limit
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

// BLH Pass - Single Day
TEST_F(Rule7205Test, LimitBLHRangePassesWhenBlhIsWithinLimit) {
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    dutyStore.push_back(makeDuty({"2025-07-01 08:00:00", "2025-07-01 18:00:00"}, ctx, segments, 8 * 60));
    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    auto rule = makeRule(1, "CD", {"", "", "00:00-09:00"}, ctx);
	// BLH is 8 hours, within 9 hours limit
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

// BLH Pass - Multi Day
TEST_F(Rule7205Test, LimitBLHRangePassesForMultiDay) {
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    dutyStore.push_back(makeDuty({"2025-07-01 08:00:00", "2025-07-01 14:00:00"}, ctx, segments, 5 * 60));
    dutyStore.push_back(makeDuty({"2025-07-02 08:00:00", "2025-07-02 14:00:00"}, ctx, segments, 4 * 60));
    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    auto rule = makeRule(2, "CD", {"*", "*", "00:00-10:00"}, ctx);
	// BLH is 5 + 4 = 9 hours, within 10 hours limit
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

// BLH Fail - Single Day
TEST_F(Rule7205Test, LimitBLHRangeViolatesWhenBlhExceedsLimit) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    dutyStore.push_back(makeDuty({"2025-08-01 08:00:00", "2025-08-01 20:00:00"}, ctx, segments, 10 * 60));
    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    auto rule = makeRule(1, "CD", {"*", "*", "00:00-09:00"}, ctx);
	// BLH is 10 hours, exceeds 9 hours limit
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

// BLH Fail - Multi Day
TEST_F(Rule7205Test, LimitBLHRangeViolatesForMultiDay) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    dutyStore.push_back(makeDuty({"2025-08-01 08:00:00", "2025-08-01 18:00:00"}, ctx, segments, 6 * 60));
    dutyStore.push_back(makeDuty({"2025-08-02 08:00:00", "2025-08-02 18:00:00"}, ctx, segments, 6 * 60));
    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    auto rule = makeRule(2, "CD", {"*", "*", "00:00-11:00"}, ctx);
	// BLH is 6 + 6 = 12 hours, exceeds 11 hours limit
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

TEST_F(Rule7205Test, DbHeaderLimitFlightTimeRangeIsParsed) {
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    dutyStore.push_back(makeDuty({"2025-08-01 08:00:00", "2025-08-01 18:00:00"}, ctx, segments, 6 * 60));
    dutyStore.push_back(makeDuty({"2025-08-02 08:00:00", "2025-08-02 18:00:00"}, ctx, segments, 6 * 60));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");

    DBRule dbRule;
    dbRule.function = 7205;
    dbRule.idRule = 7205001;
    dbRule.idRuleParam = 7205001;
    dbRule.params["PERIOD"] = "2";
    dbRule.params["UNIT"] = "CD";
    dbRule.params["LIMIT FLIGHT TIME RANGE"] = "00:00-11:00";
    dbRule.params["LIMIT FDP RANGE"] = "*";
    dbRule.params["LIMIT DP RANGE"] = "*";

    RuleInput input;
    input.dbRules.push_back(dbRule);

    auto rule = std::make_unique<CheckMaxFlightTimeInPeriodForEvaFdRule>(nullptr, input);
    rule->setApplication(PAIRING_EDITOR);
    rule->setDataContext(ctx);
    rule->setRuleViolation(&_violations);
    rule->setViolations(&_violationMessages);

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

TEST_F(Rule7205Test, RollingHourPassesWhenDpIsWithinLimit) {
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({"2025-09-01 08:00:00", "2025-09-01 12:00:00"}, ctx, segments, 4*60));
    dutyStore.push_back(makeDuty({"2025-09-01 22:00:00", "2025-09-02 02:00:00"}, ctx, segments, 4*60));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205101);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(24, "RH", {"00:00-10:00"}, ctx);
	// DP is 8 hours in rolling 24 hours, within 10 hours limit
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7205Test, RollingHourViolatesWhenDpExceedsLimit) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({"2025-09-01 08:00:00", "2025-09-01 14:00:00"}, ctx, segments, 6*60));
    dutyStore.push_back(makeDuty({"2025-09-01 20:00:00", "2025-09-02 02:00:00"}, ctx, segments, 6*60));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205102);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(24, "RH", {"00:00-10:00"}, ctx);
	// DP is 12 hours in rolling 24 hours, exceeds 10 hours limit
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

TEST_F(Rule7205Test, RollingHourPassesWithExactLimit) {
    GTEST_SKIP() << "Pending rule implementation";
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({"2025-10-01 08:00:00", "2025-10-01 13:00:00"}, ctx, segments, 5*60));
    dutyStore.push_back(makeDuty({"2025-10-01 18:00:00", "2025-10-01 23:00:00"}, ctx, segments, 5*60));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205103);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(24, "RH", {"00:00-10:00"}, ctx); // DP 10 hours in rolling 24 hours
	// DP 10 hours exceed 10:00 - 1 minute limit (rule range is upper exclusive)
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

TEST_F(Rule7205Test, RollingHourViolatesWithJustOverLimit) {
    auto ctx = buildBasicContext();
    ensureFlyAssignment(ctx);

    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> dutyStore;

    dutyStore.push_back(makeDuty({"2025-10-01 08:00:00", "2025-10-01 13:00:00"}, ctx, segments, 5*60));
    dutyStore.push_back(makeDuty({"2025-10-01 18:00:00", "2025-10-01 22:59:00"}, ctx, segments, 5*60 - 1));

    auto rawDuties = asRaw(dutyStore);
    auto pairing = makePairing(rawDuties, "AAA");
    pairing->setDbId(7205104);
    ctx->pairingIdMap[pairing->getDbId()] = pairing.get();

    auto rule = makeRule(24, "RH", {"00:00-10:00"}, ctx);
	// DP 9 hours 59 minute in rolling 24 hours with 10 hours limit
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}
