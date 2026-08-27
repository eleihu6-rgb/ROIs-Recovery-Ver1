// SIA_SUITE_SUMMARY_START
// SuiteId: 6.2
// Name: Max block time in a pairing
// SourceCsvRow: 6.2.,Max block time in a pairing
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Pairing block > 35h -> expected violation.
//   - Case #2: Same pairing with max BLH 50h -> expected pass.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Verify rule2003 MaxPairingBLH wiring and duty construction to ensure block sum > limit is rejected.
//   - Replace simplified SIN-local minutes with full station offsets if needed for future COP fidelity.
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

// SIA 6.2 Max block time in a pairing (base SIN).
// Best-fit rule: rule2003 using maxBlh.

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
    seg->setAssignment("FLY");
	seg->setBlkSeconds(static_cast<long>(end - start));
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
    int blk = 0;
    for (auto seg : segments) {
        blk += static_cast<int>(seg->getBlkSeconds());
	}
	duty->setBLKInMins(blk / 60);
	duty->setActualBlockTime(blk);

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
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct());
        pairing->setStartTimeLocAct(first->getStartTimeLocAct());
        pairing->setEndTimeLocAct(last->getEndTimeLocAct());
    }
    return pairing;
}

struct Rule2003Config {
    std::string maxBlh;
};

std::unique_ptr<DBRule> makeRule2003(const Rule2003Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2003>();
    parsed->base = "SIN";
    parsed->maxBlh = cfg.maxBlh;
    // Set other params to be permissive
    parsed->maxPgLength = 999;
    parsed->maxDutiesinPG = 99;
    parsed->allowReturnBaseinDuty = "Y";
    rule->parsedParam = parsed;
    rule->idRule = 2003;
    rule->idRuleParam = 2003;
    return rule;
}

void setupAirport(DBAirport& airport, const char* code, const char* country, const char* dir) {
    std::memset(&airport, 0, sizeof(DBAirport));
    std::strncpy(airport.airport, code, sizeof(airport.airport) - 1);
    std::strncpy(airport.country, country, sizeof(airport.country) - 1);
    std::strncpy(airport.dir, dir, sizeof(airport.dir) - 1);
}

SharedPtr<CrewDataContext> buildCrewDataContext() {
    auto ctx = std::make_shared<CrewDataContext>();
    DBAirport sin, fra, jfk;
    setupAirport(sin, "SIN", "SG", "D");
    setupAirport(fra, "FRA", "DE", "I");
    setupAirport(jfk, "JFK", "US", "I");

    ctx->airportList.push_back(sin);
    ctx->airportList.push_back(fra);
    ctx->airportList.push_back(jfk);
    
    ctx->airportZoneIdMap["SIN"] = "Etc/UTC";
    ctx->airportZoneIdMap["FRA"] = "Etc/UTC";
    ctx->airportZoneIdMap["JFK"] = "Etc/UTC";

    return ctx;
}


class SIA_6_2_MaxBlockInPairingTest : public ::testing::Test {
protected:
    SIA_6_2_MaxBlockInPairingTest()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(buildCrewDataContext()) 
    {
        _checker.setDataContext(_dataContext, -1, false);
    }

    std::unique_ptr<Pairing> buildCopPairing() {
        _segStore.clear();
        _dutyStore.clear();
        std::vector<Duty*> rawDuties;

        // Day 1
        _segStore.push_back(makeSegment("SQ026", "SIN", "FRA", "2025-12-01 04:10:00", "2025-12-01 22:50:00"));
        _dutyStore.push_back(makeDuty({_segStore.back().get()}));
        rawDuties.push_back(_dutyStore.back().get());

        // Day 4
        _segStore.push_back(makeSegment("SQ026", "FRA", "JFK", "2025-12-04 06:35:00", "2025-12-04 15:10:00"));
        _dutyStore.push_back(makeDuty({_segStore.back().get()}));
        rawDuties.push_back(_dutyStore.back().get());

        // Day 7
        _segStore.push_back(makeSegment("SQ025", "JFK", "FRA", "2025-12-07 00:55:00", "2025-12-07 08:40:00"));
        _dutyStore.push_back(makeDuty({_segStore.back().get()}));
        rawDuties.push_back(_dutyStore.back().get());

        // Day 8
        _segStore.push_back(makeSegment("SQ025", "FRA", "SIN", "2025-12-08 10:15:00", "2025-12-08 22:50:00"));
        _dutyStore.push_back(makeDuty({_segStore.back().get()}));
        rawDuties.push_back(_dutyStore.back().get());

        return makePairing(rawDuties, "SIN");
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
    std::vector<std::unique_ptr<Segment>> _segStore;
    std::vector<std::unique_ptr<Duty>> _dutyStore;
};


TEST_F(SIA_6_2_MaxBlockInPairingTest, Case1_BlockExceedsLimitFails) {
    Rule2003Config cfg;
    cfg.maxBlh = "35:00";
    auto rule = makeRule2003(cfg);

    auto pairing = buildCopPairing();
    EXPECT_FALSE(_checker.checkPairingLimitationImplemenation(pairing->getDutyVec(), rule.get(), pairing.get()));
}

TEST_F(SIA_6_2_MaxBlockInPairingTest, Case2_BlockWithinLimitPasses) {
    Rule2003Config cfg;
    cfg.maxBlh = "50:00";
    auto rule = makeRule2003(cfg);

    auto pairing = buildCopPairing();
    EXPECT_TRUE(_checker.checkPairingLimitationImplemenation(pairing->getDutyVec(), rule.get(), pairing.get()));
}

}  // namespace