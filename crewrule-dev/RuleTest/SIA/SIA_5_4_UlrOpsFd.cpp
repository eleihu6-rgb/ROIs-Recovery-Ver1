// SIA_SUITE_SUMMARY_START
// SuiteId: 5.4
// Name: ULR Operations (CA rules for Pax FD)
// SourceCsvRow: 5.4.,ULR Operations (CA rules for Pax FD)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case A: Legal 6-day COP with standby after 24h+1LN rest.
//   - Case B: Illegal standby scheduled less than 24h+1LN from arrival.
//   - Case C: Illegal COP shorter than 6 days but with standby.
//   - Case D: Legal COP shorter than 6 days without standby.
// Results:
//   - TODO
//   - Notes: last run 1970-01-01T08:00:00Z;
// RemainingWork:
//   - Analyze test failures.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>
#include <memory>
#include <vector>
#include <cstring>

#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule6025/CheckMaxDutyPeriodRule.h"
#include "RuleEngine/rule/rule7421/AcopSlipPatternRule.h"
#include "RuleEngine/rule/rule7435/MinPairingDaysForUlrStandbyRule.h"
#include "SIA_6_DutyConstructionHelpers.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "db/Pairing.h"
#include "orUtil/UtilFunc.h"

// Test case based on user request:
// 5.4. ULR Operations (CA rules for Pax FD)

namespace {

// --- Rule 6025 (Standby duration) ---
RuleInput makeRule6025Input() {
    RuleInput input;
    DBRule row{};
    row.idRule = 6025001;
    row.function = 6025;
    row.params["ASSIGNMENTS"] = "SBY";
    row.params["MAX DP"] = "06:00";
    input.dbRules.push_back(row);
    return input;
}
std::unique_ptr<CheckMaxDutyPeriodRule> makeRule6025(const SharedPtr<CrewDataContext>& ctx) {
    auto rule = std::make_unique<CheckMaxDutyPeriodRule>(nullptr, makeRule6025Input());
    rule->setDataContext(ctx);
    return rule;
}

// --- Rule 7421 (Rest before standby) ---
RuleInput makeRule7421Input() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7421001;
    row.function = 7421;
    // Apply regardless of pairing completeness (some cases end at SEA after standby).
    row.params["COP / Applicability"] = "*";
    row.params["Slip station"] = "SEA";
    row.params["Duty Assignment before slip"] = "ULR_DUTY";
    // ULR (Annex E): total slip rest 48h+2LN; standby allowed only after 24h+1LN; max standby 6h.
    row.params["Min slip hours"] = "48";
    row.params["Min slip local nights"] = "2";
    row.params["Duty After Hours"] = "24";
    row.params["Duty After Local Nights"] = "1";
    row.params["Max standby hours"] = "6";
    DBRule controlRow{};
    controlRow.idRule = 7421001;
    controlRow.function = 7421;
    controlRow.tableNum = 2;
    controlRow.params["Sby Reduces Rest and LN"] = "Y";
    controlRow.params["Rest Starts After"] = "TRANSPORT";
    input.dbRules.push_back(row);
    input.dbRules.push_back(controlRow);
    return input;
}
std::unique_ptr<AcopSlipPatternRule> makeRule7421(const SharedPtr<CrewDataContext>& ctx) {
    auto rule = std::make_unique<AcopSlipPatternRule>(nullptr, makeRule7421Input());
    rule->setDataContext(ctx);
    return rule;
}

// --- Rule 7435 (COP duration with standby) ---
RuleInput makeRule7435Input() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7435001;
    row.function = 7435;
    row.params["SERVICE TYPE"] = "*";
    row.params["FLEET GROUP"] = "*";
    // Applies only when standby exists in the pairing.
    row.params["HAS DUTY ASSIGNMENT"] = "SBY";
    row.params["HAS ULR DUTY"] = "Y";
    row.params["MIN PAIRING DAYS"] = "6";
    input.dbRules.push_back(row);
    return input;
}
std::unique_ptr<MinPairingDaysForUlrStandbyRule> makeRule7435(const SharedPtr<CrewDataContext>& ctx) {
    auto rule = std::make_unique<MinPairingDaysForUlrStandbyRule>(nullptr, makeRule7435Input());
    rule->setDataContext(ctx);
    return rule;
}

} // namespace

