// SIA_SUITE_SUMMARY_START
// SuiteId: 6.14
// Name: Forced complements for two flights strung together
// SourceCsvRow: 6.14.,Forced complements for two flights strung together
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case1_CorrectComplement_NoAlert: route match with required 2 CAP 2 FO.
//   - Case2_WrongComplement_SoftAlert: route match with 2 CAP 1 FO triggers violation.
// Results:
//   - TODO
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <map>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7469/ForcedComplementForDutyRouteForSQRule.h"
#include "SIA_CommonTestConfig.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t utcFromString(const std::string& value) {
    return utcStrToUtc(const_cast<char*>(value.c_str()));
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& flightNumber,
                                     const std::string& assignment,
                                     const std::string& serviceType,
                                     const std::string& fleet,
                                     const std::map<std::string, int>& planComp,
                                     time_t startUtc,
                                     time_t endUtc,
                                     int dutyId,
                                     int segSeq) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFlightNumber(flightNumber);
    seg->setAssignment(assignment);
    seg->setServiceType(serviceType);
    seg->setFleetCD(fleet);
    seg->setIsOperating(true);
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setStartTimeLocAct(startUtc);
    seg->setEndTimeLocAct(endUtc);
    seg->setStartTimeLocSch(startUtc);
    seg->setEndTimeLocSch(endUtc);
    seg->setDutyId(dutyId);
    seg->setSegSeq(segSeq);
    seg->setPairingId(1);
    seg->setPlanComposition(planComp);
    seg->resetOpenComposition(planComp);
    return seg;
}

std::unique_ptr<Duty> makeDutyFromSegments(const std::vector<Segment*>& segs,
                                           const std::string& assignment,
                                           const std::string& composition,
                                           int dutyId,
                                           int dutySeq) {
    auto duty = std::make_unique<Duty>(segs);
    duty->setId(dutyId);
    duty->setPairingId(1);
    duty->setDutySeq(dutySeq);
    duty->setAssignment(assignment);
    duty->setCompositionName(composition);
    duty->setDepartureStation(segs.front()->getDepStationRead());
    duty->setArrivalStation(segs.back()->getArrStationRead());
    duty->setStartTimeUtcAct(segs.front()->getStartTimeUtcAct());
    duty->setEndTimeUtcAct(segs.back()->getEndTimeUtcAct());
    duty->setStartTimeLocAct(duty->getStartTimeUtcAct());
    duty->setEndTimeLocAct(duty->getEndTimeUtcAct());
    return duty;
}

RuleInput makeRuleInput() {
    RuleInput input;
    DBRule row{};
    row.idRule = 7469;
    row.function = 7469;
    row.tableNum = 1;
    row.rowNum = 1;
    row.idRuleParam = 7469001;
    row.overridebility = "S";
    row.reference = "SQ";
    row.params["DUTY ROUTES"] = "SIN-HKG-SHJ";
    row.params["SERVICE TYPES"] = "F";
    row.params["FLEETS"] = "77F";
    row.params["FLEET GROUPS"] = "B77F";
    row.params["COMPOSITIONS"] = "4P";
    row.params["RANK PLAN"] = "CAP:2+FO:2";
    input.dbRules.push_back(row);
    return input;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

SharedPtr<CrewDataContext> buildContext() {
    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"HKG", 480, "Asia/Hong_Kong"},
        {"SHJ", 240, "Asia/Dubai"},
    });

    FLEET fleet;
    fleet.fleet = "77F";
    fleet.fleetGrp = "B77F";
    ctx->fleetMap["77F"] = fleet;

    RANK cap{};
    cap.rank = "CAP";
    cap.division = "P";
    cap.isMustCrewRank = true;
    ctx->rankMap["CAP"] = cap;

    RANK fo{};
    fo.rank = "FO";
    fo.division = "P";
    fo.isMustCrewRank = true;
    ctx->rankMap["FO"] = fo;

    return ctx;
}

}  // namespace

class Sia614ForcedComplementTwoFlightsTest : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(BATCH_LEGALITY);
    }

    void TearDown() override {
        deleteViolations(_violations);
        _violationMessages.clear();
    }

    std::vector<RULE_VIOLATION*> _violations;
    std::vector<std::string> _violationMessages;
    SIATest::SiaRuleParamGuard _paramGuard;
};

TEST_F(Sia614ForcedComplementTwoFlightsTest, Case1_CorrectComplement_NoAlert) {
    auto ctx = buildContext();
    std::vector<std::unique_ptr<Segment>> segStorage;

    std::map<std::string, int> planComp = {{"CAP", 2}, {"FO", 2}};
    segStorage.push_back(makeSegment("SIN", "HKG", "7801", "FLY", "F", "77F",
                                     planComp,
                                     utcFromString("2025-12-12 06:00:00"),
                                     utcFromString("2025-12-12 12:00:00"),
                                     1, 1));
    segStorage.push_back(makeSegment("HKG", "SHJ", "7802", "FLY", "F", "77F",
                                     planComp,
                                     utcFromString("2025-12-12 14:00:00"),
                                     utcFromString("2025-12-12 20:00:00"),
                                     1, 2));

    std::vector<Segment*> segs = {segStorage[0].get(), segStorage[1].get()};
    auto duty = makeDutyFromSegments(segs, "FLY", "4P", 1, 1);

    RuleInput input = makeRuleInput();
    ForcedComplementForDutyRouteForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setDataContext(ctx);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_TRUE(rule.CheckRule(duty.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(Sia614ForcedComplementTwoFlightsTest, Case2_WrongComplement_SoftAlert) {
    auto ctx = buildContext();
    std::vector<std::unique_ptr<Segment>> segStorage;

    std::map<std::string, int> planCompOk = {{"CAP", 2}, {"FO", 2}};
    std::map<std::string, int> planCompBad = {{"CAP", 2}, {"FO", 1}};

    segStorage.push_back(makeSegment("SIN", "HKG", "7801", "FLY", "F", "77F",
                                     planCompOk,
                                     utcFromString("2025-12-12 06:00:00"),
                                     utcFromString("2025-12-12 12:00:00"),
                                     1, 1));
    segStorage.push_back(makeSegment("HKG", "SHJ", "7802", "FLY", "F", "77F",
                                     planCompBad,
                                     utcFromString("2025-12-12 14:00:00"),
                                     utcFromString("2025-12-12 20:00:00"),
                                     1, 2));

    std::vector<Segment*> segs = {segStorage[0].get(), segStorage[1].get()};
    auto duty = makeDutyFromSegments(segs, "FLY", "4P", 1, 1);

    RuleInput input = makeRuleInput();
    ForcedComplementForDutyRouteForSQRule rule(nullptr, input);
    rule.setApplication(BATCH_LEGALITY);
    rule.setDataContext(ctx);
    rule.setViolations(&_violationMessages);
    rule.setRuleViolation(&_violations);

    EXPECT_FALSE(rule.CheckRule(duty.get()));
    ASSERT_EQ(_violations.size(), 1u);
    EXPECT_EQ(_violations.front()->idRule, 7469);
}
