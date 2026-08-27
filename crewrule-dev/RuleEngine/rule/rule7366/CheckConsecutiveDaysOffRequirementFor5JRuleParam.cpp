/**
 * @file CheckConsecutiveDaysOffRequirementFor5JRuleParam.cpp
 * @brief Rule 7366 - Parameter parsing implementation
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-04-16
**/

#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckConsecutiveDaysOffRequirementFor5JRuleParam.h"
#include "CrewDB.h"

using namespace std;

void CheckConsecutiveDaysOffRequirementFor5JRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    string header, headerValue;

    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++) {
        header = iter->first;
        headerValue = iter->second;

        if (header == "BASES")
            split(headerValue, '|', _bases);
        else if (header == "RANKS")
            split(headerValue, '|', _ranks);
        else if (header == "FLEETS")
            split(headerValue, '|', _fleets);
        else if (header == "DAYS OFF ASSIGNMENT GROUPS") {
            split(headerValue, '|', _daysOffAssignmentGroups);
            _daysOffAssignmentGroupsMatch.SetExpression(headerValue, this->GetRule());
        }
        else if (header == "DAYS OFF ASSIGNMENTS") {
            split(headerValue, '|', _daysOffAssignments);
            _daysOffAssignmentsMatch.SetExpression(headerValue, this->GetRule());
        }
        else if (header == "NUMBER OF SETS") {
            int val = atoi(headerValue.c_str());
            _numberOfSets = (val > 0) ? val : 1;
        }
        else if (header == "NUMBER OF CONSECUTIVE OFF") {
            int val = atoi(headerValue.c_str());
            _numberOfConsecutiveOff = (val > 0) ? val : 1;
        }
        else if (header == "CAN SETS COMBINED")
            _canSetsCombined = (!headerValue.empty() && toupper(headerValue[0]) == 'Y');
        else if (header == "CHECK PERIOD") {
            int val = atoi(headerValue.c_str());
            _checkPeriod = (val > 0) ? val : 1;
        }
        else if (header == "CHECK PERIOD MODE")
            _checkPeriodMode = headerValue;
        else if (header == "INCLUDE BLANK DAY")
            _includeBlankDay = (!headerValue.empty() && toupper(headerValue[0]) == 'Y');
        else if (header == "INCLUDE LAYOVER REST")
            _includeLayoverRest = (!headerValue.empty() && toupper(headerValue[0]) == 'Y');
        else if (header == "INCLUDE PAIRING BASE REST")
            _includePairingBaseRest = (!headerValue.empty() && toupper(headerValue[0]) == 'Y');
    }
}


bool CheckConsecutiveDaysOffRequirementFor5JRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
    std::vector<string> positions;
    std::vector<string> teams;
    if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, teams, positions, checkedStartTime, checkedEndTime))
        return true;
    return false;
}

bool CheckConsecutiveDaysOffRequirementFor5JRuleParam::MatchDaysOffAssignmentGroup(const ROSTER* roster) const {
    return _daysOffAssignmentGroupsMatch.Match(*roster);
}

bool CheckConsecutiveDaysOffRequirementFor5JRuleParam::MatchDaysOffAssignment(const ROSTER* roster) const {
    return _daysOffAssignmentsMatch.Match(*roster);
}
