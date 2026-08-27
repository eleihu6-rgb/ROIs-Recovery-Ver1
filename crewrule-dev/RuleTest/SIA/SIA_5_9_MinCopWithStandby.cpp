// SIA_SUITE_SUMMARY_START
// SuiteId: 5.9
// Name: Minimum COP Duration with Standby
// SourceCsvRow: 5.9.,Minimum COP Duration with Standby
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Pairing spans 6 days and contains a standby duty (SBY) -> expected legal.
//   - Case #2: Pairing spans 5 days with a standby duty -> expected violation (<6 days).
//   - Case #3: Pairing spans 5 days without standby -> rule should bypass and pass.
// Results:
//   - fail 1 out of 3 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z; example failure: Value of: rule.CheckRule(pairing.get())
// RemainingWork:
//   - Confirm rule 7435 parameters for MIN PAIRING DAYS and standby detection; adjust context builder if ULR/assignment filters are missing.
//   - Replace simplified AAA/SIN/SFO modelling with full COP station offsets if SIA supplies them.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7435/MinPairingDaysForUlrStandbyRule.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"

// SIA 5.9 Minimum COP Duration with Standby (Tech Crew).
// Best-fit rule: MinPairingDaysForUlrStandbyRule (7435) with SBY assignment filter and 6-day minimum.

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

SharedPtr<CrewDataContext> buildContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->airportUtcOffsetMap["SIN"] = 480;
    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
    ctx->airportUtcOffsetMap["SFO"] = -480;
    ctx->airportZoneIdMap["SFO"] = "America/Los_Angeles";
    ctx->airportUtcOffsetMap["AAA"] = 0;
    ctx->airportZoneIdMap["AAA"] = "UTC";

    // Country info for layover-country filter.
    DBAirport sin{};
    std::strncpy(sin.airport, "SIN", sizeof(sin.airport) - 1);
    std::strncpy(sin.country, "SG", sizeof(sin.country) - 1);
    ctx->airportList.push_back(sin);
    DBAirport sfo{};
    std::strncpy(sfo.airport, "SFO", sizeof(sfo.airport) - 1);
    std::strncpy(sfo.country, "US", sizeof(sfo.country) - 1);
    ctx->airportList.push_back(sfo);
    return ctx;
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
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
    seg->setAssignment("FLY");
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments,
                               const std::string& assignment) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setAssignment(assignment);
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
    return duty;
}

std::unique_ptr<Duty> makeSimpleDuty(const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& assignment,
                                     const std::string& station) {
    auto duty = std::make_unique<Duty>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    duty->setAssignment(assignment);
    duty->setDepartureStation(station);
    duty->setArrivalStation(station);
    duty->setStartTimeUtcAct(start);
    duty->setEndTimeUtcAct(end);
    duty->setStartTimeLocAct(start);
    duty->setEndTimeLocAct(end);
    duty->setStartTimeUtcSch(start);
    duty->setEndTimeUtcSch(end);
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

DBRule makeMainRuleRow(int rowNum,
                       const std::string& serviceType,
                       const std::string& fleetGroup,
                       const std::string& hasUlr,
                       const std::string& layoverAirport,
                       const std::string& layoverCountry,
                       const std::string& assignment,
                       int minDays) {
    DBRule rule{};
    rule.idRule = 7435000 + rowNum;
    rule.function = 7435;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 208174350 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "CA";
    rule.params["SERVICE TYPE"] = serviceType;
    rule.params["FLEET GROUP"] = fleetGroup;
    rule.params["HAS ULR DUTY"] = hasUlr;
    rule.params["LAYOVER AIRPORT"] = layoverAirport;
    rule.params["LAYOVER COUNTRY"] = layoverCountry;
    rule.params["HAS DUTY ASSIGNMENT"] = assignment;
    rule.params["MIN PAIRING DAYS"] = std::to_string(minDays);
    return rule;
}

RuleInput makeRuleInput() {
    RuleInput input;
    input.dbRules.push_back(makeMainRuleRow(1, "*", "*", "*", "*", "US", "SBY", 6));
    return input;
}

}  // namespace

class SIA_5_9_MinCopDurationWithStandby : public ::testing::Test {
protected:
    void TearDown() override {
        clearViolations();
    }

