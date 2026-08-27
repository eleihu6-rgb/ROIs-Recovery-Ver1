#include "MinimumDaysOffForCARSRule.h"

#include <set>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "Utility.h"

#include "../RuleSytem.h"
#include "../framework/constant/Constants.h"
#include "../utils/PhaseUtils.h"
#include "../utils/TimeUtils.h"
#include "TimezoneUtils.h"

struct WorkBlock7505 {
    time_t rosterStartTime = 0;
    time_t rosterEndTime = 0;
    std::vector<std::string> assignments{};
    bool isDo = false;
};

namespace {

time_t rpLocalYmdToUtcMidnight(int year, int month1to12, int mday, int offsetMinutes) {
    struct tm tt = {};
    tt.tm_year = year - 1900;
    tt.tm_mon = month1to12 - 1;
    tt.tm_mday = mday;
    tt.tm_hour = 0;
    tt.tm_min = 0;
    tt.tm_sec = 0;
    tt.tm_isdst = -1;
#if defined(_WIN32)
    time_t secs = _mkgmtime(&tt);
#else
    time_t secs = timegm(&tt);
#endif
    return secs - static_cast<time_t>(offsetMinutes) * 60;
}

void rpLocalYmdFromUtc(time_t utc, int offsetMinutes, int& y, int& mon, int& d) {
    time_t dayStartUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(utc, offsetMinutes);
    time_t l = dayStartUtc + static_cast<time_t>(offsetMinutes) * 60;
    tm* tt = gmtime(&l);
    if (tt == nullptr) {
        y = 1970;
        mon = 1;
        d = 1;
        return;
    }
    y = tt->tm_year + 1900;
    mon = tt->tm_mon + 1;
    d = tt->tm_mday;
}

time_t getLocalRosterPeriodStartInUTC(time_t utc, int offsetMinutes) {
    int y, mon, d;
    rpLocalYmdFromUtc(utc, offsetMinutes, y, mon, d);
    if (mon == 1 && d <= 30)
        return rpLocalYmdToUtcMidnight(y, 1, 1, offsetMinutes);
    if (mon == 1 && d == 31)
        return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
    if (mon == 2)
        return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
    if (mon == 3 && d == 1)
        return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
    if (mon == 3 && d >= 2)
        return rpLocalYmdToUtcMidnight(y, 3, 2, offsetMinutes);
    return Utility::GetInstancePtr()->getLocalMonthStartInUTC(utc, offsetMinutes);
}

time_t nextRosterPeriodStartUtc(time_t periodStartUtc, int offsetMinutes) {
    int y, mon, d;
    rpLocalYmdFromUtc(periodStartUtc, offsetMinutes, y, mon, d);
    if (mon == 1 && d == 1)
        return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
    if (mon == 1 && d == 31)
        return rpLocalYmdToUtcMidnight(y, 3, 2, offsetMinutes);
    if (mon == 3 && d == 2)
        return rpLocalYmdToUtcMidnight(y, 4, 1, offsetMinutes);
    if (mon >= 4 && mon <= 11 && d == 1)
        return rpLocalYmdToUtcMidnight(y, mon + 1, 1, offsetMinutes);
    if (mon == 12 && d == 1)
        return rpLocalYmdToUtcMidnight(y + 1, 1, 1, offsetMinutes);
    return periodStartUtc;
}

time_t prevRosterPeriodStartUtc(time_t periodStartUtc, int offsetMinutes) {
    int y, mon, d;
    rpLocalYmdFromUtc(periodStartUtc, offsetMinutes, y, mon, d);
    if (mon == 1 && d == 1)
        return rpLocalYmdToUtcMidnight(y - 1, 12, 1, offsetMinutes);
    if (mon == 1 && d == 31)
        return rpLocalYmdToUtcMidnight(y, 1, 1, offsetMinutes);
    if (mon == 3 && d == 2)
        return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes);
    if (mon == 4 && d == 1)
        return rpLocalYmdToUtcMidnight(y, 3, 2, offsetMinutes);
    if (mon >= 5 && mon <= 12 && d == 1)
        return rpLocalYmdToUtcMidnight(y, mon - 1, 1, offsetMinutes);
    return periodStartUtc;
}

time_t addRosterPeriods(time_t periodStartUtc, int offsetMinutes, int delta) {
    time_t t = periodStartUtc;
    if (delta > 0) {
        for (int i = 0; i < delta; ++i)
            t = nextRosterPeriodStartUtc(t, offsetMinutes);
    } else if (delta < 0) {
        for (int i = 0; i < -delta; ++i)
            t = prevRosterPeriodStartUtc(t, offsetMinutes);
    }
    return t;
}

time_t endOfSingleRosterPeriod(time_t periodStartUtc, int offsetMinutes) {
    int y, mon, d;
    rpLocalYmdFromUtc(periodStartUtc, offsetMinutes, y, mon, d);
    if (mon == 1 && d == 1)
        return rpLocalYmdToUtcMidnight(y, 1, 31, offsetMinutes) - 1;
    if (mon == 1 && d == 31)
        return rpLocalYmdToUtcMidnight(y, 3, 2, offsetMinutes) - 1;
    if (mon == 3 && d == 2)
        return Utility::GetInstancePtr()->getLocalMonthEndInUTC(periodStartUtc, offsetMinutes, 1);
    if (mon >= 4 && d == 1)
        return Utility::GetInstancePtr()->getLocalMonthEndInUTC(periodStartUtc, offsetMinutes, 1);
    return Utility::GetInstancePtr()->getLocalMonthEndInUTC(periodStartUtc, offsetMinutes, 1);
}

