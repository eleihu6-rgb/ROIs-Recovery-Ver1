#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/CrewDB.h"
#include "db/RuleParams.h"

#include <algorithm>
#include <memory>
#include <string>
#include <vector>

std::shared_ptr<ruleParams> parseRuleParam2003(DBRule& item);

namespace {

time_t minutesToSeconds(int minutes) {
    return static_cast<time_t>(minutes) * 60;
}

struct DutyConfig {
    int startUtcMinutes{0};
    int endUtcMinutes{0};
    int startLocalMinutes{0};
    int endLocalMinutes{0};
    int pickupMinutes{0};
    int dropoffMinutes{0};
    int blockMinutes{0};
    std::string depStation;
    std::string arrStation;
};

struct SegmentConfig {
    std::string depStation;
    std::string arrStation;
    std::string fleet;
    bool isOperating{true};
    std::string assignment{"FLY"};
};

std::unique_ptr<Duty> makeDuty(const DutyConfig& cfg) {
    auto duty = std::make_unique<Duty>();
    duty->setDepartureStation(cfg.depStation);
    duty->setArrivalStation(cfg.arrStation);
    duty->setStartTimeUtcAct(minutesToSeconds(cfg.startUtcMinutes));
    duty->setEndTimeUtcAct(minutesToSeconds(cfg.endUtcMinutes));
    duty->setStartTimeLocAct(minutesToSeconds(cfg.startLocalMinutes));
    duty->setEndTimeLocAct(minutesToSeconds(cfg.endLocalMinutes));
    duty->setActualPickupMin(cfg.pickupMinutes);
    duty->setActualDropoffMin(cfg.dropoffMinutes);
    duty->setBLKInMins(cfg.blockMinutes);
    return duty;
}

std::unique_ptr<Segment> makeSegment(const SegmentConfig& cfg) {
    auto segment = std::make_unique<Segment>();
    segment->setDepSta(cfg.depStation);
    segment->setArrSta(cfg.arrStation);
    segment->setFleetCD(cfg.fleet);
    segment->setIsOperating(cfg.isOperating);
    segment->setAssignment(cfg.assignment);
    return segment;
}

std::unique_ptr<Duty> makeDutyWithSegments(const DutyConfig& cfg, const std::vector<Segment*>& segments) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setDepartureStation(cfg.depStation);
    duty->setArrivalStation(cfg.arrStation);
    duty->setStartTimeUtcAct(minutesToSeconds(cfg.startUtcMinutes));
    duty->setEndTimeUtcAct(minutesToSeconds(cfg.endUtcMinutes));
    duty->setStartTimeLocAct(minutesToSeconds(cfg.startLocalMinutes));
    duty->setEndTimeLocAct(minutesToSeconds(cfg.endLocalMinutes));
    duty->setActualPickupMin(cfg.pickupMinutes);
    duty->setActualDropoffMin(cfg.dropoffMinutes);
    duty->setBLKInMins(cfg.blockMinutes);
    return duty;
}

std::vector<Duty*> asRaw(const std::vector<std::unique_ptr<Duty>>& storage) {
    std::vector<Duty*> raw;
    raw.reserve(storage.size());
    for (const auto& duty : storage) {
        raw.push_back(duty.get());
    }
    return raw;
}

struct Rule2003Config {
    std::string base = "PEK";
    int maxPairingLengthHours = 24;
    int maxDuties = 4;
    std::string maxBlh = "12:00";
    std::string maxDays;
    std::string allowReturnBase = "Y";
    std::vector<std::string> layoverStations = {"*"};
    std::vector<std::string> fleets;
    std::vector<std::string> fleetGroups;
};

std::unique_ptr<DBRule> makeRule2003(const Rule2003Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2003>();
    parsed->base = cfg.base;
    parsed->maxPgLength = cfg.maxPairingLengthHours;
    parsed->maxDutiesinPG = cfg.maxDuties;
    parsed->allowReturnBaseinDuty = cfg.allowReturnBase;
    parsed->maxBlh = cfg.maxBlh;
    parsed->strMaxDays = cfg.maxDays;
    parsed->allowableLayoverStation = cfg.layoverStations;
    parsed->fleets = cfg.fleets;
    parsed->fleetGroups = cfg.fleetGroups;
    rule->parsedParam = parsed;
    rule->idRule = 2003;
    rule->idRuleParam = 2003;
    return rule;
}

