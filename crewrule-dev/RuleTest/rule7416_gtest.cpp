#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>
#include <cstring>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7416/CheckAnrMinDayOffInPeriodRule.h"
#include "RuleEngine/rule/rule7401/AnrDayOffDefinition.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["SIN"] = 480;
    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
    return ctx;
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
    duty->setPairingId(8000);
    duty->setDepartureStation("SIN");
    duty->setArrivalStation("SIN");

    duty->setStartTimeUtcAct(window.startUtc);
    duty->setEndTimeUtcAct(window.endUtc);

    const std::string zoneId = ctx->airportZoneIdMap["SIN"];
    duty->setStartTimeLocAct(TimezoneUtils::GetLocalTime(window.startUtc, zoneId));
    duty->setEndTimeLocAct(TimezoneUtils::GetLocalTime(window.endUtc, zoneId));
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
    pairing->setId(9002);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

RuleInput makeRuleInput7416(const std::string& unit = "CW",
                            int period = 2,
                            int minDaysOff = 2,
                            int weekStartOn = 1) {
    RuleInput input;
    DBRule row{};
    row.idRule = 7416001;
    row.function = 7416;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 208279002;
    row.overridebility = "S";
    row.reference = "ANR-121";
    std::strcpy(row.description, "ANR min days off in consecutive periods");
    row.params["UNIT"] = unit;
    row.params["PERIOD"] = std::to_string(period);
    row.params["MIN DAYS OFF"] = std::to_string(minDaysOff);
    row.params["WEEK START ON"] = std::to_string(weekStartOn);
    input.dbRules.push_back(row);
    return input;
}

std::unique_ptr<CheckAnrMinDayOffInPeriodRule> makeRule7416(
    const SharedPtr<CrewDataContext>& ctx,
    const std::string& unit = "CW",
    int period = 2,
    int minDaysOff = 2,
    int weekStartOn = 1) {
    RuleInput input = makeRuleInput7416(unit, period, minDaysOff, weekStartOn);
    auto rule = std::make_unique<CheckAnrMinDayOffInPeriodRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

std::unique_ptr<CheckAnrMinDayOffInPeriodRule> makeRule7416(
    const SharedPtr<CrewDataContext>& ctx,
    const RuleInput& input) {
    auto rule = std::make_unique<CheckAnrMinDayOffInPeriodRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

AnrDayOffDefinition makeDefaultAnrDefinition() {
    AnrDayOffDefinition def;
    // No DB rows - use default 7401 table values (1: 34h+1 night, 2-99: 24h+1 night).
    def.loadFromDbRules({});
    return def;
}

}  // namespace

class Rule7416Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:00";
        ln.LocalEnd = "08:00";
        ln.MinRestInterval = "08:00";
    }
};