time_t getRosterPeriodMultiEndInUTC(time_t periodStartUtc, int offsetMinutes, int numPeriods) {
    time_t cur = periodStartUtc;
    time_t end = endOfSingleRosterPeriod(cur, offsetMinutes);
    for (int i = 1; i < numPeriods; ++i) {
        cur = nextRosterPeriodStartUtc(cur, offsetMinutes);
        end = endOfSingleRosterPeriod(cur, offsetMinutes);
    }
    return end;
}

std::map<time_t, time_t> getRosterPeriodRollingWindows(time_t windowStart, time_t windowEnd, int offsetMinutes, int times) {
    std::map<time_t, time_t> ranges;
    time_t tmTemp = getLocalRosterPeriodStartInUTC(windowStart, offsetMinutes);
    while (tmTemp <= windowEnd) {
        time_t tmEnd = getRosterPeriodMultiEndInUTC(tmTemp, offsetMinutes, times);
        ranges.insert(std::pair<time_t, time_t>(tmTemp, tmEnd));
        tmTemp = nextRosterPeriodStartUtc(tmTemp, offsetMinutes);
    }
    return ranges;
}

std::map<time_t, time_t> getRosterPeriodRollingWindowsByRefDate(time_t windowStart, time_t windowEnd,
                                                               int offsetMinutes, int times, time_t refDate,
                                                               bool /*isRolling*/) {
    std::map<time_t, time_t> ranges;
    time_t tmTemp = getLocalRosterPeriodStartInUTC(refDate, offsetMinutes);
    time_t windowStartDay = getLocalRosterPeriodStartInUTC(windowStart, offsetMinutes);
    while (tmTemp <= windowEnd) {
        time_t tmEnd = getRosterPeriodMultiEndInUTC(tmTemp, offsetMinutes, times);
        if (tmEnd > windowStartDay)
            ranges.insert(std::pair<time_t, time_t>(tmTemp, tmEnd));
        tmTemp = tmEnd + 1;
    }
    return ranges;
}

// int howManyDaysOffInRanges(const std::vector<SharedPtr<ROSTER>>& rosters, const SharedPtr<CrewDataContext>& dbData,
//                           long long rulePhase, const std::vector<std::string>& doAssignments,
//                           const std::vector<std::string>& doAssignmentGroups, const time_t rangeStart,
//                           const time_t rangeEnd, const int offsetMinutes, const bool bCountBlankDays,
//                           const bool bCountPostRest, const std::map<std::string, DBAirport*>& airportMap,
//                           const int /*requiredDays*/, time_t& lastRosterEndTime,
//                           const std::vector<std::string>& lastRosterAssignments, const std::string& layoverTimemode,
//                           const int iConsecutive, const bool bCountLayover, const std::string& base,
//                           const std::vector<std::string>& exceptionAssignment, const bool isSplit = true,
//                           const std::string& weekEnd = "N") {
//     (void)doAssignmentGroups;
//     (void)base;
//     (void)isSplit;
//     (void)weekEnd;

//     if (iConsecutive < 1)
//         return 0;

//     int iBlankDays = 0;
//     int rosterSize = (int)rosters.size();
//     std::map<time_t, WorkBlock7505> dailyAssignmentMap;

//     time_t startTime = rangeStart + offsetMinutes * 60;
//     while (startTime < rangeEnd) {
//         dailyAssignmentMap.emplace(startTime, WorkBlock7505());
//         startTime += 3600 * 24;
//     }

//     for (size_t i = 0; i < (size_t)rosterSize; i++) {
//         if (rosters[i]->actStrUtc > rangeEnd ||
//             (bCountPostRest && rosters[i]->actRestStrUtc < rangeStart) ||
//             (!bCountPostRest && rosters[i]->actEndUtc < rangeStart))
//             continue;

//         if (rosters[i] != nullptr && !PhaseUtils::IsChecked(rosters[i].get(), rulePhase, dbData)) {
//             continue;
//         }

//         bool matchLastRosterAssignment = false;
//         if (lastRosterAssignments.empty() || lastRosterAssignments[0] == "*" ||
//             std::find(lastRosterAssignments.begin(), lastRosterAssignments.end(), rosters[i]->qualifier) !=
//                 lastRosterAssignments.end())
//             matchLastRosterAssignment = true;

//         int localOffsetMinutes = offsetMinutes;
//         auto iterAirport = airportMap.find(rosters[i]->location);
//         if (layoverTimemode.size() > 0 && layoverTimemode != "" && layoverTimemode == "LOCAL TIME" &&
//             iterAirport != airportMap.end()) {
//             localOffsetMinutes = TimezoneUtils::GetTimezoneOffset(rosters[i]->actStrUtc, iterAirport->second->zoneId);
//         }
//         const auto& rosterStart = rosters[i]->actStrUtc;
//         auto rosterEnd = (bCountPostRest ? rosters[i]->actRestStrUtc : rosters[i]->actEndUtc);

//         if ((rosterEnd + localOffsetMinutes * 60) % 86400 == 0) {
//             --rosterEnd;
//         }

//         time_t dayStart =
//             Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterStart, localOffsetMinutes) + localOffsetMinutes * 60;
//         time_t dayEnd =
//             Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterEnd, localOffsetMinutes) + localOffsetMinutes * 60;

//         int day = (int)(dayEnd - dayStart) / (3600 * 24) + 1;
//         if (day <= 0) {
//             continue;
//         }
//         for (size_t d = 0; d < (size_t)day; d++) {
//             time_t key = dayStart + d * (3600 * 24);
//             if (dailyAssignmentMap.find(key) != dailyAssignmentMap.end()) {
//                 dailyAssignmentMap.at(key).assignments.push_back(rosters[i]->qualifier);
//                 dailyAssignmentMap.at(key).startTimeLoc = rosters[i]->getStartTimeLocAct();
//                 if (matchLastRosterAssignment) {
//                     dailyAssignmentMap.at(key).endTimeLoc = rosters[i]->getEndTimeLocAct();
//                     if (bCountPostRest)
//                         dailyAssignmentMap.at(key).endTimeLoc = rosters[i]->getRestStartLocAct();
//                 }
//             }
//         }
//         if (rosters[i]->pairing && bCountLayover) {
//             const auto& duties = rosters[i]->pairing->getDutyVec();
//             for (size_t j = 0; j + 1 < duties.size(); j++) {
//                 const auto& currentDuty = duties[j];
//                 const auto& nextDuty = duties[j + 1];

