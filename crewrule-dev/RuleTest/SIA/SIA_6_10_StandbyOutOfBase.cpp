// SIA_SUITE_SUMMARY_START
// SuiteId: 6.10
// Name: Standby Restrictions out of base
// SourceCsvRow: 6.10.,Standby Restrictions out of base
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: [TC Pax] COP SIN-LHR-SIN with a single 7h standby at LHR -> illegal (max 6h out-of-base).
//   - Case #2: [TC Pax] COP SIN-LHR-SIN with two standby periods of 3h + 3h at LHR -> legal.
// Results:
//   - TODO
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule6025/CheckMaxDutyPeriodRule.h"
#include "SIA_6_DutyConstructionHelpers.h"
#include "SIA_CommonTestConfig.h"
#include "db/Pairing.h"
#include "db/RuleParams.h"

// SIA 6.10 – Standby Restrictions out of base
// Best-fit rule: CheckMaxDutyPeriodRule (rule 6025) with max standby duration 6h when away from base.

namespace {

RuleInput makeRule6025Input() {
    RuleInput input;
    DBRule row{};
    row.idRule = 6025001;
    row.function = 6025;
    row.params["IS HOME BASE"] = "N";
    row.params["ASSIGNMENTS"] = "SBY";
    row.params["MAX DP"] = "06:00";
    row.params["MAX DURATION"] = "06:00";
    input.dbRules.push_back(row);
    return input;
}

std::unique_ptr<CheckMaxDutyPeriodRule> makeRule6025(const SharedPtr<CrewDataContext>& ctx) {
    auto rule = std::make_unique<CheckMaxDutyPeriodRule>(nullptr, makeRule6025Input());
    rule->setDataContext(ctx);
    rule->setApplication(PAIRING_EDITOR);
    return rule;
}

void setStandbyDutyTimes(Duty* duty) {
    if (!duty) {
        return;
    }
    duty->setMinPickup(0);
    duty->setActualPickupMin(0);
    duty->setMinBrief(0);
    duty->setActualBriefMin(0);
    duty->setMinDebrief(0);
    duty->setActualDebriefMin(0);
    duty->setMinDropoff(0);
    duty->setActualDropoffMin(0);
}

}  // namespace

