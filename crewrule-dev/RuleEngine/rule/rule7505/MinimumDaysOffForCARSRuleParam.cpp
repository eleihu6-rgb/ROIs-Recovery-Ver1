#include "MinimumDaysOffForCARSRuleParam.h"

#include <map>

#include "Utility.h"
#include "UtilFunc.h"

void MinimumDaysOffForCARSRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    std::map<std::string, std::string>& parameter = const_cast<DBRule&>(dbRule).params;
    for (const auto& iter : parameter) {
        const std::string& header = iter.first;
        const std::string& headeValue = iter.second;
        if (header == "BASES")
            _rBase = headeValue;
        else if (header == "RANKS")
            _rRank = headeValue;
        else if (header == "FLEETS")
            _rFleet = headeValue;
        else if (header == "CREW TEAMS")
            _rTeam = headeValue;
        else if (header == "DO ASSIGNMENT GROUP")
            _rGroup = headeValue;
        else if (header == "MIN DO")
            _rMinDO = headeValue;
        else if (header == "PERIOD")
            _rPeriod = headeValue;
        else if (header == "UNIT")
            _rUnit = headeValue;
        else if (header == "MONTH NUMBERS")
            _rMonthNumber = headeValue;
        else if (header == "LAYOVER TIMEMODE")
            _rLayoverTimemode = strToUpper(headeValue);
        else if (header == "REF DATE")
            _rRefDate = headeValue;
        else if (header == "UTILIZE POST DUTY REST")
            _rPostRest = (headeValue == "Y");
        else if (header == "COUNT BLANK DAY")
            _rCountBlankDay = (headeValue == "Y");
        else if (header == "COUNT LAYOVER")
            _rCountLayover = (headeValue == "Y");
        else if (header == "IS ROLLING")
            _rIsRolling = (headeValue == "Y");
        else if (header == "CHECK TYPE")
            _rCheckType = headeValue;
        else if (header == "LAST ROSTER LATEST END TIME")
            _rLastRosterLatestEndTime = headeValue;
        else if (header == "LAST ROSTER ASSIGNMENTS") {
            split(headeValue.c_str(), '|', _rLastRosterAssignments);
        } else if (header == "RP DAYS RANGE")
            _rRPDaysRange = headeValue;
        else if (header == "LEAVE ASSIGNMENTS")
            _leaveAssignments = headeValue;
        else if (header == "LEAVE DAYS RANGE")
            _leaveDaysRange = headeValue;
    }
}

bool MinimumDaysOffForCARSRuleParam::MatchCrewQualification(const SharedPtr<CREW>& crew,
                                                            const time_t& checkedStartTime,
                                                            const time_t& checkedEndTime) const {
    return Utility::GetInstancePtr()->isCrewQualified(crew, _rBase, _rRank, _rFleet, _rTeam, "*",
                                                     checkedStartTime, checkedEndTime);
}