//                 const auto& dutyEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(
//                                          currentDuty->getEndTimeUtcAct(), localOffsetMinutes) +
//                                      localOffsetMinutes * 60;
//                 const auto& nextDutyStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(
//                                                 nextDuty->getStartTimeUtcAct(), localOffsetMinutes) +
//                                             localOffsetMinutes * 60;

//                 if (dailyAssignmentMap.find(dutyEnd) != dailyAssignmentMap.end()) {
//                     dailyAssignmentMap.at(dutyEnd).endTimeLoc = currentDuty->getEndTimeLocAct();
//                 }

//                 if ((nextDutyStart - dutyEnd) / (3600 * 24) > 1) {
//                     const auto& layoverStart = dutyEnd + 3600 * 24;
//                     int layoverDay = (int)(nextDutyStart - layoverStart) / (3600 * 24);

//                     for (size_t d = 0; d < (size_t)layoverDay; d++) {
//                         time_t key = layoverStart + d * 3600 * 24;
//                         if (dailyAssignmentMap.find(key) != dailyAssignmentMap.end()) {
//                             dailyAssignmentMap.at(key).assignments.clear();
//                             dailyAssignmentMap.at(key).assignments.push_back("LAYOVER");
//                             dailyAssignmentMap.at(key).isDo = true;
//                         }
//                     }
//                 }
//             }
//         }
//     }

//     for (auto& map : dailyAssignmentMap) {
//         if (map.second.assignments.empty()) {
//             if (bCountBlankDays) {
//                 iBlankDays++;
//                 map.second.isDo = true;
//             }
//             continue;
//         }

//         const auto& assignmentList = map.second.assignments;

//         if (assignmentList.size() == 1) {
//             if (std::find(doAssignments.begin(), doAssignments.end(), assignmentList[0]) != doAssignments.end() ||
//                 assignmentList[0] == "LAYOVER")
//                 iBlankDays++;
//             continue;
//         }

//         bool hasDO = false;
//         bool hasExceptionAssignment = false;
//         bool onlyDo = true;
//         for (const auto& assignment : assignmentList) {
//             if (std::find(doAssignments.begin(), doAssignments.end(), assignment) != doAssignments.end())
//                 hasDO = true;
//             else {
//                 onlyDo = false;
//             }
//             if (!exceptionAssignment.empty() &&
//                 std::find(exceptionAssignment.begin(), exceptionAssignment.end(), assignment) !=
//                     exceptionAssignment.end())
//                 hasExceptionAssignment = true;
//         }

//         if (hasDO && (hasExceptionAssignment || onlyDo)) {
//             iBlankDays++;
//             map.second.isDo = true;
//         }
//     }

//     if (!dailyAssignmentMap.empty()) {
//         auto lastMap = --dailyAssignmentMap.end();
//         if (lastMap->second.isDo) {
//             for (auto iter = lastMap; iter != dailyAssignmentMap.begin(); iter--) {
//                 if (!iter->second.isDo) {
//                     lastRosterEndTime = iter->second.endTimeLoc;
//                     break;
//                 }
//             }
//         }
//     }

//     return iBlankDays;
// }