SharedPtr<CrewDataContext> buildDataContextFor2003() {
    return std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setPrimeActivity("FLY");

    if (!duties.empty()) {
        Duty* first = duties.front();
        Duty* last = duties.back();
        pairing->setStartTimeUtcAct(first->getStartTimeUtcAct() - first->getActualPickupMin() * 60);
        pairing->setStartTimeLocAct(first->getStartTimeLocAct() - first->getActualPickupMin() * 60);
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct() + last->getActualDropoffMin() * 60);
        pairing->setEndTimeLocAct(last->getEndTimeLocAct() + last->getActualDropoffMin() * 60);
    }

    return pairing;
}

const RULE_VIOLATION* findViolationByRuleId(const std::vector<RULE_VIOLATION*>& violations, const std::string& ruleId) {
    auto it = std::find_if(violations.begin(), violations.end(), [&](const RULE_VIOLATION* v) {
        auto r = v->operation_result.find("ruleId");
        return r != v->operation_result.end() && r->second == ruleId;
    });
    return it == violations.end() ? nullptr : *it;
}

}  // namespace

class Rule2003Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

// Happy-path: pairing length, duty count, and block hours all sit within the caps.
TEST_F(Rule2003Test, PairingWithinLimitsPasses) {
    Rule2003Config cfg;
    cfg.maxPairingLengthHours = 20;
    cfg.maxDuties = 4;
    cfg.maxBlh = "15:00";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({0, 360, 0, 360, 60, 30, 300, "PEK", "CKG"}));
    duties.push_back(makeDuty({600, 960, 600, 960, 30, 60, 280, "CKG", "SHA"}));

    auto raw = asRaw(duties);
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    EXPECT_TRUE(checker.checkPairingLimitationImplemenation(raw, rule.get(), nullptr));
}

// Guardrail: accumulated block hours exceed the rule limit, so the pairing is illegal.
TEST_F(Rule2003Test, BlockHoursOverLimitFail) {
    Rule2003Config cfg;
    cfg.maxBlh = "08:00";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({0, 360, 0, 360, 30, 30, 360, "PEK", "CKG"}));
    duties.push_back(makeDuty({600, 960, 600, 960, 30, 30, 360, "CKG", "SHA"}));
    // pairing block hour should be 12:00

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    EXPECT_FALSE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));

    const auto violations = checker.getRuleViolations();
    const auto* v = findViolationByRuleId(violations, "2003.1");
    ASSERT_NE(nullptr, v);
    EXPECT_NE(v->violation_msg.find("actual=12:00"), std::string::npos);
    EXPECT_NE(v->violation_msg.find("limit=08:00"), std::string::npos);
}

// Guardrail: pickup/dropoff-inclusive pairing length is longer than the allowed hours.
TEST_F(Rule2003Test, PairingLengthOverLimitFail) {
    Rule2003Config cfg;
    cfg.maxPairingLengthHours = 14;
    cfg.maxBlh = "20:00";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({0, 360, 0, 360, 60, 30, 300, "PEK", "CKG"}));
    duties.push_back(makeDuty({600, 960, 600, 960, 30, 60, 280, "CKG", "PEK"}));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    EXPECT_FALSE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));

    const auto violations = checker.getRuleViolations();
    const auto* v = findViolationByRuleId(violations, "2003.2");
    ASSERT_NE(nullptr, v);
    EXPECT_NE(v->violation_msg.find("actual=18:00"), std::string::npos);
    EXPECT_NE(v->violation_msg.find("limit=14:00"), std::string::npos);
}

// Guardrail: more duties are scheduled than the rule permits.
TEST_F(Rule2003Test, DutyCountLimitFail) {
    Rule2003Config cfg;
    cfg.maxDuties = 2;
    cfg.maxBlh = "20:00";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({0, 180, 0, 180, 30, 30, 120, "PEK", "CKG"}));
    duties.push_back(makeDuty({240, 420, 240, 420, 20, 20, 120, "CKG", "XIY"}));
    duties.push_back(makeDuty({480, 660, 480, 660, 20, 20, 140, "XIY", "PEK"}));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    EXPECT_FALSE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));

    const auto violations = checker.getRuleViolations();
    const auto* v = findViolationByRuleId(violations, "2003.3");
    ASSERT_NE(nullptr, v);
    EXPECT_NE(v->violation_msg.find("actual=3"), std::string::npos);
    EXPECT_NE(v->violation_msg.find("limit=2"), std::string::npos);
}

