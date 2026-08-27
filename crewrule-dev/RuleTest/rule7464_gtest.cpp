#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7464/LimitTransportLengthForSQRule.h"
#include "db/Duty.h"
#include "db/Pairing.h"
#include "db/RuleParams.h"
#include "db/Segment.h"
#include "orUtil/UtilFunc.h"

#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

std::unique_ptr<Segment> makeSegment(long long dbId,
                                     long long pairingId,
                                     long long dutyId,
                                     int dutySeq,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& assignment,
                                     const std::string& serviceType = "F",
                                     const std::string& flightFlag = "",
                                     const std::string& fltType = "") {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);

    seg->setDBId(dbId);
    seg->setPairingId(pairingId);
    seg->setDutyId(dutyId);
    seg->setDutySeq(dutySeq);
    seg->setSegmentId(dbId);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setAssignment(assignment);
    seg->setServiceType(serviceType);
    seg->setFleetCD("744F");
    if (!flightFlag.empty()) {
        seg->setFlightFlag(flightFlag);
    }
    if (!fltType.empty()) {
        seg->setFltType(fltType);
    }
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeLocSch(start);
    seg->setEndTimeLocSch(end);
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments, long long dutyId) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setId(dutyId);
    if (!segments.empty()) {
        duty->setDepartureStation(segments.front()->getDepSta());
        duty->setArrivalStation(segments.back()->getArrSta());
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
    }
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
                                     long long pairingId,
                                     time_t startUtc,
                                     time_t endUtc) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setDbId(pairingId);
    pairing->setBase("SIN");
    pairing->setPrimeActivity("FLY");
    pairing->setStartTimeUtcAct(startUtc);
    pairing->setStartTimeLocAct(startUtc);
    pairing->setEndTimeUtcAct(endUtc);
    pairing->setEndTimeLocAct(endUtc);
    return pairing;
}

DBRule makeRule7464Row(int rowNum,
                       const std::string& serviceType,
                       const std::string& fleetGroup,
                       const std::string& flightFlags,
                       const std::string& flightAssignments,
                       const std::string& allowedRoutes,
                       const std::string& maxTransportLength,
                       int severity = 1) {
    DBRule row{};
    row.idRule = 7464;
    row.function = 7464;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.severity = severity;
    row.overridebility = "S";
    row.reference = "SQ 7464";
    row.idRuleParam = 7464000 + rowNum;
    row.params["SERVICE TYPE"] = serviceType;
    row.params["FLEET GROUP"] = fleetGroup;
    row.params["FLIGHT FLAGS"] = flightFlags;
    row.params["FLIGHT ASSIGNMENTS"] = flightAssignments;
    row.params["EXCEPTION FLIGHT ROUTES"] = allowedRoutes;
    row.params["MAX TRANSPORT LENGTH"] = maxTransportLength;
    row.params["SEVERITY"] = std::to_string(severity);
    return row;
}

std::unique_ptr<LimitTransportLengthForSQRule> makeRule7464(const RuleInput& input,
                                                            std::vector<std::string>* violationMessages,
                                                            std::vector<RULE_VIOLATION*>* violations) {
    auto rule = std::make_unique<LimitTransportLengthForSQRule>(nullptr, input);
    rule->setApplication(PAIRING_EDITOR);
    rule->setViolations(violationMessages);
    rule->setRuleViolation(violations);
    return rule;
}

}  // namespace

class Rule7464Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

TEST_F(Rule7464Test, NotAllowedRouteWarnsEvenWhenWithinLimit) {
    constexpr long long pairingId = 20001;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(1,
                                   pairingId,
                                   601,
                                   1,
                                   "SIN",
                                   "BKK",
                                   "2025-03-01 01:00:00",
                                   "2025-03-01 02:00:00",
                                   "BUS"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 601));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7464Row(1,
                                            "*",
                                            "*",
                                            "*",
                                            "BUS",
                                            "BSL-ZRH|AUH-DXB",
                                            "02:30"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7464(input, &violationMessages, &violations);

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(1u, violations.size());
    EXPECT_EQ(segments[0]->getDBId(), violations[0]->segmentId);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7464Test, AllowedRouteWithinLimitPasses) {
    constexpr long long pairingId = 20002;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(2,
                                   pairingId,
                                   701,
                                   1,
                                   "SIN",
                                   "BKK",
                                   "2025-03-02 01:00:00",
                                   "2025-03-02 03:00:00",
                                   "BUS"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 701));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7464Row(1,
                                            "*",
                                            "*",
                                            "*",
                                            "BUS",
                                            "SIN-BKK",
                                            "02:30"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7464(input, &violationMessages, &violations);

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
}

TEST_F(Rule7464Test, AllowedRouteOverLimitWarns) {
    constexpr long long pairingId = 20003;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(3,
                                   pairingId,
                                   801,
                                   1,
                                   "SIN",
                                   "BKK",
                                   "2025-03-03 01:00:00",
                                   "2025-03-03 04:00:00",
                                   "BUS"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 801));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7464Row(1,
                                            "*",
                                            "*",
                                            "*",
                                            "BUS",
                                            "SIN-BKK",
                                            "02:30"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7464(input, &violationMessages, &violations);

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(1u, violations.size());
    EXPECT_EQ(segments[0]->getDBId(), violations[0]->segmentId);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7464Test, FlightFlagFallsBackToSegmentWhenFlightLookupMissing) {
    constexpr long long pairingId = 20004;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(4,
                                   pairingId,
                                   901,
                                   1,
                                   "AUH",
                                   "DXB",
                                   "2025-03-04 01:00:00",
                                   "2025-03-04 04:00:00",
                                   "TRAIN",
                                   "J",
                                   "D"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 901));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7464Row(1,
                                            "J",
                                            "*",
                                            "D",
                                            "BUS|HSR|TRAIN",
                                            "AUH-DXB",
                                            "02:30"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7464(input, &violationMessages, &violations);

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(1u, violations.size());
    EXPECT_EQ(segments[0]->getDBId(), violations[0]->segmentId);
    EXPECT_NE(violations[0]->violation_msg.find("Transport period"), std::string::npos);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7464Test, ServiceTypeFallsBackToFltTypeWhenServiceTypeMissing) {
    constexpr long long pairingId = 20005;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(5,
                                   pairingId,
                                   1001,
                                   1,
                                   "AUH",
                                   "DXB",
                                   "2025-03-05 01:00:00",
                                   "2025-03-05 04:00:00",
                                   "TRAIN",
                                   "",
                                   "D",
                                   "J"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 1001));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7464Row(1,
                                            "J",
                                            "*",
                                            "*",
                                            "BUS|HSR|TRAIN",
                                            "AUH-DXB",
                                            "02:30"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7464(input, &violationMessages, &violations);

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(1u, violations.size());
    EXPECT_EQ(segments[0]->getDBId(), violations[0]->segmentId);
    EXPECT_NE(violations[0]->violation_msg.find("Transport period"), std::string::npos);

    for (auto* rv : violations) {
        delete rv;
    }
}

