#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7227/CheckLayoverRestrictionRule.h"

#include <memory>
#include <string>
#include <vector>

namespace {

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& fleet,
                                     time_t startUtc,
                                     time_t endUtc,
                                     int pairingId,
                                     int dutySeq,
                                     int segSeq) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD(fleet);
    seg->setAssignment("FLY");
    seg->setFlightNumber("SQ" + std::to_string(segSeq));
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setStartTimeLocSch(startUtc);
    seg->setEndTimeLocSch(endUtc);
    seg->setIsOperating(true);
    seg->setPairingId(pairingId);
    seg->setDutySeq(dutySeq);
    seg->setSegSeq(segSeq);
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments, int pairingId, int dutySeq) {
    auto duty = std::make_unique<Duty>(segments);
    duty->setPairingId(pairingId);
    duty->setDutySeq(dutySeq);
    duty->setAssignment("FLY");
    if (!segments.empty()) {
        duty->setDepartureStation(segments.front()->getDepStation());
        duty->setArrivalStation(segments.back()->getArrStation());
        duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct());
        duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct());
        duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct());
        duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct());
    }
    return duty;
}

struct PairingFixture {
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> duties;
    std::unique_ptr<Pairing> pairing;
};

PairingFixture makeTwoDutyPairing(const std::string& firstDep,
                                  const std::string& layoverStation,
                                  const std::string& secondArr,
                                  const std::string& fleet) {
    constexpr int kPairingId = 7227;
    PairingFixture fixture{};
    fixture.segments.push_back(makeSegment(firstDep, layoverStation, fleet, 0, 3600, kPairingId, 1, 1));
    fixture.segments.push_back(makeSegment(layoverStation, secondArr, fleet, 7200, 10800, kPairingId, 2, 2));

    std::vector<Segment*> duty1Segs{fixture.segments[0].get()};
    std::vector<Segment*> duty2Segs{fixture.segments[1].get()};
    fixture.duties.push_back(makeDuty(duty1Segs, kPairingId, 1));
    fixture.duties.push_back(makeDuty(duty2Segs, kPairingId, 2));

    std::vector<Duty*> dutyRaw{fixture.duties[0].get(), fixture.duties[1].get()};
    fixture.pairing = std::make_unique<Pairing>(dutyRaw);
    fixture.pairing->setDbId(kPairingId);
    fixture.pairing->setBase("SIN");
    fixture.pairing->setPrimeActivity("FLY");
    fixture.pairing->setStartTimeUtcAct(fixture.duties[0]->getStartTimeUtcAct());
    fixture.pairing->setEndTimeUtcAct(fixture.duties[1]->getEndTimeUtcAct());
    fixture.pairing->setStartTimeLocAct(fixture.duties[0]->getStartTimeLocAct());
    fixture.pairing->setEndTimeLocAct(fixture.duties[1]->getEndTimeLocAct());

    return fixture;
}

DBRule makeRule7227Row(const std::string& fleets,
                       const std::string& deps,
                       const std::string& arvs,
                       const std::string& forceLayover = "N",
                       const std::string& forceNotLayover = "Y") {
    DBRule row{};
    row.idRule = 7227001;
    row.function = 7227;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 722700101;
    row.overridebility = "H";
    row.reference = "SQ";

    row.params["PAIRING BASE"] = "*";
    row.params["ASSIGNMENTS"] = "*";
    row.params["AIRLINE CODE"] = "*";
    row.params["FLIGHT FLEETS"] = fleets;
    row.params["FLIGHT NUMBERS"] = "*";
    row.params["DEPS"] = deps;
    row.params["ARVS"] = arvs;
    row.params["START DATE"] = "*";
    row.params["END DATE"] = "*";
    row.params["FORCE LAYOVER"] = forceLayover;
    row.params["FORCE NOT LAYOVER"] = forceNotLayover;
    return row;
}

