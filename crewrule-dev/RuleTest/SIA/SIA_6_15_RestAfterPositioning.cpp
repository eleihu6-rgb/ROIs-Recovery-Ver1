// SIA_SUITE_SUMMARY_START
// SuiteId: 6.15
// Name: Rest After Positioning
// SourceCsvRow: 104
// Status: IMPLEMENTED
// ImplementedCases:
//   - LongPositioningDuty_NoLocalNightRest_Violation: Positioning >16h requires 1LN rest; violation if not met.
//   - LongPositioningDuty_WithLocalNightRest_Compliant: Positioning >16h is compliant with 1LN rest.
// Results:
//   - TODO
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7412/CheckMinimumRestPeriodForSQRule.h"
#include "RuleEngine/rule/rule7412/CheckMinimumRestPeriodForSQRuleParam.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"
#include "SIA_CommonTestConfig.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

class SIA_6_15_RestAfterPositioningTest : public ::testing::Test {
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
        addAirport(ctx, "SFO", "US", "NOA", -7 * 60);
        ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
        ctx->airportZoneIdMap["SFO"] = "America/Los_Angeles";
        ctx->airportUtcOffsetMap["SIN"] = 8 * 60;
        ctx->airportUtcOffsetMap["SFO"] = -7 * 60;
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
        duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch() - _pickupMin * 60);
        duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch() + 30 * 60);
        duty->setStartTimeLocSch(segments.front()->getStartTimeLocSch() - _pickupMin * 60);
        duty->setEndTimeLocSch(segments.back()->getEndTimeLocSch() + 30 * 60);
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct() - _pickupMin * 60);
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct() + 30 * 60);
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct() - _pickupMin * 60);
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct() + 30 * 60);
        duty->setActualPickupMin(_pickupMin);
        duty->setActualDropoffMin(60); // 60 min transport after duty
        duty->setAssignment(assignment);

        long blockTimeInMinutes = 0;
        for(const auto* seg : segments) {
            blockTimeInMinutes += seg->getBlkMinutes();
        }
        long dpInMinutes = _pickupMin + blockTimeInMinutes + 30; // brief(60) + blk + debrief(30)
        duty->setPlanDP(dpInMinutes);
        duty->setActualDP(dpInMinutes);

        return duty;
    }

    void runRule(Pairing& pairing, const RuleInput& input) {
        CheckMinimumRestPeriodForSQRule rule(nullptr, input);
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


// Test Case: Positioning > 16h, no local night rest -> Violation
TEST_F(SIA_6_15_RestAfterPositioningTest, LongPositioningDuty_NoLocalNightRest_Violation) {
    RuleInput input;
    input.ruleParamString.push_back("*,*,MVP,*,17:30-99:00,*,00:00,*,1");

    std::vector<std::unique_ptr<Segment>> segStorage;
    // Day 1: PU SIN-SFO (>16h flight)
    segStorage.push_back(makeFlight("SIN", "SFO", "2025-01-10 10:00:00", "2025-01-10 12:00:00", false)); // 17h block time
    auto duty1 = makeDuty({segStorage.back().get()}, "MVP");

    // Day 1 Evening: Next flight, resulting in < 1LN rest
    segStorage.push_back(makeFlight("SFO", "SIN", "2025-01-10 20:00:00", "2025-01-11 20:00:00"));
    auto duty2 = makeDuty({segStorage.back().get()}, "FLY");

    Pairing pairing({duty1.get(), duty2.get()});
    pairing.setBase("SIN");
    runRule(pairing, input);

    // Only local night is insufficient here (MIN REST TIME is 00:00), so expect a single violation.
    ASSERT_EQ(_violations.size(), 1);
}

// Test Case: Positioning > 16h, with 1 local night rest -> Compliant
TEST_F(SIA_6_15_RestAfterPositioningTest, LongPositioningDuty_WithLocalNightRest_Compliant) {
    RuleInput input;
    input.ruleParamString.push_back("*,*,MVP,*,17:30-99:00,*,00:00,*,1");

    std::vector<std::unique_ptr<Segment>> segStorage;
    // Day 1: PU SIN-SFO (>16h flight)
    segStorage.push_back(makeFlight("SIN", "SFO", "2025-01-10 10:00:00", "2025-01-10 12:00:00", false)); // 17h block time
    auto duty1 = makeDuty({segStorage.back().get()}, "MVP");

    // Day 2 Morning: Next flight, providing > 1LN rest
    segStorage.push_back(makeFlight("SFO", "SIN", "2025-01-11 09:00:00", "2025-01-12 09:00:00"));
    auto duty2 = makeDuty({segStorage.back().get()}, "FLY");

    Pairing pairing({duty1.get(), duty2.get()});
    pairing.setBase("SIN");
    runRule(pairing, input);

    EXPECT_TRUE(_violations.empty());
}
