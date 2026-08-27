// SIA_SUITE_SUMMARY_START
// SuiteId: 4.4.1
// Name: Duty with take-off or landing within the window of circadian low (Rest before 2 consecutive SD - WOCL, early start)
// SourceCsvRow: 4.4.1,Duty with take-off or landing within the window of circadian low (Rest before 2 consecutive SD - WOCL, early start)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: COP baseline timings yield only ~18h50 (1 LN) between the standby duty and the first SD in the SD/SD/SD window; rule 7414 (consecutiveTimes=3, includeTrailingDeadhead=N, minRest=24:00, minLocalNights=1) flags a violation.
//   - Case #2: SBY moved to 0100-0500, giving ~29h05 (>=24h, 1 LN) before the SD window; rule 7414 passes.
//   - Case #3: SQ7403 shifted to a daytime departure so the third duty no longer classifies as special; rule 7414 passes because no 3-SD window exists.
// Results:
//   - pass 3 out of 3 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Replace the simplified AAA-timezone segments with full station/offset modelling once SIA pairing builders for WOCL/ES SDs are available.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7414/CheckAnrConsecutiveSpecialDutyRule.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 4.4.1 Rest before two consecutive special duties (WOCL / early start).
// Best-fit rule: CheckAnrConsecutiveSpecialDutyRule (rule 7414) using SIA defaults.

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

struct SegmentPlan {
    std::string startUtc;
    std::string endUtc;
    bool operating{true};
    bool deadhead{false};
};

std::unique_ptr<Segment> makeSegment(const SegmentPlan& plan) {
    auto seg = std::make_unique<Segment>();
    const time_t startUtc = utcFromString(plan.startUtc);
    const time_t endUtc = utcFromString(plan.endUtc);
    seg->setDepStation("AAA");
    seg->setArrStation("AAA");
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    seg->setStartTimeLocSch(startUtc);
    seg->setEndTimeLocSch(endUtc);
    seg->setActTakeOffUtc(startUtc);
    seg->setActTouchDownUtc(endUtc);
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
    duty->setDepartureStation(raw.front()->getDepStation());
    duty->setArrivalStation(raw.back()->getArrStation());
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
    pairing->setId(4441001);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

RuleInput makeRuleInput() {
    RuleInput input;
    auto csvRules =
        SIATest::loadRuleParametersFromCsv(SIATest::Division::TechCrew, 7414 /* rule function */);
    if (!csvRules.empty()) {
        input.dbRules = csvRules;
        return input;
    }

    DBRule row{};
    row.idRule = 7414001;
    row.function = 7414;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 208178101;
    row.overridebility = "S";
    std::strcpy(row.description, "ANR consecutive special duty rest requirement");
    row.reference = "ANR-121";
    row.params["Include trailing deadhead"] = "N";
    row.params["Consecutive Times"] = "3";
    row.params["Min Rest Time"] = "24:00";
    row.params["Min Local Nights"] = "1";
    input.dbRules.push_back(row);
    return input;
}

std::unique_ptr<CheckAnrConsecutiveSpecialDutyRule> makeRule7414(
    const SharedPtr<CrewDataContext>& ctx) {
    auto rule = std::make_unique<CheckAnrConsecutiveSpecialDutyRule>(nullptr, makeRuleInput());
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

}  // namespace

class SIA_4_4_1_RestBeforeTwoConsecutiveSpecialDuties : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
};

TEST_F(SIA_4_4_1_RestBeforeTwoConsecutiveSpecialDuties,
       Case1_InsufficientRestBeforeThreeSpecialDuties) {
    auto ctx = SIATest::buildCrewDataContext({{"AAA", 0, "UTC"}});
    auto rule = makeRule7414(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    // COP baseline: standby ends too late, leaving ~18h50 (1 LN) before the SD/SD/SD window.
    const long long pairingId = 4441001;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({{"2025-01-05 02:00:00", "2025-01-05 08:00:00"}}, 1, pairingId, segmentStorage, 0));
    duties.push_back(makeDuty({{"2025-01-06 02:50:00", "2025-01-06 08:50:00"}}, 2, pairingId, segmentStorage, 0));
    duties.push_back(makeDuty({{"2025-01-07 04:00:00", "2025-01-07 10:00:00"}}, 3, pairingId, segmentStorage, 0));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(SIA_4_4_1_RestBeforeTwoConsecutiveSpecialDuties,
       Case2_StandbyMovedEarlierRestQualifies) {
    auto ctx = SIATest::buildCrewDataContext({{"AAA", 0, "UTC"}});
    auto rule = makeRule7414(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    // SBY at 0100-0500 yields ~29h05 (>=24h + 1 LN) before the SD window.
    const long long pairingId = 4441002;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({{"2025-01-05 01:00:00", "2025-01-05 05:00:00"}}, 1, pairingId, segmentStorage, 0));
    duties.push_back(makeDuty({{"2025-01-06 10:05:00", "2025-01-06 16:05:00"}}, 2, pairingId, segmentStorage, 0));
    duties.push_back(makeDuty({{"2025-01-07 04:00:00", "2025-01-07 10:00:00"}}, 3, pairingId, segmentStorage, 0));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(SIA_4_4_1_RestBeforeTwoConsecutiveSpecialDuties,
       Case3_FinalDutyNotSpecialNoWindow) {
    auto ctx = SIATest::buildCrewDataContext({{"AAA", 0, "UTC"}});
    auto rule = makeRule7414(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    // SQ7403 retimed to a day departure removes the 3-SD window; rule should pass.
    const long long pairingId = 4441003;
    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({{"2025-01-05 02:00:00", "2025-01-05 08:00:00"}}, 1, pairingId, segmentStorage, 0));
    duties.push_back(makeDuty({{"2025-01-06 02:50:00", "2025-01-06 08:50:00"}}, 2, pairingId, segmentStorage, 0));
    duties.push_back(makeDuty({{"2025-01-07 08:00:00", "2025-01-07 12:00:00"}}, 3, pairingId, segmentStorage, 0));

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}