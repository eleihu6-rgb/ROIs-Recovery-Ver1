#include <gtest/gtest.h>

#include "RuleEngine/rule/rule3003/LimitDepOrArrStationForPairingRule.h"
#include "db/RuleParams.h"
#include "db/Pairing.h"
#include "db/Duty.h"
#include "db/Segment.h"
#include "orUtil/UtilFunc.h"
#include "GlobalDefinition/RuleEngineDef.h"
#include "RuleEngine/rule/framework/Rule.h"
#include "CrewDB.h"

#include <memory>
#include <vector>

namespace {

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    return ctx;
}

// Helper to create a basic segment
std::unique_ptr<Segment> makeSegment(const std::string& dep, const std::string& arr) {
    auto seg = std::make_unique<Segment>();
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    return seg;
}

// Helper to create a duty from segments
std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setDepartureStation(segments.front()->getDepSta());
    duty->setArrivalStation(segments.back()->getArrSta());
    return duty;
}

// Helper to convert unique_ptr vector to raw pointer vector
std::vector<Duty*> asRaw(const std::vector<std::unique_ptr<Duty>>& duties) {
    std::vector<Duty*> raw;
    raw.reserve(duties.size());
    for (const auto& duty : duties) {
        raw.push_back(duty.get());
    }
    return raw;
}


// Helper to create a pairing
std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& activity, long long dbid) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setQualifier(activity);
    pairing->setDbId(dbid);
    return pairing;
}

// Helper to create a DBRule row for Rule 3003
DBRule makeRule3003Row(int rowNum, const std::string& pairingAssignments, const std::string& bases, int severity = 1) {
    DBRule row{};
    row.idRule = 3003;
    row.function = 3003;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.severity = severity;
    row.overridebility = "N";
    row.reference = "Ref3003";
    row.idRuleParam = 3003001 + rowNum;
    row.params["PAIRING ASSIGNMENTS"] = pairingAssignments;
    row.params["BASES"] = bases;
    return row;
}

} // namespace

class Rule3003Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

// Test case 1: Pairing Dep and Arr stations are in the allowed Bases. Should Pass.
TEST_F(Rule3003Test, SuccessCase) {
    auto ctx = buildDataContext();
    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment("SIN", "HKG"));
    segments.push_back(makeSegment("HKG", "SIN"));

    std::vector<Segment*> rawSegments;
    for(const auto& seg : segments) {
        rawSegments.push_back(seg.get());
    }

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({rawSegments[0]}));
    duties.push_back(makeDuty({rawSegments[1]}));

    auto pairing = makePairing(asRaw(duties), "FLY", 1001);

    RuleInput input;
    input.dbRules.push_back(makeRule3003Row(1, "FLY", "SIN|HKG"));

    LimitDepOrArrStationForPairingRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);
    rule.setDataContext(ctx);
    std::vector<RULE_VIOLATION*> rule_violations;
    rule.setRuleViolation(&rule_violations);
    std::vector<std::string> violations_log;
    rule.setViolations(&violations_log);
    
    EXPECT_TRUE(rule.CheckRule(pairing.get()));
}

// Test case 2: Pairing Departure station is not in the allowed Bases. Should Fail.
TEST_F(Rule3003Test, FailOnDeparture) {
    auto ctx = buildDataContext();
    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment("KUL", "HKG"));
    segments.push_back(makeSegment("HKG", "SIN"));

    std::vector<Segment*> rawSegments;
    for(const auto& seg : segments) {
        rawSegments.push_back(seg.get());
    }
    
    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({rawSegments[0]}));
    duties.push_back(makeDuty({rawSegments[1]}));

    auto pairing = makePairing(asRaw(duties), "FLY", 1002);

    RuleInput input;
    input.dbRules.push_back(makeRule3003Row(1, "FLY", "SIN|HKG"));

    LimitDepOrArrStationForPairingRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);
    rule.setDataContext(ctx);
    std::vector<RULE_VIOLATION*> rule_violations;
    rule.setRuleViolation(&rule_violations);
    std::vector<std::string> violations_log;
    rule.setViolations(&violations_log);

    EXPECT_FALSE(rule.CheckRule(pairing.get()));

    auto violations = pairing->getViolationMessage();
    ASSERT_EQ(violations.size(), 1);
    EXPECT_EQ(violations[0], "[Rule=3003][Pairing=1002]The departure or arrival station of the pairing is not a base station (SIN|HKG).");
}

