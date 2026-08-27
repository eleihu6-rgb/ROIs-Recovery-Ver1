#pragma once

#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/CrewDB.h"

#include <cstring>
#include <memory>
#include <string>
#include <utility>
#include <vector>

// Helper utilities shared by SIA 6.1/6.2 duty-construction tests that exercise
// rule2004 (duty-level limits) and related LegalityChecker APIs.
namespace SIA6Duty {

inline time_t minutesToSeconds(int minutes) {
    return static_cast<time_t>(minutes) * 60;
}

struct DutySegmentConfig {
    std::string assignment{"FLY"};
    std::string dep{"SIN"};
    std::string arr{"KUL"};
    std::string tail{"TAIL"};
    std::string nextLegNo;
    int startUtcMinutes{0};
    int endUtcMinutes{60};
    int ftMinutes{60};
    bool isDeadhead{false};
    bool isBus{false};
};

inline DutySegmentConfig makeSegmentConfig(std::string assignment,
                                           std::string dep,
                                           std::string arr,
                                           int startUtcMinutes,
                                           int endUtcMinutes,
                                           std::string tail = "TAIL",
                                           bool isDeadhead = false,
                                           bool isBus = false) {
    DutySegmentConfig cfg;
    cfg.assignment = std::move(assignment);
    cfg.dep = std::move(dep);
    cfg.arr = std::move(arr);
    cfg.startUtcMinutes = startUtcMinutes;
    cfg.endUtcMinutes = endUtcMinutes;
    cfg.tail = std::move(tail);
    cfg.isDeadhead = isDeadhead;
    cfg.isBus = isBus;
    cfg.ftMinutes = endUtcMinutes - startUtcMinutes;
    return cfg;
}

struct DutyBuildResult {
    std::unique_ptr<Duty> duty;
    std::vector<std::unique_ptr<Segment>> segments;
};

inline void fillAirportRecord(DBAirport& airport,
                              const std::string& code,
                              const std::string& zoneId,
                              const std::string& dir) {
    std::memset(&airport, 0, sizeof(DBAirport));
    std::strncpy(airport.airport, code.c_str(), sizeof(airport.airport) - 1);
    std::strncpy(airport.zoneId, zoneId.c_str(), sizeof(airport.zoneId) - 1);
    std::strncpy(airport.dir, dir.c_str(), sizeof(airport.dir) - 1);
    airport.utcOffsetMinutes = 0;
}

// Build a single Duty object and owned Segment storage from high-level configs.
inline DutyBuildResult makeDuty(const std::vector<DutySegmentConfig>& segmentConfigs) {
    DutyBuildResult result;
    result.duty = std::make_unique<Duty>();

    std::vector<Segment*> rawSegments;
    rawSegments.reserve(segmentConfigs.size());

    for (std::size_t i = 0; i < segmentConfigs.size(); ++i) {
        const auto& cfg = segmentConfigs[i];
        auto segment = std::make_unique<Segment>();
        segment->setAssignment(cfg.assignment);
        segment->setDepStation(cfg.dep);
        segment->setArrStation(cfg.arr);
        segment->setTailNum(cfg.tail.empty() ? ("TAIL" + std::to_string(i)) : cfg.tail);
        segment->setFleetCD("000");
        if (!cfg.nextLegNo.empty()) {
            segment->setNextLegNo(cfg.nextLegNo);
        } else {
            segment->setNextLegNo("LEG" + std::to_string(i + 1));
        }
        const auto startSeconds = minutesToSeconds(cfg.startUtcMinutes);
        const auto endSeconds = minutesToSeconds(cfg.endUtcMinutes);
        segment->setStartTimeUtcAct(startSeconds);
        segment->setEndTimeUtcAct(endSeconds);
        segment->setStartTimeLocAct(startSeconds);
        segment->setEndTimeLocAct(endSeconds);
        segment->setStartTimeUtcSch(startSeconds);
        segment->setEndTimeUtcSch(endSeconds);
        segment->setStartTimeLocSch(startSeconds);
        segment->setEndTimeLocSch(endSeconds);
        segment->setFTTime(cfg.ftMinutes * 60);
        segment->setIsOperating(cfg.assignment == "FLY");
        segment->setIsDeadhead(cfg.isDeadhead);
        segment->setIsBusFerry(cfg.isBus);
        segment->setIsTrainFerry(false);
        segment->setPairingId(1);
        segment->setDutyId(1);
        segment->setSegSeq(static_cast<int>(i + 1));
        segment->setIsCountForCoverage(true);
        segment->setFlightNumber(cfg.assignment + std::to_string(i + 1));
        rawSegments.push_back(segment.get());
        result.segments.push_back(std::move(segment));
    }

    result.duty->setSegments(rawSegments);
    result.duty->setType(Duty::DUTY_FLY);
    result.duty->setPairingId(1);
    result.duty->setDutySeq(1);
    result.duty->setBase(segmentConfigs.front().dep);
    result.duty->setDepartureStation(segmentConfigs.front().dep);
    result.duty->setArrivalStation(segmentConfigs.back().arr);
    const auto dutyStart = minutesToSeconds(segmentConfigs.front().startUtcMinutes);
    const auto dutyEnd = minutesToSeconds(segmentConfigs.back().endUtcMinutes);
    result.duty->setStartTimeUtcAct(dutyStart);
    result.duty->setEndTimeUtcAct(dutyEnd);
    result.duty->setStartTimeLocAct(dutyStart);
    result.duty->setEndTimeLocAct(dutyEnd);
    result.duty->setStartTimeUtcSch(dutyStart);
    result.duty->setEndTimeUtcSch(dutyEnd);
    result.duty->setStartTimeLocSch(dutyStart);
    result.duty->setEndTimeLocSch(dutyEnd);
    result.duty->setActualPickupMin(0);
    result.duty->setActualDropoffMin(0);
    result.duty->calculateDutyValues(PAIRING_EDITOR);
    return result;
}

// Minimal wrapper mirroring RuleTest/rule2004_gtest.cpp but allowing airport
// direction ("D"/"R"/"I") to be specified per station.
inline SharedPtr<CrewDataContext> buildCrewDataContext(
    const std::vector<std::pair<std::string, std::string>>& airportsAndDirs) {
    auto ctx = std::make_shared<CrewDataContext>();
    for (const auto& entry : airportsAndDirs) {
        DBAirport rec{};
        fillAirportRecord(rec, entry.first, "Etc/UTC", entry.second);
        ctx->airportList.push_back(rec);
        ctx->airportZoneIdMap[entry.first] = "Etc/UTC";
    }
    return ctx;
}

struct Rule2004Config {
    std::string maxFlySegments{"99"};
    std::string maxNonOperateSegments{"99"};
    std::string maxAircraftChanges{"99"};
    std::string maxAircraftChangesWithLT{"99"};
    std::string maxConsecutiveDhd{"99"};
    std::string maxDhd{"99"};
    std::string maxGroundCommute{"99"};
    std::string isDhdAllowedMiddle{"Y"};
    std::string isDutySegmentsSameDay{"N"};
    std::string isInternationalDhdAllowed{"Y"};
    std::string isDhdBetweenBaseAndLo{"N"};
    std::string isDutyBelongDifferentDay{"N"};
    std::string totalSegments{"99"};
    std::string maxFlightBlhAllowDhd{"999:00"};
    std::string overNightFlyThreshold;
    std::string maxDutyDp;
};

inline std::unique_ptr<DBRule> makeRule2004(const Rule2004Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2004>();
    parsed->maxNrFlySegsInDuty = cfg.maxFlySegments;
    parsed->maxNrNonoperateLegsInDuty = cfg.maxNonOperateSegments;
    parsed->maxNrAircraftChangeInDuty = cfg.maxAircraftChanges;
    parsed->maxNrConsecutiveDhd = cfg.maxConsecutiveDhd;
    parsed->maxNrDHDInDuty = cfg.maxDhd;
    parsed->isDhdAllowedInMiddleDuty = cfg.isDhdAllowedMiddle;
    parsed->isDutySegmentsInSameCalendarDay = cfg.isDutySegmentsSameDay;
    parsed->maxNrGRDCommuteInDuty = cfg.maxGroundCommute;
    parsed->isDutyBelongToDifferentDayChecked = cfg.isDutyBelongDifferentDay;
    parsed->maxNrAircraftchangsAndLTInDuty = cfg.maxAircraftChangesWithLT;
    parsed->isDHDmustBetweenBaseAndLOStation = cfg.isDhdBetweenBaseAndLo;
    parsed->totalSegsInDuty = cfg.totalSegments;
    parsed->maxFlightBLHAllowDHD = cfg.maxFlightBlhAllowDhd;
    parsed->isInternationalDHDallowed = cfg.isInternationalDhdAllowed;
    parsed->overNightFlyThredhold = cfg.overNightFlyThreshold;
    parsed->maxDutyDP = cfg.maxDutyDp;
    rule->parsedParam = parsed;
    rule->idRule = 2004;
    rule->idRuleParam = 2004;
    return rule;
}

}  // namespace SIA6Duty

