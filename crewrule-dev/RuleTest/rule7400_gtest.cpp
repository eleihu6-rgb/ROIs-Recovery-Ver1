#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7400/AcclimatizationOfANRRule.h"
#include "RuleEngine/rule/framework/constant/Constants.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"

#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

struct DutyUtcConfig {
    std::string depStation;
    std::string arrStation;
    std::string startUtc;   // "YYYY-MM-DD HH:MM:SS"
    std::string endUtc;     // "YYYY-MM-DD HH:MM:SS"
    long pickupMinutes{ 0 };
    long dropoffMinutes{ 0 };
};

std::unique_ptr<Duty> makeDuty(const DutyUtcConfig& cfg, const SharedPtr<CrewDataContext>& ctx) {
    auto duty = std::make_unique<Duty>();
    duty->setDepartureStation(cfg.depStation);
    duty->setArrivalStation(cfg.arrStation);

    const time_t startUtc = utcFromString(cfg.startUtc);
    const time_t endUtc = utcFromString(cfg.endUtc);

    duty->setStartTimeUtcAct(startUtc);
    duty->setEndTimeUtcAct(endUtc);

    const std::string depZoneId = ctx->getAirportZoneId(cfg.depStation);
    const std::string arrZoneId = ctx->getAirportZoneId(cfg.arrStation);
    auto startLoc = TimezoneUtils::GetLocalTime(startUtc, depZoneId);
    auto endtLoc = TimezoneUtils::GetLocalTime(endUtc, arrZoneId);

    duty->setStartTimeLocAct(startLoc);
    duty->setEndTimeLocAct(endtLoc);

    duty->setActualPickupMin(cfg.pickupMinutes);
    duty->setActualDropoffMin(cfg.dropoffMinutes);

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

struct Rule7400Config {
    int minLocalNights{3};
    std::string accStateCurrentTz{AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS};
    std::string accStatePrevTz{AcclimatizationStateOfEASA::ACCLIMATIZED_PREV};
    int severity{2};
};

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);

    struct AirportConfig {
        const char* code;
        int utcOffsetMinutes;
        const char* zoneId;
    };

    const AirportConfig airports[] = {
        {"SIN", 480,  "Asia/Singapore"},
        {"HGH", 480,  "Asia/Shanghai"},
        {"MXP", 60,   "Europe/Rome"},
        {"AKL", 720,  "Pacific/Auckland"},
        {"FRA", 60,   "Europe/Berlin"},
        {"JFK", -300, "America/New_York"},
        {"BCN", 60,   "Europe/Madrid"},
    };

    for (const auto& airport : airports) {
        ctx->airportUtcOffsetMap[airport.code] = airport.utcOffsetMinutes;
        ctx->airportZoneIdMap[airport.code] = airport.zoneId;
    }

    return ctx;
}

