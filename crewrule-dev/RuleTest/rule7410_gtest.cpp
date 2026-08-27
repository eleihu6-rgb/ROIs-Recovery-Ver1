#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7410/AnrMaxFdpRuleParam.h"
#include "RuleEngine/rule/rule7410/CalculateAnrMaxFdpRule.h"
#include "RuleEngine/rule/rule7410/CheckAnrMaxFdpRule.h"
#include "db/RuleParams.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "RuleEngine/rule/framework/RuleSystemDefine.h"
#include "RuleEngine/RuleEngine.h"
#include "db/PairingUtil.h"
#include "CrewDB.h"

#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

SharedPtr<CrewDataContext> buildDataContextFor7410() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);

    struct AirportConfig {
        const char* code;
        int utcOffsetMinutes;
        const char* zoneId;
    };

    const AirportConfig airports[] = {
        {"SIN", 480,  "Asia/Singapore"},
        {"JFK", -240, "America/New_York"},
        {"FRA", 60,   "Europe/Berlin"},
        {"BOM", 330,  "Asia/Kolkata"},
        {"KUL", 480,  "Asia/Kuala_Lumpur"},
    };

    for (const auto& airport : airports) {
        ctx->airportUtcOffsetMap[airport.code] = airport.utcOffsetMinutes;
        ctx->airportZoneIdMap[airport.code] = airport.zoneId;
    }

    return ctx;
}

DBRule makeTable1Row(int rowNum,
                     const std::string& tzDiff,
                     const std::string& composition,
                     const std::string& restFacility,
                     const std::string& reportStart,
                     const std::string& reportEnd,
                     int sectorLower,
                     int sectorUpper,
                     const std::string& maxFdp,
                     const std::string& fdpRange = "*") {
    DBRule rule{};
    rule.idRule = 7410001;
    rule.function = 7410; // ANR_MAX_FLIGHT_DUTY_PERIOD
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "ANR-121";
    rule.idRuleParam = 208174100 + rowNum;

    rule.params["TZ DIFF"] = tzDiff;
    rule.params["COMPOSITION"] = composition;
    rule.params["REST FACILITY"] = restFacility;
    rule.params["REPORT START"] = reportStart;
    rule.params["REPORT END"] = reportEnd;
    rule.params["SECTOR LOWER"] = std::to_string(sectorLower);
    rule.params["SECTORS UPPER"] = std::to_string(sectorUpper);
    rule.params["FDP RANGE"] = fdpRange;
    rule.params["MAX FDP"] = maxFdp;

    return rule;
}

DBRule makeTable2Control(bool countDeadhead,
                         bool excludeFinalDeadhead,
                         int bufferMinutes,
                         std::string ulrExemptionComposition = {},
                         std::string ulrExemptionRestFacility = {},
                         bool applyReportTimeDifference = false) {
    DBRule rule{};
    rule.idRule = 7410001;
    rule.function = 7410; // ANR_MAX_FLIGHT_DUTY_PERIOD
    rule.tableNum = 2;
    rule.rowNum = 1;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "ANR-121";
    rule.idRuleParam = 208174105;

    auto toYn = [](bool flag) -> std::string { return flag ? "Y" : "N"; };
    rule.params["COUNT DEADHEAD SECTORS"] = toYn(countDeadhead);
    rule.params["EXCLUDE FINAL DEADHEAD SECTORS"] = toYn(excludeFinalDeadhead);
    rule.params["GLOBAL BUFFER MINUTES"] = std::to_string(bufferMinutes);
    rule.params["APPLY REPORT TIME DIFFERENCE"] = toYn(applyReportTimeDifference);
    if (!ulrExemptionComposition.empty()) {
        // Intentionally mixed case to validate header parsing uppercases headers.
        rule.params["Ulr Exemption Composition"] = std::move(ulrExemptionComposition);
    }
    if (!ulrExemptionRestFacility.empty()) {
        // Intentionally mixed case to validate header parsing uppercases headers.
        rule.params["Ulr Exemption Rest Facility"] = std::move(ulrExemptionRestFacility);
    }

    return rule;
}

DBRule make7411Row(int rowNum,
                   const std::string& lengthLower,
                   const std::string& lengthUpper,
                   const std::string& tzDiff,
                   int sectorValue) {
    DBRule rule{};
    rule.idRule = 7411001;
    rule.function = 7411; // ANR_SECTOR_COUNTING_DEFINITION
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "ANR-121";
    rule.idRuleParam = 208174110 + rowNum;

    rule.params["SECTOR LENGTH LOWER"] = lengthLower;
    rule.params["SECTOR LENGTH UPPER"] = lengthUpper;
    rule.params["TZ DIFF"] = tzDiff;
    rule.params["SECTOR VALUE"] = std::to_string(sectorValue);

    return rule;
}

DBRule make7413Row(int rowNum,
                   const std::string& composition,
                   const std::string& restFacility,
                   const std::string& hasSector,
                   const std::string& sectorMinFlyTime,
                   const std::string& maxFdp,
                   const std::string& dutyStartStation = "*",
                   const std::string& fdpRange = "*") {
    DBRule rule{};
    rule.idRule = 7413001;
    rule.function = 7413; // ANR_CC_AUGMENTED_MAX_FDP_LIMIT
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.severity = 2;
    rule.overridebility = "S";
    rule.reference = "ANR-121";
    rule.idRuleParam = 208174130 + rowNum;

    rule.params["COMPOSITION"] = composition;
    rule.params["REST FACILITY"] = restFacility;
    rule.params["FDP RANGE"] = fdpRange;
    rule.params["Duty Start Station"] = dutyStartStation;
    // Intentionally mixed case to validate header parsing uppercases headers.
    rule.params["Has Sector"] = hasSector;
    rule.params["Sector Min Fly Time"] = sectorMinFlyTime;
    rule.params["MAX FDP"] = maxFdp;

    return rule;
}

// Helper to build a simple flying segment.
std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                              const std::string& arr,
                                              const std::string& fleet,
                                              const std::string& flightNumber,
                                              const std::string& startUtc,
                                              const std::string& endUtc,
                                              bool isOperating,
                                              CrewDataContext* ctx = nullptr ) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD(fleet);
    seg->setFlightNumber(flightNumber);
    if (isOperating) {
        seg->setAssignment("FLY");
        seg->setIsOperating(true);
    } else {
        seg->setAssignment("DHD");
        seg->setIsOperating(false);
	}

    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
	int startOffset = 0;
	int endOffset = 0;
    if (ctx != nullptr) 
    {
        startOffset = ctx->airportUtcOffsetMap.at(dep); 
        endOffset = ctx->airportUtcOffsetMap.at(arr);
    }
    
	seg->setStartTimeLocAct(start + startOffset * 60);
	seg->setEndTimeLocAct(end + endOffset * 60);
	seg->setStartTimeLocSch(start + startOffset * 60);
	seg->setEndTimeUtcSch(end + endOffset * 60);

    return seg;
}

// update local is not used in this unit test but provided for completeness
void updateSegmentLocalTime(Segment* seg, const SharedPtr<CrewDataContext>& ctx) {
    seg->setStartTimeLocAct(TimezoneUtils::GetLocalTime(seg->getStartTimeUtcAct(), ctx->airportZoneIdMap.at(seg->getDepStation())));
    seg->setEndTimeLocAct(TimezoneUtils::GetLocalTime(seg->getEndTimeUtcAct(), ctx->airportZoneIdMap.at(seg->getArrStation())));
    seg->setStartTimeLocSch(TimezoneUtils::GetLocalTime(seg->getStartTimeUtcSch(), ctx->airportZoneIdMap.at(seg->getDepStation())));
    seg->setEndTimeUtcSch(TimezoneUtils::GetLocalTime(seg->getEndTimeUtcSch(), ctx->airportZoneIdMap.at(seg->getArrStation())));
}

}  // namespace

