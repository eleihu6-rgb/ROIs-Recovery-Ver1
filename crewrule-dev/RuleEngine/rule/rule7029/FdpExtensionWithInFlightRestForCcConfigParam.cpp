/**
 * @file FdpExtensionWithInFlightRestForCcConfigParam.cpp
 * @brief 7029法规 Table1 参数类实现
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-09
**/

#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "FdpExtensionWithInFlightRestForCcConfigParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "Log/Logger.h"

using namespace std;

void FdpExtensionWithInFlightRestForCcConfigParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		switch (i) {
		case enum_to_underlying(ParamLocation::ACC_STATE): {
			_accState = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				split(substr, '|', _accStates);
			}
			break;
		}
		case enum_to_underlying(ParamLocation::SECTORS_RANGE): {
			_sectorsRange = substr;
			_sectorsRangeMatch.SetExpression(substr, this->GetRule());
			break;
		}
		case enum_to_underlying(ParamLocation::REST_FACILITY): {
			_restFacility = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				split(substr, '|', _restFacilities);
			}
			break;
		}
		case enum_to_underlying(ParamLocation::OVERRIDE_DUTY_ATTRIBUTES): {
			_overrideDutyAttributes = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				split(substr, '|', _overrideDutyAttributeList);
			}
			break;
		}
		case enum_to_underlying(ParamLocation::INFLIGHT_REST_RANGE): {
			_inflightRestRange = substr;
			_inflightRestRangeMatch.SetExpression(substr, this->GetRule());
			break;
		}
		case enum_to_underlying(ParamLocation::GROUP): {
			_group = atoi(substr.c_str());
			if (_group <= 0) {
				_group = 1;
			}
			break;
		}
		case enum_to_underlying(ParamLocation::MAX_FDP): {
			_maxFdp = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				_maxFdpMinutes = TimeUtils::hhmmToMinutes(substr);
			}
			break;
		}
		case enum_to_underlying(ParamLocation::MIN_REST): {
			_minRest = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				_minRestMinutes = TimeUtils::hhmmToMinutes(substr);
			}
			break;
		}
		default:
			Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
		}
	}
}

void FdpExtensionWithInFlightRestForCcConfigParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);

	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headerValue;
	for (auto iter = parameter.begin(); iter != parameter.end(); iter++) {
		header = iter->first;
		headerValue = iter->second;

		if (header == "ACC STATE") {
			_accState = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _accStates);
			}
		} else if (header == "SECTORS RANGE") {
			_sectorsRange = headerValue;
			_sectorsRangeMatch.SetExpression(headerValue, this->GetRule());
		} else if (header == "REST FACILITY") {
			_restFacility = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _restFacilities);
			}
		} else if (header == "OVERRIDE DUTY ATTRIBUTES") {
			_overrideDutyAttributes = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _overrideDutyAttributeList);
			}
		} else if (header == "IN-FLIGHT REST RANGE") {
			_inflightRestRange = headerValue;
			_inflightRestRangeMatch.SetExpression(headerValue, this->GetRule());
		} else if (header == "GROUP") {
			_group = atoi(headerValue.c_str());
			if (_group <= 0) {
				_group = 1;
			}
		} else if (header == "MAX FDP") {
			_maxFdp = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_maxFdpMinutes = TimeUtils::hhmmToMinutes(headerValue);
			}
		} else if (header == "MIN REST") {
			_minRest = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_minRestMinutes = TimeUtils::hhmmToMinutes(headerValue);
			}
		} else {
			spdlog::critical("Rule Param parsing error at rule:7029, cannot parse header:{}", header);
		}
	}
}

bool FdpExtensionWithInFlightRestForCcConfigParam::MatchAccState(const Duty* duty) const {
	if (_accState.empty() || _accState == RuleParamConstant::IGNORED) {
		return true;
	}
	return duty->getAcclimatisedState() == this->_accState;
}

bool FdpExtensionWithInFlightRestForCcConfigParam::IsSectorInRange(const Duty* duty) const {
	if (_sectorsRange.empty() || _sectorsRange == RuleParamConstant::IGNORED) {
		return true;
	}
	return _sectorsRangeMatch.Match(duty->getNumFlySegs());
}

bool FdpExtensionWithInFlightRestForCcConfigParam::MatchRestFacility(const Duty* duty) const {
	if (_restFacilities.empty()) {
		return true;
	}
	//简化：直接返回true，具体业务逻辑可基于Duty的rest facility匹配_restFacilities中的任意一项
	return true;
}

bool FdpExtensionWithInFlightRestForCcConfigParam::MatchOverrideDutyAttributes(const Duty* duty) const {
	if (_overrideDutyAttributeList.empty()) {
		return true;
	}
	//简化：直接返回true，具体业务逻辑可基于Duty的attribute
	return true;
}

bool FdpExtensionWithInFlightRestForCcConfigParam::MatchParam(const Duty* duty) const {

	if (!MatchAccState(duty)) {
		return false;
	}

	if (!IsSectorInRange(duty)) {
		return false;
	}
	
	if (!MatchRestFacility(duty)) {
		return false;
	}

	if (!MatchOverrideDutyAttributes(duty)) {
		return false;
	}

	return true;
}

bool FdpExtensionWithInFlightRestForCcConfigParam::MatchInFlightRest(const int inFlightRestMinutes) const {

	if (!_inflightRestRangeMatch.Match(inFlightRestMinutes)) {
		return false;
	}

	return true;
}