class SIA_6_10_StandbyOutOfBaseTest : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);

        ctx = SIATest::buildCrewDataContext({
            {"SIN", 480, "Asia/Singapore"},
            {"LHR", 0, "Europe/London"}
        });

        buildPairings();
        registerPairingsInContext();
    }

    void registerPairingsInContext() {
        ctx->pairingIdMap.clear();
        wirePairingIds(pairingIllegal, 610001);
        wirePairingIds(pairingLegal, 610002);
    }

    void wirePairingIds(Pairing& pairing, long long pairingId) {
        pairing.setDbId(pairingId);
        ctx->pairingIdMap[pairingId] = &pairing;
        for (std::size_t dutyIndex = 0; dutyIndex < pairing.getNumDuties(); ++dutyIndex) {
            Duty* duty = pairing.getDuty(dutyIndex);
            if (!duty) {
                continue;
            }
            duty->setPairingId(pairingId);
            duty->setDutySeq(static_cast<int>(dutyIndex + 1));
            const auto segments = duty->getSegments();
            for (std::size_t segIndex = 0; segIndex < segments.size(); ++segIndex) {
                Segment* seg = segments[segIndex];
                if (!seg) {
                    continue;
                }
                seg->setPairingId(pairingId);
                seg->setDutySeq(static_cast<int>(dutyIndex + 1));
                seg->setSegSeq(static_cast<int>(segIndex + 1));
            }
            createPairingNodeOfDuty(duty, ctx.get(), &pairing);
        }
    }

    void buildPairings() {
        const int FLT1_DUR = 13 * 60;
        const int FLT2_DUR = 13 * 60;
        const int REST_BEFORE_SBY = 4 * 60;
        const int REST_BETWEEN_SBY = 60;
        const int REST_BEFORE_RETURN = 8 * 60;

        // --- Case #1: 7h standby out of base (illegal) ---
        {
            int flt1_start = 0;
            int flt1_end = flt1_start + FLT1_DUR;
            int sby_start = flt1_end + REST_BEFORE_SBY;
            int sby_end = sby_start + 7 * 60;
            int flt2_start = sby_end + REST_BEFORE_RETURN;
            int flt2_end = flt2_start + FLT2_DUR;

            auto d1 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "LHR", flt1_start, flt1_end, "SQ308")});
            auto d2 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("SBY", "LHR", "LHR", sby_start, sby_end)});
            auto d3 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "LHR", "SIN", flt2_start, flt2_end, "SQ317")});

            d2.duty->setAssignment("SBY");
            setStandbyDutyTimes(d2.duty.get());

            pairingIllegal.appendDuty(d1.duty.get());
            pairingIllegal.appendDuty(d2.duty.get());
            pairingIllegal.appendDuty(d3.duty.get());
            pairingIllegal.setBase("SIN");
            pairingIllegal.setPairingNum("SIA-6.10-Case1");

            _all_duties.push_back(std::move(d1));
            _all_duties.push_back(std::move(d2));
            _all_duties.push_back(std::move(d3));
        }

        // --- Case #2: 3h + 3h standby out of base (legal) ---
        {
            int flt1_start = 0;
            int flt1_end = flt1_start + FLT1_DUR;
            int sby1_start = flt1_end + REST_BEFORE_SBY;
            int sby1_end = sby1_start + 3 * 60;
            int sby2_start = sby1_end + REST_BETWEEN_SBY;
            int sby2_end = sby2_start + 3 * 60;
            int flt2_start = sby2_end + REST_BEFORE_RETURN;
            int flt2_end = flt2_start + FLT2_DUR;

            auto d1 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "LHR", flt1_start, flt1_end, "SQ308")});
            auto d2 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("SBY", "LHR", "LHR", sby1_start, sby1_end)});
            auto d3 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("SBY", "LHR", "LHR", sby2_start, sby2_end)});
            auto d4 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "LHR", "SIN", flt2_start, flt2_end, "SQ317")});

            d2.duty->setAssignment("SBY");
            d3.duty->setAssignment("SBY");
            setStandbyDutyTimes(d2.duty.get());
            setStandbyDutyTimes(d3.duty.get());

            pairingLegal.appendDuty(d1.duty.get());
            pairingLegal.appendDuty(d2.duty.get());
            pairingLegal.appendDuty(d3.duty.get());
            pairingLegal.appendDuty(d4.duty.get());
            pairingLegal.setBase("SIN");
            pairingLegal.setPairingNum("SIA-6.10-Case2");

            _all_duties.push_back(std::move(d1));
            _all_duties.push_back(std::move(d2));
            _all_duties.push_back(std::move(d3));
            _all_duties.push_back(std::move(d4));
        }
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
    SharedPtr<CrewDataContext> ctx;

    std::vector<SIA6Duty::DutyBuildResult> _all_duties;
    Pairing pairingIllegal;
    Pairing pairingLegal;
};

TEST_F(SIA_6_10_StandbyOutOfBaseTest, SinLhrSin_SevenHourStandby_IsIllegal) {
    auto rule6025 = makeRule6025(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule6025->setRuleViolation(&violations);

    EXPECT_FALSE(rule6025->CheckRule(pairingIllegal.getDuty(1)))
        << "Standby duration should be illegal (>6h) out of base.";

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(SIA_6_10_StandbyOutOfBaseTest, SinLhrSin_TwoStandbysSixHoursTotal_IsLegal) {
    auto rule6025 = makeRule6025(ctx);
    std::vector<RULE_VIOLATION*> violations;
    rule6025->setRuleViolation(&violations);

    EXPECT_TRUE(rule6025->CheckRule(pairingLegal.getDuty(1)))
        << "First standby duration should be legal (3h) out of base.";
    EXPECT_TRUE(rule6025->CheckRule(pairingLegal.getDuty(2)))
        << "Second standby duration should be legal (3h) out of base.";
    EXPECT_TRUE(violations.empty());

    for (auto* rv : violations) {
        delete rv;
    }
}
