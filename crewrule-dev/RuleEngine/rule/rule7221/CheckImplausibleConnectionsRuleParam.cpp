/**
 * @file CheckImplausibleConnectionsRuleParam.h
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
#include "CheckImplausibleConnectionsRuleParam.h"
#include "CheckImplausibleConnectionsAssignmentRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CheckImplausibleConnectionsRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    //Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Consecutive Hours,Cumulative Max BLH,Min Rest
	if (dbRule.tableNum == 1) {
        _assignmentParams.emplace_back(CheckImplausibleConnectionsAssignmentRuleParam(this->GetRule()));
        auto& newParam = _assignmentParams.back();
        newParam.ParseParam(dbRule);
	}
	else {
        _airportParams.emplace_back(CheckImplausibleConnectionsAirportRuleParam(this->GetRule()));
        auto& newParam = _airportParams.back();
        newParam.ParseParam(dbRule);
	}
    
}



