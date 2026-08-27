#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7422/CalculateAtdoAfterSlipForSQRule.h"
#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "RuleEngine/rule/framework/utils/TimeUtils.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

#include <algorithm>
#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& assignment,
                                     bool isOperating) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setAssignment(assignment);
    seg->setIsOperating(isOperating);

    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);

    // For unit tests, treat local time as UTC.
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeLocSch(start);
    seg->setEndTimeLocSch(end);
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments,
                               const std::string& depStation,
                               const std::string& arrStation,
                               const std::string& startLoc,
                               const std::string& endLoc,
                               const std::string& dutyAssignment) {
    auto duty = std::make_unique<Duty>(segments);
    const time_t start = utcFromString(startLoc);
    const time_t end = utcFromString(endLoc);

    duty->setStartTimeLocAct(start);
    duty->setEndTimeLocAct(end);
    duty->setStartTimeUtcAct(start);
    duty->setEndTimeUtcAct(end);
    duty->setDepartureStation(depStation);
    duty->setArrivalStation(arrStation);
    duty->setAssignment(dutyAssignment);

    return duty;
}

DBRule makeTable1Row(int rowNum,
                     const std::string& clause,
                     const std::string& pattern,
                     const std::string& slipStation,
                     const std::string& slipLtHoursRaw,
                     const std::string& slipArrIsOperating,
                     const std::string& slipDepIsOperating,
                     int atdoDays,
                     const std::string& followingAllowAfter,
                     const std::string& maxPairingDays = "*",
                     int atdoHours = 0,
                     int atdoLocalNights = 0) {
    DBRule row{};
    row.idRule = 7422001;
    row.function = 7422;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.idRuleParam = 742200000 + rowNum;
    row.overridebility = "H";
    row.reference = "SQ";
    row.params["Clause"] = clause;
    row.params["Pattern"] = pattern;
    row.params["Slip station"] = slipStation;
    row.params["Slip < hours"] = slipLtHoursRaw;
    row.params["Slip arr is operating"] = slipArrIsOperating;
    row.params["Slip dep is operating"] = slipDepIsOperating;
    row.params["ATDO days"] = std::to_string(atdoDays);
    row.params["ATDO hours"] = std::to_string(atdoHours);
    row.params["ATDO local nights"] = std::to_string(atdoLocalNights);
    row.params["Following DO allow after"] = followingAllowAfter;
    row.params["Max pairing days"] = maxPairingDays;
    return row;
}

DBRule makeTable1Row(int rowNum,
                     const std::string& clause,
                     const std::string& pattern,
                     const std::string& slipStation,
                     int slipLtHours,
                     const std::string& slipArrIsOperating,
                     const std::string& slipDepIsOperating,
                     int atdoDays,
                     const std::string& followingAllowAfter,
                     const std::string& maxPairingDays = "*",
                     int atdoHours = 0,
                     int atdoLocalNights = 0) {
    return makeTable1Row(rowNum,
                         clause,
                         pattern,
                         slipStation,
                         std::to_string(slipLtHours),
                         slipArrIsOperating,
                         slipDepIsOperating,
                         atdoDays,
                         followingAllowAfter,
                         maxPairingDays,
                         atdoHours,
                         atdoLocalNights);
}

DBRule makeTable2Row(const std::string& restStartsAfter,
                     const std::string& operatingDefinition,
                     const std::string& standbyReducesRestAndLn = "Y",
                     const std::string& standbyAssignments = "SBY",
                     const std::string& serviceType = "*",
                     const std::string& fleets = "*",
                     const std::string& pairingLengthEndsAt = "") {
    DBRule row{};
    row.idRule = 7422001;
    row.function = 7422;
    row.tableNum = 2;
    row.rowNum = 1;
    row.idRuleParam = 742299999;
    row.overridebility = "H";
    row.reference = "SQ";
    row.params["Sby Reduces Rest and LN"] = standbyReducesRestAndLn;
    row.params["Rest starts after"] = restStartsAfter;
    row.params["Standby Assignments"] = standbyAssignments;
    row.params["Operating definition"] = operatingDefinition;
    row.params["Service type"] = serviceType;
    row.params["Fleets"] = fleets;
    if (!pairingLengthEndsAt.empty()) {
        row.params["Pairing length ends at"] = pairingLengthEndsAt;
    }
    return row;
}

