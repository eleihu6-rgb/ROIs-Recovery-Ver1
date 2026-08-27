#include <gtest/gtest.h>

#include <filesystem>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "GlobalDefinition/RuleEngineDef.h"
#include "RuleEngine/RuleEngine.h"
#include "TimezoneUtils.h"
#include "db/AssignmentHolder.h"
#include "db/Duty.h"
#include "db/Pairing.h"
#include "db/RuleParams.h"
#include "db/Segment.h"
#include "db/Utility.h"
#include "orUtil/UtilFunc.h"

// Rule 8002 (HKA): cumulative block hours must not exceed 112:00 in any rolling 28 CD window.

#ifndef RULETEST_DATA_DIR
#define RULETEST_DATA_DIR ""
#endif

namespace {

void ensureTimezoneDatabaseForTests() {
    static bool loaded = false;
    if (loaded) {
        return;
    }
    std::filesystem::path installDir;
    const std::filesystem::path dataDir = RULETEST_DATA_DIR;
    if (!dataDir.empty()) {
        const auto repoRoot = dataDir.parent_path().parent_path();
        installDir = repoRoot / "orUtil" / "TimeZoneUtil" / "tzdata";
    } else {
        installDir = std::filesystem::path("orUtil") / "TimeZoneUtil" / "tzdata";
    }
    if (!std::filesystem::exists(installDir)) {
        installDir = std::filesystem::absolute(installDir);
    }
    TimezoneUtils::SetTimezoneDatabase(installDir.string());
    loaded = true;
}

constexpr int kHkgOffsetMinutes = 8 * 60;
constexpr int kTargetTotalBlhMinutes = 111 * 60 + 55;       // 6715 minutes, just under 112:00
constexpr int kOverLimitTotalBlhMinutes = 112 * 60 + 5;     // 6725 minutes, 5 min over 112:00

time_t utcFromString(const char* s) {
    return utcStrToUtc(const_cast<char*>(s));
}

long long nextDutyId() {
    static long long id = 800200100;
    return ++id;
}

long long nextSegmentId() {
    static long long id = 800200200;
    return ++id;
}

long long nextPairingId() {
    static long long id = 800200300;
    return ++id;
}

long long nextRosterId() {
    static long long id = 800200400;
    return ++id;
}

int airportOffsetMinutes(const SharedPtr<CrewDataContext>& ctx, const std::string& airport) {
    const auto it = ctx->airportUtcOffsetMap.find(airport);
    return it == ctx->airportUtcOffsetMap.end() ? kHkgOffsetMinutes : it->second;
}

time_t localToUtc(const SharedPtr<CrewDataContext>& ctx, const std::string& airport, const char* localDateTime) {
    const time_t asUtc = utcFromString(localDateTime);
    return asUtc - airportOffsetMinutes(ctx, airport) * 60;
}

SharedPtr<CrewDataContext> buildHxContext(const std::string& crewId) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenarioId = 1;
    ctx->scenario.airline = "HX";
    ctx->scenario.division = "P";
    ctx->scenario.bases.push_back("HKG");
    ctx->scenario.startDtUTC = utcFromString("2026-06-01 00:00:00");
    ctx->scenario.endDtUTC = utcFromString("2026-06-30 23:59:59");
    ctx->systemParamMap["CREW_MANDAY_STORE_TIMEZONE"] = "CREW_BASE";

