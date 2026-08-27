// SIA_SUITE_SUMMARY_START
// SuiteId: 6.16
// Name: Max Positioning Sectors in COP (Freighter)
// SourceCsvRow: 6.16,Max 1 deadhead sector on FRT aircraft TC
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case1_OnePositioningSector_Legal: COP has 1 positioning sector on freighter aircraft.
//   - Case2_TwoPositioningSectors_Illegal: COP has 2 positioning sectors on freighter aircraft.
// Results:
//   - TODO
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7468/LimitPositioningInCopForSQRule.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& flightNumber,
                                     const std::string& assignment,
                                     bool isOperating,
                                     const std::string& serviceType,
                                     time_t startUtc,
                                     time_t endUtc,
                                     int dutyId,
                                     int segSeq) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFlightNumber(flightNumber);
    seg->setAssignment(assignment);
    seg->setIsOperating(isOperating);
    seg->setServiceType(serviceType);
    seg->setFleetCD("74F");
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    seg->setStartTimeLocSch(startUtc);
    seg->setEndTimeLocSch(endUtc);
    seg->setDutyId(dutyId);
    seg->setSegSeq(segSeq);
    seg->setPairingId(1);
    return seg;
}

std::unique_ptr<Duty> makeDutyFromSegments(const std::vector<Segment*>& segs,
                                           const std::string& assignment,
                                           int dutyId,
                                           int dutySeq) {
    auto duty = std::make_unique<Duty>(segs);
    duty->setId(dutyId);
    duty->setPairingId(1);
    duty->setDutySeq(dutySeq);
    duty->setAssignment(assignment);
    duty->setDepartureStation(segs.front()->getDepStationRead());
    duty->setArrivalStation(segs.back()->getArrStationRead());
    duty->setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    duty->setStartTimeLocAct(duty->getStartTimeUtcAct());
    duty->setEndTimeLocAct(duty->getEndTimeUtcAct());
    return duty;
}

