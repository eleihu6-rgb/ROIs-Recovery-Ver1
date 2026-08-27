/**
 * @file CheckImplausibleConnectionsAirportRuleParam.h
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
#include "CheckImplausibleConnectionsAirportRuleParam.h"
#include "CheckImplausibleConnectionsAssignmentRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CheckImplausibleConnectionsAirportRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    //Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Consecutive Hours,Cumulative Max BLH,Min Rest
    string header, headeValue;
 
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = iter->first;
        headeValue = iter->second;

        if (header == "NO WARNING GROUPS") {
            vector<string> groupAirports;
            split(headeValue.c_str(), '|', groupAirports);

            for (string& airport1 : groupAirports) {
                for (string& airport2 : groupAirports) {
                    if (airport2 == airport1)
                        continue;
                    _noWarningAirportPairs.insert(make_pair(airport1, airport2));
                }
            }
        }

        else
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
    

}



