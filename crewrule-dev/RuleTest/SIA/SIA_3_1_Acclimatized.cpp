// SIA_SUITE_SUMMARY_START
// SuiteId: 3.1
// Name: Acclimatized
// SourceCsvRow: 3.1.,Acclimatized
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: SIN-JNB-SIN COP with 3 local nights at JNB (return sector acclimatized to JNB).
//   - Case #2: SIN-MAN-SIN COP with 3 local nights at MAN (return sector acclimatized to MAN).
//   - Case #3: SIN-JNB with standby during local night at JNB before return (remains acclimatized to SIN).
//   - Case #4: SIN-JNB with standby outside local night at JNB before return (return sector acclimatized to JNB).
// Results:
//   - pass 4 out of 4 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:20Z
// RemainingWork:
//   - None (all four SIA 3.1 COP scenarios have direct unit-test coverage).
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7400/AcclimatizationOfANRRule.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "rule/framework/constant/Constants.h"
#include "SIA_CommonTestConfig.h"

#include <memory>
#include <string>
#include <vector>

namespace {

struct DutyConfig {
    std::string depStation;
    std::string arrStation;
    std::string startTime;  // Flights: UTC string; Standby: local time string
    std::string endTime;    // Flights: UTC string; Standby: local time string
    bool isLocal{false};
    long pickupMinutes{ 0 };
    long dropoffMinutes{ 60 };
};

std::unique_ptr<Duty> makeDuty(const DutyConfig& cfg, const SharedPtr<CrewDataContext>& ctx) {
    auto duty = std::make_unique<Duty>();
    duty->setDepartureStation(cfg.depStation);
    duty->setArrivalStation(cfg.arrStation);

    // Flight legs provide UTC strings; standby (STBY) times are in local time and need conversion.
    const time_t startUtc = cfg.isLocal
        ? SIATest::utcFromLocal(cfg.startTime, cfg.depStation, ctx)
        : utcStrToUtc(const_cast<char*>(cfg.startTime.c_str()));
    const time_t endUtc = cfg.isLocal
        ? SIATest::utcFromLocal(cfg.endTime, cfg.arrStation, ctx)
        : utcStrToUtc(const_cast<char*>(cfg.endTime.c_str()));

    duty->setStartTimeUtcAct(startUtc);
    duty->setEndTimeUtcAct(endUtc);

    const std::string depZoneId = ctx->getAirportZoneId(cfg.depStation);
    const std::string arrZoneId = ctx->getAirportZoneId(cfg.arrStation);
    auto startLoc = TimezoneUtils::GetLocalTime(startUtc, depZoneId);
    auto endLoc = TimezoneUtils::GetLocalTime(endUtc, arrZoneId);

    duty->setStartTimeLocAct(startLoc);
    duty->setEndTimeLocAct(endLoc);

    duty->setActualPickupMin(cfg.pickupMinutes);
    duty->setActualDropoffMin(cfg.dropoffMinutes);
    duty->setMinPickup(cfg.pickupMinutes);
    duty->setMinDropoff(cfg.dropoffMinutes);

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

SharedPtr<CrewDataContext> buildAcclimatizationDataContext() {
    return SIATest::buildCrewDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"JNB", 120, "Africa/Johannesburg"},
        {"MAN", 0,   "Europe/London"},
    });
}

std::unique_ptr<AcclimatizationOfANRRule> makeRule7400(const SharedPtr<CrewDataContext>& ctx) {
    RuleInput input;
    const std::string param = std::to_string(SIATest::kAcclimatizedMinLocalNights) + ",2";
    input.ruleParamString.push_back(param);

    auto rule = std::make_unique<AcclimatizationOfANRRule>(nullptr, input);
    rule->setDataContext(ctx);
    return rule;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setPrimeActivity("FLY");

    if (!duties.empty()) {
        Duty* first = duties.front();
        Duty* last = duties.back();
        pairing->setStartTimeUtcAct(first->getStartTimeUtcAct());
        pairing->setStartTimeLocAct(first->getStartTimeLocAct());
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct());
        pairing->setEndTimeLocAct(last->getEndTimeLocAct());
    }

    return pairing;
}

}  // namespace

class SIA_3_1_AcclimatizedTest : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    SIATest::SiaRuleParamGuard _paramsGuard;
};

