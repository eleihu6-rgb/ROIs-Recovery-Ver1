/**
 * @file CheckMaxLayoversInTripsForPairingRuleParam.h
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
#include "CheckMaxLayoversInTripsForPairingRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CheckMaxLayoversInTripsForPairingRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    //Bases,Ranks,Fleets,Teams,Compositions,Duty Assignments,Duty Type,Consecutive Hours,Cumulative Max BLH,Min Rest
    string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Min BLH on Flight,Max Number of Crew on Flight
		if (header == "LAYOVER STATIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _layoverStations);
			}
		}
		else if (header == "MAX LAYOVER TIMES") {
			if (headeValue != RuleParamConstant::ALL) {
				_maxLayoverTimes = atoi(headeValue.c_str());
			}
		}
		else if (header == "PAIRING BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "EFF DATE") {
			_effDate = utcStrToUtc(const_cast<char*>(headeValue.c_str()));
		}
		else if (header == "EXP DATE") {
			_expDate = utcStrToUtc(const_cast<char*>(headeValue.c_str()));
		}
		
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}



