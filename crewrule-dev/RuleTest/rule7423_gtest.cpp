
#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7423/CalculatePostUlrRestAtBaseForSQRule.h"
#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "RuleEngine/rule/framework/utils/TimeUtils.h"
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
                     const std::string& hasUlrDuty,
                     const std::string& postUlrPosBackToBase,
                     const std::string& clause,
                     int restDays,
                     int restHours,
                     int restLocalNights,
                     const std::string& followingAllowAfter) {
    DBRule row{};
    row.idRule = 7423001;
    row.function = 7423;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.idRuleParam = 742300000 + rowNum;
    row.overridebility = "H";
    row.reference = "SQ";
    row.params["Clause"] = clause;
    row.params["Has ULR Duty"] = hasUlrDuty;
    row.params["Post ULR Position Back To Base"] = postUlrPosBackToBase;
    row.params["Rest days"] = std::to_string(restDays);
    row.params["Rest hours"] = std::to_string(restHours);
    row.params["Rest local nights"] = std::to_string(restLocalNights);
    row.params["Following DO allow after"] = followingAllowAfter;
    return row;
}

DBRule makeTable1Row(int rowNum,
                      const std::string& clause,
                      int restDays,
                      int restHours,
                      int restLocalNights,
                      const std::string& followingAllowAfter) {
    return makeTable1Row(rowNum, "*", "*", clause, restDays, restHours, restLocalNights, followingAllowAfter);
}

DBRule makeTable2Row(const std::string& restStartsAfter,
                     const std::string& serviceType = "*",
                     const std::string& fleets = "*") {
    DBRule row{};
    row.idRule = 7423001;
    row.function = 7423;
    row.tableNum = 2;
    row.rowNum = 1;
    row.idRuleParam = 742399999;
    row.overridebility = "H";
    row.reference = "SQ";
    row.params["Rest starts after"] = restStartsAfter;
    row.params["Service type"] = serviceType;
    row.params["Fleets"] = fleets;
    return row;
}

time_t ceilToNextMidnight(time_t tLoc) {
    const time_t day = TimeUtils::Truncate(tLoc, ChronoUnit::DAYS);
    return (tLoc == day) ? day : TimeUtils::AddDay(day, 1);
}

time_t expectedRequiredEndLoc(time_t restStartLoc,
                              int restDays,
                              int restHours,
                              int restLocalNights,
                              int allowAfterMinutes) {
    time_t requiredEndLoc = restStartLoc;

    if (restDays > 0 || allowAfterMinutes > 0) {
        const time_t align = ceilToNextMidnight(restStartLoc);
        const time_t candidate = TimeUtils::AddDay(align, restDays) + static_cast<time_t>(allowAfterMinutes) * 60;
        requiredEndLoc = std::max(requiredEndLoc, candidate);
    }

    if (restHours > 0) {
        requiredEndLoc = std::max(requiredEndLoc, restStartLoc + static_cast<time_t>(restHours) * 3600);
    }

    if (restLocalNights > 0) {
        const time_t requiredEndUtc = DutyUtils::GetRestEndTimeMeetingNumLocalNights(restStartLoc, 0, "", restLocalNights);
        if (requiredEndUtc > 0) {
            requiredEndLoc = std::max(requiredEndLoc, requiredEndUtc);
        }
    }

    return requiredEndLoc;
}

int expectedMinRestMinutes(time_t restStartLoc,
                           int restDays,
                           int restHours,
                           int restLocalNights,
                           int allowAfterMinutes) {
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, restDays, restHours, restLocalNights, allowAfterMinutes);
    return requiredEndLoc > restStartLoc ? static_cast<int>((requiredEndLoc - restStartLoc) / 60) : 0;
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

class Rule7423Test : public ::testing::Test {};

