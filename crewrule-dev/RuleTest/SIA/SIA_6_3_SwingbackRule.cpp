// SIA_SUITE_SUMMARY_START
// SuiteId: 6.3
// Name: Swingback Rule
// SourceCsvRow: 6.3.,Swingback Rule
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: ICN-CVG-NGO swingback pattern -> soft alert (violation).
//   - Case #2: ICN-CVG-LAX (no swingback) -> no alert.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2026-01-07T18:48:48Z
// RemainingWork:
//   - Confirm production parameters (TZ diff/tolerance/max count) match the ACOP spec; adjust the test input if needed.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7463/LimitSwingbackForSQRule.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

std::unique_ptr<Segment> makeFlightSegment(const std::string& dep,
                                           const std::string& arr,
                                           const std::string& flightNumber,
                                           time_t startUtc,
                                           time_t endUtc) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFlightNumber(flightNumber);
    seg->setAssignment("FLY");
    seg->setIsOperating(true);
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    seg->setStartTimeLocSch(startUtc);
    seg->setEndTimeLocSch(endUtc);
    return seg;
}

struct PairingBuildResult {
    std::unique_ptr<Pairing> pairing;
    std::vector<std::unique_ptr<Duty>> duties;
    std::vector<std::unique_ptr<Segment>> segments;
};

PairingBuildResult buildSwingbackPairing(bool thirdLegReturnsToNgo) {
    PairingBuildResult out;

    // Use winter dates to avoid DST edge cases for US stations.
    out.segments.push_back(makeFlightSegment("SIN", "ICN", "606",
                                             utcFromString("2025-01-01 00:00:00"),
                                             utcFromString("2025-01-01 06:00:00")));
    out.segments.back()->setDutyId(1);

    out.segments.push_back(makeFlightSegment("ICN", "CVG", "7444",
                                             utcFromString("2025-01-02 00:00:00"),
                                             utcFromString("2025-01-02 10:00:00")));
    out.segments.back()->setDutyId(2);

    if (thirdLegReturnsToNgo) {
        out.segments.push_back(makeFlightSegment("CVG", "NGO", "7445",
                                                 utcFromString("2025-01-04 00:00:00"),
                                                 utcFromString("2025-01-04 12:00:00")));
    } else {
        out.segments.push_back(makeFlightSegment("CVG", "LAX", "7433",
                                                 utcFromString("2025-01-05 00:00:00"),
                                                 utcFromString("2025-01-05 06:00:00")));
    }
    out.segments.back()->setDutyId(3);

    if (thirdLegReturnsToNgo) {
        out.segments.push_back(makeFlightSegment("NGO", "SIN", "671",
                                                 utcFromString("2025-01-06 00:00:00"),
                                                 utcFromString("2025-01-06 06:00:00")));
    } else {
        out.segments.push_back(makeFlightSegment("LAX", "SIN", "37",
                                                 utcFromString("2025-01-06 12:00:00"),
                                                 utcFromString("2025-01-07 04:00:00")));
    }
    out.segments.back()->setDutyId(4);

    auto makeDutyFromSegment = [&](int segIndex, int dutySeq) {
        Segment* seg = out.segments.at(static_cast<size_t>(segIndex)).get();
        std::vector<Segment*> segs{seg};
        auto duty = std::make_unique<Duty>(segs);
        duty->setPairingId(1);
        duty->setDutySeq(dutySeq);
        duty->setDepartureStation(seg->getDepStationRead());
        duty->setArrivalStation(seg->getArrStationRead());
        duty->setStartTimeUtcAct(seg->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(seg->getEndTimeUtcAct());
        duty->setStartTimeLocAct(duty->getStartTimeUtcAct());
        duty->setEndTimeLocAct(duty->getEndTimeUtcAct());
        return duty;
    };

    out.duties.push_back(makeDutyFromSegment(0, 1));
    out.duties.push_back(makeDutyFromSegment(1, 2));
    out.duties.push_back(makeDutyFromSegment(2, 3));
    out.duties.push_back(makeDutyFromSegment(3, 4));

    std::vector<Duty*> dutyPtrs;
    dutyPtrs.reserve(out.duties.size());
    for (auto& d : out.duties) {
        dutyPtrs.push_back(d.get());
    }

    out.pairing = std::make_unique<Pairing>(dutyPtrs);
    out.pairing->setBase("SIN");
    out.pairing->setId(1);
    out.pairing->setStartTimeUtcAct(out.duties.front()->getStartTimeUtcAct());
    out.pairing->setEndTimeUtcAct(out.duties.back()->getEndTimeUtcAct());

    return out;
}

RuleInput makeSwingbackRuleInput() {
    RuleInput input;
    // serviceType,fleetGroup,swingbackTZDiff,sameTZTolerance,maxSwingbackCount,severity
    // Spreadsheet expects a "soft alert" for a single swingback => allow 0 swingbacks.
    input.ruleParamString.push_back("*,*,03:00-99:00,01:00,0,2");
    return input;
}

SharedPtr<CrewDataContext> buildContext() {
    return SIATest::buildCrewDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"ICN", 540, "Asia/Seoul"},
        {"CVG", -300, "America/New_York"},
        {"NGO", 540, "Asia/Tokyo"},
        {"LAX", -480, "America/Los_Angeles"},
    });
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

class Sia63SwingbackRuleTest : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(BATCH_LEGALITY);
    }

    void TearDown() override {
        deleteViolations(_violations);
        _violationMessages.clear();
    }

    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
    SIATest::SiaRuleParamGuard _paramGuard;
};

TEST_F(Sia63SwingbackRuleTest, Case1_IcnCvgNgo_IsSwingback_SoftAlert) {
    auto ctx = buildContext();
    auto build = buildSwingbackPairing(true);

    LimitSwingbackForSQRule rule(nullptr, makeSwingbackRuleInput());
    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_FALSE(rule.CheckRule(build.pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

TEST_F(Sia63SwingbackRuleTest, Case2_IcnCvgLax_IsNotSwingback_NoAlert) {
    auto ctx = buildContext();
    auto build = buildSwingbackPairing(false);

    LimitSwingbackForSQRule rule(nullptr, makeSwingbackRuleInput());
    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_TRUE(rule.CheckRule(build.pairing.get()));
    EXPECT_TRUE(_violations.empty());
}
