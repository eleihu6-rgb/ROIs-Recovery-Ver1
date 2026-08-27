#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7466/CalculateExtraDaysOffAtBaseForSQRule.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    return ctx;
}

std::unique_ptr<Segment> makeSegment(long long dbId,
                                     const std::string& flightNumber,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& assignment = "FLY") {
    auto seg = std::make_unique<Segment>();
    time_t start = utcFromString(startUtc);
    time_t end = utcFromString(endUtc);
    seg->setDBId(dbId);
    seg->setFlightNumber(flightNumber);
    seg->setAssignment(assignment);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeLocSch(start);
    seg->setEndTimeLocSch(end);
    seg->setIsOperating(assignment == "FLY" || assignment == "MVO" || assignment == "OPR");
    return seg;
}

void addDutyNode(Duty* duty, const std::string& node, int sequence, time_t timeUtc) {
    auto pdn = std::make_shared<PairingDutyNode>();
    pdn->setType("DUTY");
    pdn->setNode(node);
    pdn->setSequence(sequence);
    pdn->setStartTimeUtcAct(timeUtc);
    pdn->setEndTimeUtcAct(timeUtc);
    pdn->setStartTimeLocAct(timeUtc);
    pdn->setEndTimeLocAct(timeUtc);
    duty->pairingDutyNodes.push_back(pdn);
}

std::unique_ptr<Duty> makeDutyWithNodes(const std::vector<Segment*>& segments,
                                        time_t briefStartUtc,
                                        time_t debriefEndUtc,
                                        time_t dropoffEndUtc) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setDepartureStation(segments.front()->getDepSta());
    duty->setArrivalStation(segments.back()->getArrSta());
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
    duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
    duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
    addDutyNode(duty.get(), "BRIEF", 1, briefStartUtc);
    addDutyNode(duty.get(), "DEBRIEF", 2, debriefEndUtc);
    addDutyNode(duty.get(), "DROPOFF", 3, dropoffEndUtc);
    return duty;
}

std::vector<Duty*> asRaw(const std::vector<std::unique_ptr<Duty>>& duties) {
    std::vector<Duty*> raw;
    raw.reserve(duties.size());
    for (const auto& duty : duties) {
        raw.push_back(duty.get());
    }
    return raw;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties,
                                     time_t startUtc,
                                     time_t endUtc) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase("SIN");
    pairing->setPrimeActivity("FLY");
    pairing->setStartTimeUtcAct(startUtc);
    pairing->setStartTimeLocAct(startUtc);
    pairing->setEndTimeUtcAct(endUtc);
    pairing->setEndTimeLocAct(endUtc);
    return pairing;
}

DBRule makeRule7466Row(int rowNum,
                       const std::string& slipStation,
                       const std::string& slipArrIsOperating,
                       const std::string& slipDepIsOperating,
                       const std::string& slipLocalNightRange,
                       const std::string& copStartDow,
                       const std::string& flightNumbers,
                       const std::string& periodStart,
                       const std::string& periodEnd,
                       int extraDaysOff,
                       int severity = 1,
                       const std::string& flightIsOperating = "") {
    DBRule row{};
    row.idRule = 7466001;
    row.function = 7466;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.severity = severity;
    row.overridebility = "S";
    row.reference = "EXDO";
    row.idRuleParam = 7466001 + rowNum;
    row.params["SLIP STATION"] = slipStation;
    row.params["SLIP ARR IS OPERATING"] = slipArrIsOperating;
    row.params["SLIP DEP IS OPERATING"] = slipDepIsOperating;
    row.params["SLIP LOCAL NIGHT RANGE"] = slipLocalNightRange;
    row.params["COP START DOW"] = copStartDow;
    row.params["FLIGHT NUMBERS"] = flightNumbers;
    if (!flightIsOperating.empty()) {
        row.params["FLIGHT IS OPERATING"] = flightIsOperating;
    }
    row.params["PERIOD START DATE"] = periodStart;
    row.params["PERIOD END DATE"] = periodEnd;
    row.params["EXTRA DAYS OFF"] = std::to_string(extraDaysOff);
    row.params["SEVERITY"] = std::to_string(severity);
    return row;
}