    void configureRule(MinPairingDaysForUlrStandbyRule& rule,
                       const SharedPtr<CrewDataContext>& ctx) {
        rule.setDataContext(ctx);
        rule.setApplication(PAIRING_EDITOR);
        rule.setRuleViolation(&_violations);
        rule.setViolations(&_violationMessages);
    }

    void clearViolations() {
        for (auto* rv : _violations) {
            delete rv;
        }
        _violations.clear();
        _violationMessages.clear();
    }

    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
};

TEST_F(SIA_5_9_MinCopDurationWithStandby,
       Case1_SixDayPairingWithStandbyPasses) {
    auto ctx = buildContext();
    RuleInput input = makeRuleInput();
    MinPairingDaysForUlrStandbyRule rule(nullptr, input);
    configureRule(rule, ctx);

    std::vector<std::unique_ptr<Segment>> segStore1;
    std::vector<Segment*> segs1;
    segStore1.push_back(makeSegment("SIN", "SFO", "2025-09-01 00:00:00", "2025-09-01 16:00:00"));
    segs1.push_back(segStore1.back().get());
    auto duty1 = makeDuty(segs1, "FLY");

    auto standby = makeSimpleDuty("2025-09-03 00:00:00", "2025-09-03 06:00:00", "SBY", "SFO");

    std::vector<std::unique_ptr<Segment>> segStore2;
    std::vector<Segment*> segs2;
    segStore2.push_back(makeSegment("SFO", "SIN", "2025-09-06 00:00:00", "2025-09-06 16:00:00"));
    segs2.push_back(segStore2.back().get());
    auto duty2 = makeDuty(segs2, "FLY");

    std::vector<Duty*> duties{duty1.get(), standby.get(), duty2.get()};
    auto pairing = makePairing(duties, "SIN");

    EXPECT_TRUE(rule.CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(SIA_5_9_MinCopDurationWithStandby,
       Case2_FiveDayPairingWithStandbyViolates) {
    auto ctx = buildContext();
    RuleInput input = makeRuleInput();
    MinPairingDaysForUlrStandbyRule rule(nullptr, input);
    configureRule(rule, ctx);

    std::vector<std::unique_ptr<Segment>> segStore1;
    std::vector<Segment*> segs1;
    segStore1.push_back(makeSegment("SIN", "SFO", "2025-10-01 00:00:00", "2025-10-01 16:00:00"));
    segs1.push_back(segStore1.back().get());
    auto duty1 = makeDuty(segs1, "FLY");

    auto standby = makeSimpleDuty("2025-10-03 00:00:00", "2025-10-03 06:00:00", "SBY", "SFO");

    std::vector<std::unique_ptr<Segment>> segStore2;
    std::vector<Segment*> segs2;
    segStore2.push_back(makeSegment("SFO", "SIN", "2025-10-04 17:40:00", "2025-10-05 11:05:00"));
    segs2.push_back(segStore2.back().get());
    auto duty2 = makeDuty(segs2, "FLY");

    std::vector<Duty*> duties{duty1.get(), standby.get(), duty2.get()};
    auto pairing = makePairing(duties, "SIN");

    EXPECT_FALSE(rule.CheckRule(pairing.get()));
    EXPECT_FALSE(_violations.empty());
}

TEST_F(SIA_5_9_MinCopDurationWithStandby,
       Case3_FiveDayPairingWithoutStandbyPasses) {
    auto ctx = buildContext();
    RuleInput input = makeRuleInput();
    MinPairingDaysForUlrStandbyRule rule(nullptr, input);
    configureRule(rule, ctx);

    std::vector<std::unique_ptr<Segment>> segStore1;
    std::vector<Segment*> segs1;
    segStore1.push_back(makeSegment("SIN", "SFO", "2025-11-01 00:00:00", "2025-11-01 16:00:00"));
    segs1.push_back(segStore1.back().get());
    auto duty1 = makeDuty(segs1, "FLY");

    std::vector<std::unique_ptr<Segment>> segStore2;
    std::vector<Segment*> segs2;
    segStore2.push_back(makeSegment("SFO", "SIN", "2025-11-05 00:00:00", "2025-11-05 16:00:00"));
    segs2.push_back(segStore2.back().get());
    auto duty2 = makeDuty(segs2, "FLY");

    std::vector<Duty*> duties{duty1.get(), duty2.get()};
    auto pairing = makePairing(duties, "SIN");

    EXPECT_TRUE(rule.CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}
