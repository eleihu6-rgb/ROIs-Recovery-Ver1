#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7467/LimitRestTimeBetweenFlightsForSQRule.h"
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
                                     const std::string& flightNumber,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);

    seg->setDBId(dbId);
    seg->setPairingId(pairingId);
    seg->setDutyId(dutyId);
    seg->setDutySeq(dutySeq);
    seg->setSegmentId(dbId);
    seg->setFlightNumber(flightNumber);
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

DBRule makeRule7467Row(int rowNum,
                       const std::string& type,
                       const std::string& flightNoA,
                       const std::string& depArrA,
                       const std::string& flightNoB,
                       const std::string& depArrB,
                       const std::string& minLimit,
                       const std::string& maxLimit,
                       int penalty,
                       const std::string& active,
                       const std::string& comment,
                       int severity = 1) {
    DBRule row{};
    row.idRule = 7467;
    row.function = 7467;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.severity = severity;
    row.overridebility = "S";
    row.reference = "SQ 7467";
    row.idRuleParam = 7467000 + rowNum;
    row.params["TYPE"] = type;
    row.params["FLIGHT NO A"] = flightNoA;
    row.params["DEP-ARR A"] = depArrA;
    row.params["FLIGHT NO B"] = flightNoB;
    row.params["DEP-ARR B"] = depArrB;
    row.params["MIN TIME LIMIT"] = minLimit;
    row.params["MAX TIME LIMIT"] = maxLimit;
    row.params["PENALTY"] = std::to_string(penalty);
    row.params["ACTIVE(Y/N)"] = active;
    row.params["COMMENT"] = comment;
    row.params["SEVERITY"] = std::to_string(severity);
    return row;
}

std::unique_ptr<LimitRestTimeBetweenFlightsForSQRule> makeRule7467(const RuleInput& input,
                                                                   std::vector<std::string>* violationMessages,
                                                                   std::vector<RULE_VIOLATION*>* violations) {
    auto rule = std::make_unique<LimitRestTimeBetweenFlightsForSQRule>(nullptr, input);
    rule->setApplication(PAIRING_EDITOR);
    rule->setViolations(violationMessages);
    rule->setRuleViolation(violations);
    return rule;
}

}  // namespace

class Rule7467Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

