// SIA_SUITE_SUMMARY_START
// SuiteId: 6.12
// Name: CC Positioning Rest (Asia & SWP Welfare)
// SourceCsvRow: 97
// Status: IMPLEMENTED
// ImplementedCases:
//   - SINSydShortRest_SoftAlert: SIN-SYD positioning with 12h40m rest (1LN) gives soft alert.
//   - SINSydCompliantRest: SIN-SYD positioning with 23h05m rest (1LN) is compliant.
//   - SINICNShortRest_SoftAlert: SIN-ICN positioning with 17h15m rest (1LN) gives soft alert.
//   - SINICNCompliantRest: SIN-ICN positioning with 22h40m rest (1LN) is compliant.
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

class SIA_6_12_PositioningRestAsiaSwpTest : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _ctx = makeContext();
        // From user spec: 1h report, 30m debrief, 1h transport (dropoff).
        _pickupMin = 60;
        _dropoffMin = 30 + 60;
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
        addAirport(ctx, "SYD", "AU", "SWP", 11 * 60); // Jan is DST
        addAirport(ctx, "ICN", "KR", "SEA", 9 * 60);
        ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
        ctx->airportZoneIdMap["SYD"] = "Australia/Sydney";
        ctx->airportZoneIdMap["ICN"] = "Asia/Seoul";
        ctx->airportUtcOffsetMap["SIN"] = 8 * 60;
        ctx->airportUtcOffsetMap["SYD"] = 11 * 60;
        ctx->airportUtcOffsetMap["ICN"] = 9 * 60;
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
                                        const std::string& depLocStr, const std::string& arrLocStr, bool isOperating = true) {
        auto seg = std::make_unique<Segment>();
        seg->setDepStation(dep);
        seg->setArrStation(arr);
        seg->setIsOperating(isOperating);
        if (!isOperating) {
            seg->setAssignment("MVP"); // MVP = Must-Go-Passenger (Positioning)
        }

        time_t depUtc = localStrToUtc(const_cast<char*>(depLocStr.c_str()), _ctx->airportCodeMap[dep]->utcOffsetMinutes);
        time_t arrUtc = localStrToUtc(const_cast<char*>(arrLocStr.c_str()), _ctx->airportCodeMap[arr]->utcOffsetMinutes);
        time_t depLoc = utcStrToUtc(const_cast<char*>(depLocStr.c_str()));
        time_t arrLoc = utcStrToUtc(const_cast<char*>(arrLocStr.c_str()));

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
        duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch());
        duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch());
        duty->setStartTimeLocSch(segments.front()->getStartTimeLocSch());
        duty->setEndTimeLocSch(segments.back()->getEndTimeLocSch());
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
        duty->setAssignment(assignment);
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
    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
};

// Test Cases
// Case 1: SIN-SYD short rest
TEST_F(SIA_6_12_PositioningRestAsiaSwpTest, SINSydShortRest_SoftAlert) {
    RuleInput input;
    // Hard rule: min 10h rest, 0 LN (to ensure it passes, letting soft rule trigger)
    input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "ASIA_SWP_Welfare", "*", "SYD", 2, "MVP", "*", "*", "*", "*", "10:00", "0", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "H";
    // Soft rule: min 22h rest, 1 LN
    input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "ASIA_SWP_Welfare", "*", "SYD", 1, "MVP", "*", "*", "*", "*", "22:00", "1", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "S";
    DBRule controlRow{};
    controlRow.idRule = 7421001; controlRow.function = 7421; controlRow.tableNum = 2; controlRow.rowNum = 1;
    controlRow.params["Rest Starts After"] = "TRANSPORT";
    input.dbRules.push_back(controlRow);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeFlight("SIN", "SYD", "2025-01-10 23:15:00", "2025-01-11 06:45:00", false)); // PU is MVP
    auto duty1 = makeDuty({segStorage.back().get()}, "MVP");
    duty1->setActualDropoffMin(_dropoffMin);

    segStorage.push_back(makeFlight("SYD", "SIN", "2025-01-11 21:55:00", "2025-01-12 06:15:00"));
    auto duty2 = makeDuty({segStorage.back().get()}, "FLY");
    duty2->setActualPickupMin(_pickupMin);

    Pairing pairing({duty1.get(), duty2.get()});
    pairing.setBase("SIN");
    attachPairingNodes(pairing);
    runRule(pairing, input);

    ASSERT_EQ(_violations.size(), 1);
    EXPECT_EQ(_violations[0]->ruleParamId, 742100000 + 2); // Soft violation
}

