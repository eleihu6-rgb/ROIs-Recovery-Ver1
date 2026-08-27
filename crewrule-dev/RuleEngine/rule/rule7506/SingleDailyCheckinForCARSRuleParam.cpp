#include "SingleDailyCheckinForCARSRuleParam.h"

#include <map>

#include "Utility.h"
#include "UtilFunc.h"

void SingleDailyCheckinForCARSRuleParam::ParseParam(const DBRule& dbRule) {
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
        else if (header == "ASSIGNMENTS") {
            _checkedGroupsRaw = headeValue;
            split(headeValue.c_str(), '|', _checkedGroups);
            for (auto& group : _checkedGroups) {
                group = strToUpper(group);
            }
        }
    }
}

bool SingleDailyCheckinForCARSRuleParam::MatchCrewQualification(const SharedPtr<CREW>& crew,
                                                                const time_t& checkedStartTime,
                                                                const time_t& checkedEndTime) const {
    return Utility::GetInstancePtr()->isCrewQualified(crew, _rBase, _rRank, _rFleet, _rTeam, "*",
                                                     checkedStartTime, checkedEndTime);
}