std::unique_ptr<AcclimatizationOfANRRule> makeRule7400(const Rule7400Config& cfg,
                                                       const SharedPtr<CrewDataContext>& ctx) {
    RuleInput input;
    input.ruleParamString.push_back(
        std::to_string(cfg.minLocalNights) + "," +
        cfg.accStateCurrentTz + "," +
        cfg.accStatePrevTz + "," +
        std::to_string(cfg.severity));

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

class Rule7400Test : public ::testing::Test {
protected:
    void SetUp() override {
        // Configure default local night definition: 8 hours within 22:00–08:00.
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:00";
        ln.LocalEnd = "08:00";
        ln.MinRestInterval = "08:00";
    }
};

// Example 1 
// Base SIN, duty SIN-MXP then MXP-SIN with 3 consecutive local nights at MXP.
// Acclimatized timezone changes to MXP before MXP-SIN.
TEST_F(Rule7400Test, Example1_AcclimatizationToMXP) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> MXP
    duties.push_back(makeDuty({"SIN", "MXP",
                               "2025-05-28 10:00:00",  // arbitrary
                               "2025-05-28 21:00:00",  // 22:00 local at MXP after offset
                               }, ctx));

    // Between Duty0 end and Duty1 start, rest at MXP from
    // 2025-05-28 22:00 local to 2025-05-31 06:00 local
    // -> 3 local nights at MXP.

    // Duty 1: MXP -> SIN
    duties.push_back(makeDuty({"MXP", "SIN",
                               "2025-05-31 05:00:00",  // 06:00 local at MXP
                               "2025-05-31 15:00:00",
                               }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    // First duty uses base (SIN) acclimated timezone.
    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    // Second duty is acclimatized now to MXP after 3 local nights.
    // In late May, Europe/Rome is DST (UTC+2 => 120 minutes).
    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 120);
}

// Example 1_a
// Base SIN, duty SIN-MXP 2 nights; then MXP-BCN in the day time, 1 night BCN (same time zone); BCN-SIN  
// Total 3 consecutive local nights at time zone UTC+2 (DST in late May).
// Acclimatized timezone changes to MXP before BCN-SIN.
TEST_F(Rule7400Test, Example1_a_AcclimatizationToMXP) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> MXP
    duties.push_back(makeDuty({ "SIN", "MXP",
                               "2025-05-28 10:00:00",  // arbitrary
                               "2025-05-28 21:00:00",  // 22:00 local at MXP after offset
        }, ctx));

    // Between Duty0 end and Duty1 start, rest at MXP from
    // 2025-05-28 22:00 local to 2025-05-30 06:00 local
    // -> 2 local nights at MXP.

	// Duty 1: MXP-BCN
    duties.push_back(makeDuty({ "MXP", "BCN",
                           "2025-05-30 10:00:00",  // 06:00 local at MXP
                           "2025-05-30 12:00:00",
        }, ctx));

	// Between Duty1 end and Duty2 start, rest at BCN,  1 local night at same time zone UTC+1
    // Duty 2: BCN -> SIN
    duties.push_back(makeDuty({ "BCN", "SIN",
                               "2025-05-31 05:00:00",  // 06:00 local at MXP
                               "2025-05-31 15:00:00",
        }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    // First duty uses base (SIN) acclimated timezone.
    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    // Second duty is acclimatized to original SIN after 2 local nights.
    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 480);

    // third duty is acclimatized now to MXP/BCN (UTC+2 in late May) after 3 local nights.
    EXPECT_EQ(raw[2]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[2]->getRefTimeZone(), 120);
}

// Base SIN, SIN-MXP (2 local nights), MXP-BCN day flight, then BCN-SIN after the Europe DST fallback.
// The final rest contributes 1 more local night, and the crew should be acclimatized to the duty-after-rest
// departure timezone (UTC+1 after fallback).
TEST_F(Rule7400Test, DstFallbackCarriesLocalNightCountToPostChangeDepartureTimezone) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({ "SIN", "MXP",
                               "2025-10-22 10:00:00",
                               "2025-10-22 20:00:00",
        }, ctx));

    duties.push_back(makeDuty({ "MXP", "BCN",
                               "2025-10-24 04:00:00",  // 06:00 local at MXP (UTC+2)
                               "2025-10-24 06:00:00",  // 08:00 local at BCN (UTC+2)
        }, ctx));

    duties.push_back(makeDuty({ "BCN", "SIN",
                               "2025-10-26 03:00:00",  // 04:00 local at BCN after fallback (UTC+1)
                               "2025-10-26 15:00:00",
        }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 480);

    EXPECT_EQ(raw[2]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[2]->getRefTimeZone(), 60);
}

// acclimatized to MXP, then MXP-BCN (same timezone) DST change
TEST_F(Rule7400Test, DstFallbackCarriesAccStateToPostChangeDepartureTimezone) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({ "SIN", "MXP",
                               "2025-10-21 10:00:00",
                               "2025-10-21 20:00:00",
        }, ctx));

    duties.push_back(makeDuty({ "MXP", "BCN",
                               "2025-10-24 04:00:00",  // 06:00 local at MXP (UTC+2)
                               "2025-10-24 06:00:00",  // 08:00 local at BCN (UTC+2)
        }, ctx));

    duties.push_back(makeDuty({ "BCN", "SIN",
                               "2025-10-26 03:00:00",  // 04:00 local at BCN after fallback (UTC+1)
                               "2025-10-26 15:00:00",
        }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 120);

    EXPECT_EQ(raw[2]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[2]->getRefTimeZone(), 60);
}

