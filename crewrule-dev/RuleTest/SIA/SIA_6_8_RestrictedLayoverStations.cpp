// SIA_SUITE_SUMMARY_START
// SuiteId: 6.8
// Name: Restricted Layover Stations
// SourceCsvRow: 6.8.,Restricted Layover Stations
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Layover at BLR (restricted) -> expected violation.
//   - Case #2: Layover at NBO (restricted) -> expected violation.
//   - Case #3: Layover at ICN (not restricted) -> expected pass.
// Results:
//   - fail 1 out of 3 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z; example failure: Value of: checker.checkPGRules(segs, {RULES::AIRPORT_RESTRICT})
// RemainingWork:
//   - Verify rule2019 setup (noLayovers list) and segments fed to checkPGRules so unrestricted stations are allowed.
//   - Add more restricted/allowed stations if SIA expands the list; timelines remain simplified.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 6.8 Restricted Layover Stations using rule 2019 (AIRPORT_RESTRICT).

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

struct RuleParamsGuard {
    RuleParamsGuard() {
        RuleParams* rp = RuleParams::GetInstancePtr();
        _prevNoLayovers = rp->noLayovers;
        _prevRestrictAllLayover = rp->restrictAllAirportInLayover;
        rp->noLayovers = {"BLR", "NBO"};
        rp->restrictAllAirportInLayover = "N";
    }
    ~RuleParamsGuard() {
        RuleParams* rp = RuleParams::GetInstancePtr();
        rp->noLayovers = _prevNoLayovers;
        rp->restrictAllAirportInLayover = _prevRestrictAllLayover;
    }
    std::vector<std::string> _prevNoLayovers;
    std::string _prevRestrictAllLayover;
};

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     long long pairingId,
                                     long long segId) {
    auto seg = std::make_unique<Segment>();
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocAct(start);
    seg->setEndTimeLocAct(end);
    seg->setStartTimeLocSch(start);
    seg->setEndTimeLocSch(end);
    seg->setPairingId(pairingId);
    seg->setSegmentId(segId);
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

DBRule make2019Rule() {
    DBRule row{};
    row.idRule = 2019001;
    row.function = 2019;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.overridebility = "S";
    row.reference = "SIA-6.8";
    std::strcpy(row.description, "Restricted layover stations");
    return row;
}

}  // namespace

class SIA_6_8_RestrictedLayoverStations : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<RuleParamsGuard>();
        _ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        // Register rule so violation reporting can attach rule info and rule functions are available.
        auto rule = make2019Rule();
        _ctx->ruleList.push_back(rule);
        _ctx->addRuleFunction(rule.function, rule);
    }

    void TearDown() override {
        for (auto* rv : _violations) {
            delete rv;
        }
        _violations.clear();
    }

    std::unique_ptr<RuleParamsGuard> _guard;
    SharedPtr<CrewDataContext> _ctx;
    std::vector<RULE_VIOLATION*> _violations;
};

TEST_F(SIA_6_8_RestrictedLayoverStations, Case1_LayoverAtBlrFails) {
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);

    const long long pairingId = 6801001;
    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("SIN", "BLR", "2025-01-01 00:00:00", "2025-01-01 05:00:00", pairingId, 68011));
	auto duty1 = makeDuty({ segStore[0].get() }, "FLY");
    segStore.push_back(makeSegment("BLR", "SIN", "2025-01-02 00:00:00", "2025-01-02 05:00:00", pairingId, 68012));
	auto duty2 = makeDuty({ segStore[1].get() }, "FLY");
	vector<Duty*> duties{ duty1.get(), duty2.get() };
    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};

    EXPECT_FALSE(checker.checkPGRules(duties, {RULES::AIRPORT_RESTRICT}));
}

TEST_F(SIA_6_8_RestrictedLayoverStations, Case2_LayoverAtNboFails) {
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);

    const long long pairingId = 6802001;
    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("SIN", "NBO", "2025-02-01 00:00:00", "2025-02-01 07:00:00", pairingId, 68021));
    segStore.push_back(makeSegment("NBO", "SIN", "2025-02-02 00:00:00", "2025-02-02 07:00:00", pairingId, 68022));
    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};

    auto duty1 = makeDuty({ segStore[0].get() }, "FLY");
    auto duty2 = makeDuty({ segStore[1].get() }, "FLY");
    vector<Duty*> duties{ duty1.get(), duty2.get() };


    EXPECT_FALSE(checker.checkPGRules(duties, {RULES::AIRPORT_RESTRICT}));
}

TEST_F(SIA_6_8_RestrictedLayoverStations, Case3_LayoverAtIcnPasses) {
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    checker.setDataContext(_ctx, -1, false);

    const long long pairingId = 6803001;
    std::vector<std::unique_ptr<Segment>> segStore;
    segStore.push_back(makeSegment("SIN", "ICN", "2025-03-01 00:00:00", "2025-03-01 06:00:00", pairingId, 68031));
    segStore.push_back(makeSegment("ICN", "SIN", "2025-03-02 00:00:00", "2025-03-02 06:00:00", pairingId, 68032));
    std::vector<Segment*> segs{segStore[0].get(), segStore[1].get()};
    auto duty1 = makeDuty({ segStore[0].get() }, "FLY");
    auto duty2 = makeDuty({ segStore[1].get() }, "FLY");
    vector<Duty*> duties{ duty1.get(), duty2.get() };

    EXPECT_TRUE(checker.checkPGRules(duties, {RULES::AIRPORT_RESTRICT}));
}