TEST_F(Rule7423Test, RequiresFourLocalNightsAtBaseAfterSingleUlrPairing) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT"));
    input.dbRules.push_back(makeTable1Row(1, "ULR CA", 0, 0, 4, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // ULR duty out of base.
    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    // Return to base (non-ULR).
    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "SIN", "2025-01-03 00:00:00", "2025-01-03 12:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "SIN", "2025-01-03 00:00:00", "2025-01-03 12:00:00", "FLY");
    duty1->setULR(false);
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-01-03 12:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 0, 0, 4, 0);
    const int expected = expectedMinRestMinutes(restStartLoc, 0, 0, 4, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expected);
    EXPECT_EQ(duty1->getMinRest(), expected);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7423Test, SupportsHoursAndLocalNightsCombinationForCabinCrewRequirement) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT"));
    input.dbRules.push_back(makeTable1Row(1, "ULR CC", 0, 48, 3, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK", "2025-02-01 00:00:00", "2025-02-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-02-01 00:00:00", "2025-02-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "SIN", "2025-02-03 00:00:00", "2025-02-03 06:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "SIN", "2025-02-03 00:00:00", "2025-02-03 06:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-02-03 06:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 0, 48, 3, 0);
    const int expected = expectedMinRestMinutes(restStartLoc, 0, 48, 3, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expected);
    EXPECT_EQ(duty1->getMinRest(), expected);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7423Test, SupportsCalendarDayAtdoWithLocalNightsForAnrRequirement) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT"));
    input.dbRules.push_back(makeTable1Row(1, "ULR ANR", 3, 0, 3, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK", "2025-03-01 00:00:00", "2025-03-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-03-01 00:00:00", "2025-03-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "SIN", "2025-03-03 00:00:00", "2025-03-03 12:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "SIN", "2025-03-03 00:00:00", "2025-03-03 12:00:00", "FLY");
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-03-03 12:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 3, 0, 3, 0);
    const int expected = expectedMinRestMinutes(restStartLoc, 3, 0, 3, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expected);
    EXPECT_EQ(duty1->getMinRest(), expected);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7423Test, DebriefStartSubtractsDropoffToAlignRestEnd) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("DEBRIEF"));
    input.dbRules.push_back(makeTable1Row(1, "ULR ANR", 1, 0, 0, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK", "2025-03-01 00:00:00", "2025-03-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-03-01 00:00:00", "2025-03-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "SIN", "2025-03-02 00:00:00", "2025-03-02 22:30:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "SIN", "2025-03-02 00:00:00", "2025-03-02 22:30:00", "FLY");
    duty1->setULR(false);
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(60);
    duty1->setActualDropoffMin(60);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-03-02 22:30:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 1, 0, 0, 0);
    const int expectedFromDebrief = expectedMinRestMinutes(utcFromString("2025-03-02 22:30:00"), 1, 0, 0, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expectedFromDebrief - 60);
    EXPECT_EQ(duty1->getMinRest(), expectedFromDebrief - 60);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7423Test, SelectsPositionBackToBaseRowWhenMvpAfterUlr) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT"));
    input.dbRules.push_back(makeTable1Row(1, "Y", "N", "ULR completion without position", 0, 0, 4, "00:00"));
    input.dbRules.push_back(makeTable1Row(2, "Y", "Y", "ULR completion with MVP back to base", 0, 1, 0, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // ULR duty SIN -> JFK
    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK", "2025-04-01 00:00:00", "2025-04-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-04-01 00:00:00", "2025-04-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    // Standby at JFK (allowed between ULR and MVP back to base)
    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "JFK", "2025-04-02 00:00:00", "2025-04-02 06:00:00", "SBY", false));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "JFK", "2025-04-02 00:00:00", "2025-04-02 06:00:00", "SBY");
    duty1->setULR(false);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    // Position back to base (MVP JFK -> SIN)
    std::vector<Segment*> segs2;
    segStorage.push_back(makeSegment("JFK", "SIN", "2025-04-02 10:00:00", "2025-04-02 12:00:00", "MVP", false));
    segs2.push_back(segStorage.back().get());
    auto duty2 = makeDuty(segs2, "JFK", "SIN", "2025-04-02 10:00:00", "2025-04-02 12:00:00", "MVP");
    duty2->setULR(false);
    duty2->setMinRestAtBase(0, true);
    duty2->setMinRest(0);
    duty2->setMinDropoff(0);
    duty2->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get(), duty2.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-04-02 12:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 0, 1, 0, 0);
    const int expected = expectedMinRestMinutes(restStartLoc, 0, 1, 0, 0);
    EXPECT_EQ(duty2->getMinRestAtBase(), expected);
    EXPECT_EQ(duty2->getMinRest(), expected);
    EXPECT_EQ(duty2->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7423Test, AppliesWhenPairingContainsMultipleUlrDutiesAndEndsAtCrewBase) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT"));
    input.dbRules.push_back(makeTable1Row(1, "Y", "N", "ULR completion with local-night rest", 0, 0, 4, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "EWR", "2025-07-01 00:00:00", "2025-07-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "EWR", "2025-07-01 00:00:00", "2025-07-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("EWR", "SIN", "2025-07-03 00:00:00", "2025-07-03 12:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "EWR", "SIN", "2025-07-03 00:00:00", "2025-07-03 12:00:00", "FLY");
    duty1->setULR(true);
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-07-03 12:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 0, 0, 4, 0);
    const int expected = expectedMinRestMinutes(restStartLoc, 0, 0, 4, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expected);
    EXPECT_EQ(duty1->getMinRest(), expected);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7423Test, SkipsWhenPairingEndsAwayFromCrewBase) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT"));
    input.dbRules.push_back(makeTable1Row(1, "Y", "*", "Should apply only at crew base", 0, 0, 4, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "EWR", "2025-08-01 00:00:00", "2025-08-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "EWR", "2025-08-01 00:00:00", "2025-08-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("EWR", "LAX", "2025-08-03 00:00:00", "2025-08-03 12:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "EWR", "LAX", "2025-08-03 00:00:00", "2025-08-03 12:00:00", "FLY");
    duty1->setULR(false);
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    EXPECT_EQ(duty1->getMinRestAtBase(), 0);
    EXPECT_EQ(duty1->getMinRest(), 0);
    EXPECT_EQ(duty1->getMinATDO(), 0);
}

TEST_F(Rule7423Test, SelectsNonPositionRowWhenReturnToBaseIsOperatingDuty) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT"));
    input.dbRules.push_back(makeTable1Row(1, "Y", "N", "ULR completion without position", 0, 10, 0, "00:00"));
    input.dbRules.push_back(makeTable1Row(2, "Y", "Y", "ULR completion with MVP back to base", 0, 1, 0, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // ULR duty SIN -> JFK
    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK", "2025-05-01 00:00:00", "2025-05-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-05-01 00:00:00", "2025-05-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    // Return to base (operating, not MVP)
    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "SIN", "2025-05-02 00:00:00", "2025-05-02 10:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "SIN", "2025-05-02 00:00:00", "2025-05-02 10:00:00", "FLY");
    duty1->setULR(false);
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-05-02 10:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 0, 10, 0, 0);
    const int expected = expectedMinRestMinutes(restStartLoc, 0, 10, 0, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expected);
    EXPECT_EQ(duty1->getMinRest(), expected);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7423Test, AlwaysDerivesAtdoFromComputedRestWindow) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT"));
    input.dbRules.push_back(makeTable1Row(1, "Y", "*", "Mixed rest days and local nights", 1, 0, 2, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK", "2025-09-01 00:00:00", "2025-09-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-09-01 00:00:00", "2025-09-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "SIN", "2025-09-03 00:00:00", "2025-09-03 18:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "SIN", "2025-09-03 00:00:00", "2025-09-03 18:00:00", "FLY");
    duty1->setULR(false);
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    const time_t restStartLoc = utcFromString("2025-09-03 18:00:00");
    const time_t requiredEndLoc = expectedRequiredEndLoc(restStartLoc, 1, 0, 2, 0);
    const int expected = expectedMinRestMinutes(restStartLoc, 1, 0, 2, 0);
    EXPECT_EQ(duty1->getMinRestAtBase(), expected);
    EXPECT_EQ(duty1->getMinRest(), expected);
    EXPECT_EQ(duty1->getMinATDO(), expectedDerivedAtdoDays(restStartLoc, requiredEndLoc));
}

TEST_F(Rule7423Test, HasUlrDutyParamCanDisableApplication) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT"));
    input.dbRules.push_back(makeTable1Row(1, "N", "*", "Should not apply to ULR pairing", 0, 12, 0, "00:00"));

    CalculatePostUlrRestAtBaseForSQRule rule(nullptr, input);
    rule.setApplication(PAIRING_EDITOR);

    std::vector<std::unique_ptr<Segment>> segStorage;

    // ULR duty SIN -> JFK
    std::vector<Segment*> segs0;
    segStorage.push_back(makeSegment("SIN", "JFK", "2025-06-01 00:00:00", "2025-06-01 12:00:00", "FLY", true));
    segs0.push_back(segStorage.back().get());
    auto duty0 = makeDuty(segs0, "SIN", "JFK", "2025-06-01 00:00:00", "2025-06-01 12:00:00", "FLY");
    duty0->setULR(true);
    duty0->setMinDropoff(0);
    duty0->setActualDropoffMin(0);

    // Return to base
    std::vector<Segment*> segs1;
    segStorage.push_back(makeSegment("JFK", "SIN", "2025-06-02 00:00:00", "2025-06-02 10:00:00", "FLY", true));
    segs1.push_back(segStorage.back().get());
    auto duty1 = makeDuty(segs1, "JFK", "SIN", "2025-06-02 00:00:00", "2025-06-02 10:00:00", "FLY");
    duty1->setULR(false);
    duty1->setMinRestAtBase(0, true);
    duty1->setMinRest(0);
    duty1->setMinDropoff(0);
    duty1->setActualDropoffMin(0);

    std::vector<Duty*> duties{duty0.get(), duty1.get()};
    Pairing pairing(duties);
    pairing.setBase("SIN");

    rule.CalculateDuty(&pairing);

    EXPECT_EQ(duty1->getMinRestAtBase(), 0);
    EXPECT_EQ(duty1->getMinRest(), 0);
    EXPECT_EQ(duty1->getMinATDO(), 0);
}
