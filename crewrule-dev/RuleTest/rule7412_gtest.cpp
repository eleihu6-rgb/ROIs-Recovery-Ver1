#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <tuple>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/constant/Constants.h"
#include "RuleEngine/rule/rule7412/CheckMinimumRestPeriodForSQRule.h"
#include "RuleEngine/rule/rule7412/CalculateMinimumRestPeriodForSQRule.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "CustomBiz/CustomBiz.h"

extern long calculateDutyFdp(Duty* duty, CrewDataContext* dbData, CalculationManday FDP);

namespace {

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["AAA"] = 0;
    ctx->airportZoneIdMap["AAA"] = "UTC";
    ctx->assignmentNameGroupMap["FLY"].insert("FLY");
    ctx->assignmentNameGroupMap["MVO"].insert("MVO");
    ctx->assignmentNameGroupMap["MVP"].insert("MVP");

    FLEET a350{};
    a350.fleet = "A350";
    a350.fleetGrp = "WB";
    ctx->fleetMap["A350"] = a350;

    FLEET b737{};
    b737.fleet = "B737";
    b737.fleetGrp = "NB";
    ctx->fleetMap["B737"] = b737;

    return ctx;
}

struct SegmentPlan {
    time_t startUtc{};
    time_t endUtc{};
};

std::unique_ptr<Segment> makeSegment(const SegmentPlan& plan,
                                     const std::string& depStation = "AAA",
                                     const std::string& arrStation = "AAA") {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(depStation);
    seg->setArrStation(arrStation);
    seg->setAssignment("FLY");
    seg->setIsOperating(true);
    seg->setServiceType("J");
    seg->setFleetCD("A350");
    seg->setStartTimeUtcAct(plan.startUtc);
    seg->setEndTimeUtcAct(plan.endUtc);
    seg->setStartTimeUtcSch(plan.startUtc);
    seg->setEndTimeUtcSch(plan.endUtc);
    seg->setStartTimeLocAct(plan.startUtc);
    seg->setEndTimeLocAct(plan.endUtc);
    seg->setStartTimeLocSch(plan.startUtc);
    seg->setEndTimeLocSch(plan.endUtc);
    return seg;
}

