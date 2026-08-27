#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>
#include <cstring>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7415/CheckAnrDayOffSpacingRule.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

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
    duty->setPairingId(7000);
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
    pairing->setId(9001);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

RuleInput makeRuleInput(const std::string& workDayEndsAt = "") {
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
    if (!workDayEndsAt.empty()) {
        row.params["WORK DAY ENDS AT"] = workDayEndsAt;
    }
    input.dbRules.push_back(row);
    return input;
}

std::unique_ptr<CheckAnrDayOffSpacingRule> makeRule7415(
    const SharedPtr<CrewDataContext>& ctx,
    const std::string& workDayEndsAt = "") {
    RuleInput input = makeRuleInput(workDayEndsAt);
    auto rule = std::make_unique<CheckAnrDayOffSpacingRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

std::unique_ptr<CheckAnrDayOffSpacingRule> makeRule7415(
    const SharedPtr<CrewDataContext>& ctx,
    const RuleInput& input) {
    auto rule = std::make_unique<CheckAnrDayOffSpacingRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

}  // namespace

class Rule7415Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:00";
        ln.LocalEnd = "06:00";
        ln.MinRestInterval = "08:00";
    }
};

TEST_F(Rule7415Test, AllowsDayOffAfterSevenDays) {
    auto ctx = buildDataContext();
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    // Build eight consecutive duties. Each duty operates roughly 10 hours from 8am - 6pm,
    // and the rest after the 7th duty lasts 36 hours including a local night.
    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-01-01 00:00:00"); // 8am SIN time
    for (int i = 0; i < 7; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 10 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, i + 1, ctx));
    }

    // Additional duty after a qualifying day off (rest >= 36h with local night).
    const time_t day7End = duties.back()->getEndTimeUtcAct();
    const time_t nextStart = day7End + 36 * 3600;
    const time_t nextEnd = nextStart + 9 * 3600;
    duties.push_back(makeDuty({nextStart, nextEnd}, 8, ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    EXPECT_TRUE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7415Test, LegalityCheckerPairingEntryRejectsViolation) {
    auto ctx = buildDataContext();

    RuleInput input = makeRuleInput();
    ASSERT_FALSE(input.dbRules.empty());
    ctx->ruleList.push_back(input.dbRules.front());

    // Reuse the shorter-than-day-off scenario: seven working days followed by
    // a rest that is nominally 36h but reduced below 34h by pickup/dropoff.
    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-05-01 00:00:00");
    for (int i = 0; i < 7; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 9 * 3600;
        const int dropoff = (i == 6) ? 120 : 0;
        duties.push_back(makeDuty({startUtc, endUtc, dropoff, 0}, i + 1, ctx));
    }

    const time_t shortRestStart = duties.back()->getEndTimeUtcAct();
    const time_t eighthStart = shortRestStart + 36 * 3600;
    const time_t eighthEnd = eighthStart + 8 * 3600;
    duties.push_back(makeDuty({eighthStart, eighthEnd, 0, 120}, 8, ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    LegalityChecker checker(PAIRING_EDITOR, false);
    checker.setDataContext(ctx, -1, false);

    EXPECT_FALSE(checker.checkAnrDayOffSpacing_ANR(pairing.get()));
}

TEST_F(Rule7415Test, RejectsWhenRestShorterThanDayOff) {
    auto ctx = buildDataContext();
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-02-01 00:00:00"); // 8am SIN time
    for (int i = 0; i < 7; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 9 * 3600;
        const int dropoff = (i == 6) ? 120 : 0;
        duties.push_back(makeDuty({startUtc, endUtc, dropoff, 0}, i + 1, ctx));
    }

    // Rest after 7th duty is scheduled for 36 hours, but 2h dropoff + 2h pickup
    // reduce the actual rest below ANR's 34h requirement.
    const time_t shortRestStart = duties.back()->getEndTimeUtcAct();
    const time_t eighthStart = shortRestStart + 36 * 3600;
    const time_t eighthEnd = eighthStart + 8 * 3600;
    duties.push_back(makeDuty({eighthStart, eighthEnd, 0, 120}, 8, ctx));

    // Add two more duties to make the violation obvious.
    for (int extra = 0; extra < 2; ++extra) {
        const time_t prevEnd = duties.back()->getEndTimeUtcAct();
        const time_t startUtc = prevEnd + 14 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, 9 + extra, ctx));
    }

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7415Test, RejectsWhenLastDayRestStartsAfterBuffer) {
    auto ctx = buildDataContext();
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-03-01 00:00:00");

    for (int i = 0; i < 6; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 9 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, i + 1, ctx));
    }

    // Day 7 duty ends at 20:00 local, but with 3-hour dropoff rest actually starts 23:00 local.
    const time_t day7Start = day0 + 6 * 24 * 3600 + 9 * 3600;   // 17:00 local
    const time_t day7End = day7Start + 3 * 3600;                // 20:00 local
    duties.push_back(makeDuty({day7Start, day7End, 180, 0}, 7, ctx));

    // Rest is long enough, but due to late finish the rule should still flag it.
    const time_t nextStart = day7End + 36 * 3600;
    const time_t nextEnd = nextStart + 8 * 3600;
    duties.push_back(makeDuty({nextStart, nextEnd}, 8, ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7415Test, WorkDayEndsAtDebriefPassesWhenTransportFailsBuffer) {
    auto ctx = buildDataContext();
    auto ruleTransport = makeRule7415(ctx, "TRANSPORT");
    auto ruleDebrief = makeRule7415(ctx, "DEBRIEF");
    std::vector<RULE_VIOLATION*> transportViolations;
    std::vector<RULE_VIOLATION*> debriefViolations;
    ruleTransport->setRuleViolation(&transportViolations);
    ruleDebrief->setRuleViolation(&debriefViolations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-09-01 00:00:00");

    for (int i = 0; i < 6; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 9 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, i + 1, ctx));
    }

    // Day 7 debrief ends 20:00 local, but dropoff extends boundary to 23:00 local.
    const time_t day7Start = day0 + 6 * 24 * 3600 + 9 * 3600;  // 17:00 local
    const time_t day7End = day7Start + 3 * 3600;               // 20:00 local
    duties.push_back(makeDuty({day7Start, day7End, 180, 0}, 7, ctx));

    // Keep transport-based rest at 36h so day-off qualification remains valid.
    const time_t nextStart = day7End + 39 * 3600;
    const time_t nextEnd = nextStart + 8 * 3600;
    duties.push_back(makeDuty({nextStart, nextEnd}, 8, ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    EXPECT_FALSE(ruleTransport->CheckRule(pairing.get()));
    EXPECT_TRUE(ruleDebrief->CheckRule(pairing.get()));

    for (auto* rv : transportViolations) {
        delete rv;
    }
    for (auto* rv : debriefViolations) {
        delete rv;
    }
}

TEST_F(Rule7415Test, WorkDayEndsAtAliasesAndInvalidFallback) {
    auto ctx = buildDataContext();
    auto ruleDropoffAlias = makeRule7415(ctx, "DROP-OFF");
    auto ruleDebriefAlias = makeRule7415(ctx, "DEBRIEFING");
    auto ruleInvalid = makeRule7415(ctx, "NOT_A_MODE");

    std::vector<RULE_VIOLATION*> dropoffAliasViolations;
    std::vector<RULE_VIOLATION*> debriefAliasViolations;
    std::vector<RULE_VIOLATION*> invalidViolations;
    ruleDropoffAlias->setRuleViolation(&dropoffAliasViolations);
    ruleDebriefAlias->setRuleViolation(&debriefAliasViolations);
    ruleInvalid->setRuleViolation(&invalidViolations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-10-01 00:00:00");

    for (int i = 0; i < 6; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 9 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, i + 1, ctx));
    }

    const time_t day7Start = day0 + 6 * 24 * 3600 + 9 * 3600;  // 17:00 local
    const time_t day7End = day7Start + 3 * 3600;               // 20:00 local
    duties.push_back(makeDuty({day7Start, day7End, 180, 0}, 7, ctx));

    const time_t nextStart = day7End + 39 * 3600;
    const time_t nextEnd = nextStart + 8 * 3600;
    duties.push_back(makeDuty({nextStart, nextEnd}, 8, ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    EXPECT_FALSE(ruleDropoffAlias->CheckRule(pairing.get()));
    EXPECT_TRUE(ruleDebriefAlias->CheckRule(pairing.get()));
    EXPECT_FALSE(ruleInvalid->CheckRule(pairing.get()));

    for (auto* rv : dropoffAliasViolations) {
        delete rv;
    }
    for (auto* rv : debriefAliasViolations) {
        delete rv;
    }
    for (auto* rv : invalidViolations) {
        delete rv;
    }
}

TEST_F(Rule7415Test, ResetsAfterMultipleDayOffs) {
    auto ctx = buildDataContext();
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-04-01 00:00:00");

    // First block of six duties.
    for (int i = 0; i < 6; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, static_cast<int>(duties.size()) + 1, ctx));
    }

    // Day off: rest for 34 hours (meets 2nd-sequence definition with one local night)
    const time_t secondBlockStart = duties.back()->getEndTimeUtcAct() + 34 * 3600;

    // Second block of six duties starting after the day off.
    for (int i = 0; i < 6; ++i) {
        const time_t startUtc = secondBlockStart + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, static_cast<int>(duties.size()) + 1, ctx));
    }

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    EXPECT_TRUE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7415Test, RejectsWhenRestEnoughButNoQualifyingLocalNight) {
    auto ctx = buildDataContext();

    RuleInput input = makeRuleInput();
    DBRule dayOffRow{};
    dayOffRow.idRule = 7401001;
    dayOffRow.function = 7401;
    dayOffRow.tableNum = 1;
    dayOffRow.rowNum = 1;
    dayOffRow.severity = 2;
    dayOffRow.overridebility = "S";
    dayOffRow.reference = "ANR-121";
    dayOffRow.idRuleParam = 208174015;
    dayOffRow.params["Day Off Sequence"] = "1";
    // 34 hours rest contains at least 1 8-hour local night, use 24 hours to check 
    dayOffRow.params["Min Rest Time"] = "24:00";
    dayOffRow.params["Min Local Nights"] = "1";
    input.dependDbRules[7401].push_back(dayOffRow);

    auto rule = std::make_unique<CheckAnrDayOffSpacingRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);

    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

	// worked 6 days, 6th duty ends next day at 2am. then rest 27 hours. 7th 1am - 8th 5am, but no local night
    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-06-01 00:00:00"); // 8am SIN time
    for (int i = 0; i < 6; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600 + 8 * 3600; // start at 16:00 local
		const time_t endUtc = startUtc + 10 * 3600; // end at 02:00 local next day
        duties.push_back(makeDuty({startUtc, endUtc}, i + 1, ctx));
    }

    // worked 2 more duties on 7th and 8th day.
    const time_t day7End = duties.back()->getEndTimeUtcAct();
    time_t nextStart = day7End + 27 * 3600;
    time_t nextEnd = nextStart + 9 * 3600;
    duties.push_back(makeDuty({nextStart, nextEnd}, 8, ctx));

    auto nextStartLocal = TimezoneUtils::GetLocalTime(nextStart, ctx->airportZoneIdMap["SIN"]);
    auto nextStartLocalMinutes = nextStartLocal % (24 * 3600);

    EXPECT_EQ(nextStartLocalMinutes, 5 * 3600); // 8th day duty starts at 5am

    //nextStart = duties.back()->getEndTimeUtcAct() + 15 * 3600;
    //nextEnd = nextStart + 9 * 3600;
    //duties.push_back(makeDuty({ nextStart, nextEnd }, 9, ctx));


    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7415Test, RestContainsAnrDayOffRecognizesValidDayOffWindow) {
    auto ctx = buildDataContext();
    RuleInput input = makeRuleInput();
    CheckAnrDayOffSpacingRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    // Single rest window: 36 hours with one local night between two duties.
    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-07-01 00:00:00"); // 8am SIN time
    const time_t firstStart = day0;
    const time_t firstEnd = firstStart + 10 * 3600;           // 18:00 local
    duties.push_back(makeDuty({firstStart, firstEnd}, 1, ctx));

    const time_t secondStart = firstEnd + 36 * 3600;          // rest 36h
    const time_t secondEnd = secondStart + 8 * 3600;
    duties.push_back(makeDuty({secondStart, secondEnd}, 2, ctx));

    EXPECT_TRUE(rule.TestRestContainsAnrDayOff(duties[0].get(), duties[1].get()));
}