class SIA_5_4_UlrOpsFdTest : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        
        ctx = SIATest::buildCrewDataContext({
            {"SIN", 480, "Asia/Singapore"},
            {"SEA", -480, "America/Los_Angeles"}
        });

        buildPairings();
        registerPairingsInContext();
    }

    void registerPairingsInContext() {
        // Rule 6025 (PAIRING_EDITOR) resolves pairing base via ctx->pairingIdMap[duty.pairingId].
        // The SIA6Duty helper defaults all duties to pairingId=1, so wire unique IDs per case.
        ctx->pairingIdMap.clear();
        wirePairingIds(pairingA, 1001);
        wirePairingIds(pairingB, 1002);
        wirePairingIds(pairingC, 1003);
        wirePairingIds(pairingD, 1004);
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
        // Use relative minutes from an arbitrary epoch for robust time calculation.
        // Let Epoch be the start of the first flight duty.
        const int FLT1_DUR = 15 * 60; // SIN-SEA ~15h
        const int FLT2_DUR = 17 * 60; // SEA-SIN ~17h
        const int SBY_DUR = 6 * 60;   // Standby is 6h
        const int POST_FLT_TIME = 90; // Debrief + Transport
        const int PRE_FLT_TIME = 120; // Transport + Report
        const int DAY_MINS = 24 * 60;

        // --- Case A: Legal ---
        // Rest before SBY > 24h, COP > 6 days
        {
            int flt1_start=0, flt1_end=flt1_start+FLT1_DUR;
            // Note: rule 7421 rest excludes dropoff/transport when "Rest Starts After"=TRANSPORT.
            // Ensure effective rest >= 24h after dropoff.
            int rest1_mins = 26 * 60;
            int sby_start=flt1_end + rest1_mins;
            int sby_end=sby_start+SBY_DUR;
            // Extend COP to exceed 6 base-calendar days.
            int rest2_mins = 96 * 60;
            int flt2_start=sby_end + rest2_mins;
            int flt2_end=flt2_start+FLT2_DUR;

            auto d1 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "SEA", flt1_start, flt1_end, "SQ28")});
            d1.duty->setULR(true); d1.duty->setAssignment("ULR_DUTY"); d1.duty->setActualDropoffMin(POST_FLT_TIME);
            auto d2 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("SBY", "SEA", "SEA", sby_start, sby_end)});
            d2.duty->setAssignment("SBY");
            auto d3 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SEA", "SIN", flt2_start, flt2_end, "SQ27")});
            d3.duty->setULR(true); d3.duty->setAssignment("ULR_DUTY"); d3.duty->setActualPickupMin(PRE_FLT_TIME);
            
            pairingA.appendDuty(d1.duty.get());
            pairingA.appendDuty(d2.duty.get());
            pairingA.appendDuty(d3.duty.get());
            pairingA.setBase("SIN");
            pairingA.setPairingNum("SIA-5.4-CaseA");
            _all_duties.push_back(std::move(d1));
            _all_duties.push_back(std::move(d2));
            _all_duties.push_back(std::move(d3));
        }

        // --- Case B: Illegal Rest ---
        {
            int flt1_start=0, flt1_end=flt1_start+FLT1_DUR;
            // Standby starts before 24h (after transport).
            int rest1_mins = 24 * 60;
            int sby_start=flt1_end + rest1_mins;
            int sby_end=sby_start+SBY_DUR;
            // Keep total slip rest >= 48h to isolate the "standby too early" violation.
            int rest2_mins = 30 * 60;
            int flt2_start=sby_end + rest2_mins;
            int flt2_end=flt2_start+FLT2_DUR;

            auto d1 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "SEA", flt1_start, flt1_end, "SQ28")});
            d1.duty->setULR(true); d1.duty->setAssignment("ULR_DUTY"); d1.duty->setActualDropoffMin(POST_FLT_TIME);
            auto d2 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("SBY", "SEA", "SEA", sby_start, sby_end)});
            d2.duty->setAssignment("SBY");
            auto d3 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SEA", "SIN", flt2_start, flt2_end, "SQ27")});
            d3.duty->setULR(true); d3.duty->setAssignment("ULR_DUTY"); d3.duty->setActualPickupMin(PRE_FLT_TIME);
            
            pairingB.appendDuty(d1.duty.get());
            pairingB.appendDuty(d2.duty.get());
            pairingB.appendDuty(d3.duty.get());
            pairingB.setBase("SIN");
            pairingB.setPairingNum("SIA-5.4-CaseB");
            _all_duties.push_back(std::move(d1));
            _all_duties.push_back(std::move(d2));
            _all_duties.push_back(std::move(d3));
        }

        // --- Case C: Illegal COP Duration ---
        {
            int flt1_start=0, flt1_end=flt1_start+FLT1_DUR;
            int rest1_mins = 25 * 60;
            int sby_start=flt1_end + rest1_mins;
            int sby_end=sby_start+SBY_DUR;
            // Keep rest legal while COP remains < 6 base-calendar days.
            int rest2_mins = 26 * 60;
            int flt2_start=sby_end + rest2_mins;
            int flt2_end=flt2_start+FLT2_DUR;

            auto d1 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "SEA", flt1_start, flt1_end, "SQ28")});
            d1.duty->setULR(true); d1.duty->setAssignment("ULR_DUTY"); d1.duty->setActualDropoffMin(POST_FLT_TIME);
            auto d2 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("SBY", "SEA", "SEA", sby_start, sby_end)});
            d2.duty->setAssignment("SBY");
            auto d3 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SEA", "SIN", flt2_start, flt2_end, "SQ27")});
            d3.duty->setULR(true); d3.duty->setAssignment("ULR_DUTY"); d3.duty->setActualPickupMin(PRE_FLT_TIME);

            pairingC.appendDuty(d1.duty.get());
            pairingC.appendDuty(d2.duty.get());
            pairingC.appendDuty(d3.duty.get());
            pairingC.setBase("SIN");
            pairingC.setPairingNum("SIA-5.4-CaseC");
            _all_duties.push_back(std::move(d1));
            _all_duties.push_back(std::move(d2));
            _all_duties.push_back(std::move(d3));
        }

        // --- Case D: Legal (No Standby) ---
        {
            int flt1_start=0, flt1_end=flt1_start+FLT1_DUR;
            int rest_mins = 48 * 60; // Makes COP < 6 days
            int flt2_start=flt1_end + rest_mins;
            int flt2_end=flt2_start+FLT2_DUR;

            auto d1 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "SEA", flt1_start, flt1_end, "SQ28")});
            d1.duty->setULR(true); d1.duty->setAssignment("ULR_DUTY"); d1.duty->setActualDropoffMin(POST_FLT_TIME);
            auto d2 = SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SEA", "SIN", flt2_start, flt2_end, "SQ27")});
            d2.duty->setULR(true); d2.duty->setAssignment("ULR_DUTY"); d2.duty->setActualPickupMin(PRE_FLT_TIME);
            
            pairingD.appendDuty(d1.duty.get());
            pairingD.appendDuty(d2.duty.get());
            pairingD.setBase("SIN");
            pairingD.setPairingNum("SIA-5.4-CaseD");
            _all_duties.push_back(std::move(d1));
            _all_duties.push_back(std::move(d2));
        }
    }

    void TearDown() override {
        for (auto* v : _violations) {
            delete v;
        }
        _violations.clear();
        _violationMessages.clear();
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
    SharedPtr<CrewDataContext> ctx;

    // Store duties and pairings in fixture to manage lifetime
    std::vector<SIA6Duty::DutyBuildResult> _all_duties;
    Pairing pairingA, pairingB, pairingC, pairingD;
};

