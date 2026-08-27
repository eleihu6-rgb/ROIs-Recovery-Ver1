/**
 * @file CheckImplausibleConnectionsAssignmentRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-08-19
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckImplausibleConnectionsAssignmentRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CheckImplausibleConnectionsAssignmentRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    //Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Consecutive Hours,Cumulative Max BLH,Min Rest
    string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = iter->first;
        headeValue = iter->second;

        if (header == "EXCEPTION ASSIGNMENTS") {
            split(headeValue, '|', _exceptionAssignments);
        }
        else if (header == "EXCEPTION ASSIGNMENT GROUPS") {
            split(headeValue, '|', _exceptionAssignmentGroups);
        }

        else
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}

bool CheckImplausibleConnectionsAssignmentRuleParam::MatchAssignment(const std::string assignment) const {
    if (_exceptionAssignments.size() > 0 && _exceptionAssignments[0] != "*" && _exceptionAssignments[0] != "" &&
        find(_exceptionAssignments.begin(), _exceptionAssignments.end(), assignment) != _exceptionAssignments.end())
        return true;

    if (_exceptionAssignmentGroups.size() > 0 && _exceptionAssignmentGroups[0] != "*" && _exceptionAssignmentGroups[0] != "") {
        for (const auto& group : _exceptionAssignmentGroups) {
            if (this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, group)) {
                return true;
            }
        }
    }

    return false;
}