int expectedMinRestMinutes(time_t restStartLoc, int atdoDays, int allowAfterMinutes) {
    const time_t day = TimeUtils::Truncate(restStartLoc, ChronoUnit::DAYS);
    const time_t align = (restStartLoc == day) ? day : TimeUtils::AddDay(day, 1);
    const time_t requiredEnd = TimeUtils::AddDay(align, atdoDays) + static_cast<time_t>(allowAfterMinutes) * 60;
    return static_cast<int>((requiredEnd - restStartLoc) / 60);
}

time_t expectedRequiredEndLoc(time_t restStartLoc,
                              int atdoDays,
                              int atdoHours,
                              int atdoLocalNights,
                              int allowAfterMinutes,
                              bool exactMidnightNextDay = false) {
    time_t requiredEndLoc = restStartLoc;

    if (atdoDays > 0 || allowAfterMinutes > 0) {
        const time_t day = TimeUtils::Truncate(restStartLoc, ChronoUnit::DAYS);
        const time_t align = (restStartLoc == day) ? (exactMidnightNextDay ? TimeUtils::AddDay(day, 1) : day)
                                                   : TimeUtils::AddDay(day, 1);
        const time_t candidate = TimeUtils::AddDay(align, atdoDays) + static_cast<time_t>(allowAfterMinutes) * 60;
        requiredEndLoc = std::max(requiredEndLoc, candidate);
    }

    if (atdoHours > 0) {
        requiredEndLoc = std::max(requiredEndLoc, restStartLoc + static_cast<time_t>(atdoHours) * 3600);
    }

    if (atdoLocalNights > 0) {
        const time_t requiredEndUtc = DutyUtils::GetRestEndTimeMeetingNumLocalNights(restStartLoc, 0, "", atdoLocalNights);
        if (requiredEndUtc > 0) {
            requiredEndLoc = std::max(requiredEndLoc, requiredEndUtc);
        }
    }

    return requiredEndLoc;
}

int expectedDerivedAtdoDays(time_t restStartLoc,
                            time_t requiredEndLoc,
                            bool exactMidnightNextDay = false) {
    if (restStartLoc <= 0 || requiredEndLoc <= restStartLoc) {
        return 0;
    }

    constexpr time_t kDaySeconds = 24 * 3600;
    time_t dayStartLoc = TimeUtils::Truncate(restStartLoc, ChronoUnit::DAYS);
    if (restStartLoc == dayStartLoc && exactMidnightNextDay) {
        dayStartLoc = TimeUtils::AddDay(dayStartLoc, 1);
    }
    if (requiredEndLoc <= dayStartLoc) {
        return 0;
    }

    const time_t coveredSeconds = requiredEndLoc - dayStartLoc;
    return static_cast<int>((coveredSeconds + kDaySeconds - 1) / kDaySeconds);
}

}  // namespace

class Rule7422Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

