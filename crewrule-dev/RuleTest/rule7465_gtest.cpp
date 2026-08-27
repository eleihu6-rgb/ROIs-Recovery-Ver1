#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7465/CalculateMinScheDaysOffAtBaseForSQRule.h"
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

void registerFlight(const SharedPtr<CrewDataContext>& ctx,
                    long long dbId,
                    const std::string& fleet,
                    const std::string& serviceType) {
    auto flight = std::make_shared<Segment>();
    flight->setDBId(dbId);
    flight->setFleetCD(fleet);
    flight->setServiceType(serviceType);
    ctx->flightIdMap[dbId] = flight;
}

std::unique_ptr<Segment> makeSegment(long long dbId,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    time_t start = utcFromString(startUtc);
    time_t end = utcFromString(endUtc);
    seg->setDBId(dbId);
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
    seg->setIsOperating(true);
    return seg;
}

void applyOffsetToSegment(Segment* segment, time_t offsetSec) {
    const time_t startUtc = segment->getStartTimeUtcAct();
    const time_t endUtc = segment->getEndTimeUtcAct();
    segment->setStartTimeLocAct(startUtc + offsetSec);
    segment->setEndTimeLocAct(endUtc + offsetSec);
    segment->setStartTimeLocSch(startUtc + offsetSec);
    segment->setEndTimeLocSch(endUtc + offsetSec);
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

void applyOffsetToDutyNodes(Duty* duty, time_t offsetSec) {
    for (const auto& node : duty->pairingDutyNodes) {
        const time_t startUtc = node->getStartTimeUtcAct();
        const time_t endUtc = node->getEndTimeUtcAct();
        node->setStartTimeLocAct(startUtc + offsetSec);
        node->setEndTimeLocAct(endUtc + offsetSec);
        node->setStartTimeLocSch(startUtc + offsetSec);
        node->setEndTimeLocSch(endUtc + offsetSec);
    }
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

DBRule makeRule7465Row(int rowNum,
                       const std::string& copRange,
                       const std::string& fleets,
                       const std::string& serviceType,
                       int minDaysOff,
                       const std::string& doStartsAfter = "",
                       const std::string& pairingLengthEndsAt = "",
                       int severity = 1) {
    DBRule row{};
    row.idRule = 7465001;
    row.function = 7465;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.severity = severity;
    row.overridebility = "S";
    row.reference = "Annex II(a)";
    row.idRuleParam = 7465001 + rowNum;
    row.params["COP LENGTH RANGE"] = copRange;
    row.params["FLEETS"] = fleets;
    row.params["SERVICE TYPE"] = serviceType;
    if (!doStartsAfter.empty()) {
        row.params["DO STARTS AFTER"] = doStartsAfter;
    }
    if (!pairingLengthEndsAt.empty()) {
        row.params["PAIRING LENGTH ENDS AT"] = pairingLengthEndsAt;
    }
    row.params["MIN DAYS OFF"] = std::to_string(minDaysOff);
    row.params["SEVERITY"] = std::to_string(severity);
    return row;
}

}  // namespace

class Rule7465Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

TEST_F(Rule7465Test, AppliesMinDaysOffWithMidnightRounding) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 5001, "777", "F");
    registerFlight(ctx, 5002, "777", "F");

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(5001, "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(5002, "SIN", "SIN",
                                   "2025-03-05 06:30:00",
                                   "2025-03-05 09:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()},
                                        utcFromString("2025-03-01 00:00:00"),
                                        utcFromString("2025-03-01 05:30:00"),
                                        utcFromString("2025-03-01 06:00:00")));
    duties.push_back(makeDutyWithNodes({segments[1].get()},
                                        utcFromString("2025-03-05 06:00:00"),
                                        utcFromString("2025-03-05 10:00:00"),
                                        utcFromString("2025-03-05 10:00:00")));

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:00:00"),
                               utcFromString("2025-03-05 10:00:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7465Row(1, "5-5", "777", "F", 2));

    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (2 * 24 * 60) + (14 * 60);
    Duty* lastDuty = duties.back().get();
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}