// Guardrail: layover pattern spans too many calendar days once local time is considered.
TEST_F(Rule2003Test, CalendarDaysExceededFail) {
    Rule2003Config cfg;
    cfg.maxPairingLengthHours = 80;
    cfg.maxBlh = "30:00";
    cfg.maxDays = "2";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({0, 120, 0, 120, 0, 0, 60, "PEK", "CKG"}));
    duties.push_back(makeDuty({2880, 3000, 2880, 3000, 0, 0, 60, "CKG", "PEK"}));  // starts on day 2

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    EXPECT_FALSE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));

 }

// Guardrail: pairing returns to the base airport mid-journey even though the rule forbids it.
TEST_F(Rule2003Test, ReturningToBaseWhenNotAllowedFail) {
    Rule2003Config cfg;
    cfg.allowReturnBase = "N";
    cfg.maxBlh = "20:00";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({0, 180, 0, 180, 30, 30, 120, "PEK", "PEK"}));
    duties.push_back(makeDuty({240, 420, 240, 420, 30, 30, 120, "PEK", "PEK"}));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    EXPECT_FALSE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));
}

// Guardrail: duty layover occurs at an airport that is not on the approved layover list.
TEST_F(Rule2003Test, LayoverStationRestrictionFail) {
    Rule2003Config cfg;
    cfg.layoverStations = {"CKG", "XIY"};
    cfg.maxBlh = "20:00";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({0, 180, 0, 180, 30, 30, 120, "PEK", "SHA"}));
    duties.push_back(makeDuty({240, 420, 240, 420, 30, 30, 120, "SHA", "CKG"}));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    EXPECT_FALSE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));
}

TEST_F(Rule2003Test, ParseLegacySevenColumnRowsTreatNewFiltersAsWildcard) {
    DBRule dbRule;
    dbRule.function = 2003;
    dbRule.params["BASE"] = "SIN";
    dbRule.params["MAXPAIRINGLENGTH"] = "999";
    dbRule.params["MAXNRDUTIESINPAIRING"] = "4";
    dbRule.params["ALLOWRETURNBASEWITHINDUTY"] = "Y";
    dbRule.params["MAXPAIRINGBLH"] = "100:00";
    dbRule.params["MAXPAIRINGCALENDARDAYS"] = "10";
    dbRule.params["ALLOWABLE LAYOVER STATIONS"] = "*";

    auto parsed = std::static_pointer_cast<rule2003>(parseRuleParam2003(dbRule));
    EXPECT_TRUE(parsed->fleets.empty());
    EXPECT_TRUE(parsed->fleetGroups.empty());
}

TEST_F(Rule2003Test, ParseFleetAndFleetGroupFiltersNormalizesToUppercase) {
    DBRule dbRule;
    dbRule.function = 2003;
    dbRule.params["BASE"] = "SIN";
    dbRule.params["MAXPAIRINGLENGTH"] = "999";
    dbRule.params["MAXNRDUTIESINPAIRING"] = "4";
    dbRule.params["ALLOWRETURNBASEWITHINDUTY"] = "Y";
    dbRule.params["MAXPAIRINGBLH"] = "100:00";
    dbRule.params["MAXPAIRINGCALENDARDAYS"] = "10";
    dbRule.params["ALLOWABLE LAYOVER STATIONS"] = "*";
    dbRule.params["FLEETS"] = "a350| b737 ";
    dbRule.params["FLEET GROUP"] = "wb| nb ";

    auto parsed = std::static_pointer_cast<rule2003>(parseRuleParam2003(dbRule));
    ASSERT_EQ(parsed->fleets.size(), 2U);
    EXPECT_EQ(parsed->fleets[0], "A350");
    EXPECT_EQ(parsed->fleets[1], "B737");
    ASSERT_EQ(parsed->fleetGroups.size(), 2U);
    EXPECT_EQ(parsed->fleetGroups[0], "WB");
    EXPECT_EQ(parsed->fleetGroups[1], "NB");
}

TEST_F(Rule2003Test, FleetFilterAllowsMatchingOperatingSegments) {
    Rule2003Config cfg;
    cfg.fleets = {"A350"};
    cfg.maxPairingLengthHours = 20;
    cfg.maxBlh = "20:00";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment({"PEK", "CKG", "A350", true, "FLY"}));
    segs.push_back(makeSegment({"CKG", "PEK", "A350", true, "FLY"}));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithSegments({0, 360, 0, 360, 30, 30, 300, "PEK", "CKG"}, {segs[0].get()}));
    duties.push_back(makeDutyWithSegments({600, 960, 600, 960, 30, 30, 300, "CKG", "PEK"}, {segs[1].get()}));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    EXPECT_TRUE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));
}

