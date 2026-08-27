/**
 * @file CheckConsecutiveDaysOffRequirementFor5JRule.cpp
 * @brief Rule 7366 - Check consecutive days off requirement implementation
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-04-16
**/

#include "CheckConsecutiveDaysOffRequirementFor5JRule.h"
#include "CheckConsecutiveDaysOffRequirementFor5JRuleParam.h"

#include "Utility.h"
#include "CrewDB.h"
#include "UtilFunc.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "StringUtil.h"
#include "utils/StringUtils.h"
#include "utils/RosterUtils.h"

#include <ctime>
#include <algorithm>
#include <bitset>

#ifdef _WIN32
#define localtime_r(timep, result) localtime_s(result, timep)
#endif

using namespace std;

// Get period boundaries based on Check Period Mode (CW/CM/RD)
void CheckConsecutiveDaysOffRequirementFor5JRule::GetPeriodBoundaries(const std::vector<const ROSTER*>& rosters,
                                                                        const CheckConsecutiveDaysOffRequirementFor5JRuleParam& ruleParam,
                                                                        std::vector<std::pair<time_t, time_t>>& periods,
                                                                        int crewBaseOffsetMinutes) const {
    if (rosters.empty()) return;

    time_t scenarioStart = this->_dbData->scenario.startDtUTC;
    time_t scenarioEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;

    if (ruleParam._checkPeriodMode == "CM") {
        // Calendar Month - split by calendar months
        time_t currentStart = scenarioStart;
        while (currentStart < scenarioEnd) {
            // Calculate month start and end in local time
            struct tm localTm;
            time_t localTime = currentStart + crewBaseOffsetMinutes;
            localtime_r(&localTime, &localTm);

            // First day of current month
            localTm.tm_hour = 0;
            localTm.tm_min = 0;
            localTm.tm_sec = 0;
            localTm.tm_mday = 1;
            time_t monthStartLocal = mktime(&localTm);
            time_t monthStartUtc = monthStartLocal - crewBaseOffsetMinutes;

            // First day of next month
            localTm.tm_mon += 1;
            time_t monthEndLocal = mktime(&localTm);
            time_t monthEndUtc = monthEndLocal - crewBaseOffsetMinutes;

            // For multiple check periods (multiple months)
            if (ruleParam._checkPeriod > 1) {
                // Calculate end of period (multiple months)
                localTm.tm_mon = localTm.tm_mon - 1 + ruleParam._checkPeriod;
                time_t periodEndLocal = mktime(&localTm);
                time_t periodEndUtc = periodEndLocal - crewBaseOffsetMinutes;
                periods.emplace_back(monthStartUtc, periodEndUtc);
                currentStart = periodEndUtc;
            } else {
                periods.emplace_back(monthStartUtc, monthEndUtc);
                currentStart = monthEndUtc;
            }
        }
    }
    else if (ruleParam._checkPeriodMode == "CW") {
        // Calendar Week - split by calendar weeks
        time_t currentStart = scenarioStart;
        while (currentStart < scenarioEnd) {
            struct tm localTm;
            time_t localTime = currentStart + crewBaseOffsetMinutes;
            localtime_r(&localTime, &localTm);

            // Find Monday of current week
            int dayOfWeek = localTm.tm_wday;
            if (dayOfWeek == 0) dayOfWeek = 7; // Sunday = 7
            localTm.tm_hour = 0;
            localTm.tm_min = 0;
            localTm.tm_sec = 0;
            localTm.tm_mday -= (dayOfWeek - 1);
            time_t weekStartLocal = mktime(&localTm);
            time_t weekStartUtc = weekStartLocal - crewBaseOffsetMinutes;

            // Calculate period end (checkPeriod weeks)
            time_t periodEndUtc = weekStartUtc + ruleParam._checkPeriod * 7 * 24 * 3600;

            periods.emplace_back(weekStartUtc, periodEndUtc);
            currentStart = periodEndUtc;
        }
    }
    else if (ruleParam._checkPeriodMode == "RD") {
        // Rolling Days - fixed rolling period
        time_t currentStart = scenarioStart;
        time_t periodLength = ruleParam._checkPeriod * 24 * 3600;

        while (currentStart < scenarioEnd) {
            time_t periodEnd = currentStart + periodLength;
            if (periodEnd > scenarioEnd)
                periodEnd = scenarioEnd;
            periods.emplace_back(currentStart, periodEnd);
            currentStart = periodEnd;
        }
    }
}

