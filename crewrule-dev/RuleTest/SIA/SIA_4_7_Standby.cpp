// SIA_SUITE_SUMMARY_START
// SuiteId: 4.7
// Name: Standby Restrictions
// SourceCsvRow: 4.7.,Standby Restrictions
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Standby duty of 19h duration (SBY assignment) should exceed the 18h limit -> rule 6025 should flag a violation.
//   - Case #2: Standby duty of 18h duration (SBY assignment) should meet the limit -> rule 6025 should pass.
// Results:
//   - fail 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z; example failure: unknown file
// RemainingWork:
//   - Fix pairing/duty construction so CheckMaxDutyPeriodRule executes; verify expected pass/fail outcomes afterward.
//   - Replace simplified AAA-timezone duties with full station timelines once COP builders are available.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule6025/CheckMaxDutyPeriodRule.h"
#include "SIA_6_DutyConstructionHelpers.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 4.7 Standby Restrictions (TC).
// Best-fit rule: CheckMaxDutyPeriodRule (rule 6025) limiting SBY duty duration.

namespace {

RuleInput makeRuleInput() {
    RuleInput input;
    DBRule row{};
    row.idRule = 6025001;
    row.function = 6025;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 208260251;
    row.overridebility = "S";
    row.reference = "SIA-4.7";
    std::strcpy(row.description, "SIA standby max duration (SBY only)");
    row.params["IS HOME BASE"] = "*";
    row.params["ASSIGNMENTS"] = "SBY";
    row.params["MAX DP"] = "18:00";
    row.params["MAX DURATION"] = "18:00";
    row.params["SEVERITY"] = "2";
    input.dbRules.push_back(row);
    return input;
}

std::unique_ptr<CheckMaxDutyPeriodRule> makeRule6025(
    const SharedPtr<CrewDataContext>& ctx) {
    RuleInput input = makeRuleInput();
    auto rule = std::make_unique<CheckMaxDutyPeriodRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(PAIRING_OPTIMIZER);
    return rule;
}

}  // namespace

class SIA_4_7_StandbyRestrictions : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
};

TEST_F(SIA_4_7_StandbyRestrictions, Case1_StandbyDurationExceedsLimit) {
    auto ctx = SIATest::buildCrewDataContext({{"AAA", 0, "UTC"}});
    auto rule = makeRule6025(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    rule->setDataContext(ctx);
    // Single SBY duty lasting 19 hours.
    std::vector<SIA6Duty::DutySegmentConfig> segments;
    segments.push_back(SIA6Duty::makeSegmentConfig("SBY", "AAA", "AAA", 0, 19 * 60));
    auto dutyData = SIA6Duty::makeDuty(segments);
    dutyData.duty->setAssignment("SBY");
    createPairingNodeOfDuty(dutyData.duty.get(), ctx.get());


    std::vector<Duty*> duties{dutyData.duty.get()};
    EXPECT_FALSE(rule->CheckRule(duties.front()));
 
    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(SIA_4_7_StandbyRestrictions, Case2_StandbyDurationWithinLimit) {
    auto ctx = SIATest::buildCrewDataContext({{"AAA", 0, "UTC"}});
    auto rule = makeRule6025(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    rule->setDataContext(ctx);

    // Single SBY duty lasting exactly 18 hours.
    std::vector<SIA6Duty::DutySegmentConfig> segments;
    segments.push_back(SIA6Duty::makeSegmentConfig("SBY", "AAA", "AAA", 0, 18 * 60));
    auto dutyData = SIA6Duty::makeDuty(segments);
    dutyData.duty->setAssignment("SBY");
    createPairingNodeOfDuty(dutyData.duty.get(), ctx.get());

    std::vector<Duty*> duties{dutyData.duty.get()};
    EXPECT_TRUE(rule->CheckRule(duties.front()));

    for (auto* rv : violations) {
        delete rv;
    }
}