TEST_F(Rule2003Test, FleetFilterSkipsNonMatchingRows) {
    Rule2003Config cfg;
    cfg.fleets = {"B737"};
    cfg.maxPairingLengthHours = 6;
    cfg.maxBlh = "20:00";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment({"PEK", "CKG", "A350", true, "FLY"}));
    segs.push_back(makeSegment({"CKG", "PEK", "A350", true, "FLY"}));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithSegments({0, 360, 0, 360, 30, 30, 300, "PEK", "CKG"}, {segs[0].get()}));
    duties.push_back(makeDutyWithSegments({600, 960, 600, 960, 30, 30, 300, "CKG", "PEK"}, {segs[1].get()}));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    EXPECT_TRUE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));
    EXPECT_TRUE(checker.getRuleViolations().empty());
}

TEST_F(Rule2003Test, FleetGroupFilterAllowsMatchingOperatingSegments) {
    Rule2003Config cfg;
    cfg.fleetGroups = {"WB"};
    cfg.maxPairingLengthHours = 20;
    cfg.maxBlh = "20:00";
    auto rule = makeRule2003(cfg);

    auto ctx = buildDataContextFor2003();
    FLEET a350{};
    a350.fleet = "A350";
    a350.fleetGrp = "WB";
    ctx->fleetMap["A350"] = a350;

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment({"PEK", "CKG", "A350", true, "FLY"}));
    segs.push_back(makeSegment({"CKG", "PEK", "A350", true, "FLY"}));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithSegments({0, 360, 0, 360, 30, 30, 300, "PEK", "CKG"}, {segs[0].get()}));
    duties.push_back(makeDutyWithSegments({600, 960, 600, 960, 30, 30, 300, "CKG", "PEK"}, {segs[1].get()}));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    checker.setDataContext(ctx, -1, false);
    EXPECT_TRUE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));
}

TEST_F(Rule2003Test, FleetGroupFilterSkipsMixedFleetGroupPairings) {
    Rule2003Config cfg;
    cfg.fleetGroups = {"WB"};
    cfg.maxPairingLengthHours = 6;
    cfg.maxBlh = "20:00";
    auto rule = makeRule2003(cfg);

    auto ctx = buildDataContextFor2003();
    FLEET a350{};
    a350.fleet = "A350";
    a350.fleetGrp = "WB";
    ctx->fleetMap["A350"] = a350;
    FLEET b737{};
    b737.fleet = "B737";
    b737.fleetGrp = "NB";
    ctx->fleetMap["B737"] = b737;

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment({"PEK", "CKG", "A350", true, "FLY"}));
    segs.push_back(makeSegment({"CKG", "PEK", "B737", true, "FLY"}));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithSegments({0, 360, 0, 360, 30, 30, 300, "PEK", "CKG"}, {segs[0].get()}));
    duties.push_back(makeDutyWithSegments({600, 960, 600, 960, 30, 30, 300, "CKG", "PEK"}, {segs[1].get()}));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    checker.setDataContext(ctx, -1, false);
    EXPECT_TRUE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));
    EXPECT_TRUE(checker.getRuleViolations().empty());
}

TEST_F(Rule2003Test, DeadheadSegmentsDoNotAffectFleetFilters) {
    Rule2003Config cfg;
    cfg.fleets = {"A350"};
    cfg.maxPairingLengthHours = 20;
    cfg.maxBlh = "20:00";
    auto rule = makeRule2003(cfg);

    std::vector<std::unique_ptr<Segment>> segs;
    segs.push_back(makeSegment({"PEK", "CKG", "A350", true, "FLY"}));
    segs.push_back(makeSegment({"CKG", "PEK", "B737", false, "DHD"}));

    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDutyWithSegments({0, 360, 0, 360, 30, 30, 300, "PEK", "CKG"}, {segs[0].get()}));
    duties.push_back(makeDutyWithSegments({600, 960, 600, 960, 30, 30, 0, "CKG", "PEK"}, {segs[1].get()}));

    auto raw = asRaw(duties);
    auto pairing = makePairing(raw, cfg.base);
    LegalityChecker checker(PAIRING_EDITOR, false);
    EXPECT_TRUE(checker.checkPairingLimitationImplemenation(raw, rule.get(), pairing.get()));
}