TEST_F(Rule7465Test, NoMatchLeavesMinRestUnset) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 5101, "777", "F");
    registerFlight(ctx, 5102, "777", "F");

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(5101, "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(5102, "SIN", "SIN",
                                   "2025-03-05 06:30:00",
                                   "2025-03-05 09:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()},
                                        utcFromString("2025-03-01 00:00:00"),
                                        utcFromString("2025-03-01 05:30:00"),
                                        utcFromString("2025-03-01 06:00:00")));
    duties.push_back(makeDutyWithNodes({segments[1].get()},
                                        utcFromString("2025-03-05 06:00:00"),
                                        utcFromString("2025-03-05 10:00:00"),
                                        utcFromString("2025-03-05 10:00:00")));

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:00:00"),
                               utcFromString("2025-03-05 10:00:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7465Row(1, "6-6", "777", "F", 2));

    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    Duty* lastDuty = duties.back().get();
    EXPECT_EQ(0, lastDuty->getMinRestAtBase());
    EXPECT_EQ(0, lastDuty->getMinRest());
}

TEST_F(Rule7465Test, AppliesMinDaysOffWithOffsetNonZeroRestStart) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 5201, "777", "F");
    registerFlight(ctx, 5202, "777", "F");

    const time_t offsetSec = 8 * 60 * 60;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(5201, "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(5202, "SIN", "SIN",
                                   "2025-03-05 12:30:00",
                                   "2025-03-05 14:30:00"));

    for (const auto& segment : segments) {
        applyOffsetToSegment(segment.get(), offsetSec);
    }

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithNodes({segments[0].get()},
                                        utcFromString("2025-03-01 00:00:00"),
                                        utcFromString("2025-03-01 05:30:00"),
                                        utcFromString("2025-03-01 06:00:00")));
    duties.push_back(makeDutyWithNodes({segments[1].get()},
                                        utcFromString("2025-03-05 12:00:00"),
                                        utcFromString("2025-03-05 15:30:00"),
                                        utcFromString("2025-03-05 18:30:00")));
    for (const auto& duty : duties) {
        applyOffsetToDutyNodes(duty.get(), offsetSec);
    }

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:00:00"),
                               utcFromString("2025-03-05 18:30:00"));
    pairing->setStartTimeLocAct(utcFromString("2025-03-01 00:00:00") + offsetSec);
    pairing->setEndTimeLocAct(utcFromString("2025-03-05 18:30:00") + offsetSec);

    RuleInput input;
    input.dbRules.push_back(makeRule7465Row(1, "5-5", "777", "F", 2));

    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (2 * 24 * 60) + (21 * 60) + 30;
    Duty* lastDuty = duties.back().get();
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}

TEST_F(Rule7465Test, UsesDebriefWhenDoStartsAfterDebrief) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 5201, "777", "F");
    registerFlight(ctx, 5202, "777", "F");

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(5201, "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(5202, "SIN", "SIN",
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

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:30:00"),
                               utcFromString("2025-03-02 23:30:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7465Row(1, "2-2", "777", "F", 1, "DEBRIEF"));

    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (24 * 60) + (30);
    Duty* lastDuty = duties.back().get();
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}

TEST_F(Rule7465Test, PairingLengthEndAnchorCanSwitchBetweenDebriefAndTransport) {
    auto buildPairing = [&]() {
        std::vector<std::unique_ptr<Segment>> segments;
        segments.push_back(makeSegment(5251, "SIN", "SIN",
                                       "2025-03-01 01:00:00",
                                       "2025-03-01 05:00:00"));
        segments.push_back(makeSegment(5252, "SIN", "SIN",
                                       "2025-03-06 18:00:00",
                                       "2025-03-06 22:00:00"));

        std::vector<std::unique_ptr<Duty>> duties;
        duties.push_back(makeDutyWithNodes({segments[0].get()},
                                           utcFromString("2025-03-01 00:00:00"),
                                           utcFromString("2025-03-01 05:30:00"),
                                           utcFromString("2025-03-01 06:00:00")));
        duties.push_back(makeDutyWithNodes({segments[1].get()},
                                           utcFromString("2025-03-06 17:30:00"),
                                           utcFromString("2025-03-06 23:30:00"),
                                           utcFromString("2025-03-07 01:30:00")));

        auto rawDuties = asRaw(duties);
        auto pairing = makePairing(rawDuties,
                                   utcFromString("2025-03-01 00:00:00"),
                                   utcFromString("2025-03-07 01:30:00"));
        return std::make_pair(std::move(segments), std::make_pair(std::move(duties), std::move(pairing)));
    };

    {
        auto ctx = buildDataContext();
        registerFlight(ctx, 5251, "777", "F");
        registerFlight(ctx, 5252, "777", "F");

        auto data = buildPairing();
        auto& duties = data.second.first;
        auto& pairing = data.second.second;

        RuleInput input;
        input.dbRules.push_back(makeRule7465Row(1, "6-6", "777", "F", 1, "", "DEBRIEF"));

        CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
        rule.setDataContext(ctx);
        rule.setApplication(PAIRING_EDITOR);
        rule.CalculateDuty(pairing.get());

        EXPECT_GT(duties.back()->getMinRestAtBase(), 0);
        EXPECT_GT(duties.back()->getMinRest(), 0);
    }

    {
        auto ctx = buildDataContext();
        registerFlight(ctx, 5251, "777", "F");
        registerFlight(ctx, 5252, "777", "F");

        auto data = buildPairing();
        auto& duties = data.second.first;
        auto& pairing = data.second.second;

        RuleInput input;
        input.dbRules.push_back(makeRule7465Row(1, "6-6", "777", "F", 1, "", "TRANSPORT"));

        CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
        rule.setDataContext(ctx);
        rule.setApplication(PAIRING_EDITOR);
        rule.CalculateDuty(pairing.get());

        EXPECT_EQ(0, duties.back()->getMinRestAtBase());
        EXPECT_EQ(0, duties.back()->getMinRest());
    }
}

TEST_F(Rule7465Test, ServiceTypeWildcardMatchesPassengerPairing) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 5301, "777", "J");
    registerFlight(ctx, 5302, "777", "J");

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(5301, "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(5302, "SIN", "SIN",
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

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:30:00"),
                               utcFromString("2025-03-02 23:30:00"));

    RuleInput input;
    input.dbRules.push_back(makeRule7465Row(1, "2-2", "*", "*", 1));

    CalculateMinScheDaysOffAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (24 * 60) + 30;
    Duty* lastDuty = duties.back().get();
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}