TEST_F(Rule7422Test, CaiShortSlipSetsAtdoMinRestAtBase) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "DUTY_IS_OPERATING"));
    input.dbRules.push_back(makeTable1Row(1, "10(a)", "SIN-CAI-SIN", "CAI", 24, "Y", "Y", 1, "06:00"));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "CAI", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CAI", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY");
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CAI", "SIN", "2025-01-02 09:00:00", "2025-01-02 19:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CAI", "SIN", "2025-01-02 09:00:00", "2025-01-02 19:00:00", "FLY");
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    const int expected = expectedMinRestMinutes(utcFromString("2025-01-02 19:00:00"), 1, 6 * 60);
    const time_t restStartLoc = utcFromString("2025-01-02 19:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 1, 0, 0, 6 * 60);
    EXPECT_EQ(duty1->getMinRestAtBase(), expected);
    EXPECT_EQ(duty1->getMinRest(), expected);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7422Test, HoursOnlyDerivesCalendarDayAtdo) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "DUTY_IS_OPERATING"));
    input.dbRules.push_back(makeTable1Row(1, "10(a)", "SIN-CAI-SIN", "CAI", 24, "Y", "Y", 0, "00:00", "*", 12, 0));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "CAI", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CAI", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY");
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CAI", "SIN", "2025-01-02 09:00:00", "2025-01-02 19:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CAI", "SIN", "2025-01-02 09:00:00", "2025-01-02 19:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    const int expected = 12 * 60;
    const time_t restStartLoc = utcFromString("2025-01-02 19:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 0, 12, 0, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expected);
    EXPECT_EQ(duty1->getMinRest(), expected);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7422Test, SlipLtHoursWildcardDoesNotBlockRule) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("DEBRIEF", "DUTY_IS_OPERATING"));
    input.dbRules.push_back(makeTable1Row(1, "11(b)", "SIN-AMS-SIN", "AMS", "*", "Y", "Y", 2, "00:00", "6"));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "AMS", "2025-01-01 00:00:00", "2025-01-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "AMS", "2025-01-01 00:00:00", "2025-01-01 12:00:00", "FLY");
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("AMS", "SIN", "2025-01-03 01:00:00", "2025-01-03 10:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "AMS", "SIN", "2025-01-03 01:00:00", "2025-01-03 10:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-01-03 10:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 2, 0, 0, 0);
    const int expected = expectedMinRestMinutes(restStartLoc, 2, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expected);
    EXPECT_EQ(duty1->getMinRest(), expected);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7422Test, DebriefStartSubtractsDropoffToAlignRestEnd) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("DEBRIEF", "DUTY_IS_OPERATING"));
    input.dbRules.push_back(makeTable1Row(1, "11(b)", "SIN-AMS-SIN", "AMS", "*", "Y", "Y", 2, "00:00", "6"));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "AMS", "2025-01-01 00:00:00", "2025-01-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "AMS", "2025-01-01 00:00:00", "2025-01-01 12:00:00", "FLY");
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("AMS", "SIN", "2025-01-03 01:00:00", "2025-01-03 10:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "AMS", "SIN", "2025-01-03 01:00:00", "2025-01-03 10:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(60);
    duty1->setActualDropoffMin(60);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-01-03 10:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 2, 0, 0, 0);
    const int expectedFromDebrief = expectedMinRestMinutes(restStartLoc, 2, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expectedFromDebrief - 60);
    EXPECT_EQ(duty1->getMinRest(), expectedFromDebrief - 60);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7422Test, SlipExactly24HoursDoesNotTrigger) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("DEBRIEF", "DUTY_IS_OPERATING"));
    input.dbRules.push_back(makeTable1Row(1, "10(a)", "SIN-CAI-SIN", "CAI", 24, "Y", "Y", 1, "06:00"));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "CAI", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CAI", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY");

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CAI", "SIN", "2025-01-02 10:00:00", "2025-01-02 20:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CAI", "SIN", "2025-01-02 10:00:00", "2025-01-02 20:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    EXPECT_EQ(duty1->getMinRestAtBase(), 0);
    EXPECT_EQ(duty1->getMinRest(), 0);
}

TEST_F(Rule7422Test, NonOperatingSectorDoesNotMatchWhenOperateRequired) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "DUTY_ASSIGNMENTS=FLY|MVO"));
    input.dbRules.push_back(makeTable1Row(1, "10(b)", "SIN-IST-SIN", "IST", 24, "Y", "Y", 1, "06:00"));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "IST", "2025-02-01 00:00:00", "2025-02-01 10:00:00", "DHD", false));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "IST", "2025-02-01 00:00:00", "2025-02-01 10:00:00", "DHD");

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("IST", "SIN", "2025-02-02 09:00:00", "2025-02-02 19:00:00", "DHD", false));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "IST", "SIN", "2025-02-02 09:00:00", "2025-02-02 19:00:00", "DHD");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    EXPECT_EQ(duty1->getMinRestAtBase(), 0);
    EXPECT_EQ(duty1->getMinRest(), 0);
}

