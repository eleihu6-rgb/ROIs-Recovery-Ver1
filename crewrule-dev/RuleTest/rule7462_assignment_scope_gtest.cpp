#include <gtest/gtest.h>

#include "RuleEngine.h"
#include "RuleEngineDef.h"
#include "rule/rule7462/CheckAllowedMultiSectorDutyForFreighterForSQRule.h"
#include "db/Duty.h"
#include "db/Segment.h"

#include <string>
#include <vector>

namespace {

Segment* createSegment(int fltNo,
                       const std::string& depStn,
                       const std::string& arrStn,
                       const std::string& serviceType,
                       bool isOperating,
                       const std::string& assignment) {
    Segment* seg = new Segment();
    seg->setFlightNumber(std::to_string(fltNo));
    seg->setDepSta(depStn);
    seg->setArrSta(arrStn);
    seg->setServiceType(serviceType);
    seg->setIsOperating(isOperating);
    seg->setAssignment(assignment);
    return seg;
}

Duty* createDuty(const std::vector<Segment*>& segments) {
    return new Duty(segments);
}

DBRule createRuleRow(const std::string& segmentNumberInDuty,
                     const std::string& allowedSectors,
                     const std::string& dutyAssignment = "ANY",
                     const std::string& serviceType = "*") {
    DBRule row{};
    row.idRule = 7462001;
    row.function = RULES::CHECK_ALLOWED_MULTI_SECTOR_DUTY_FOR_FREIGHTER_FOR_SQ;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7462001;
    row.params["SERVICE TYPE"] = serviceType;
    row.params["SEGMENT NUMBER IN DUTY"] = segmentNumberInDuty;
    row.params["ALLOWED SECTORS"] = allowedSectors;
    row.params["DUTY OPERATING TYPE"] = dutyAssignment;
    return row;
}

}  // namespace

class Rule7462AssignmentScopeTest : public ::testing::Test {
protected:
    void TearDown() override {
        for (auto* rv : _violations) {
            delete rv;
        }
        _violations.clear();
    }

    CheckAllowedMultiSectorDutyForFreighterForSQRule* createRule(const std::string& paramString) {
        RuleInput input;
        input.ruleParamString.push_back(paramString);
        auto* rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
        rule->setRuleViolation(&_violations);
        rule->setViolations(&_violationMsgs);
        return rule;
    }

    CheckAllowedMultiSectorDutyForFreighterForSQRule* createRule(const DBRule& dbRule) {
        RuleInput input;
        input.dbRules.push_back(dbRule);
        auto* rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
        rule->setRuleViolation(&_violations);
        rule->setViolations(&_violationMsgs);
        return rule;
    }

    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMsgs;
};