DBRule makeRule7466ControlRow(const std::string& doStartsAfter,
                              const std::string& restStartsAfter = "TRANSPORT",
                              const std::string& standbyAssignments = "SBY",
                              const std::string& sbyReducesRestAndLn = "Y") {
    DBRule row{};
    row.idRule = 7466001;
    row.function = 7466;
    row.tableNum = 2;
    row.rowNum = 1;
    row.severity = 1;
    row.overridebility = "S";
    row.reference = "EXDO";
    row.idRuleParam = 7466001;
    row.params["SBY REDUCES REST AND LN"] = sbyReducesRestAndLn;
    row.params["REST STARTS AFTER"] = restStartsAfter;
    row.params["STANDBY ASSIGNMENTS"] = standbyAssignments;
    row.params["DO STARTS AFTER"] = doStartsAfter;
    return row;
}

}  // namespace

class Rule7466Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

TEST_F(Rule7466Test, AddsExtraDaysOffToExistingMinRest) {
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(6001, "100", "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(6002, "392", "SIN", "SIN",
                                   "2025-03-05 06:30:00",
                                   "2025-03-05 09:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()},
                                        utcFromString("2025-03-01 00:00:00"),
                                        utcFromString("2025-03-01 05:30:00"),
                                        utcFromString("2025-03-01 06:00:00")));
    duties.push_back(makeDutyWithNodes({segments[1].get()},
                                        utcFromString("2025-03-05 06:00:00"),
                                        utcFromString("2025-03-05 09:30:00"),
                                        utcFromString("2025-03-05 10:00:00")));

    Duty* lastDuty = duties.back().get();
    lastDuty->setMinRest(2 * 24 * 60, true);
    lastDuty->setMinRestAtBase(2 * 24 * 60, true);
    lastDuty->setMinATDO(2, true);

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:00:00"),
                               utcFromString("2025-03-05 10:00:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7466Row(1,
                                            "SIN",
                                            "*",
                                            "*",
                                            "0-99",
                                            "1-7",
                                            "392",
                                            "2025-03-01 00:00:00",
                                            "2025-03-31 00:00:00",
                                            1));

    CalculateExtraDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (3 * 24 * 60) + (14 * 60);
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}

TEST_F(Rule7466Test, DoesNotApplyWhenPeriodDoesNotCoverPairing) {
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(6101, "392", "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(6102, "392", "SIN", "SIN",
                                   "2025-03-05 06:30:00",
                                   "2025-03-05 09:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()},
                                        utcFromString("2025-03-01 00:00:00"),
                                        utcFromString("2025-03-01 05:30:00"),
                                        utcFromString("2025-03-01 06:00:00")));
    duties.push_back(makeDutyWithNodes({segments[1].get()},
                                        utcFromString("2025-03-05 06:00:00"),
                                        utcFromString("2025-03-05 09:30:00"),
                                        utcFromString("2025-03-05 10:00:00")));

    Duty* lastDuty = duties.back().get();
    lastDuty->setMinRest(2 * 24 * 60, true);
    lastDuty->setMinRestAtBase(2 * 24 * 60, true);
    lastDuty->setMinATDO(2, true);

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:00:00"),
                               utcFromString("2025-03-05 10:00:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7466Row(1,
                                            "SIN",
                                            "*",
                                            "*",
                                            "0-99",
                                            "1-7",
                                            "392",
                                            "2024-01-01 00:00:00",
                                            "2024-01-31 00:00:00",
                                            1));

    CalculateExtraDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    EXPECT_EQ(2 * 24 * 60, lastDuty->getMinRestAtBase());
    EXPECT_EQ(2 * 24 * 60, lastDuty->getMinRest());
}