TEST_F(Rule7415Test, RestContainsAnrDayOffRejectsShortRest) {
    auto ctx = buildDataContext();
    RuleInput input = makeRuleInput();
    CheckAnrDayOffSpacingRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-08-01 00:00:00"); // 8am SIN time
    const time_t firstStart = day0;
    const time_t firstEnd = firstStart + 10 * 3600;           // 18:00 local
    duties.push_back(makeDuty({firstStart, firstEnd}, 1, ctx));

    // Rest only 20 hours, below the 34h ANR requirement.
    const time_t secondStart = firstEnd + 20 * 3600;
    const time_t secondEnd = secondStart + 8 * 3600;
    duties.push_back(makeDuty({secondStart, secondEnd}, 2, ctx));

    EXPECT_FALSE(rule.TestRestContainsAnrDayOff(duties[0].get(), duties[1].get()));
}

TEST_F(Rule7415Test, RestContainsAnrDayOffUnaffectedByWorkDayEndMode) {
    auto ctx = buildDataContext();
    RuleInput transportInput = makeRuleInput("TRANSPORT");
    RuleInput debriefInput = makeRuleInput("DEBRIEF");

    CheckAnrDayOffSpacingRule transportRule(nullptr, transportInput);
    CheckAnrDayOffSpacingRule debriefRule(nullptr, debriefInput);
    transportRule.setDataContext(ctx);
    debriefRule.setDataContext(ctx);
    transportRule.setApplication(BATCH_LEGALITY);
    debriefRule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Duty>> validDuties;
    const time_t day0 = utcFromString("2025-11-01 00:00:00");  // 8am SIN time
    const time_t firstStart = day0;
    const time_t firstEnd = firstStart + 10 * 3600;
    validDuties.push_back(makeDuty({firstStart, firstEnd}, 1, ctx));
    const time_t secondStart = firstEnd + 36 * 3600;
    const time_t secondEnd = secondStart + 8 * 3600;
    validDuties.push_back(makeDuty({secondStart, secondEnd}, 2, ctx));

    EXPECT_TRUE(
        transportRule.TestRestContainsAnrDayOff(validDuties[0].get(), validDuties[1].get()));
    EXPECT_TRUE(
        debriefRule.TestRestContainsAnrDayOff(validDuties[0].get(), validDuties[1].get()));

    std::vector<std::unique_ptr<Duty>> shortDuties;
    const time_t shortFirstStart = utcFromString("2025-11-10 00:00:00");
    const time_t shortFirstEnd = shortFirstStart + 10 * 3600;
    shortDuties.push_back(makeDuty({shortFirstStart, shortFirstEnd}, 1, ctx));
    const time_t shortSecondStart = shortFirstEnd + 20 * 3600;
    const time_t shortSecondEnd = shortSecondStart + 8 * 3600;
    shortDuties.push_back(makeDuty({shortSecondStart, shortSecondEnd}, 2, ctx));

    EXPECT_FALSE(
        transportRule.TestRestContainsAnrDayOff(shortDuties[0].get(), shortDuties[1].get()));
    EXPECT_FALSE(
        debriefRule.TestRestContainsAnrDayOff(shortDuties[0].get(), shortDuties[1].get()));
}

