#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7465/CalculateMinScheDaysOffAtBaseForSQRule.h"
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
    return std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
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
                                     const std::string& flightNumber,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setDBId(dbId);
    seg->setFlightNumber(flightNumber);
    seg->setAssignment("FLY");
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

DBRule makeRule7465Row(int rowNum,
                       const std::string& copRange,
                       const std::string& fleets,
                       const std::string& serviceType,
                       int minDaysOff,
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
    row.params["MIN DAYS OFF"] = std::to_string(minDaysOff);
    row.params["SEVERITY"] = std::to_string(severity);
    return row;
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

}  // namespace

class Rule7465_7466CombinedTest : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

TEST_F(Rule7465_7466CombinedTest, PostPairingRestIsAtdoPlusExdoWhenBothRulesMatch) {
    auto ctx = buildDataContext();
    registerFlight(ctx, 7001, "777", "F");
    registerFlight(ctx, 7002, "777", "F");

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(7001, "100", "SIN", "SIN",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 05:00:00"));
    segments.push_back(makeSegment(7002, "392", "SIN", "SIN",
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

    auto rawDuties = asRaw(duties);
    auto pairing = makePairing(rawDuties,
                               utcFromString("2025-03-01 00:00:00"),
                               utcFromString("2025-03-05 10:00:00"));

    RuleInput input7465;
    input7465.dbRules.push_back(makeRule7465Row(1, "5-5", "777", "F", 2));
    CalculateMinScheDaysOffAtBaseForSQRule rule7465(nullptr, input7465);
    rule7465.setDataContext(ctx);
    rule7465.setApplication(PAIRING_EDITOR);
    rule7465.CalculateDuty(pairing.get());

    Duty* lastDuty = duties.back().get();
    const int atdoExpectedMinutes = (2 * 24 * 60) + (14 * 60);
    EXPECT_EQ(atdoExpectedMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(atdoExpectedMinutes, lastDuty->getMinRest());

    RuleInput input7466;
    input7466.dbRules.push_back(makeRule7466Row(1,
                                                "SIN",
                                                "*",
                                                "*",
                                                "0-99",
                                                "1-7",
                                                "392",
                                                "2025-03-01 00:00:00",
                                                "2025-03-31 00:00:00",
                                                1));
    CalculateExtraDaysOffAtBaseForSQRule rule7466(nullptr, input7466);
    rule7466.setDataContext(ctx);
    rule7466.setApplication(PAIRING_EDITOR);
    rule7466.CalculateDuty(pairing.get());

    const int combinedExpectedMinutes = (3 * 24 * 60) + (14 * 60);
    EXPECT_EQ(combinedExpectedMinutes, lastDuty->getMinRestAtBase());
    EXPECT_EQ(combinedExpectedMinutes, lastDuty->getMinRest());
}