TEST_F(Rule7466Test, MatchPeriodRangeInclusiveAtBothEndsForPairingStart) {
    auto runCase = [](const std::string& periodStart,
                      const std::string& periodEnd) -> int {
        auto ctx = buildDataContext();

        std::vector<std::unique_ptr<Segment>> segments;
        segments.push_back(makeSegment(6111, "392", "SIN", "SIN",
                                       "2025-03-01 01:00:00",
                                       "2025-03-01 05:00:00"));
        segments.push_back(makeSegment(6112, "392", "SIN", "SIN",
                                       "2025-03-05 06:30:00",
                                       "2025-03-05 09:00:00"));

        std::vector<std::unique_ptr<Duty>> duties;
        duties.push_back(makeDutyWithNodes({segments[0].get()},
                                           utcFromString("2025-03-01 00:00:00"),
                                           utcFromString("2025-03-01 05:30:00"),
                                           utcFromString("2025-03-01 06:00:00")));
        duties.push_back(makeDutyWithNodes({segments[1].get()},
                                           utcFromString("2025-03-05 06:00:00"),
                                           utcFromString("2025-03-05 09:30:00"),
                                           utcFromString("2025-03-05 10:00:00")));

        Duty* lastDuty = duties.back().get();
        lastDuty->setMinRest(2 * 24 * 60, true);
        lastDuty->setMinRestAtBase(2 * 24 * 60, true);
        lastDuty->setMinATDO(2, true);

        auto rawDuties = asRaw(duties);
        auto pairing = makePairing(rawDuties,
                                   utcFromString("2025-03-01 00:00:00"),
                                   utcFromString("2025-03-05 10:00:00"));

        RuleInput input;
        input.dbRules.push_back(makeRule7466Row(1,
                                                "SIN",
                                                "*",
                                                "*",
                                                "0-99",
                                                "1-7",
                                                "392",
                                                periodStart,
                                                periodEnd,
                                                1));

        CalculateExtraDaysOffAtBaseForSQRule rule(nullptr, input);
        rule.setDataContext(ctx);
        rule.setApplication(PAIRING_EDITOR);
        rule.CalculateDuty(pairing.get());

        return lastDuty->getMinEXDO();
    };

    EXPECT_EQ(1, runCase("2025-03-01 00:00:00", "2025-03-01 01:00:00"));
    EXPECT_EQ(1, runCase("2025-02-28 23:00:00", "2025-03-01 00:00:00"));
}

TEST_F(Rule7466Test, UsesDebriefWhenDoStartsAfterDebrief) {
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(6201, "100", "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(6202, "392", "SIN", "SIN",
                                   "2025-03-02 18:00:00",
                                   "2025-03-02 22:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()},
                                        utcFromString("2025-03-01 00:30:00"),
                                        utcFromString("2025-03-01 05:30:00"),
                                        utcFromString("2025-03-01 06:00:00")));
    duties.push_back(makeDutyWithNodes({segments[1].get()},
                                        utcFromString("2025-03-02 17:30:00"),
                                        utcFromString("2025-03-02 22:30:00"),
                                        utcFromString("2025-03-02 23:30:00")));

    Duty* lastDuty = duties.back().get();
    lastDuty->setMinRest(2 * 24 * 60, true);
    lastDuty->setMinRestAtBase(2 * 24 * 60, true);
    lastDuty->setMinATDO(2, true);

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:30:00"),
                               utcFromString("2025-03-02 23:30:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7466ControlRow("DEBRIEF"));
    input.dbRules.push_back(makeRule7466Row(1,
                                            "SIN",
                                            "*",
                                            "*",
                                            "0-99",
                                            "1-7",
                                            "392",
                                            "2025-03-01 00:00:00",
                                            "2025-03-31 00:00:00",
                                            1));

    CalculateExtraDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (3 * 24 * 60) + (30);
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}

