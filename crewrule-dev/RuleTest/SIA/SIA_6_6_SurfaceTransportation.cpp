// SIA_SUITE_SUMMARY_START
// SuiteId: 6.6
// Name: Surface Transportation (Land & Sea)
// SourceCsvRow: 70
// Status: IMPLEMENTED
// ImplementedCases:
//   - LegalWithOneHourIntervalBeforeGT: 1h connection before 3h GT is legal.
//   - IllegalWithHalfHourIntervalBeforeGT: 30m connection before GT violates 1h minimum.
// Results:
//   - TODO
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7273/CheckMinConnectInDutyRule.h"
#include "RuleEngine/rule/rule7273/CheckMinConnectInDutyRuleParam.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"
#include "SIA_CommonTestConfig.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

// SIA 6.6 Surface Transportation (Land & Sea)
// Best-fit rule: Rule 7273 (Check minimum connection time between segments).

class SIA_6_6_SurfaceTransportationTest : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _ctx = makeContext();
        _pickupMin = 60;
        _dropoffMin = 60;
        _debriefMin = 30;
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
        addAirport(ctx, "DXB", "AE", "ME", 4 * 60);
        addAirport(ctx, "SHJ", "AE", "ME", 4 * 60);
        addAirport(ctx, "BRU", "BE", "EUR", 1 * 60);
        addAirport(ctx, "AMS", "NL", "EUR", 1 * 60);
        ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
        ctx->airportZoneIdMap["DXB"] = "Asia/Dubai";
        ctx->airportZoneIdMap["SHJ"] = "Asia/Dubai";
        ctx->airportZoneIdMap["BRU"] = "Europe/Brussels";
        ctx->airportZoneIdMap["AMS"] = "Europe/Amsterdam";
        ctx->airportUtcOffsetMap["SIN"] = 8 * 60;
        ctx->airportUtcOffsetMap["DXB"] = 4 * 60;
        ctx->airportUtcOffsetMap["SHJ"] = 4 * 60;
        ctx->airportUtcOffsetMap["BRU"] = 1 * 60;
        ctx->airportUtcOffsetMap["AMS"] = 1 * 60;
        return ctx;
    }

    void addAirport(std::shared_ptr<CrewDataContext>& ctx, const char* code, const char* country,
                    const char* category, int tzOffsetMinutes) {
        auto* a = new DBAirport();
        std::strncpy(a->airport, code, 3);
        a->airport[3] = '\0';
        std::strncpy(a->country, country, 2);
        a->country[2] = '\0';
        a->category = category;
        a->utcOffsetMinutes = tzOffsetMinutes;
        ctx->airportCodeMap[code] = a;
    }

    std::unique_ptr<Segment> makeSegment(const std::string& assignment, const std::string& dep,
                                         const std::string& arr, const std::string& depLocStr,
                                         const std::string& arrLocStr, const std::string& flightNumber,
                                         bool isOperating = true) {
        auto seg = std::make_unique<Segment>();
        seg->setAssignment(assignment);
        seg->setDepStation(dep);
        seg->setArrStation(arr);
        seg->setFlightNumber(flightNumber);
        seg->setIsOperating(isOperating);

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

    std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments, int dutySeq) {
        auto duty = std::make_unique<Duty>(segments);
        duty->setDutySeq(dutySeq);
        duty->setDepartureStation(segments.front()->getDepStation());
        duty->setArrivalStation(segments.back()->getArrStation());
        duty->setStartTimeUtcSch(segments.front()->getStartTimeUtcSch() - _pickupMin * 60);
        duty->setEndTimeUtcSch(segments.back()->getEndTimeUtcSch() + _debriefMin * 60);
        duty->setStartTimeLocSch(segments.front()->getStartTimeLocSch() - _pickupMin * 60);
        duty->setEndTimeLocSch(segments.back()->getEndTimeLocSch() + _debriefMin * 60);
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct() - _pickupMin * 60);
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct() + _debriefMin * 60);
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct() - _pickupMin * 60);
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct() + _debriefMin * 60);
        duty->setActualPickupMin(_pickupMin);
        duty->setActualDropoffMin(_dropoffMin);
        for (std::size_t idx = 0; idx < segments.size(); ++idx) {
            segments[idx]->setDutySeq(dutySeq);
            segments[idx]->setSegSeq(static_cast<int>(idx + 1));
        }
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
        CheckMinConnectInDutyRule rule(nullptr, input);
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
        rule.setRuleViolation(&_violations);
        rule.setViolations(&_violationMsgs);
        std::vector<Duty*> duties;
        duties.reserve(pairing.getNumDuties());
        for (std::size_t i = 0; i < pairing.getNumDuties(); ++i) {
            duties.push_back(pairing.getDuty(i));
        }
        rule.CheckRule(duties, "");
    }

    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMsgs;
    int _pickupMin = 0;
    int _dropoffMin = 0;
    int _debriefMin = 0;
    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
};

