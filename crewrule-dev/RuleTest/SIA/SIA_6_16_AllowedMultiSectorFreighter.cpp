// SIA_SUITE_SUMMARY_START
// SuiteId: 6.16
// Name: Allowed Multi-Sector Duty for Freighter
// SourceCsvRow: 6.16.,Allowed Multi-Sector Duty for Freighter
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: SYD-AKL-MEL duty (2 operating sectors) is listed as allowed -> no alert.
//   - Case #2: SYD-AKL-SIN duty (2 operating sectors) not in allowed list -> soft alert.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2026-01-07T18:48:48Z
// RemainingWork:
//   - Confirm the production allowed-sector list and segment counting (operating-only vs all segments) match the business rules; adjust params if needed.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7462/CheckAllowedMultiSectorDutyForFreighterForSQRule.h"
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
                                           int dutyId,
                                           int dutySeq) {
    auto duty = std::make_unique<Duty>(segs);
    duty->setId(dutyId);
    duty->setPairingId(1);
    duty->setDutySeq(dutySeq);
    duty->setDepartureStation(segs.front()->getDepStationRead());
    duty->setArrivalStation(segs.back()->getArrStationRead());
    duty->setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    duty->setStartTimeLocAct(duty->getStartTimeUtcAct());
    duty->setEndTimeLocAct(duty->getEndTimeUtcAct());
    return duty;
}

RuleInput makeRuleInputAllowedSectors(const std::string& allowedSectorList) {
    RuleInput input;
    DBRule row{};
    row.idRule = 7462001;
    row.function = 7462;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7462001;
    row.overridebility = "S";
    row.reference = "SIA";
    row.severity = 2;  // "Soft alert" in the spreadsheet.
    row.params["SERVICE TYPE"] = "F";
    row.params["SEGMENT NUMBER IN DUTY"] = "2-99";
    row.params["ALLOWED SECTORS"] = allowedSectorList;
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

class Sia616AllowedMultiSectorFreighterTest : public ::testing::Test {
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

TEST_F(Sia616AllowedMultiSectorFreighterTest, Case1_AllowedDoubleSector_NoAlert) {
    // COP excerpt (Excel 6.16 Case #1): Day 2 SYD-AKL + AKL-MEL is an allowed double-sector duty.
    // Model only what rule7462 needs: a duty with two operating freighter segments.
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;

    // Duty 1 (positioning to SYD, not operating).
    segStorage.push_back(makeSegment("SIN", "SYD", "211", "DHD", false, "F",
                                     utcFromString("2025-01-01 00:00:00"),
                                     utcFromString("2025-01-01 08:00:00"),
                                     1, 1));
    {
        std::vector<Segment*> segs{segStorage.back().get()};
        dutyStorage.push_back(makeDutyFromSegments(segs, 1, 1));
    }

    // Duty 2 (two-sector operating duty).
    segStorage.push_back(makeSegment("SYD", "AKL", "7298", "FLY", true, "F",
                                     utcFromString("2025-01-02 00:00:00"),
                                     utcFromString("2025-01-02 03:00:00"),
                                     2, 1));
    segStorage.push_back(makeSegment("AKL", "MEL", "7297", "FLY", true, "F",
                                     utcFromString("2025-01-02 05:00:00"),
                                     utcFromString("2025-01-02 08:00:00"),
                                     2, 2));
    {
        std::vector<Segment*> segs{segStorage[1].get(), segStorage[2].get()};
        dutyStorage.push_back(makeDutyFromSegments(segs, 2, 2));
    }

    // Duty 3 (positioning back to SIN, not operating).
    segStorage.push_back(makeSegment("MEL", "SIN", "248", "DHD", false, "F",
                                     utcFromString("2025-01-03 00:00:00"),
                                     utcFromString("2025-01-03 08:00:00"),
                                     3, 1));
    {
        std::vector<Segment*> segs{segStorage.back().get()};
        dutyStorage.push_back(makeDutyFromSegments(segs, 3, 3));
    }

    std::vector<Duty*> duties;
    duties.reserve(dutyStorage.size());
    for (auto& d : dutyStorage) {
        duties.push_back(d.get());
    }
    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(1);

    RuleInput input = makeRuleInputAllowedSectors("SYD-AKL-MEL");
    CheckAllowedMultiSectorDutyForFreighterForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Sia616AllowedMultiSectorFreighterTest, Case2_NotListedDoubleSector_SoftAlert) {
    // COP excerpt (Excel 6.16 Case #2): SYD-AKL-SIN is not in the allowed list -> soft alert.
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;

    // Duty 1 (positioning to SYD, not operating).
    segStorage.push_back(makeSegment("SIN", "SYD", "7298", "DHD", false, "F",
                                     utcFromString("2025-02-01 00:00:00"),
                                     utcFromString("2025-02-01 08:00:00"),
                                     1, 1));
    {
        std::vector<Segment*> segs{segStorage.back().get()};
        dutyStorage.push_back(makeDutyFromSegments(segs, 1, 1));
    }

    // Duty 2 (two-sector operating duty that is not in the allowed list).
    segStorage.push_back(makeSegment("SYD", "AKL", "7298", "FLY", true, "F",
                                     utcFromString("2025-02-02 00:00:00"),
                                     utcFromString("2025-02-02 03:00:00"),
                                     2, 1));
    segStorage.push_back(makeSegment("AKL", "SIN", "7289", "FLY", true, "F",
                                     utcFromString("2025-02-02 05:00:00"),
                                     utcFromString("2025-02-02 13:00:00"),
                                     2, 2));
    {
        std::vector<Segment*> segs{segStorage[1].get(), segStorage[2].get()};
        dutyStorage.push_back(makeDutyFromSegments(segs, 2, 2));
    }

    std::vector<Duty*> duties;
    duties.reserve(dutyStorage.size());
    for (auto& d : dutyStorage) {
        duties.push_back(d.get());
    }
    Pairing pairing(duties);
    pairing.setBase("SIN");
    pairing.setId(2);

    RuleInput input = makeRuleInputAllowedSectors("SYD-AKL-MEL");
    CheckAllowedMultiSectorDutyForFreighterForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    EXPECT_FALSE(_violations.empty());
    EXPECT_EQ(_violations.front()->idRule, 7462001);
}
