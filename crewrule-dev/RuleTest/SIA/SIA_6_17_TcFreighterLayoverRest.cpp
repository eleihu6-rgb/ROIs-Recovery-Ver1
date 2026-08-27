// SIA_SUITE_SUMMARY_START
// SuiteId: 6.17
// Name: TC (Freighter) Layover Rest
// SourceCsvRow: 85
// Status: IMPLEMENTED
// ImplementedCases:
//   - OneNightLayover_SoftAlert: 1 night rest in JNB fails 2LN minimum.
//   - TwoNightsLayover_Compliant: 2 nights rest in JNB meets 2LN minimum.
// Results:
//   - TODO
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7421/AcopSlipPatternRule.h"
#include "RuleEngine/rule/rule7421/AcopSlipPatternRuleParam.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"
#include "SIA_CommonTestConfig.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

// Forward declarations from rule7421_gtest.cpp
namespace {
DBRule makeAcopTableBRow(long long ruleId, int rowNum, const std::string& clause, const std::string& pattern,
                         const std::string& slipStation, int priority, const std::string& dutyBefore,
                         const std::string& dutyAfter, const std::string& reportTimeWindow,
                         const std::string& prevSlipLocalNights, const std::string& prevSlipHadStandby,
                         const std::string& minSlipHours, const std::string& minSlipLocalNights,
                         const std::string& dutyAfterHours, const std::string& dutyAfterLocalNights,
                         const std::string& dutyAfterLocalTime, const std::string& maxStandbyPeriods,
                         const std::string& maxStandbyHours, const std::string& allowedDutyWithinSlip,
                         const std::string& doAfterDuty, const std::string& extraCondition,
                         const std::string& slipDepartDutyReportTime = "*", const std::string& group = "DEFAULT");
}

