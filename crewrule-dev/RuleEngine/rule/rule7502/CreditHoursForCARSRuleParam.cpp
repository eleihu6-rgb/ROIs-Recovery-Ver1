/**
 * @file CreditHoursForCARSRuleParam.cpp
 * @brief 
 * @author auto-generated
 * @version 1.0
 * @date 2026-04-10
**/

#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CreditHoursForCARSRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void CreditHoursForCARSRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignmentGroups);
				}
				_assignmentGroupMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				_assignmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::MINIMUM_CH): {
				_minimumCH = substr;
				_minimumCHMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::FT_RATIO): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_ftRatio = StringUtils::stod(substr, -1.0);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DP_RATIO): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_dpRatio = StringUtils::stod(substr, -1.0);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SPLIT_METHOD): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_splitMethod = substr;
				}
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CreditHoursForCARSRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headerValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headerValue = iter->second;
		if (header == "BASES") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _teams);
			}
		}
		else if (header == "ASSIGNMENT GROUPS") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _assignmentGroups);
			}
			_assignmentGroupMatch.SetExpression(headerValue, this->GetRule());
		}
		else if (header == "ASSIGNMENTS") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _assignments);
			}
			_assignmentMatch.SetExpression(headerValue, this->GetRule());
		}
		else if (header == "MINIMUM CH") {
			_minimumCH = headerValue;
			_minimumCHMinutes = TimeUtils::hhmmToMinutes(headerValue);
		}
		else if (header == "FT RATIO") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_ftRatio = StringUtils::stod(headerValue, -1.0);
			}
		}
		else if (header == "DP RATIO") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_dpRatio = StringUtils::stod(headerValue, -1.0);
			}
		}
		else if (header == "SPLIT METHOD(SPAN/START)") {
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_splitMethod = headerValue;
			}
		}
		else
			spdlog::critical("Rule Param parsing error at rule:{0:>5}, cannot parse header:{}", 0 + RuleFuncId, header);
	}
}

//匹配参数
bool CreditHoursForCARSRuleParam::MatchParam(const Duty* duty, const Segment* segment) const {
	if (segment == nullptr) {
		return false;
	}

	if (!_assignmentGroupMatch.Match(*segment)) {
		return false;
	}

	if (!_assignmentMatch.Match(*segment)) {
		return false;
	}

	return true;
}

//匹配参数
bool CreditHoursForCARSRuleParam::MatchParam(const ROSTER* roster, const Duty* duty, const Segment* segment, const size_t currSegIndex) const {
	std::vector<string> positions;
	if (!roster->isAllValid(_bases, _ranks, _fleets, _teams, positions)) {
		return false;
	}

	if (segment != nullptr) {
		if (!_assignmentGroupMatch.Match(*segment)) {
			return false;
		}

		if (!_assignmentMatch.Match(*segment)) {
			return false;
		}
	}
	else if (roster != nullptr) {
		if (!_assignmentGroupMatch.Match(*roster)) {
			return false;
		}

		if (!_assignmentMatch.Match(*roster)) {
			return false;
		}
	}
	else {
		return false;
	}

	return true;
}