int howManyDaysOffInRanges(const std::vector<SharedPtr<ROSTER>>& rosters, const SharedPtr<CrewDataContext>& dbData,
                          long long rulePhase, const std::vector<std::string>& doAssignments,
                          const std::vector<std::string>& doAssignmentGroups, const time_t rangeStart,
                          const time_t rangeEnd, const int offsetMinutes, const bool bCountBlankDays,
                          const bool bCountPostRest, const std::map<std::string, DBAirport*>& airportMap,
                          const int /*requiredDays*/, time_t& lastRosterEndTime,
                          const std::vector<std::string>& lastRosterAssignments, const std::string& layoverTimemode,
                          const int iConsecutive, const bool bCountLayover, const std::string& base,
                          const std::vector<std::string>& exceptionAssignment, const bool isSplit = true,
                          const std::string& weekEnd = "N") {
    (void)doAssignmentGroups;
    (void)base;
    (void)isSplit;
    (void)weekEnd;

    if (iConsecutive < 1)
        return 0;

    int iBlankDays = 0;
    int rosterSize = (int)rosters.size();
    std::map<time_t, WorkBlock7505> dailyAssignmentMap;

    time_t startTime = rangeStart;
    while (startTime < rangeEnd) {
        dailyAssignmentMap.emplace(startTime, WorkBlock7505());
        startTime += 3600 * 24;
    }

    for (size_t i = 0; i < (size_t)rosterSize; i++) {
        if (rosters[i]->actStrUtc > rangeEnd ||
            (bCountPostRest && rosters[i]->actRestStrUtc < rangeStart) ||
            (!bCountPostRest && rosters[i]->actEndUtc < rangeStart))
            continue;

        if (rosters[i] != nullptr && !PhaseUtils::IsChecked(rosters[i].get(), rulePhase, dbData)) {
            continue;
        }

        bool matchLastRosterAssignment = false;
        if (lastRosterAssignments.empty() || lastRosterAssignments[0] == "*"
            ||std::find(lastRosterAssignments.begin(), lastRosterAssignments.end(), rosters[i]->qualifier) != lastRosterAssignments.end())
            matchLastRosterAssignment = true;

        int localOffsetMinutes = offsetMinutes;
        auto iterAirport = airportMap.find(rosters[i]->location);
        if (layoverTimemode.size() > 0 && layoverTimemode != "" && layoverTimemode == "LOCAL TIME" && iterAirport != airportMap.end()) {
            localOffsetMinutes = TimezoneUtils::GetTimezoneOffset(rosters[i]->actStrUtc, iterAirport->second->zoneId);
        }
        const auto& rosterStart = rosters[i]->actStrUtc;
        auto rosterEnd = (bCountPostRest ? rosters[i]->actRestStrUtc : rosters[i]->actEndUtc);

        if (rosterEnd % 86400 == 0) {
            --rosterEnd;
        }

        time_t dayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterStart, localOffsetMinutes);
        time_t dayEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterEnd, localOffsetMinutes);

        int day = (int)(dayEnd - dayStart) / (3600 * 24) + 1;
        if (day <= 0) {
            continue;
        }
        for (size_t d = 0; d < (size_t)day; d++) {
            time_t key = dayStart + d * (3600 * 24);
            if (dailyAssignmentMap.find(key) != dailyAssignmentMap.end()) {
                dailyAssignmentMap.at(key).assignments.push_back(rosters[i]->qualifier);
                dailyAssignmentMap.at(key).rosterStartTime = rosters[i]->getStartTimeLocAct();
                if (matchLastRosterAssignment) {
                    dailyAssignmentMap.at(key).rosterEndTime = rosters[i]->getEndTimeLocAct();
                    if (bCountPostRest)
                        dailyAssignmentMap.at(key).rosterEndTime = rosters[i]->getRestStartLocAct();
                }
            }
        }
        if (rosters[i]->pairing && bCountLayover) {
            const auto& duties = rosters[i]->pairing->getDutyVec();
            for (size_t j = 0; j + 1 < duties.size(); j++) {
                const auto& currentDuty = duties[j];
                const auto& nextDuty = duties[j + 1];

                const auto& dutyEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(
                                         currentDuty->getEndTimeUtcAct(), localOffsetMinutes) +
                                     localOffsetMinutes * 60;
                const auto& nextDutyStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(
                                                nextDuty->getStartTimeUtcAct(), localOffsetMinutes) +
                                            localOffsetMinutes * 60;

                if (dailyAssignmentMap.find(dutyEnd) != dailyAssignmentMap.end()) {
                    dailyAssignmentMap.at(dutyEnd).rosterEndTime = currentDuty->getEndTimeLocAct();
                }

                if ((nextDutyStart - dutyEnd) / (3600 * 24) > 1) {
                    const auto& layoverStart = dutyEnd + 3600 * 24;
                    int layoverDay = (int)(nextDutyStart - layoverStart) / (3600 * 24);

                    for (size_t d = 0; d < (size_t)layoverDay; d++) {
                        time_t key = layoverStart + d * 3600 * 24;
                        if (dailyAssignmentMap.find(key) != dailyAssignmentMap.end()) {
                            dailyAssignmentMap.at(key).assignments.clear();
                            dailyAssignmentMap.at(key).assignments.push_back("LAYOVER");
                            dailyAssignmentMap.at(key).isDo = true;
                        }
                    }
                }
            }
        }
    }

    for (auto& map : dailyAssignmentMap) {
        if (map.second.assignments.empty()) {
            if (bCountBlankDays) {
                iBlankDays++;
                map.second.isDo = true;
            }
            continue;
        }

        const auto& assignmentList = map.second.assignments;

        if (assignmentList.size() == 1) {
            if (std::find(doAssignments.begin(), doAssignments.end(), assignmentList[0]) != doAssignments.end() ||
                assignmentList[0] == "LAYOVER")
                iBlankDays++;
            continue;
        }

        bool hasDO = false;
        bool hasExceptionAssignment = false;
        bool onlyDo = true;
        for (const auto& assignment : assignmentList) {
            if (std::find(doAssignments.begin(), doAssignments.end(), assignment) != doAssignments.end())
                hasDO = true;
            else {
                onlyDo = false;
            }
            if (!exceptionAssignment.empty() &&
                std::find(exceptionAssignment.begin(), exceptionAssignment.end(), assignment) !=
                    exceptionAssignment.end())
                hasExceptionAssignment = true;
        }

        if (hasDO && (hasExceptionAssignment || onlyDo)) {
            iBlankDays++;
            map.second.isDo = true;
        }
    }

    if (!dailyAssignmentMap.empty()) {
        auto lastMap = --dailyAssignmentMap.end();
        if (lastMap->second.isDo) {
            for (auto iter = lastMap; iter != dailyAssignmentMap.begin(); iter--) {
                if (!iter->second.isDo) {
                    lastRosterEndTime = iter->second.rosterEndTime;
                    break;
                }
            }
        }
    }

    return iBlankDays;
}

