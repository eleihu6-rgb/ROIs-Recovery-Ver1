#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "db/CrewDB.h"
#include "db/Duty.h"
#include "db/Pairing.h"
#include "db/PairingLabel/CalculatePairingLabelForSQ.h"
#include "db/Segment.h"
#include "GlobalDefinition/RuleEngineDef.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t toUtc(const std::string& dt) {
    return utcStrToUtc(const_cast<char*>(dt.c_str()));
}

std::unique_ptr<Segment> makeSegment(const long long id,
                                     const std::string& dep,
                                     const std::string& arr,
                                     const std::string& assignment,
                                     const bool isOperating,
                                     const std::string& serviceType,
                                     const std::string& startUtcStr,
                                     const std::string& endUtcStr) {
    auto segment = std::make_unique<Segment>();
    const time_t startUtc = toUtc(startUtcStr);
    const time_t endUtc = toUtc(endUtcStr);

    segment->setDBId(id);
    segment->setDepStation(dep);
    segment->setArrStation(arr);
    segment->setAssignment(assignment);
    segment->setIsOperating(isOperating);
    segment->setServiceType(serviceType);
    segment->setAirline("SQ");
    segment->setFlightNumber("1");

    segment->setStartTimeUtcSch(startUtc);
    segment->setEndTimeUtcSch(endUtc);
    segment->setStartTimeUtcAct(startUtc);
    segment->setEndTimeUtcAct(endUtc);
    segment->setStartTimeLocSch(startUtc);
    segment->setEndTimeLocSch(endUtc);
    segment->setStartTimeLocAct(startUtc);
    segment->setEndTimeLocAct(endUtc);
    return segment;
}

std::unique_ptr<Duty> makeDuty(Segment* segment, const std::string& assignment) {
    std::vector<Segment*> segments = { segment };
    auto duty = std::make_unique<Duty>(segments);
    duty->setAssignment(assignment);
    duty->setDepStation(segment->getDepStationRead());
    duty->setArrStation(segment->getArrStationRead());
    return duty;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase("SIN");
    pairing->setPrimeActivity("FLY");
    return pairing;
}

std::string getComplementField(const Pairing& pairing) {
    const auto fields = PairingLabel::splitLabel(pairing.getLabel());
    if (fields.size() < 3) {
        return "";
    }
    return fields[2];
}

TEST(SqPairingLabelTest, ComplementIsPSWhenFirstDutyIsPositionDuty) {
    CrewDataContext dbData(CREW_APP_TYPE_OR, false);
    dbData.scenario.airline = "SQ";
    dbData.scenario.division = "P";

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    segmentStorage.push_back(makeSegment(1, "SIN", "HKG", "MVP", false, "P", "2025-01-01 01:00:00", "2025-01-01 05:00:00"));
    segmentStorage.push_back(makeSegment(2, "HKG", "SIN", "FLY", true, "P", "2025-01-02 01:00:00", "2025-01-02 05:00:00"));

    std::vector<std::unique_ptr<Duty>> dutyStorage;
    dutyStorage.push_back(makeDuty(segmentStorage[0].get(), "MVP"));
    dutyStorage.push_back(makeDuty(segmentStorage[1].get(), "FLY"));

    std::vector<Duty*> duties = { dutyStorage[0].get(), dutyStorage[1].get() };
    auto pairing = makePairing(duties);

    CalculatePairingLabelForSQ calculator(&dbData);
    calculator.calculate(pairing.get(), 0);

    EXPECT_EQ(getComplementField(*pairing), "PS");
}

TEST(SqPairingLabelTest, ComplementIsNotPSWhenOnlyLaterDutyIsPositionDuty) {
    CrewDataContext dbData(CREW_APP_TYPE_OR, false);
    dbData.scenario.airline = "SQ";
    dbData.scenario.division = "P";

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    segmentStorage.push_back(makeSegment(11, "SIN", "HKG", "FLY", true, "P", "2025-01-01 01:00:00", "2025-01-01 05:00:00"));
    segmentStorage.push_back(makeSegment(12, "HKG", "SIN", "MVP", false, "P", "2025-01-02 01:00:00", "2025-01-02 05:00:00"));

    std::vector<std::unique_ptr<Duty>> dutyStorage;
    dutyStorage.push_back(makeDuty(segmentStorage[0].get(), "FLY"));
    dutyStorage.push_back(makeDuty(segmentStorage[1].get(), "MVP"));

    std::vector<Duty*> duties = { dutyStorage[0].get(), dutyStorage[1].get() };
    auto pairing = makePairing(duties);

    CalculatePairingLabelForSQ calculator(&dbData);
    calculator.calculate(pairing.get(), 0);

    EXPECT_NE(getComplementField(*pairing), "PS");
}

