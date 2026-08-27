// SIA_SUITE_SUMMARY_START
// SuiteId: 5.5
// Name: DP Limits with deadhead (Pax FD)
// SourceCsvRow: 5.5.,DP Limits with deadhead (Pax FD)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Operating + deadhead duty with DP=19h40m (PU leg is deadhead) exceeds 14h cap -> rule 7434 flags a violation.
//   - Case #2: Operating + deadhead duty with DP=9h45m stays under 14h cap -> rule 7434 passes.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Replace simplified AAA-timezone segments with real station/offset data if SIA later requires it.
//   - Add composition/fleet filtering if SQ supplies more detailed tables.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7434/MaxDutyPeriodRuleForSQ.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 5.5 DP Limits with deadhead (Pax FD).
// Best-fit rule: MaxDutyPeriodRuleForSQ (rule 7434) limiting duties that contain deadhead after FDP.

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

DBRule make7434RuleRow(int rowNum,
                       const std::string& fleet,
                       const std::string& composition,
                       const std::string& fleetChange,
                       const std::string& assignmentsAfterFDP,
                       const std::string& maxDp) {
    DBRule rule{};
    rule.function = 7434;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRule = 7434000 + rowNum;
    rule.idRuleParam = 7434000 + rowNum;
    rule.overridebility = "S";
    rule.params["FLEET"] = fleet;
    rule.params["COMPOSITION"] = composition;
    rule.params["FLEET CHANGE"] = fleetChange;
    rule.params["HAS ASSIGNMENT AFTER FDP"] = assignmentsAfterFDP;
    rule.params["MAX DP"] = maxDp;
    return rule;
}

std::unique_ptr<Segment> makeSegment(const std::string& startTime,
                                     const std::string& endTime,
                                     const std::string& assignment,
                                     const std::string& fleet,
                                     bool isOperating) {
    auto seg = std::make_unique<Segment>();
    const time_t startUtc = utcFromString(startTime);
    const time_t endUtc = utcFromString(endTime);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeLocSch(startUtc);
    seg->setEndTimeLocSch(endUtc);
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    seg->setAssignment(assignment);
    seg->setFleetCD(fleet.c_str());
    seg->setIsOperating(isOperating);
    return seg;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

void setDutyCommonFields(Duty& duty, int dpMinutes, const std::string& composition, const std::string& fleet) {
    duty.setDPInSecs(dpMinutes * 60);
    duty.setCompositionName(composition);
    duty.setFltCD(fleet);
    duty.setDepartureStation("AAA");
    duty.setArrivalStation("AAA");
}

RuleInput makeRuleInput() {
    RuleInput input;
    input.dbRules.push_back(make7434RuleRow(1, "*", "*", "*", "DHD", "14:00"));
    return input;
}

} // namespace

class SIA_5_5_DpLimitsWithDeadheadPaxFd : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
    }

    void configureRule(MaxDutyPeriodRuleForSQ& rule) {
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }

    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
};

TEST_F(SIA_5_5_DpLimitsWithDeadheadPaxFd, Case1_ExceedsFourteenHoursWithDeadhead) {
    RuleInput input = makeRuleInput();
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-08-01 06:00:00", "2025-08-01 13:30:00", "FLY", "777", true));   // 7h30
    segStorage.push_back(makeSegment("2025-08-01 15:00:00", "2025-08-01 23:10:00", "DHD", "777", false));   // 8h10 deadhead
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 19 * 60 + 40, "CP", "777");

    EXPECT_FALSE(rule.CheckRule(&duty));
    EXPECT_FALSE(_violationStorage.empty());
}

TEST_F(SIA_5_5_DpLimitsWithDeadheadPaxFd, Case2_WithinFourteenHoursWithDeadhead) {
    RuleInput input = makeRuleInput();
    MaxDutyPeriodRuleForSQ rule(nullptr, input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segments;
    segStorage.push_back(makeSegment("2025-09-01 07:00:00", "2025-09-01 12:00:00", "FLY", "777", true));   // 5h
    segStorage.push_back(makeSegment("2025-09-01 14:00:00", "2025-09-01 19:45:00", "DHD", "777", false));  // 5h45 deadhead
    segments.push_back(segStorage[0].get());
    segments.push_back(segStorage[1].get());

    Duty duty(segments);
    setDutyCommonFields(duty, 9 * 60 + 45, "CP", "777");

    EXPECT_TRUE(rule.CheckRule(&duty));
    EXPECT_TRUE(_violationStorage.empty());
}