// LEAVE ASSIGNMENTS + LEAVE DAYS RANGE: count distinct crew-base local calendar days in [rangeStart, rangeEnd)
// that have a roster whose qualifier matches LEAVE ASSIGNMENTS. LEAVE DAYS RANGE (lower-upper) then filters
// whether this window is checked, using the same inclusive bounds logic as RP DAYS RANGE.
int countLeaveAssignmentDaysInWindow(const std::vector<SharedPtr<ROSTER>>& rosters,
                                     const SharedPtr<CrewDataContext>& dbData, long long rulePhase,
                                     const time_t rangeStart, const time_t rangeEnd,
                                     const int crewBaseOffsetMinutes, const bool bCountPostRest,
                                     const std::string& leaveAssignmentsRaw) {
    std::vector<std::string> leaveAssignments;
    if (trim(leaveAssignmentsRaw) != RuleParamConstant::ALL) {
        split(leaveAssignmentsRaw.c_str(), '|', leaveAssignments);
    }
    if (leaveAssignments.empty())
        return 0;

    std::set<time_t> windowDayKeys;
    for (time_t w = rangeStart + static_cast<time_t>(crewBaseOffsetMinutes) * 60; w < rangeEnd;
         w += static_cast<time_t>(3600 * 24)) {
        windowDayKeys.insert(w);
    }
    if (windowDayKeys.empty())
        return 0;

    std::set<time_t> leaveLocalDayKeys;
    const int rosterSize = (int)rosters.size();
    for (int i = 0; i < rosterSize; i++) {
        const auto& r = rosters[i];
        if (r == nullptr)
            continue;
        if (r->actStrUtc > rangeEnd || (bCountPostRest && r->actRestStrUtc < rangeStart) ||
            (!bCountPostRest && r->actEndUtc < rangeStart))
            continue;

        if (!PhaseUtils::IsChecked(r.get(), rulePhase, dbData))
            continue;

        const std::string& qual = r->qualifier;
        if (std::find(leaveAssignments.begin(), leaveAssignments.end(), qual) == leaveAssignments.end())
            continue;

        const time_t rosterStartUtc = r->actStrUtc;
        time_t rosterEndUtc = (bCountPostRest ? r->actRestStrUtc : r->actEndUtc);

        if ((rosterEndUtc + static_cast<time_t>(crewBaseOffsetMinutes) * 60) % 86400 == 0)
            --rosterEndUtc;

        time_t dayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterStartUtc, crewBaseOffsetMinutes) +
                          static_cast<time_t>(crewBaseOffsetMinutes) * 60;
        time_t dayEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterEndUtc, crewBaseOffsetMinutes) +
                        static_cast<time_t>(crewBaseOffsetMinutes) * 60;
        int nDays = static_cast<int>(dayEnd - dayStart) / (3600 * 24) + 1;
        if (nDays <= 0)
            continue;

        for (int d = 0; d < nDays; d++) {
            const time_t key = dayStart + static_cast<time_t>(d) * (3600 * 24);
            if (windowDayKeys.find(key) != windowDayKeys.end())
                leaveLocalDayKeys.insert(key);
        }
    }

    return static_cast<int>(leaveLocalDayKeys.size());
}

}  // namespace

void MinimumDaysOffForCARSRule::ParseParam(const InputType& input) {
    _ruleParams.clear();
    for (const auto& dbRule : input.dbRules) {
        _ruleParams.emplace_back(MinimumDaysOffForCARSRuleParam(this));
        _ruleParams.back().ParseParam(dbRule);
    }
}

bool MinimumDaysOffForCARSRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
    if (_ruleParams.empty() || rosters.empty()) {
        return true;
    }

    RULE_LEGALITY* ruleLegality = _ruleViolation.GetRuleLegality();
    if (ruleLegality == nullptr || ruleLegality->crewIndex < 0) {
        return true;
    }

    const auto& crew = _dbData->crewList[ruleLegality->crewIndex];
    const auto& rosterList = crew->rosterList;
    if (rosterList.size() <= 0)
        return true;

    time_t rollingWindowStart;
    time_t rollingWindowEnd;
    if (this->_application != ROSTER_OPTIMIZER) {
        rollingWindowStart = rosterList[0]->actStrUtc;
        rollingWindowEnd = rosterList[rosterList.size() - 1]->actEndUtc;
    } else {
        rollingWindowStart = this->_dbData->scenario.startDtUTC;
        rollingWindowEnd = this->_dbData->scenario.endDtUTC;
    }

    bool allPass = true;
    for (const auto& anchor : _ruleParams) {
        if (!anchor.MatchCrewQualification(crew, rollingWindowStart, rollingWindowEnd)) {
            continue;
        }
        _ruleViolation.SetRuleParam(anchor);
        if (!CheckRuleForCrew(anchor, crew, rosterList, rollingWindowStart, rollingWindowEnd)) {
            allPass = false;
            if (!IsCheckAllRule()) {
                return false;
            }
        }
    }
    return allPass;
}