std::unique_ptr<Duty> makeDuty(const SegmentPlan& plan,
                               int seq,
                               long long pairingId,
                               std::vector<std::unique_ptr<Segment>>& storage,
                               CrewDataContext* ctx,
                               const std::string& depStation = "AAA",
                               const std::string& arrStation = "AAA") {
    std::vector<Segment*> rawSegments;
    auto seg = makeSegment(plan, depStation, arrStation);
    rawSegments.push_back(seg.get());
    storage.push_back(std::move(seg));

    auto duty = std::make_unique<Duty>(rawSegments);
    duty->setDutySeq(seq);
    duty->setPairingId(pairingId);
    duty->setDepartureStation(depStation);
    duty->setArrivalStation(arrStation);
    duty->setStartTimeUtcAct(plan.startUtc);
    duty->setEndTimeUtcAct(plan.endUtc);
    duty->setStartTimeLocAct(plan.startUtc);
    duty->setEndTimeLocAct(plan.endUtc);
    duty->setActualDropoffMin(0);
    duty->setActualPickupMin(0);
    duty->setMinDropoff(0);
    duty->setMinPickup(0);
    duty->setMinBrief(0);
    duty->setMinDebrief(0);
    duty->setRefTimeZone(0);
    auto dropoff = std::make_shared<PairingDutyNode>();
    dropoff->setType("DUTY");
    dropoff->setNode("DROPOFF");
    dropoff->setSequence(1);
    dropoff->setStartTimeUtcAct(plan.endUtc);
    dropoff->setEndTimeUtcAct(plan.endUtc);
    dropoff->setStartTimeLocAct(plan.endUtc);
    dropoff->setEndTimeLocAct(plan.endUtc);
    dropoff->setStartTimeUtcSch(plan.endUtc);
    dropoff->setEndTimeUtcSch(plan.endUtc);
    dropoff->setStartTimeLocSch(plan.endUtc);
    dropoff->setEndTimeLocSch(plan.endUtc);
    duty->pairingDutyNodes.push_back(dropoff);
    calculatePairingDutyTimes(duty.get(), ctx);
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

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase("AAA");
    pairing->setPrimeActivity("FLY");
    pairing->setId(7412001);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

DBRule makeRow(int rowNum,
               const std::string& currentAssignments,
               const std::string& nextAssignments,
               const std::string& dpRange,
               const std::string& hasLocalNight,
               const std::string& minRest,
               const std::string& minLocalNights,
               const std::string& currentDutyPattern = RuleParamConstant::ALL,
               const std::string& nextDutyPattern = RuleParamConstant::ALL) {
    constexpr int kRuleId = 7412001;
    constexpr int kParamIdBase = 208174200;

    DBRule row{};
    row.idRule = kRuleId;
    row.function = 7412;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.severity = 2;
    row.overridebility = "S";
    row.reference = "ANR-121";
    row.idRuleParam = kParamIdBase + rowNum;
    row.params["CURRENT DUTY PATTERN"] = currentDutyPattern;
    row.params["NEXT DUTY PATTERN"] = nextDutyPattern;
    row.params["CURRENT DUTY ASSIGNMENTS"] = currentAssignments;
    row.params["NEXT DUTY ASSIGNMENTS"] = nextAssignments;
    row.params["DP RANGE"] = dpRange;
    row.params["has Local Night(Y/N)"] = hasLocalNight;
    row.params["MIN REST TIME"] = minRest;
    row.params["MIN LOCAL NIGHTS"] = minLocalNights;
    return row;
}

RuleInput makeDesignDocRuleInput() {
    struct TableRow {
        std::string currentAssignments;
        std::string nextAssignments;
        std::string dpRange;
        std::string hasLocalNight;
        std::string minRest;
        std::string minLocalNights;
    };

    RuleInput input;
    const std::vector<TableRow> rows = {
        {"FLY|MVO", RuleParamConstant::ALL, RuleParamConstant::ALL, "Y", "10:00", RuleParamConstant::ALL},
        {"FLY|MVO", RuleParamConstant::ALL, RuleParamConstant::ALL, "N", "12:00", RuleParamConstant::ALL},
        {"FLY|MVO", RuleParamConstant::ALL, "10:01-11:00", RuleParamConstant::ALL, "11:00", RuleParamConstant::ALL},
        {"FLY|MVO", RuleParamConstant::ALL, "11:01-12:00", RuleParamConstant::ALL, "12:00", RuleParamConstant::ALL},
        {"FLY|MVO", RuleParamConstant::ALL, "12:01-13:00", RuleParamConstant::ALL, "13:00", RuleParamConstant::ALL},
        {"FLY|MVO", RuleParamConstant::ALL, "13:01-14:00", RuleParamConstant::ALL, "14:00", RuleParamConstant::ALL},
        {"FLY|MVO", RuleParamConstant::ALL, "14:01-15:00", RuleParamConstant::ALL, "15:00", RuleParamConstant::ALL},
        {"FLY|MVO", RuleParamConstant::ALL, "15:01-16:00", RuleParamConstant::ALL, "16:00", RuleParamConstant::ALL},
        {"FLY|MVO", RuleParamConstant::ALL, "16:01-99:00", RuleParamConstant::ALL, "24:00", "1"},
        {RuleParamConstant::ALL, "FLY|MVO", RuleParamConstant::ALL, "Y", "10:00", RuleParamConstant::ALL},
        {RuleParamConstant::ALL, "FLY|MVO", RuleParamConstant::ALL, "N", "12:00", RuleParamConstant::ALL},
        {RuleParamConstant::ALL, "FLY|MVO", "10:01-11:00", RuleParamConstant::ALL, "11:00", RuleParamConstant::ALL},
        {RuleParamConstant::ALL, "FLY|MVO", "11:01-12:00", RuleParamConstant::ALL, "12:00", RuleParamConstant::ALL},
        {RuleParamConstant::ALL, "FLY|MVO", "12:01-13:00", RuleParamConstant::ALL, "13:00", RuleParamConstant::ALL},
        {RuleParamConstant::ALL, "FLY|MVO", "13:01-14:00", RuleParamConstant::ALL, "14:00", RuleParamConstant::ALL},
        {RuleParamConstant::ALL, "FLY|MVO", "14:01-15:00", RuleParamConstant::ALL, "15:00", RuleParamConstant::ALL},
        {RuleParamConstant::ALL, "FLY|MVO", "15:01-16:00", RuleParamConstant::ALL, "16:00", RuleParamConstant::ALL},
        {RuleParamConstant::ALL, "FLY|MVO", "16:01-99:00", RuleParamConstant::ALL, "24:00", "1"},
    };

    for (int i = 0; i < static_cast<int>(rows.size()); ++i) {
        const auto& row = rows[i];
        input.dbRules.push_back(makeRow(i + 1,
                                        row.currentAssignments,
                                        row.nextAssignments,
                                        row.dpRange,
                                        row.hasLocalNight,
                                        row.minRest,
                                        row.minLocalNights));
    }
    return input;
}

std::unique_ptr<CheckMinimumRestPeriodForSQRule> makeRule(const SharedPtr<CrewDataContext>& ctx,
                                                          const RuleInput& input) {
    auto rule = std::make_unique<CheckMinimumRestPeriodForSQRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

std::unique_ptr<CalculateMinimumRestPeriodForSQRule> makeCalculateRule(const SharedPtr<CrewDataContext>& ctx,
                                                                       const RuleInput& input) {
    auto rule = std::make_unique<CalculateMinimumRestPeriodForSQRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

void setGroundTimes(Duty* duty, int briefMin, int debriefMin, int pickupMin, int dropoffMin) {
    duty->setMinBrief(briefMin);
    duty->setMinDebrief(debriefMin);
    duty->setMinPickup(pickupMin);
    duty->setMinDropoff(dropoffMin);
    duty->setActualBriefMin(briefMin);
    duty->setActualDebriefMin(debriefMin);
    duty->setActualPickupMin(pickupMin);
    duty->setActualDropoffMin(dropoffMin);

    const auto dropoff = duty->getLastDropoff();
    if (dropoff) {
        const time_t dropoffStart = duty->getEndTimeUtcAct();
        const time_t dropoffEnd = dropoffStart + dropoffMin * 60;
        dropoff->setStartTimeUtcAct(dropoffStart);
        dropoff->setEndTimeUtcAct(dropoffEnd);
        dropoff->setStartTimeLocAct(dropoffStart);
        dropoff->setEndTimeLocAct(dropoffEnd);
        dropoff->setStartTimeUtcSch(dropoffStart);
        dropoff->setEndTimeUtcSch(dropoffEnd);
        dropoff->setStartTimeLocSch(dropoffStart);
        dropoff->setEndTimeLocSch(dropoffEnd);
    }
}

int getMinRestMinutes(const Duty* duty) {
    if (duty == nullptr) {
        return -1;
    }
    return duty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST);
}

const limitaions* getMinRestLimitation(const Duty* duty) {
    if (duty == nullptr) {
        return nullptr;
    }
    return duty->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
}

}  // namespace

class Rule7412Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:00";
        ln.LocalEnd = "06:00";
        ln.MinRestInterval = "08:00";
    }
};

