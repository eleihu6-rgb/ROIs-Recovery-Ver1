#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7452/UlrFdpClassificationMismatchForSQRule.h"

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
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD(fleet);
    seg->setAssignment("FLY");
    seg->setIsOperating(true);
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    return seg;
}

DBRule makeRuleRow(int rowNum,
                   const std::string& dutyPattern,
                   const std::string& fleetGroup,
                   const std::string& isUlr,
                   const std::string& minFdp,
                   const std::string& maxFdp) {
    DBRule rule{};
    rule.idRule = 7452001;
    rule.function = RULES::SQ_CA_ULR_FDP_CLASSIFICATION_MISMATCH;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 208174520 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SQ";
    rule.category = "Duty";
    rule.params["DUTY PATTERN"] = dutyPattern;
    rule.params["FLEET GROUP"] = fleetGroup;
    rule.params["IS ULR"] = isUlr;
    rule.params["MIN FDP"] = minFdp;
    rule.params["MAX FDP"] = maxFdp;
    return rule;
}

RuleInput buildRuleInputFromExample() {
    RuleInput input;
    input.dbRules.push_back(makeRuleRow(1, "SIN-*", "*", "N", "*", "18:00"));
    input.dbRules.push_back(makeRuleRow(2, "*-SIN", "*", "N", "*", "18:00"));
    input.dbRules.push_back(makeRuleRow(3, "SIN-*", "*", "Y", "18:01", "*"));
    input.dbRules.push_back(makeRuleRow(4, "*-SIN", "*", "Y", "18:01", "*"));
    return input;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

class Rule7452Test : public ::testing::Test {
protected:
    void SetUp() override {
        _ctx = std::make_shared<CrewDataContext>();

        FLEET fleet359{};
        fleet359.fleet = "A359";
        fleet359.fleetGrp = "359";
        _ctx->fleetMap["A359"] = fleet359;
    }

    void TearDown() override {
        deleteViolations(_violations);
    }

    Duty makeDutyWithSingleOperatingSector(const std::string& dep,
                                           const std::string& arr,
                                           int fdpMinutes,
                                           bool isUlr) {
        _segments.clear();
        _rawSegments.clear();

        _segments.push_back(makeSegment(dep, arr, "A359", "2025-01-10 00:00:00", "2025-01-10 10:00:00"));
        _rawSegments.push_back(_segments.back().get());

        Duty duty(_rawSegments);
        duty.setDepartureStation(dep);
        duty.setArrivalStation(arr);
        duty.setFDPInSecs(fdpMinutes * 60);
        duty.setULR(isUlr);
        duty.setPairingId(10001);
        duty.setDutySeq(1);
        duty.setStartTimeUtcAct(_rawSegments.front()->getStartTimeUtcAct());
        duty.setEndTimeUtcAct(_rawSegments.back()->getEndTimeUtcAct());
        return duty;
    }

    Duty makeDutyWithTwoOperatingSectors(const std::string& dep1,
                                         const std::string& arr1,
                                         const std::string& dep2,
                                         const std::string& arr2,
                                         int fdpMinutes,
                                         bool isUlr) {
        _segments.clear();
        _rawSegments.clear();

        _segments.push_back(makeSegment(dep1, arr1, "A359", "2025-01-10 00:00:00", "2025-01-10 06:00:00"));
        _segments.push_back(makeSegment(dep2, arr2, "A359", "2025-01-10 07:00:00", "2025-01-10 15:00:00"));
        _rawSegments.push_back(_segments[0].get());
        _rawSegments.push_back(_segments[1].get());

        Duty duty(_rawSegments);
        duty.setDepartureStation(dep1);
        duty.setArrivalStation(arr2);
        duty.setFDPInSecs(fdpMinutes * 60);
        duty.setULR(isUlr);
        duty.setPairingId(10001);
        duty.setDutySeq(1);
        duty.setStartTimeUtcAct(_rawSegments.front()->getStartTimeUtcAct());
        duty.setEndTimeUtcAct(_rawSegments.back()->getEndTimeUtcAct());
        return duty;
    }

    void configureRule(UlrFdpClassificationMismatchForSQRule& rule) {
        rule.setDataContext(_ctx);
        rule.setApplication(BATCH_LEGALITY);
        rule.setRuleViolation(&_violations);
        rule.setViolations(&_violationMessages);
    }

    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<std::unique_ptr<Segment>> _segments;
    std::vector<Segment*> _rawSegments;
    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
};

TEST_F(Rule7452Test, NonUlrSinToOtherAtBoundaryPasses) {
    UlrFdpClassificationMismatchForSQRule rule(nullptr, buildRuleInputFromExample());
    configureRule(rule);

    Duty duty = makeDutyWithSingleOperatingSector("SIN", "NRT", 18 * 60, false);
    EXPECT_TRUE(rule.CheckRule(&duty));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7452Test, NonUlrSinToOtherAboveBoundaryFails) {
    UlrFdpClassificationMismatchForSQRule rule(nullptr, buildRuleInputFromExample());
    configureRule(rule);

    Duty duty = makeDutyWithSingleOperatingSector("SIN", "NRT", 18 * 60 + 1, false);
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violations.size(), 1u);
    EXPECT_NE(_violations.front()->violation_msg.find("Duty ULR/FDP mismatch"), std::string::npos);
    EXPECT_NE(_violations.front()->violation_msg.find("SIN-NRT sector"), std::string::npos);
    EXPECT_NE(_violations.front()->violation_msg.find("classified as non-ULR"), std::string::npos);
    EXPECT_NE(_violations.front()->violation_msg.find("actual FDP 18:01"), std::string::npos);
    EXPECT_NE(_violations.front()->violation_msg.find("allowed FDP for non-ULR is up to 18:00."),
              std::string::npos);
}