// Case #1: COP Day1 SIN-JNB, Day5 JNB-SIN -> acclimatized to JNB before return.
TEST_F(SIA_3_1_AcclimatizedTest, JnbReturnAfterThreeLocalNights) {
    auto ctx = buildAcclimatizationDataContext();
    auto rule = makeRule7400(ctx);

    std::vector<std::unique_ptr<Duty>> duties;

    // Excel 3.1 Case #1:
    //   Day 1 - SQ 482 - SIN-JNB - 0555-1635 (local times)
    //   Day 5 - SQ 481 - JNB-SIN - 1750-0415 (local times, arrival Day 6)
    duties.push_back(makeDuty(
        {"SIN", "JNB",
         "2025-01-01 05:55:00",
         "2025-01-01 16:35:00"},
        ctx));

    // Rest at JNB from Day 1 late evening through Day 5, providing three
    // consecutive local nights at JNB.
    duties.push_back(makeDuty(
        {"JNB", "SIN",
         "2025-01-05 17:50:00",
         "2025-01-06 04:15:00"},
        ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[1]->getRefTimeZone(), ctx->airportUtcOffsetMap["JNB"]);
}

// Case #2: COP Day1 SIN-MAN, Day5 MAN-SIN -> acclimatized to MAN before return.
TEST_F(SIA_3_1_AcclimatizedTest, ManReturnAfterThreeLocalNights) {
    auto ctx = buildAcclimatizationDataContext();
    auto rule = makeRule7400(ctx);

    std::vector<std::unique_ptr<Duty>> duties;

    // Excel 3.1 Case #2:
    //   Day 1 - SQ 302 - SIN-MAN - 1810-0815 (arrival Day 2 local)
    //   Day 5 - SQ301 - MAN-SIN - 0935-2300
    duties.push_back(makeDuty(
        {"SIN", "MAN",
         "2025-02-01 18:10:00",
         "2025-02-02 08:15:00"},
        ctx));

    duties.push_back(makeDuty(
        {"MAN", "SIN",
         "2025-02-05 09:35:00",
         "2025-02-05 23:00:00"},
        ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[1]->getRefTimeZone(), ctx->airportUtcOffsetMap["MAN"]);
}

// Case #3: COP SIN-JNB, standby during local night at JNB, JNB-SIN -> remain acclimatized to SIN.
TEST_F(SIA_3_1_AcclimatizedTest, StandbyDuringLocalNightPreventsAcclimatization) {
    auto ctx = buildAcclimatizationDataContext();
    auto rule = makeRule7400(ctx);

    std::vector<std::unique_ptr<Duty>> duties;

    // Excel 3.1 Case #3:
    //   Day 1 - SQ 482 - SIN-JNB - 0555-1635
    //   Day 3: STBY 0100-0700LT at JNB (local night standby)
    //   Day 5 - SQ 481 - JNB-SIN - 1750-0415
    duties.push_back(makeDuty(
        {"SIN", "JNB",
         "2025-03-01 05:55:00",
         "2025-03-01 16:35:00"},
        ctx));

    duties.push_back(makeDuty(
        {"JNB", "JNB",
         "2025-03-03 01:00:00",
         "2025-03-03 07:00:00",
         true},
        ctx));

    duties.push_back(makeDuty(
        {"JNB", "SIN",
         "2025-03-05 17:50:00",
         "2025-03-06 04:15:00"},
        ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[2]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[2]->getRefTimeZone(), ctx->airportUtcOffsetMap["SIN"]);
}

// Case #4: COP SIN-JNB, standby outside local night at JNB, JNB-SIN -> acclimatized to JNB.
TEST_F(SIA_3_1_AcclimatizedTest, StandbyOutsideLocalNightStillAcclimatizes) {
    auto ctx = buildAcclimatizationDataContext();
    auto rule = makeRule7400(ctx);

    std::vector<std::unique_ptr<Duty>> duties;

    // Excel 3.1 Case #4:
    //   Day 1 - SQ 482 - SIN-JNB - 0555-1635
    //   Day 3: STBY 1500-2100 at JNB (outside local night)
    //   Day 5 - SQ 481 - JNB-SIN - 1750-0415
    duties.push_back(makeDuty(
        {"SIN", "JNB",
         "2025-04-01 05:55:00",
         "2025-04-01 16:35:00"},
        ctx));

    duties.push_back(makeDuty(
        {"JNB", "JNB",
         "2025-04-03 15:00:00",
         "2025-04-03 21:00:00",
         true},
        ctx));

    duties.push_back(makeDuty(
        {"JNB", "SIN",
         "2025-04-05 17:50:00",
         "2025-04-06 04:15:00"},
        ctx));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[2]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[2]->getRefTimeZone(), ctx->airportUtcOffsetMap["JNB"]);
}