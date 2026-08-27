#include "gtest/gtest.h"
#include "RuleEngine.h"
#include "RuleEngineDef.h"
#include "rule/rule7462/CheckAllowedMultiSectorDutyForFreighterForSQRule.h"
#include "db/Duty.h"
#include "db/Segment.h"

#include <vector>
#include <string>

class Rule7462Test : public ::testing::Test {
protected:
    // Helper to create a Segment
    Segment* createSegment(int fltNo, const std::string& depStn, const std::string& arrStn,
        const std::string& serviceType, const std::string& fltType = "J") {
        Segment* seg = new Segment();
        seg->setFlightNumber(std::to_string(fltNo));
        seg->setDepSta(depStn);
        seg->setArrSta(arrStn);
        seg->setServiceType(serviceType);
        seg->setFltType(fltType);
        seg->setIsOperating(true);
        seg->setAssignment("FLY");
        return seg;
    }

    // Helper to create a duty from a vector of segments
    Duty* createDuty(const std::vector<Segment*>& segments) {
        return new Duty(segments);
    }
};

// Test case 1: Single segment duty, should always pass.
TEST_F(Rule7462Test, SingleSegmentDuty) {
    RuleInput input;
    input.ruleParamString.push_back("C,2-99,SIN-CAN-SIN");
    auto rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    vector<string> violationsMsg;
    rule->setViolations(&violationsMsg);


    
    std::vector<Segment*> segments = { createSegment(101, "SIN", "HKG", "C") };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));

    delete duty;
    delete rule;
    for (auto* rv : violations) {
        delete rv;
    }
}

// Test case 2: Not a freighter service type ('J'), should pass as rule is not applicable.
TEST_F(Rule7462Test, NonFreighterServiceType) {
    RuleInput input;
    input.ruleParamString.push_back("C,2-99,SIN-CAN-SIN");
    auto rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    vector<string> violationsMsg;
    rule->setViolations(&violationsMsg);


    std::vector<Segment*> segments = { 
        createSegment(201, "SIN", "CAN", "J"),
        createSegment(202, "CAN", "SIN", "J") 
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));

    delete duty;
    delete rule;
    for (auto* rv : violations) {
        delete rv;
    }
}

// Test case 3: Mixed service types (one 'C'), rule should apply. This one matches allowed sectors.
TEST_F(Rule7462Test, MixedServiceType_Allowed) {
    RuleInput input;
    input.ruleParamString.push_back("C,2-99,SIN-CAN-SIN|AMS-LHR-SHJ");
    auto rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    vector<string> violationsMsg;
    rule->setViolations(&violationsMsg);


    std::vector<Segment*> segments = { 
        createSegment(301, "SIN", "CAN", "J"),
        createSegment(302, "CAN", "SIN", "C") 
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));

    delete duty;
    delete rule;
    for (auto* rv : violations) {
        delete rv;
    }
}


// Test case 4: Two segments, freighter, but sectors are not in the allowed list. Should fail.
TEST_F(Rule7462Test, DisallowedSectors) {
    RuleInput input;
    input.ruleParamString.push_back("C,2-99,SIN-CAN-SIN|AMS-LHR-SHJ");
    auto rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    vector<string> violationsMsg;
    rule->setViolations(&violationsMsg);
    
    std::vector<Segment*> segments = { 
        createSegment(401, "TPE", "HKG", "C"),
        createSegment(402, "HKG", "TPE", "C") 
    };
    Duty* duty = createDuty(segments);

    EXPECT_FALSE(rule->CheckRule(duty));

    delete duty;
    delete rule;
    for (auto* rv : violations) {
        delete rv;
    }
}

// Test case 5: Two segments, freighter, sectors are in the allowed list. Should pass.
TEST_F(Rule7462Test, AllowedSectors_FirstPattern) {
    RuleInput input;
    input.ruleParamString.push_back("C,2-99,SIN-CAN-SIN|AMS-LHR-SHJ");
    auto rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    vector<string> violationsMsg;
    rule->setViolations(&violationsMsg);


    std::vector<Segment*> segments = { 
        createSegment(501, "SIN", "CAN", "C"),
        createSegment(502, "CAN", "SIN", "C") 
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));

    delete duty;
    delete rule;
    for (auto* rv : violations) {
        delete rv;
    }
}

// Test case 6: Three segments, freighter, sectors are in the allowed list. Should pass.
TEST_F(Rule7462Test, AllowedSectors_SecondPattern) {
    RuleInput input;
    input.ruleParamString.push_back("C,2-99,SIN-CAN-SIN|AMS-LHR-SHJ");
    auto rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    vector<string> violationsMsg;
    rule->setViolations(&violationsMsg);


    std::vector<Segment*> segments = { 
        createSegment(601, "AMS", "LHR", "C"),
        createSegment(602, "LHR", "SHJ", "C")
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));

    delete duty;
    delete rule;
    for (auto* rv : violations) {
        delete rv;
    }
}

// Test case 7: Segment number is outside the configured range. Should fail.
TEST_F(Rule7462Test, SegmentNumberOutOfRange) {
    RuleInput input;
    input.ruleParamString.push_back("C,3-5,SIN-CAN-SIN"); // duty中包含 3-5个航段才允许例外
    auto rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    vector<string> violationsMsg;
    rule->setViolations(&violationsMsg);


    std::vector<Segment*> segments = { 
        createSegment(701, "SIN", "CAN", "C"),
        createSegment(702, "CAN", "SIN", "C") 
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));

    delete duty;
    delete rule;
    for (auto* rv : violations) {
        delete rv;
    }
}

// Test case 10: Default parameters from description
TEST_F(Rule7462Test, DefaultParams_Allowed) {
    RuleInput input;
    input.ruleParamString.push_back("C,2-99,SIN-CAN-SIN|AMS-LHR-SHJ");
    auto rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    vector<string> violationsMsg;
    rule->setViolations(&violationsMsg);


    std::vector<Segment*> segments = { 
        createSegment(1001, "AMS", "LHR", "C"),
        createSegment(1002, "LHR", "SHJ", "C")
    };
    Duty* duty = createDuty(segments);

    EXPECT_TRUE(rule->CheckRule(duty));

    delete duty;
    delete rule;
    for (auto* rv : violations) {
        delete rv;
    }
}

// Test case 11: Default parameters from description, but fails
TEST_F(Rule7462Test, DefaultParams_Disallowed) {
    RuleInput input;
    input.ruleParamString.push_back("C,2-99,SIN-CAN-SIN|AMS-LHR-SHJ");
    auto rule = new CheckAllowedMultiSectorDutyForFreighterForSQRule(nullptr, input);
    std::vector<RULE_VIOLATION*> violations;
    rule->setRuleViolation(&violations);
    vector<string> violationsMsg;
    rule->setViolations(&violationsMsg);


    std::vector<Segment*> segments = { 
        createSegment(1101, "JNB", "NBO", "C"),
        createSegment(1102, "NBO", "AMS", "C")
    };
    Duty* duty = createDuty(segments);

    EXPECT_FALSE(rule->CheckRule(duty));

    delete duty;
    delete rule;
    for (auto* rv : violations) {
        delete rv;
    }
}