RuleInput makeSurfaceTransportRuleInput() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7273;
    row.function = 7273;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7273001;
    row.params["AIRPORTS"] = "BRU";
    row.params["INBOUND ASSIGNMENTS"] = "FLY";
    row.params["OUTBOUND ASSIGNMENTS"] = "BUS";
    row.params["MCT"] = "01:00";
    row.params["MAX CONN"] = "99:59";
    row.params["TYPE"] = "PAIRING";
    input.dbRules.push_back(row);
    return input;
}

TEST_F(SIA_6_6_SurfaceTransportationTest, LegalWithOneHourIntervalBeforeGT) {
    RuleInput input = makeSurfaceTransportRuleInput();

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment("MVP", "SIN", "DXB", "2025-12-12 07:05:00", "2025-12-12 14:35:00", "SQ494", false));
    auto duty1 = makeDuty({segStorage.back().get()}, 1);

    segStorage.push_back(makeSegment("FLY", "SHJ", "BRU", "2025-12-13 21:25:00", "2025-12-14 06:05:00", "SQ7366"));
    auto duty2 = makeDuty({segStorage.back().get()}, 2);

    segStorage.push_back(makeSegment("BUS", "BRU", "AMS", "2025-12-14 07:05:00", "2025-12-14 10:05:00", "GT1", false));
    auto duty3 = makeDuty({segStorage.back().get()}, 3);

    segStorage.push_back(makeSegment("FLY", "AMS", "SIN", "2025-12-18 18:10:00", "2025-12-19 06:25:00", "SQ7373"));
    auto duty4 = makeDuty({segStorage.back().get()}, 4);

    Pairing pairing({duty1.get(), duty2.get(), duty3.get(), duty4.get()});
    pairing.setBase("SIN");
    attachPairingNodes(pairing);

    runRule(pairing, input);

    EXPECT_TRUE(_violations.empty())
        << (_violations.empty() ? "" : _violations.front()->violation_msg);
}

TEST_F(SIA_6_6_SurfaceTransportationTest, IllegalWithHalfHourIntervalBeforeGT) {
    RuleInput input = makeSurfaceTransportRuleInput();

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment("MVP", "SIN", "DXB", "2025-12-12 07:05:00", "2025-12-12 14:35:00", "SQ494", false));
    auto duty1 = makeDuty({segStorage.back().get()}, 1);

    segStorage.push_back(makeSegment("FLY", "SHJ", "BRU", "2025-12-13 21:25:00", "2025-12-14 06:05:00", "SQ7366"));
    auto duty2 = makeDuty({segStorage.back().get()}, 2);

    segStorage.push_back(makeSegment("BUS", "BRU", "AMS", "2025-12-14 06:35:00", "2025-12-14 09:35:00", "GT1", false));
    auto duty3 = makeDuty({segStorage.back().get()}, 3);

    segStorage.push_back(makeSegment("FLY", "AMS", "SIN", "2025-12-18 18:10:00", "2025-12-19 06:25:00", "SQ7373"));
    auto duty4 = makeDuty({segStorage.back().get()}, 4);

    Pairing pairing({duty1.get(), duty2.get(), duty3.get(), duty4.get()});
    pairing.setBase("SIN");
    attachPairingNodes(pairing);

    runRule(pairing, input);

    ASSERT_EQ(_violations.size(), 1);
    if (!_violations.empty()) {
        EXPECT_EQ(_violations.front()->idRule, CheckMinConnectInDutyRule::RuleFuncId);
    }
}