TEST(SqPairingLabelTest, PositioningComplementIsPXForCabinCrew) {
    CrewDataContext dbData(CREW_APP_TYPE_OR, false);
    dbData.scenario.airline = "SQ";
    dbData.scenario.division = "C";

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    segmentStorage.push_back(makeSegment(21, "SIN", "HKG", "MVP", false, "P", "2025-01-01 01:00:00", "2025-01-01 05:00:00"));
    segmentStorage.push_back(makeSegment(22, "HKG", "SIN", "FLY", true, "F", "2025-01-02 01:00:00", "2025-01-02 05:00:00"));

    std::vector<std::unique_ptr<Duty>> dutyStorage;
    dutyStorage.push_back(makeDuty(segmentStorage[0].get(), "MVP"));
    dutyStorage.push_back(makeDuty(segmentStorage[1].get(), "FLY"));

    std::vector<Duty*> duties = { dutyStorage[0].get(), dutyStorage[1].get() };
    auto pairing = makePairing(duties);

    CalculatePairingLabelForSQ calculator(&dbData);
    calculator.calculate(pairing.get(), 0);

    EXPECT_EQ(getComplementField(*pairing), "PX");
}

TEST(SqPairingLabelTest, PositioningComplementIsPYForFdCargo) {
    CrewDataContext dbData(CREW_APP_TYPE_OR, false);
    dbData.scenario.airline = "SQ";
    dbData.scenario.division = "P";

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    segmentStorage.push_back(makeSegment(31, "SIN", "HKG", "MVP", false, "P", "2025-01-01 01:00:00", "2025-01-01 05:00:00"));
    segmentStorage.push_back(makeSegment(32, "HKG", "SIN", "FLY", true, "F", "2025-01-02 01:00:00", "2025-01-02 05:00:00"));

    std::vector<std::unique_ptr<Duty>> dutyStorage;
    dutyStorage.push_back(makeDuty(segmentStorage[0].get(), "MVP"));
    dutyStorage.push_back(makeDuty(segmentStorage[1].get(), "FLY"));

    std::vector<Duty*> duties = { dutyStorage[0].get(), dutyStorage[1].get() };
    auto pairing = makePairing(duties);

    CalculatePairingLabelForSQ calculator(&dbData);
    calculator.calculate(pairing.get(), 0);

    EXPECT_EQ(getComplementField(*pairing), "PY");
}

TEST(SqPairingLabelTest, PositioningDuplicateUsesSameDepartmentCandidateSequence) {
    CrewDataContext dbData(CREW_APP_TYPE_OR, false);
    dbData.scenario.airline = "SQ";
    dbData.scenario.division = "P";

    std::vector<std::unique_ptr<Segment>> segmentStorage;
    segmentStorage.push_back(makeSegment(41, "SIN", "HKG", "MVP", false, "P", "2025-01-01 01:00:00", "2025-01-01 05:00:00"));
    segmentStorage.push_back(makeSegment(42, "HKG", "SIN", "FLY", true, "P", "2025-01-02 01:00:00", "2025-01-02 05:00:00"));
    segmentStorage.push_back(makeSegment(43, "SIN", "HKG", "MVP", false, "P", "2025-01-01 01:00:00", "2025-01-01 05:00:00"));
    segmentStorage.push_back(makeSegment(44, "HKG", "SIN", "FLY", true, "P", "2025-01-02 01:00:00", "2025-01-02 05:00:00"));

    std::vector<std::unique_ptr<Duty>> dutyStorage;
    dutyStorage.push_back(makeDuty(segmentStorage[0].get(), "MVP"));
    dutyStorage.push_back(makeDuty(segmentStorage[1].get(), "FLY"));
    dutyStorage.push_back(makeDuty(segmentStorage[2].get(), "MVP"));
    dutyStorage.push_back(makeDuty(segmentStorage[3].get(), "FLY"));

    auto firstPairing = makePairing({ dutyStorage[0].get(), dutyStorage[1].get() });
    auto secondPairing = makePairing({ dutyStorage[2].get(), dutyStorage[3].get() });

    CalculatePairingLabelForSQ calculator(&dbData);
    calculator.calculate(firstPairing.get(), 0);
    calculator.calculate(secondPairing.get(), 0);

    EXPECT_EQ(getComplementField(*firstPairing), "PS");
    EXPECT_EQ(getComplementField(*secondPairing), "PZ");
}

} // namespace