std::unique_ptr<CheckLayoverRestrictionRule> makeRule7227(const DBRule& row) {
    RuleInput input;
    input.dbRules.push_back(row);
    auto rule = std::make_unique<CheckLayoverRestrictionRule>(nullptr, input);
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    rule->setDataContext(ctx);
    rule->setApplication(PAIRING_EDITOR);
    return rule;
}

PairingFixture makeSingleDutyTwoSegmentPairing(const std::string& firstDep,
                                               const std::string& middleStation,
                                               const std::string& finalArr,
                                               const std::string& fleet) {
    constexpr int kPairingId = 7228;
    PairingFixture fixture{};
    fixture.segments.push_back(makeSegment(firstDep, middleStation, fleet, 0, 3600, kPairingId, 1, 1));
    fixture.segments.push_back(makeSegment(middleStation, finalArr, fleet, 4200, 7800, kPairingId, 1, 2));

    std::vector<Segment*> dutySegs{fixture.segments[0].get(), fixture.segments[1].get()};
    fixture.duties.push_back(makeDuty(dutySegs, kPairingId, 1));

    std::vector<Duty*> dutyRaw{fixture.duties[0].get()};
    fixture.pairing = std::make_unique<Pairing>(dutyRaw);
    fixture.pairing->setDbId(kPairingId);
    fixture.pairing->setBase("SIN");
    fixture.pairing->setPrimeActivity("FLY");
    fixture.pairing->setStartTimeUtcAct(fixture.duties[0]->getStartTimeUtcAct());
    fixture.pairing->setEndTimeUtcAct(fixture.duties[0]->getEndTimeUtcAct());
    fixture.pairing->setStartTimeLocAct(fixture.duties[0]->getStartTimeLocAct());
    fixture.pairing->setEndTimeLocAct(fixture.duties[0]->getEndTimeLocAct());

    return fixture;
}

PairingFixture makePairingFromDutyChains(const std::vector<std::vector<std::string>>& dutyChains,
                                         const std::string& fleet,
                                         const std::string& base) {
    PairingFixture fixture{};
    constexpr int kPairingId = 7299;
    time_t cursor = 0;
    int segSeq = 1;

    std::vector<Duty*> dutyRaw;
    dutyRaw.reserve(dutyChains.size());

    for (size_t dutyIndex = 0; dutyIndex < dutyChains.size(); ++dutyIndex) {
        const auto& chain = dutyChains[dutyIndex];
        std::vector<Segment*> segRaw;
        if (chain.size() >= 2) {
            for (size_t i = 0; i + 1 < chain.size(); ++i) {
                fixture.segments.push_back(
                    makeSegment(chain[i], chain[i + 1], fleet, cursor, cursor + 1800, kPairingId, static_cast<int>(dutyIndex + 1), segSeq++));
                segRaw.push_back(fixture.segments.back().get());
                cursor += 2400;
            }
        }
        fixture.duties.push_back(makeDuty(segRaw, kPairingId, static_cast<int>(dutyIndex + 1)));
        dutyRaw.push_back(fixture.duties.back().get());
        cursor += 3600;
    }

    fixture.pairing = std::make_unique<Pairing>(dutyRaw);
    fixture.pairing->setDbId(kPairingId);
    fixture.pairing->setBase(base);
    fixture.pairing->setPrimeActivity("FLY");
    if (!fixture.duties.empty()) {
        fixture.pairing->setStartTimeUtcAct(fixture.duties.front()->getStartTimeUtcAct());
        fixture.pairing->setEndTimeUtcAct(fixture.duties.back()->getEndTimeUtcAct());
        fixture.pairing->setStartTimeLocAct(fixture.duties.front()->getStartTimeLocAct());
        fixture.pairing->setEndTimeLocAct(fixture.duties.back()->getEndTimeLocAct());
    }
    return fixture;
}

void cleanupViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