class Rule7410Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(BATCH_LEGALITY);
    }
};

// Basic matching: TZ diff, composition, sectors, report window => first row.
TEST_F(Rule7410Test, FindMatchingRow_BasicComposition_OneSector_Match) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-02:00", "Basic", "*", "06:00", "07:59", 1, 1, "13:00"));
    input.dbRules.push_back(makeTable1Row(
        2, "00:00-02:00", "Basic", "*", "06:00", "07:59", 2, 3, "12:00"));
    input.dbRules.push_back(makeTable1Row(
        3, "02:01-23:59", "3P", "3", "06:00", "07:59", 4, 99, "11:00"));

	BasicRule dummyRule(nullptr, AnrMaxFdpRuleParam::RuleFuncId, RuleInterface::Interface::SingleDuty);
    dummyRule.setApplication(BATCH_LEGALITY);
    AnrMaxFdpRuleParam param(&dummyRule);
    param.ParseFromRuleInput(input);

    auto ctx = buildDataContextFor7410();

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
		"SIN", "FRA", "333", "SQ1", "2025-06-01 23:00:00", "2025-06-02 13:30:00", true, ctx.get())); // start 07:00 local SIN
	//updateLocalTime(segStorage.back().get(), ctx);
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
	// ignore duty node update (requires full RuleEngine object) and focus on core fields only, update duty start (report) time 
	constexpr int reportMinutes = 60; // 1 hour report time
	constexpr int releaseMinutes = 30; // 30 minutes release time   

	duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - reportMinutes * 60); // report 06:00 local SIN
	duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct() + releaseMinutes * 60);
	
    int offsetMintues = ctx->airportUtcOffsetMap.at(segs.front()->getDepStation());
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMintues * 60);
	duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMintues * 60);

    duty.setRefTimeZone(offsetMintues); // acclimated to SIN (UTC+8), tz diff = 0
    duty.setCompositionName("Basic");

    const AnrMaxFdpRow* row = param.findMatchingRow(&duty, ctx, BATCH_LEGALITY);
    ASSERT_NE(row, nullptr);
    EXPECT_EQ(row->rowNum, 1);
    EXPECT_EQ(row->maxFdpMinutes, 13 * 60);
}

// FDP range filters rows when provided (inclusive bounds).
TEST_F(Rule7410Test, FindMatchingRow_RespectsFdpRange) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-02:00", "Basic", "*", "06:00", "07:59", 1, 3, "15:00", "00:00-15:59"));
    input.dbRules.push_back(makeTable1Row(
        2, "00:00-02:00", "Basic", "*", "06:00", "07:59", 1, 3, "19:00", "16:00-18:59"));

    BasicRule dummyRule(nullptr, AnrMaxFdpRuleParam::RuleFuncId, RuleInterface::Interface::SingleDuty);
    dummyRule.setApplication(BATCH_LEGALITY);
    AnrMaxFdpRuleParam param(&dummyRule);
    param.ParseFromRuleInput(input);

    auto ctx = buildDataContextFor7410();

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "FRA", "333", "SQ1", "2025-06-01 23:00:00", "2025-06-02 05:00:00", true, ctx.get())); // 7h block
    std::vector<Segment*> segs;
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - 60 * 60); // report 06:00 local SIN
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct() + 30 * 60);
    int offsetMintues = ctx->airportUtcOffsetMap.at(segs.front()->getDepStation());
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMintues * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMintues * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    // FDP 16:00 => second row matches (range 16:00-18:59).
    duty.setFDPInSecs(16 * 60 * 60);
    const AnrMaxFdpRow* row = param.findMatchingRow(&duty, ctx, BATCH_LEGALITY);
    ASSERT_NE(row, nullptr);
    EXPECT_EQ(row->rowNum, 2);
    EXPECT_EQ(row->maxFdpMinutes, 19 * 60);

    // FDP 15:00 => first row matches (range 00:00-15:59).
    duty.setFDPInSecs(15 * 60 * 60);
    row = param.findMatchingRow(&duty, ctx, BATCH_LEGALITY);
    ASSERT_NE(row, nullptr);
    EXPECT_EQ(row->rowNum, 1);
    EXPECT_EQ(row->maxFdpMinutes, 15 * 60);
}

// Sector counting: 2 operating sectors => match second row (2-3 sectors).
TEST_F(Rule7410Test, FindMatchingRow_BasicComposition_TwoSectors_Match) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-02:00", "Basic", "*", "06:00", "07:59", 1, 1, "13:00"));
    input.dbRules.push_back(makeTable1Row(
        2, "00:00-02:00", "Basic", "*", "06:00", "07:59", 2, 3, "12:00"));
    input.dbRules.push_back(makeTable1Row(
        3, "00:00-02:00", "Basic", "*", "06:00", "07:59", 4, 99, "10:00"));

    BasicRule dummyRule(nullptr, AnrMaxFdpRuleParam::RuleFuncId, RuleInterface::Interface::SingleDuty);
    dummyRule.setApplication(BATCH_LEGALITY);
    AnrMaxFdpRuleParam param(&dummyRule);
    param.ParseFromRuleInput(input);

    auto ctx = buildDataContextFor7410();

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
        "SIN", "BOM", "333", "SQ1", "2025-06-01 23:00:00", "2025-06-02 02:30:00", true, ctx.get()));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "BOM", "SIN", "333", "SQ2", "2025-06-02 04:00:00", "2025-06-02 07:00:00", true, ctx.get()));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);
    constexpr int reportMinutes = 60; // 1 hour report time
    constexpr int releaseMinutes = 30; // 30 minutes release time   

    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - reportMinutes * 60); // report 06:00 local SIN
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct() + releaseMinutes * 60);
    int offsetMintues = ctx->airportUtcOffsetMap.at(segs.front()->getDepStation());
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMintues * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMintues * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    const AnrMaxFdpRow* row = param.findMatchingRow(&duty, ctx, BATCH_LEGALITY);
    ASSERT_NE(row, nullptr);
    EXPECT_EQ(row->rowNum, 2);
    EXPECT_EQ(row->maxFdpMinutes, 12 * 60);
}