// Base SIN, SIN-MXP, then MXP-SIN after the Europe DST fallback.
// Rest starts in UTC+2 and ends in UTC+1. The rest ends at 05:00 local after the change and
// contributes only 2 local nights, so acclimatized timezone remains the original SIN timezone.
TEST_F(Rule7400Test, DstFallbackWithOnlyTwoLocalNightsKeepsOriginalAcclimatizedTimezone) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({ "SIN", "MXP",
                               "2025-10-24 10:00:00",
                               "2025-10-24 20:00:00",  // 22:00 local at MXP before fallback (UTC+2)
        }, ctx));

    duties.push_back(makeDuty({ "MXP", "SIN",
                               "2025-10-26 04:00:00",  // 05:00 local at MXP after fallback (UTC+1)
                               "2025-10-26 16:00:00",
        }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 480);
}

// Base SIN, SIN-MXP, then MXP-SIN after the Europe DST spring-forward.
// Rest starts in UTC+1 and ends in UTC+2. The rest ends at 06:00 local after the change and
// covers 3 local nights in total, so acclimatized timezone changes to the new departure timezone.
TEST_F(Rule7400Test, DstSpringForwardWithThreeLocalNightsUsesNewDepartureTimezone) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    duties.push_back(makeDuty({ "SIN", "MXP",
                               "2025-03-26 10:00:00",
                               "2025-03-26 21:00:00",  // 22:00 local at MXP before spring-forward (UTC+1)
        }, ctx));

    duties.push_back(makeDuty({ "MXP", "SIN",
                               "2025-03-30 04:00:00",  // 06:00 local at MXP after spring-forward (UTC+2)
                               "2025-03-30 16:00:00",
        }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 120);
}

// Example 2:
// Base SIN, SIN-AKL-SIN with only 2 local nights at AKL.
// Acclimatized timezone remains SIN before and after AKL-SIN.
TEST_F(Rule7400Test, Example2_RemainAcclimatizedToSIN) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> AKL
    duties.push_back(makeDuty({"SIN", "AKL",
                               "2025-05-20 08:00:00",
                               "2025-05-20 20:00:00",
                               }, ctx));

    // Rest at AKL from 2025-05-21 22:00 local to 2025-05-23 06:00 local
    // -> 2 local nights at AKL.

    // Duty 1: AKL -> SIN
    duties.push_back(makeDuty({"AKL", "SIN",
                               "2025-05-22 18:00:00",  // 2025-05-23 06:00 local (UTC+12)
                               "2025-05-23 06:00:00",
                               }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    // First duty: acclimatized with reference timezone SIN.
    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    // Second duty: acclimatized, no change in acclimated timezone.
    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 480);
}