TEST_F(Rule7465Test, ServiceTypeMixedOperatingIsPassenger) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 5401, "777", "F");
    registerFlight(ctx, 5402, "777", "J");

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(5401, "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(5402, "SIN", "SIN",
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

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:30:00"),
                               utcFromString("2025-03-02 23:30:00"));

    RuleInput inputF;
    inputF.dbRules.push_back(makeRule7465Row(1, "2-2", "*", "F", 1));

    CalculateMinScheDaysOffAtBaseForSQRule ruleF(nullptr, inputF);
    ruleF.setDataContext(ctx);
    ruleF.setApplication(PAIRING_EDITOR);
    ruleF.CalculateDuty(pairing.get());

    Duty* lastDuty = duties.back().get();
    EXPECT_EQ(0, lastDuty->getMinRestAtBase());
    EXPECT_EQ(0, lastDuty->getMinRest());

    RuleInput inputJ;
    inputJ.dbRules.push_back(makeRule7465Row(1, "2-2", "*", "J", 1));

    CalculateMinScheDaysOffAtBaseForSQRule ruleJ(nullptr, inputJ);
    ruleJ.setDataContext(ctx);
    ruleJ.setApplication(PAIRING_EDITOR);
    ruleJ.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (24 * 60) + 30;
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}

TEST_F(Rule7465Test, FleetFilterRequiresAllOperatingFleets) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 5501, "777", "J");
    registerFlight(ctx, 5502, "330", "J");

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(5501, "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(5502, "SIN", "SIN",
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

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:30:00"),
                               utcFromString("2025-03-02 23:30:00"));

    RuleInput inputSingleFleet;
    inputSingleFleet.dbRules.push_back(makeRule7465Row(1, "2-2", "777", "*", 1));

    CalculateMinScheDaysOffAtBaseForSQRule ruleSingle(nullptr, inputSingleFleet);
    ruleSingle.setDataContext(ctx);
    ruleSingle.setApplication(PAIRING_EDITOR);
    ruleSingle.CalculateDuty(pairing.get());

    Duty* lastDuty = duties.back().get();
    EXPECT_EQ(0, lastDuty->getMinRestAtBase());
    EXPECT_EQ(0, lastDuty->getMinRest());

    RuleInput inputBothFleets;
    inputBothFleets.dbRules.push_back(makeRule7465Row(1, "2-2", "777|330", "*", 1));

    CalculateMinScheDaysOffAtBaseForSQRule ruleBoth(nullptr, inputBothFleets);
    ruleBoth.setDataContext(ctx);
    ruleBoth.setApplication(PAIRING_EDITOR);
    ruleBoth.CalculateDuty(pairing.get());

    const int expectedMinRestMinutes = (24 * 60) + 30;
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(expectedMinRestMinutes, lastDuty->getMinRest());
}