TEST_F(Rule7422Test, SegmentIsOperatingRequiresSingleSectorDutyToMatchPattern) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "SEGMENT_IS_OPERATING"));
    input.dbRules.push_back(makeTable1Row(1, "10(a)", "SIN-CAI-SIN", "CAI", 24, "Y", "Y", 1, "06:00"));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "DXB", "2025-03-01 00:00:00", "2025-03-01 06:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment("DXB", "CAI", "2025-03-01 07:00:00", "2025-03-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CAI", "2025-03-01 00:00:00", "2025-03-01 12:00:00", "FLY");
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CAI", "SIN", "2025-03-02 09:00:00", "2025-03-02 19:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CAI", "SIN", "2025-03-02 09:00:00", "2025-03-02 19:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    EXPECT_EQ(duty1->getMinRestAtBase(), 0);
    EXPECT_EQ(duty1->getMinRest(), 0);
}

TEST_F(Rule7422Test, MaxPairingDaysBlocksWhenPairingSpansMoreDays) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "SEGMENT_IS_OPERATING"));
    input.dbRules.push_back(makeTable1Row(1, "11(b)", "SIN-IST-SIN", "IST", 9999, "Y", "Y", 2, "00:00", "6"));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // Outbound day 1
    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "IST", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "IST", "2025-01-01 00:00:00", "2025-01-01 10:00:00", "FLY");
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    // Return on day 7 -> spans 7 calendar days (Jan 1 .. Jan 7)
    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("IST", "SIN", "2025-01-07 09:00:00", "2025-01-07 19:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "IST", "SIN", "2025-01-07 09:00:00", "2025-01-07 19:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    EXPECT_EQ(duty1->getMinRestAtBase(), 0);
    EXPECT_EQ(duty1->getMinRest(), 0);
}

TEST_F(Rule7422Test, MaxPairingDaysUsesConfigurablePairingLengthEndAnchor) {
    auto runCase = [&](const std::string& pairingLengthEndsAt) -> int {
        RuleInput input;
        input.dbRules.push_back(makeTable2Row("TRANSPORT",
                                              "SEGMENT_IS_OPERATING",
                                              "Y",
                                              "SBY",
                                              "*",
                                              "*",
                                              pairingLengthEndsAt));
        input.dbRules.push_back(makeTable1Row(1, "11(b)", "SIN-IST-SIN", "IST", 9999, "Y", "Y", 1, "00:00", "6"));

        CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
        rule.setApplication(PAIRING_EDITOR);

        std::vector<std::unique_ptr<Segment>> segStorage;

        std::vector<Segment*> segs0;
        segStorage.push_back(makeSegment("SIN", "IST", "2025-01-01 01:00:00", "2025-01-01 11:00:00", "FLY", true));
        segs0.push_back(segStorage.back().get());
        auto duty0 = makeDuty(segs0, "SIN", "IST", "2025-01-01 01:00:00", "2025-01-01 11:00:00", "FLY");
        duty0->setMinDropoff(0);
        duty0->setActualDropoffMin(0);

        std::vector<Segment*> segs1;
        segStorage.push_back(makeSegment("IST", "SIN", "2025-01-06 13:00:00", "2025-01-06 22:00:00", "FLY", true));
        segs1.push_back(segStorage.back().get());
        auto duty1 = makeDuty(segs1, "IST", "SIN", "2025-01-06 13:00:00", "2025-01-06 23:30:00", "FLY");
        duty1->setMinDropoff(120);
        duty1->setActualDropoffMin(120);
        duty1->setMinRestAtBase(0, true);
        duty1->setMinRest(0);

        std::vector<Duty*> duties{duty0.get(), duty1.get()};
        Pairing pairing(duties);

        rule.CalculateDuty(&pairing);
        return duty1->getMinRestAtBase();
    };

    EXPECT_GT(runCase("DEBRIEF"), 0);
    EXPECT_EQ(runCase("TRANSPORT"), 0);
}