bool MinimumDaysOffForCARSRule::CheckRuleForCrew(const MinimumDaysOffForCARSRuleParam& anchor,
                                                 const SharedPtr<CREW>& crew,
                                                 const std::vector<SharedPtr<ROSTER>>& rosters,
                                                 time_t rollingWindowStart,
                                                 time_t rollingWindowEnd) const {
    const std::string& rBase = anchor._rBase;
    const std::string& rRank = anchor._rRank;
    const std::string& rFleet = anchor._rFleet;
    const std::string& rTeam = anchor._rTeam;
    const std::string& rGroup = anchor._rGroup;
    const std::string& rPeriod = anchor._rPeriod;
    const std::string& rUnit = anchor._rUnit;
    const std::string& rMonthNumber = anchor._rMonthNumber;
    const std::string& rLayoverTimemode = anchor._rLayoverTimemode;
    const std::string& rRefDate = anchor._rRefDate;
    const std::string& rRPDaysRange = anchor._rRPDaysRange;
    const bool rPostRest = anchor._rPostRest;
    const bool rCountBlankDay = anchor._rCountBlankDay;
    const bool rCountLayover = anchor._rCountLayover;
    const bool rIsRolling = anchor._rIsRolling;
    const std::string& rCheckType = anchor._rCheckType;
    const std::string& lastRosterLatestEndTime = anchor._rLastRosterLatestEndTime;
    const std::vector<std::string>& lastRosterAssignments = anchor._rLastRosterAssignments;

    std::vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
    std::string airlinecode = this->_dbData->scenario.airline;
    std::vector<std::string> groupList;
    split(rGroup, '|', groupList);
    std::vector<std::string> RPDaysRangeVec_str;
    split(rRPDaysRange, '-', RPDaysRangeVec_str);
    std::vector<std::string> leaveDaysRangeVec_str;
    split(anchor._leaveDaysRange, '-', leaveDaysRangeVec_str);
    std::vector<std::string> daysOffs;
    std::vector<std::string> restAssignments;
    std::vector<int> monthNumbers;
    split(rMonthNumber.c_str(), '|', monthNumbers);
    for (auto assignment = assignments.begin(); assignment != assignments.end(); ++assignment) {
        if (std::find(groupList.begin(), groupList.end(), (*assignment)->assignmentGroup) != groupList.end() &&
            (this->_dbData->version == 3 || (*assignment)->airline == airlinecode)) {
            daysOffs.push_back((*assignment)->assignemnt);
        }
        if ((*assignment)->assignmentGroup == "REST" &&
            (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
            restAssignments.push_back((*assignment)->assignemnt);
    }
    (void)restAssignments;

    if (!Utility::GetInstancePtr()->isCrewQualified(crew, rBase, rRank, rFleet, rTeam, "*", rollingWindowStart,
                                                     rollingWindowEnd))
        return true;

    int iMonths = std::stoi(rPeriod);
    if (rosters.size() == 0)
        return true;
    time_t tempStart = rosters[0]->actEndUtc;

    std::string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, tempStart);
    int offsetMinutes = 0;
    if (base.empty())
        base = _dbData->scenario.bases[0];
    if (!base.empty())
        offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
    std::map<time_t, time_t> mp;
    if (rUnit == "CM") {
        if (!rIsRolling && !rRefDate.empty() && rRefDate != "*") {
            mp = Utility::GetInstancePtr()->getMonthRollingWindowsByRefDate(
                rollingWindowStart, rollingWindowEnd + 24 * 3600, offsetMinutes, iMonths,
                utcStrToUtc(const_cast<char*>(rRefDate.c_str())), rIsRolling);
        } else {
            const auto& start = Utility::GetInstancePtr()->addMonths(rollingWindowStart, offsetMinutes, iMonths * -1 + 1);
            mp = Utility::GetInstancePtr()->getMonthRollingWindows(start, rollingWindowEnd + 24 * 3600, offsetMinutes,
                                                                  iMonths);
        }
    } else if (rUnit == "CW") {
        std::string weekdayStartFrom = this->_dbData->getWeekdayStartFrom();
        if (!rIsRolling && !rRefDate.empty() && rRefDate != "*") {
            mp = Utility::GetInstancePtr()->getWeeksRollingWindowsByRefDate(
                rollingWindowStart - (iMonths * 7 - 1) * 24 * 3600, rollingWindowEnd + (iMonths * 7 - 1) * 24 * 3600,
                weekdayStartFrom, offsetMinutes, iMonths,
                utcStrToUtc(const_cast<char*>(rRefDate.c_str())), rIsRolling);
        } else {
            mp = Utility::GetInstancePtr()->getWeeksRollingWindows(
                rollingWindowStart - (iMonths * 7 - 1) * 24 * 3600,
                rollingWindowEnd + (iMonths * 7 - 1) * 24 * 3600, weekdayStartFrom, offsetMinutes, iMonths);
        }
    } else if (rUnit == "CD") {
        if (!rIsRolling && !rRefDate.empty() && rRefDate != "*") {
            mp = Utility::GetInstancePtr()->getDaysRollingWindowsByRefDate(
                rollingWindowStart - (iMonths - 1) * 24 * 3600, rollingWindowEnd + (iMonths - 1) * 24 * 3600,
                offsetMinutes, iMonths, utcStrToUtc(const_cast<char*>(rRefDate.c_str())), rIsRolling);
        } else {
            mp = Utility::GetInstancePtr()->getDaysRollingWindows(
                rollingWindowStart - (iMonths - 1) * 24 * 3600, rollingWindowEnd + (iMonths - 1) * 24 * 3600,
                offsetMinutes, iMonths);
        }
    } else if (rUnit == "BW") {
        mp = Utility::GetInstancePtr()->getWeeksRollingWindowsByFirstDayOfYear(
            rollingWindowStart - (iMonths * 7 - 1) * 24 * 3600, rollingWindowEnd + (iMonths * 7 - 1) * 24 * 3600,
            offsetMinutes, iMonths);
    } else if (rUnit == "RP") {
        const std::string& systemDefaultAirport = this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
        const auto& zoneIdDefaultApt = this->_dbData->airportZoneIdMap[systemDefaultAirport];
        const auto& zoneIdCrewBase = this->_dbData->airportZoneIdMap[base];

        const auto offsetMinsDefaultApt_start = TimezoneUtils::GetTimezoneOffset(rollingWindowStart, zoneIdDefaultApt);
        const auto offsetMinsCrewBase_start = TimezoneUtils::GetTimezoneOffset(rollingWindowStart, zoneIdCrewBase);
        const auto diffOffset_start = offsetMinsDefaultApt_start - offsetMinsCrewBase_start;

        const auto offsetMinsDefaultApt_end = TimezoneUtils::GetTimezoneOffset(rollingWindowEnd, zoneIdDefaultApt);
        const auto offsetMinsCrewBase_end = TimezoneUtils::GetTimezoneOffset(rollingWindowEnd, zoneIdCrewBase);
        const auto diffOffset_end = offsetMinsDefaultApt_end - offsetMinsCrewBase_end;

        rollingWindowStart = rollingWindowStart + diffOffset_start * 60;
        rollingWindowEnd = rollingWindowEnd + diffOffset_end * 60;

        if (!rIsRolling && !rRefDate.empty() && rRefDate != "*") {
            mp = getRosterPeriodRollingWindowsByRefDate(rollingWindowStart, rollingWindowEnd + 24 * 3600, offsetMinutes,
                                                       iMonths,
                                                       utcStrToUtc(const_cast<char*>(rRefDate.c_str())), rIsRolling);
        } else {
            const auto& rpContainingStart = getLocalRosterPeriodStartInUTC(rollingWindowStart, offsetMinutes);
            const auto& start = addRosterPeriods(rpContainingStart, offsetMinutes, iMonths * -1 + 1);
            mp = getRosterPeriodRollingWindows(start, rollingWindowEnd + 24 * 3600, offsetMinutes, iMonths);
        }
    } else {
        return true;
    }

    const auto& mandayFds = crew->mandayFdList;
    const auto& mandayCcAm = crew->mandayCcAmList;
    const bool isFd = crew->division == "P";

    bool bReturn = true;
    time_t start = 0;
    time_t end = 0;
    int iDaysOff = 0;
    for (std::map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); ++mp_it) {
        start = (*mp_it).first;
        end = (*mp_it).second;
        if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, rTeam, start, end))
            continue;
        if (this->_application == ROSTER_OPTIMIZER && (end < rollingWindowStart || start > rollingWindowEnd))
            continue;

        if (rUnit == "CM" && rMonthNumber != "*" && !rMonthNumber.empty()) {
            const auto& mon = TimeUtils::GetMonth(start + offsetMinutes * 60) + 1;
            if (std::find(monthNumbers.begin(), monthNumbers.end(), mon) == monthNumbers.end())
                continue;
        }

        if (rUnit == "RP" && (int)RPDaysRangeVec_str.size() == 2) {
            const int daysRange_lower = atoi(RPDaysRangeVec_str[0].c_str());
            const int daysRange_upper = atoi(RPDaysRangeVec_str[1].c_str());
            const int numDaysInRP = static_cast<int>(std::ceil(static_cast<double>(end - start) / static_cast<double>(24 * 3600)));
            if (numDaysInRP < daysRange_lower || numDaysInRP > daysRange_upper)
                continue;
        }

        const int leaveDaysInWindow = countLeaveAssignmentDaysInWindow(rosters, this->_dbData, anchor.GetPhase(), start, end, offsetMinutes, rPostRest, anchor._leaveAssignments);
        if ((int)leaveDaysRangeVec_str.size() == 2) {
            const int daysRange_lower = atoi(leaveDaysRangeVec_str[0].c_str());
            const int daysRange_upper = atoi(leaveDaysRangeVec_str[1].c_str());
            if (leaveDaysInWindow < daysRange_lower || leaveDaysInWindow > daysRange_upper)
                continue;
        }

        std::string tempBase = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, start);
        if (tempBase != base && tempBase.length() == 3) {
            auto tempOffsetMinutes = this->_dbData->getAirportOffsetMinutes(tempBase);
            if (tempOffsetMinutes != offsetMinutes) {
                start += (tempOffsetMinutes - offsetMinutes) * 60;
                end += (tempOffsetMinutes - offsetMinutes) * 60;
                offsetMinutes = tempOffsetMinutes;
            }
            base = tempBase;
        }

        _ruleViolation.SetRuleParam(anchor);
        const int iRequiredDO = std::stoi(anchor._rMinDO);
        std::vector<std::string> doAssignmentGroups;
        time_t lastRosterEndTime = 0;
        std::vector<std::string> exceptionAssignment = {"SNY", "DPW", "DPV"};
        iDaysOff = howManyDaysOffInRanges(rosters, this->_dbData, anchor.GetPhase(), daysOffs, doAssignmentGroups,
                                           start, end, offsetMinutes, rCountBlankDay, rPostRest,
                                           this->_dbData->airportCodeMap, iRequiredDO, lastRosterEndTime,
                                           lastRosterAssignments, rLayoverTimemode, 1, rCountLayover, base,
                                           exceptionAssignment);

        if (rCheckType != "ROSTER") {
            time_t rostersStartDay =
                Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[0]->getStartTimeLocAct(), 0);
            time_t rostersEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(
                                       rosters[rosters.size() - 1]->getRestStartLocAct(), 0) +
                                   86400 - 1;
            if (!rPostRest)
                rostersEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(
                                    rosters[rosters.size() - 1]->getEndTimeLocAct(), 0) +
                                86400 - 1;

            if (isFd) {
                for (size_t m = 0; m < mandayFds.size(); m++) {
                    const auto& manday = mandayFds[m];

                    if (!PhaseUtils::IsChecked(manday, anchor.GetPhase(), this->_dbData)) {
                        continue;
                    }

                    if ((manday->dateLoc >= start && manday->dateLoc < rostersStartDay) ||
                        (manday->dateLoc < end && manday->dateLoc > rostersEndDay)) {
                        if (m != 0 &&
                            ((mandayFds[m - 1]->dateLoc >= start && mandayFds[m - 1]->dateLoc < rostersStartDay) ||
                             (mandayFds[m - 1]->dateLoc < end && mandayFds[m - 1]->dateLoc > rostersEndDay))) {
                            if ((manday->dateLoc - mandayFds[m - 1]->dateLoc) / (86400) > 1 && !rCountBlankDay) {
                                iDaysOff -= (manday->dateLoc - mandayFds[m - 1]->dateLoc) / 86400 - 1;
                            }
                        }
                        if (manday->DAY_OFF == DAY_OFF_NOT_EXIST && rCountBlankDay)
                            iDaysOff--;
                    }
                }
            } else {
                for (size_t m = 0; m < mandayCcAm.size(); m++) {
                    const auto& manday = mandayCcAm[m];

                    if (!PhaseUtils::IsChecked(manday, anchor.GetPhase(), this->_dbData)) {
                        continue;
                    }

                    if ((manday->dateLoc >= start && manday->dateLoc < rostersStartDay) ||
                        (manday->dateLoc < end && manday->dateLoc > rostersEndDay)) {
                        if (m != 0 && ((mandayCcAm[m - 1]->dateLoc >= start &&
                                        mandayCcAm[m - 1]->dateLoc < rostersStartDay) ||
                                       (mandayCcAm[m - 1]->dateLoc < end && mandayCcAm[m - 1]->dateLoc > rostersEndDay))) {
                            if ((manday->dateLoc - mandayCcAm[m - 1]->dateLoc) / (86400) > 1 && !rCountBlankDay) {
                                iDaysOff -= (manday->dateLoc - mandayCcAm[m - 1]->dateLoc) / 86400 - 1;
                            }
                        }
                        if (manday->DAY_OFF == DAY_OFF_NOT_EXIST && rCountBlankDay)
                            iDaysOff--;
                    }
                }
            }
        }

        if (iDaysOff < iRequiredDO) {
            if (this->_application == ROSTER_OPTIMIZER) {
                auto& rosterVec = const_cast<std::vector<SharedPtr<ROSTER>>&>(rosters);
                /*if (!Utility::GetInstancePtr()->hasAnyRosterInRange(rosterVec, start, end - 1))
                    continue;*/
                if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosterVec, start, end - 1)))
					continue;
            }
            ThrowDaysOffShortViolation(anchor, start, end, iDaysOff, offsetMinutes);
            bReturn = false;
            if (this->_application == ROSTER_OPTIMIZER) {
                return false;
            }
        }

        if (!lastRosterLatestEndTime.empty() && lastRosterLatestEndTime != "*" && iDaysOff == iRequiredDO) {
            const auto& lastRosterLatestEndTimeMin = hhmmStrToMinutes(lastRosterLatestEndTime);
            if (lastRosterEndTime % (86400) > lastRosterLatestEndTimeMin * 60) {
                if (this->_application == ROSTER_OPTIMIZER) {
                    auto& rosterVec = const_cast<std::vector<SharedPtr<ROSTER>>&>(rosters);
                    /*if (!Utility::GetInstancePtr()->hasAnyRosterInRange(rosterVec, start, end))
                        continue;*/
                    if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosterVec, start, end - 1)))
					continue;
                }
                ThrowLastRosterEndViolation(anchor, start, end, offsetMinutes);
                bReturn = false;
                if (this->_application == ROSTER_OPTIMIZER) {
                    return false;
                }
            }
        }
    }
    return bReturn;
}