class SIA_6_17_TcFreighterLayoverRestTest : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _ctx = makeContext();
        // From user spec: 1h report, 30m debrief, 1h transportation (drop off) time.
        _pickupMin = 60; // 1 hour for pickup
        _dropoffMin = 60; // 1 hour for dropoff (transportation)
        _debriefMin = 30; // 30 minutes for debrief
    }

    void TearDown() override {
        for (auto& kv : _ctx->airportCodeMap) {
            delete kv.second;
        }
        _ctx->airportCodeMap.clear();
        for (auto* v : _violations) {
            delete v;
        }
    }

    std::shared_ptr<CrewDataContext> makeContext() {
        auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
        addAirport(ctx, "SIN", "SG", "SEA", 8 * 60);
        addAirport(ctx, "JNB", "ZA", "AFR", 2 * 60);
        addAirport(ctx, "NBO", "KE", "AFR", 3 * 60);
        addAirport(ctx, "AMS", "NL", "EU", 1 * 60); // Assuming DST
        ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
        ctx->airportZoneIdMap["JNB"] = "Africa/Johannesburg";
        ctx->airportZoneIdMap["NBO"] = "Africa/Nairobi";
        ctx->airportZoneIdMap["AMS"] = "Europe/Amsterdam";
        ctx->airportUtcOffsetMap["SIN"] = 8 * 60;
        ctx->airportUtcOffsetMap["JNB"] = 2 * 60;
        ctx->airportUtcOffsetMap["NBO"] = 3 * 60;
        ctx->airportUtcOffsetMap["AMS"] = 1 * 60;
        return ctx;
    }

    void addAirport(std::shared_ptr<CrewDataContext>& ctx, const char* code, const char* country, const char* category, int tzOffsetMinutes) {
        auto* a = new DBAirport();
        std::strncpy(a->airport, code, 3);
        a->airport[3] = '\0';
        std::strncpy(a->country, country, 2);
        a->country[2] = '\0';
        a->category = category;
        a->utcOffsetMinutes = tzOffsetMinutes;
        ctx->airportCodeMap[code] = a;
    }

    std::unique_ptr<Segment> makeFlight(const std::string& dep, const std::string& arr,
                                        const std::string& depLocStr, const std::string& arrLocStr,
                                        const std::string& flightNumber, bool isOperating = true) {
        auto seg = std::make_unique<Segment>();
        seg->setDepStation(dep);
        seg->setArrStation(arr);
        seg->setFlightNumber(flightNumber);
        seg->setIsOperating(isOperating);
        if (!isOperating) {
            seg->setAssignment("MVP"); 
        }

        time_t depUtc = localStrToUtc(const_cast<char*>(depLocStr.c_str()), _ctx->airportCodeMap[dep]->utcOffsetMinutes);
        time_t arrUtc = localStrToUtc(const_cast<char*>(arrLocStr.c_str()), _ctx->airportCodeMap[arr]->utcOffsetMinutes);
        time_t depLoc = utcStrToUtc(const_cast<char*>(depLocStr.c_str()));
        time_t arrLoc = utcStrToUtc(const_cast<char*>(arrLocStr.c_str()));
        
        seg->setBlkTime(arrUtc > depUtc ? arrUtc - depUtc : 0);
        seg->setStartTimeUtcSch(depUtc);
        seg->setEndTimeUtcSch(arrUtc);
        seg->setStartTimeUtcAct(depUtc);
        seg->setEndTimeUtcAct(arrUtc);
        seg->setStartTimeLocSch(depLoc);
        seg->setEndTimeLocSch(arrLoc);
        seg->setStartTimeLocAct(depLoc);
        seg->setEndTimeLocAct(arrLoc);
        return seg;
    }

    std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments, const std::string& assignment = "FLY") {
        auto duty = std::make_unique<Duty>(segments);
        duty->setDepartureStation(segments.front()->getDepStation());
        duty->setArrivalStation(segments.back()->getArrStation());
        // Duty start includes pickup, end includes debrief
        duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch() - _pickupMin * 60);
        duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch() + _debriefMin * 60);
        duty->setStartTimeLocSch(segments.front()->getStartTimeLocSch() - _pickupMin * 60);
        duty->setEndTimeLocSch(segments.back()->getEndTimeLocSch() + _debriefMin * 60);
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct() - _pickupMin * 60);
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct() + _debriefMin * 60);
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct() - _pickupMin * 60);
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct() + _debriefMin * 60);
        duty->setActualPickupMin(_pickupMin);
        duty->setActualDropoffMin(_dropoffMin); // Transportation after duty
        duty->setAssignment(assignment);

        long blockTimeInMinutes = 0;
        for(const auto* seg : segments) {
            blockTimeInMinutes += seg->getBlkMinutes();
        }
        long dpInMinutes = _pickupMin + blockTimeInMinutes + _debriefMin; // brief + blk + debrief
        duty->setPlanDP(dpInMinutes);
        duty->setActualDP(dpInMinutes);

        return duty;
    }

    void attachPairingNodes(Pairing& pairing) {
        for (std::size_t i = 0; i < pairing.getNumDuties(); ++i) {
            Duty* duty = pairing.getDuty(i);
            if (!duty) {
                continue;
            }
            createPairingNodeOfDuty(duty, _ctx.get(), &pairing);
        }
    }

    void runRule(Pairing& pairing, const RuleInput& input) {
        AcopSlipPatternRule rule(nullptr, input);
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
        rule.setRuleViolation(&_violations);
        rule.setViolations(&_violationMsgs);
        rule.CheckRule(&pairing);
    }

    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMsgs;
    int _pickupMin = 0;
    int _dropoffMin = 0;
    int _debriefMin = 0;
    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
};


