// SIA_SUITE_SUMMARY_START
// SuiteId: 6.15
// Name: Rest Time between flights
// SourceCsvRow: 6.15.,Rest Time between flights
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: REQ_REST_AFT SQ225 = 19:00, provided 17:30 -> illegal.
//   - Case #2: REQ_REST_AFT SQ225 = 17:00, provided 17:30 -> legal.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2026-01-07T18:48:48Z
// RemainingWork:
//   - Confirm whether "provided rest" should include pseudo CI/CO (brief/debrief/pickup/dropoff) in production; if so, model via long_transit / duty nodes.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7467/LimitRestTimeBetweenFlightsForSQRule.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

std::unique_ptr<Segment> makeOperatingSegment(const std::string& dep,
                                              const std::string& arr,
                                              const std::string& flightNumber,
                                              time_t startUtc,
                                              time_t endUtc,
                                              int dutyId) {
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
    seg->setDutyId(dutyId);
    seg->setPairingId(1);
    return seg;
}

std::unique_ptr<Duty> makeDutyFromSegment(Segment* seg, int dutyId, int dutySeq) {
    std::vector<Segment*> segs{seg};
    auto duty = std::make_unique<Duty>(segs);
    duty->setId(dutyId);
    duty->setPairingId(1);
    duty->setDutySeq(dutySeq);
    duty->setDepartureStation(seg->getDepStationRead());
    duty->setArrivalStation(seg->getArrStationRead());
    duty->setStartTimeUtcAct(seg->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(seg->getEndTimeUtcAct());
    duty->setStartTimeLocAct(duty->getStartTimeUtcAct());
    duty->setEndTimeLocAct(duty->getEndTimeUtcAct());
    return duty;
}

DBRule makeRule7467Row(int rowNum, const std::string& minTimeLimit) {
    DBRule rule{};
    rule.idRule = 7467;
    rule.function = 7467;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 7467000 + rowNum;
    rule.overridebility = "S";
    rule.reference = "SIA";
    rule.severity = 2;  // soft alert
    rule.params["TYPE"] = "AFTER";
    rule.params["FLIGHT NO A"] = "225";
    rule.params["DEP-ARR A"] = "SIN-PER";
    rule.params["FLIGHT NO B"] = "*";
    rule.params["DEP-ARR B"] = "*";
    rule.params["MIN TIME LIMIT"] = minTimeLimit;
    rule.params["MAX TIME LIMIT"] = "99:59";
    rule.params["PENALTY"] = "0";
    rule.params["ACTIVE(Y/N)"] = "Y";
    rule.params["COMMENT"] = "REQ_REST_AFT SQ225";
    rule.params["SEVERITY"] = "2";
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

class Sia615RestBetweenFlightsTest : public ::testing::Test {
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

TEST_F(Sia615RestBetweenFlightsTest, Case1_Required19h_Provided17h30_IsIllegal) {
    // Provided rest is modelled as the time between the arrival of SQ225 and the departure of SQ216.
    const time_t sq225Start = utcFromString("2025-03-01 00:00:00");
    const time_t sq225End = utcFromString("2025-03-01 10:00:00");
    const time_t sq216Start = utcFromString("2025-03-02 03:30:00");  // 17h30 after sq225End
    const time_t sq216End = utcFromString("2025-03-02 13:30:00");

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeOperatingSegment("SIN", "PER", "225", sq225Start, sq225End, 1));
    segStorage.push_back(makeOperatingSegment("PER", "SIN", "216", sq216Start, sq216End, 2));

    std::vector<std::unique_ptr<Duty>> dutyStorage;
    dutyStorage.push_back(makeDutyFromSegment(segStorage[0].get(), 1, 1));
    dutyStorage.push_back(makeDutyFromSegment(segStorage[1].get(), 2, 2));

    std::vector<Duty*> duties{dutyStorage[0].get(), dutyStorage[1].get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(1);

    RuleInput input;
    input.dbRules.push_back(makeRule7467Row(1, "19:00"));

    LimitRestTimeBetweenFlightsForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    EXPECT_FALSE(_violations.empty());
    EXPECT_EQ(_violations.front()->idRule, 7467);
}

TEST_F(Sia615RestBetweenFlightsTest, Case2_Required17h_Provided17h30_IsLegal) {
    const time_t sq225Start = utcFromString("2025-04-01 00:00:00");
    const time_t sq225End = utcFromString("2025-04-01 10:00:00");
    const time_t sq216Start = utcFromString("2025-04-02 03:30:00");  // 17h30 after sq225End
    const time_t sq216End = utcFromString("2025-04-02 13:30:00");

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeOperatingSegment("SIN", "PER", "225", sq225Start, sq225End, 1));
    segStorage.push_back(makeOperatingSegment("PER", "SIN", "216", sq216Start, sq216End, 2));

    std::vector<std::unique_ptr<Duty>> dutyStorage;
    dutyStorage.push_back(makeDutyFromSegment(segStorage[0].get(), 1, 1));
    dutyStorage.push_back(makeDutyFromSegment(segStorage[1].get(), 2, 2));

    std::vector<Duty*> duties{dutyStorage[0].get(), dutyStorage[1].get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(2);

    RuleInput input;
    input.dbRules.push_back(makeRule7467Row(1, "17:00"));

    LimitRestTimeBetweenFlightsForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violations.empty());
}
