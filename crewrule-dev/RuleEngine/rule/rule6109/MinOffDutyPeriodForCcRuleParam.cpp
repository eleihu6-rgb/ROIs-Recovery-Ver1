/**
 * @file MinOffDutyPeriodForCcRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "spdlog/spdlog.h"
#include "MinOffDutyPeriodForCcRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"

using namespace std;

void MinOffDutyPeriodForCcRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
                case enum_to_underlying(ParamLocation::PREV_DP):
					_prevDP = substr;
					_prevDPMinutes = TimeUtils::hhmmToMinutes(substr);
                    break;
                case enum_to_underlying(ParamLocation::MAX_REF_REST_DP):
					_maxRefRestDP = substr;
					_maxRefRestDPMinutes = TimeUtils::hhmmToMinutes(substr);
                    break;
                case enum_to_underlying(ParamLocation::FACTOR_DP):
					_factorDP = atof(substr.c_str());
                    break;
                case enum_to_underlying(ParamLocation::SPLIT_DUTY_LIMIT_START_TIME):
					_splitDutyLimitStartTime = substr;
					_splitDutyLimitStartTimeMinutes = TimeUtils::hhmmToMinutes(substr);
                    break;
                case enum_to_underlying(ParamLocation::SPLIT_DUTY_LIMIT_END_TIME):
					_splitDutyLimitEndTime = substr;
					_splitDutyLimitEndTimeMinutes = TimeUtils::hhmmToMinutes(substr);
                    break;
                case enum_to_underlying(ParamLocation::SPLIT_DUTY_MIN_REF_REST):
					_splitDutyMinRefRest = atoi(substr.c_str());
                    break;
				case enum_to_underlying(ParamLocation::SPLIT_REST_PERIOD_DISCOUNT_FACTOR):
					_splitRestPeriodDiscountFactor = atof(substr.c_str());
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

void MinOffDutyPeriodForCcRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "PREV DP") {
			_prevDP = headeValue;
			_prevDPMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MAX REF REST DP") {
			_maxRefRestDP = headeValue;
			_maxRefRestDPMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "FACTOR DP")
			_factorDP = atof(headeValue.c_str());
		else if (header == "SPLIT DUTY LIMIT START TIME") {
			_splitDutyLimitStartTime = headeValue;
			_splitDutyLimitStartTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SPLIT DUTY LIMIT END TIME") {
			_splitDutyLimitEndTime = headeValue;
			_splitDutyLimitEndTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SPLIT DUTY MIN REF REST")
			_splitDutyMinRefRest = atoi(headeValue.c_str());
		else if (header == "SPLIT REST PERIOD DISCOUNT FACTOR")
			_splitRestPeriodDiscountFactor = atof(headeValue.c_str());
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}


//bool MinOffDutyPeriodForCcRuleParam::MatchParam(const std::string& composition, const long &reportTime, bool isAugment) const {
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


