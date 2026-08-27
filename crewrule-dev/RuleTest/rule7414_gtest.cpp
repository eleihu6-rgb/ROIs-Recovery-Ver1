#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>
#include <cstring>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7414/CheckAnrConsecutiveSpecialDutyRule.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "../utils/TimeUtils.h"

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["AAA"] = 0;
    ctx->airportZoneIdMap["AAA"] = "UTC";
    return ctx;
}

struct SegmentPlan {
    time_t startUtc{};
    time_t endUtc{};
    bool operating{true};
    bool deadhead{false};
};

std::unique_ptr<Segment> makeSegment(const SegmentPlan& plan) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation("AAA");
    seg->setArrStation("AAA");
    seg->setStartTimeUtcAct(plan.startUtc);
    seg->setEndTimeUtcAct(plan.endUtc);
    seg->setStartTimeUtcSch(plan.startUtc);
    seg->setEndTimeUtcSch(plan.endUtc);
    seg->setStartTimeLocAct(plan.startUtc);
    seg->setEndTimeLocAct(plan.endUtc);
    seg->setStartTimeLocSch(plan.startUtc);
    seg->setEndTimeLocSch(plan.endUtc);
    seg->setActTakeOffUtc(plan.startUtc);
    seg->setActTouchDownUtc(plan.endUtc);
    seg->setIsOperating(plan.operating);
    seg->setIsDeadhead(plan.deadhead);
    seg->setAssignment(plan.deadhead ? "DHD" : "FLT");
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<SegmentPlan>& segments,
                               int seq,
                               long long pairingId,
                               std::vector<std::unique_ptr<Segment>>& storage,
                               int refOffsetMinutes = 0) {
    std::vector<Segment*> raw;
    raw.reserve(segments.size());
    for (const auto& plan : segments) {
        auto seg = makeSegment(plan);
        raw.push_back(seg.get());
        storage.push_back(std::move(seg));
    }

    auto duty = std::make_unique<Duty>(raw);
    duty->setDutySeq(seq);
    duty->setPairingId(pairingId);
    duty->setDepartureStation("AAA");
    duty->setArrivalStation("AAA");
    duty->setStartTimeUtcAct(raw.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(raw.back()->getEndTimeUtcAct());
    duty->setStartTimeLocAct(raw.front()->getStartTimeLocAct());
    duty->setEndTimeLocAct(raw.back()->getEndTimeLocAct());
    duty->setActualDropoffMin(0);
    duty->setActualPickupMin(0);
    duty->setRefTimeZone(refOffsetMinutes);
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
                                     const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setPrimeActivity("FLY");
    pairing->setId(90014);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

RuleInput makeRuleInput(const std::string& includeTrailingDeadhead = "Y",
                        const std::string& minRest = "24:00",
                        const std::string& minLocalNights = "1") {
    RuleInput input;

    DBRule inside{};
    inside.idRule = 7414001;
    inside.function = 7414;
    inside.tableNum = 1;
    inside.rowNum = 1;
    inside.phase = 1;
    inside.idRuleParam = 208178101;
    inside.overridebility = "S";
    std::strcpy(inside.description, "ANR consecutive special duty rest requirement");
    inside.reference = "ANR-121";
    inside.params["Include trailing deadhead"] = includeTrailingDeadhead;
    inside.params["Rest Type"] = "IN";
    inside.params["Num Consecutive Duties"] = "3";
    inside.params["Min Rest Time"] = minRest;
    inside.params["Min Local Nights"] = minLocalNights;
    input.dbRules.push_back(inside);

    DBRule prior = inside;
    prior.rowNum = 2;
    prior.idRuleParam = 208178102;
    prior.params["Rest Type"] = "PRE";
    prior.params["Num Consecutive Duties"] = "2";
    input.dbRules.push_back(prior);
    return input;
}

RuleInput makeRuleInputWithControl(const std::string& ignoredAssignments,
                                   const std::string& reducingAssignments,
                                   const std::string& includeTrailingDeadhead = "Y",
                                   const std::string& minRest = "24:00",
                                   const std::string& minLocalNights = "1") {
    RuleInput input = makeRuleInput(includeTrailingDeadhead, minRest, minLocalNights);

    DBRule control{};
    control.idRule = 7414001;
    control.function = 7414;
    control.tableNum = 2;
    control.rowNum = 1;
    control.phase = 1;
    control.idRuleParam = 208178199;
    control.overridebility = "S";
    std::strcpy(control.description, "ANR consecutive special duty control");
    control.reference = "ANR-121";
    control.params["Ignore intermediate duty assignments"] = ignoredAssignments;
    control.params["Assignments reduce rest and local night"] = reducingAssignments;
    input.dbRules.push_back(control);

    return input;
}

RuleInput makePostOnlyRuleInput(const std::string& minRest = "24:00",
                                const std::string& minLocalNights = "1") {
    RuleInput input;

    DBRule post{};
    post.idRule = 7414001;
    post.function = 7414;
    post.tableNum = 1;
    post.rowNum = 1;
    post.phase = 1;
    post.idRuleParam = 208178103;
    post.overridebility = "S";
    std::strcpy(post.description, "ANR consecutive special duty post rest requirement");
    post.reference = "ANR-121";
    post.params["Include trailing deadhead"] = "Y";
    post.params["Rest Type"] = "POST";
    post.params["Num Consecutive Duties"] = "3";
    post.params["Min Rest Time"] = minRest;
    post.params["Min Local Nights"] = minLocalNights;
    input.dbRules.push_back(post);

    return input;
}

std::unique_ptr<CheckAnrConsecutiveSpecialDutyRule> makeRule7414(
    const SharedPtr<CrewDataContext>& ctx,
    const RuleInput& input) {
    auto rule = std::make_unique<CheckAnrConsecutiveSpecialDutyRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

}  // namespace

class Rule7414Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& wocl = RuleParams::GetInstancePtr()->getWOCLDefinition();
        wocl.woclStart = TimeUtils::hhmmToMinutes("02:00");
        wocl.woclEnd = TimeUtils::hhmmToMinutes("05:59");
        auto& es = RuleParams::GetInstancePtr()->getEarlyStartDefinition();
        es.earlyStartStart = TimeUtils::hhmmToMinutes("02:00");
        es.earlyStartEnd = TimeUtils::hhmmToMinutes("06:00");
        auto& lf = RuleParams::GetInstancePtr()->getLateFinishDefinition();
        lf.lateFinishStart = TimeUtils::hhmmToMinutes("22:00");
        lf.lateFinishEnd = TimeUtils::hhmmToMinutes("23:59");
        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:00";
        ln.LocalEnd = "06:00";
        ln.MinRestInterval = "08:00";
    }
};