TEST_F(Rule7466Test, MatchPeriodUsesPairingStartLocalTime) {
    auto ctx = buildDataContext();

    // Scenario A: Period only covers pairing end window, not pairing start report time => should not match.
    {
        std::vector<std::unique_ptr<Segment>> segments;
        segments.push_back(makeSegment(6251, "100", "SIN", "SIN",
                                       "2025-03-01 01:00:00",
                                       "2025-03-01 05:00:00"));
        segments.push_back(makeSegment(6252, "392", "SIN", "SIN",
                                       "2025-03-02 18:00:00",
                                       "2025-03-02 22:00:00"));

        std::vector<std::unique_ptr<Duty>> duties;
        duties.push_back(makeDutyWithNodes({segments[0].get()},
                                            utcFromString("2025-03-01 00:30:00"),
                                            utcFromString("2025-03-01 05:30:00"),
                                            utcFromString("2025-03-01 06:00:00")));
        duties.push_back(makeDutyWithNodes({segments[1].get()},
                                            utcFromString("2025-03-02 17:30:00"),
                                            utcFromString("2025-03-02 22:30:00"),
                                            utcFromString("2025-03-02 23:30:00")));

        Duty* lastDuty = duties.back().get();
        lastDuty->setMinRest(2 * 24 * 60, true);
        lastDuty->setMinRestAtBase(2 * 24 * 60, true);
        lastDuty->setMinATDO(2, true);

        auto rawDuties = asRaw(duties);
        auto pairing = makePairing(rawDuties,
                                   utcFromString("2025-03-01 00:30:00"),
                                   utcFromString("2025-03-02 22:30:00"));

        RuleInput input;
        input.dbRules.push_back(makeRule7466ControlRow("DEBRIEF"));
        input.dbRules.push_back(makeRule7466Row(1,
                                                "SIN",
                                                "*",
                                                "*",
                                                "0-99",
                                                "1-7",
                                                "392",
                                                "2025-03-02 22:45:00",
                                                "2025-03-02 23:15:00",
                                                1));

        CalculateExtraDaysOffAtBaseForSQRule rule(nullptr, input);
        rule.setDataContext(ctx);
        rule.setApplication(PAIRING_EDITOR);
        rule.CalculateDuty(pairing.get());

        EXPECT_EQ(0, lastDuty->getMinEXDO());
        EXPECT_EQ(2 * 24 * 60, lastDuty->getMinRestAtBase());
    }

    // Scenario B: Same period with TRANSPORT control still should not match because only pairing start is considered.
    {
        std::vector<std::unique_ptr<Segment>> segments;
        segments.push_back(makeSegment(6261, "100", "SIN", "SIN",
                                       "2025-03-01 01:00:00",
                                       "2025-03-01 05:00:00"));
        segments.push_back(makeSegment(6262, "392", "SIN", "SIN",
                                       "2025-03-02 18:00:00",
                                       "2025-03-02 22:00:00"));

        std::vector<std::unique_ptr<Duty>> duties;
        duties.push_back(makeDutyWithNodes({segments[0].get()},
                                            utcFromString("2025-03-01 00:30:00"),
                                            utcFromString("2025-03-01 05:30:00"),
                                            utcFromString("2025-03-01 06:00:00")));
        duties.push_back(makeDutyWithNodes({segments[1].get()},
                                            utcFromString("2025-03-02 17:30:00"),
                                            utcFromString("2025-03-02 22:30:00"),
                                            utcFromString("2025-03-02 23:30:00")));

        Duty* lastDuty = duties.back().get();
        lastDuty->setMinRest(2 * 24 * 60, true);
        lastDuty->setMinRestAtBase(2 * 24 * 60, true);
        lastDuty->setMinATDO(2, true);

        auto rawDuties = asRaw(duties);
        auto pairing = makePairing(rawDuties,
                                   utcFromString("2025-03-01 00:30:00"),
                                   utcFromString("2025-03-02 22:30:00"));

        RuleInput input;
        input.dbRules.push_back(makeRule7466ControlRow("TRANSPORT"));
        input.dbRules.push_back(makeRule7466Row(1,
                                                "SIN",
                                                "*",
                                                "*",
                                                "0-99",
                                                "1-7",
                                                "392",
                                                "2025-03-02 22:45:00",
                                                "2025-03-02 23:15:00",
                                                1));

        CalculateExtraDaysOffAtBaseForSQRule rule(nullptr, input);
        rule.setDataContext(ctx);
        rule.setApplication(PAIRING_EDITOR);
        rule.CalculateDuty(pairing.get());

        EXPECT_EQ(0, lastDuty->getMinEXDO());
        EXPECT_EQ(2 * 24 * 60, lastDuty->getMinRestAtBase());
    }
}