void MinimumDaysOffForCARSRule::ThrowDaysOffShortViolation(const MinimumDaysOffForCARSRuleParam& ruleParam,
                                                          time_t rangeStartUtc, time_t endExclusiveUtc, int iDaysOff,
                                                          int offsetMinutes) const {
    std::string msg = "The number of days off(" + Utility::GetInstancePtr()->ToString(iDaysOff) + ") must be at least " +
                       ruleParam._rMinDO + " in " + ruleParam._rPeriod;
    msg += " " + ruleParam._rUnit + ".";

    RULE_LEGALITY* pLeg = _ruleViolation.GetRuleLegality();
    SharedPtr<CREW> ppCrew = this->_dbData->crewList[pLeg->crewIndex];
    pLeg->legalMessage.push_back(msg);
    _ruleViolation.SetLegalityMessage(ppCrew, msg);
    pLeg->isLegal = false;
    pLeg->skipCheckInLaterIterations = true;

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->crewId = ppCrew->idCrew;
    auto sysBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(
        this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"]);
    time_t adjStart = rangeStartUtc + ((offsetMinutes - sysBaseOffsetMinutes) * 60);
    time_t adjEnd = endExclusiveUtc + ((offsetMinutes - sysBaseOffsetMinutes) * 60);
    rv->startDTUtc = adjStart;
    rv->endDTUtc = adjEnd - 1;
    rv->violation_msg = msg;
    rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    rv->operation_result.insert(std::pair<std::string, std::string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
    rv->operation_result.insert(std::pair<std::string, std::string>("rMinDO", ruleParam._rMinDO));
    rv->operation_result.insert(std::pair<std::string, std::string>("rPeriod", ruleParam._rPeriod));
    rv->operation_result.insert(std::pair<std::string, std::string>("rUnit", ruleParam._rUnit));
    _ruleViolation.AddRuleViolations(rv);
}

void MinimumDaysOffForCARSRule::ThrowLastRosterEndViolation(const MinimumDaysOffForCARSRuleParam& ruleParam,
                                                           time_t rangeStartUtc, time_t endExclusiveUtc,
                                                           int offsetMinutes) const {
    std::string msg = "The next roster is DO, the end time of the current roster must be earlier than " +
                      ruleParam._rLastRosterLatestEndTime;

    RULE_LEGALITY* pLeg = _ruleViolation.GetRuleLegality();
    SharedPtr<CREW> ppCrew = this->_dbData->crewList[pLeg->crewIndex];
    pLeg->legalMessage.push_back(msg);
    _ruleViolation.SetLegalityMessage(ppCrew, msg);
    pLeg->isLegal = false;
    pLeg->skipCheckInLaterIterations = true;

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->crewId = ppCrew->idCrew;
    auto sysBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(
        this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"]);
    time_t adjStart = rangeStartUtc + ((offsetMinutes - sysBaseOffsetMinutes) * 60);
    time_t adjEnd = endExclusiveUtc + ((offsetMinutes - sysBaseOffsetMinutes) * 60);
    rv->startDTUtc = adjStart;
    rv->endDTUtc = adjEnd - 1;
    rv->violation_msg = msg;
    rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    _ruleViolation.AddRuleViolations(rv);
}
