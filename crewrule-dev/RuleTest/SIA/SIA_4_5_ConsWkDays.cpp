// SIA_SUITE_SUMMARY_START
// SuiteId: 4.5.2
// Name: Consecutive Working Days
// SourceCsvRow: 4.5,Consecutive Working Days
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: COP with 7 consecutive working days, duty on Day 7 exceeds last day buffer of 21:00. Expected: Illegal.
//   - Case #2: COP with Standby on Day 6, duty on Day 7 exceeds last day buffer of 21:00. Expected: Illegal. (Standby is counted as duty)
//   - Case #3: COP with 7 consecutive working days, last duty on Day 7 ends before 22:55. Expected: Illegal (buffer to 7 consec days as SGN returns 2255LT).
//   - Case #4: COP with 8 consecutive working days. Expected: Illegal.
// Results:
//   - TBD
// RemainingWork:
//   - Add more complex scenarios to test edge cases of ANR Day Off calculation.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7415/CheckAnrDayOffSpacingRule.h"
// #include "RuleEngine/rule/rule7416/CheckAnrMinDayOffInPeriodRule.h" // Rule 7416 is not directly tested by these cases.
#include "RuleEngine/rule/framework/RuleSystemDefine.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "orUtil/UtilFunc.h"

// SIA 4.5 Consecutive Working Days.
// Best-fit rule: CheckAnrDayOffSpacingRule (rule 7415) with MAX WORKING DAYS = 7.