    struct AirportTz {
        const char* code;
        int offsetMinutes;
        const char* zoneId;
    };
    const AirportTz airports[] = {
        {"HKG", 8 * 60, "Asia/Hong_Kong"},
        {"TPE", 8 * 60, "Asia/Taipei"},
        {"CAN", 8 * 60, "Asia/Shanghai"},
        {"ICN", 9 * 60, "Asia/Seoul"},
        {"BKK", 7 * 60, "Asia/Bangkok"},
        {"NRT", 9 * 60, "Asia/Tokyo"},
        {"MNL", 8 * 60, "Asia/Manila"},
        {"DXB", 4 * 60, "Asia/Dubai"},
        {"SIN", 8 * 60, "Asia/Singapore"},
        {"SYD", 10 * 60, "Australia/Sydney"},
        {"MEL", 10 * 60, "Australia/Melbourne"},
        {"LHR", 1 * 60, "Europe/London"},
    };
    for (const auto& ap : airports) {
        ctx->airportUtcOffsetMap[ap.code] = ap.offsetMinutes;
        ctx->airportZoneIdMap[ap.code] = ap.zoneId;
    }

    auto addCalcManday = [&](const char* name, const char* startField, const char* endField) {
        CalculationManday cm{};
        cm.airline = ctx->scenario.airline;
        cm.type = name;
        cm.str = startField;
        cm.end = endField;
        ctx->addCalculationManday(name, cm);
    };
    addCalcManday("BLH", "SCH", "SCH");
    addCalcManday("BH", "SCH", "SCH");
    addCalcManday("FT", "SCH", "SCH");
    addCalcManday("DP", "SCH", "SCH");
    addCalcManday("ACT DP", "ACT", "ACT");
    addCalcManday("FDP", "SCH", "SCH");
    addCalcManday("ACT FDP", "ACT", "ACT");
    addCalcManday("CUST_DP", "SCH", "SCH");

    auto assignment = std::make_shared<ASSIGNMENT>();
    assignment->AIRLINE = ctx->scenario.airline;
    assignment->ASSIGNMENT_ID = 8002;
    assignment->assignment = "FLY";
    assignment->TYPE = "FLY";
    assignment->BT_PCT = 1.0;
    assignment->FT_PCT = 1.0;
    assignment->DP_PCT = 1.0;
    assignment->CREDIT_PCT = 1.0;
    ctx->assignmentNameMap["FLY"] = assignment;
    AssignmentHolder::getAirline(ctx->scenario.airline);
    AssignmentHolder::getInst().add(*assignment);

    auto dhd = std::make_shared<ASSIGNMENT>();
    dhd->AIRLINE = ctx->scenario.airline;
    dhd->ASSIGNMENT_ID = 8003;
    dhd->assignment = "DHD";
    dhd->TYPE = "DHD";
    dhd->BT_PCT = 1.0;
    ctx->assignmentNameMap["DHD"] = dhd;
    AssignmentHolder::getInst().add(*dhd);

    auto crew = std::make_shared<CREW>();
    crew->idCrew = crewId;
    crew->division = "P";

    auto crewBase = std::make_shared<CREW_BASE>();
    crewBase->idCrew = crewId;
    crewBase->base = "HKG";
    crewBase->effUtc = 0;
    crewBase->expUtc = utcFromString("2035-01-01 00:00:00");
    crewBase->isPrime = true;
    crew->baseList.push_back(crewBase);
    crew->crewKpiAdjustTimeIndex = std::make_shared<CrewKpiAdjustTimeIndex>(crew->crewKpiAdjustList);

    ctx->crewIdMap[crewId] = crew;
    ctx->crewList.push_back(crew);
    return ctx;
}

struct SegmentSpec {
    const char* dep;
    const char* arr;
    const char* depLocal;
    int blockMinutes;
    const char* assignment = "FLY";
    const char* domInt = "I";
    bool operating = true;
};

struct DutySpec {
    std::vector<SegmentSpec> segments;
};

struct PairingSpec {
    std::vector<DutySpec> duties;
};

