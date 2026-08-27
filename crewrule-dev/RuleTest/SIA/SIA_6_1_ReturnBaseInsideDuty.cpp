// SIA_SUITE_SUMMARY_START
// SuiteId: 6.1
// Name: Allow return base inside duty
// SourceCsvRow: 6.1.,Allow return base inside duty
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: When Condition = No (allowReturnBaseinDuty = "N"), a duty that departs and then returns to base mid-duty is illegal.
//   - Case #2: When Condition = Yes (allowReturnBaseinDuty = "Y"), the same duty pattern is legal.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Verify rule2003 parameter allowReturnBaseinDuty and duty builder to ensure mid-duty base returns are rejected when set to 'N'.
//   - Extend coverage if SIA later adds multi-duty examples or more complex base-return patterns.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"
#include "CrewDB.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

// SIA 6.1 – Allow return base inside duty
// Best-fit rule: rule2003 (pairing construction, field allowReturnBaseinDuty).

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& flightNo,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setFlightNumber(flightNo);
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
    seg->setIsDeadhead(false);
    seg->setAssignment("FLY");
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments) {
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
    duty->resetTypeBySegments();
    return duty;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setPrimeActivity("FLY");

    if (!duties.empty()) {
        Duty* first = duties.front();
        Duty* last = duties.back();
        pairing->setStartTimeUtcAct(first->getStartTimeUtcAct());
        pairing->setStartTimeLocAct(first->getStartTimeLocAct());
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct());
        pairing->setEndTimeLocAct(last->getEndTimeLocAct());
    }

    return pairing;
}

struct Rule2003Config {
    std::string base = "SIN";
    std::string allowReturnBase = "Y";
};

std::unique_ptr<DBRule> makeRule2003(const Rule2003Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2003>();
    parsed->base = cfg.base;
    parsed->allowReturnBaseinDuty = cfg.allowReturnBase;
    // Set other rule2003 params to permissive values to isolate the test
    parsed->maxPgLength = 999;
    parsed->maxDutiesinPG = 99;
    parsed->maxBlh = "999:00";
    rule->parsedParam = parsed;
    rule->idRule = 2003;
    rule->idRuleParam = 2003;
    return rule;
}

SharedPtr<CrewDataContext> buildCrewDataContext() {
    auto ctx = std::make_shared<CrewDataContext>();
    std::vector<std::string> airports = {"SIN", "CGK", "KUL"};
    for (const auto& code : airports) {
        DBAirport rec{};
        std::strncpy(rec.airport, code.c_str(), sizeof(rec.airport) - 1);
        std::strncpy(rec.zoneId, "Etc/UTC", sizeof(rec.zoneId) - 1);
        ctx->airportList.push_back(rec);
        ctx->airportZoneIdMap[code] = "Etc/UTC";
    }
    return ctx;
}


class SIA_6_1_ReturnBaseInsideDutyTest : public ::testing::Test {
protected:
    SIA_6_1_ReturnBaseInsideDutyTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext())
    {
        _checker.setDataContext(_dataContext, -1, false);
    }

    std::vector<std::unique_ptr<Segment>> segStore;

    std::unique_ptr<Pairing> buildTestPairing(const std::string& base) {
        std::vector<Segment*> segs;

        segStore.push_back(makeSegment("SQ956", "SIN", "CGK", "2025-12-04 01:25:00", "2025-12-04 03:10:00"));
        segs.push_back(segStore.back().get());
        segStore.push_back(makeSegment("SQ957", "CGK", "SIN", "2025-12-04 04:15:00", "2025-12-04 06:05:00"));
        segs.push_back(segStore.back().get());
        segStore.push_back(makeSegment("SQ122", "SIN", "KUL", "2025-12-04 08:25:00", "2025-12-04 09:40:00"));
        segs.push_back(segStore.back().get());
        segStore.push_back(makeSegment("SQ121", "KUL", "SIN", "2025-12-04 10:40:00", "2025-12-04 11:50:00"));
        segs.push_back(segStore.back().get());

        auto duty = makeDuty(segs);
        
        // This test requires a std::vector<std::unique_ptr<Duty>> even though it's one duty
        _dutyStore.push_back(std::move(duty));

        std::vector<Duty*> rawDuties;
        rawDuties.push_back(_dutyStore.back().get());
        
        return makePairing(rawDuties, base);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
    // Store duties to manage their lifetime for the pairing
    std::vector<std::unique_ptr<Duty>> _dutyStore;
};


// Case #1 (6.1): Condition = No (allowReturnBaseinDuty = "N") -> illegal.
TEST_F(SIA_6_1_ReturnBaseInsideDutyTest, ReturningToBaseIllegalWhenNotAllowed) {
    Rule2003Config cfg;
    cfg.allowReturnBase = "N";
    auto rule = makeRule2003(cfg);

    auto pairing = buildTestPairing(cfg.base);
    
    EXPECT_FALSE(_checker.checkPairingLimitationImplemenation(pairing->getDutyVec(), rule.get(), pairing.get()));
}

// Case #2 (6.1): Condition = Yes (allowReturnBaseinDuty = "Y") -> legal.
TEST_F(SIA_6_1_ReturnBaseInsideDutyTest, ReturningToBaseLegalWhenAllowed) {
    Rule2003Config cfg;
    cfg.allowReturnBase = "Y";
    auto rule = makeRule2003(cfg);

    auto pairing = buildTestPairing(cfg.base);

    EXPECT_TRUE(_checker.checkPairingLimitationImplemenation(pairing->getDutyVec(), rule.get(), pairing.get()));
}

}  // namespace