// Get all days off within a period
std::bitset<31> CheckConsecutiveDaysOffRequirementFor5JRule::GetDaysOffInPeriod(const std::vector<const ROSTER*>& rosters,
                                                                                  const CheckConsecutiveDaysOffRequirementFor5JRuleParam& ruleParam,
                                                                                  time_t periodStartUtc, time_t periodEndUtc,
                                                                                  int crewBaseOffsetMinutes) const {
    std::bitset<31> daysOff;
    daysOff.reset();

    // Process each roster to find days off
    for (const auto& roster : rosters) {
        if (roster == nullptr) continue;

        time_t rosterStartUtc = roster->getStartTimeUtcAct();
        time_t rosterEndUtc = roster->getEndTimeUtcAct();

        // Check if roster is within the period
        if (rosterEndUtc < periodStartUtc || rosterStartUtc > periodEndUtc)
            continue;

        // Check if this roster qualifies as a day off based on assignment filter
        bool isDaysOff = false;

        // Check assignment group filter
        if (!ruleParam._daysOffAssignmentGroups.empty()) {
            if (ruleParam.MatchDaysOffAssignmentGroup(roster))
                isDaysOff = true;
        }

        // Check assignment filter
        if (!ruleParam._daysOffAssignments.empty()) {
            if (ruleParam.MatchDaysOffAssignment(roster))
                isDaysOff = true;
        }

        // If no filters specified, check if it's a rest day by default assignment
        if (ruleParam._daysOffAssignmentGroups.empty() && ruleParam._daysOffAssignments.empty()) {
            // Default: consider OFF/LEV assignment as days off
            if (roster->qualifier == "OFF" || roster->qualifier == "LEV")
                isDaysOff = true;
        }

        if (!isDaysOff) continue;

        // Calculate which days in the period this roster covers
        time_t effectiveStart = max(rosterStartUtc, periodStartUtc);
        time_t effectiveEnd = min(rosterEndUtc, periodEndUtc);

        // Convert to local days within period
        int startDayOffset = static_cast<int>((effectiveStart + crewBaseOffsetMinutes - periodStartUtc) / (24 * 3600));
        int endDayOffset = static_cast<int>((effectiveEnd + crewBaseOffsetMinutes - periodStartUtc) / (24 * 3600));

        for (int day = startDayOffset; day <= endDayOffset && day < 31; day++) {
            if (day >= 0)
                daysOff.set(day);
        }
    }

    // Include blank days if configured
    if (ruleParam._includeBlankDay) {
        // Find gaps between rosters that represent blank days
        for (size_t i = 1; i < rosters.size(); i++) {
            if (rosters[i - 1] == nullptr || rosters[i] == nullptr) continue;

            time_t prevEndUtc = rosters[i - 1]->getEndTimeUtcAct();
            time_t currStartUtc = rosters[i]->getStartTimeUtcAct();

            // Only count gaps within the period
            if (prevEndUtc >= periodEndUtc || currStartUtc <= periodStartUtc)
                continue;

            time_t gapStart = max(prevEndUtc, periodStartUtc);
            time_t gapEnd = min(currStartUtc, periodEndUtc);

            int blankDays = static_cast<int>((gapEnd - gapStart) / (24 * 3600));
            if (blankDays > 0) {
                int startDayOffset = static_cast<int>((gapStart + crewBaseOffsetMinutes - periodStartUtc) / (24 * 3600));
                for (int day = startDayOffset; day < startDayOffset + blankDays && day < 31; day++) {
                    if (day >= 0)
                        daysOff.set(day);
                }
            }
        }
    }

    // Include Layover Rest if configured (> 2 local calendar days)
    if (ruleParam._includeLayoverRest) {
        for (const auto& roster : rosters) {
            if (roster == nullptr || roster->pairing == nullptr) continue;

            // Check layover rest at non-base stations
            const auto& pairing = roster->pairing;
            for (size_t i = 0; i < pairing->getNumDuties(); i++) {
                Duty* duty = pairing->getDuty(i);
                if (duty == nullptr) continue;

                // Check layover rest after segment
                for (size_t j = 0; j < duty->getNumSegments(); j++) {
                    Segment* seg = duty->getSegment(j);
                    if (seg == nullptr) continue;

                    // Check layover rest after segment
                    time_t restStart = seg->getEndTimeLocAct();
                    time_t restEnd = (j < duty->getNumSegments() - 1) ?
                                     duty->getSegment(j + 1)->getStartTimeLocAct() :
                                     duty->getEndTimeLocAct();

                    // Check if rest exceeds 2 days and at layover station
                    if (seg->getArrStation() != roster->getBase() &&
                        restEnd - restStart >= 2 * 24 * 3600) {

                        // Calculate days covered by this layover
                        time_t effectiveStart = max(restStart, periodStartUtc);
                        time_t effectiveEnd = min(restEnd, periodEndUtc);

                        int startDayOffset = static_cast<int>((effectiveStart - periodStartUtc) / (24 * 3600));
                        int endDayOffset = static_cast<int>((effectiveEnd - periodStartUtc) / (24 * 3600));

                        for (int day = startDayOffset; day <= endDayOffset && day < 31; day++) {
                            if (day >= 0)
                                daysOff.set(day);
                        }
                    }
                }
            }
        }
    }

    // Include Pairing Base Rest if configured
    if (ruleParam._includePairingBaseRest) {
        for (const auto& roster : rosters) {
            if (roster == nullptr || roster->pairing == nullptr) continue;

            const auto& pairing = roster->pairing;
            // Check rest at base between duties within pairing
            for (size_t i = 1; i < pairing->getNumDuties(); i++) {
                Duty* prevDuty = pairing->getDuty(i - 1);
                Duty* currDuty = pairing->getDuty(i);

                if (prevDuty == nullptr || currDuty == nullptr) continue;

                // Check if both duties end/start at base
                if (prevDuty->getArrStation() == roster->getBase() &&
                    currDuty->getDepStation() == roster->getBase()) {

                    time_t restStart = prevDuty->getEndTimeLocAct();
                    time_t restEnd = currDuty->getStartTimeLocAct();

                    // If rest at base is >= 24 hours, consider as day off
                    if (restEnd - restStart >= 24 * 3600) {
                        time_t effectiveStart = max(restStart, periodStartUtc);
                        time_t effectiveEnd = min(restEnd, periodEndUtc);

                        int startDayOffset = static_cast<int>((effectiveStart - periodStartUtc) / (24 * 3600));
                        int endDayOffset = static_cast<int>((effectiveEnd - periodStartUtc) / (24 * 3600));

                        for (int day = startDayOffset; day <= endDayOffset && day < 31; day++) {
                            if (day >= 0)
                                daysOff.set(day);
                        }
                    }
                }
            }
        }
    }

    return daysOff;
}