// Basic sanity: two qualifying ANR day offs within 14 days passes.
TEST_F(Rule7416Test, AllowsTwoDayOffsInTwoWeeks) {
    auto ctx = buildDataContext();
    auto rule = makeRule7416(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-01-01 00:00:00"); // 08:00 local

    // First block: 3 working days.
    for (int i = 0; i < 3; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, static_cast<int>(duties.size()) + 1, ctx));
    }

    // First ANR day off: 36h rest including a local night.
    time_t firstRestStart = duties.back()->getEndTimeUtcAct();
    time_t fourthStart = firstRestStart + 36 * 3600;
    time_t fourthEnd = fourthStart + 8 * 3600;
    duties.push_back(makeDuty({fourthStart, fourthEnd}, static_cast<int>(duties.size()) + 1, ctx));

    // Second block: 3 more working days.
    for (int i = 0; i < 3; ++i) {
        const time_t startUtc = duties.back()->getEndTimeUtcAct() + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, static_cast<int>(duties.size()) + 1, ctx));
    }

    // Second ANR day off: 36h rest.
    time_t secondRestStart = duties.back()->getEndTimeUtcAct();
    time_t afterRestStart = secondRestStart + 36 * 3600;
    time_t afterRestEnd = afterRestStart + 8 * 3600;
    duties.push_back(makeDuty({afterRestStart, afterRestEnd}, static_cast<int>(duties.size()) + 1, ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    EXPECT_TRUE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

// A 58h rest that ends at 02:00 local (34h + 24h) still counts only one ANR
// day off because the second 24h block lacks a full local night.
TEST_F(Rule7416Test, ConsecutiveRestWithoutNightCountsOnce) {
    auto ctx = buildDataContext();
    auto rule = makeRule7416(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 1 ends at 16:00 local (08:00 UTC) to start the long rest.
    const time_t duty1StartUtc = utcFromString("2025-01-01 00:00:00");
    const time_t duty1EndUtc = utcFromString("2025-01-01 08:00:00");
    duties.push_back(makeDuty({duty1StartUtc, duty1EndUtc, 0, 60},
                              static_cast<int>(duties.size()) + 1,
                              ctx));

    // Duty 2 begins after a 58h rest (rest end is Jan3 18:00 UTC = Jan4 02:00 local).
    const time_t duty2StartUtc = utcFromString("2025-01-03 19:00:00");
    const time_t duty2EndUtc = duty2StartUtc + 8 * 3600;
    duties.push_back(makeDuty({duty2StartUtc, duty2EndUtc, 0, 60},
                              static_cast<int>(duties.size()) + 1,
                              ctx));

    // Extend pairing beyond 14 days with short rests that are below day-off thresholds.
    for (int i = 0; i < 15; ++i) {
        time_t startUtc = duty2StartUtc + static_cast<time_t>(i + 1) * 24 * 3600;
        time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc, 0, 60},
                                  static_cast<int>(duties.size()) + 1,
                                  ctx));
    }

    auto pairing = makePairing(asRaw(duties), "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

// A 60h rest can produce two ANR day-offs in that rest segment, but the rule
// should still fail if another rolling 2-CW window has insufficient day-offs.
TEST_F(Rule7416Test, ConsecutiveRestWithNightCountsTwo) {
    auto ctx = buildDataContext();
    auto rule = makeRule7416(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 1 ends at 18:00 local (10:00 UTC) to start the long rest.
    const time_t duty1StartUtc = utcFromString("2025-01-01 00:00:00");
	const time_t duty1EndUtc = utcFromString("2025-01-01 10:00:00"); // 18:00 local
    duties.push_back(makeDuty({ duty1StartUtc, duty1EndUtc, 0, 0 },
        static_cast<int>(duties.size()) + 1,
        ctx));

	// first day off with 34h rest ends at 04:00 local (18:00 UTC Jan2)
	// second day off with 26h rest ends at 06:00 local (22:00 UTC Jan3)
    
    // Duty 2 begins after a 60h rest (rest end is Jan3 22:00 UTC = Jan4 06:00 local).
    const time_t duty2StartUtc = utcFromString("2025-01-03 22:00:00");
    const time_t duty2EndUtc = duty2StartUtc + 8 * 3600;
    duties.push_back(makeDuty({ duty2StartUtc, duty2EndUtc, 0, 0 },
        static_cast<int>(duties.size()) + 1,
        ctx));

    // Extend pairing beyond 14 days with short rests that are below day-off thresholds.
    for (int i = 0; i < 15; ++i) {
        time_t startUtc = duty2StartUtc + static_cast<time_t>(i + 1) * 24 * 3600;
        time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({ startUtc, endUtc, 0, 0 },
            static_cast<int>(duties.size()) + 1,
            ctx));
    }

    auto pairing = makePairing(asRaw(duties), "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    
    for (auto* rv : violations) {
        delete rv;
    }
}

// If there is only one qualifying ANR day off in the 14-day span, it should flag.
TEST_F(Rule7416Test, RejectsWhenOnlyOneDayOffInTwoWeeks) {
    auto ctx = buildDataContext();
    auto rule = makeRule7416(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-02-01 00:00:00"); // 08:00 local

    // Work 7 days.
    for (int i = 0; i < 7; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, static_cast<int>(duties.size()) + 1, ctx));
    }

    // Single ANR day off (36h rest), then a few more duties within 14 days.
    time_t restStart = duties.back()->getEndTimeUtcAct();
    time_t nextStart = restStart + 36 * 3600;
    time_t nextEnd = nextStart + 8 * 3600;
    duties.push_back(makeDuty({nextStart, nextEnd}, static_cast<int>(duties.size()) + 1, ctx));

    for (int extra = 0; extra < 7; ++extra) {
        const time_t startUtc = duties.back()->getEndTimeUtcAct() + 24 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, static_cast<int>(duties.size()) + 1, ctx));
    }

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7416Test, CountsPrePairingRestAsDayOff) {
    auto ctx = buildDataContext();
    auto rule = makeRule7416(ctx, "CW", 1, 2, 1);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty starts late in week so the only 1-CW window is MON->MON.
    // Pre-pairing rest in this window is long enough for >=2 ANR day-offs,
    // while trailing rest in-window is below first day-off threshold.
    const time_t dutyStartUtc = utcFromString("2025-01-11 12:00:00");  // Sat 20:00 local
    const time_t dutyEndUtc = utcFromString("2025-01-11 14:00:00");    // Sat 22:00 local
    duties.push_back(makeDuty({dutyStartUtc, dutyEndUtc, 0, 0},
                              1,
                              ctx));

    auto pairing = makePairing(asRaw(duties), "SIN");

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7416Test, FailsWhenPostPairingDaysOffStillBelowMinimum) {
    auto ctx = buildDataContext();
    auto rule = makeRule7416(ctx, "CW", 1, 8, 1);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;

    // Pairing starts just after week boundary (Mon 00:10 local), so pre-pairing
    // rest in this window is negligible. Post-pairing rest exists but is still
    // insufficient to reach MIN DAYS OFF=8 in 1 CW.
    const time_t dutyStartUtc = utcFromString("2025-01-05 16:10:00");  // Mon 00:10 local (UTC+08)
    const time_t dutyEndUtc = utcFromString("2025-01-06 00:10:00");    // Mon 08:10 local
    duties.push_back(makeDuty({dutyStartUtc, dutyEndUtc, 0, 0}, 1, ctx));

    auto pairing = makePairing(asRaw(duties), "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_FALSE(violations.empty());

    const auto* rv = violations.front();
    auto itDaysOff = rv->operation_result.find("days_off");
    ASSERT_TRUE(itDaysOff != rv->operation_result.end());
    const int daysOff = std::stoi(itDaysOff->second);
    EXPECT_GT(daysOff, 0);
    EXPECT_LT(daysOff, 8);

    for (auto* item : violations) {
        delete item;
    }
}

TEST_F(Rule7416Test, AppliesAllMatchedConfigsForPairing) {
    auto ctx = buildDataContext();

    RuleInput input;
    DBRule row1{};
    row1.idRule = 7416001;
    row1.function = 7416;
    row1.tableNum = 1;
    row1.rowNum = 1;
    row1.phase = 1;
    row1.idRuleParam = 208279201;
    row1.overridebility = "S";
    row1.reference = "ANR-121";
    std::strcpy(row1.description, "2 days off in 2 CW");
    row1.params["UNIT"] = "CW";
    row1.params["PERIOD"] = "2";
    row1.params["MIN DAYS OFF"] = "2";
    row1.params["WEEK START ON"] = "1";
    input.dbRules.push_back(row1);

    DBRule row2 = row1;
    row2.rowNum = 2;
    row2.idRuleParam = 208279202;
    std::strcpy(row2.description, "1 day off in 7 CD");
    row2.params["UNIT"] = "CD";
    row2.params["PERIOD"] = "7";
    row2.params["MIN DAYS OFF"] = "1";
    input.dbRules.push_back(row2);

    auto rule = makeRule7416(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-03-01 00:00:00");  // 08:00 local
    for (int i = 0; i < 7; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, i + 1, ctx));
    }

    auto pairing = makePairing(asRaw(duties), "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_FALSE(violations.empty());
    EXPECT_EQ(violations.front()->ruleParamId, 208279202);

    for (auto* item : violations) {
        delete item;
    }
}