TEST_F(Rule7452Test, UlrSinToOtherAtConfiguredMinimumPasses) {
    UlrFdpClassificationMismatchForSQRule rule(nullptr, buildRuleInputFromExample());
    configureRule(rule);

    Duty duty = makeDutyWithSingleOperatingSector("SIN", "NRT", 18 * 60 + 1, true);
    EXPECT_TRUE(rule.CheckRule(&duty));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7452Test, UlrSinToOtherBelowConfiguredMinimumFails) {
    UlrFdpClassificationMismatchForSQRule rule(nullptr, buildRuleInputFromExample());
    configureRule(rule);

    Duty duty = makeDutyWithSingleOperatingSector("SIN", "NRT", 18 * 60, true);
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violations.size(), 1u);
    EXPECT_NE(_violations.front()->violation_msg.find("Duty ULR/FDP mismatch"), std::string::npos);
    EXPECT_NE(_violations.front()->violation_msg.find("classified as ULR"), std::string::npos);
    EXPECT_NE(_violations.front()->violation_msg.find("allowed FDP for ULR must be at least 18:01."),
              std::string::npos);
}

TEST_F(Rule7452Test, FleetGroupPipeListSupported) {
    RuleInput input;
    input.dbRules.push_back(makeRuleRow(1, "SIN-*", "359|359F", "N", "*", "18:00"));

    UlrFdpClassificationMismatchForSQRule rule(nullptr, input);
    configureRule(rule);

    Duty duty = makeDutyWithSingleOperatingSector("SIN", "NRT", 18 * 60 + 1, false);
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violations.size(), 1u);
}

TEST_F(Rule7452Test, BetweenRangePhraseWhenBothMinAndMaxConfigured) {
    RuleInput input;
    input.dbRules.push_back(makeRuleRow(1, "SIN-*", "*", "N", "18:00", "19:00"));

    UlrFdpClassificationMismatchForSQRule rule(nullptr, input);
    configureRule(rule);

    Duty duty = makeDutyWithSingleOperatingSector("SIN", "NRT", 19 * 60 + 1, false);
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(_violations.size(), 1u);
    EXPECT_NE(_violations.front()->violation_msg.find("allowed FDP for non-ULR must be between 18:00 and 19:00."),
              std::string::npos);
}

TEST_F(Rule7452Test, MultiSectorDutyIsIgnored) {
    UlrFdpClassificationMismatchForSQRule rule(nullptr, buildRuleInputFromExample());
    configureRule(rule);

    Duty duty = makeDutyWithTwoOperatingSectors("SIN", "NRT", "NRT", "JFK", 20 * 60, false);
    EXPECT_TRUE(rule.CheckRule(&duty));
    EXPECT_TRUE(_violations.empty());
}
