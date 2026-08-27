#include <gtest/gtest.h>

#include <cstdio>
#include <memory>
#include <string>
#include <vector>

#include "rule/rule7405/UlrDutyDefinition.h"
#include "Segment.h"
#include "UtilFunc.h"
#include "TimezoneUtils.h"

namespace {

time_t utcFromLocal(const std::string& zoneId, const std::string& localDt) {
	return TimezoneUtils::LocalDateTimeToUtc(localDt, zoneId);
}

int offsetMinutesForStation(const std::string& stationUpper) {
    if (stationUpper == "SIN") {
        return 8 * 60;
    }
    if (stationUpper == "JFK" || stationUpper == "EWR") {
        return -5 * 60;
    }
    if (stationUpper == "LAX" || stationUpper == "SFO") {
        return -8 * 60;
    }
    return 0;
}

DBRule makeRuleRow(int rowNum,
    const std::string& dep,
    const std::string& arr,
    const std::string& fleet,
    const std::string& fleetGroup,
    const std::string& effectiveDate,
    const std::string& expiryDate) {
    DBRule row{};
    row.idRule = 7405001;
    row.function = ULRDutyDefinition::RuleFuncId;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.idRuleParam = 208180000 + rowNum;

    row.params["DEP"] = dep;
    row.params["ARR"] = arr;
    row.params["Fleet"] = fleet;
    row.params["Fleet Group"] = fleetGroup;
    row.params["Effective Date"] = effectiveDate;
    row.params["Expiry Date"] = expiryDate;
    return row;
}

Segment* makeFlightAtUtc(const std::string& dep,
    const std::string& arr,
    const std::string& fleet,
    time_t depUtc) {
    auto* seg = new Segment();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD(fleet);
    seg->setStartTimeUtcAct(depUtc);
    const int offsetMinutes = offsetMinutesForStation(dep);
    seg->setStartTimeLocAct(depUtc + offsetMinutes * 60);
    seg->setIsOperating(true);
    seg->setAssignment("FLY");
    return seg;
}

Segment* makeFlight(const std::string& dep,
    const std::string& arr,
    const std::string& fleet,
    const std::string& depUtc) {
    
    return makeFlightAtUtc(dep, arr, fleet, utcStrToUtc((char*)depUtc.c_str()));
}

std::vector<DBRule> makeDesignRows() {
    std::vector<DBRule> rows;
    rows.push_back(makeRuleRow(1, "EWR", "SIN", "*", "350", "2025-03-30", "2025-10-25"));
    rows.push_back(makeRuleRow(2, "JFK", "SIN", "*", "350", "2025-03-30", "2025-10-25"));
    rows.push_back(makeRuleRow(3, "LAX", "SIN", "*", "350", "2025-03-30", "2025-10-25"));
    rows.push_back(makeRuleRow(4, "EWR", "SIN", "*", "350", "2025-10-26", "2026-03-28"));
    rows.push_back(makeRuleRow(5, "JFK", "SIN", "*", "350", "2025-10-26", "2026-03-28"));
    rows.push_back(makeRuleRow(6, "LAX", "SIN", "*", "350", "2025-10-26", "2026-03-28"));
    rows.push_back(makeRuleRow(7, "SFO", "SIN", "*", "350", "2025-10-26", "2026-03-28"));
    return rows;
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
        {"JFK", -240, "America/New_York"},
        {"EWR", -240, "America/New_York"},
        {"LAX", -420, "America/Los_Angeles"},
        {"SFO", -420, "America/Los_Angeles"},
        {"FRA", 60,   "Europe/Berlin"},
        {"BOM", 330,  "Asia/Kolkata"},
        {"KUL", 480,  "Asia/Kuala_Lumpur"},
    };

    for (const auto& airport : airports) {
        ctx->airportUtcOffsetMap[airport.code] = airport.utcOffsetMinutes;
        ctx->airportZoneIdMap[airport.code] = airport.zoneId;
    }
    FLEET fleet;
    fleet.airline = "SQ";
	fleet.fleet = "359";
	fleet.fleetGrp = "350";
	ctx->fleetMap[fleet.fleet] = fleet;
    return ctx;
}

}  // namespace

