/**
 * @file MinODPInPeriodForCcRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "spdlog/spdlog.h"
#include "MinODPInPeriodForCcRuleParam.h"
#include "CrewDB.h"

#include "../utils/TimeUtils.h"

using namespace std;

void MinODPInPeriodForCcRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
				case enum_to_underlying(ParamLocation::MAX_PERIOD_DAYS):
					_maxPeriodDays = atoi(substr.c_str());
					break;
				case enum_to_underlying(ParamLocation::MIN_CONSECUTIVE_HOURS_PER_PERIOD):
					_minConsecutiveHoursPerPeriod = atoi(substr.c_str());
					break;
				case enum_to_underlying(ParamLocation::MAX_PERIOD_NIGHTS):
					_maxPeriodNights = atoi(substr.c_str());
					break;
				case enum_to_underlying(ParamLocation::MIN_CONSECUTIVE_NIGHTS_PER_PERIOD):
					_minConsecutiveNightsPerPeriod = atoi(substr.c_str());
					break;
				case enum_to_underlying(ParamLocation::NIGHT_START_TIME):
					_nightStartTime = substr;
					break;
				case enum_to_underlying(ParamLocation::NIGHT_END_TIME):
					_nightEndTime = substr;
					break;
				case enum_to_underlying(ParamLocation::MAX_ROSTER_PERIOD):
					_maxRosterPeriod = atoi(substr.c_str());
					break;
				case enum_to_underlying(ParamLocation::MIN_DAYS_FREE_OF_DUTY):
					_minDaysFreeOfDuty = atoi(substr.c_str());
					break;
				case enum_to_underlying(ParamLocation::SEVERITY):
					this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
					break;
                default:
					Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void MinODPInPeriodForCcRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "MAX PERIOD DAYS")
			_maxPeriodDays = atoi(headeValue.c_str());
		else if (header == "MIN CONSECUTIVE HOURS PER PERIOD")
			_minConsecutiveHoursPerPeriod = atoi(headeValue.c_str());
		else if (header == "MAX PERIOD NIGHTS")
			_maxPeriodNights = atoi(headeValue.c_str());
		else if (header == "MIN CONSECUTIVE NIGHTS PER PERIOD")
			_minConsecutiveNightsPerPeriod = atoi(headeValue.c_str());
		else if (header == "NIGHT START TIME")
			_nightStartTime = headeValue;
		else if (header == "NIGHT END TIME")
			_nightEndTime = headeValue;
		else if (header == "MAX ROSTER PERIOD")
			_maxRosterPeriod = atoi(headeValue.c_str());
		else if (header == "MIN DAYS FREE OF DUTY")
			_minDaysFreeOfDuty = atoi(headeValue.c_str());
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
	if (!_nightStartTime.empty() && !_nightEndTime.empty()) {
		_nightMinRestInterval = TimeUtils::MinutesTohhmm(TimeUtils::GetDurationOfHHmm(_nightStartTime, _nightEndTime));
	}
}


//bool MinODPInPeriodForCcRuleParam::MatchParam(const std::string& composition, const long &reportTime, bool isAugment) const {
//
//    // The checking sequence can be reordered to better speed up the process
//    if (isAugment != _isAugment) return false;
//
//    if (_composition.front() != InputRuleParamDefine::WildcardChar && composition != _composition) return false;
//
//    if (reportTime < _reportTimeLower || reportTime > _reportTimeUpper) return false;
//
//    return true;
//}


