#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7272/CalculateStandbyDPForTGRule.h"
#include "db/Duty.h"
#include "db/Pairing.h"
#include "db/PairingUtil.h"
#include "db/RuleParams.h"
#include "db/Segment.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t utcFromString(const char* s) {
    return utcStrToUtc(const_cast<char*>(s));
}

long long nextDutyId() {
    static long long id = 727200100;
    return ++id;
}

long long nextSegmentId() {
    static long long id = 727200200;
    return ++id;
}

long long nextPairingId() {
    static long long id = 727200300;
    return ++id;
}

long long nextRosterId() {
    static long long id = 727200400;
    return ++id;
}

SharedPtr<CrewDataContext> buildContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenarioId = 1;
    ctx->scenario.airline = "F8";
    ctx->scenario.bases.push_back("YEG");
    ctx->scenario.division = "P";
    ctx->airportUtcOffsetMap["YEG"] = -360;
    ctx->airportZoneIdMap["YEG"] = "America/Edmonton";
    return ctx;
}

RuleInput make7272Input(const std::string& assignments,
                        double rate,
                        const std::string& offset = "00:00",
                        const std::string& sbyLimit = "00:00",
                        const std::string& notifyLimit = "00:00") {
    RuleInput input;
    DBRule row{};
    row.idRule = 7272001;
    row.function = 7272;
    row.tableNum = 0;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 727200101;
    row.overridebility = "S";
    row.severity = 2;
    std::strcpy(row.classType, "R");
    std::strcpy(row.description, "Calculate DP of the Reserves");
    row.params["ASSIGNMENTS"] = assignments;
    row.params["RATE"] = std::to_string(rate);
    row.params["STANDBY OFFSET"] = offset;
    row.params["SBY LIMIT"] = sbyLimit;
    row.params["NOTIFICATION LIMIT"] = notifyLimit;
    input.dbRules.push_back(row);
    return input;
}

std::unique_ptr<CalculateStandbyDPForTGRule> makeRule(const SharedPtr<CrewDataContext>& ctx,
                                                      const RuleInput& input) {
    auto rule = std::make_unique<CalculateStandbyDPForTGRule>(nullptr, input);
    rule->setDataContext(ctx);
    return rule;
}

SharedPtr<ROSTER> makeSimpleStandbyRoster(const std::string& qualifier,
                                          const char* startUtc,
                                          const char* endUtc) {
    auto roster = std::make_shared<ROSTER>();
    roster->rosterId = nextRosterId();
    roster->qualifier = qualifier;
    roster->duty = qualifier;
    roster->location = "YEG";
    roster->pairing = nullptr;

    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    roster->actStrUtc = start;
    roster->actEndUtc = end;
    roster->actRestStrUtc = end;
    roster->actStrLoc = start - 360 * 60;
    roster->actEndLoc = end - 360 * 60;
    roster->actRestStrLoc = end - 360 * 60;
    return roster;
}

std::unique_ptr<Duty> makeStandbyDuty(const char* startUtc,
                                      const char* endUtc,
                                      const std::string& assignment,
                                      std::vector<std::unique_ptr<Segment>>& segStore) {
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);

    auto duty = std::make_unique<Duty>();
    duty->setDutyId(nextDutyId());
    duty->setDepartureStation("YEG");
    duty->setArrivalStation("YEG");
    duty->setAssignment(assignment);
    duty->setStartTimeUtcAct(start);
    duty->setEndTimeUtcAct(end);
    duty->setStartTimeLocAct(start - 360 * 60);
    duty->setEndTimeLocAct(end - 360 * 60);

    auto seg = std::make_unique<Segment>();
    seg->setSegmentId(nextSegmentId());
    seg->setDepSta("YEG");
    seg->setArrSta("YEG");
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeLocAct(start - 360 * 60);
    seg->setEndTimeLocAct(end - 360 * 60);
    seg->setAssignment(assignment);
    seg->setDutyId(duty->getDutyId());
    segStore.push_back(std::move(seg));

    std::vector<Segment*> segRefs{segStore.back().get()};
    duty->setSegments(segRefs);
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

struct StandbyPairingFixture {
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::unique_ptr<Pairing> pairing;
    SharedPtr<ROSTER> roster;
};

StandbyPairingFixture makeStandbyPairingFixture(const SharedPtr<CrewDataContext>& ctx,
                                                const std::string& qualifier,
                                                const char* startUtc,
                                                const char* endUtc) {
    StandbyPairingFixture fixture;
    fixture.dutyStore.push_back(makeStandbyDuty(startUtc, endUtc, qualifier, fixture.segStore));
    const auto duties = asRaw(fixture.dutyStore);

    fixture.pairing = std::make_unique<Pairing>(duties);
    fixture.pairing->setBase("YEG");
    fixture.pairing->setQualifier(qualifier);
    fixture.pairing->setDbId(nextPairingId());
    if (!duties.empty()) {
        fixture.pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        fixture.pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    createPairingNodeOfDuty(fixture.pairing.get(), ctx.get());
    ctx->pairingIdMap[fixture.pairing->getDbId()] = fixture.pairing.get();

    fixture.roster = std::make_shared<ROSTER>();
    fixture.roster->rosterId = nextRosterId();
    fixture.roster->idcrew = "1427";
    fixture.roster->qualifier = qualifier;
    fixture.roster->duty = qualifier;
    fixture.roster->location = "YEG";
    fixture.roster->pairing = fixture.pairing.get();
    fixture.roster->pairId = fixture.pairing->getDbId();

    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    fixture.roster->actStrUtc = start;
    fixture.roster->actEndUtc = end;
    fixture.roster->actRestStrUtc = end;
    fixture.roster->actStrLoc = start - 360 * 60;
    fixture.roster->actEndLoc = end - 360 * 60;
    fixture.roster->actRestStrLoc = end - 360 * 60;
    return fixture;
}

StandbyPairingFixture makeFlyPairingFixture(const SharedPtr<CrewDataContext>& ctx,
                                            const char* reportUtc,
                                            const char* endUtc) {
    return makeStandbyPairingFixture(ctx, "FLY", reportUtc, endUtc);
}

}  // namespace