// Count consecutive days off sets
int CheckConsecutiveDaysOffRequirementFor5JRule::CountConsecutiveDaysOffSets(const std::bitset<31>& daysOff,
                                                                              int requiredConsecutiveDays,
                                                                              bool canCombine) const {
    std::vector<int> consecutiveRuns;
    int currentConsecutive = 0;

    for (int i = 0; i < 31; i++) {
        if (daysOff.test(i)) {
            currentConsecutive++;
        } else {
            if (currentConsecutive >= requiredConsecutiveDays) {
                consecutiveRuns.push_back(currentConsecutive);
            }
            currentConsecutive = 0;
        }
    }
    // Check the last run
    if (currentConsecutive >= requiredConsecutiveDays) {
        consecutiveRuns.push_back(currentConsecutive);
    }

    int consecutiveSets = 0;

    // Count sets based on canCombine flag
    if (canCombine) {
        // If can combine, a larger consecutive run can count as multiple sets
        // e.g., 4 consecutive days can satisfy 2 sets of 2 consecutive days
        for (int run : consecutiveRuns) {
            consecutiveSets += run / requiredConsecutiveDays;
        }
    } else {
        // Cannot combine, each set must be separate
        // But a longer run still counts as one set
        consecutiveSets = static_cast<int>(consecutiveRuns.size());
    }

    return consecutiveSets;
}

