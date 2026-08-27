#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <thread>
#include <tuple>
#include <vector>
#include <atomic>

#include "RuleEngine/rule/rule7435/MinPairingDaysForUlrStandbyRule.h"

#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/AirportDefaultTmOffset.h"

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);

    struct AirportConfig {
        const char* code;
        int utcOffsetMinutes;
        const char* zoneId;
    };

    const AirportConfig airports[] = {
        {"SIN", 480,  "Asia/Singapore"},
        {"JFK", -300, "America/New_York"},
        {"NRT", 480,  "Asia/Japan"},
    };

    for (const auto& airport : airports) {        
        ctx->airportUtcOffsetMap[airport.code] = airport.utcOffsetMinutes;
        ctx->airportZoneIdMap[airport.code] = airport.zoneId;
    }

    return ctx;
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    return seg;
}

std::unique_ptr<Duty> makeDutyWithSegments(const std::vector<Segment*>& segments,
                                           const std::string& assignment,
                                           long fdpMinutes) {
    auto duty = std::make_unique<Duty>(segments);
    if (!segments.empty()) {
        duty->setDepartureStation(segments.front()->getDepSta());
        duty->setArrivalStation(segments.back()->getArrSta());
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
        duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch());
        duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch());
    }
    duty->setAssignment(assignment);
    duty->setFDPInSecs(fdpMinutes * 60);
    return duty;
}

std::unique_ptr<Duty> makeSimpleDuty(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& assignment) {
    auto duty = std::make_unique<Duty>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    duty->setStartTimeUtcAct(start);
    duty->setEndTimeUtcAct(end);
    duty->setStartTimeLocAct(start);
    duty->setEndTimeLocAct(end);
    duty->setStartTimeUtcSch(start);
    duty->setEndTimeUtcSch(end);
    duty->setDepartureStation(dep);
    duty->setArrivalStation(arr);
    duty->setAssignment(assignment);
    return duty;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties,
                                     const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    if (!duties.empty()) {
        const Duty* first = duties.front();
        const Duty* last = duties.back();
        pairing->setStartTimeUtcAct(first->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct());
        pairing->setStartTimeLocAct(first->getStartTimeLocAct());
        pairing->setEndTimeLocAct(last->getEndTimeLocAct());
        pairing->setStartTimeUtcSch(first->getStartTimeUtcSch());
        pairing->setEndTimeUtcSch(last->getEndTimeUtcSch());
    }
    return pairing;
}

void addAirport(SharedPtr<CrewDataContext>& ctx,
                const std::string& code,
                const std::string& country,
                int offsetMinutes) {
    DBAirport airport{};
    std::strncpy(airport.airport, code.c_str(), sizeof(airport.airport) - 1);
    std::strncpy(airport.country, country.c_str(), sizeof(airport.country) - 1);
    ctx->airportList.push_back(airport);
    ctx->airportUtcOffsetMap[code] = offsetMinutes;
}

DBRule makeMainRuleRow(int rowNum,
                       const std::string& serviceType,
                       const std::string& fleetGroup,
                       const std::string& hasUlr,
                       const std::string& layoverAirport,
                       const std::string& layoverCountry,
                       const std::string& assignment,
                       int minDays,
                       const std::string& pairingLengthEndsAt = "") {
    DBRule rule{};
    rule.idRule = 7435001;
    rule.function = 7435;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 208174350 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SQ";
    rule.category = "Pairing";
    rule.params["SERVICE TYPE"] = serviceType;
    rule.params["FLEET GROUP"] = fleetGroup;
    rule.params["HAS ULR DUTY"] = hasUlr;
    rule.params["LAYOVER AIRPORT"] = layoverAirport;
    rule.params["LAYOVER COUNTRY"] = layoverCountry;
    rule.params["HAS DUTY ASSIGNMENT"] = assignment;
    rule.params["MIN PAIRING DAYS"] = std::to_string(minDays);
    if (!pairingLengthEndsAt.empty()) {
        rule.params["PAIRING LENGTH ENDS AT"] = pairingLengthEndsAt;
    }
    return rule;
}

}  // namespace

class Rule7435Test : public ::testing::Test {
protected:
    void TearDown() override { clearViolations(); }

    void clearViolations() {
        for (auto* rv : _violations) {
            delete rv;
        }
        _violations.clear();
        _violationMessages.clear();
    }

    void configureRule(MinPairingDaysForUlrStandbyRule& rule,
                       const SharedPtr<CrewDataContext>& ctx) {
        rule.setDataContext(ctx);
        rule.setApplication(PAIRING_EDITOR);
        rule.setRuleViolation(&_violations);
        rule.setViolations(&_violationMessages);
    }

    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
};