// Rest facility + high TZ diff and composition 3P => third row.
TEST_F(Rule7410Test, FindMatchingRow_ThreePilotWithRestFacility_Match) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-02:00", "Basic", "*", "06:00", "07:59", 1, 1, "13:00"));
    input.dbRules.push_back(makeTable1Row(
        2, "00:00-02:00", "Basic", "*", "06:00", "07:59", 2, 3, "12:00"));
    input.dbRules.push_back(makeTable1Row(
        3, "02:01-23:59", "3P", "3", "06:00", "07:59", 4, 99, "16:00"));

    BasicRule dummyRule(nullptr, AnrMaxFdpRuleParam::RuleFuncId, RuleInterface::Interface::SingleDuty);
    dummyRule.setApplication(BATCH_LEGALITY);
    AnrMaxFdpRuleParam param(&dummyRule);
    param.ParseFromRuleInput(input);

    auto ctx = buildDataContextFor7410();

    // Rest facility comes from fleet.
    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    for (int i = 0; i < 4; ++i) {
        segStorage.push_back(makeSegment(
            "JFK", "FRA", "333", "SQ" + std::to_string(i + 1),
			"2025-06-01 11:00:00", "2025-06-01 14:00:00", true, ctx.get())); // start utc -4:00 DST => local 07:00
        segs.push_back(segStorage.back().get());
    }

    Duty duty(segs);

    constexpr int reportMinutes = 60; // 1 hour report time
    constexpr int releaseMinutes = 30; // 30 minutes release time   
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - reportMinutes * 60); // report 06:00 local JFK
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct() + releaseMinutes * 60);
    int offsetMintues = ctx->airportUtcOffsetMap.at(segs.front()->getDepStation());
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMintues * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMintues * 60);

    duty.setRefTimeZone(480); // acclimated SIN (UTC+8), tz diff > 2h
    duty.setCompositionName("3P");

    const AnrMaxFdpRow* row = param.findMatchingRow(&duty, ctx, BATCH_LEGALITY);
    ASSERT_NE(row, nullptr);
    EXPECT_EQ(row->rowNum, 3);
    EXPECT_EQ(row->maxFdpMinutes, 16 * 60);
}

// Report window mismatch => no matching row.
TEST_F(Rule7410Test, FindMatchingRow_ReportTimeOutsideWindow_NoMatch) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-02:00", "Basic", "*", "06:00", "07:59", 1, 3, "13:00"));

    BasicRule dummyRule(nullptr, AnrMaxFdpRuleParam::RuleFuncId, RuleInterface::Interface::SingleDuty);
    dummyRule.setApplication(BATCH_LEGALITY);
    AnrMaxFdpRuleParam param(&dummyRule);
    param.ParseFromRuleInput(input);

    auto ctx = buildDataContextFor7410();

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "FRA", "333", "SQ1", "2025-06-01 21:59:00", "2025-06-01 23:00:00", true, ctx.get()));
    vector<Segment*> segs;
	std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
		[](auto& seg) { return seg.get(); });
    Duty duty(segs);
    constexpr int reportMinutes = 0; // 0 hour report time
    constexpr int releaseMinutes = 30; // 30 minutes release time   
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - reportMinutes * 60); // report 05:59 local SIN
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct() + releaseMinutes * 60);
    int offsetMintues = ctx->airportUtcOffsetMap.at(segs.front()->getDepStation());
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMintues * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMintues * 60);

    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    const AnrMaxFdpRow* row = param.findMatchingRow(&duty, ctx, BATCH_LEGALITY);
    EXPECT_EQ(row, nullptr);
}

// Control parameters: deadhead inclusion and last deadhead flag.
TEST_F(Rule7410Test, CountSectors_ControlFlagsAffectDeadheads) {
    RuleInput includeAllInput;
    includeAllInput.dbRules.push_back(makeTable2Control(true, false, 30));

    BasicRule dummyRule(nullptr, AnrMaxFdpRuleParam::RuleFuncId, RuleInterface::Interface::SingleDuty);
    dummyRule.setApplication(BATCH_LEGALITY);
    AnrMaxFdpRuleParam includeAllParam(&dummyRule);
    
    includeAllParam.ParseFromRuleInput(includeAllInput);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    // Deadhead before first operating leg.
    segStorage.push_back(makeSegment(
        "SIN", "KUL", "332", "SQ1", "2025-06-01 20:00:00", "2025-06-01 21:00:00", false));
    segs.push_back(segStorage.back().get());
    // First operating sector.
    segStorage.push_back(makeSegment(
        "KUL", "SIN", "333", "SQ2", "2025-06-01 21:30:00", "2025-06-02 01:30:00", true));
    segs.push_back(segStorage.back().get());
    // Deadhead between operating sectors.
    segStorage.push_back(makeSegment(
        "SIN", "KUL", "334", "SQ3", "2025-06-02 02:00:00", "2025-06-02 03:00:00", false));
    segs.push_back(segStorage.back().get());
    // Second operating sector.
    segStorage.push_back(makeSegment(
        "KUL", "SIN", "335", "SQ4", "2025-06-02 04:00:00", "2025-06-02 06:00:00", true));
    segs.push_back(segStorage.back().get());
    // Two trailing deadheads after the final operating leg.
    segStorage.push_back(makeSegment(
        "SIN", "KUL", "336", "SQ5", "2025-06-02 06:30:00", "2025-06-02 07:30:00", false));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "KUL", "SIN", "337", "SQ6", "2025-06-02 08:00:00", "2025-06-02 09:00:00", false));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);

    // Count all deadheads + operating sectors.
    EXPECT_EQ(includeAllParam.countSectors(&duty, 0), 6);

    // Exclude trailing deadheads: only pre/post-flying deadheads counted.
    RuleInput excludeFinalInput;
    excludeFinalInput.dbRules.push_back(makeTable2Control(true, true, 30));

    AnrMaxFdpRuleParam excludeFinalParam(&dummyRule);

    excludeFinalParam.ParseFromRuleInput(excludeFinalInput);
    EXPECT_EQ(excludeFinalParam.countSectors(&duty, 0), 4);

    // Disable deadhead counting completely.
    RuleInput ignoreDeadheadInput;
    ignoreDeadheadInput.dbRules.push_back(makeTable2Control(false, false, 30));
    AnrMaxFdpRuleParam ignoreDeadheadParam(&dummyRule);
    ignoreDeadheadParam.ParseFromRuleInput(ignoreDeadheadInput);
    EXPECT_EQ(ignoreDeadheadParam.countSectors(&duty, 0), 2);
}

TEST_F(Rule7410Test, CountSectors_DeadheadOnlyDutyRespectsFlags) {
    // Duty with leading and trailing deadhead segments.
    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    segStorage.push_back(makeSegment(
        "SIN", "KUL", "737", "SQ5", "2025-06-01 06:00:00", "2025-06-01 07:00:00", false));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "SIN", "KUL", "737", "SQ6", "2025-06-01 08:00:00", "2025-06-01 09:00:00", true));
    segs.push_back(segStorage.back().get());
    segStorage.push_back(makeSegment(
        "SIN", "KUL", "737", "SQ7", "2025-06-01 10:00:00", "2025-06-01 11:00:00", false));
    segs.push_back(segStorage.back().get());

    Duty duty(segs);

    RuleInput countAllInput;
    countAllInput.dbRules.push_back(makeTable2Control(true, false, 15));
   
    BasicRule dummyRule(nullptr, AnrMaxFdpRuleParam::RuleFuncId, RuleInterface::Interface::SingleDuty);
    dummyRule.setApplication(BATCH_LEGALITY);
    AnrMaxFdpRuleParam countAllParam(&dummyRule);

    countAllParam.ParseFromRuleInput(countAllInput);
    EXPECT_EQ(countAllParam.countSectors(&duty, 0), 3);

    RuleInput excludeTrailingInput;
    excludeTrailingInput.dbRules.push_back(makeTable2Control(true, true, 15));
   
    AnrMaxFdpRuleParam excludeTrailingParam(&dummyRule);

    excludeTrailingParam.ParseFromRuleInput(excludeTrailingInput);
    EXPECT_EQ(excludeTrailingParam.countSectors(&duty, 0), 2);

    RuleInput ignoreAllInput;
    ignoreAllInput.dbRules.push_back(makeTable2Control(false, true, 15));
    AnrMaxFdpRuleParam ignoreAllParam(&dummyRule);
    ignoreAllParam.ParseFromRuleInput(ignoreAllInput);
    EXPECT_EQ(ignoreAllParam.countSectors(&duty, 0), 1);
}