RuleInput makeRuleInput(const std::string& sectorAssignment = "MVP",
                        const std::string& maxSectors = "1",
                        const std::string& dutyAssignment = "MVP",
                        const std::string& maxDuties = "1") {
    RuleInput input;
    DBRule row{};
    row.idRule = 7468;
    row.function = 7468;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7468001;
    row.overridebility = "H";
    row.reference = "SQ";
    row.params["BASES"] = "SIN";
    row.params["SERVICE TYPE"] = "Freighter";
    row.params["FLEET GROUP"] = "*";
    row.params["LIMIT SECTOR ASSIGNMENTS"] = sectorAssignment;
    row.params["MAX LIMITED SECTORS IN COP"] = maxSectors;
    row.params["LIMIT DUTY ASSIGNMENTS"] = dutyAssignment;
    row.params["MAX LIMITED DUTIES IN COP"] = maxDuties;
    input.dbRules.push_back(row);
    return input;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

class Sia616MaxPositioningFreighterTest : public ::testing::Test {
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

TEST_F(Sia616MaxPositioningFreighterTest, Case1_OnePositioningSector_Legal) {
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;

    segStorage.push_back(makeSegment("SIN", "NGO", "7408", "FLY", true, "F",
                                     utcFromString("2025-12-10 06:00:00"),
                                     utcFromString("2025-12-10 12:15:00"),
                                     1, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 1, 1));

    segStorage.push_back(makeSegment("NGO", "LAX", "7402", "FLY", true, "F",
                                     utcFromString("2025-12-11 14:05:00"),
                                     utcFromString("2025-12-12 00:00:00"),
                                     2, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 2, 2));

    segStorage.push_back(makeSegment("LAX", "HNL", "7415", "MVP", false, "",
                                     utcFromString("2025-12-13 22:25:00"),
                                     utcFromString("2025-12-14 04:20:00"),
                                     3, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "MVP", 3, 3));

    segStorage.push_back(makeSegment("HNL", "SYD", "7435", "FLY", true, "F",
                                     utcFromString("2025-12-14 12:00:00"),
                                     utcFromString("2025-12-15 22:25:00"),
                                     4, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 4, 4));

    segStorage.push_back(makeSegment("SYD", "SIN", "7447", "FLY", true, "F",
                                     utcFromString("2025-12-18 14:45:00"),
                                     utcFromString("2025-12-19 03:55:00"),
                                     5, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 5, 5));

    std::vector<Duty*> duties;
    duties.reserve(dutyStorage.size());
    for (auto& duty : dutyStorage) {
        duties.push_back(duty.get());
    }

    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(1);

    RuleInput input = makeRuleInput();
    LimitPositioningInCopForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Sia616MaxPositioningFreighterTest, Case2_TwoPositioningSectors_Illegal) {
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;

    segStorage.push_back(makeSegment("SIN", "NGO", "7408", "FLY", true, "F",
                                     utcFromString("2025-12-10 06:00:00"),
                                     utcFromString("2025-12-10 12:15:00"),
                                     1, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 1, 1));

    segStorage.push_back(makeSegment("NGO", "LAX", "7402", "MVP", false, "F",
                                     utcFromString("2025-12-11 14:05:00"),
                                     utcFromString("2025-12-12 00:00:00"),
                                     2, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "MVP", 2, 2));

    segStorage.push_back(makeSegment("LAX", "HNL", "7415", "MVP", false, "F",
                                     utcFromString("2025-12-13 22:25:00"),
                                     utcFromString("2025-12-14 04:20:00"),
                                     3, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "MVP", 3, 3));

    segStorage.push_back(makeSegment("HNL", "SYD", "7435", "FLY", true, "F",
                                     utcFromString("2025-12-14 12:00:00"),
                                     utcFromString("2025-12-15 22:25:00"),
                                     4, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 4, 4));

    segStorage.push_back(makeSegment("SYD", "SIN", "7447", "FLY", true, "F",
                                     utcFromString("2025-12-18 14:45:00"),
                                     utcFromString("2025-12-19 03:55:00"),
                                     5, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 5, 5));

    std::vector<Duty*> duties;
    duties.reserve(dutyStorage.size());
    for (auto& duty : dutyStorage) {
        duties.push_back(duty.get());
    }

    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(1);

    RuleInput input = makeRuleInput();
    LimitPositioningInCopForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violations.empty());
    EXPECT_EQ(_violations.front()->idRule, 7468);
    EXPECT_NE(_violations.front()->violation_msg.find("MVP sectors in COP"), std::string::npos);
}

TEST_F(Sia616MaxPositioningFreighterTest, Case3_DutyAlertReflectsAssignment) {
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;

    segStorage.push_back(makeSegment("SIN", "NGO", "7408", "FLY", true, "F",
                                     utcFromString("2025-12-10 06:00:00"),
                                     utcFromString("2025-12-10 12:15:00"),
                                     1, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 1, 1));

    segStorage.push_back(makeSegment("NGO", "LAX", "7402", "MVP", false, "F",
                                     utcFromString("2025-12-11 14:05:00"),
                                     utcFromString("2025-12-12 00:00:00"),
                                     2, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "MVP", 2, 2));

    segStorage.push_back(makeSegment("LAX", "HNL", "7415", "MVP", false, "F",
                                     utcFromString("2025-12-13 22:25:00"),
                                     utcFromString("2025-12-14 04:20:00"),
                                     3, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "MVP", 3, 3));

    segStorage.push_back(makeSegment("HNL", "SYD", "7435", "FLY", true, "F",
                                     utcFromString("2025-12-14 12:00:00"),
                                     utcFromString("2025-12-15 22:25:00"),
                                     4, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 4, 4));

    segStorage.push_back(makeSegment("SYD", "SIN", "7447", "FLY", true, "F",
                                     utcFromString("2025-12-18 14:45:00"),
                                     utcFromString("2025-12-19 03:55:00"),
                                     5, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 5, 5));

    std::vector<Duty*> duties;
    duties.reserve(dutyStorage.size());
    for (auto& duty : dutyStorage) {
        duties.push_back(duty.get());
    }

    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(1);

    RuleInput input = makeRuleInput("MVP", "2", "MVP", "1");
    LimitPositioningInCopForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violations.empty());
    EXPECT_EQ(_violations.front()->idRule, 7468);
    EXPECT_NE(_violations.front()->violation_msg.find("MVP duties in COP"), std::string::npos);
}