TEST_F(Rule7466Test, FlightOperatingDefaultsToAnyWhenColumnMissing) {
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(6301, "100", "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00",
                                   "FLY"));
    segments.push_back(makeSegment(6302, "392", "SIN", "SIN",
                                   "2025-03-05 06:30:00",
                                   "2025-03-05 09:00:00",
                                   "DHD"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()},
                                        utcFromString("2025-03-01 00:00:00"),
                                        utcFromString("2025-03-01 05:30:00"),
                                        utcFromString("2025-03-01 06:00:00")));
    duties.push_back(makeDutyWithNodes({segments[1].get()},
                                        utcFromString("2025-03-05 06:00:00"),
                                        utcFromString("2025-03-05 09:30:00"),
                                        utcFromString("2025-03-05 10:00:00")));

    Duty* lastDuty = duties.back().get();
    lastDuty->setMinRest(2 * 24 * 60, true);
    lastDuty->setMinRestAtBase(2 * 24 * 60, true);
    lastDuty->setMinATDO(2, true);

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:00:00"),
                               utcFromString("2025-03-05 10:00:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7466Row(1,
                                            "SIN",
                                            "*",
                                            "*",
                                            "0-99",
                                            "1-7",
                                            "392",
                                            "2025-03-01 00:00:00",
                                            "2025-03-31 00:00:00",
                                            1,
                                            1,
                                            ""));

    CalculateExtraDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (3 * 24 * 60) + (14 * 60);
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}

TEST_F(Rule7466Test, FlightOperatingYRequiresOperatingMatch) {
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(6401, "100", "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00",
                                   "FLY"));
    segments.push_back(makeSegment(6402, "392", "SIN", "SIN",
                                   "2025-03-05 06:30:00",
                                   "2025-03-05 09:00:00",
                                   "DHD"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()},
                                        utcFromString("2025-03-01 00:00:00"),
                                        utcFromString("2025-03-01 05:30:00"),
                                        utcFromString("2025-03-01 06:00:00")));
    duties.push_back(makeDutyWithNodes({segments[1].get()},
                                        utcFromString("2025-03-05 06:00:00"),
                                        utcFromString("2025-03-05 09:30:00"),
                                        utcFromString("2025-03-05 10:00:00")));

    Duty* lastDuty = duties.back().get();
    lastDuty->setMinRest(2 * 24 * 60, true);
    lastDuty->setMinRestAtBase(2 * 24 * 60, true);
    lastDuty->setMinATDO(2, true);

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:00:00"),
                               utcFromString("2025-03-05 10:00:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7466Row(1,
                                            "SIN",
                                            "*",
                                            "*",
                                            "0-99",
                                            "1-7",
                                            "392",
                                            "2025-03-01 00:00:00",
                                            "2025-03-31 00:00:00",
                                            1,
                                            1,
                                            "Y"));

    CalculateExtraDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    EXPECT_EQ(2 * 24 * 60, lastDuty->getMinRestAtBase());
    EXPECT_EQ(2 * 24 * 60, lastDuty->getMinRest());
}

TEST_F(Rule7466Test, FlightOperatingNMatchesNonOperatingFlight) {
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(6501, "100", "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00",
                                   "FLY"));
    segments.push_back(makeSegment(6502, "392", "SIN", "SIN",
                                   "2025-03-05 06:30:00",
                                   "2025-03-05 09:00:00",
                                   "DHD"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()},
                                        utcFromString("2025-03-01 00:00:00"),
                                        utcFromString("2025-03-01 05:30:00"),
                                        utcFromString("2025-03-01 06:00:00")));
    duties.push_back(makeDutyWithNodes({segments[1].get()},
                                        utcFromString("2025-03-05 06:00:00"),
                                        utcFromString("2025-03-05 09:30:00"),
                                        utcFromString("2025-03-05 10:00:00")));

    Duty* lastDuty = duties.back().get();
    lastDuty->setMinRest(2 * 24 * 60, true);
    lastDuty->setMinRestAtBase(2 * 24 * 60, true);
    lastDuty->setMinATDO(2, true);

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:00:00"),
                               utcFromString("2025-03-05 10:00:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7466Row(1,
                                            "SIN",
                                            "*",
                                            "*",
                                            "0-99",
                                            "1-7",
                                            "392",
                                            "2025-03-01 00:00:00",
                                            "2025-03-31 00:00:00",
                                            1,
                                            1,
                                            "N"));

    CalculateExtraDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (3 * 24 * 60) + (14 * 60);
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}