// Sector counting with 7411: long sectors count as 2/3/4 depending on TZ diff.
TEST_F(Rule7410Test, CountSectors_LongSectorsAdjustedBy7411) {
    RuleInput input;
    input.dbRules.push_back(makeTable2Control(true, false, 30));

    std::vector<DBRule> sectorRules;
    sectorRules.push_back(make7411Row(1, "07:00", "09:00", "00:00-02:00", 2));
    sectorRules.push_back(make7411Row(2, "07:00", "09:00", "02:01-24:00", 3));
    sectorRules.push_back(make7411Row(3, "09:00", "99:00", "00:00-02:00", 3));
    sectorRules.push_back(make7411Row(4, "09:00", "99:00", "02:01-24:00", 4));
    input.dependDbRules[7411] = sectorRules; // ANR_SECTOR_COUNTING_DEFINITION

    BasicRule dummyRule(nullptr, AnrMaxFdpRuleParam::RuleFuncId, RuleInterface::Interface::SingleDuty);
    dummyRule.setApplication(BATCH_LEGALITY);
    AnrMaxFdpRuleParam param(&dummyRule);

    param.ParseFromRuleInput(input);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Segment*> segs;
    // 8-hour operating sector.
    segStorage.push_back(makeSegment(
        "SIN", "FRA", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:00:00", true));
    segs.push_back(segStorage.back().get());

    Duty dutyShort(segs);

    // tz diff <= 2h => sector value 2
    int sectorsTzSmall = param.countSectors(&dutyShort, 120);
    EXPECT_EQ(sectorsTzSmall, 2);

    // tz diff > 2h => sector value 3
    int sectorsTzLarge = param.countSectors(&dutyShort, 180);
    EXPECT_EQ(sectorsTzLarge, 3);

    // 10-hour operating sector.
    std::vector<std::unique_ptr<Segment>> longSegStorage;
    std::vector<Segment*> longSegs;
    longSegStorage.push_back(makeSegment(
        "SIN", "FRA", "333", "SQ2", "2025-06-01 00:00:00", "2025-06-01 10:00:00", true));
    longSegs.push_back(longSegStorage.back().get());

    Duty dutyLong(longSegs);

    int sectorsLongTzSmall = param.countSectors(&dutyLong, 120);
    EXPECT_EQ(sectorsLongTzSmall, 3);

    int sectorsLongTzLarge = param.countSectors(&dutyLong, 180);
    EXPECT_EQ(sectorsLongTzLarge, 4);
}

// Calculate rule: sets MAX_FDP limitation using matching row value.
TEST_F(Rule7410Test, CalculateRule_SetsMaxFdpLimitation) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-02:00", "Basic", "*", "06:00", "07:59", 1, 3, "13:00"));
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-02:00", "Basic", "*", "06:00", "07:59", 4, 99, "11:00"));

    CalculateAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();
    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "FRA", "333", "SQ1", "2025-06-01 22:00:00", "2025-06-01 23:30:00", true));
	vector<Segment*> segs;
	std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
		[](auto& seg) { return seg.get(); });

    Duty duty(segs);
    constexpr int reportMinutes = 0; // 0 hour report time
    constexpr int releaseMinutes = 30; // 30 minutes release time   
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - reportMinutes * 60); // report 05:59 local SIN
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct() + releaseMinutes * 60);
    int offsetMintues = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeLocAct() + offsetMintues * 60);
    duty.setEndTimeLocAct(duty.getEndTimeLocAct() + offsetMintues * 60);

    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    rule.CalculateDuty(&duty);

    int maxFdp = duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
    EXPECT_EQ(maxFdp, 13 * 60);
    auto* limit = duty.getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
    ASSERT_NE(limit, nullptr);
    EXPECT_FALSE(limit->isFinalChecked);
}

TEST_F(Rule7410Test, CalculateRule_AppliesReportTimeDifferenceWhenEnabled) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 30, "", "", true));

    CalculateAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    // Provide 3021 definitions for FD (P) and CC (C) in the context.
    {
        DBRule fd3021{};
        fd3021.function = RULES::CHECK_IN_OUT_BRIEF; // 3021
        fd3021.params["DIVISION"] = "P";
        auto fdCache = std::make_shared<rule3021>();
        fdCache->airport = "*";
        fdCache->depStart = 0;
        fdCache->depEnd = 24 * 60 * 60 - 1;
        fdCache->dutyType = "*";
        fdCache->fltNumsVec = {"*"};
        fdCache->fleetsVec = {"*"};
        fdCache->assignment = {"*"};
        fdCache->dutyAssignments = {"*"};
        fdCache->airlines = {"*"};
        fdCache->courses = {"*"};
        fdCache->effDate = -1;
        fdCache->expDate = -1;
        fdCache->briefTime = 60;
        fd3021.parsedParam = fdCache;
        ctx->addRuleFunction(RULES::CHECK_IN_OUT_BRIEF, fd3021);

        DBRule cc3021{};
        cc3021.function = RULES::CHECK_IN_OUT_BRIEF; // 3021
        cc3021.params["DIVISION"] = "C";
        auto ccCache = std::make_shared<rule3021>();
        ccCache->airport = "*";
        ccCache->depStart = 0;
        ccCache->depEnd = 24 * 60 * 60 - 1;
        ccCache->dutyType = "*";
        ccCache->fltNumsVec = {"*"};
        ccCache->fleetsVec = {"*"};
        ccCache->assignment = {"*"};
        ccCache->dutyAssignments = {"*"};
        ccCache->airlines = {"*"};
        ccCache->courses = {"*"};
        ccCache->effDate = -1;
        ccCache->expDate = -1;
        ccCache->briefTime = 90;
        cc3021.parsedParam = ccCache;
        ctx->addRuleFunction(RULES::CHECK_IN_OUT_BRIEF, cc3021);
    }

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "FRA", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 01:00:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    // CC report time is 90 minutes; FD report time is 60 minutes => delta = +30 minutes.
    duty.setMinBrief(90);
    duty.setActualBriefMin(90);

    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - 90 * 60);
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);

    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    rule.CalculateDuty(&duty);

    // Base 13:00 + delta 00:30 => 13:30
    EXPECT_EQ(duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), 13 * 60 + 30);
}