TEST(Rule7227Test, ForceNotLayoverAllowsListedAirportsForFleet737) {
    auto fixture = makeTwoDutyPairing("SIN", "TFU", "SIN", "737");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "!(SIN|TFU|KTM|CKG|PUS|SIN)"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, ForceNotLayoverBlocksNonListedAirportForFleet73M) {
    auto fixture = makeTwoDutyPairing("SIN", "NRT", "SIN", "73M");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "!(SIN|TFU|KTM|CKG|PUS|SIN)"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_FALSE(rule->CheckRule(fixture.pairing.get()));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_EQ(violations[0]->violation_msg,
              "Layover at NRT is not allowed. Allowed layover stations: SIN, TFU, KTM, CKG, PUS, SIN.");
    EXPECT_TRUE(violationMessages.empty());
    cleanupViolations(violations);
}

TEST(Rule7227Test, ForceNotLayoverIgnoredWhenFleetNotInScope) {
    auto fixture = makeTwoDutyPairing("SIN", "NRT", "SIN", "359");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "!(SIN|TFU|KTM|CKG|PUS)"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, ForceNotLayoverAppliesAtArvsAirportOnly) {
    auto fixture = makeTwoDutyPairing("SIN", "MNL", "SIN", "737");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "MNL"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_FALSE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, ForceNotLayoverAllowsMatchedRouteWhenNotDutyLastSegment) {
    auto fixture = makeSingleDutyTwoSegmentPairing("SIN", "MNL", "KUL", "737");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "MNL"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, ForceLayoverPassesWhenMatchedArrIsLayoverStation) {
    auto fixture = makeTwoDutyPairing("SIN", "TFU", "SIN", "737");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "TFU", "Y", "N"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, ForceLayoverFailsWhenMatchedArrIsNotLayoverStation) {
    auto fixture = makeSingleDutyTwoSegmentPairing("SIN", "TFU", "KUL", "737");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "TFU", "Y", "N"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_FALSE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, IntendedCase_SinTfuThenTfuSin_Legal) {
    auto fixture = makePairingFromDutyChains({{"SIN", "TFU"}, {"TFU", "SIN"}}, "737", "SIN");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "!(SIN|TFU|KTM|CKG|PUS)"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, IntendedCase_SinMnlThenMnlSin_Illegal) {
    auto fixture = makePairingFromDutyChains({{"SIN", "MNL"}, {"MNL", "SIN"}}, "737", "SIN");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "!(SIN|TFU|KTM|CKG|PUS)"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_FALSE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, IntendedCase_SinKulTfuThenTfuSin_Legal) {
    auto fixture = makePairingFromDutyChains({{"SIN", "KUL", "TFU"}, {"TFU", "SIN"}}, "737", "SIN");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "!(SIN|TFU|KTM|CKG|PUS)"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_TRUE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, IntendedCase_SinTfuMnlThenMnlTfuSin_Illegal) {
    auto fixture = makePairingFromDutyChains({{"SIN", "TFU", "MNL"}, {"MNL", "TFU", "SIN"}}, "737", "SIN");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "!(SIN|TFU|KTM|CKG|PUS)"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_FALSE(rule->CheckRule(fixture.pairing.get()));
    cleanupViolations(violations);
}

TEST(Rule7227Test, ForceNotLayoverMessageOmitsWildcardDates) {
    auto fixture = makeTwoDutyPairing("SIN", "MNL", "SIN", "737");
    auto rule = makeRule7227(makeRule7227Row("737|73M", "*", "!(SIN|TFU|KTM|CKG|PUS)"));
    std::vector<std::string> violationMessages;
    std::vector<RULE_VIOLATION*> violations;
    rule->setViolations(&violationMessages);
    rule->setRuleViolation(&violations);

    EXPECT_FALSE(rule->CheckRule(fixture.pairing.get()));
    ASSERT_EQ(violations.size(), 1u);
    EXPECT_EQ(violations[0]->violation_msg,
              "Layover at MNL is not allowed. Allowed layover stations: SIN, TFU, KTM, CKG, PUS.");
    EXPECT_EQ(violations[0]->violation_msg.find('*'), std::string::npos);
    cleanupViolations(violations);
}