std::unique_ptr<Segment> makeSegment(const SharedPtr<CrewDataContext>& ctx,
                                     const SegmentSpec& spec,
                                     long long dutyId) {
    auto seg = std::make_unique<Segment>();
    seg->setSegmentId(nextSegmentId());
    const int depOffset = airportOffsetMinutes(ctx, spec.dep);
    const int arrOffset = airportOffsetMinutes(ctx, spec.arr);
    const time_t startUtc = localToUtc(ctx, spec.dep, spec.depLocal);
    const time_t endUtc = startUtc + spec.blockMinutes * 60;
    const time_t startLoc = startUtc + depOffset * 60;
    const time_t endLoc = endUtc + arrOffset * 60;

    seg->setDepSta(spec.dep);
    seg->setArrSta(spec.arr);
    seg->setAssignment(spec.assignment);
    seg->setDomIntType(spec.domInt);
    seg->setIsOperating(spec.operating);
    seg->setDutyId(dutyId);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);
    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeLocSch(startLoc);
    seg->setEndTimeLocSch(endLoc);
    seg->setStartTimeLocAct(startLoc);
    seg->setEndTimeLocAct(endLoc);
    seg->setBlkSeconds(spec.blockMinutes * 60);
    seg->setBlkMinHistory(spec.blockMinutes);
    return seg;
}

std::unique_ptr<Duty> makeDutyFromSpec(const SharedPtr<CrewDataContext>& ctx,
                                       const DutySpec& spec,
                                       std::vector<std::unique_ptr<Segment>>& segStore) {
    auto duty = std::make_unique<Duty>();
    const long long dutyId = nextDutyId();
    duty->setDutyId(dutyId);
    duty->setAssignment("FLY");
    duty->setActualPickupMin(60);
    duty->setActualDropoffMin(30);
    duty->setActualBriefMin(30);
    duty->setActualDebriefMin(30);

    std::vector<Segment*> segRefs;
    int totalBlock = 0;
    for (const auto& segSpec : spec.segments) {
        segStore.push_back(makeSegment(ctx, segSpec, dutyId));
        segRefs.push_back(segStore.back().get());
        totalBlock += segSpec.blockMinutes;
    }
    duty->setSegments(segRefs);
    if (!segRefs.empty()) {
        duty->setDepartureStation(segRefs.front()->getDepSta());
        duty->setArrivalStation(segRefs.back()->getArrSta());
        duty->setStartTimeUtcSch(segRefs.front()->getStartTimeUtcSch() - duty->getActualPickupMin() * 60);
        duty->setEndTimeUtcSch(segRefs.back()->getEndTimeUtcSch() + duty->getActualDebriefMin() * 60);
        duty->setStartTimeUtcAct(duty->getStartTimeUtcSch());
        duty->setEndTimeUtcAct(duty->getEndTimeUtcSch());
        const int depOffset = airportOffsetMinutes(ctx, duty->getDepartureStation());
        const int arrOffset = airportOffsetMinutes(ctx, duty->getArrivalStation());
        duty->setStartTimeLocSch(duty->getStartTimeUtcSch() + depOffset * 60);
        duty->setEndTimeLocSch(duty->getEndTimeUtcSch() + arrOffset * 60);
        duty->setStartTimeLocAct(duty->getStartTimeLocSch());
        duty->setEndTimeLocAct(duty->getEndTimeLocSch());
    }
    duty->setBLKInMins(totalBlock);
    return duty;
}

std::unique_ptr<Pairing> makePairingFromDuties(const std::vector<Duty*>& duties) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase("HKG");
    pairing->setQualifier("FLY");
    pairing->setDbId(nextPairingId());
    pairing->setPrimeActivity("FLY");
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
    }
    return pairing;
}

SharedPtr<ROSTER> makeFlyRoster(const std::string& crewId, Pairing* pairing) {
    auto roster = std::make_shared<ROSTER>();
    roster->idcrew = crewId;
    roster->pairing = pairing;
    roster->pairId = pairing != nullptr ? pairing->getDbId() : 0;
    roster->rosterId = nextRosterId();
    roster->qualifier = "FLY";
    roster->duty = "FLY";
    roster->location = "HKG";
    roster->source = "CR";
    roster->needRuleCheck = true;

    if (pairing != nullptr) {
        roster->actStrUtc = pairing->getStartTimeUtcAct();
        roster->actEndUtc = pairing->getEndTimeUtcAct();
        roster->actRestStrUtc = pairing->getEndTimeUtcAct() + 12 * 3600;
        roster->actStrLoc = roster->actStrUtc + kHkgOffsetMinutes * 60;
        roster->actEndLoc = roster->actEndUtc + kHkgOffsetMinutes * 60;
        roster->actRestStrLoc = roster->actRestStrUtc + kHkgOffsetMinutes * 60;
        roster->restStrUtc = roster->actRestStrUtc + 3600;
    }
    return roster;
}