TEST_F(Rule7410Test, CalculateRule_UsesFdReportTimeWindowWhenDiffEnabled) {
    RuleInput baseInput;
    // 08:00-08:59 => 14:00, 09:00-09:59 => 13:00 (same table for FD/CC)
    baseInput.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "08:00", "08:59", 1, 99, "14:00"));
    baseInput.dbRules.push_back(makeTable1Row(
        2, "00:00-24:00", "Basic", "*", "09:00", "09:59", 1, 99, "13:00"));

    RuleInput fdInput = baseInput;
    fdInput.dbRules.push_back(makeTable2Control(true, false, 30, "", "", false));

    RuleInput ccInput = baseInput;
    ccInput.dbRules.push_back(makeTable2Control(true, false, 30, "", "", true));

    CalculateAnrMaxFdpRule fdRule(nullptr, fdInput);
    CalculateAnrMaxFdpRule ccRule(nullptr, ccInput);
    auto ctx = buildDataContextFor7410();

    // Provide 3021 definitions for FD (P) and CC (C) in the context.
    {
        DBRule fd3021{};
        fd3021.function = RULES::CHECK_IN_OUT_BRIEF; // 3021
        fd3021.params["DIVISION"] = "P";
        auto fdCache = std::make_shared<rule3021>();
        fdCache->airport = "*";
        fdCache->depStart = 0;
        fdCache->depEnd = 24 * 60 * 60 - 1;
        fdCache->dutyType = "*";
        fdCache->fltNumsVec = {"*"};
        fdCache->fleetsVec = {"*"};
        fdCache->assignment = {"*"};
        fdCache->dutyAssignments = {"*"};
        fdCache->airlines = {"*"};
        fdCache->courses = {"*"};
        fdCache->effDate = -1;
        fdCache->expDate = -1;
        fdCache->briefTime = 60; // FD = 1 hour
        fd3021.parsedParam = fdCache;
        ctx->addRuleFunction(RULES::CHECK_IN_OUT_BRIEF, fd3021);

        DBRule cc3021{};
        cc3021.function = RULES::CHECK_IN_OUT_BRIEF; // 3021
        cc3021.params["DIVISION"] = "C";
        auto ccCache = std::make_shared<rule3021>();
        ccCache->airport = "*";
        ccCache->depStart = 0;
        ccCache->depEnd = 24 * 60 * 60 - 1;
        ccCache->dutyType = "*";
        ccCache->fltNumsVec = {"*"};
        ccCache->fleetsVec = {"*"};
        ccCache->assignment = {"*"};
        ccCache->dutyAssignments = {"*"};
        ccCache->airlines = {"*"};
        ccCache->courses = {"*"};
        ccCache->effDate = -1;
        ccCache->expDate = -1;
        ccCache->briefTime = 120; // CC = 2 hours
        cc3021.parsedParam = ccCache;
        ctx->addRuleFunction(RULES::CHECK_IN_OUT_BRIEF, cc3021);
    }

    fdRule.setDataContext(ctx);
    fdRule.setApplication(BATCH_LEGALITY);
    ccRule.setDataContext(ctx);
    ccRule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Segment>> segStorage;
    // 02:00 UTC => 10:00 local SIN (UTC+8)
    segStorage.push_back(makeSegment(
        "SIN", "FRA", "333", "SQ1", "2025-06-01 02:00:00", "2025-06-01 03:00:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");

    Duty fdDuty(segs);
    fdDuty.setMinBrief(60);
    fdDuty.setActualBriefMin(60);
    fdDuty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - 60 * 60);
    fdDuty.setStartTimeLocAct(fdDuty.getStartTimeUtcAct() + offsetMinutes * 60);
    fdDuty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    fdDuty.setEndTimeLocAct(fdDuty.getEndTimeUtcAct() + offsetMinutes * 60);
    fdDuty.setRefTimeZone(480);
    fdDuty.setCompositionName("Basic");

    Duty ccDuty(segs);
    ccDuty.setMinBrief(120);
    ccDuty.setActualBriefMin(120);
    ccDuty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - 120 * 60);
    ccDuty.setStartTimeLocAct(ccDuty.getStartTimeUtcAct() + offsetMinutes * 60);
    ccDuty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    ccDuty.setEndTimeLocAct(ccDuty.getEndTimeUtcAct() + offsetMinutes * 60);
    ccDuty.setRefTimeZone(480);
    ccDuty.setCompositionName("Basic");

    fdRule.CalculateDuty(&fdDuty);
    ccRule.CalculateDuty(&ccDuty);

    const int fdMax = fdDuty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
    const int ccMax = ccDuty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);

    EXPECT_EQ(fdMax, 13 * 60);
    EXPECT_EQ(ccMax, 14 * 60);
    EXPECT_EQ(ccMax - fdMax, 60);
}

TEST_F(Rule7410Test, CalculateRule_Uses7410WhenDutyFdpDoesNotExceedBaseLimit) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "SIN-*", "09:00", "14:00"),
        make7413Row(2, "*", "3", "SIN-*", "12:00", "16:00"),
        make7413Row(3, "*", "3", "SIN-*", "14:00", "19:00"),
    });

    CalculateAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 14:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");
    duty.setFDPInSecs(12 * 60 * 60);

    rule.CalculateDuty(&duty);

    EXPECT_EQ(duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), 13 * 60);
}

TEST_F(Rule7410Test, CalculateRule_Uses7413WhenDutyFdpExceedsBaseAnd7413RowMatches) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "SIN-*", "08:00", "14:00"),
        make7413Row(2, "*", "3", "SIN-*", "08:00", "16:00"),
        make7413Row(3, "*", "3", "SIN-*", "08:00", "19:00"),
    });

    CalculateAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");
    duty.setFDPInSecs(18 * 60 * 60);

    rule.CalculateDuty(&duty);

    EXPECT_EQ(duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), 19 * 60);
}

TEST_F(Rule7410Test, CalculateRule_Uses7413FdpRangeByDutyFdpBands) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 0));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "SIN-*", "09:00", "14:00", "SIN", "00:00-14:00"),
        make7413Row(2, "*", "3", "*-SIN", "09:00", "14:00", "!SIN", "00:00-14:00"),
        make7413Row(3, "*", "3", "SIN-*", "12:00", "16:00", "SIN", "14:01-16:00"),
        make7413Row(4, "*", "3", "*-SIN", "13:00", "16:00", "!SIN", "14:01-16:00"),
        make7413Row(5, "*", "3", "SIN-*", "14:00", "19:00", "SIN", "16:01-19:00"),
        make7413Row(6, "*", "3", "*-SIN", "15:00", "19:00", "!SIN", "16:01-19:00"),
    });

    CalculateAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    auto assertLimitForFdp = [&](int fdpHours, int expectedLimitHours) {
        std::vector<std::unique_ptr<Segment>> segStorage;
        segStorage.push_back(makeSegment(
            "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 15:00:00", true, ctx.get()));
        std::vector<Segment*> segs;
        std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                       [](auto& seg) { return seg.get(); });

        Duty duty(segs);
        duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
        duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
        const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
        duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
        duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
        duty.setRefTimeZone(480);
        duty.setCompositionName("Basic");
        duty.setFDPInSecs(fdpHours * 60 * 60);

        rule.CalculateDuty(&duty);
        EXPECT_EQ(duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), expectedLimitHours * 60);
    };

    assertLimitForFdp(14, 14);
    assertLimitForFdp(16, 16);
    assertLimitForFdp(18, 19);
}

TEST_F(Rule7410Test, CalculateRule_UsesBufferedFdpToAdvance7413Band) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 10));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "*-SIN", "09:00", "14:00", "!SIN", "00:00-14:00"),
        make7413Row(2, "*", "3", "*-*", "09:00", "16:00", "*", "14:01-16:00"),
    });

    CalculateAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "FRA", "SIN", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 12:45:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("FRA");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");
    duty.setFDPInSecs(14 * 60 * 60);

    rule.CalculateDuty(&duty);

    EXPECT_EQ(duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), 16 * 60);
}

