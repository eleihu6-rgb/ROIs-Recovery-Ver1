/**
 * @file ConsecutiveDutyDaysOffForHXRuleParam.cpp
 * @brief 日历月最少N次连续X个DDO规则参数类实现
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-05-28
**/

#include <sstream>
#include "spdlog/spdlog.h"
#include "ConsecutiveDutyDaysOffForHXRuleParam.h"
#include "../utils/StringUtils.h"
#include "RuleParams.h"
#include "UtilFunc.h"
#include "../constant/Constants.h"

using namespace std;

void ConsecutiveDutyDaysOffForHXRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_DAYS_OFF): {
				_consecutiveDaysOff = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::PERIOD): {
				_period = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::UNIT): {
				_unit = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_TIMES): {
				_minTimes = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_TIMES): {
				_maxTimes = atoi(substr.c_str());
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void ConsecutiveDutyDaysOffForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "CONSECUTIVE DAYS OFF") {
			_consecutiveDaysOff = atoi(headeValue.c_str());
		}
		else if (header == "PERIOD") {
			_period = atoi(headeValue.c_str());
		}
		else if (header == "UNIT") {
			_unit = strToUpper(headeValue);
		}
		else if (header == "MIN TIMES") {
			_minTimes = atoi(headeValue.c_str());
		}
		else if (header == "MAX TIMES") {
			_maxTimes = atoi(headeValue.c_str());
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool ConsecutiveDutyDaysOffForHXRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}