TEST_F(Rule7435Test, ViolatesWhenSpanShortWithUlrAndStandby) {
    auto ctx = buildDataContext();

    std::vector<DBRule> ruleRows;
    ruleRows.push_back(makeMainRuleRow(1, "*", "*", "Y", "*", "*", "SBY", 6));

    RuleInput input;
    input.dbRules = ruleRows;
    MinPairingDaysForUlrStandbyRule rule(nullptr, input);
    configureRule(rule, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<Segment*> segs;
    segStore.push_back(makeSegment("SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 19:00:00"));
    segs.push_back(segStore.back().get());

    auto ulrDuty = makeDutyWithSegments(segs, "FLY", 19 * 60);
    ulrDuty->setULR(true);
    auto standbyDuty =
        makeSimpleDuty("JFK", "JFK", "2025-01-03 00:00:00", "2025-01-03 06:00:00", "SBY");

    std::vector<std::unique_ptr<Segment>> segStore2;
    std::vector<Segment*> segs2;
    segStore2.push_back(makeSegment("JFK", "SIN", "2025-01-03 19:00:00", "2025-01-05 14:00:00"));
    segs2.push_back(segStore2.back().get());

	// pairing start 2025-01-01 08:00:00 local (SIN, UTC+8)
	// pairing end   2025-01-05 22:00:00 local (SIN, UTC+8)

    auto ulrDuty2 = makeDutyWithSegments(segs2, "FLY", 19 * 60);
    ulrDuty2->setULR(true);

    std::vector<Duty*> duties{ulrDuty.get(), standbyDuty.get(), ulrDuty2.get()};
    auto pairing = makePairing(duties, "SIN");

    EXPECT_FALSE(rule.CheckRule(pairing.get()));
    ASSERT_EQ(_violations.size(), 1u);
    EXPECT_NE(_violations.front()->violation_msg.find("[SQ][Pairing]"), std::string::npos);
}

TEST_F(Rule7435Test, PassesWhenSpanMeetsMinimum) {
    auto ctx = buildDataContext();

    std::vector<DBRule> ruleRows;
    ruleRows.push_back(makeMainRuleRow(1, "*", "*", "Y", "*", "*", "SBY", 6));

    RuleInput input;
    input.dbRules = ruleRows;
    MinPairingDaysForUlrStandbyRule rule(nullptr, input);
    configureRule(rule, ctx);

    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<Segment*> segs;
    segStore.push_back(makeSegment("SIN", "JFK", "2025-02-01 00:00:00", "2025-02-01 19:00:00"));
    segs.push_back(segStore.back().get());

    auto ulrDuty = makeDutyWithSegments(segs, "FLY", 19 * 60);
    ulrDuty->setULR(true);
    auto standbyDuty =
        makeSimpleDuty("JFK", "JFK", "2025-02-03 00:00:00", "2025-02-03 06:00:00", "SBY");

    std::vector<std::unique_ptr<Segment>> segStore2;
    std::vector<Segment*> segs2;
    segStore2.push_back(makeSegment("JFK", "SIN", "2025-02-06 00:00:00", "2025-02-06 19:00:00"));
    segs2.push_back(segStore2.back().get());
    auto ulrDuty2 = makeDutyWithSegments(segs2, "FLY", 19 * 60);
    ulrDuty2->setULR(true);

    std::vector<Duty*> duties{ulrDuty.get(), standbyDuty.get(), ulrDuty2.get()};
    auto pairing = makePairing(duties, "SIN");

    // pairing start 2025-02-01 08:00:00 local (SIN, UTC+8)
    // pairing end   2025-02-07 03:00:00 local (SIN, UTC+8)

    EXPECT_TRUE(rule.CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Rule7435Test, PairingLengthEndAnchorCanSwitchBetweenDebriefAndTransport) {
    auto buildPairing = [&]() {
        auto ulrDuty1 = makeSimpleDuty("SIN",
                                       "JFK",
                                       "2025-01-01 13:00:00",
                                       "2025-01-01 23:00:00",
                                       "FLY");
        ulrDuty1->setULR(true);

        auto standbyDuty = makeSimpleDuty("JFK",
                                          "JFK",
                                          "2025-01-03 00:00:00",
                                          "2025-01-03 06:00:00",
                                          "SBY");

        auto ulrDuty2 = makeSimpleDuty("JFK",
                                       "SIN",
                                       "2025-01-06 13:00:00",
                                       "2025-01-07 04:30:00",
                                       "FLY");
        ulrDuty2->setULR(true);
        ulrDuty2->setMinDropoff(120);
        ulrDuty2->setActualDropoffMin(120);

        std::vector<Duty*> duties{ulrDuty1.get(), standbyDuty.get(), ulrDuty2.get()};
        auto pairing = makePairing(duties, "JFK");
        return std::make_pair(std::move(pairing),
                              std::make_tuple(std::move(ulrDuty1),
                                              std::move(standbyDuty),
                                              std::move(ulrDuty2)));
    };

    {
        auto ctx = buildDataContext();
        RuleInput input;
        input.dbRules.push_back(makeMainRuleRow(1, "*", "*", "Y", "*", "*", "SBY", 7, "DEBRIEF"));

        MinPairingDaysForUlrStandbyRule rule(nullptr, input);
        configureRule(rule, ctx);

        auto data = buildPairing();
        auto& pairing = data.first;

        EXPECT_FALSE(rule.CheckRule(pairing.get()));
        ASSERT_EQ(_violations.size(), 1u);
        clearViolations();
    }

    {
        auto ctx = buildDataContext();
        RuleInput input;
        input.dbRules.push_back(makeMainRuleRow(1, "*", "*", "Y", "*", "*", "SBY", 7, "TRANSPORT"));

        MinPairingDaysForUlrStandbyRule rule(nullptr, input);
        configureRule(rule, ctx);

        auto data = buildPairing();
        auto& pairing = data.first;

        EXPECT_TRUE(rule.CheckRule(pairing.get()));
        EXPECT_TRUE(_violations.empty());
    }
}

TEST_F(Rule7435Test, CountryFilterAppliesToLayover) {
    auto ctx = buildDataContext();

    std::vector<DBRule> ruleRows;
    ruleRows.push_back(makeMainRuleRow(1, "*", "*", "*", "*", "US", "SBY", 6));

    RuleInput input;
    input.dbRules = ruleRows;
    MinPairingDaysForUlrStandbyRule rule(nullptr, input);
    configureRule(rule, ctx);

    // Layover in US -> matches and violates due to short span
    {
        std::vector<std::unique_ptr<Segment>> segStore;
        std::vector<Segment*> segs;
        segStore.push_back(
            makeSegment("SIN", "JFK", "2025-03-01 00:00:00", "2025-03-01 16:00:00"));
        segs.push_back(segStore.back().get());
        auto ulrDuty = makeDutyWithSegments(segs, "FLY", 16 * 60);
        ulrDuty->setULR(true);
        auto standbyDuty =
            makeSimpleDuty("JFK", "JFK", "2025-03-04 00:00:00", "2025-03-04 06:00:00", "SBY");

        std::vector<std::unique_ptr<Segment>> segStore2;
        std::vector<Segment*> segs2;
        segStore2.push_back(makeSegment("JFK", "SIN", "2025-01-06 00:00:00", "2025-01-06 16:00:00"));
        segs2.push_back(segStore2.back().get());
        auto ulrDuty2 = makeDutyWithSegments(segs2, "FLY", 16 * 60);
        ulrDuty2->setULR(true);

        std::vector<Duty*> duties{ulrDuty.get(), standbyDuty.get()};
        auto pairing = makePairing(duties, "SIN");

        EXPECT_FALSE(rule.CheckRule(pairing.get()));
        ASSERT_EQ(_violations.size(), 1u);
        clearViolations();
    }

    // Layover outside US -> rule skipped
    {
        _violations.clear();
        _violationMessages.clear();
        std::vector<std::unique_ptr<Segment>> segStore;
        std::vector<Segment*> segs;
        segStore.push_back(
            makeSegment("SIN", "NRT", "2025-04-01 00:00:00", "2025-04-01 19:00:00"));
        segs.push_back(segStore.back().get());
        auto ulrDuty = makeDutyWithSegments(segs, "FLY", 19 * 60);
        ulrDuty->setULR(true);
        auto standbyDuty =
            makeSimpleDuty("NRT", "NRT", "2025-04-04 00:00:00", "2025-04-05 00:00:00", "SBY");
        
        std::vector<std::unique_ptr<Segment>> segStore2;
        std::vector<Segment*> segs2;
        segStore2.push_back(makeSegment("NRT", "SIN", "2025-04-06 00:00:00", "2025-04-06 19:00:00"));
        segs2.push_back(segStore2.back().get());
        auto ulrDuty2 = makeDutyWithSegments(segs2, "FLY", 19 * 60);
        ulrDuty2->setULR(true);

        std::vector<Duty*> duties{ulrDuty.get(), standbyDuty.get()};
        auto pairing = makePairing(duties, "SIN");

        EXPECT_TRUE(rule.CheckRule(pairing.get()));
        EXPECT_TRUE(_violations.empty());
    }
}

TEST_F(Rule7435Test, MultiThreadedCheckRuleConsistent) {
    auto ctx = buildDataContext();

    std::vector<DBRule> ruleRows;
    ruleRows.push_back(makeMainRuleRow(1, "*", "*", "Y", "*", "*", "SBY", 6));

    RuleInput input;
    input.dbRules = ruleRows;
    MinPairingDaysForUlrStandbyRule rule(nullptr, input);
    configureRule(rule, ctx);
    rule.setApplication(PAIRING_OPTIMIZER);

    // Build a violating pairing (short span)
    std::vector<std::unique_ptr<Segment>> segStoreShort1;
    std::vector<Segment*> segsShort1;
    segStoreShort1.push_back(
        makeSegment("SIN", "JFK", "2025-01-01 00:00:00", "2025-01-01 19:00:00"));
    segsShort1.push_back(segStoreShort1.back().get());
    auto ulrDutyShort1 = makeDutyWithSegments(segsShort1, "FLY", 19 * 60);
    ulrDutyShort1->setULR(true);
    auto standbyDutyShort = makeSimpleDuty(
        "JFK", "JFK", "2025-01-03 00:00:00", "2025-01-03 06:00:00", "SBY");

    std::vector<std::unique_ptr<Segment>> segStoreShort2;
    std::vector<Segment*> segsShort2;
    segStoreShort2.push_back(
        makeSegment("JFK", "SIN", "2025-01-03 19:00:00", "2025-01-05 14:00:00"));
    segsShort2.push_back(segStoreShort2.back().get());
    auto ulrDutyShort2 = makeDutyWithSegments(segsShort2, "FLY", 19 * 60);

    std::vector<Duty*> dutiesShort{
        ulrDutyShort1.get(), standbyDutyShort.get(), ulrDutyShort2.get()};
    auto pairingShort = makePairing(dutiesShort, "SIN");

    // Build a passing pairing (meets minimum span)
    std::vector<std::unique_ptr<Segment>> segStoreLong1;
    std::vector<Segment*> segsLong1;
    segStoreLong1.push_back(
        makeSegment("SIN", "JFK", "2025-02-01 00:00:00", "2025-02-01 19:00:00"));
    segsLong1.push_back(segStoreLong1.back().get());
    auto ulrDutyLong1 = makeDutyWithSegments(segsLong1, "FLY", 19 * 60);

    auto standbyDutyLong = makeSimpleDuty(
        "JFK", "JFK", "2025-02-03 00:00:00", "2025-02-03 06:00:00", "SBY");

    std::vector<std::unique_ptr<Segment>> segStoreLong2;
    std::vector<Segment*> segsLong2;
    segStoreLong2.push_back(
        makeSegment("JFK", "SIN", "2025-02-06 00:00:00", "2025-02-06 19:00:00"));
    segsLong2.push_back(segStoreLong2.back().get());
    auto ulrDutyLong2 = makeDutyWithSegments(segsLong2, "FLY", 19 * 60);
    

    std::vector<Duty*> dutiesLong{
        ulrDutyLong1.get(), standbyDutyLong.get(), ulrDutyLong2.get()};
    auto pairingLong = makePairing(dutiesLong, "SIN");

    const bool expectShort = false;
    const bool expectLong = true;

    EXPECT_EQ(rule.CheckRule(pairingShort.get()), expectShort);
    EXPECT_EQ(rule.CheckRule(pairingLong.get()), expectLong);

    const int threadCount = 8;
    const int iterations = 200;
    std::atomic<bool> ok{true};

    std::vector<std::thread> threads;
    threads.reserve(threadCount);
    for (int i = 0; i < threadCount; ++i) {
        threads.emplace_back([&]() {
            ulrDutyShort2->setULR(true);

            ulrDutyLong1->setULR(true);
            ulrDutyLong2->setULR(true);
            for (int j = 0; j < iterations && ok.load(std::memory_order_relaxed); ++j) {
                if (rule.CheckRule(pairingShort.get()) != expectShort) {
                    ok.store(false, std::memory_order_relaxed);
                    break;
                }
                if (rule.CheckRule(pairingLong.get()) != expectLong) {
                    ok.store(false, std::memory_order_relaxed);
                    break;
                }
            }
        });
    }

    for (auto& t : threads) {
        t.join();
    }

    EXPECT_TRUE(ok.load());
}