TEST_F(SIA_5_4_UlrOpsFdTest, CaseA_Legal) {
    auto rule6025 = makeRule6025(ctx);
    EXPECT_TRUE(rule6025->CheckRule(pairingA.getDuty(1))) << "Standby duration should be legal (6h).";
    
    auto rule7421 = makeRule7421(ctx);
    rule7421->setViolations(&_violationMessages);
    EXPECT_TRUE(rule7421->CheckRule(&pairingA)) << "Rest before standby should be legal (>24h).";

    auto rule7435 = makeRule7435(ctx);
    rule7435->setViolations(&_violationMessages);
    EXPECT_TRUE(rule7435->CheckRule(&pairingA)) << "COP duration should be legal (>6 days).";
}

TEST_F(SIA_5_4_UlrOpsFdTest, CaseB_IllegalRest) {
    auto rule7421 = makeRule7421(ctx);
    rule7421->setRuleViolation(&_violations);
    rule7421->setViolations(&_violationMessages);
    EXPECT_FALSE(rule7421->CheckRule(&pairingB)) << "Rest before standby should be illegal (<24h).";
    EXPECT_EQ(_violations.size(), 1);
}

TEST_F(SIA_5_4_UlrOpsFdTest, CaseC_IllegalCopDuration) {
    auto rule7435 = makeRule7435(ctx);
    rule7435->setRuleViolation(&_violations);
    rule7435->setViolations(&_violationMessages);
    EXPECT_FALSE(rule7435->CheckRule(&pairingC)) << "COP duration should be illegal (<6 days with standby).";
    EXPECT_EQ(_violations.size(), 1);
}

TEST_F(SIA_5_4_UlrOpsFdTest, CaseD_LegalNoStandby) {
    auto rule7435 = makeRule7435(ctx);
    rule7435->setRuleViolation(&_violations);
    rule7435->setViolations(&_violationMessages);
    EXPECT_TRUE(rule7435->CheckRule(&pairingD)) << "COP duration should be legal (<6 days without standby).";
    EXPECT_EQ(_violations.size(), 0);
}
