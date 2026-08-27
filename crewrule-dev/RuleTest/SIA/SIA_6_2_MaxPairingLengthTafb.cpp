// SIA_SUITE_SUMMARY_START
// SuiteId: 6.2
// Name: Max Pairing Length / TAFB (calendar days, hours)
// SourceCsvRow: 6.2.,Max Pairing Length / TAFB (calendar days, hours)
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Pairing spans 9 calendar days with max length 7 days -> expected violation.
//   - Case #2: Same pairing with max length 10 days -> expected pass.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Fix pairing builder to avoid overflow, then verify rule2003 calendar-day limit behaviour.
//   - Swap simplified timelines for station offsets if later required; current setup follows row 78 intent.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"
#include "SIA_6_DutyConstructionHelpers.h"

#include <memory>
#include <string>
#include <vector>

// SIA 6.2 Max Pairing Length / TAFB (calendar days, hours).
// Best-fit rule: rule2003 (pairing length / calendar-day limits).

namespace {

std::unique_ptr<DBRule> makeRule2003(int maxCalendarDays) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2003>();
    parsed->base = "SIN";
    parsed->maxPgLength = 999;
    parsed->maxDutiesinPG = 100;
    parsed->allowReturnBaseinDuty = "Y";
    parsed->maxBlh = "100:00";
    parsed->strMaxDays = std::to_string(maxCalendarDays);
    parsed->allowableLayoverStation = {"*"};
    rule->parsedParam = parsed;
    rule->idRule = 2003;
    rule->idRuleParam = 2003;
    return rule;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setPrimeActivity("FLY");
    if (!duties.empty()) {
        const Duty* first = duties.front();
        const Duty* last = duties.back();
        pairing->setStartTimeUtcAct(first->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct());
        pairing->setStartTimeLocAct(first->getStartTimeLocAct());
        pairing->setEndTimeLocAct(last->getEndTimeLocAct());
    }
    return pairing;
}

std::vector<Duty*> asRaw(const std::vector<SIA6Duty::DutyBuildResult>& storage) {
    std::vector<Duty*> raw;
    raw.reserve(storage.size());
    for (const auto& dutyResult : storage) {
        raw.push_back(dutyResult.duty.get());
    }
    return raw;
}

}  // namespace

class SIA_6_2_MaxPairingLengthTafb : public ::testing::Test {
protected:
    SIA_6_2_MaxPairingLengthTafb()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(SIA6Duty::buildCrewDataContext({{"SIN", "D"}})) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

TEST_F(SIA_6_2_MaxPairingLengthTafb, Case1_PairingExceedsCalendarDayLimitFails) {
    auto rule = makeRule2003(7);

    // Pairing start: 2025-01-01 08:00 (SIN local); end: 2025-01-09 20:00 (SIN local) -> 9 days.
    std::vector<SIA6Duty::DutyBuildResult> dutiesOwned;
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "AAA", 8 * 60, 12 * 60, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "AAA", 3 * 24 * 60 + 8 * 60, 3 * 24 * 60 + 12 * 60, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "SIN", 8 * 24 * 60 + 8 * 60, 8 * 24 * 60 + 20 * 60, "A1")}));

    auto pairing = makePairing(asRaw(dutiesOwned), "SIN");
    EXPECT_FALSE(_checker.checkPairingLimitationImplemenation(pairing->getDutyVec(), rule.get(), pairing.get()));
}

TEST_F(SIA_6_2_MaxPairingLengthTafb, Case2_PairingWithinCalendarDayLimitPasses) {
    auto rule = makeRule2003(10);

    std::vector<SIA6Duty::DutyBuildResult> dutiesOwned;
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "AAA", 8 * 60, 12 * 60, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "AAA", 3 * 24 * 60 + 8 * 60, 3 * 24 * 60 + 12 * 60, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "SIN", 8 * 24 * 60 + 8 * 60, 8 * 24 * 60 + 20 * 60, "A1")}));

    auto pairing = makePairing(asRaw(dutiesOwned), "SIN");
    EXPECT_TRUE(_checker.checkPairingLimitationImplemenation(pairing->getDutyVec(), rule.get(), pairing.get()));
}