std::unique_ptr<DBRule> makeRule8002_28DayBhLimit() {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule8002>();
    parsed->strBase = "*";
    parsed->strRank = "*";
    parsed->strFleet = "*";
    parsed->strTeams = "*";
    parsed->strPeriod = "28";
    parsed->strPrdDesc = "CD";
    parsed->strProrated = "Y";
    parsed->strMax = "112:00";
    parsed->strMin = "00:00";
    parsed->strType = "BH";
    parsed->iMax = 112 * 60;
    parsed->iMin = 0;
    rule->parsedParam = parsed;
    rule->idRule = 8002001;
    rule->function = RULES::MAX_CUM_BLOCK;
    rule->phase = 1;
    return rule;
}

// 15 pairings in 28 days: mix of 1/2/3-day trips, regional, red-eye, long-haul, multi-sector, positioning.
// Block minutes sum to 6715 (111:55).
std::vector<PairingSpec> buildRealisticPairingSpecs() {
    auto seg = [](const char* dep, const char* arr, const char* depLocal, int blockMinutes,
                  const char* assignment = "FLY", const char* domInt = "I", bool operating = true) {
        return SegmentSpec{dep, arr, depLocal, blockMinutes, assignment, domInt, operating};
    };
    auto duty = [](std::initializer_list<SegmentSpec> segments) {
        return DutySpec{std::vector<SegmentSpec>(segments)};
    };
    auto pairing = [](std::initializer_list<DutySpec> duties) {
        return PairingSpec{std::vector<DutySpec>(duties)};
    };

    return {
        pairing({duty({seg("HKG", "TPE", "2026-06-01 08:00:00", 100)})}),
        pairing({duty({seg("HKG", "CAN", "2026-06-02 07:30:00", 68, "FLY", "D"),
                       seg("CAN", "HKG", "2026-06-02 11:00:00", 72, "FLY", "D")})}),
        pairing({duty({seg("HKG", "ICN", "2026-06-03 23:15:00", 215)})}),
        pairing({duty({seg("HKG", "BKK", "2026-06-04 17:00:00", 175)}),
                 duty({seg("BKK", "HKG", "2026-06-05 21:00:00", 195)})}),
        pairing({duty({seg("HKG", "SYD", "2026-06-06 21:30:00", 514)}),
                 duty({seg("SYD", "MEL", "2026-06-07 14:00:00", 90)}),
                 duty({seg("MEL", "HKG", "2026-06-08 23:50:00", 590)})}),
        pairing({duty({seg("HKG", "TPE", "2026-06-09 13:00:00", 98)})}),
        pairing({duty({seg("HKG", "NRT", "2026-06-10 09:00:00", 235)}),
                 duty({seg("NRT", "HKG", "2026-06-11 19:00:00", 245)})}),
        pairing({duty({seg("HKG", "MNL", "2026-06-12 22:40:00", 168)})}),
        pairing({duty({seg("HKG", "DXB", "2026-06-13 02:00:00", 470)}),
                 duty({seg("DXB", "SIN", "2026-06-14 08:30:00", 455)}),
                 duty({seg("SIN", "HKG", "2026-06-15 18:00:00", 320, "DHD", "I", false)})}),
        pairing({duty({seg("HKG", "CAN", "2026-06-16 15:00:00", 70, "FLY", "D")})}),
        pairing({duty({seg("HKG", "ICN", "2026-06-17 10:00:00", 210)}),
                 duty({seg("ICN", "HKG", "2026-06-18 20:30:00", 208)})}),
        pairing({duty({seg("HKG", "TPE", "2026-06-19 16:00:00", 102)})}),
        pairing({duty({seg("HKG", "LHR", "2026-06-20 23:45:00", 780)}),
                 duty({seg("LHR", "BKK", "2026-06-21 11:00:00", 600)}),
                 duty({seg("BKK", "HKG", "2026-06-22 09:00:00", 185)})}),
        pairing({duty({seg("CAN", "HKG", "2026-06-24 09:30:00", 72, "FLY", "D")})}),
        pairing({duty({seg("HKG", "SIN", "2026-06-25 08:00:00", 240)}),
                 duty({seg("SIN", "HKG", "2026-06-26 19:00:00", 238)})}),
    };
}