TEST_F(Rule7412Test, PassesWhenRestAndLocalNightMeetMinimums) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-01-01 10:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 10 * 3600}, 1, pairingId, segmentStorage, ctx.get())); // 10h DP
    const time_t secondStart = utcFromString("2025-01-02 08:30:00");  
    // rest from 20:00 - 08:30 next day, 12.5h rest with a local night
    duties.push_back(makeDuty({secondStart, secondStart + 4 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
    // min rest should be 10 hours: 20:00pm + 10 hours = 6am next day includes 1 local night.
    EXPECT_EQ(10 * 60, getMinRestMinutes(duties.front().get()));
    auto* minRestLimitFromCheck = getMinRestLimitation(duties.front().get());
    ASSERT_NE(minRestLimitFromCheck, nullptr);
    EXPECT_FALSE(minRestLimitFromCheck->isFinalChecked);

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);
    auto* minRestLimitFromCalculate = getMinRestLimitation(duties.front().get());
    ASSERT_NE(minRestLimitFromCalculate, nullptr);
    EXPECT_FALSE(minRestLimitFromCalculate->isFinalChecked);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, PassesWhenRestAndLocalNightMeetMinimums2) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-01-01 10:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 9 * 3600}, 1, pairingId, segmentStorage, ctx.get())); // 10h DP
    const time_t secondStart = utcFromString("2025-01-02 06:30:00");  
    // rest from 19:00 - 08:30 next day, 11.5h rest with a local night
    duties.push_back(makeDuty({secondStart, secondStart + 4 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
    // min rest should be 11 hours: 10:00pm + 11 hours = 6am next day includes 1 local night.
    EXPECT_EQ(11 * 60, getMinRestMinutes(duties.front().get()));

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, FailsWhenElevenHoursRestHasNoLocalNight) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-04-01 05:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 8 * 3600}, 1, pairingId, segmentStorage, ctx.get())); // 8h DP
    const time_t secondStart = utcFromString("2025-04-02 00:00:00");  // 11h rest, zero full local night
    duties.push_back(makeDuty({secondStart, secondStart + 4 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());
    EXPECT_EQ(12 * 60, getMinRestMinutes(duties.front().get()));

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, FailsWhenElevenHoursRestHasNoLocalNight2) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-04-01 10:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({ firstStart, firstStart + 9 * 3600 }, 1, pairingId, segmentStorage, ctx.get())); 
    const time_t secondStart = utcFromString("2025-04-02 05:30:00");  // 11h rest, zero full local night
    // rest 19:00 - 5:30 next day, 10:30 rest and no local night
    duties.push_back(makeDuty({ secondStart, secondStart + 4 * 3600 }, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());
    // min rest requirement should be 11 hours, so that a 19:00 + 11 = 06:00, 1 local night is included.
    EXPECT_EQ(11 * 60, getMinRestMinutes(duties.front().get()));

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, PassesWithFourteenHourDpAndRestWithoutLocalNight) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-04-05 18:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 14 * 3600}, 1, pairingId, segmentStorage, ctx.get())); // 14h DP
    const time_t secondStart = utcFromString("2025-04-06 22:00:00");  // 14h rest, no local night coverage
    duties.push_back(makeDuty({secondStart, secondStart + 3 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
    EXPECT_EQ(14 * 60, getMinRestMinutes(duties.front().get()));

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, FailsWhenGroundTimesReduceRestBelowRequirement) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-05-03 18:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 8 * 3600}, 1, pairingId, segmentStorage, ctx.get())); // 8h DP
    const time_t secondStart = utcFromString("2025-05-04 16:00:00");  // 14h between flights before deducting ground times
    duties.push_back(makeDuty({secondStart, secondStart + 3 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    setGroundTimes(duties.front().get(), 60, 30, 60, 90);  // report 60, debrief 30, dropoff 60 (combined in dropoff mins)
    setGroundTimes(duties.back().get(), 60, 0, 60, 0);
    calculatePairingDutyTimes(duties.front().get(), ctx.get());
    calculatePairingDutyTimes(duties.back().get(), ctx.get());

    auto pairing = makePairing(asRaw(duties));

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());
    EXPECT_EQ(12 * 60, getMinRestMinutes(duties.front().get()));

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, FailsWhenActualRestBelowMinimum) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-02-01 04:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 10 * 3600}, 1, pairingId, segmentStorage, ctx.get())); // 10h DP
    const time_t secondStart = utcFromString("2025-02-01 23:30:00");  // 9.5h rest, no full local night
    duties.push_back(makeDuty({secondStart, secondStart + 3 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());
    EXPECT_EQ(12 * 60, getMinRestMinutes(duties.front().get()));

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, FailsWhenRestBelowHighDpRequirement) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-03-01 06:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 16 * 3600 + 30 * 60}, 1, pairingId, segmentStorage, ctx.get())); // 16h30 DP
    // duty end at 02-Mar-2025 22:30 UTC
    // 20h rest (includes a local night) but below the 24h requirement for long DP
    const time_t secondStart = utcFromString("2025-03-02 18:30:00");
    duties.push_back(makeDuty({secondStart, secondStart + 3 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());
    const time_t restStart = firstStart + 16 * 3600 + 30 * 60;
    const int expectedMinRestMinutes = static_cast<int>((utcFromString("2025-03-03 06:00:00") - restStart) / 60);
    EXPECT_EQ(expectedMinRestMinutes, getMinRestMinutes(duties.front().get()));

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, ChoosesStrictestMinRestWhenMultipleRowsApply) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-06-01 08:30:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    const time_t firstEnd = firstStart + 13 * 3600 + 30 * 60;
    duties.push_back(makeDuty({firstStart, firstEnd}, 1, pairingId, segmentStorage, ctx.get()));
    const time_t secondStart = firstEnd + 14 * 3600;
    duties.push_back(makeDuty({secondStart, secondStart + 3 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
    EXPECT_EQ(14 * 60, getMinRestMinutes(duties.front().get()));

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, ExtendsMinRestWhenLocalNightFallsAfterBaseRest) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-07-01 05:31:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 16 * 3600 + 30 * 60}, 1, pairingId, segmentStorage, ctx.get()));
    const time_t secondStart = utcFromString("2025-07-02 22:01:00");
    duties.push_back(makeDuty({secondStart, secondStart + 3 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(1U, violations.size());
    EXPECT_NE(std::string::npos, violations[0]->violation_msg.find("local night count"));
    EXPECT_EQ(std::string::npos, violations[0]->violation_msg.find("actual rest period"));
    EXPECT_NE(std::string::npos, violations[0]->violation_msg.find("cannot be assigned until"));
    const time_t restStart = firstStart + 16 * 3600 + 30 * 60;
    const time_t requiredRestEnd = utcFromString("2025-07-03 06:00:00");
    const int expectedMinRestMinutes = static_cast<int>((requiredRestEnd - restStart) / 60);
    EXPECT_EQ(expectedMinRestMinutes, getMinRestMinutes(duties.front().get()));

    auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
    calRule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, FailsWithSingleCombinedViolationWhenRestAndLocalNightAreInsufficient) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-07-01 05:31:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 16 * 3600 + 30 * 60}, 1, pairingId, segmentStorage, ctx.get()));
    const time_t secondStart = utcFromString("2025-07-02 21:00:00");  // 22:59 rest, zero full local night
    duties.push_back(makeDuty({secondStart, secondStart + 3 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(1U, violations.size());
    EXPECT_NE(std::string::npos, violations[0]->violation_msg.find("actual rest period"));
    EXPECT_NE(std::string::npos, violations[0]->violation_msg.find("local night count"));
    EXPECT_NE(std::string::npos, violations[0]->violation_msg.find("cannot be assigned until"));
    EXPECT_NE(std::string::npos, violations[0]->violation_msg.find("minimum required rest (24:00)"));
    EXPECT_NE(std::string::npos, violations[0]->violation_msg.find("minimum required local night count (1)"));

    const time_t restStart = firstStart + 16 * 3600 + 30 * 60;
    const time_t requiredRestEnd = utcFromString("2025-07-03 06:00:00");
    const int expectedMinRestMinutes = static_cast<int>((requiredRestEnd - restStart) / 60);
    EXPECT_EQ(expectedMinRestMinutes, getMinRestMinutes(duties.front().get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, LastDutyOfPairingRecordsMinRestLimit) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-08-01 06:00:00");
    const time_t secondStart = utcFromString("2025-08-02 06:00:00");
    const time_t thirdStart = utcFromString("2025-08-02 23:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 8 * 3600}, 1, pairingId, segmentStorage, ctx.get()));
    duties.push_back(makeDuty({secondStart, secondStart + 4 * 3600}, 2, pairingId, segmentStorage, ctx.get()));
    duties.push_back(makeDuty({thirdStart, thirdStart + 5 * 3600}, 3, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
    EXPECT_EQ(12 * 60, getMinRestMinutes(duties[1].get()));

	auto minRestFromCheck = getMinRestMinutes(duties[1].get());
    auto calRule = makeCalculateRule(ctx, makeDesignDocRuleInput());
	calRule->CalculateDuty(pairing.get());
	auto minRestFromCalculate = getMinRestMinutes(duties[1].get());
    EXPECT_EQ(minRestFromCalculate, minRestFromCheck);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, FinalDutyMinRestShouldBeSetInCheck) {
    auto ctx = buildDataContext();
    auto rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 36801863;
    const time_t firstStart = 1756692600;
    const time_t secondStart = 1756816500;
    const time_t firstEnd = 1756724700;
    const time_t secondEnd = 1756848600;

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstEnd}, 1, pairingId, segmentStorage, ctx.get()));
    duties.push_back(makeDuty({secondStart, secondEnd}, 2, pairingId, segmentStorage, ctx.get()));

    setGroundTimes(duties.front().get(), 60, 30, 0, 60);
    calculatePairingDutyTimes(duties.front().get(), ctx.get());
    calculatePairingDutyTimes(duties.back().get(), ctx.get());

    auto pairing = makePairing(asRaw(duties));

    EXPECT_EQ(true, rule->CheckRule(pairing.get()));
    EXPECT_GT(getMinRestMinutes(duties.back().get()), 0);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, CalculateRuleAppliesMinRestRequirement) {
    auto ctx = buildDataContext();
    auto rule = makeCalculateRule(ctx, makeDesignDocRuleInput());

    const long long pairingId = 9007412;
    const time_t firstStart = utcFromString("2025-01-01 10:00:00");
    const time_t secondStart = utcFromString("2025-01-02 08:30:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({firstStart, firstStart + 10 * 3600}, 1, pairingId, segmentStorage, ctx.get()));
    duties.push_back(makeDuty({secondStart, secondStart + 4 * 3600}, 2, pairingId, segmentStorage, ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    rule->CalculateDuty(pairing.get());
    auto minRestFromCalculate = getMinRestMinutes(duties.front().get());

    auto check_rule = makeRule(ctx, makeDesignDocRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    check_rule->setRuleViolation(&violations);
    check_rule->CheckRule(pairing.get());

	auto minRestFromCheck = getMinRestMinutes(duties.front().get());
    

    EXPECT_EQ(10 * 60, minRestFromCalculate);

    EXPECT_EQ(minRestFromCheck, minRestFromCalculate);
}

TEST_F(Rule7412Test, DpOver20UsesIncrementalMinRestFormulaForPositioning) {
    auto ctx = buildDataContext();

    RuleInput input;

    DBRule control{};
    control.idRule = 7412003;
    control.function = 7412;
    control.tableNum = 2;
    control.rowNum = 1;
    control.idRuleParam = 741200300001;
    control.params["SERVICE TYPE"] = "J";
    control.params["FLEET GROUP"] = "WB";
    input.dbRules.push_back(control);

    DBRule row{};
    row.idRule = 7412003;
    row.function = 7412;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 741200300101;
    row.params["CURRENT DUTY ASSIGNMENTS"] = RuleParamConstant::ALL;
    row.params["NEXT DUTY ASSIGNMENTS"] = "MVP";
    row.params["DP RANGE"] = "20:01-99:00";
    row.params["has Local Night(Y/N)"] = RuleParamConstant::ALL;
    row.params["MIN REST TIME"] = "24:00";
    row.params["MIN LOCAL NIGHTS"] = "1";
    row.params["Incremental Rest Per DP Hour"] = "02:00";
    input.dbRules.push_back(row);

    auto rule = makeRule(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    const time_t duty1Start = utcFromString("2025-01-01 22:30:00");
    const time_t duty1End = utcFromString("2025-01-02 21:00:00");   // DP 22:30
    const time_t duty2StartShort = utcFromString("2025-01-04 00:30:00"); // Rest 27:30 (short of requirement)
    const time_t duty2End = utcFromString("2025-01-04 03:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({duty1Start, duty1End}, 1, pairingId, segmentStorage, ctx.get()));
    duties.back()->setDPInSecs(duties.back()->getEndTimeUtcAct() - duties.back()->getStartTimeUtcAct());

    duties.push_back(makeDuty({duty2StartShort, duty2End}, 2, pairingId, segmentStorage, ctx.get()));
    duties.back()->setAssignment("MVP");
    duties.back()->setDPInSecs(duties.back()->getEndTimeUtcAct() - duties.back()->getStartTimeUtcAct());

    // Rule 7412 control-table fleet group is evaluated across the rest boundary:
    // the control row applies if either the current duty or the next duty matches "WB".
    // Ensure neither side is "WB", so the WB control row does not apply.
    auto* firstSeg = duties.front()->getSegmentsRead().empty() ? nullptr : duties.front()->getSegmentsRead().front();
    auto* secondSeg = duties.back()->getSegmentsRead().empty() ? nullptr : duties.back()->getSegmentsRead().front();
    ASSERT_NE(firstSeg, nullptr);
    ASSERT_NE(secondSeg, nullptr);
    firstSeg->setFleetCD("B737");
    secondSeg->setFleetCD("B737");

    auto pairing = makePairing(asRaw(duties));
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();

    // Switch only the next duty to WB; because either side may match the control fleet group,
    // validate that the same short rest fails due to the >20 DP formula:
    // required rest = 24:00 + 2:00 * floor((22:30 - 20:01)/1:00) = 28:00.
    secondSeg->setFleetCD("A350");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();

    // Extend rest to exactly 28:00 -> should pass.
    duties.back()->setStartTimeUtcAct(utcFromString("2025-01-04 01:00:00"));
    duties.back()->setStartTimeUtcSch(duties.back()->getStartTimeUtcAct());
    duties.back()->setStartTimeLocAct(duties.back()->getStartTimeUtcAct());
    duties.back()->setStartTimeLocSch(duties.back()->getStartTimeUtcAct());
    duties.back()->setDPInSecs(duties.back()->getEndTimeUtcAct() - duties.back()->getStartTimeUtcAct());

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, IncrementalRestCountsOnlyFullHoursAboveDpRangeLowerBound) {
    auto ctx = buildDataContext();

    RuleInput input;
    input.dbRules.push_back(makeRow(1,
                                    RuleParamConstant::ALL,
                                    "MVP",
                                    "20:01-99:00",
                                    RuleParamConstant::ALL,
                                    "24:00",
                                    RuleParamConstant::ALL));
    input.dbRules.back().params["INCREMENTAL REST PER DP HOUR"] = "02:00";

    auto rule = makeRule(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;

    auto runCase = [&](const std::string& dutyEnd, const std::string& nextStart, bool expectLegal) {
        std::vector<std::unique_ptr<Segment>> segmentStorage;
        std::vector<std::unique_ptr<Duty>> duties;

        const time_t duty1Start = utcFromString("2025-01-01 00:00:00");
        const time_t duty1End = utcFromString(dutyEnd);
        const time_t duty2Start = utcFromString(nextStart);
        const time_t duty2End = duty2Start + 3600;

        duties.push_back(makeDuty({duty1Start, duty1End}, 1, pairingId, segmentStorage, ctx.get()));
        duties.back()->setDPInSecs(duties.back()->getEndTimeUtcAct() - duties.back()->getStartTimeUtcAct());

        duties.push_back(makeDuty({duty2Start, duty2End}, 2, pairingId, segmentStorage, ctx.get()));
        duties.back()->setAssignment("MVP");
        duties.back()->setDPInSecs(duties.back()->getEndTimeUtcAct() - duties.back()->getStartTimeUtcAct());

        auto pairing = makePairing(asRaw(duties));
        EXPECT_EQ(expectLegal, rule->CheckRule(pairing.get()));

        for (auto* rv : violations) {
            delete rv;
        }
        violations.clear();
    };

    // DP=21:00 => (21:00 - 20:01)=59m => 0 increments => required rest 24:00.
    runCase("2025-01-01 21:00:00", "2025-01-02 21:00:00", true);

    // DP=21:01 => (21:01 - 20:01)=60m => 1 increment => required rest 26:00.
    runCase("2025-01-01 21:01:00", "2025-01-02 21:01:00", false);
    runCase("2025-01-01 21:01:00", "2025-01-02 23:01:00", true);
}

TEST_F(Rule7412Test, IgnoresIntermediateAndEdgeDutiesWhenConfigured) {
    auto ctx = buildDataContext();

    RuleInput input = makeDesignDocRuleInput();
    DBRule control{};
    control.idRule = 7412001;
    control.function = 7412;
    control.tableNum = 2;
    control.rowNum = 1;
    control.idRuleParam = 741200199999;
    control.params["SERVICE TYPE"] = "*";
    control.params["FLEET GROUP"] = "*";
    control.params["IGNORE INTERMEDIATE DUTY ASSIGNMENTS"] = "SBY";
    control.params["ASSIGNMENTS REDUCE REST AND LOCAL NIGHT"] = "NO";
    input.dbRules.push_back(control);

    const long long pairingId = 9007412;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({utcFromString("2025-06-01 00:00:00"), utcFromString("2025-06-01 02:00:00")},
                              1,
                              pairingId,
                              segmentStorage,
                              ctx.get()));
    duties.back()->setAssignment("SBY");

    duties.push_back(makeDuty({utcFromString("2025-06-01 02:00:00"), utcFromString("2025-06-01 12:00:00")},
                              2,
                              pairingId,
                              segmentStorage,
                              ctx.get()));

    duties.push_back(makeDuty({utcFromString("2025-06-03 00:00:00"), utcFromString("2025-06-03 04:00:00")},
                              3,
                              pairingId,
                              segmentStorage,
                              ctx.get()));
    duties.back()->setAssignment("SBY");

    duties.push_back(makeDuty({utcFromString("2025-06-03 12:00:00"), utcFromString("2025-06-03 20:00:00")},
                              4,
                              pairingId,
                              segmentStorage,
                              ctx.get()));

    duties.push_back(makeDuty({utcFromString("2025-06-04 00:00:00"), utcFromString("2025-06-04 02:00:00")},
                              5,
                              pairingId,
                              segmentStorage,
                              ctx.get()));
    duties.back()->setAssignment("SBY");

    auto pairing = makePairing(asRaw(duties));

    // Without the Table 2 ignore control, standby duties are treated as rest boundaries and fail the 8h connection.
    {
        auto ruleNoControl = makeRule(ctx, makeDesignDocRuleInput());
        std::vector<RULE_VIOLATION*> violations;
        ruleNoControl->setRuleViolation(&violations);
        EXPECT_FALSE(ruleNoControl->CheckRule(pairing.get()));
        for (auto* rv : violations) {
            delete rv;
        }
    }

    // With ignore control, the boundary is FLY -> FLY and the pairing is legal.
    {
        auto rule = makeRule(ctx, input);
        std::vector<RULE_VIOLATION*> violations;
        rule->setRuleViolation(&violations);
        EXPECT_TRUE(rule->CheckRule(pairing.get()));
        EXPECT_TRUE(violations.empty());
        for (auto* rv : violations) {
            delete rv;
        }
    }
}

TEST_F(Rule7412Test, IntermediateDutiesCanReduceEffectiveRestMinutes) {
    auto ctx = buildDataContext();

    RuleInput input;
    input.dbRules.push_back(makeRow(1,
                                    RuleParamConstant::ALL,
                                    RuleParamConstant::ALL,
                                    "00:00-99:00",
                                    RuleParamConstant::ALL,
                                    "12:00",
                                    RuleParamConstant::ALL));

    DBRule control{};
    control.idRule = 7412001;
    control.function = 7412;
    control.tableNum = 2;
    control.rowNum = 1;
    control.idRuleParam = 741200199999;
    control.params["IGNORE INTERMEDIATE DUTY ASSIGNMENTS"] = "SBY";
    control.params["ASSIGNMENTS REDUCE REST AND LOCAL NIGHT"] = "SBY";
    input.dbRules.push_back(control);

    const long long pairingId = 9007412;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({utcFromString("2025-01-01 10:00:00"), utcFromString("2025-01-01 18:00:00")},
                              1,
                              pairingId,
                              segmentStorage,
                              ctx.get()));

    duties.push_back(makeDuty({utcFromString("2025-01-01 20:00:00"), utcFromString("2025-01-02 00:00:00")},
                              2,
                              pairingId,
                              segmentStorage,
                              ctx.get()));
    duties.back()->setAssignment("SBY");

    duties.push_back(makeDuty({utcFromString("2025-01-02 06:00:00"), utcFromString("2025-01-02 08:00:00")},
                              3,
                              pairingId,
                              segmentStorage,
                              ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    // Base rest is 12:00 (18:00 -> 06:00) but standby consumes 4:00 -> effective rest becomes 8:00.
    auto rule = makeRule(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());
    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, IntermediateDutiesCanReduceEffectiveLocalNightCount) {
    auto ctx = buildDataContext();

    RuleInput input;
    input.dbRules.push_back(makeRow(1,
                                    RuleParamConstant::ALL,
                                    RuleParamConstant::ALL,
                                    "00:00-99:00",
                                    RuleParamConstant::ALL,
                                    "00:00",
                                    "1"));

    DBRule control{};
    control.idRule = 7412001;
    control.function = 7412;
    control.tableNum = 2;
    control.rowNum = 1;
    control.idRuleParam = 741200199999;
    control.params["IGNORE INTERMEDIATE DUTY ASSIGNMENTS"] = "SBY";
    control.params["ASSIGNMENTS REDUCE REST AND LOCAL NIGHT"] = "SBY";
    input.dbRules.push_back(control);

    const long long pairingId = 9007412;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({utcFromString("2025-01-01 12:00:00"), utcFromString("2025-01-01 20:00:00")},
                              1,
                              pairingId,
                              segmentStorage,
                              ctx.get()));

    // Standby during local night breaks continuous coverage (22:00-06:00 needs 8h).
    duties.push_back(makeDuty({utcFromString("2025-01-01 23:00:00"), utcFromString("2025-01-02 01:00:00")},
                              2,
                              pairingId,
                              segmentStorage,
                              ctx.get()));
    duties.back()->setAssignment("SBY");

    duties.push_back(makeDuty({utcFromString("2025-01-02 08:00:00"), utcFromString("2025-01-02 10:00:00")},
                              3,
                              pairingId,
                              segmentStorage,
                              ctx.get()));

    auto pairing = makePairing(asRaw(duties));

    auto rule = makeRule(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());
    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, Table2ControlsAreIsolatedPerRuleInstance) {
    auto ctx = buildDataContext();

    auto makeAnyAnyMinRestRowFor = [](long long ruleId, long long ruleParamId, int rowNum, const std::string& minRest) {
        DBRule row{};
        row.idRule = ruleId;
        row.function = 7412;
        row.tableNum = 1;
        row.rowNum = rowNum;
        row.severity = 2;
        row.overridebility = "S";
        row.reference = "TEST";
        row.idRuleParam = ruleParamId;
        row.params["CURRENT DUTY ASSIGNMENTS"] = RuleParamConstant::ALL;
        row.params["NEXT DUTY ASSIGNMENTS"] = RuleParamConstant::ALL;
        row.params["DP RANGE"] = RuleParamConstant::ALL;
        row.params["has Local Night(Y/N)"] = RuleParamConstant::ALL;
        row.params["MIN REST TIME"] = minRest;
        row.params["MIN LOCAL NIGHTS"] = RuleParamConstant::ALL;
        return row;
    };

    auto makeControlRowFor = [](long long ruleId,
                                long long ruleParamId,
                                const std::string& ignoreAssignments,
                                const std::string& reduceAssignments) {
        DBRule control{};
        control.idRule = ruleId;
        control.function = 7412;
        control.tableNum = 2;
        control.rowNum = 1;
        control.idRuleParam = ruleParamId;
        control.overridebility = "S";
        control.reference = "TEST";
        control.params["IGNORE INTERMEDIATE DUTY ASSIGNMENTS"] = ignoreAssignments;
        control.params["ASSIGNMENTS REDUCE REST AND LOCAL NIGHT"] = reduceAssignments;
        return control;
    };

    const long long rule1 = 7412001;
    const long long rule2 = 7412002;

    RuleInput inputRule1;
    inputRule1.dbRules.push_back(makeAnyAnyMinRestRowFor(rule1, 741200100001, 1, "12:00"));
    inputRule1.dbRules.push_back(makeControlRowFor(rule1, 741200199999, "SBY", "NO"));

    RuleInput inputRule2;
    inputRule2.dbRules.push_back(makeAnyAnyMinRestRowFor(rule2, 741200200001, 1, "12:00"));
    inputRule2.dbRules.push_back(makeControlRowFor(rule2, 741200299999, "NO", "NO"));

    RuleInput inputBoth;
    inputBoth.dbRules.insert(inputBoth.dbRules.end(), inputRule1.dbRules.begin(), inputRule1.dbRules.end());
    inputBoth.dbRules.insert(inputBoth.dbRules.end(), inputRule2.dbRules.begin(), inputRule2.dbRules.end());

    const long long pairingId = 9007412;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({utcFromString("2025-06-01 10:00:00"), utcFromString("2025-06-01 22:00:00")},
                              1,
                              pairingId,
                              segmentStorage,
                              ctx.get()));
    duties.back()->setAssignment("SBY");

    duties.push_back(makeDuty({utcFromString("2025-06-02 08:00:00"), utcFromString("2025-06-02 18:00:00")},
                              2,
                              pairingId,
                              segmentStorage,
                              ctx.get()));

    duties.push_back(makeDuty({utcFromString("2025-06-02 20:00:00"), utcFromString("2025-06-03 04:00:00")},
                              3,
                              pairingId,
                              segmentStorage,
                              ctx.get()));
    duties.back()->setAssignment("SBY");

    duties.push_back(makeDuty({utcFromString("2025-06-03 18:00:00"), utcFromString("2025-06-03 22:00:00")},
                              4,
                              pairingId,
                              segmentStorage,
                              ctx.get()));

    duties.push_back(makeDuty({utcFromString("2025-06-04 00:00:00"), utcFromString("2025-06-04 02:00:00")},
                              5,
                              pairingId,
                              segmentStorage,
                              ctx.get()));
    duties.back()->setAssignment("SBY");

    auto pairing = makePairing(asRaw(duties));

    // Rule 1 ignores SBY boundaries (including ends) -> should pass.
    {
        auto rule = std::make_unique<CheckMinimumRestPeriodForSQRule>(nullptr, inputRule1);
        rule->setDataContext(ctx);
        rule->setApplication(PAIRING_EDITOR);
        std::vector<RULE_VIOLATION*> violations;
        rule->setRuleViolation(&violations);
        EXPECT_TRUE(rule->CheckRule(pairing.get()));
        EXPECT_TRUE(violations.empty());
        for (auto* rv : violations) {
            delete rv;
        }
    }

    // Rule 2 does not ignore anything -> should fail (short rests around SBY).
    {
        auto rule = std::make_unique<CheckMinimumRestPeriodForSQRule>(nullptr, inputRule2);
        rule->setDataContext(ctx);
        rule->setApplication(PAIRING_EDITOR);
        std::vector<RULE_VIOLATION*> violations;
        rule->setRuleViolation(&violations);
        EXPECT_FALSE(rule->CheckRule(pairing.get()));
        EXPECT_FALSE(violations.empty());
        bool sawRule2 = false;
        for (auto* rv : violations) {
            sawRule2 = sawRule2 || (rv != nullptr && rv->idRule == rule2);
            delete rv;
        }
        EXPECT_TRUE(sawRule2);
    }

    // Both instances together -> should fail due to Rule 2 only; Rule 1's ignore must not "leak".
    {
        auto rule = std::make_unique<CheckMinimumRestPeriodForSQRule>(nullptr, inputBoth);
        rule->setDataContext(ctx);
        rule->setApplication(PAIRING_EDITOR);
        std::vector<RULE_VIOLATION*> violations;
        rule->setRuleViolation(&violations);
        EXPECT_FALSE(rule->CheckRule(pairing.get()));
        EXPECT_FALSE(violations.empty());
        bool sawRule1 = false;
        bool sawRule2 = false;
        for (auto* rv : violations) {
            if (rv != nullptr && rv->idRule == rule1) {
                sawRule1 = true;
            }
            if (rv != nullptr && rv->idRule == rule2) {
                sawRule2 = true;
            }
            delete rv;
        }
        EXPECT_FALSE(sawRule1);
        EXPECT_TRUE(sawRule2);
    }
}

TEST_F(Rule7412Test, DutyPatternWithFlexibleExprAppliesWhenCurrentAndNextDutyMatch) {
    auto ctx = buildDataContext();

    RuleInput input;
    input.dbRules.push_back(makeRow(1,
                                    RuleParamConstant::ALL,
                                    RuleParamConstant::ALL,
                                    "00:00-99:00",
                                    RuleParamConstant::ALL,
                                    "20:00",
                                    RuleParamConstant::ALL,
                                    "(SIN|JNB)-FRA",
                                    "FRA-(*~SIN)"));

    auto rule = makeRule(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({utcFromString("2025-07-01 00:00:00"), utcFromString("2025-07-01 08:00:00")},
                              1,
                              pairingId,
                              segmentStorage,
                              ctx.get(),
                              "SIN",
                              "FRA"));
    duties.push_back(makeDuty({utcFromString("2025-07-01 20:00:00"), utcFromString("2025-07-02 04:00:00")},
                              2,
                              pairingId,
                              segmentStorage,
                              ctx.get(),
                              "FRA",
                              "JNB"));

    auto pairing = makePairing(asRaw(duties));

    // Rest is only 12:00, so this should fail because the duty-pattern row applies.
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());
    EXPECT_EQ(20 * 60, getMinRestMinutes(duties.front().get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7412Test, DutyPatternRowIsSkippedWhenNextDutyPatternDoesNotMatch) {
    auto ctx = buildDataContext();

    RuleInput input;
    input.dbRules.push_back(makeRow(1,
                                    RuleParamConstant::ALL,
                                    RuleParamConstant::ALL,
                                    "00:00-99:00",
                                    RuleParamConstant::ALL,
                                    "20:00",
                                    RuleParamConstant::ALL,
                                    "(SIN|JNB)-FRA",
                                    "FRA-(*~SIN)"));

    auto rule = makeRule(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({utcFromString("2025-07-01 00:00:00"), utcFromString("2025-07-01 08:00:00")},
                              1,
                              pairingId,
                              segmentStorage,
                              ctx.get(),
                              "SIN",
                              "FRA"));
    duties.push_back(makeDuty({utcFromString("2025-07-01 20:00:00"), utcFromString("2025-07-02 04:00:00")},
                              2,
                              pairingId,
                              segmentStorage,
                              ctx.get(),
                              "FRA",
                              "SIN"));

    auto pairing = makePairing(asRaw(duties));

    // NEXT DUTY PATTERN is FRA-(*~SIN), so FRA-SIN does not match and this row is ignored.
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
}

TEST_F(Rule7412Test, FleetControlFallsBackToNextDutyWhenCurrentMvpHasNoOperatingSegment) {
    auto ctx = buildDataContext();

    RuleInput input;
    input.dbRules.push_back(makeRow(1,
                                    "FLY|MVO|MVP",
                                    RuleParamConstant::ALL,
                                    "00:00-999:00",
                                    RuleParamConstant::ALL,
                                    "12:00",
                                    RuleParamConstant::ALL));

    DBRule control{};
    control.idRule = 7412141;
    control.function = 7412;
    control.tableNum = 2;
    control.rowNum = 1;
    control.idRuleParam = 741214100001;
    control.overridebility = "S";
    control.reference = "TEST";
    control.params["SERVICE TYPE"] = "J";
    control.params["FLEET GROUP"] = "WB";
    control.params["IGNORE INTERMEDIATE DUTY ASSIGNMENTS"] = "SBY";
    control.params["ASSIGNMENTS REDUCE REST AND LOCAL NIGHT"] = "SBY";
    input.dbRules.push_back(control);

    auto rule = makeRule(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 9007412141;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({utcFromString("2025-05-01 01:55:00"), utcFromString("2025-05-01 09:30:00")},
                              1,
                              pairingId,
                              segmentStorage,
                              ctx.get(),
                              "SIN",
                              "BNE"));
    duties.front()->setAssignment("MVP");
    duties.front()->getSegment(0)->setAssignment("DHD");
    duties.front()->getSegment(0)->setIsOperating(false);
    duties.front()->getSegment(0)->setFleetCD("A350");
    duties.front()->setDPInSecs(545 * 60);
    setGroundTimes(duties.front().get(), 60, 30, 0, 60);
    calculatePairingDutyTimes(duties.front().get(), ctx.get());

    duties.push_back(makeDuty({utcFromString("2025-05-01 20:20:00"), utcFromString("2025-05-02 04:25:00")},
                              2,
                              pairingId,
                              segmentStorage,
                              ctx.get(),
                              "BNE",
                              "SIN"));
    duties.back()->setAssignment("MVO");
    duties.back()->getSegment(0)->setAssignment("FLY");
    duties.back()->getSegment(0)->setIsOperating(true);
    duties.back()->getSegment(0)->setFleetCD("A350");
    setGroundTimes(duties.back().get(), 60, 30, 0, 60);
    calculatePairingDutyTimes(duties.back().get(), ctx.get());

    auto pairing = makePairing(asRaw(duties));

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());
    EXPECT_EQ(12 * 60, getMinRestMinutes(duties.front().get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

