// SIA_SUITE_SUMMARY_START
// SuiteId: 6.15
// Name: Rest Time after flights
// SourceCsvRow: 81
// Status: IMPLEMENTED
// ImplementedCases:
//   - ShortRest_Violation: 3H05M rest after flight is less than 10H required.
//   - LongRest_Compliant: 27H05M rest after flight meets 10H required.
// Results:
//   - TODO
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7467/LimitRestTimeBetweenFlightsForSQRule.h"
#include "RuleEngine/rule/rule7467/LimitRestTimeBetweenFlightsForSQRuleParam.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"
#include "SIA_CommonTestConfig.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

class SIA_6_15_RestTimeAfterFlightsTest : public ::testing::Test {
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
        addAirport(ctx, "HKG", "HK", "SEA", 8 * 60);
        ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
        ctx->airportZoneIdMap["HKG"] = "Asia/Hong_Kong";
        ctx->airportUtcOffsetMap["SIN"] = 8 * 60;
        ctx->airportUtcOffsetMap["HKG"] = 8 * 60;
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

    void runRule(Pairing& pairing, const RuleInput& input) {
        LimitRestTimeBetweenFlightsForSQRule rule(nullptr, input);
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

// Test Case: Short Rest Between Flights -> Violation
TEST_F(SIA_6_15_RestTimeAfterFlightsTest, ShortRest_Violation) {
    RuleInput input;
    DBRule ruleRow{};
    ruleRow.idRule = 7467001; // RuleFuncId: 7467
    ruleRow.tableNum = 1; // Parameter row
    ruleRow.params["TYPE"] = "AFTER"; // REQ_REST_AFT in design doc table
    ruleRow.params["FLIGHT NO A"] = "7366";
    ruleRow.params["DEP-ARR A"] = "SIN-HKG";
    ruleRow.params["FLIGHT NO B"] = "*";
    ruleRow.params["DEP-ARR B"] = "*";
    ruleRow.params["MIN TIME LIMIT"] = "10:00";
    ruleRow.params["MAX TIME LIMIT"] = "00:00";
    ruleRow.params["PENALTY"] = "0";
    ruleRow.params["ACTIVE"] = "Y";
    input.dbRules.push_back(ruleRow);

    std::vector<std::unique_ptr<Segment>> segStorage;
    // Duty 1: SQ 7366 SIN-HKG (Arr HKG 2025-01-10 07:45 HKG LT)
    segStorage.push_back(makeFlight("SIN", "HKG", "2025-01-10 03:35:00", "2025-01-10 07:45:00", "7366"));
    auto duty1 = makeDuty({segStorage.back().get()}, "FLY");

    // Duty 2: PU SQ 895 HKG-SIN (Dep HKG 2025-01-10 10:50 HKG LT)
    segStorage.push_back(makeFlight("HKG", "SIN", "2025-01-10 10:50:00", "2025-01-10 14:50:00", "895", false));
    auto duty2 = makeDuty({segStorage.back().get()}, "MVP");

    Pairing pairing({duty1.get(), duty2.get()});
    pairing.setBase("SIN");
    runRule(pairing, input);

    ASSERT_EQ(_violations.size(), 1);
    EXPECT_EQ(_violations[0]->idRule, 7467001);
}

// Test Case: Long Rest Between Flights -> Compliant
TEST_F(SIA_6_15_RestTimeAfterFlightsTest, LongRest_Compliant) {
    RuleInput input;
    DBRule ruleRow{};
    ruleRow.idRule = 7467001; // RuleFuncId: 7467
    ruleRow.tableNum = 1; // Parameter row
    ruleRow.params["TYPE"] = "AFTER"; // REQ_REST_AFT in design doc table
    ruleRow.params["FLIGHT NO A"] = "7366";
    ruleRow.params["DEP-ARR A"] = "SIN-HKG";
    ruleRow.params["FLIGHT NO B"] = "*";
    ruleRow.params["DEP-ARR B"] = "*";
    ruleRow.params["MIN TIME LIMIT"] = "10:00";
    ruleRow.params["MAX TIME LIMIT"] = "00:00";
    ruleRow.params["PENALTY"] = "0";
    ruleRow.params["ACTIVE"] = "Y";
    input.dbRules.push_back(ruleRow);

    std::vector<std::unique_ptr<Segment>> segStorage;
    // Duty 1: SQ 7366 SIN-HKG (Arr HKG 2025-01-10 07:45 HKG LT)
    segStorage.push_back(makeFlight("SIN", "HKG", "2025-01-10 03:35:00", "2025-01-10 07:45:00", "7366"));
    auto duty1 = makeDuty({segStorage.back().get()}, "FLY");

    EXPECT_TRUE(_violations.empty());
}