TEST_F(Rule7415Test, AppliesAllMatchedConfigsForPairing) {
    auto ctx = buildDataContext();

    RuleInput input;
    DBRule row1{};
    row1.idRule = 7415001;
    row1.function = 7415;
    row1.tableNum = 1;
    row1.rowNum = 1;
    row1.phase = 1;
    row1.idRuleParam = 208178101;
    row1.overridebility = "S";
    row1.reference = "ANR-121";
    std::strcpy(row1.description, "Lenient row");
    row1.params["MAX WORKING DAYS"] = "8";
    row1.params["LAST DAY BUFFER HHMM"] = "21:00";
    input.dbRules.push_back(row1);

    DBRule row2 = row1;
    row2.rowNum = 2;
    row2.idRuleParam = 208178102;
    std::strcpy(row2.description, "Strict row");
    row2.params["MAX WORKING DAYS"] = "7";
    input.dbRules.push_back(row2);

    auto rule = makeRule7415(ctx, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const time_t day0 = utcFromString("2025-12-01 00:00:00");
    for (int i = 0; i < 8; ++i) {
        const time_t startUtc = day0 + static_cast<time_t>(i) * 24 * 3600;
        const time_t endUtc = startUtc + 8 * 3600;
        duties.push_back(makeDuty({startUtc, endUtc}, i + 1, ctx));
    }

    auto pairing = makePairing(asRaw(duties), "SIN");

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_FALSE(violations.empty());
    EXPECT_EQ(violations.front()->ruleParamId, 208178102);

    for (auto* rv : violations) {
        delete rv;
    }
}
