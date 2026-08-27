// SIA_SUITE_SUMMARY_START
// SuiteId: 6.2
// Name: Maximum number of duties within a pairing
// SourceCsvRow: 6.2.,Maximum number of duties within a pairing
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Four-duty pairing with max duties = 2 -> expected violation.
//   - Case #2: Same pairing with max duties = 5 -> expected pass.
// Results:
//   - pass 2 out of 2 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:21Z
// RemainingWork:
//   - Fix duty/pairing construction to avoid exception and re-evaluate rule2003 maxDuties behaviour.
//   - Replace simplified duty timelines with COP-specific station offsets if needed.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"
#include "SIA_6_DutyConstructionHelpers.h"

#include <memory>
#include <string>
#include <vector>

// SIA 6.2 Maximum number of duties within a pairing (base SIN).
// Best-fit rule: rule2003 (maxDutiesinPG).

namespace {

std::unique_ptr<DBRule> makeRule2003(int maxDuties) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2003>();
    parsed->base = "SIN";
    parsed->maxPgLength = 999;
    parsed->maxDutiesinPG = maxDuties;
    parsed->allowReturnBaseinDuty = "Y";
    parsed->maxBlh = "100:00";
    parsed->strMaxDays = "10";
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
        Duty* first = duties.front();
        Duty* last = duties.back();
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
    for (const auto& dutyResult: storage) {
        raw.push_back(dutyResult.duty.get());
    }
    return raw;
}

}  // namespace

class SIA_6_2_MaxDutiesInPairing : public ::testing::Test {
protected:
    SIA_6_2_MaxDutiesInPairing()
        : _checker(PAIRING_OPTIMIZER, false),
          _dataContext(SIA6Duty::buildCrewDataContext({{"SIN", "D"}})) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

TEST_F(SIA_6_2_MaxDutiesInPairing, Case1_FourDutiesExceedMaxDutiesFail) {
    auto rule = makeRule2003(2);

    std::vector<SIA6Duty::DutyBuildResult> dutiesOwned;
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "AAA", 0, 120, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "AAA", 240, 360, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "AAA", 480, 600, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "SIN", 720, 840, "A1")}));

    auto pairing = makePairing(asRaw(dutiesOwned), "SIN");
    EXPECT_FALSE(_checker.checkPairingLimitationImplemenation(pairing->getDutyVec(), rule.get(), pairing.get()));
}

TEST_F(SIA_6_2_MaxDutiesInPairing, Case2_FourDutiesWithinMaxDutiesPass) {
    auto rule = makeRule2003(5);

    std::vector<SIA6Duty::DutyBuildResult> dutiesOwned;
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "SIN", "AAA", 0, 120, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "AAA", 240, 360, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "AAA", 480, 600, "A1")}));
    dutiesOwned.push_back(SIA6Duty::makeDuty({SIA6Duty::makeSegmentConfig("FLY", "AAA", "SIN", 720, 840, "A1")}));

    auto pairing = makePairing(asRaw(dutiesOwned), "SIN");
    EXPECT_TRUE(_checker.checkPairingLimitationImplemenation(pairing->getDutyVec(), rule.get(), pairing.get()));
}