// Same diverse 28-day mix as buildRealisticPairingSpecs(), plus 10 extra block minutes (112:05 total).
std::vector<PairingSpec> buildOverLimitPairingSpecs() {
    auto specs = buildRealisticPairingSpecs();
    specs.back().duties.back().segments.back().blockMinutes += 10;  // P15 SIN-HKG: 238 -> 248
    return specs;
}

int sumDeclaredBlockMinutes(const std::vector<PairingSpec>& pairings) {
    int total = 0;
    for (const auto& pairing : pairings) {
        for (const auto& dutySpec : pairing.duties) {
            for (const auto& segment : dutySpec.segments) {
                total += segment.blockMinutes;
            }
        }
    }
    return total;
}

int sumMandayBlhMinutes(const std::vector<SharedPtr<CREW_MANDAY_FD>>& mandays) {
    int total = 0;
    for (const auto& md : mandays) {
        total += static_cast<int>(md->blh);
    }
    return total;
}

// Mirrors BasicCalculation::calculateManDays BH split at crew base timezone (CREW_BASE).
void accumulateSegmentBlhAtCrewBase(std::map<time_t, SharedPtr<CREW_MANDAY_FD>>& mandayByCrewDateUtc,
                                    const std::string& crewId,
                                    const Segment* seg,
                                    const std::string& baseZoneId) {
    const time_t startUtc = seg->getStartTimeUtcAct();
    const time_t endUtc = startUtc + seg->getBlkMinHistory() * 60;
    const int calcOffsetMinutes = TimezoneUtils::GetTimezoneOffset(startUtc, baseZoneId);
    const time_t localStartDayInUtc =
        Utility::GetInstancePtr()->getLocalDayStartInUTC(startUtc, calcOffsetMinutes);
    const time_t localStartTime = startUtc + calcOffsetMinutes * 60;
    const time_t localEndTime = endUtc + calcOffsetMinutes * 60;
    const int iDaysBetween =
        std::min(static_cast<int>((localEndTime - 1) / 86400 - localStartTime / 86400 + 1), 365);

    for (int i = 0; i < iDaysBetween; ++i) {
        const time_t currentDayStartInUtc = localStartDayInUtc + i * 86400;
        const time_t minEnd = std::min(currentDayStartInUtc + 86400, endUtc);
        const time_t maxStart = std::max(currentDayStartInUtc, startUtc);
        if (minEnd <= maxStart) {
            continue;
        }
        const double blhMinutes = static_cast<double>(minEnd - maxStart) / 60.0;
        auto it = mandayByCrewDateUtc.find(currentDayStartInUtc);
        if (it == mandayByCrewDateUtc.end()) {
            auto manday = std::make_shared<CREW_MANDAY_FD>();
            manday->idCrew = crewId;
            manday->crewDateUtc = currentDayStartInUtc;
            manday->dateLoc = currentDayStartInUtc + calcOffsetMinutes * 60;
            manday->blh = blhMinutes;
            mandayByCrewDateUtc[currentDayStartInUtc] = manday;
        } else {
            it->second->blh += blhMinutes;
        }
    }
}