TEST_F(Rule7410Test, CalculateRule_Uses7413WhenDutyStartAndHasSectorNotSinMatch) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "*", "08:00", "18:00", "SIN"),
        make7413Row(1, "*", "3", "*", "08:00", "19:00", "!SIN")
    });
    CalculateAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    {
        std::vector<std::unique_ptr<Segment>> segStorage;
        segStorage.push_back(makeSegment(
            "KUL", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
        std::vector<Segment*> segs;
        std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
            [](auto& seg) { return seg.get(); });

        Duty duty(segs);
        duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
        duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
        const int offsetMinutes = ctx->airportUtcOffsetMap.at("KUL");
        duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
        duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
        duty.setRefTimeZone(480);
        duty.setCompositionName("Basic");
        duty.setFDPInSecs(18 * 60 * 60);

        rule.CalculateDuty(&duty);

        EXPECT_EQ(duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), 19 * 60);
    }

    {
        std::vector<std::unique_ptr<Segment>> segStorage;
        segStorage.push_back(makeSegment(
            "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
        std::vector<Segment*> segs;
        std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
            [](auto& seg) { return seg.get(); });

        Duty duty(segs);
        duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
        duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
        const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
        duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
        duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
        duty.setRefTimeZone(480);
        duty.setCompositionName("Basic");
        duty.setFDPInSecs(18 * 60 * 60);

        rule.CalculateDuty(&duty);

        EXPECT_EQ(duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), 18 * 60);
    }
}

TEST_F(Rule7410Test, CalculateRule_DoesNotUse7413WhenDutyStartStationDoesNotMatch) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "*-*", "00:00", "19:00", "!SIN"),
    });

    CalculateAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");
    duty.setFDPInSecs(18 * 60 * 60);

    rule.CalculateDuty(&duty);

    EXPECT_EQ(duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), 13 * 60);
}

TEST_F(Rule7410Test, CalculateRule_DoesNotApply7413Without7410Match) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "06:00", "07:59", 1, 99, "13:00"));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "SIN-*", "09:00", "14:00"),
        make7413Row(2, "*", "3", "SIN-*", "12:00", "16:00"),
        make7413Row(3, "*", "3", "SIN-*", "14:00", "19:00"),
    });

    CalculateAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 14:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    // Report time 08:00 local SIN => outside 06:00-07:59, so 7410 doesn't match.
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    rule.CalculateDuty(&duty);

    EXPECT_EQ(duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), -1);
}

// Check rule: applies buffer minutes and flags violation only when beyond (maxFdp - buffer).
TEST_F(Rule7410Test, CheckRule_AppliesBufferBeforeViolation) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-02:00", "Basic", "*", "06:00", "07:59", 1, 3, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 30));

    CheckAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();
    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<RULE_VIOLATION*> violations;
    rule.setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "FRA", "333", "SQ1", "2025-06-01 22:00:00", "2025-06-02 10:00:00", true));
	vector<Segment*> segs;
	std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
		[](auto& seg) { return seg.get(); });

    Duty duty(segs);
	constexpr int reportMinutes = 0; // 0 hour report time
	constexpr int releaseMinutes = 30; // 30 minutes release time
	duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - reportMinutes * 60); // report 05:59 local SIN
	duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct() + releaseMinutes * 60);
    int offsetMintues = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeLocAct() + offsetMintues * 60);
    duty.setEndTimeLocAct(duty.getEndTimeLocAct() + offsetMintues * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    // MAX FDP = 13:00, buffer = 30 => limitWithBuffer = 12:30
    const int limitWithBufferMinutes = 13 * 60 - 30;

    // Exactly at limitWithBuffer => no violation.
    duty.setFDPInSecs(limitWithBufferMinutes * 60);
    EXPECT_TRUE(rule.CheckRule(&duty));

    // One minute beyond => violation.
    duty.setFDPInSecs((limitWithBufferMinutes + 1) * 60);
    EXPECT_FALSE(rule.CheckRule(&duty));

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7410Test, CheckRule_OneMinuteMaxFdpMeansCompositionRestFacilityCombinationNotAllowed) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "3P", "0", "00:00", "23:59", 1, 99, "00:01"));
    input.dbRules.push_back(makeTable2Control(true, false, 0));

    CheckAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 0;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<RULE_VIOLATION*> violations;
    rule.setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("3P");
    duty.setFDPInSecs(12 * 60 * 60);

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_NE(violations[0]->violation_msg.find("Duty 0 SIN-JFK"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("Composition 3P is not allowed"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("rest facility 0"), std::string::npos);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7410Test, CheckRule_ZeroMinuteMaxFdpAlsoMeansCompositionRestFacilityCombinationNotAllowed) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "3P", "0", "00:00", "23:59", 1, 99, "00:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 0));

    CheckAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 0;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<RULE_VIOLATION*> violations;
    rule.setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("3P");
    duty.setFDPInSecs(12 * 60 * 60);

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_NE(violations[0]->violation_msg.find("Duty 0 SIN-JFK"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("Composition 3P is not allowed"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("rest facility 0"), std::string::npos);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7410Test, CheckRule_Uses7413WhenDutyFdpExceedsBaseAnd7413RowMatches) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 0));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "SIN-*", "08:00", "19:00"),
    });

    CheckAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<RULE_VIOLATION*> violations;
    rule.setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    duty.setFDPInSecs(18 * 60 * 60);
    EXPECT_TRUE(rule.CheckRule(&duty));

    duty.setFDPInSecs(20 * 60 * 60);
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_NE(violations[0]->violation_msg.find("Duty 0 SIN-JFK"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("Max FDP Limit with Inflight Rest exceeded"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("duty start matches *"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("has-sector filter SIN-*"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("Matched sector: SIN-JFK"), std::string::npos);
    EXPECT_EQ(violations[0]->violation_msg.find("reportTimeDiff"), std::string::npos);
    EXPECT_EQ(violations[0]->violation_msg.find("CC augmented MaxFDP"), std::string::npos);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7410Test, CheckRule_UsesBufferedFdpToAdvance7413Band) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 10));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "*-SIN", "09:00", "14:00", "!SIN", "00:00-14:00"),
        make7413Row(2, "*", "3", "*-*", "09:00", "16:00", "*", "14:01-16:00"),
        make7413Row(3, "*", "3", "*-*", "09:00", "19:00", "*", "16:01-19:00"),
        make7413Row(4, "*", "3", "*-*", "09:00", "19:00", "*", "19:01-99:00"),
    });

    CheckAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<RULE_VIOLATION*> violations;
    rule.setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "FRA", "SIN", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 12:45:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("FRA");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    duty.setFDPInSecs(14 * 60 * 60);
    EXPECT_TRUE(rule.CheckRule(&duty));
    EXPECT_TRUE(violations.empty());

    duty.setFDPInSecs(19 * 60 * 60);
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_EQ(violations[0]->operation_result["ruleId"], "7413");
    EXPECT_EQ(violations[0]->operation_result["max_fdp"], "19:00");

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7410Test, CheckRule_Uses7413WhenDutyStartAndHasSectorNotSinMatch) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 0));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "!SIN-*", "08:00", "19:00", "!SIN"),
    });

    CheckAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<RULE_VIOLATION*> violations;
    rule.setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "KUL", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("KUL");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    duty.setFDPInSecs(18 * 60 * 60);
    EXPECT_TRUE(rule.CheckRule(&duty));

    duty.setFDPInSecs(20 * 60 * 60);
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_NE(violations[0]->violation_msg.find("Max FDP Limit with Inflight Rest exceeded"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("duty start matches !SIN"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("has-sector filter !SIN-*"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("Matched sector: KUL-JFK"), std::string::npos);
    EXPECT_EQ(violations[0]->violation_msg.find("reportTimeDiff"), std::string::npos);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7410Test, CheckRule_7413MessageOmitsReportTimeDiffAndMatchedSectorWhenHasSectorAny) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 0, "", "", true));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "*", "08:00", "19:00"),
    });

    CheckAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    // Provide FD report-time definition so report time difference is available.
    {
        DBRule fd3021{};
        fd3021.function = RULES::CHECK_IN_OUT_BRIEF; // 3021
        fd3021.params["DIVISION"] = "P";
        auto fdCache = std::make_shared<rule3021>();
        fdCache->airport = "*";
        fdCache->depStart = 0;
        fdCache->depEnd = 24 * 60 * 60 - 1;
        fdCache->dutyType = "*";
        fdCache->fltNumsVec = {"*"};
        fdCache->fleetsVec = {"*"};
        fdCache->assignment = {"*"};
        fdCache->dutyAssignments = {"*"};
        fdCache->airlines = {"*"};
        fdCache->courses = {"*"};
        fdCache->effDate = -1;
        fdCache->expDate = -1;
        fdCache->briefTime = 60;
        fd3021.parsedParam = fdCache;
        ctx->addRuleFunction(RULES::CHECK_IN_OUT_BRIEF, fd3021);
    }

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<RULE_VIOLATION*> violations;
    rule.setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setMinBrief(90);        // CC report
    duty.setActualBriefMin(90);  // CC report fallback
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");
    duty.setFDPInSecs(20 * 60 * 60);

    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_NE(violations[0]->violation_msg.find("Max FDP Limit with Inflight Rest exceeded"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("minimum block time 8:00"), std::string::npos);
    EXPECT_EQ(violations[0]->violation_msg.find("Matched sector:"), std::string::npos);
    EXPECT_EQ(violations[0]->violation_msg.find("reportTimeDiff"), std::string::npos);
    EXPECT_EQ(violations[0]->violation_msg.find("report time difference"), std::string::npos);

    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7410Test, CheckRule_Uses7410When7413RowsDoNotMatch) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 0));

    input.dependDbRules.emplace(7413, std::vector<DBRule>{
        make7413Row(1, "*", "3", "SIN-*", "09:00", "19:00"),
    });

    CheckAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    FLEET fleet{};
    fleet.fleet = "333";
    fleet.restfacility = 3;
    ctx->fleetMap[fleet.fleet] = fleet;

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<RULE_VIOLATION*> violations;
    rule.setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "JFK", "333", "SQ1", "2025-06-01 00:00:00", "2025-06-01 08:30:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    duty.setFDPInSecs(14 * 60 * 60);
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_NE(violations[0]->violation_msg.find("sector block time 8:30"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("rest facility 3"), std::string::npos);
    
    for (auto* rv : violations) {
        delete rv;
    }
}