// Example 3:
// SIN-FRA (2 local nights at FRA), FRA-JFK (1 night at JFK),
// JFK-FRA (1 night at FRA), FRA-SIN.
// Because timezone changes FRA -> JFK -> FRA, no station accumulates
// 3 consecutive local nights, so acclimatized timezone remains SIN.
TEST_F(Rule7400Test, Example3_TimezoneRemainsSINAcrossChanges) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> FRA
    duties.push_back(makeDuty({"SIN", "FRA",
                               "2025-05-21 08:00:00",
                               "2025-05-21 18:00:00",
                               }, ctx));

    // Rest at FRA from 2025-05-21 22:00 local to 2025-05-23 06:00 local
    // -> 2 local nights at FRA before Duty 1.

    // Duty 1: FRA -> JFK
    duties.push_back(makeDuty({"FRA", "SIN",
                               "2025-05-23 05:00:00",  // 06:00 local at FRA
                               "2025-05-23 12:00:00",  // 07:00 local at JFK
                               }, ctx));

    // Rest at JFK from 2025-05-23 22:00 local to 2025-05-24 06:00 local
    // -> 1 local night at JFK before Duty 2.

    // Duty 2: JFK -> FRA
    duties.push_back(makeDuty({"JFK", "FRA",
                               "2025-05-25 03:00:00",  // 22:00 local previous day at JFK (UTC-5)
                               "2025-05-25 11:00:00",  // 12:00 local at FRA (UTC+1)
                               }, ctx));

    // Rest at FRA from 2025-05-25 22:00 local to 2025-05-26 06:00 local
    // -> 1 local night at FRA before Duty 3.

    // Duty 3: FRA -> SIN
    duties.push_back(makeDuty({"FRA", "SIN",
                               "2025-05-26 05:00:00",  // 06:00 local at FRA
                               "2025-05-26 15:00:00",
                               }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    // All duties are acclimatized; acclimated timezone always remains SIN.
    for (std::size_t i = 0; i < raw.size(); ++i) {
        if (i==0) {
            EXPECT_EQ(raw[i]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
        } else {
            EXPECT_EQ(raw[i]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
		}
        EXPECT_EQ(raw[i]->getRefTimeZone(), 480);
    }
}

// Edge case: single duty pairing should be acclimatized at its departure timezone.
TEST_F(Rule7400Test, SingleDutyIsAcclimatizedAtDepartureTimezone) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({"SIN", "SIN",
                               "2025-05-15 08:00:00",
                               "2025-05-15 12:00:00",
                               }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);
}

// Same timezone duties with >=24h rest should remain acclimatized ("A") on the second duty as well.
TEST_F(Rule7400Test, SameTimezoneAfter24HourRestRemainsAcclimatized) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> HGH (both UTC+8)
    duties.push_back(makeDuty({ "SIN", "HGH",
                                "2025-07-01 00:00:00",  // 08:00 local
                                "2025-07-01 04:00:00",  // 12:00 local
        }, ctx));

    // Duty 1: HGH -> SIN after 24h rest at HGH (UTC+8)
    duties.push_back(makeDuty({ "HGH", "SIN",
                                "2025-07-02 04:00:00",  // 12:00 local (24h after Duty0 end local)
                                "2025-07-02 08:00:00",  // 16:00 local
        }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 480);
}

// Edge case: exactly meeting the minimum local nights threshold at a new timezone.
TEST_F(Rule7400Test, ExactlyMinimumLocalNightsTriggersAcclimatization) {
    Rule7400Config cfg;
    cfg.minLocalNights = 2;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> MXP
    duties.push_back(makeDuty({"SIN", "MXP",
                               "2025-06-01 08:00:00",
                               "2025-06-01 22:00:00", // 00:00 local day+1 at MXP (DST UTC+2)
                               }, ctx));

    // Rest at MXP from 2025-06-02 00:00 local to 2025-06-03 06:00 local
    // -> 2 local nights at MXP == minimum threshold.

    // Duty 1: MXP -> BCN
    duties.push_back(makeDuty({"MXP", "SIN",
                               "2025-06-03 04:00:00",  // 06:00 local at MXP (DST UTC+2)
                               "2025-06-03 08:00:00",
                               }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    // Second duty: exactly 2 MXP local nights -> acclimated timezone changes to MXP.
    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 120);
}

// Edge case: zero effective local-night rest between duties (rest window too short).
TEST_F(Rule7400Test, ZeroLocalNightsBetweenDutiesKeepsReferenceTimezone) {
    Rule7400Config cfg;
    cfg.minLocalNights = 1;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> MXP, ends just before local night window.
    duties.push_back(makeDuty({"SIN", "MXP",
                               "2025-06-05 10:00:00",
                               "2025-06-05 20:00:00",  // 21:00 local at MXP
                               }, ctx));

    // Duty 1: MXP -> BCN, starts after a short rest that does not cover
    // a full 8-hour local night.
    duties.push_back(makeDuty({"MXP", "SIN",
                               "2025-06-06 02:00:00",  // 03:00 local at MXP
                               "2025-06-06 06:00:00",
                               }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 480);
}

TEST_F(Rule7400Test, CustomYnOutputStatesMapCurrentAndPreviousTimezoneResults) {
    Rule7400Config cfg;
    cfg.accStateCurrentTz = "Y";
    cfg.accStatePrevTz = "N";
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> storage;
    storage.push_back(makeDuty({"SIN", "MXP", "2025-05-01 02:00:00", "2025-05-01 14:00:00", 0, 0}, ctx));
    storage.push_back(makeDuty({"MXP", "SIN", "2025-05-04 06:00:00", "2025-05-04 18:00:00", 0, 0}, ctx));
    storage.push_back(makeDuty({"SIN", "HGH", "2025-05-05 02:00:00", "2025-05-05 06:00:00", 0, 0}, ctx));

    auto raw = asRaw(storage);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    EXPECT_EQ(raw[0]->getAcclimatisedState(), "Y");
    EXPECT_EQ(raw[0]->getAcclimatisedStateForRestStart(), "Y");

    EXPECT_EQ(raw[1]->getAcclimatisedState(), "Y");
    EXPECT_EQ(raw[1]->getAcclimatisedStateForRestStart(), "Y");

    EXPECT_EQ(raw[2]->getAcclimatisedState(), "N");
    EXPECT_EQ(raw[2]->getAcclimatisedStateForRestStart(), "N");
    EXPECT_EQ(raw[2]->getRefTimeZone(), 120);
}

// complex example with multiple duties and timezone changes
TEST_F(Rule7400Test, MultipleAccTimeZoneChange) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> MXP, ends just before local night window.
    duties.push_back(makeDuty({ "SIN", "MXP",
                               "2025-06-01 10:00:00",
                               "2025-06-01 20:00:00",  // 21:00 local at MXP
        }, ctx));

    // Duty 1: MXP -> BCN, starts after 2 local nights, can be standby instead
    duties.push_back(makeDuty({ "MXP", "BCN",
                               "2025-06-03 07:00:00",  // 08:00 local at MXP
                               "2025-06-03 09:00:00",
        }, ctx));

    // Duty 2: BCN -> MXP, day return, can be standby instead
    duties.push_back(makeDuty({ "MXP", "BCN",
                               "2025-06-03 10:00:00",  // 11:00 local at BCN
                               "2025-06-03 12:00:00",
        }, ctx));

	// now extra local night, should change acclimatization timezone to MXP

    // Duty 3: MXP -> JFK
    duties.push_back(makeDuty({ "MXP", "JFK",
                               "2025-06-04 10:00:00",  // 11:00 local at BCN
							   "2025-06-04 15:00:00",  // 10:00 local at JFK
        }, ctx));

	// now 4 local night at JFK, should change acclimatization timezone to JFK

    // Duty 4: JFK -> MXP
    duties.push_back(makeDuty({ "JFK", "MXP",
							   "2025-06-09 10:00:00",  // 05:00 local at JFK
							   "2025-06-09 15:00:00",  // 16:00 local at MXP
        }, ctx));

    // now 3 local night at MXP, should change acclimatization timezone to MXP

    // Duty 5: MXP -> SIN
    duties.push_back(makeDuty({ "MXP", "SIN",
							   "2025-06-12 10:00:00",  // 11:00 local at MXP 
                               "2025-06-12 20:00:00",  
        }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    // duty 0 start SIN
    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

	// duty 1 start MXP after 2 local nights
    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 480);

    // duty 2 BCN-MXP no change
    EXPECT_EQ(raw[2]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[2]->getRefTimeZone(), 480);

    // duty 3 MXP-JFK accumulated 3 local night
    EXPECT_EQ(raw[3]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[3]->getRefTimeZone(), 120);

    // duty 4 JFK-MXP accumulated 3 local night
    EXPECT_EQ(raw[4]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[4]->getRefTimeZone(), -240);

    // duty 5 MXP-SIN accumulated 3 local night
    EXPECT_EQ(raw[5]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[5]->getRefTimeZone(), 120);

}

// complex example with multiple duties and timezone changes
TEST_F(Rule7400Test, StayAccTimeZoneBreakLN) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> MXP, ends just before local night window.
    duties.push_back(makeDuty({ "SIN", "MXP",
                               "2025-06-01 10:00:00",
                               "2025-06-01 20:00:00",  // 21:00 local at MXP
        }, ctx));

    // Duty 1: MXP -> BCN, starts after 2 local nights, can be standby instead
    duties.push_back(makeDuty({ "MXP", "BCN",
                               "2025-06-03 22:00:00",  // 08:00 local at MXP
                               "2025-06-04 02:00:00",
        }, ctx));

    // Duty 2: BCN -> MXP, day return, can be standby instead
    duties.push_back(makeDuty({ "BCN", "MXP",
                               "2025-06-04 10:00:00",  // 11:00 local at BCN
                               "2025-06-04 12:00:00",
        }, ctx));

    // 0 local night

    // Duty 3: MXP sby
    duties.push_back(makeDuty({ "MXP", "MXP",
                               "2025-06-04 22:00:00",  // 11:00 local at MXP
                               "2025-06-05 10:00:00",  // 16:00 local at MXP
        }, ctx));

    // now extra 2 local night (06-05 and 06-06) at MXP, stay SIN

    // Duty 4: MXP -> SIN
    duties.push_back(makeDuty({ "MXP", "SIN",
                               "2025-06-07 10:00:00",  // 11:00 local at MXP
                               "2025-06-07 19:00:00",  // 
        }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    // duty 0 start SIN
    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    // duty 1 start MXP after 2 local nights
    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 480);

    // duty 2 BCN-MXP no change
    EXPECT_EQ(raw[2]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[2]->getRefTimeZone(), 480);

    // duty 3 MXP-JFK local night not consecutive
    EXPECT_EQ(raw[3]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[3]->getRefTimeZone(), 480);

    // duty 4 JFK-MXP accumulated 3 local night
    EXPECT_EQ(raw[4]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[4]->getRefTimeZone(), 480);

}
// complex example with multiple duties and timezone changes
TEST_F(Rule7400Test, StayAccTimeZoneAccumulateLN) {
    Rule7400Config cfg;
    cfg.minLocalNights = 3;

    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Duty>> duties;

    // Duty 0: SIN -> MXP, ends just before local night window.
    duties.push_back(makeDuty({ "SIN", "MXP",
                               "2025-06-01 10:00:00",
                               "2025-06-01 20:00:00",  // 21:00 local at MXP
        }, ctx));

    // Duty 1: MXP -> BCN, starts after 2 local nights, can be standby instead
    duties.push_back(makeDuty({ "MXP", "BCN",
                               "2025-06-03 22:00:00",  // 08:00 local at MXP
                               "2025-06-04 02:00:00",
        }, ctx));

    // Duty 2: BCN -> MXP, day return, can be standby instead
    duties.push_back(makeDuty({ "BCN", "MXP",
                               "2025-06-04 10:00:00",  // 11:00 local at BCN
                               "2025-06-04 12:00:00",
        }, ctx));

    // now 06-04 1 local night, but not consecutive with earlier 2 LN, stay at SIN

    // Duty 3: MXP sby
    duties.push_back(makeDuty({ "MXP", "MXP",
                               "2025-06-05 10:00:00",  // 11:00 local at MXP
                               "2025-06-05 15:00:00",  // 16:00 local at MXP
        }, ctx));

    // now extra 2 local night (06-05 and 06-06) at MXP, consecutive with 06-04 LN should change to MXP

    // Duty 4: MXP -> SIN
    duties.push_back(makeDuty({ "MXP", "SIN",
                               "2025-06-07 10:00:00",  // 11:00 local at MXP
                               "2025-06-07 19:00:00",  // 
        }, ctx));

    auto raw = asRaw(duties);
    auto rule = makeRule7400(cfg, ctx);
    auto pairing = makePairing(raw, "SIN");

    rule->CalculateDuty(pairing.get());

    // duty 0 start SIN
    EXPECT_EQ(raw[0]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[0]->getRefTimeZone(), 480);

    // duty 1 start MXP after 2 local nights
    EXPECT_EQ(raw[1]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[1]->getRefTimeZone(), 480);

    // duty 2 BCN-MXP no change
    EXPECT_EQ(raw[2]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[2]->getRefTimeZone(), 480);

    // duty 3 MXP-JFK local night not consecutive
    EXPECT_EQ(raw[3]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_PREV);
    EXPECT_EQ(raw[3]->getRefTimeZone(), 480);

    // duty 4 JFK-MXP accumulated 3 local night
    EXPECT_EQ(raw[4]->getAcclimatisedState(), AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT_ALIAS);
    EXPECT_EQ(raw[4]->getRefTimeZone(), 120);

}

// TODO, add standby duty tests when RuleEngine supports it.