TEST_F(Rule7414Test, FlagsWhenNoQualifyingRestAcrossThreeSpecialDuties) {
    auto ctx = buildDataContext();
    auto rule = makeRule7414(ctx, makeRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414001;
    const time_t firstStart = utcFromString("2025-01-01 02:00:00");
    const int dutyMinutes = 120;  // 2 hours
    const time_t dutyDuration = dutyMinutes * 60;

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    auto buildDuty = [&](time_t startUtc, int seq) {
        SegmentPlan flight{startUtc, startUtc + dutyMinutes * 60, true, false};
        duties.push_back(makeDuty({flight}, seq, pairingId, segmentStorage));
    };

    buildDuty(firstStart, 1);
    const time_t secondStart = firstStart + dutyDuration + 22 * 3600;
    buildDuty(secondStart, 2);  // rest 22h
    const time_t thirdStart = secondStart + dutyDuration + 22 * 3600;
    buildDuty(thirdStart, 3);  // another 22h rest

    // offset = 0, all duties are wocl

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7414Test, PassesWhenAtLeastOneRestMeetsThreshold) {
    auto ctx = buildDataContext();
    auto rule = makeRule7414(ctx, makeRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414002;
    const time_t firstStart = utcFromString("2025-02-01 02:00:00");
    const int dutyMinutes = 120;
    const time_t dutyDuration = dutyMinutes * 60;

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    auto buildDuty = [&](time_t startUtc, int seq) {
        SegmentPlan flight{startUtc, startUtc + dutyMinutes * 60, true, false};
        duties.push_back(makeDuty({flight}, seq, pairingId, segmentStorage));
    };

    buildDuty(firstStart, 1);
    const time_t secondStart = firstStart + dutyDuration + 26 * 3600;
    buildDuty(secondStart, 2);  // rest 26h
    const time_t thirdStart = secondStart + dutyDuration + 22 * 3600;
    buildDuty(thirdStart, 3);

    // offset = 0, all duties are wocl

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
}

TEST_F(Rule7414Test, FlagsWhenPriorRestBeforeTwoSpecialDutiesTooShort) {
    auto ctx = buildDataContext();
    auto rule = makeRule7414(ctx, makeRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414007;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 1: not special (outside ES/LF/WOCL).
    const time_t duty1Start = utcFromString("2025-07-01 10:00:00");
    duties.push_back(makeDuty({{duty1Start, duty1Start + 2 * 3600, true, false}},
                              1,
                              pairingId,
                              segmentStorage));

    // Duty 2-3: consecutive special duties (WOCL/ES). Prior rest before duty 2 is <24h.
    const time_t duty2Start = utcFromString("2025-07-02 02:00:00");
    duties.push_back(makeDuty({{duty2Start, duty2Start + 2 * 3600, true, false}},
                              2,
                              pairingId,
                              segmentStorage));
    const time_t duty3Start = utcFromString("2025-07-03 02:00:00");
    duties.push_back(makeDuty({{duty3Start, duty3Start + 2 * 3600, true, false}},
                              3,
                              pairingId,
                              segmentStorage));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7414Test, PreRestBeforeLaterDutyBreaksConsecutiveChain) {
    auto ctx = buildDataContext();
    auto rule = makeRule7414(ctx, makeRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414008;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 1 and 2 are special with short rest between them (<24h + 1LN).
    const time_t duty1Start = utcFromString("2025-08-01 02:00:00");
    duties.push_back(makeDuty({{duty1Start, duty1Start + 2 * 3600, true, false}},
                              1,
                              pairingId,
                              segmentStorage));
    const time_t duty2Start = duty1Start + 24 * 3600;  // 22h rest after duty 1.
    duties.push_back(makeDuty({{duty2Start, duty2Start + 2 * 3600, true, false}},
                              2,
                              pairingId,
                              segmentStorage));

    // Long rest before duty 3 (>=24h + 1LN) should break the PRE consecutive chain.
    const time_t duty3Start = duty2Start + 41 * 3600;  // 39h rest after duty 2.
    duties.push_back(makeDuty({{duty3Start, duty3Start + 2 * 3600, true, false}},
                              3,
                              pairingId,
                              segmentStorage));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7414Test, PostRestBeforeLaterDutyBreaksConsecutiveChain) {
    auto ctx = buildDataContext();
    auto rule = makeRule7414(ctx, makePostOnlyRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414009;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 1 and 2 are special with short rest between them.
    const time_t duty1Start = utcFromString("2025-09-01 02:00:00");
    duties.push_back(makeDuty({{duty1Start, duty1Start + 2 * 3600, true, false}},
                              1,
                              pairingId,
                              segmentStorage));
    const time_t duty2Start = duty1Start + 24 * 3600;  // 22h rest after duty 1.
    duties.push_back(makeDuty({{duty2Start, duty2Start + 2 * 3600, true, false}},
                              2,
                              pairingId,
                              segmentStorage));

    // Qualifying rest before duty 3 should break the 3-duty POST chain.
    const time_t duty3Start = duty2Start + 41 * 3600;  // 39h rest after duty 2.
    duties.push_back(makeDuty({{duty3Start, duty3Start + 2 * 3600, true, false}},
                              3,
                              pairingId,
                              segmentStorage));

    // Next duty is non-special with short rest after duty 3; without chain break this would fail POST.
    const time_t duty4Start = duty3Start + 10 * 3600;  // 8h rest after duty 3.
    duties.push_back(makeDuty({{duty4Start, duty4Start + 2 * 3600, true, false}},
                              4,
                              pairingId,
                              segmentStorage));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7414Test, TrailingDeadheadCanBeExcludedFromSpecialClassification) {
    auto ctx = buildDataContext();
    RuleInput input = makeRuleInput("N");
    auto rule = makeRule7414(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414003;
    const time_t firstStart = utcFromString("2025-03-01 23:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 1: late finish (special)
    duties.push_back(makeDuty({{firstStart, firstStart + 2 * 3600, true, false}}, // start at 23pm, end 1am
                              1,
                              pairingId,
                              segmentStorage));

    // Duty 2: only trailing deadhead would be late finish, but it's excluded.
    const time_t secondStart = utcFromString("2025-03-02 18:00:00");;  // start at 6pm, long rest but still < 24h
	SegmentPlan operating{ secondStart, secondStart + 2 * 3600, true, false }; // 6pm - 8pm
    SegmentPlan trailingDeadhead{ utcFromString("2025-03-02 23:00:00"),
                                 utcFromString("2025-03-03 01:00:00"), // end 1:00am next day
                                 false,
                                 true};
    duties.push_back(makeDuty({operating, trailingDeadhead}, 2, pairingId, segmentStorage));

    // Duty 3: late finish, separated by a short rest from duty 2.
    const time_t thirdStart = utcFromString("2025-03-03 23:00:00");  
    duties.push_back(makeDuty({{thirdStart, thirdStart + 2 * 3600, true, false}},
                              3,
                              pairingId,
                              segmentStorage));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
}

TEST_F(Rule7414Test, PurePositionDutyIsNeverSpecialEvenWhenTrailingDeadheadIncluded) {
    auto ctx = buildDataContext();
    auto rule = makeRule7414(ctx, makeRuleInput("Y"));
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414011;
    const time_t firstStart = utcFromString("2025-11-01 23:00:00");

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({{firstStart, firstStart + 2 * 3600, true, false}},
                              1,
                              pairingId,
                              segmentStorage));

    const time_t secondStart = utcFromString("2025-11-02 23:00:00");
    duties.push_back(makeDuty({{secondStart, secondStart + 2 * 3600, false, true}},
                              2,
                              pairingId,
                              segmentStorage));

    const time_t thirdStart = utcFromString("2025-11-03 23:00:00");
    duties.push_back(makeDuty({{thirdStart, thirdStart + 2 * 3600, true, false}},
                              3,
                              pairingId,
                              segmentStorage));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
}

TEST_F(Rule7414Test, IgnoredStandbyUsesContinuousRestInsteadOfSummedRest) {
    auto ctx = buildDataContext();
    auto rule = makeRule7414(ctx, makeRuleInputWithControl("SBY", "SBY"));
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414010;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    const time_t duty1Start = utcFromString("2025-10-01 02:00:00");
    duties.push_back(makeDuty({{duty1Start, duty1Start + 2 * 3600, true, false}},
                              1,
                              pairingId,
                              segmentStorage));
    duties.back()->setAssignment("FLY");

    const time_t duty2Start = utcFromString("2025-10-02 03:00:00");
    duties.push_back(makeDuty({{duty2Start, duty2Start + 5 * 3600, true, false}},
                              2,
                              pairingId,
                              segmentStorage));
    duties.back()->setAssignment("FLY");

    const time_t sbyStart = utcFromString("2025-10-03 07:00:00");
    duties.push_back(makeDuty({{sbyStart, sbyStart + 6 * 3600, false, false}},
                              3,
                              pairingId,
                              segmentStorage));
    duties.back()->setAssignment("SBY");

    const time_t duty4Start = utcFromString("2025-10-04 02:00:00");
    duties.push_back(makeDuty({{duty4Start, duty4Start + 2 * 3600, true, false}},
                              4,
                              pairingId,
                              segmentStorage));
    duties.back()->setAssignment("FLY");

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_FALSE(violations.empty());
    EXPECT_EQ(violations.front()->operation_result["actual_rest_minutes"], "1380");
    EXPECT_EQ(violations.front()->operation_result["actual_local_nights"], "1");

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7414Test, UsesRefTimezoneWhenClassifyingSpecialDuty) {
    auto ctx = buildDataContext();
    auto rule = makeRule7414(ctx, makeRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414004;
    const time_t firstStart = utcFromString("2025-04-01 10:30:00");  // local 05:30 with ref -300
    const int dutyMinutes = 120;
    const time_t dutyDuration = dutyMinutes * 60;

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    auto buildDuty = [&](time_t startUtc, int seq) {
        SegmentPlan flight{startUtc, startUtc + dutyDuration, true, false};
        duties.push_back(makeDuty({flight}, seq, pairingId, segmentStorage, -300));
    };

	// 3 duties 02:30 - 04:30 local time, separated by 22h rest in UTC, all early start
    buildDuty(firstStart, 1);
    const time_t secondStart = firstStart + dutyDuration + 22 * 3600;
    buildDuty(secondStart, 2);
    const time_t thirdStart = secondStart + dutyDuration + 22 * 3600;
    buildDuty(thirdStart, 3);

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7414Test, DetectsWoclAcrossAllSectorsWithinDuty) {
    auto ctx = buildDataContext();
    auto rule = makeRule7414(ctx, makeRuleInput());
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414005;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 1: not special.
    SegmentPlan normal{utcFromString("2025-05-01 10:00:00"), utcFromString("2025-05-01 12:00:00"), true, false};
    duties.push_back(makeDuty({normal}, 1, pairingId, segmentStorage));

    // Duty 2: middle sector in WOCL should classify the duty as special. Rest before it is <24h.
    SegmentPlan seg1{utcFromString("2025-05-02 00:30:00"), utcFromString("2025-05-02 01:30:00"), true, false};
    SegmentPlan seg2{utcFromString("2025-05-02 03:00:00"), utcFromString("2025-05-02 04:00:00"), true, false};  // WOCL
    SegmentPlan seg3{utcFromString("2025-05-02 08:00:00"), utcFromString("2025-05-02 09:00:00"), true, false};
    duties.push_back(makeDuty({seg1, seg2, seg3}, 2, pairingId, segmentStorage));

    // Duty 3: early start so duty 2-3 are consecutive special duties and should trigger PRE check.
    SegmentPlan duty3Seg{utcFromString("2025-05-03 02:00:00"), utcFromString("2025-05-03 04:00:00"), true, false};
    duties.push_back(makeDuty({duty3Seg}, 3, pairingId, segmentStorage));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7414Test, TrailingDeadheadWoclIgnoredWhenExcluded) {
    auto ctx = buildDataContext();
    RuleInput input = makeRuleInput("N");
    auto rule = makeRule7414(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    const long long pairingId = 7414006;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 1: special due to wocl.
    SegmentPlan duty1Seg{utcFromString("2025-06-01 02:00:00"), utcFromString("2025-06-01 04:00:00"), true, false};
    duties.push_back(makeDuty({duty1Seg}, 1, pairingId, segmentStorage));

    // Duty 2: trailing deadhead sits in WOCL but should be ignored for classification.
    SegmentPlan opSeg{utcFromString("2025-06-01 18:00:00"), utcFromString("2025-06-01 20:00:00"), true, false};
    SegmentPlan dhSeg{utcFromString("2025-06-02 03:00:00"), utcFromString("2025-06-02 04:00:00"), false, true};
    duties.push_back(makeDuty({opSeg, dhSeg}, 2, pairingId, segmentStorage));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
}
