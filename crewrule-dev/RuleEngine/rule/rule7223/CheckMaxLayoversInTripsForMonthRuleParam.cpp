/**
 * @file CheckMaxLayoversInTripsForMonthRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-12-04
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckMaxLayoversInTripsForMonthRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CheckMaxLayoversInTripsForMonthRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    //Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Consecutive Hours,Cumulative Max BLH,Min Rest
    string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Min BLH on Flight,Max Number of Crew on Flight
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "FLIGHT NUMBERS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightNumbers);
			}
		}
		else if (header == "LAYOVER STATIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _layoverStations);
			}
		}
		else if (header == "PERIOD") {
			if (headeValue != RuleParamConstant::ALL) {
				_period = atoi(headeValue.c_str());
			}
		}
		else if (header == "UNIT") {
			if (headeValue != RuleParamConstant::ALL) {
				_unit = headeValue;
			}
		}
		else if (header == "MAX LAYOVER TIMES") {
			if (headeValue != RuleParamConstant::ALL) {
				_maxLayoverTimes = atoi(headeValue.c_str());
			}
		}
		
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}



