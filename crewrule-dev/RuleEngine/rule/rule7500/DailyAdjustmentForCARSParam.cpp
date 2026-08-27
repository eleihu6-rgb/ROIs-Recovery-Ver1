/**
 * @file DailyAdjustmentForCARSParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-16
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "DailyAdjustmentForCARSParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

using namespace std;

void DailyAdjustmentForCARSParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::STAY_DURATION_PER_HOURS): {
				_stayDurationPerHoursMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::ACC_TIME_ZONE_ADJUST_HOURS):
				_accTimeZoneAdjustHoursMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void DailyAdjustmentForCARSParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Stay Duration per X Hours,ACC Time Zone Adjust X Hours
		if (header == "STAY DURATION PER X HOURS") {
			_stayDurationPerHoursMinutes = TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "ACC TIME ZONE ADJUST X HOURS") {
			_accTimeZoneAdjustHoursMinutes = TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}



//bool DailyAdjustmentForCARSParam::MatchParam(const std::string& composition, const long &reportTime, bool isAugment) const {
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


