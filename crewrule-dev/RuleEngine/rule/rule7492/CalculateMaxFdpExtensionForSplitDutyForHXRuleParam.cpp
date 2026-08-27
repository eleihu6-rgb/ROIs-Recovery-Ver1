/**
 * @file CalculateMaxFdpExtensionForSplitDutyForHXRuleParam.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-03-30
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateMaxFdpExtensionForSplitDutyForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CalculateMaxFdpExtensionForSplitDutyForHXRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::COMPOSITIONS): {
				_compositionsStr = substr;
				split(substr, '|', _compositions);
				break;
			}
			case enum_to_underlying(ParamLocation::LT_REST_THREADHOLD): {
				_ltRestThreadholdStr = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_ltRestThreadholdMinutes = TimeUtils::hhmmToMinutes(substr);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::LT_REST_RATIO): {
				_ltRestRatioStr = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_ltRestRatio = atof(substr.c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PRE_SPLIT_MAX_FDP): {
				_preSplitMaxFdpStr = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_preSplitMaxFdpMinutes = TimeUtils::hhmmToMinutes(substr);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::POST_SPLIT_MAX_FDP): {
				_postSplitMaxFdpStr = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_postSplitMaxFdpMinutes = TimeUtils::hhmmToMinutes(substr);
				}
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}


void CalculateMaxFdpExtensionForSplitDutyForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;

	string header, headerValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headerValue = iter->second;

		if (header == "COMPOSITIONS") {
			_compositionsStr = headerValue;
			split(headerValue, '|', _compositions);
		}
		else if (header == "LT REST THREADHOLD") {
			_ltRestThreadholdStr = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_ltRestThreadholdMinutes = TimeUtils::hhmmToMinutes(headerValue);
			}
		}
		else if (header == "LT REST RATIO") {
			_ltRestRatioStr = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_ltRestRatio = atof(headerValue.c_str());
			}
		}
		else if (header == "PRE SPLIT MAX FDP") {
			_preSplitMaxFdpStr = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_preSplitMaxFdpMinutes = TimeUtils::hhmmToMinutes(headerValue);
			}
		}
		else if (header == "POST SPLIT MAX FDP") {
			_postSplitMaxFdpStr = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_postSplitMaxFdpMinutes = TimeUtils::hhmmToMinutes(headerValue);
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateMaxFdpExtensionForSplitDutyForHXRuleParam::MatchParam(const Duty* duty, const time_t checkStart, const time_t checkEnd) const {
	if (!MatchCompositions(duty)) {
		return false;
	}

	return true;
}

bool CalculateMaxFdpExtensionForSplitDutyForHXRuleParam::MatchCompositions(const Duty* duty) const {
	//支持*号通配符
	if (_compositions.empty() || _compositionsStr == RuleParamConstant::ALL || _compositionsStr == "*") {
		return true;
	}

	string composition = DutyUtils::GetCompositionByDutyFor3(duty, this->GetRule()->GetDataContext());

	//匹配compositions列表中的任意一个
	return find(_compositions.begin(), _compositions.end(), composition) != _compositions.end();
}

bool CalculateMaxFdpExtensionForSplitDutyForHXRuleParam::MatchPreSplitMaxFdp(int preSplitFdpMinutes) const {
	if (_preSplitMaxFdpStr.empty() || _preSplitMaxFdpStr == RuleParamConstant::ALL) {
		return true;
	}
	return preSplitFdpMinutes <= _preSplitMaxFdpMinutes;
}

bool CalculateMaxFdpExtensionForSplitDutyForHXRuleParam::MatchPostSplitMaxFdp(int postSplitFdpMinutes) const {
	if (_postSplitMaxFdpStr.empty() || _postSplitMaxFdpStr == RuleParamConstant::ALL) {
		return true;
	}
	return postSplitFdpMinutes <= _postSplitMaxFdpMinutes;
}