class Rule7272Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(BATCH_LEGALITY);
        _ctx = buildContext();
    }

    SharedPtr<CrewDataContext> _ctx;
};

// Production-like config: PRAM 12h at YEG 04:00-16:00 local (UTC 10:00-22:00), RATE=0.33.
// DP seconds = 43200 * 0.33 = 14256; minutes = 237.
TEST_F(Rule7272Test, Calculate_Pram12hRate033_Returns14256Seconds) {
    const RuleInput input = make7272Input("SBY|PRAM|PRPM", 0.33);
    auto rule = makeRule(_ctx, input);

    auto roster = makeSimpleStandbyRoster("PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    EXPECT_EQ(rule->Calculate(roster, nullptr), 14256L);
}

TEST_F(Rule7272Test, Calculate_SbyQualifier_MatchesProductionAssignmentList) {
    const RuleInput input = make7272Input("SBY|PRAM|PRPM", 0.33);
    auto rule = makeRule(_ctx, input);

    auto roster = makeSimpleStandbyRoster("SBY", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    EXPECT_EQ(rule->Calculate(roster, nullptr), 14256L);
}

TEST_F(Rule7272Test, Calculate_UnlistedQualifier_ReturnsMinusOne) {
    const RuleInput input = make7272Input("SBY|PRAM|PRPM", 0.33);
    auto rule = makeRule(_ctx, input);

    auto roster = makeSimpleStandbyRoster("RES", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    EXPECT_EQ(rule->Calculate(roster, nullptr), -1L);
}

// Regression: pairing standby uses qualifier=PRAM while assignment group may be SBY.
TEST_F(Rule7272Test, Calculate_AssignmentsSbyOnly_DoesNotMatchPramQualifier) {
    const RuleInput input = make7272Input("SBY", 0.33);
    auto rule = makeRule(_ctx, input);

    auto roster = makeSimpleStandbyRoster("PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    EXPECT_EQ(rule->Calculate(roster, nullptr), -1L);
}

TEST_F(Rule7272Test, Calculate_WithOneHourOffset_ReducesDp) {
    const RuleInput input = make7272Input("PRAM", 0.33, "01:00");
    auto rule = makeRule(_ctx, input);

    auto roster = makeSimpleStandbyRoster("PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    // (43200 - 3600) * 0.33 = 13068
    EXPECT_EQ(rule->Calculate(roster, nullptr), 13068L);
}

TEST_F(Rule7272Test, Calculate_DurationBelowOffset_ReturnsZero) {
    const RuleInput input = make7272Input("PRAM", 0.33, "13:00");
    auto rule = makeRule(_ctx, input);

    auto roster = makeSimpleStandbyRoster("PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    EXPECT_EQ(rule->Calculate(roster, nullptr), 0L);
}

TEST_F(Rule7272Test, CalculatePairingDP_SetsDutyActualDpMinutes) {
    const RuleInput input = make7272Input("PRAM", 0.33);
    auto rule = makeRule(_ctx, input);

    auto fixture = makeStandbyPairingFixture(_ctx, "PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    rule->CalculatePairingDP(fixture.pairing.get());

    ASSERT_EQ(fixture.pairing->getDutyVec().size(), 1u);
    EXPECT_EQ(fixture.pairing->getDuty(0)->getActualDP(), 237);
    EXPECT_EQ(fixture.pairing->getDuty(0)->getDPInSecs(), 14220L);
}

TEST_F(Rule7272Test, CalculateDP_PairingStandby_WritesDutyDp) {
    const RuleInput input = make7272Input("PRAM", 0.33);
    auto rule = makeRule(_ctx, input);

    auto fixture = makeStandbyPairingFixture(_ctx, "PRAM", "2026-06-02 10:00:00", "2026-06-02 22:00:00");
    rule->CalculateDP(fixture.roster, nullptr);

    ASSERT_EQ(fixture.pairing->getDutyVec().size(), 1u);
    EXPECT_EQ(fixture.pairing->getDuty(0)->getActualDP(), 237);
    EXPECT_EQ(fixture.roster->dutyValues.getActDp(0), 237);
}

TEST_F(Rule7272Test, Calculate_Callout_AddsNotifyPeriodWithinLimit) {
    const RuleInput input = make7272Input("PRAM", 0.33, "00:00", "02:00", "04:00");
    auto rule = makeRule(_ctx, input);

    auto standby = makeSimpleStandbyRoster("PRAM", "2026-06-02 08:00:00", "2026-06-02 20:00:00");
    standby->notificationTime = utcFromString("2026-06-02 12:00:00");  // 4h into standby

    auto flyFixture = makeFlyPairingFixture(_ctx, "2026-06-02 14:00:00", "2026-06-02 18:00:00");
    SharedPtr<ROSTER> nextRoster = flyFixture.roster;
    nextRoster->pairing = flyFixture.pairing.get();
    nextRoster->pairId = flyFixture.pairing->getDbId();

    // sbyDuration=4h => 14400*0.33=4752; callout=2h within 4h notify limit => +2376; total=7128
    EXPECT_EQ(rule->Calculate(standby, nextRoster), 7128L);
}