TEST_F(Rule7462AssignmentScopeTest, FlyScopeRejectsMixedDutyWhenNoWhitelistRowMatches) {
    auto* rule = createRule("F,2-99,SIN-CAN-SIN,FLY");

    std::vector<Segment*> segments = {
        createSegment(1201, "SIN", "CAN", "F", true, "FLY"),
        createSegment(1202, "CAN", "SIN", "F", false, "DHD")
    };
    Duty* duty = createDuty(segments);

    EXPECT_FALSE(rule->CheckRule(duty));
    ASSERT_EQ(1u, _violations.size());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, AnyScopeAllowsMixedDutyWhenWhitelistRowMatches) {
    auto* rule = createRule("F,2-99,SIN-CAN-HKG,ANY");

    std::vector<Segment*> segments = {
        createSegment(1301, "SIN", "CAN", "F", true, "FLY"),
        createSegment(1302, "CAN", "HKG", "F", false, "DHD")
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));
    EXPECT_TRUE(_violations.empty());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, AnyScopeAllowsPurePositionDutyWhenWhitelistRowMatches) {
    auto* rule = createRule("*,2-99,SIN-CAN-HKG,ANY");

    std::vector<Segment*> posSegments = {
        createSegment(1402, "SIN", "CAN", "", false, "DHD"),
        createSegment(1403, "CAN", "HKG", "", false, "DHD")
    };
    Duty* posDuty = createDuty(posSegments);

    EXPECT_TRUE(rule->CheckRule(posDuty));
    EXPECT_TRUE(_violations.empty());

    delete posDuty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, SingleSegmentDutyIsLegalWhenNoSegmentCountRowApplies) {
    auto* rule = createRule("F,2-99,SIN-CAN,ANY");

    std::vector<Segment*> segments = {
        createSegment(1451, "SIN", "CAN", "F", true, "FLY")
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));
    EXPECT_TRUE(_violations.empty());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, PurePositionDutyIsLegalWhenNoServiceTypeRowApplies) {
    auto* rule = createRule("F,2-99,SIN-CAN-HKG,ANY");

    std::vector<Segment*> posSegments = {
        createSegment(1461, "SIN", "CAN", "", false, "DHD"),
        createSegment(1462, "CAN", "HKG", "", false, "DHD")
    };
    Duty* posDuty = createDuty(posSegments);

    EXPECT_TRUE(rule->CheckRule(posDuty));
    EXPECT_TRUE(_violations.empty());

    delete posDuty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, MixedDutyPassesWhenAnyWhitelistRowExistsAlongsideFlyRow) {
    RuleInput input;
    input.ruleParamString.push_back("F,2-99,SIN-BKK-SIN,FLY");
    input.ruleParamString.push_back("F,2-99,SIN-BKK-SIN,ANY");

    auto* rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    rule->setRuleViolation(&_violations);
    rule->setViolations(&_violationMsgs);

    std::vector<Segment*> segments = {
        createSegment(1501, "SIN", "BKK", "F", true, "FLY"),
        createSegment(1502, "BKK", "SIN", "F", false, "DHD")
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));
    EXPECT_TRUE(_violations.empty());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, WildcardRoutePatternAllowsMixedDutyStartingAndEndingAtConfiguredBase) {
    auto* rule = createRule("*,3-99,SIN-*-SIN,ANY");

    std::vector<Segment*> segments = {
        createSegment(1601, "SIN", "BKK", "J", true, "FLY"),
        createSegment(1602, "BKK", "HKG", "", false, "DHD"),
        createSegment(1603, "HKG", "SIN", "J", true, "FLY")
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));
    EXPECT_TRUE(_violations.empty());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, WildcardRoutePatternRejectsMixedDutyEndingAwayFromConfiguredBase) {
    auto* rule = createRule("*,3-99,SIN-*-SIN,ANY");

    std::vector<Segment*> segments = {
        createSegment(1701, "SIN", "BKK", "J", true, "FLY"),
        createSegment(1702, "BKK", "HKG", "", false, "DHD"),
        createSegment(1703, "HKG", "KUL", "J", true, "FLY")
    };
    Duty* duty = createDuty(segments);

    EXPECT_FALSE(rule->CheckRule(duty));
    ASSERT_EQ(1u, _violations.size());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, GlobalAllowedSectorsWildcardStillAllowsAnyRoute) {
    auto* rule = createRule("*,3-99,*,ANY");

    std::vector<Segment*> segments = {
        createSegment(1801, "SIN", "BKK", "J", true, "FLY"),
        createSegment(1802, "BKK", "HKG", "", false, "DHD"),
        createSegment(1803, "HKG", "KUL", "J", true, "FLY")
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));
    EXPECT_TRUE(_violations.empty());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, ExactAllowedSectorDoesNotUsePartialWildcardMatching) {
    auto* rule = createRule("*,3-99,SIN-BKK-SIN,ANY");

    std::vector<Segment*> segments = {
        createSegment(1901, "SIN", "BKK", "J", true, "FLY"),
        createSegment(1902, "BKK", "HKG", "", false, "DHD"),
        createSegment(1903, "HKG", "SIN", "J", true, "FLY")
    };
    Duty* duty = createDuty(segments);

    EXPECT_FALSE(rule->CheckRule(duty));
    ASSERT_EQ(1u, _violations.size());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, OpenEndedSegmentRangeAppliesToThreeOrMoreSegments) {
    auto* rule = createRule("*,3-*,SIN-*-SIN,ANY");

    std::vector<Segment*> segments = {
        createSegment(2001, "SIN", "BKK", "J", true, "FLY"),
        createSegment(2002, "BKK", "HKG", "", false, "DHD"),
        createSegment(2003, "HKG", "SIN", "J", true, "FLY")
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));
    EXPECT_TRUE(_violations.empty());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, OpenEndedSegmentRangeDoesNotApplyBelowLowerBound) {
    auto* rule = createRule("*,3-*,SIN-BKK-SIN,ANY");

    std::vector<Segment*> segments = {
        createSegment(2101, "SIN", "BKK", "J", true, "FLY"),
        createSegment(2102, "BKK", "SIN", "", false, "DHD")
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));
    EXPECT_TRUE(_violations.empty());

    delete duty;
    delete rule;
}

TEST_F(Rule7462AssignmentScopeTest, DbRuleOpenEndedSegmentRangeRejectsThreeSegmentRouteOutsideAllowedPattern) {
    auto* rule = createRule(createRuleRow("3-*", "SIN-*-SIN"));

    std::vector<Segment*> segments = {
        createSegment(2201, "SIN", "BKK", "J", true, "FLY"),
        createSegment(2202, "BKK", "HKG", "", false, "DHD"),
        createSegment(2203, "HKG", "KUL", "J", true, "FLY")
    };
    Duty* duty = createDuty(segments);

    EXPECT_FALSE(rule->CheckRule(duty));
    ASSERT_EQ(1u, _violations.size());

    delete duty;
    delete rule;
}