TEST_F(Rule7410Test, CheckRule_ViolationMessageIncludesReportTimeDiffWhenEnabled) {
    RuleInput input;
    input.dbRules.push_back(makeTable1Row(
        1, "00:00-24:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00"));
    input.dbRules.push_back(makeTable2Control(true, false, 0, "", "", true));

    CheckAnrMaxFdpRule rule(nullptr, input);
    auto ctx = buildDataContextFor7410();

    // Provide 3021 definition for FD report time (division P).
    {
        DBRule fd3021{};
        fd3021.function = RULES::CHECK_IN_OUT_BRIEF; // 3021
        fd3021.params["DIVISION"] = "P";
        auto fdCache = std::make_shared<rule3021>();
        fdCache->airport = "*";
        fdCache->depStart = 0;
        fdCache->depEnd = 24 * 60 * 60 - 1;
        fdCache->dutyType = "*";
        fdCache->fltNumsVec = {"*"};
        fdCache->fleetsVec = {"*"};
        fdCache->assignment = {"*"};
        fdCache->dutyAssignments = {"*"};
        fdCache->airlines = {"*"};
        fdCache->courses = {"*"};
        fdCache->effDate = -1;
        fdCache->expDate = -1;
        fdCache->briefTime = 60; // FD = 1 hour
        fd3021.parsedParam = fdCache;
        ctx->addRuleFunction(RULES::CHECK_IN_OUT_BRIEF, fd3021);
    }

    rule.setDataContext(ctx);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<RULE_VIOLATION*> violations;
    rule.setRuleViolation(&violations);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment(
        "SIN", "FRA", "333", "SQ1", "2025-06-01 02:00:00", "2025-06-01 03:00:00", true, ctx.get()));
    std::vector<Segment*> segs;
    std::transform(segStorage.begin(), segStorage.end(), std::back_inserter(segs),
                   [](auto& seg) { return seg.get(); });

    Duty duty(segs);
    // CC report time is 90 minutes; FD report time is 60 minutes => delta = +30 minutes.
    duty.setMinBrief(90);
    duty.setActualBriefMin(90);

    const int offsetMinutes = ctx->airportUtcOffsetMap.at("SIN");
    duty.setStartTimeUtcAct(segs.front()->getStartTimeUtcAct() - 90 * 60);
    duty.setStartTimeLocAct(duty.getStartTimeUtcAct() + offsetMinutes * 60);
    duty.setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    duty.setEndTimeLocAct(duty.getEndTimeUtcAct() + offsetMinutes * 60);
    duty.setRefTimeZone(480);
    duty.setCompositionName("Basic");

    duty.setFDPInSecs(14 * 60 * 60);
    EXPECT_FALSE(rule.CheckRule(&duty));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_NE(violations[0]->violation_msg.find("Duty 0 SIN-FRA"), std::string::npos);
    EXPECT_NE(violations[0]->violation_msg.find("reportTimeDiff=+30m"), std::string::npos);
    
    for (auto* rv : violations) {
        delete rv;
    }
}

namespace {
	std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments, const std::string& assignment = "FLY") {
		auto duty = std::make_unique<Duty>(segments);
		duty->setAssignment(assignment);
		if (!segments.empty()) {
			duty->setDepartureStation(segments.front()->getDepSta());
			duty->setArrivalStation(segments.back()->getArrSta());
			duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
			duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
		}
		duty->resetTypeBySegments();
		return duty;
	}

	std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& base, CrewDataContext* ctx) {
		auto pg = std::make_unique<Pairing>(duties);
		createPairingNodeOfDuty(pg.get(), ctx);
		return pg;
	}
}

class Rule7410CheckTest : public ::testing::Test {
protected:
    Rule7410CheckTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildDataContextFor7410()) {
		RuleParams::GetInstancePtr()->setApplication(BATCH_LEGALITY);
	}
    
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Duty>> dutyStore;
    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

