// SIA_SUITE_SUMMARY_START
// SuiteId: 5.3
// Name: Minimum Rest Period for Narrow Body PAX FD
// SourceCsvRow: 5.3.,Minimum Rest Period for Narrow Body PAX FD
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Two-duty sequence (narrow-body style) with ~13h rest between duties -> rule 7412 (FD CSV params) passes 12h requirement.
//   - Case #2: Same pattern with ~10h10 rest -> rule 7412 flags a violation (<12h).
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Swap AAA-timezone simplifications for station-based times if needed; thresholds currently follow Prioritization of Rules.xlsx row 25 narrow-body notes.
//   - Add CC variants if SIA supplies CC-specific rest tables.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "RuleEngine/rule/rule7412/CheckMinimumRestPeriodForSQRule.h"
#include "db/RuleParams.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "SIA_CommonTestConfig.h"

// SIA 5.3 Minimum Rest Period for Narrow Body PAX FD (Tech Crew).
// Best-fit rule: CheckMinimumRestPeriodForSQRule (rule 7412) with FD CSV parameters.

namespace {

SharedPtr<CrewDataContext> buildContext() {
    auto ctx = SIATest::buildCrewDataContext({{"AAA", 0, "UTC"}});
    ctx->assignmentNameGroupMap["FLY"].insert("FLY");
    ctx->assignmentNameGroupMap["MVO"].insert("MVO");
    ctx->assignmentNameGroupMap["MVP"].insert("MVP");
    return ctx;
}

std::unique_ptr<Duty> makeDuty(const std::string& startLocal,
                               const std::string& endLocal,
                               const SharedPtr<CrewDataContext>& ctx,
                               std::vector<std::unique_ptr<Segment>>& segmentStorage,
                               const std::string& assignment = "FLY") {
    const time_t startUtc = SIATest::utcFromLocal(startLocal, "AAA", ctx);
    const time_t endUtc = SIATest::utcFromLocal(endLocal, "AAA", ctx);

    auto segment = std::make_unique<Segment>();
    segment->setDepStation("AAA");
    segment->setArrStation("AAA");
    segment->setAssignment(assignment);
    segment->setIsOperating(assignment == "FLY");
    segment->setStartTimeUtcAct(startUtc);
    segment->setEndTimeUtcAct(endUtc);
    segment->setStartTimeUtcSch(startUtc);
    segment->setEndTimeUtcSch(endUtc);
    segment->setStartTimeLocAct(startUtc);
    segment->setEndTimeLocAct(endUtc);
    segment->setStartTimeLocSch(startUtc);
    segment->setEndTimeLocSch(endUtc);

    std::vector<Segment*> rawSegments{segment.get()};
    segmentStorage.push_back(std::move(segment));

    auto duty = std::make_unique<Duty>(rawSegments);
    duty->setDepartureStation("AAA");
    duty->setArrivalStation("AAA");
    duty->setAssignment(assignment);
    duty->setStartTimeUtcAct(startUtc);
    duty->setEndTimeUtcAct(endUtc);
    duty->setStartTimeUtcSch(startUtc);
    duty->setEndTimeUtcSch(endUtc);
    duty->setStartTimeLocAct(startUtc);
    duty->setEndTimeLocAct(endUtc);
    duty->setStartTimeLocSch(startUtc);
    duty->setEndTimeLocSch(endUtc);
    duty->setRefTimeZone(0);
	duty->setDPInSecs(static_cast<long>(endUtc - startUtc));
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

std::unique_ptr<CheckMinimumRestPeriodForSQRule> makeRule7412(const SharedPtr<CrewDataContext>& ctx) {
    RuleInput input;
    input.dbRules = SIATest::loadRuleParametersFromCsv(SIATest::Division::TechCrew, 7412);
    EXPECT_FALSE(input.dbRules.empty()) << "Failed to load rule 7412 parameters from rule_parameters_FD.csv";

    for (auto& dbRule : input.dbRules) {
        auto it = dbRule.params.find("GLOBAL BUFFER MINUTES");
        if (it != dbRule.params.end()) {
            it->second = "0";
        }
    }

    auto rule = std::make_unique<CheckMinimumRestPeriodForSQRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

}  // namespace

class SIA_5_3_MinRestNarrowBodyPaxFd : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
};

TEST_F(SIA_5_3_MinRestNarrowBodyPaxFd,
       Case1_LegalRestAboveTwelveHours) {
    auto ctx = buildContext();
    auto rule = makeRule7412(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty("2025-06-01 07:00:00", "2025-06-01 13:30:00", ctx, segmentStorage, "FLY"));  // 6h30 duty
    duties.push_back(makeDuty("2025-06-02 03:00:00", "2025-06-02 08:30:00", ctx, segmentStorage, "FLY"));  // rest ~13h30

    auto pairing = std::make_unique<Pairing>(asRaw(duties));
    pairing->setBase("AAA");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(SIA_5_3_MinRestNarrowBodyPaxFd,
       Case2_IllegalRestBelowTwelveHours) {
    auto ctx = buildContext();
    auto rule = makeRule7412(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty("2025-07-01 07:00:00", "2025-07-01 13:30:00", ctx, segmentStorage, "FLY"));  // 6h30 duty
    duties.push_back(makeDuty("2025-07-01 23:40:00", "2025-07-02 05:30:00", ctx, segmentStorage, "FLY"));  // rest ~10h10

    auto pairing = std::make_unique<Pairing>(asRaw(duties));
    pairing->setBase("AAA");
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    EXPECT_FALSE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}