TEST(UlrDutyDefinitionTest, DesignRowsApplyForDesignRoutes) {
	
    RuleInput input;
    input.dbRules = makeDesignRows();
    ULRDutyDefinition def(nullptr, input);
    auto ctx = buildDataContext();
    def.setDataContext(ctx);
    def.ParseUtcRanges();

    Duty match;
    std::unique_ptr<Segment> seg(makeFlight("JFK", "SIN", "359", "2025-04-01 00:00:00"));
    match.appendSegment(seg.get());
    def.CalculateDuty(&match);
    EXPECT_TRUE(match.isULR());

    Duty nonMatch;
    std::unique_ptr<Segment> seg2(makeFlight("SIN", "JFK", "359", "2025-04-01 00:00:00"));
    nonMatch.appendSegment(seg2.get());
    def.CalculateDuty(&nonMatch);
    EXPECT_FALSE(nonMatch.isULR());
}

TEST(UlrDutyDefinitionTest, EffectiveDateBoundaryIsInclusive) {
    RuleInput input;
    input.dbRules = makeDesignRows();
    ULRDutyDefinition def(nullptr, input);
    auto ctx = buildDataContext();
    def.setDataContext(ctx);
    def.ParseUtcRanges();

    Duty onExpiry;
    const time_t utcOnExpiry =
        utcFromLocal("America/Los_Angeles", "2025-10-25 23:59:59");
    std::unique_ptr<Segment> segOnExpiry(makeFlightAtUtc("LAX", "SIN", "359", utcOnExpiry));
    onExpiry.appendSegment(segOnExpiry.get());
    def.CalculateDuty(&onExpiry);
    EXPECT_TRUE(onExpiry.isULR());

    Duty onNextEffective;
    const time_t utcOnNextEffective =
        utcFromLocal("America/Los_Angeles", "2025-10-26 00:00:00");
    std::unique_ptr<Segment> segOnNextEffective(makeFlightAtUtc("SFO", "SIN", "359", utcOnNextEffective));
    onNextEffective.appendSegment(segOnNextEffective.get());
    def.CalculateDuty(&onNextEffective);
    EXPECT_TRUE(onNextEffective.isULR());
}

TEST(UlrDutyDefinitionTest, MultiSegmentDutyMatchesAnyOperatingSegment) {
    RuleInput input;
    input.dbRules = makeDesignRows();
    ULRDutyDefinition def(nullptr, input);
    auto ctx = buildDataContext();
    def.setDataContext(ctx);
    def.ParseUtcRanges();

    Duty duty;
    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.emplace_back(makeFlight("SIN", "HKG", "359", "2025-04-01 00:00:00"));
    segStore.emplace_back(makeFlight("EWR", "SIN", "359", "2025-04-02 00:00:00"));
    duty.appendSegment(segStore[0].get());
    duty.appendSegment(segStore[1].get());

    def.CalculateDuty(&duty);
    EXPECT_TRUE(duty.isULR());
}

TEST(UlrDutyDefinitionTest, DbRowsOverrideDefaultsAndAreWildcardCapable) {
    std::vector<DBRule> rows;
    rows.push_back(makeRuleRow(1, "JFK", "SIN", "*", "*", "*", "*"));

    RuleInput input;
    input.dbRules = rows;
    ULRDutyDefinition def(nullptr, input);
    auto ctx = buildDataContext();
    def.setDataContext(ctx);
    def.ParseUtcRanges();

    Duty duty;
    std::unique_ptr<Segment> seg(makeFlight("JFK", "SIN", "777", "2025-01-01 00:00:00"));
    duty.appendSegment(seg.get());

    def.CalculateDuty(&duty);
    EXPECT_TRUE(duty.isULR());
}

TEST(UlrDutyDefinitionTest, PositioningOnMatchingFlightIsNotUlr) {
    RuleInput input;
    input.dbRules = makeDesignRows();
    ULRDutyDefinition def(nullptr, input);
    auto ctx = buildDataContext();
    def.setDataContext(ctx);
    def.ParseUtcRanges();

    Duty duty;
    std::unique_ptr<Segment> seg(makeFlight("JFK", "SIN", "359", "2025-04-01 00:00:00"));
    seg->setAssignment("DHD");
    seg->setIsOperating(false);
    duty.appendSegment(seg.get());

    def.CalculateDuty(&duty);
    EXPECT_FALSE(duty.isULR());
}