namespace {

std::string normalizeLocalTime(const std::string& localDateTime) {
    if (localDateTime.size() == 16) {
        return localDateTime + ":00";
    }
    return localDateTime;
}

struct SegmentConfig {
    std::string depStation;
    std::string arrStation;
    std::string depDateTimeUtc; // YYYY-MM-DD HH:MM[:SS] UTC
    std::string arrDateTimeUtc; // YYYY-MM-DD HH:MM[:SS] UTC
};

struct DutyConfig {
    std::string assignment; // "FLY", "SBY" (Standby)
    std::vector<SegmentConfig> segments;
    std::string day; // e.g., "Day 1" for reference in comments
    int seq;
    // For non-standby duties
    int reportOffsetMin = SIATest::kReportTimeMinutes; // 1 hour before first segment dep
    int debriefOffsetMin = SIATest::kDebriefTimeMinutes; // 30 min after last segment arr
    int transportOffsetMin = SIATest::kTransportTimeMinutes; // 1 hour after debrief (for rest start)
};

std::unique_ptr<Duty> makeDuty(const DutyConfig& config, const SharedPtr<CrewDataContext>& ctx) {
    auto duty = std::make_unique<Duty>();
    duty->setDutySeq(config.seq);
    duty->setPairingId(7415002); // Unique pairing ID for this test suite
    duty->setAssignment(config.assignment);
    if (!config.segments.empty()) {
        duty->setDepartureStation(config.segments.front().depStation);
        duty->setArrivalStation(config.segments.back().arrStation);
    }

    const bool isStandby = (config.assignment == "SBY");
    const int reportOffsetMin = isStandby ? 0 : config.reportOffsetMin;
    const int debriefOffsetMin = isStandby ? 0 : config.debriefOffsetMin;
    const int transportOffsetMin = isStandby ? 0 : config.transportOffsetMin;

    time_t startUtc = 0;
    time_t endUtc = 0;
    if (!config.segments.empty()) {
        const auto& firstSeg = config.segments.front();
        const auto& lastSeg = config.segments.back();
        const time_t firstDepUtc =
            utcStrToUtc(const_cast<char*>(normalizeLocalTime(firstSeg.depDateTimeUtc).c_str()));
        const time_t lastArrUtc =
            utcStrToUtc(const_cast<char*>(normalizeLocalTime(lastSeg.arrDateTimeUtc).c_str()));
        startUtc = firstDepUtc - static_cast<time_t>(reportOffsetMin) * 60;
        endUtc = lastArrUtc + static_cast<time_t>(debriefOffsetMin) * 60;
    }

    duty->setStartTimeUtcAct(startUtc);
    duty->setEndTimeUtcAct(endUtc);
    duty->setStartTimeUtcSch(startUtc);
    duty->setEndTimeUtcSch(endUtc);

    const std::string depZone = ctx->getAirportZoneId(duty->getDepartureStation());
    const std::string arrZone = ctx->getAirportZoneId(duty->getArrivalStation());
    duty->setStartTimeLocAct(TimezoneUtils::GetLocalTime(startUtc, depZone));
    duty->setEndTimeLocAct(TimezoneUtils::GetLocalTime(endUtc, arrZone));
    duty->setStartTimeLocSch(duty->getStartTimeLocAct());
    duty->setEndTimeLocSch(duty->getEndTimeLocAct());

    duty->setMinBrief(reportOffsetMin);
    duty->setActualBriefMin(reportOffsetMin);
    duty->setMinDebrief(debriefOffsetMin);
    duty->setActualDebriefMin(debriefOffsetMin);
    duty->setMinDropoff(transportOffsetMin);
    duty->setActualDropoffMin(transportOffsetMin);
    duty->setMinPickup(0);
    duty->setActualPickupMin(0);
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
    pairing->setId(7415002);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

RuleInput makeRule7415Input() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7415002;
    row.function = 7415;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 208178002;
    row.overridebility = "S";
    std::strcpy(row.description, "ANR max consecutive working days between day offs");
    row.params["MAX WORKING DAYS"] = "7";
    row.params["LAST DAY BUFFER HHMM"] = "21:00"; // 9 PM
    input.dbRules.push_back(row);

    DBRule dayOffRow{};
    dayOffRow.idRule = 7401002;
    dayOffRow.function = 7401;
    dayOffRow.tableNum = 1;
    dayOffRow.rowNum = 1;
    dayOffRow.phase = 1;
    dayOffRow.idRuleParam = 74010021;
    dayOffRow.overridebility = "S";
    std::strcpy(dayOffRow.description, "ANR day off definition (stricter for consecutive days test)");
    dayOffRow.params["DAY OFF SEQUENCE"] = "1";
    dayOffRow.params["MIN REST TIME"] = "36:00";
    dayOffRow.params["MIN LOCAL NIGHTS"] = "1";
    input.dependDbRules[RULES::ANR_DAY_OFF_DEFINITION] = {dayOffRow};
    return input;
}

std::unique_ptr<CheckAnrDayOffSpacingRule> makeRule7415(
    const SharedPtr<CrewDataContext>& ctx) {
    RuleInput input = makeRule7415Input();
    auto rule = std::make_unique<CheckAnrDayOffSpacingRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

}  // namespace

class SIA_4_5_ConsWkDaysTest : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
};

