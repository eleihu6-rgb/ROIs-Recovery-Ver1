#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/rule7424/CalculateOvernightAtdoAtBaseForSQRule.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

#include <memory>
#include <string>
#include <vector>

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

SharedPtr<CrewDataContext> buildDataContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    FLEET nb{};
    nb.fleet = "A320";
    nb.fleetGrp = "NB";
    ctx->fleetMap[nb.fleet] = nb;
    ctx->airportUtcOffsetMap["SIN"] = 0;
    return ctx;
}

std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& fleet = "A320",
                                     const std::string& serviceType = "J",
                                     bool isOperating = true) {
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
    seg->setFleetCD(fleet);
    seg->setServiceType(serviceType);
    seg->setIsOperating(isOperating);
    return seg;
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments,
                               const std::string& dutyStartUtc,
                               const std::string& dutyEndUtc,
                               const std::string& depStation,
                               const std::string& arrStation) {
    auto duty = std::make_unique<Duty>(segments);
    const time_t start = utcFromString(dutyStartUtc);
    const time_t end = utcFromString(dutyEndUtc);
    duty->setStartTimeUtcAct(start);
    duty->setEndTimeUtcAct(end);
    duty->setStartTimeUtcSch(start);
    duty->setEndTimeUtcSch(end);
    duty->setStartTimeLocAct(start);
    duty->setEndTimeLocAct(end);
    duty->setStartTimeLocSch(start);
    duty->setEndTimeLocSch(end);
    duty->setDepartureStation(depStation);
    duty->setArrivalStation(arrStation);
    duty->setAssignment("FLY");
    duty->setMinDropoff(0);
    duty->setActualDropoffMin(0);
    return duty;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    return pairing;
}

int expectedMinRestMinutes(time_t restStartLoc, int atdoDays) {
    const time_t day = 24 * 3600;
    time_t restEndLoc = restStartLoc + static_cast<time_t>(atdoDays) * day;
    if (restStartLoc % day != 0) {
        restEndLoc += ((restStartLoc / day + 1) * day - restStartLoc);
    }
    return static_cast<int>((restEndLoc - restStartLoc) / 60);
}

DBRule makeTable1Row(int rowNum,
                     const std::string& clause,
                     int atdoDays,
                     const std::string& overnightAfter,
                     const std::string& minFdp,
                     const std::string& finalStartStations) {
    DBRule row{};
    row.idRule = 7424001;
    row.function = 7424;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.idRuleParam = 742400000 + rowNum;
    row.overridebility = "H";
    row.reference = "SQ";
    row.params["Clause"] = clause;
    row.params["ATDO days"] = std::to_string(atdoDays);
    row.params["Overnight Arrive After"] = overnightAfter;
    row.params["Min FDP"] = minFdp;
    row.params["Final Start Stations"] = finalStartStations;
    return row;
}

DBRule makeTable2Row(const std::string& doStartsAfter,
                     const std::string& serviceType = "*",
                     const std::string& fleetGroup = "*") {
    DBRule row{};
    row.idRule = 7424001;
    row.function = 7424;
    row.tableNum = 2;
    row.rowNum = 1;
    row.idRuleParam = 742499999;
    row.overridebility = "H";
    row.reference = "SQ";
    row.params["DO starts after"] = doStartsAfter;
    row.params["Service Type"] = serviceType;
    row.params["Fleet Group"] = fleetGroup;
    return row;
}

}  // namespace

class Rule7424Test : public ::testing::Test {
protected:
    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
    }
};

TEST_F(Rule7424Test, AppliesOvernightWithFdpWhenStationIgnored) {
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment("BKK", "SIN",
                                     "2025-01-01 20:30:00",
                                     "2025-01-02 03:00:00"));
    std::vector<Segment*> segs{segStorage.back().get()};

    auto duty = makeDuty(segs,
                         "2025-01-01 20:00:00",
                         "2025-01-02 03:00:00",
                         "BKK",
                         "SIN");
    duty->setActualFDP(9 * 60);
    duty->setPlanFDP(9 * 60);

    std::vector<Duty*> duties{duty.get()};
    auto pairing = makePairing(duties, "SIN");

    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "*", "NB"));
    input.dbRules.push_back(makeTable1Row(1, "Overnight", 2, "02:30", "08:00", "*"));

    CalculateOvernightAtdoAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const time_t restStartLoc = utcFromString("2025-01-02 03:00:00");
    const int expected = expectedMinRestMinutes(restStartLoc, 2);
    EXPECT_EQ(duty->getMinRestAtBase(), expected);
    EXPECT_EQ(duty->getMinRest(), expected);
    EXPECT_EQ(duty->getMinATDO(), 2);
}

TEST_F(Rule7424Test, AppliesWhenFinalStartStationMatchesAndOthersIgnored) {
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment("KTM", "SIN",
                                     "2025-01-01 10:30:00",
                                     "2025-01-01 14:00:00"));
    std::vector<Segment*> segs{segStorage.back().get()};

    auto duty = makeDuty(segs,
                         "2025-01-01 10:00:00",
                         "2025-01-01 14:00:00",
                         "KTM",
                         "SIN");
    duty->setActualFDP(4 * 60);
    duty->setPlanFDP(4 * 60);

    std::vector<Duty*> duties{duty.get()};
    auto pairing = makePairing(duties, "SIN");

    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "*", "NB"));
    input.dbRules.push_back(makeTable1Row(1, "KTM", 2, "*", "*", "KTM"));

    CalculateOvernightAtdoAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    const time_t restStartLoc = utcFromString("2025-01-01 14:00:00");
    const int expected = expectedMinRestMinutes(restStartLoc, 2);
    EXPECT_EQ(duty->getMinRestAtBase(), expected);
    EXPECT_EQ(duty->getMinRest(), expected);
    EXPECT_EQ(duty->getMinATDO(), 2);
}

TEST_F(Rule7424Test, DoesNotApplyWhenFinalStartStationDoesNotMatch) {
    auto ctx = buildDataContext();

    std::vector<std::unique_ptr<Segment>> segStorage;
    segStorage.push_back(makeSegment("BKK", "SIN",
                                     "2025-01-01 20:30:00",
                                     "2025-01-02 03:00:00"));
    std::vector<Segment*> segs{segStorage.back().get()};

    auto duty = makeDuty(segs,
                         "2025-01-01 20:00:00",
                         "2025-01-02 03:00:00",
                         "BKK",
                         "SIN");
    duty->setActualFDP(9 * 60);
    duty->setPlanFDP(9 * 60);

    std::vector<Duty*> duties{duty.get()};
    auto pairing = makePairing(duties, "SIN");

    RuleInput input;
    input.dbRules.push_back(makeTable2Row("TRANSPORT", "*", "NB"));
    input.dbRules.push_back(makeTable1Row(1, "KTM", 2, "02:30", "08:00", "KTM"));

    CalculateOvernightAtdoAtBaseForSQRule rule(nullptr, input);
    rule.setDataContext(ctx);
    rule.setApplication(PAIRING_EDITOR);
    rule.CalculateDuty(pairing.get());

    EXPECT_EQ(duty->getMinRestAtBase(), 0);
    EXPECT_EQ(duty->getMinRest(), 0);
    EXPECT_EQ(duty->getMinATDO(), 0);
}
