// SIA_SUITE_SUMMARY_START
// SuiteId: 4.5.1
// Name: Day Off
// SourceCsvRow: 4.5.1,Day Off
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: COP pattern with long rests (>=34h incl. LN) after duty blocks, keeping working streaks <=7 days; rule 7415 passes (MAX WORKING DAYS=7, LAST DAY BUFFER=21:00).
//   - Case #2: COP variant with continuous duties across eight consecutive days (no qualifying day-off rest); rule 7415 flags a violation.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Replace simplified AAA-timezone modelling with station-aware timings from the COP once SIA pairing builders are available.
//   - If SIA supplies a distinct ANR day-off definition (7401) for this scenario, plug it in as a dependent rule to mirror production configuration.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7415/CheckAnrDayOffSpacingRule.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 4.5.1 Day Off (max consecutive working days between days off).
// Best-fit rule: CheckAnrDayOffSpacingRule (rule 7415) with MAX WORKING DAYS = 7.

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

struct DutyWindow {
    time_t startUtc{};
    time_t endUtc{};
    int dropoffMinutes{0};
    int pickupMinutes{0};
};

std::unique_ptr<Duty> makeDuty(const DutyWindow& window,
                               int seq,
                               const SharedPtr<CrewDataContext>& ctx) {
    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(seq);
    duty->setPairingId(7415001);
    duty->setDepartureStation("AAA");
    duty->setArrivalStation("AAA");

    duty->setStartTimeUtcAct(window.startUtc);
    duty->setEndTimeUtcAct(window.endUtc);
    duty->setStartTimeLocAct(window.startUtc);
    duty->setEndTimeLocAct(window.endUtc);
    duty->setActualDropoffMin(window.dropoffMinutes);
    duty->setActualPickupMin(window.pickupMinutes);

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
    pairing->setId(7415001);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

RuleInput makeRuleInput() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7415001;
    row.function = 7415;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 208178002;
    row.overridebility = "S";
    row.reference = "ANR-121";
    std::strcpy(row.description, "ANR max consecutive working days between day offs");
    row.params["MAX WORKING DAYS"] = "7";
    row.params["LAST DAY BUFFER HHMM"] = "21:00";
    input.dbRules.push_back(row);
    return input;
}

std::unique_ptr<CheckAnrDayOffSpacingRule> makeRule7415(
    const SharedPtr<CrewDataContext>& ctx) {
    RuleInput input = makeRuleInput();
    auto rule = std::make_unique<CheckAnrDayOffSpacingRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

}  // namespace

class SIA_4_5_1_DayOffBetweenSevenWorkingDays : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
};

TEST_F(SIA_4_5_1_DayOffBetweenSevenWorkingDays,
       Case1_WorkingStreaksCappedByQualifyingDayOffs) {
    auto ctx = SIATest::buildCrewDataContext({{"AAA", 0, "UTC"}});
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-02-01 00:00:00");

    auto addDuty = [&](int dayOffset, int seq) {
        const time_t startUtc = day0 + static_cast<time_t>(dayOffset) * 24 * 3600 + 8 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;  // 8-hour duty
        duties.push_back(makeDuty({startUtc, endUtc}, seq, ctx));
    };

    // COP-like spread with long rests creating day-off breaks.
    addDuty(0, 1);   // Day 1
    addDuty(2, 2);   // Day 3 (>=40h rest => day off)
    addDuty(3, 3);   // Day 4
    addDuty(4, 4);   // Day 5
    addDuty(7, 5);   // Day 8 (>=72h rest => day off)
    addDuty(8, 6);   // Day 9
    addDuty(9, 7);   // Day 10
    addDuty(11, 8);  // Day 12 (>=48h rest => day off)

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(SIA_4_5_1_DayOffBetweenSevenWorkingDays,
       Case2_ExceedsSevenConsecutiveWorkingDays) {
    auto ctx = SIATest::buildCrewDataContext({{"AAA", 0, "UTC"}});
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-03-01 00:00:00");

    auto addConsecutiveDuty = [&](int dayOffset, int seq, int dropoff = 0, int pickup = 0) {
        const time_t startUtc = day0 + static_cast<time_t>(dayOffset) * 24 * 3600 + 8 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc, dropoff, pickup}, seq, ctx));
    };

    // Eight straight working days with only ~16h rest between them (no day off).
    for (int i = 0; i < 8; ++i) {
        addConsecutiveDuty(i, i + 1, 0, 0);
    }

    auto pairing = makePairing(asRaw(duties), "AAA");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}