TEST_F(Rule7410CheckTest, CheckRuleFromHigherLevel) {
    // Setup rule in context
    std::vector<DBRule> rules = {makeTable1Row(
        1, "00:00-02:00", "Basic", "*", "00:00", "23:59", 1, 99, "13:00")};
    rules.push_back(makeTable2Control(true, false, 0)); // No buffer

    _dataContext->ruleList.clear();
    _dataContext->ruleList.push_back(rules[0]);
    _dataContext->ruleList.push_back(rules[1]);

    _checker.setDataContext(_dataContext, -1, false);
    
    vector<int> checkRules;
    checkRules.push_back(static_cast<int>(rules[0].function));

    // --- Fail case: FDP is > 13:00 ---
    {
        segStore.clear();
        dutyStore.clear();
        std::vector<Duty*> duties;
        // Segment is 12h 1m long. With 1h report, FDP is 13h 1m.
        segStore.push_back(makeSegment(
            "SIN", "FRA", "333", "SQ1", "2025-06-01 23:00:00", "2025-06-02 11:01:00", true));
        dutyStore.push_back(makeDuty({segStore.back().get()}));
        Duty* d = dutyStore.back().get();
        duties.push_back(d);

        constexpr int reportMinutes = 60;
        constexpr int releaseMinutes = 30;
        d->setStartTimeUtcAct(d->getSegmentsRead().front()->getStartTimeUtcAct() - reportMinutes * 60);
        d->setEndTimeUtcAct(d->getSegmentsRead().back()->getEndTimeUtcAct() + releaseMinutes * 60);
        int offsetMintues = _dataContext->airportUtcOffsetMap.at(segStore.front()->getDepStation());
        d->setStartTimeLocAct(d->getStartTimeUtcAct() + offsetMintues * 60);
        d->setEndTimeLocAct(d->getEndTimeUtcAct() + offsetMintues * 60);
        d->setRefTimeZone(480); // SIN
        d->setCompositionName("Basic");
		d->setFDPInSecs(13 * 60 * 60 + 60); // 13h 1m

        auto pairing = makePairing(duties, "SIN", _dataContext.get());
        EXPECT_FALSE(_checker.checkPGRules(pairing.get(), checkRules));
    }

    // --- Pass case: FDP is <= 13:00 ---
    {
        segStore.clear();
        dutyStore.clear();
        std::vector<Duty*> duties;
        // Segment is 12h long. With 1h report, FDP is 13h.
        segStore.push_back(makeSegment(
            "SIN", "FRA", "333", "SQ1", "2025-06-01 23:00:00", "2025-06-02 11:00:00", true));
        dutyStore.push_back(makeDuty({segStore.back().get()}));
        Duty* d = dutyStore.back().get();
        auto offsetMin = DutyUtils::GetTimeZoneOffsetByDep(*d, _dataContext);
        d->setStartTimeLocAct(d->getStartTimeUtcAct() + offsetMin * 60);
        d->setEndTimeLocAct(d->getEndTimeUtcAct() + DutyUtils::GetTimeZoneOffsetByArr(*d, _dataContext));
        duties.push_back(d);

        constexpr int reportMinutes = 60;
        constexpr int releaseMinutes = 30;
        d->setStartTimeUtcAct(d->getSegmentsRead().front()->getStartTimeUtcAct() - reportMinutes * 60);
        d->setEndTimeUtcAct(d->getSegmentsRead().back()->getEndTimeUtcAct() + releaseMinutes * 60);
        d->setRefTimeZone(480); // SIN
        d->setCompositionName("Basic");
		d->setFDPInSecs(13 * 60 * 60); // 13h

        auto pairing = makePairing(duties, "SIN", _dataContext.get());
        EXPECT_TRUE(_checker.checkPGRules(pairing.get(), checkRules));
    }
}

TEST_F(Rule7410CheckTest, UlrDutyIsExemptAndSetsMaxFdpLimitToCurrentFdp) {
    // Setup rule in context
    std::vector<DBRule> rules = {makeTable1Row(
        1, "00:00-23:59", "*", "*", "00:00", "23:59", 1, 99, "13:00")};
    rules.push_back(makeTable2Control(true, false, 0, "4P", "0")); // No buffer, enable ULR exemption for "Basic" + rest facility 0

    // Configure 7405 ULR duty definition so setULR() marks this duty as ULR.
    DBRule ulrDef{};
    ulrDef.idRule = 7405001;
    ulrDef.function = 7405;
    ulrDef.tableNum = 1;
    ulrDef.rowNum = 1;
    ulrDef.idRuleParam = 208174050;
    ulrDef.params["DEP"] = "SIN";
    ulrDef.params["ARR"] = "FRA";
    ulrDef.params["Fleet"] = "*";
    ulrDef.params["Fleet Group"] = "*";
    ulrDef.params["Effective Date"] = "*";
    ulrDef.params["Expiry Date"] = "*";
    rules.push_back(ulrDef);

    _dataContext->ruleList.clear();
    for (const auto& r : rules) {
        _dataContext->ruleList.push_back(r);
    }

    _checker.setDataContext(_dataContext, -1, false);

    // Build a single ULR duty with FDP well above the table limit.
    segStore.clear();
    dutyStore.clear();
    std::vector<Duty*> duties;
    segStore.push_back(makeSegment(
        "SIN", "FRA", "359", "SQ326", "2025-06-01 00:00:00", "2025-06-01 20:00:00", true, _dataContext.get()));
    dutyStore.push_back(makeDuty({segStore.back().get()}));
    Duty* duty = dutyStore.back().get();
    duties.push_back(duty);

    duty->setCompositionName("4P");
    duty->setRefTimeZone(480);
    constexpr int currentFdpMinutes = 20 * 60; // 20 hours
    duty->setFDPInSecs(currentFdpMinutes * 60);

    auto pairing = makePairing(duties, "SIN", _dataContext.get());

    std::vector<int> checkRules;
    checkRules.push_back(static_cast<int>(rules[0].function));

    EXPECT_TRUE(_checker.checkPGRules(pairing.get(), checkRules));
    EXPECT_TRUE(duty->isULR());
    EXPECT_EQ(duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP), currentFdpMinutes);
}

TEST_F(Rule7410CheckTest, UlrDutyExemptionRequiresRestFacilityMatch) {
    // Setup rule in context
    std::vector<DBRule> rules = {makeTable1Row(
        1, "00:00-23:59", "*", "*", "00:00", "23:59", 1, 99, "13:00")};
    rules.push_back(makeTable2Control(true, false, 0, "4P", "3")); // rest facility mismatch (duty computed as 0)

    // Configure 7405 ULR duty definition so setULR() marks this duty as ULR.
    DBRule ulrDef{};
    ulrDef.idRule = 7405001;
    ulrDef.function = 7405;
    ulrDef.tableNum = 1;
    ulrDef.rowNum = 1;
    ulrDef.idRuleParam = 208174050;
    ulrDef.params["DEP"] = "SIN";
    ulrDef.params["ARR"] = "FRA";
    ulrDef.params["Fleet"] = "*";
    ulrDef.params["Fleet Group"] = "*";
    ulrDef.params["Effective Date"] = "*";
    ulrDef.params["Expiry Date"] = "*";
    rules.push_back(ulrDef);

    _dataContext->ruleList.clear();
    for (const auto& r : rules) {
        _dataContext->ruleList.push_back(r);
    }

    _checker.setDataContext(_dataContext, -1, false);

    segStore.clear();
    dutyStore.clear();
    std::vector<Duty*> duties;
    segStore.push_back(makeSegment(
        "SIN", "FRA", "359", "SQ326", "2025-06-01 00:00:00", "2025-06-01 20:00:00", true, _dataContext.get()));
    dutyStore.push_back(makeDuty({segStore.back().get()}));
    Duty* duty = dutyStore.back().get();
    duties.push_back(duty);

    duty->setCompositionName("4P");
    duty->setRefTimeZone(480);
    constexpr int currentFdpMinutes = 20 * 60; // 20 hours
    duty->setFDPInSecs(currentFdpMinutes * 60);

    auto pairing = makePairing(duties, "SIN", _dataContext.get());

    std::vector<int> checkRules;
    checkRules.push_back(static_cast<int>(rules[0].function));

    EXPECT_FALSE(_checker.checkPGRules(pairing.get(), checkRules));
    EXPECT_TRUE(duty->isULR());
}