std::vector<SharedPtr<CREW_MANDAY_FD>> buildMandayFdFromSegments(
    const std::string& crewId,
    const std::vector<std::unique_ptr<Segment>>& segments,
    const std::string& baseZoneId) {
    std::map<time_t, SharedPtr<CREW_MANDAY_FD>> mandayByCrewDateUtc;
    for (const auto& seg : segments) {
        accumulateSegmentBlhAtCrewBase(mandayByCrewDateUtc, crewId, seg.get(), baseZoneId);
    }
    std::vector<SharedPtr<CREW_MANDAY_FD>> mandays;
    mandays.reserve(mandayByCrewDateUtc.size());
    for (auto& entry : mandayByCrewDateUtc) {
        mandays.push_back(entry.second);
    }
    return mandays;
}

bool segmentCrossesLocalMidnight(const SharedPtr<CrewDataContext>& ctx, const Segment* seg) {
    const int depOffset = airportOffsetMinutes(ctx, seg->getDepSta());
    const time_t startUtc = seg->getStartTimeUtcAct();
    const time_t endUtc = startUtc + seg->getBlkMinHistory() * 60;
    const time_t localStartDay =
        Utility::GetInstancePtr()->getLocalDayStartInUTC(startUtc, depOffset);
    const time_t localEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(endUtc, depOffset);
    return localEndDay > localStartDay;
}

void buildRealisticSchedule(const SharedPtr<CrewDataContext>& ctx,
                            const std::string& crewId,
                            const std::vector<PairingSpec>& pairingSpecs,
                            std::vector<std::unique_ptr<Duty>>& dutyStore,
                            std::vector<std::unique_ptr<Segment>>& segStore,
                            std::vector<std::unique_ptr<Pairing>>& pairingStore) {
    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    for (const auto& pairingSpec : pairingSpecs) {
        std::vector<Duty*> pairingDuties;
        for (const auto& dutySpec : pairingSpec.duties) {
            dutyStore.push_back(makeDutyFromSpec(ctx, dutySpec, segStore));
            pairingDuties.push_back(dutyStore.back().get());
        }
        pairingStore.push_back(makePairingFromDuties(pairingDuties));
        Pairing* pairing = pairingStore.back().get();
        ctx->pairingIdMap[pairing->getDbId()] = pairing;
        crew->rosterList.push_back(makeFlyRoster(crewId, pairing));
    }
}

const RULE_VIOLATION* find8002BhViolation(const std::vector<RULE_VIOLATION*>& violations) {
    for (const auto* violation : violations) {
        if (violation == nullptr) {
            continue;
        }
        if (violation->idRule / 1000 == RULES::MAX_CUM_BLOCK) {
            return violation;
        }
        if (violation->violation_msg.find("block hours") != std::string::npos) {
            return violation;
        }
    }
    return nullptr;
}

}  // namespace

class Rule8002Test : public ::testing::Test {
protected:
    void SetUp() override {
        ensureTimezoneDatabaseForTests();
        RuleParams::GetInstancePtr()->setApplication(ROSTER_EDITOR);
    }
};

