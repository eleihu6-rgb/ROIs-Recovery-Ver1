/**
 * @file CheckDisruptiveScheduleRERRPForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckDisruptiveScheduleRERRPForTGRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"


using namespace std;

void CheckDisruptiveScheduleRERRPForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "TYPES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _types);
			}
		}
		else if (header == "DUTY NUMBER RANGE") {
			if (headeValue != RuleParamConstant::ALL) {
				if (!headeValue.empty()) {
					split(headeValue, '-', _dutyNumberRange);
					if (_dutyNumberRange.size() > 1) {
						_dutyNumberLowwer = stoi(_dutyNumberRange[0]);
						_dutyNumberUpper = stoi(_dutyNumberRange[1]);
					}			
				}
			}
		}
		else if (header == "NEXT RERRP MIN REST") {
			if (headeValue != RuleParamConstant::ALL) {
				_nextRERRPMinRest = hhmmStrToMinutes(headeValue);
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckDisruptiveScheduleRERRPForTGRuleParam::MatchAssignments(const string assignment) const {
	

	if (!_assignments.empty() && _assignments[0] != "" && _assignments[0] != "*" &&
		find(_assignments.begin(), _assignments.end(), assignment) == _assignments.end())
		return false;

	return true;
}

bool CheckDisruptiveScheduleRERRPForTGRuleParam::MatchDutyTypes(const time_t checkStartUtc, const time_t checkEndUtc, const int ref) const {

	if (_types.empty() || _types[0] == "" || _types[0] == "*")
		return true;

	if (DutyUtils::IsEarlyStartTime(checkStartUtc, ref) && find(_types.begin(), _types.end(), "ESD") != _types.end())
		return true;

	if (DutyUtils::IsLateFinishTime(checkEndUtc, ref) && find(_types.begin(), _types.end(), "LFD") != _types.end())
		return true;

	if (DutyUtils::IsNightTime(checkStartUtc, checkEndUtc, ref) && find(_types.begin(), _types.end(), "ND") != _types.end())
		return true;

	return false;
}

bool CheckDisruptiveScheduleRERRPForTGRuleParam::MatchDutyNumberRange(const int count) const {
	if (_dutyNumberRange.empty() || _dutyNumberRange.size() < 2)
		return true;

	if (_dutyNumberLowwer > count || _dutyNumberUpper < count)
		return false;

	return true;
}