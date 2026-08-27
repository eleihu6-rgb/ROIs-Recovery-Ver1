/**
 * @file LimitConsecutiveDayMinRestForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-13
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitConsecutiveDayMinRestForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void LimitConsecutiveDayMinRestForHXRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::CONSECUTIVE_DAYS): {
				_strConsecutiveDays = substr;
				_consecutiveDays = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::ACC_STATE): {
				_accState = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::REST_ASSIGNMENT_GROUPS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _restAssignmentGroups);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::REST_DURATION): {
				_restDurationRange = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_restDurationRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_restDurationRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::IS_PHYSIOLOGICAL_REST_INCLUDED_IN_COUNT_STATISTICS): {
				_isPhysiologicalRest = (substr.empty() || substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::LAYOVER_ASSIGNMENTS): {
				_strLayoverAssignments = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _layoverAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_LAYOVER_ASSIGNMENTS_DURATION): {
				_strMinLayoverAssignmentsDuration = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_minLayoverAssignmentsDuration = TimeUtils::hhmmToMinutes(substr.c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_CONSECUTIVE_REST_DURATION_TIMES): {
				_maxConsecutiveRestTimes = (substr.empty() || substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(atoi(substr.c_str()));
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_TOTAL_REST_DURATION_TIMES): {
				_maxTotalRestTimes = (substr.empty() || substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(atoi(substr.c_str()));
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):{
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LimitConsecutiveDayMinRestForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headerValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headerValue = iter->second;
		//Consecutive Days,ACC State,Rest Assignment Groups,Rest Duration,is Physiological Rest Included in Count statistics(Y/N),Layover Assignments,Min Layover Assignments Duration,Max Consecutive Rest Duration Times,Max Total Rest Duration Times
		if (header == "CONSECUTIVE DAYS") {
			_strConsecutiveDays = headerValue;
			_consecutiveDays = atoi(headerValue.c_str());
		}
		else if (header == "ACC STATE") {
			_accState = strToUpper(headerValue);
		}
		else if (header == "REST ASSIGNMENT GROUPS") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _restAssignmentGroups);
			}
		}
		else if (header == "REST DURATION") {
			_restDurationRange = headerValue;

			vector<string> splitstrs;
			split(headerValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_restDurationRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_restDurationRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "IS PHYSIOLOGICAL REST INCLUDED IN COUNT STATISTICS(Y/N)") {
			_isPhysiologicalRest = (headerValue.empty() || headerValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headerValue == RuleParamConstant::YES);
		}
		else if (header == "LAYOVER ASSIGNMENTS") {
			_strLayoverAssignments = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _layoverAssignments);
			}
		}
		else if (header == "MIN LAYOVER ASSIGNMENTS DURATION") {
			_strMinLayoverAssignmentsDuration = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_minLayoverAssignmentsDuration = TimeUtils::hhmmToMinutes(headerValue.c_str());
			}
		}
		else if (header == "MAX CONSECUTIVE REST DURATION TIMES") {
			_maxConsecutiveRestTimes = (headerValue.empty() || headerValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(atoi(headerValue.c_str()));
		}
		else if (header == "MAX TOTAL REST DURATION TIMES") {
			_maxTotalRestTimes = (headerValue.empty() || headerValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(atoi(headerValue.c_str()));
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headerValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}


bool LimitConsecutiveDayMinRestForHXRuleParam::IsCheckLayoverAssignment() const {
	return !this->_layoverAssignments.empty() && this->_minLayoverAssignmentsDuration > 0;
}