bool CheckConsecutiveDaysOffRequirementFor5JRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
    if (this->_ruleParams.empty() || rosters.empty()) {
        return true;
    }

    bool isValid = true;

    time_t checkedStartTime = 0, checkedEndTime = 0;
    if (this->_application == ROSTER_OPTIMIZER) {
        checkedStartTime = this->_dbData->scenario.startDtUTC;
        checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
    } else {
        checkedStartTime = rosters[0]->getStartTimeUtcAct();
        checkedEndTime = rosters[rosters.size() - 1]->getEndTimeUtcAct();
    }

    const auto& crew = this->_dbData->crewIdMap.at(rosters[0]->idcrew);
    string base = crew->getPrimeBase();

    int crewBaseOffsetMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcAct(), base, this->GetDataContext());

    _ruleViolation.SetParam("crew_id", crew->idCrew);

    for (const auto& ruleParam : _ruleParams) {
        _ruleViolation.SetRuleParam(ruleParam);

        if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
            continue;

        // Get periods based on check period mode
        std::vector<std::pair<time_t, time_t>> periods;
        GetPeriodBoundaries(rosters, ruleParam, periods, crewBaseOffsetMinutes);

        int numberOfSets = ruleParam._numberOfSets;
        int numberOfConsecutiveOff = ruleParam._numberOfConsecutiveOff;
        bool canSetsCombined = ruleParam._canSetsCombined;

        _ruleViolation.SetParam("numberOfSets", to_string(numberOfSets));
        _ruleViolation.SetParam("numberOfConsecutiveOff", to_string(numberOfConsecutiveOff));
        _ruleViolation.SetParam("canSetsCombined", canSetsCombined ? "Y" : "N");

        // Check each period
        for (const auto& period : periods) {
            std::bitset<31> daysOff = GetDaysOffInPeriod(rosters, ruleParam,
                                                         period.first, period.second,
                                                         crewBaseOffsetMinutes);

            int foundSets = CountConsecutiveDaysOffSets(daysOff, numberOfConsecutiveOff, canSetsCombined);

            if (foundSets < numberOfSets) {
                // Violation found - not enough consecutive days off sets
                std::string errorMsg = "In period [" + to_string(period.first) + "-" + to_string(period.second) +
                                      "], found " + to_string(foundSets) +
                                      " sets of consecutive days off, but required " +
                                      to_string(numberOfSets) + " sets of " +
                                      to_string(numberOfConsecutiveOff) + " consecutive days off.";

                if (this->_application == ROSTER_OPTIMIZER)
                    return false;

                ThrowRuleViolation(errorMsg, period.first, period.second, crew->idCrew, 0);
                isValid = false;
            }
        }
    }

    return isValid;
}

void CheckConsecutiveDaysOffRequirementFor5JRule::ParseParam(const InputType& input) {
    for (const auto& dbRule : input.dbRules) {
        _ruleParams.emplace_back(CheckConsecutiveDaysOffRequirementFor5JRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(dbRule);
    }
}

void CheckConsecutiveDaysOffRequirementFor5JRule::ThrowRuleViolation(const std::string& errorMsg, time_t startUtc, time_t endUtc, const std::string& crewId, int rosterId) const {
    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->crewId = crewId;
    rv->startDTUtc = startUtc;
    rv->endDTUtc = endUtc;
    rv->violation_msg = errorMsg;
    rv->rosterId = rosterId;
    if (!_ruleParams.empty()) {
        rv->idRule = _ruleParams[0].GetId();
    }
    rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    rv->operation_result.insert(pair<string, string>("numberOfSets", _ruleViolation.GetParam("numberOfSets")));
    rv->operation_result.insert(pair<string, string>("numberOfConsecutiveOff", _ruleViolation.GetParam("numberOfConsecutiveOff")));
    rv->operation_result.insert(pair<string, string>("canSetsCombined", _ruleViolation.GetParam("canSetsCombined")));
    _ruleViolation.AddRuleViolations(rv);
}
