// SIA_SUITE_SUMMARY_START
// SuiteId: 6.18
// Name: Maximum sectors on FRT aircraft (exclude SBY)
// SourceCsvRow: 6.18,Maximum sectors on FRT aircraft
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case1_Max8_NoAlert: 8 sectors in COP, SBY excluded.
//   - Case2_Max6_SoftAlert: 8 sectors exceed limit 6, SBY excluded.
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
    seg->setServiceType(serviceType);
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

RuleInput makeRuleInput(const std::string& maxSectors, const std::string& sectorAssignments = "*~SBY") {
    RuleInput input;
    DBRule row{};
    row.idRule = 7468;
    row.function = 7468;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7468001;
    row.overridebility = "S";
    row.reference = "SQ";
    row.params["BASES"] = "SIN";
    row.params["SERVICE TYPE"] = "F";
    row.params["FLEET GROUP"] = "*";
    row.params["LIMIT SECTOR ASSIGNMENTS"] = sectorAssignments;
    row.params["MAX LIMITED SECTORS IN COP"] = maxSectors;
    row.params["LIMIT DUTY ASSIGNMENTS"] = "*";
    row.params["MAX LIMITED DUTIES IN COP"] = "*";
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

class Sia618MaxSectorsFreighterTest : public ::testing::Test {
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

TEST_F(Sia618MaxSectorsFreighterTest, Case1_Max8_NoAlert) {
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;

    segStorage.push_back(makeSegment("SIN", "ICN", "606", "MVP", "F",
                                     utcFromString("2025-12-12 06:35:00"),
                                     utcFromString("2025-12-12 13:00:00"),
                                     1, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "MVP", 1, 1));

    segStorage.push_back(makeSegment("ICN", "CVG", "7442", "FLY", "F",
                                     utcFromString("2025-12-13 14:40:00"),
                                     utcFromString("2025-12-14 04:10:00"),
                                     2, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 2, 2));

    segStorage.push_back(makeSegment("CVG", "CVG", "SBY", "SBY", "F",
                                     utcFromString("2025-12-15 09:00:00"),
                                     utcFromString("2025-12-15 12:00:00"),
                                     3, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "SBY", 3, 3));

    segStorage.push_back(makeSegment("CVG", "NGO", "7411", "FLY", "F",
                                     utcFromString("2025-12-16 19:10:00"),
                                     utcFromString("2025-12-17 09:30:00"),
                                     4, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 4, 4));

    segStorage.push_back(makeSegment("NGO", "LAX", "7408", "FLY", "F",
                                     utcFromString("2025-12-18 22:05:00"),
                                     utcFromString("2025-12-19 08:00:00"),
                                     5, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 5, 5));

    segStorage.push_back(makeSegment("LAX", "HNL", "7415", "FLY", "F",
                                     utcFromString("2025-12-22 14:25:00"),
                                     utcFromString("2025-12-22 20:20:00"),
                                     6, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 6, 6));

    segStorage.push_back(makeSegment("HNL", "SYD", "7435", "FLY", "F",
                                     utcFromString("2025-12-23 23:00:00"),
                                     utcFromString("2025-12-24 09:25:00"),
                                     7, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 7, 7));

    segStorage.push_back(makeSegment("SYD", "MEL", "7443", "FLY", "F",
                                     utcFromString("2025-12-26 11:25:00"),
                                     utcFromString("2025-12-26 13:00:00"),
                                     8, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 8, 8));

    segStorage.push_back(makeSegment("MEL", "SIN", "7443", "FLY", "F",
                                     utcFromString("2025-12-26 17:15:00"),
                                     utcFromString("2025-12-27 01:10:00"),
                                     9, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 9, 9));

    std::vector<Duty*> duties;
    duties.reserve(dutyStorage.size());
    for (auto& duty : dutyStorage) {
        duties.push_back(duty.get());
    }

    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(1);

    RuleInput input = makeRuleInput("8");
    LimitPositioningInCopForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Sia618MaxSectorsFreighterTest, Case2_Max6_SoftAlert) {
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;

    segStorage.push_back(makeSegment("SIN", "ICN", "606", "MVP", "F",
                                     utcFromString("2025-12-12 06:35:00"),
                                     utcFromString("2025-12-12 13:00:00"),
                                     1, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "MVP", 1, 1));

    segStorage.push_back(makeSegment("ICN", "CVG", "7442", "FLY", "F",
                                     utcFromString("2025-12-13 14:40:00"),
                                     utcFromString("2025-12-14 04:10:00"),
                                     2, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 2, 2));

    segStorage.push_back(makeSegment("CVG", "CVG", "SBY", "SBY", "F",
                                     utcFromString("2025-12-15 09:00:00"),
                                     utcFromString("2025-12-15 12:00:00"),
                                     3, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "SBY", 3, 3));

    segStorage.push_back(makeSegment("CVG", "NGO", "7411", "FLY", "F",
                                     utcFromString("2025-12-16 19:10:00"),
                                     utcFromString("2025-12-17 09:30:00"),
                                     4, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 4, 4));

    segStorage.push_back(makeSegment("NGO", "LAX", "7408", "FLY", "F",
                                     utcFromString("2025-12-18 22:05:00"),
                                     utcFromString("2025-12-19 08:00:00"),
                                     5, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 5, 5));

    segStorage.push_back(makeSegment("LAX", "HNL", "7415", "FLY", "F",
                                     utcFromString("2025-12-22 14:25:00"),
                                     utcFromString("2025-12-22 20:20:00"),
                                     6, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 6, 6));

    segStorage.push_back(makeSegment("HNL", "SYD", "7435", "FLY", "F",
                                     utcFromString("2025-12-23 23:00:00"),
                                     utcFromString("2025-12-24 09:25:00"),
                                     7, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 7, 7));

    segStorage.push_back(makeSegment("SYD", "MEL", "7443", "FLY", "F",
                                     utcFromString("2025-12-26 11:25:00"),
                                     utcFromString("2025-12-26 13:00:00"),
                                     8, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 8, 8));

    segStorage.push_back(makeSegment("MEL", "SIN", "7443", "FLY", "F",
                                     utcFromString("2025-12-26 17:15:00"),
                                     utcFromString("2025-12-27 01:10:00"),
                                     9, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 9, 9));

    std::vector<Duty*> duties;
    duties.reserve(dutyStorage.size());
    for (auto& duty : dutyStorage) {
        duties.push_back(duty.get());
    }

    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(1);

    RuleInput input = makeRuleInput("6");
    LimitPositioningInCopForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violations.empty());
    EXPECT_EQ(_violations.front()->idRule, 7468);
    EXPECT_NE(_violations.front()->violation_msg.find("any except SBY sectors in COP"), std::string::npos);
}

TEST_F(Sia618MaxSectorsFreighterTest, Case3_AnyAssignmentLabel) {
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;

    segStorage.push_back(makeSegment("SIN", "ICN", "606", "MVP", "F",
                                     utcFromString("2025-12-12 06:35:00"),
                                     utcFromString("2025-12-12 13:00:00"),
                                     1, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "MVP", 1, 1));

    segStorage.push_back(makeSegment("ICN", "CVG", "7442", "FLY", "F",
                                     utcFromString("2025-12-13 14:40:00"),
                                     utcFromString("2025-12-14 04:10:00"),
                                     2, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 2, 2));

    segStorage.push_back(makeSegment("CVG", "CVG", "SBY", "SBY", "F",
                                     utcFromString("2025-12-15 09:00:00"),
                                     utcFromString("2025-12-15 12:00:00"),
                                     3, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "SBY", 3, 3));

    segStorage.push_back(makeSegment("CVG", "NGO", "7411", "FLY", "F",
                                     utcFromString("2025-12-16 19:10:00"),
                                     utcFromString("2025-12-17 09:30:00"),
                                     4, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 4, 4));

    segStorage.push_back(makeSegment("NGO", "LAX", "7408", "FLY", "F",
                                     utcFromString("2025-12-18 22:05:00"),
                                     utcFromString("2025-12-19 08:00:00"),
                                     5, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 5, 5));

    segStorage.push_back(makeSegment("LAX", "HNL", "7415", "FLY", "F",
                                     utcFromString("2025-12-22 14:25:00"),
                                     utcFromString("2025-12-22 20:20:00"),
                                     6, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 6, 6));

    segStorage.push_back(makeSegment("HNL", "SYD", "7435", "FLY", "F",
                                     utcFromString("2025-12-23 23:00:00"),
                                     utcFromString("2025-12-24 09:25:00"),
                                     7, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 7, 7));

    segStorage.push_back(makeSegment("SYD", "MEL", "7443", "FLY", "F",
                                     utcFromString("2025-12-26 11:25:00"),
                                     utcFromString("2025-12-26 13:00:00"),
                                     8, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 8, 8));

    segStorage.push_back(makeSegment("MEL", "SIN", "7443", "FLY", "F",
                                     utcFromString("2025-12-26 17:15:00"),
                                     utcFromString("2025-12-27 01:10:00"),
                                     9, 1));
    dutyStorage.push_back(makeDutyFromSegments({segStorage.back().get()}, "FLY", 9, 9));

    std::vector<Duty*> duties;
    duties.reserve(dutyStorage.size());
    for (auto& duty : dutyStorage) {
        duties.push_back(duty.get());
    }

    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(1);

    RuleInput input = makeRuleInput("6", "*");
    LimitPositioningInCopForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    ASSERT_FALSE(_violations.empty());
    EXPECT_EQ(_violations.front()->idRule, 7468);
    EXPECT_NE(_violations.front()->violation_msg.find("any sectors in COP"), std::string::npos);
}