// Test Case: One night layover in JNB -> Soft Alert (violates 2LN min)
TEST_F(SIA_6_17_TcFreighterLayoverRestTest, OneNightLayover_SoftAlert) {
    RuleInput input;
    // Hard rule: min 24h rest, 1 LN
    input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "TC_Freighter_Layover", "*", "JNB", 2, "MVP", "FLY", "*", "*", "*", "24:00", "1", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "H";
    // Soft rule: min 48h rest, 2 LN
    input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "TC_Freighter_Layover", "*", "JNB", 1, "MVP", "FLY", "*", "*", "*", "48:00", "2", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "S";
    DBRule controlRow{};
    controlRow.idRule = 7421001; controlRow.function = 7421; controlRow.tableNum = 2; controlRow.rowNum = 1;
    controlRow.params["Rest Starts After"] = "TRANSPORT";
    input.dbRules.push_back(controlRow);

    std::vector<std::unique_ptr<Segment>> segStorage;
    // Duty 1: PU SQ 478 SIN-JNB (Arr JNB 2025-01-11 04:10 JNB LT)
    segStorage.push_back(makeFlight("SIN", "JNB", "2025-01-10 17:30:00", "2025-01-11 04:10:00", "478", false));
    auto duty1 = makeDuty({segStorage.back().get()}, "MVP");
    
    // Duty 2: SQ 7344 JNB-NBO (Dep JNB 2025-01-12 16:50 JNB LT) - Layover 1 night
    segStorage.push_back(makeFlight("JNB", "NBO", "2025-01-12 16:50:00", "2025-01-12 21:10:00", "7344"));
    auto duty2 = makeDuty({segStorage.back().get()}, "FLY");

    // Duty 3: SQ 7343 NBO-AMS
    segStorage.push_back(makeFlight("NBO", "AMS", "2025-01-12 23:50:00", "2025-01-13 09:15:00", "7343"));
    auto duty3 = makeDuty({segStorage.back().get()}, "FLY");

    // Duty 4: PU SQ 323 AMS-SIN
    segStorage.push_back(makeFlight("AMS", "SIN", "2025-01-15 09:25:00", "2025-01-15 21:55:00", "323", false));
    auto duty4 = makeDuty({segStorage.back().get()}, "MVP");

    Pairing pairing({duty1.get(), duty2.get(), duty3.get(), duty4.get()});
    pairing.setBase("SIN");
    attachPairingNodes(pairing);
    runRule(pairing, input);

    ASSERT_EQ(_violations.size(), 1);
    EXPECT_EQ(_violations[0]->ruleParamId, 742100000 + 2); // Soft violation
}

// Test Case: Two nights layover in JNB -> Compliant (meets 2LN min)
TEST_F(SIA_6_17_TcFreighterLayoverRestTest, TwoNightsLayover_Compliant) {
    RuleInput input;
    // Hard rule: min 24h rest, 1 LN
    input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "TC_Freighter_Layover", "*", "JNB", 2, "MVP", "FLY", "*", "*", "*", "24:00", "1", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "H";
    // Soft rule: min 48h rest, 2 LN
    input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "TC_Freighter_Layover", "*", "JNB", 1, "MVP", "FLY", "*", "*", "*", "48:00", "2", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "S";
    DBRule controlRow{};
    controlRow.idRule = 7421001; controlRow.function = 7421; controlRow.tableNum = 2; controlRow.rowNum = 1;
    controlRow.params["Rest Starts After"] = "TRANSPORT";
    input.dbRules.push_back(controlRow);

    std::vector<std::unique_ptr<Segment>> segStorage;
    // Duty 1: PU SQ 478 SIN-JNB (Arr JNB 2025-01-11 04:10 JNB LT)
    segStorage.push_back(makeFlight("SIN", "JNB", "2025-01-10 17:30:00", "2025-01-11 04:10:00", "478", false));
    auto duty1 = makeDuty({segStorage.back().get()}, "MVP");

    // Duty 2: SQ 7344 JNB-NBO (Dep JNB 2025-01-13 16:50 JNB LT) - Layover 2 nights
    segStorage.push_back(makeFlight("JNB", "NBO", "2025-01-13 16:50:00", "2025-01-13 21:10:00", "7344"));
    auto duty2 = makeDuty({segStorage.back().get()}, "FLY");

    // Duty 3: SQ 7343 NBO-AMS
    segStorage.push_back(makeFlight("NBO", "AMS", "2025-01-13 23:50:00", "2025-01-14 09:15:00", "7343"));
    auto duty3 = makeDuty({segStorage.back().get()}, "FLY");

    // Duty 4: PU SQ 323 AMS-SIN
    segStorage.push_back(makeFlight("AMS", "SIN", "2025-01-16 09:25:00", "2025-01-16 21:55:00", "323", false));
    auto duty4 = makeDuty({segStorage.back().get()}, "MVP");

    Pairing pairing({duty1.get(), duty2.get(), duty3.get(), duty4.get()});
    pairing.setBase("SIN");
    attachPairingNodes(pairing);
    runRule(pairing, input);

    EXPECT_TRUE(_violations.empty());
}