// HKA 8002: realistic 15 fly pairings (regional / red-eye / long-haul / multi-sector / DHD),
// including cross-midnight sectors; total BH 111:55 must not warn.
TEST_F(Rule8002Test, TwentyEightDayRollingBh111h55mWithin112hLimitPasses) {
    const std::vector<PairingSpec> pairingSpecs = buildRealisticPairingSpecs();
    EXPECT_EQ(kTargetTotalBlhMinutes, sumDeclaredBlockMinutes(pairingSpecs));

    const std::string crewId = "8002HX1";
    auto ctx = buildHxContext(crewId);
    auto rule = makeRule8002_28DayBhLimit();

    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    buildRealisticSchedule(ctx, crewId, pairingSpecs, dutyStore, segStore, pairingStore);

    EXPECT_EQ(pairingSpecs.size(), 15u);

    int crossMidnightSegments = 0;
    for (const auto& seg : segStore) {
        if (segmentCrossesLocalMidnight(ctx, seg.get())) {
            ++crossMidnightSegments;
        }
    }
    EXPECT_GE(crossMidnightSegments, 4)
        << "fixture should include multiple cross-midnight flights (red-eye / long-haul)";

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->mandayFdList = buildMandayFdFromSegments(crewId, segStore, "Asia/Hong_Kong");

    const int mandayBlhTotal = sumMandayBlhMinutes(crew->mandayFdList);
    EXPECT_EQ(kTargetTotalBlhMinutes, mandayBlhTotal);
    EXPECT_LT(mandayBlhTotal, 112 * 60);

    RULE_LEGALITY legality{};
    legality.crewIndex = 0;
    legality.isLegal = true;

    LegalityChecker checker(ROSTER_EDITOR, false);
    checker.setDataContext(ctx, -1, false);
    const bool legal = checker.checkMaxCummulative(&legality, rule.get());
    const auto violations = checker.getRuleViolations();

    EXPECT_TRUE(legal);
    EXPECT_TRUE(legality.isLegal);
    EXPECT_EQ(nullptr, find8002BhViolation(violations))
        << "111:55 total BH in 28 CD should not trigger rule 8002";
}

// HKA 8002: same diverse pairing mix; total BH 112:05 must trigger block-hours violation.
TEST_F(Rule8002Test, TwentyEightDayRollingBh112h05mExceeds112hLimitFails) {
    const std::vector<PairingSpec> pairingSpecs = buildOverLimitPairingSpecs();
    EXPECT_EQ(kOverLimitTotalBlhMinutes, sumDeclaredBlockMinutes(pairingSpecs));
    EXPECT_EQ(kTargetTotalBlhMinutes + 10, sumDeclaredBlockMinutes(pairingSpecs));

    const std::string crewId = "8002HX2";
    auto ctx = buildHxContext(crewId);
    auto rule = makeRule8002_28DayBhLimit();

    std::vector<std::unique_ptr<Duty>> dutyStore;
    std::vector<std::unique_ptr<Segment>> segStore;
    std::vector<std::unique_ptr<Pairing>> pairingStore;
    buildRealisticSchedule(ctx, crewId, pairingSpecs, dutyStore, segStore, pairingStore);

    EXPECT_EQ(pairingSpecs.size(), 15u);

    int crossMidnightSegments = 0;
    for (const auto& seg : segStore) {
        if (segmentCrossesLocalMidnight(ctx, seg.get())) {
            ++crossMidnightSegments;
        }
    }
    EXPECT_GE(crossMidnightSegments, 4)
        << "fixture should include multiple cross-midnight flights (red-eye / long-haul)";

    SharedPtr<CREW> crew = ctx->crewIdMap[crewId];
    crew->mandayFdList = buildMandayFdFromSegments(crewId, segStore, "Asia/Hong_Kong");

    const int mandayBlhTotal = sumMandayBlhMinutes(crew->mandayFdList);
    EXPECT_EQ(kOverLimitTotalBlhMinutes, mandayBlhTotal);
    EXPECT_GT(mandayBlhTotal, 112 * 60);

    RULE_LEGALITY legality{};
    legality.crewIndex = 0;
    legality.isLegal = true;

    LegalityChecker checker(ROSTER_EDITOR, false);
    checker.setDataContext(ctx, -1, false);
    checker.checkMaxCummulative(&legality, rule.get());
    const auto violations = checker.getRuleViolations();

    EXPECT_FALSE(legality.isLegal);
    const RULE_VIOLATION* bhViolation = find8002BhViolation(violations);
    ASSERT_NE(nullptr, bhViolation) << "112:05 total BH in 28 CD should trigger rule 8002";
    EXPECT_NE(bhViolation->violation_msg.find("block hours"), std::string::npos);
}