TEST_F(Rule7467Test, Before_MinRestViolation_PenaltyZeroStillCreatesViolation) {
    constexpr long long pairingId = 10001;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(1,
                                   pairingId,
                                   501,
                                   1,
                                   "100",
                                   "SIN",
                                   "SHJ",
                                   "2025-02-28 20:00:00",
                                   "2025-03-01 00:00:00"));
    segments.push_back(makeSegment(2,
                                   pairingId,
                                   502,
                                   2,
                                   "7366",
                                   "SHJ",
                                   "BRU",
                                   "2025-03-01 07:59:00",
                                   "2025-03-01 12:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 501));
    duties.push_back(makeDuty({segments[1].get()}, 502));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7467Row(1,
                                            "BEFORE",
                                            "7366",
                                            "SHJ-BRU",
                                            "*",
                                            "*",
                                            "08:00",
                                            "12:00",
                                            0,
                                            "Y",
                                            "min rest before flight"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7467(input, &violationMessages, &violations);

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(1u, violations.size());
    EXPECT_EQ(7467u, violations[0]->idRule);
    EXPECT_EQ(segments[0]->getEndTimeUtcAct(), violations[0]->startDTUtc);
    EXPECT_EQ(segments[1]->getStartTimeUtcAct(), violations[0]->endDTUtc);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7467Test, After_MaxRestViolation) {
    constexpr long long pairingId = 10002;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(11,
                                   pairingId,
                                   601,
                                   1,
                                   "7366",
                                   "SHJ",
                                   "BRU",
                                   "2025-03-01 06:00:00",
                                   "2025-03-01 10:00:00"));
    segments.push_back(makeSegment(12,
                                   pairingId,
                                   602,
                                   2,
                                   "9999",
                                   "BRU",
                                   "SIN",
                                   "2025-03-01 22:01:00",
                                   "2025-03-02 02:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 601));
    duties.push_back(makeDuty({segments[1].get()}, 602));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7467Row(1,
                                            "AFTER",
                                            "7366",
                                            "SHJ-BRU",
                                            "*",
                                            "*",
                                            "00:00",
                                            "12:00",
                                            5,
                                            "Y",
                                            "max rest after flight"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7467(input, &violationMessages, &violations);

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(1u, violations.size());
    EXPECT_EQ(segments[0]->getEndTimeUtcAct(), violations[0]->startDTUtc);
    EXPECT_EQ(segments[1]->getStartTimeUtcAct(), violations[0]->endDTUtc);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7467Test, Conn_FiltersBAndMismatchSkipsCheck) {
    constexpr long long pairingId = 10003;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(21,
                                   pairingId,
                                   701,
                                   1,
                                   "7366",
                                   "SHJ",
                                   "BRU",
                                   "2025-03-01 06:00:00",
                                   "2025-03-01 10:00:00"));
    // Rest is only 10 minutes, would violate if CONN check applied.
    segments.push_back(makeSegment(22,
                                   pairingId,
                                   702,
                                   2,
                                   "9999",
                                   "BRU",
                                   "SIN",
                                   "2025-03-01 10:10:00",
                                   "2025-03-01 14:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 701));
    duties.push_back(makeDuty({segments[1].get()}, 702));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7467Row(1,
                                            "CONN",
                                            "7366",
                                            "SHJ-BRU",
                                            "1234",
                                            "BRU-SIN",
                                            "00:30",
                                            "02:00",
                                            1,
                                            "Y",
                                            "forced connection for specific B"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7467(input, &violationMessages, &violations);

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
}

TEST_F(Rule7467Test, Conn_IgnoresBWhenWildcardAndDetectsViolation) {
    constexpr long long pairingId = 10004;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(31,
                                   pairingId,
                                   801,
                                   1,
                                   "7366",
                                   "SHJ",
                                   "BRU",
                                   "2025-03-01 06:00:00",
                                   "2025-03-01 10:00:00"));
    segments.push_back(makeSegment(32,
                                   pairingId,
                                   802,
                                   2,
                                   "9999",
                                   "BRU",
                                   "SIN",
                                   "2025-03-01 10:10:00",
                                   "2025-03-01 14:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 801));
    duties.push_back(makeDuty({segments[1].get()}, 802));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7467Row(1,
                                            "CONN",
                                            "7366",
                                            "SHJ-BRU",
                                            "*",
                                            "*",
                                            "00:30",
                                            "02:00",
                                            0,
                                            "Y",
                                            "forced connection regardless of B"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7467(input, &violationMessages, &violations);

    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(1u, violations.size());
    EXPECT_EQ(segments[0]->getEndTimeUtcAct(), violations[0]->startDTUtc);
    EXPECT_EQ(segments[1]->getStartTimeUtcAct(), violations[0]->endDTUtc);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7467Test, InactiveRowIgnored) {
    constexpr long long pairingId = 10005;

    std::vector<std::unique_ptr<Segment>> segments;
    segments.push_back(makeSegment(41,
                                   pairingId,
                                   901,
                                   1,
                                   "100",
                                   "SIN",
                                   "SHJ",
                                   "2025-02-28 20:00:00",
                                   "2025-03-01 00:00:00"));
    segments.push_back(makeSegment(42,
                                   pairingId,
                                   902,
                                   2,
                                   "7366",
                                   "SHJ",
                                   "BRU",
                                   "2025-03-01 07:00:00",
                                   "2025-03-01 12:00:00"));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({segments[0].get()}, 901));
    duties.push_back(makeDuty({segments[1].get()}, 902));
    auto pairing = makePairing(asRaw(duties),
                               pairingId,
                               segments.front()->getStartTimeUtcAct(),
                               segments.back()->getEndTimeUtcAct());

    RuleInput input;
    input.dbRules.push_back(makeRule7467Row(1,
                                            "BEFORE",
                                            "7366",
                                            "SHJ-BRU",
                                            "*",
                                            "*",
                                            "08:00",
                                            "12:00",
                                            0,
                                            "N",
                                            "inactive row should be skipped"));

    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    auto rule = makeRule7467(input, &violationMessages, &violations);

    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(violations.empty());
}