TEST_F(Rule7422Test, StandbyWithinSlipReducesEffectiveRestMinutes) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "DUTY_IS_OPERATING", "Y", "SBY"));
    input.dbRules.push_back(makeTable1Row(1, "10(a)", "SIN-CAI-SIN", "CAI", 24, "Y", "Y", 1, "06:00"));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "CAI", "2025-04-01 00:00:00", "2025-04-01 10:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CAI", "2025-04-01 00:00:00", "2025-04-01 10:00:00", "FLY");
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    // Standby during slip: 10 hours (12:00 -> 22:00).
    std::vector<Segment*> segsSby;
    segStorage.push_back(makeSegment("CAI", "CAI", "2025-04-01 12:00:00", "2025-04-01 22:00:00", "SBY", false));
    segsSby.push_back(segStorage.back().get());
    auto dutySby = makeDuty(segsSby, "CAI", "CAI", "2025-04-01 12:00:00", "2025-04-01 22:00:00", "SBY");

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CAI", "SIN", "2025-04-02 16:00:00", "2025-04-03 02:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CAI", "SIN", "2025-04-02 16:00:00", "2025-04-03 02:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), dutySby.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-04-03 02:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 1, 0, 0, 6 * 60);
    EXPECT_EQ(duty1->getMinRestAtBase(), expectedMinRestMinutes(restStartLoc, 1, 6 * 60));
    EXPECT_EQ(duty1->getMinRest(), expectedMinRestMinutes(restStartLoc, 1, 6 * 60));
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7422Test, FleetFilterSkipsWhenOperatingFleetNotAllowed) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "DUTY_IS_OPERATING", "Y", "SBY", "*", "A350"));
    input.dbRules.push_back(makeTable1Row(1, "10(a)", "SIN-CAI-SIN", "CAI", 24, "Y", "Y", 1, "06:00"));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "CAI", "2025-05-01 00:00:00", "2025-05-01 10:00:00", "FLY", true));
    segStorage.back()->setFleetCD("B777");
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CAI", "2025-05-01 00:00:00", "2025-05-01 10:00:00", "FLY");
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CAI", "SIN", "2025-05-01 20:00:00", "2025-05-02 06:00:00", "FLY", true));
    segStorage.back()->setFleetCD("B777");
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CAI", "SIN", "2025-05-01 20:00:00", "2025-05-02 06:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    EXPECT_EQ(duty1->getMinRestAtBase(), 0);
    EXPECT_EQ(duty1->getMinRest(), 0);
    EXPECT_EQ(duty1->getMinATDO(), 0);

    segs0.front()->setFleetCD("A350");
    segs1.front()->setFleetCD("A350");
    rule.CalculateDuty(&pairing);

    EXPECT_GT(duty1->getMinRestAtBase(), 0);
    EXPECT_EQ(duty1->getMinRest(), duty1->getMinRestAtBase());
    const time_t restStartLoc = utcFromString("2025-05-02 06:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 1, 0, 0, 6 * 60);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7422Test, AlwaysDerivesAtdoFromComputedRestWindow) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "DUTY_IS_OPERATING"));
    input.dbRules.push_back(makeTable1Row(1, "10(a)", "SIN-CAI-SIN", "CAI", 24, "Y", "Y", 1, "00:00", "*", 0, 2));

    CalculateAtdoAfterSlipForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "CAI", "2025-06-01 14:00:00", "2025-06-02 00:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "CAI", "2025-06-01 14:00:00", "2025-06-02 00:00:00", "FLY");
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("CAI", "SIN", "2025-06-02 18:00:00", "2025-06-03 18:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "CAI", "SIN", "2025-06-02 18:00:00", "2025-06-03 18:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-06-03 18:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 1, 0, 2, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), static_cast<int>((requiredEndLoc - restStartLoc) / 60));
    EXPECT_EQ(duty1->getMinRest(), static_cast<int>((requiredEndLoc - restStartLoc) / 60));
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}