// Test case 3: Pairing Arrival station is not in the allowed Bases. Should Fail.
TEST_F(Rule3003Test, FailOnArrival) {
    auto ctx = buildDataContext();
    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment("SIN", "HKG"));
    segments.push_back(makeSegment("HKG", "KUL"));
    
    std::vector<Segment*> rawSegments;
    for(const auto& seg : segments) {
        rawSegments.push_back(seg.get());
    }

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({rawSegments[0]}));
    duties.push_back(makeDuty({rawSegments[1]}));

    auto pairing = makePairing(asRaw(duties), "FLY", 1003);

    RuleInput input;
    input.dbRules.push_back(makeRule3003Row(1, "FLY", "SIN|HKG"));

    LimitDepOrArrStationForPairingRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);
    rule.setDataContext(ctx);
    std::vector<RULE_VIOLATION*> rule_violations;
    rule.setRuleViolation(&rule_violations);
    std::vector<std::string> violations_log;
    rule.setViolations(&violations_log);

    EXPECT_FALSE(rule.CheckRule(pairing.get()));

    auto violations = pairing->getViolationMessage();
    ASSERT_EQ(violations.size(), 1);
    EXPECT_EQ(violations[0], "[Rule=3003][Pairing=1003]The departure or arrival station of the pairing is not a base station (SIN|HKG).");
}

// Test case 4: Success with wildcard in Pairing Assignments.
TEST_F(Rule3003Test, SuccessWithWildcardAssignment) {
    auto ctx = buildDataContext();
    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment("SIN", "HKG"));
    segments.push_back(makeSegment("HKG", "SIN"));

    std::vector<Segment*> rawSegments;
    for(const auto& seg : segments) {
        rawSegments.push_back(seg.get());
    }

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({rawSegments[0]}));
    duties.push_back(makeDuty({rawSegments[1]}));

    auto pairing = makePairing(asRaw(duties), "MVP", 1004);

    RuleInput input;
    input.dbRules.push_back(makeRule3003Row(1, "*", "SIN|HKG"));

    LimitDepOrArrStationForPairingRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);
    rule.setDataContext(ctx);
    std::vector<RULE_VIOLATION*> rule_violations;
    rule.setRuleViolation(&rule_violations);
    std::vector<std::string> violations_log;
    rule.setViolations(&violations_log);

    EXPECT_TRUE(rule.CheckRule(pairing.get()));
}


// Test case 5: Success case with wildcard in Bases.
TEST_F(Rule3003Test, SuccessWithWildcardBase) {
    auto ctx = buildDataContext();
    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment("KUL", "HKG"));
    segments.push_back(makeSegment("HKG", "TPE"));
    
    std::vector<Segment*> rawSegments;
    for(const auto& seg : segments) {
        rawSegments.push_back(seg.get());
    }

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({rawSegments[0]}));
    duties.push_back(makeDuty({rawSegments[1]}));
    
    auto pairing = makePairing(asRaw(duties), "FLY", 1006);

    RuleInput input;
    input.dbRules.push_back(makeRule3003Row(1, "FLY", "*"));

    LimitDepOrArrStationForPairingRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);
    rule.setDataContext(ctx);
    std::vector<RULE_VIOLATION*> rule_violations;
    rule.setRuleViolation(&rule_violations);
    std::vector<std::string> violations_log;
    rule.setViolations(&violations_log);

    EXPECT_TRUE(rule.CheckRule(pairing.get()));
}

// Test case 6: No matching rule parameter for activity
TEST_F(Rule3003Test, NoMatchingRule) {
    auto ctx = buildDataContext();
    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment("KUL", "HKG"));
    segments.push_back(makeSegment("HKG", "SIN"));

    std::vector<Segment*> rawSegments;
    for(const auto& seg : segments) {
        rawSegments.push_back(seg.get());
    }

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({rawSegments[0]}));
    duties.push_back(makeDuty({rawSegments[1]}));

    auto pairing = makePairing(asRaw(duties), "FLY", 1007);

    RuleInput input;
    // Pairing assignment "MVO" does not match "FLY"
    input.dbRules.push_back(makeRule3003Row(1, "MVO", "SIN|HKG"));

    LimitDepOrArrStationForPairingRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);
    rule.setDataContext(ctx);
    std::vector<RULE_VIOLATION*> rule_violations;
    rule.setRuleViolation(&rule_violations);
    std::vector<std::string> violations_log;
    rule.setViolations(&violations_log);

    // Rule should not be triggered, so it should be considered valid.
    EXPECT_TRUE(rule.CheckRule(pairing.get()));
}