// Case 2: SIN-SYD compliant rest
TEST_F(SIA_6_12_PositioningRestAsiaSwpTest, SINSydCompliantRest) {
    RuleInput input;
    // Hard rule: min 10h rest, 0 LN (to ensure it passes, letting soft rule trigger)
    input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "ASIA_SWP_Welfare", "*", "SYD", 2, "MVP", "*", "*", "*", "*", "10:00", "0", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "H";
    // Soft rule: min 22h rest, 1 LN
    input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "ASIA_SWP_Welfare", "*", "SYD", 1, "MVP", "*", "*", "*", "*", "22:00", "1", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "S";
    DBRule controlRow{};
    controlRow.idRule = 7421001; controlRow.function = 7421; controlRow.tableNum = 2; controlRow.rowNum = 1;
    controlRow.params["Rest Starts After"] = "TRANSPORT";
    input.dbRules.push_back(controlRow);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeFlight("SIN", "SYD", "2025-01-10 12:45:00", "2025-01-10 20:20:00", false)); // PU is MVP
    auto duty1 = makeDuty({segStorage.back().get()}, "MVP");
    duty1->setActualDropoffMin(_dropoffMin);

    segStorage.push_back(makeFlight("SYD", "SIN", "2025-01-11 21:55:00", "2025-01-12 06:15:00"));
    auto duty2 = makeDuty({segStorage.back().get()}, "FLY");
    duty2->setActualPickupMin(_pickupMin);

    Pairing pairing({duty1.get(), duty2.get()});
    pairing.setBase("SIN");
    attachPairingNodes(pairing);
    runRule(pairing, input);

    EXPECT_TRUE(_violations.empty());
}

// Case 3: SIN-ICN short rest
TEST_F(SIA_6_12_PositioningRestAsiaSwpTest, SINICNShortRest_SoftAlert) {
    RuleInput input;
    // Hard rule: min 10h rest, 0 LN (to ensure it passes, letting soft rule trigger)
    input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "ASIA_SWP_Welfare", "*", "ICN", 2, "FLY", "MVP", "*", "*", "*", "10:00", "0", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "H";
    // Soft rule: min 22h rest, 1 LN
    input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "ASIA_SWP_Welfare", "*", "ICN", 1, "FLY", "MVP", "*", "*", "*", "22:00", "1", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "S";
    DBRule controlRow{};
    controlRow.idRule = 7421001; controlRow.function = 7421; controlRow.tableNum = 2; controlRow.rowNum = 1;
    controlRow.params["Rest Starts After"] = "TRANSPORT";
    input.dbRules.push_back(controlRow);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeFlight("SIN", "ICN", "2025-01-10 00:00:00", "2025-01-10 06:35:00"));
    auto duty1 = makeDuty({segStorage.back().get()}, "FLY");
    duty1->setActualDropoffMin(_dropoffMin);

    segStorage.push_back(makeFlight("ICN", "SIN", "2025-01-11 02:20:00", "2025-01-11 08:50:00", false)); // PU is MVP
    auto duty2 = makeDuty({segStorage.back().get()}, "MVP");
    duty2->setActualPickupMin(_pickupMin);

    Pairing pairing({duty1.get(), duty2.get()});
    pairing.setBase("SIN");
    attachPairingNodes(pairing);
    runRule(pairing, input);
    
    ASSERT_EQ(_violations.size(), 1);
    EXPECT_EQ(_violations[0]->ruleParamId, 742100000 + 2); // Soft violation
}

// Case 4: SIN-ICN compliant rest
TEST_F(SIA_6_12_PositioningRestAsiaSwpTest, SINICNCompliantRest) {
    RuleInput input;
    // Hard rule: min 10h rest, 0 LN (to ensure it passes, letting soft rule trigger)
    input.dbRules.push_back(makeAcopTableBRow(7421001, 1, "ASIA_SWP_Welfare", "*", "ICN", 2, "FLY", "MVP", "*", "*", "*", "10:00", "0", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "H";
    // Soft rule: min 22h rest, 1 LN
    input.dbRules.push_back(makeAcopTableBRow(7421002, 2, "ASIA_SWP_Welfare", "*", "ICN", 1, "FLY", "MVP", "*", "*", "*", "22:00", "1", "*", "*", "*", "*", "*", "*", "0", "*"));
    input.dbRules.back().overridebility = "S";
    DBRule controlRow{};
    controlRow.idRule = 7421001; controlRow.function = 7421; controlRow.tableNum = 2; controlRow.rowNum = 1;
    controlRow.params["Rest Starts After"] = "TRANSPORT";
    input.dbRules.push_back(controlRow);

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeFlight("SIN", "ICN", "2025-01-10 00:00:00", "2025-01-10 06:35:00"));
    auto duty1 = makeDuty({segStorage.back().get()}, "FLY");
    duty1->setActualDropoffMin(_dropoffMin);

    segStorage.push_back(makeFlight("ICN", "SIN", "2025-01-11 07:45:00", "2025-01-11 14:00:00", false)); // PU is MVP
    auto duty2 = makeDuty({segStorage.back().get()}, "MVP");
    duty2->setActualPickupMin(_pickupMin);

    Pairing pairing({duty1.get(), duty2.get()});
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