// Minimal copy of makeAcopTableBRow from rule7421_gtest.cpp to make this file self-contained.
namespace {
DBRule makeAcopTableBRow(long long ruleId, int rowNum, const std::string& clause, const std::string& pattern,
                         const std::string& slipStation, int priority, const std::string& dutyBefore,
                         const std::string& dutyAfter, const std::string& reportTimeWindow,
                         const std::string& prevSlipLocalNights, const std::string& prevSlipHadStandby,
                         const std::string& minSlipHours, const std::string& minSlipLocalNights,
                         const std::string& dutyAfterHours, const std::string& dutyAfterLocalNights,
                         const std::string& dutyAfterLocalTime, const std::string& maxStandbyPeriods,
                         const std::string& maxStandbyHours, const std::string& allowedDutyWithinSlip,
                         const std::string& doAfterDuty, const std::string& extraCondition,
                         const std::string& slipDepartDutyReportTime, const std::string& group) {
    auto deriveSlipIsOperating = [](const std::string& dutyAssignmentFilter) -> std::string {
        const std::string trimmedUpper = strToUpper(trim(dutyAssignmentFilter));
        if (trimmedUpper.empty() || trimmedUpper == "*") { return "*"; }
        std::vector<std::string> tokens;
        split(trimmedUpper.c_str(), '|', tokens);
        bool hasOperating = false;
        bool hasPositioning = false;
        for (const auto& t : tokens) {
            const std::string token = strToUpper(trim(t));
            if (token == "FLY" || token == "MVO") { hasOperating = true; }
            if (token == "MVP") { hasPositioning = true; }
        }
        if (hasOperating && !hasPositioning) return "Y";
        if (!hasOperating && hasPositioning) return "N";
        return "*";
    };

    DBRule rule{};
    rule.idRule = ruleId;
    rule.function = 7421;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 742100000 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SQ";
    rule.params["Clause"] = clause;
    rule.params["Pattern"] = pattern;
    rule.params["Slip station"] = slipStation;
    rule.params["Group"] = group;
    rule.params["Priority"] = std::to_string(priority);
    rule.params["Slip Arr Is Operating"] = deriveSlipIsOperating(dutyBefore);
    rule.params["Slip Dep Is Operating"] = deriveSlipIsOperating(dutyAfter);
    rule.params["Duty Assignment before slip"] = dutyBefore;
    rule.params["Duty Assignment after slip"] = dutyAfter;
    rule.params["Reporting time at base"] = reportTimeWindow;
    rule.params["Previous Slip Local Nights"] = prevSlipLocalNights;
    rule.params["Previous Slip had standby"] = prevSlipHadStandby;
    rule.params["Min slip hours"] = minSlipHours;
    rule.params["Min slip local nights"] = minSlipLocalNights;
    rule.params["Min Slip Dep Time after LN"] = slipDepartDutyReportTime;
    rule.params["Duty After Hours"] = dutyAfterHours;
    rule.params["Duty After Local Nights"] = dutyAfterLocalNights;
    rule.params["Duty Time After LN"] = dutyAfterLocalTime;
    rule.params["Max Standby periods"] = maxStandbyPeriods;
    rule.params["Max standby hours"] = maxStandbyHours;
    rule.params["Allowed duty within slip"] = allowedDutyWithinSlip;
    rule.params["DO after duty"] = doAfterDuty;
    rule.params["Extra Condition"] = extraCondition;
    return rule;
}
}