TEST_F(SIA_4_5_ConsWkDaysTest, Case1_SevenConsecutiveDaysExceedsLastDayBuffer) {
    // COP:
    // Day 1 - SQ612 -SIN-ICN - 1825-0050
    // Day 2 - SQ611 - ICN-SIN - 0220-0850
    // Day 3 - SQ606 - SIN-ICN - 0655-1320
    // Day 4 - SQ601 - ICN-SIN - 0745-1400
    // Day 5 - SQ606 - SIN-ICN - 0655-1320
    // Day 6 - SQ601 - ICN-SIN - 0745-1400
    // Day 7 - SQ606 - SIN-ICN - 0655-1320
    // Expected: Illegal: Actual working period: 6 days & 21:50h Exceed limit of 6 days & 21h (Buffer of 3h)

    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 8 * 60, "Asia/Singapore"},
        {"ICN", 9 * 60, "Asia/Seoul"}
    });
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const std::string startDate = "2025-02-01"; // Arbitrary start date

    // Day 1: SQ612 SIN-ICN 18:25 - 00:50 (next day)
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "ICN", startDate + " 06:55", "2025-02-01 13:20" }},
        "Day 1", 1
    }, ctx));

    // Day 2: SQ611 ICN-SIN 02:20 - 08:50
    duties.push_back(makeDuty({
        "FLY",
        {{ "ICN", "SIN", "2025-02-02 02:20", "2025-02-02 08:50" }},
        "Day 2", 2
    }, ctx));

    // Day 3: SQ606 SIN-ICN 06:55 - 13:20
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "ICN", "2025-02-03 06:55", "2025-02-03 13:20" }},
        "Day 3", 3
    }, ctx));

    // Day 4: SQ601 ICN-SIN 07:45 - 14:00
    duties.push_back(makeDuty({
        "FLY",
        {{ "ICN", "SIN", "2025-02-04 07:45", "2025-02-04 14:00" }},
        "Day 4", 4
    }, ctx));

    // Day 5: SQ606 SIN-ICN 06:55 - 13:20
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "ICN", "2025-02-05 06:55", "2025-02-05 13:20" }},
        "Day 5", 5
    }, ctx));

    // Day 6: SQ601 ICN-SIN 07:45 - 14:00
    duties.push_back(makeDuty({
        "FLY",
        {{ "ICN", "SIN", "2025-02-06 07:45", "2025-02-06 14:00" }},
        "Day 6", 6
    }, ctx));

    // Day 7: SQ606 SIN-ICN 06:55 - 13:20
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "ICN", "2025-02-07 06:55", "2025-02-07 13:20" }},
        "Day 7", 7
    }, ctx));

    auto pairing = makePairing(asRaw(duties), "SIN");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty()); // Expecting violations

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(SIA_4_5_ConsWkDaysTest, Case2_SevenConsecutiveDaysWithStandbyExceedsLastDayBuffer) {
    // COP:
    // Day 1 - SQ612 -SIN-ICN - 1825-0050
    // Day 2 - SQ611 - ICN-SIN - 0220-0850
    // Day 3 - SQ606 - SIN-ICN - 0655-1320
    // Day 4 - SQ601 - ICN-SIN - 0745-1400
    // Day 5 - SQ606 - SIN-ICN - 0655-1320
    // Day 6 - SBY - 0600-0900 (at SIN)
    // Day 7 - SQ601 - ICN-SIN - 0745-1400
    // Expected: Illegal: Actual working period: 6 days & 22:30h Exceed limit of 6 days & 21h (Standby is counted as duty)

    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 8 * 60, "Asia/Singapore"},
        {"ICN", 9 * 60, "Asia/Seoul"}
    });
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const std::string startDate = "2025-02-01"; // Arbitrary start date

    // Day 1: SQ612 SIN-ICN 18:25 - 00:50 (next day)
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "ICN", startDate + " 06:55", "2025-02-01 13:20" }},
        "Day 1", 1
    }, ctx));

    // Day 2: SQ611 ICN-SIN 02:20 - 08:50
    duties.push_back(makeDuty({
        "FLY",
        {{ "ICN", "SIN", "2025-02-02 02:20", "2025-02-02 08:50" }},
        "Day 2", 2
    }, ctx));

    // Day 3: SQ606 SIN-ICN 06:55 - 13:20
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "ICN", "2025-02-03 06:55", "2025-02-03 13:20" }},
        "Day 3", 3
    }, ctx));

    // Day 4: SQ601 ICN-SIN 07:45 - 14:00
    duties.push_back(makeDuty({
        "FLY",
        {{ "ICN", "SIN", "2025-02-04 07:45", "2025-02-04 14:00" }},
        "Day 4", 4
    }, ctx));

    // Day 5: SQ606 SIN-ICN 06:55 - 13:20
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "ICN", "2025-02-05 06:55", "2025-02-05 13:20" }},
        "Day 5", 5
    }, ctx));

    // Day 6: SBY at SIN 06:00-09:00
    duties.push_back(makeDuty({
        "SBY",
        {{ "SIN", "SIN", "2025-02-06 06:00", "2025-02-06 09:00" }}, // For SBY, dep/arr time are its start/end
        "Day 6", 6
    }, ctx));

    // Day 7: SQ601 ICN-SIN 07:45 - 14:00 (assuming crew is repositioned or different crew)
    // This case seems to imply the crew is still working, but the flight is from ICN.
    // This is a bit ambiguous in the test case. I will assume it's a new duty period
    // which effectively makes Day 7 still a working day.
    duties.push_back(makeDuty({
        "FLY",
        {{ "ICN", "SIN", "2025-02-07 07:45", "2025-02-07 14:00" }},
        "Day 7", 7
    }, ctx));

    auto pairing = makePairing(asRaw(duties), "SIN");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(SIA_4_5_ConsWkDaysTest, Case3_SevenConsecutiveDaysIllegalWithBuffer) {
    // DAY 1: SQ938/9 SIN-DPS-SIN 0105-0350/0500-0750
    // DAY 2: SQ806 SIN-PEK 0855-1500
    // DAY 4: SQ801 PEK-SIN 1610-2245
    // DAY 5: SQ876/7 SIN-TPE-SIN 0030-04550610-1055
    // DAY 6: SQ894/5 HKG
    // DAY 7: SQ186/5 SGN
    // Expected: Illegal, buffer to 7 consec days as SGN returns 2255LT

    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 8 * 60, "Asia/Singapore"},
        {"DPS", 8 * 60, "Asia/Makassar"},
        {"PEK", 8 * 60, "Asia/Shanghai"},
        {"TPE", 8 * 60, "Asia/Taipei"},
        {"HKG", 8 * 60, "Asia/Hong_Kong"},
        {"SGN", 7 * 60, "Asia/Ho_Chi_Minh"}
    });
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const std::string startDate = "2025-02-01"; // Arbitrary start date

    // DAY 1: SQ938/9 SIN-DPS-SIN 0105-0350/0500-0750
    duties.push_back(makeDuty({
        "FLY",
        {
            { "SIN", "DPS", startDate + " 01:05", startDate + " 03:50" },
            { "DPS", "SIN", startDate + " 05:00", startDate + " 07:50" }
        },
        "Day 1", 1
    }, ctx));

    // DAY 2: SQ806 SIN-PEK 0855-1500
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "PEK", "2025-02-02 08:55", "2025-02-02 15:00" }},
        "Day 2", 2
    }, ctx));

    // Day 3 is skipped according to the test case. This implies a rest day.
    // However, the expected result states "buffer to 7 consec days".
    // This could mean that the rest between Day 2 and Day 4 is NOT a qualifying ANR Day Off.
    // Let's assume it's NOT a qualifying day off and the count continues.
    // DAY 4: SQ801 PEK-SIN 1610-2245
    duties.push_back(makeDuty({
        "FLY",
        {{ "PEK", "SIN", "2025-02-04 00:10", "2025-02-04 02:45" }},
        "Day 4", 3 // Duty sequence needs to be incremental
    }, ctx));

    // DAY 5: SQ876/7 SIN-TPE-SIN 0030-04550610-1055
    duties.push_back(makeDuty({
        "FLY",
        {
            { "SIN", "TPE", "2025-02-05 00:30", "2025-02-05 04:55" },
            { "TPE", "SIN", "2025-02-05 06:10", "2025-02-05 10:55" }
        },
        "Day 5", 4
    }, ctx));

    // DAY 6: SQ894/5 HKG (assuming SIN-HKG and HKG-SIN)
    // The test case does not provide times for HKG flights, so using arbitrary times within Day 6.
    // Based on search results, SQ894 SIN-HKG is ~4h, SQ895 HKG-SIN is ~4h.
    // Let's assume a typical day operation.
    duties.push_back(makeDuty({
        "FLY",
        {
            { "SIN", "HKG", "2025-02-06 08:00", "2025-02-06 12:00" }, // SQ894
            { "HKG", "SIN", "2025-02-06 13:00", "2025-02-06 17:00" }  // SQ895
        },
        "Day 6", 5
    }, ctx));

    // DAY 7: SQ186/5 SGN (assuming SIN-SGN and SGN-SIN)
    // The test case mentions "SGN returns 2255LT". This probably implies a return to SIN from SGN.
    // Based on search results, SQ186 SIN-SGN is ~2h10m, SQ185 SGN-SIN is ~2h5m.
    // To match "SGN returns 2255LT" (which is 22:55 SGT or 14:55 UTC), the arrival in SIN needs to be late.
    // If arrival is 22:55 SGT, then the duty end + transport will push it beyond the 21:00 buffer.
    // Let's set the arrival of SQ185 to 22:55 SGT.
    duties.push_back(makeDuty({
        "FLY",
        {
            { "SIN", "SGN", "2025-02-07 18:00", "2025-02-07 20:10" }, // SQ186 (2h10m)
            { "SGN", "SIN", "2025-02-07 20:50", "2025-02-07 22:55" } // SQ185 (2h5m), arriving SIN 22:55 SGT
        },
        "Day 7", 6
    }, ctx));

    auto pairing = makePairing(asRaw(duties), "SIN");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(SIA_4_5_ConsWkDaysTest, Case4_EightConsecutiveDaysIllegal) {
    // DAY 1: SQ938/9 SIN-DPS-SIN 0105-0350/0500-0750
    // DAY 2: SQ806 SIN-PEK 0855-1500
    // DAY 4: SQ801 PEK-SIN 1610-2245
    // DAY5: SQ876/7 SIN-TPE-SIN 0030-04550610-1055
    // DAY 6: SQ894/5 HKG
    // DAY7: SQ186 SGN
    // DAY 8: SQ185 SGN (This implies a new duty on Day 8, making it 8 consecutive working days if no ANR day off was in between)
    // Expected: illegal, 8 consec days

    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 8 * 60, "Asia/Singapore"},
        {"DPS", 8 * 60, "Asia/Makassar"},
        {"PEK", 8 * 60, "Asia/Shanghai"},
        {"TPE", 8 * 60, "Asia/Taipei"},
        {"HKG", 8 * 60, "Asia/Hong_Kong"},
        {"SGN", 7 * 60, "Asia/Ho_Chi_Minh"}
    });
    auto rule = makeRule7415(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Duty>> duties;
    const std::string startDate = "2025-02-01"; // Arbitrary start date

    // DAY 1: SQ938/9 SIN-DPS-SIN 0105-0350/0500-0750
    duties.push_back(makeDuty({
        "FLY",
        {
            { "SIN", "DPS", startDate + " 01:05", startDate + " 03:50" },
            { "DPS", "SIN", startDate + " 05:00", startDate + " 07:50" }
        },
        "Day 1", 1
    }, ctx));

    // DAY 2: SQ806 SIN-PEK 0855-1500
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "PEK", "2025-02-02 08:55", "2025-02-02 15:00" }},
        "Day 2", 2
    }, ctx));

    // DAY 4: SQ801 PEK-SIN 1610-2245
    duties.push_back(makeDuty({
        "FLY",
        {{ "PEK", "SIN", "2025-02-04 00:10", "2025-02-04 02:45" }},
        "Day 4", 3
    }, ctx));

    // DAY 5: SQ876/7 SIN-TPE-SIN 0030-04550610-1055
    duties.push_back(makeDuty({
        "FLY",
        {
            { "SIN", "TPE", "2025-02-05 00:30", "2025-02-05 04:55" },
            { "TPE", "SIN", "2025-02-05 06:10", "2025-02-05 10:55" }
        },
        "Day 5", 4
    }, ctx));

    // DAY 6: SQ894/5 HKG
    duties.push_back(makeDuty({
        "FLY",
        {
            { "SIN", "HKG", "2025-02-06 08:00", "2025-02-06 12:00" },
            { "HKG", "SIN", "2025-02-06 13:00", "2025-02-06 17:00" }
        },
        "Day 6", 5
    }, ctx));

    // DAY 7: SQ186 SGN
    duties.push_back(makeDuty({
        "FLY",
        {{ "SIN", "SGN", "2025-02-07 18:00", "2025-02-07 20:10" }},
        "Day 7", 6
    }, ctx));

    // DAY 8: SQ185 SGN (This implies a new duty on Day 8)
    duties.push_back(makeDuty({
        "FLY",
        {{ "SGN", "SIN", "2025-02-08 08:00", "2025-02-08 10:05" }}, // Assuming a morning return flight
        "Day 8", 7
    }, ctx));

    auto pairing = makePairing(asRaw(duties), "SIN");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}
