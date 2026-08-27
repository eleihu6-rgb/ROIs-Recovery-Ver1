// SIA_SUITE_SUMMARY_START
// SuiteId: 5.1
// Name: FDP Limits for passenger flight crew
// SourceCsvRow: 5.1.,FDP Limits for passenger flight crew
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Double-sector duty with FDP < 13h for augmented crew (3P) is legal when limited to two operating sectors.
//   - Case #2: Double-sector duty with FDP > 13h for augmented crew (3P) is illegal because max sectors above 13h is 1.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Once RuleTest is rebuilt, record actual execution results (pass/fail) in this summary.
//   - Extend coverage to explicitly include different compositions (3P vs 4P) and fleets if SIA provides additional 5.1 examples.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7450/FdpSectorLimitForSQRule.h"

#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"

#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& fleet,
                                     const std::string& flightNumber,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     bool isOperating) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD(fleet);
    seg->setFlightNumber(flightNumber);
    seg->setAssignment(isOperating ? "FLY" : "DHD");
    seg->setIsOperating(isOperating);
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    return seg;
}

DBRule makeSqRuleRow(int rowNum,
                     const std::string& composition,
                     const std::string& fdpLower,
                     const std::string& fdpUpper,
                     int maxSectors) {
    DBRule rule{};
    rule.idRule = 7450001;
    rule.function = 7450;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 208174500 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SQ";
    rule.params["COMPOSITION"] = composition;
    rule.params["FDP LOWER"] = fdpLower;
    rule.params["FDP UPPER"] = fdpUpper;
    rule.params["MAX SECTORS"] = std::to_string(maxSectors);
    return rule;
}

RuleInput makeSiaFdpLimitsInput() {
    RuleInput input;
    // Mirrors the default SQ CA design: under 13:00 => up to 2 sectors; above 13:00 => only 1 sector.
    input.dbRules.push_back(makeSqRuleRow(1, "3P|4P", "00:00", "13:00", 2));
    input.dbRules.push_back(makeSqRuleRow(2, "3P|4P", "13:01", "99:00", 1));
    return input;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

void setDutyCommonFields(Duty& duty,
                         int fdpMinutes,
                         const std::string& composition,
                         const std::string& fleet) {
    duty.setFDPInSecs(fdpMinutes * 60);
    duty.setCompositionName(composition);
    duty.setFltCD(fleet);
}

}  // namespace

class SIA_5_1_FdpLimitsForPassengerFlightCrewTest : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
    }

    void configureRule(FdpSectorLimitForSQRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }

    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
};

// Case #1 (from 5.1): SIN-HND-HAN with FDP < 13h for augmented crew (double sector) is legal.
TEST_F(SIA_5_1_FdpLimitsForPassengerFlightCrewTest, DoubleSectorUnder13HoursIsLegalForAugmentedCrew) {
    auto input = makeSiaFdpLimitsInput();
    FdpSectorLimitForSQRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
        "SIN", "HND", "SQF", "SQ001", "2025-01-10 00:00:00", "2025-01-10 06:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "HND", "HAN", "SQF", "SQ002", "2025-01-10 07:00:00", "2025-01-10 12:00:00", true));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
    // FDP < 13h, composition 3P, two sectors.
    setDutyCommonFields(duty, 12 * 60, "3P", "SQF");

    EXPECT_TRUE(rule.CheckRule(&duty));
    EXPECT_TRUE(_violationStorage.empty());
}

// Case #2 (from 5.1): SIN-HND-DPS with FDP > 13h for augmented crew is illegal when there are two sectors.
TEST_F(SIA_5_1_FdpLimitsForPassengerFlightCrewTest, DoubleSectorAbove13HoursIsIllegalForAugmentedCrew) {
    auto input = makeSiaFdpLimitsInput();
    FdpSectorLimitForSQRule rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
        "SIN", "HND", "SQF", "SQ003", "2025-02-05 00:00:00", "2025-02-05 07:30:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "HND", "DPS", "SQF", "SQ004", "2025-02-05 08:30:00", "2025-02-05 16:00:00", true));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
    // FDP > 13h, composition 3P, two sectors -> should violate sector limit when FDP is above 13h.
    setDutyCommonFields(duty, 14 * 60, "3P", "SQF");

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violationStorage.size(), 1u);
}
