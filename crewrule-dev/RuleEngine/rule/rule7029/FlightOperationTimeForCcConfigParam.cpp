/**
 * @file FlightOperationTimeForCcConfigParam.cpp
 * @brief 7029法规 Table2 参数类实现
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
#include "FlightOperationTimeForCcConfigParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "Log/Logger.h"

using namespace std;

void FlightOperationTimeForCcConfigParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		switch (i) {
		case enum_to_underlying(ParamLocation::FLIGHT_NUMBERS): {
			_flightNumbers = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				split(substr, '|', _flightNumberList);
			}
			break;
		}
		case enum_to_underlying(ParamLocation::FLEETS): {
			_fleets = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				split(substr, '|', _fleetList);
			}
			break;
		}
		case enum_to_underlying(ParamLocation::TAKE_OFF_TIME): {
			_takeOffTime = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				_takeOffTimeMinutes = TimeUtils::hhmmToMinutes(substr);
			}
			break;
		}
		case enum_to_underlying(ParamLocation::LANDING_TIME): {
			_landingTime = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				_landingTimeMinutes = TimeUtils::hhmmToMinutes(substr);
			}
			break;
		}
		case enum_to_underlying(ParamLocation::SERVICE_TIME): {
			_serviceTime = substr;
			if (!substr.empty() && substr != RuleParamConstant::ALL) {
				_serviceTimeMinutes = TimeUtils::hhmmToMinutes(substr);
			}
			break;
		}
		default:
			Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
		}
	}
}

void FlightOperationTimeForCcConfigParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);

	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headerValue;
	for (auto iter = parameter.begin(); iter != parameter.end(); iter++) {
		header = iter->first;
		headerValue = iter->second;

		if (header == "FLIGHT NUMBERS") {
			_flightNumbers = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _flightNumberList);
			}
		} else if (header == "FLEETS") {
			_fleets = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _fleetList);
			}
		} else if (header == "TAKE OFF TIME") {
			_takeOffTime = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_takeOffTimeMinutes = TimeUtils::hhmmToMinutes(headerValue);
			}
		} else if (header == "LANDING TIME") {
			_landingTime = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_landingTimeMinutes = TimeUtils::hhmmToMinutes(headerValue);
			}
		} else if (header == "SERVICE TIME") {
			_serviceTime = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				_serviceTimeMinutes = TimeUtils::hhmmToMinutes(headerValue);
			}
		} else {
			spdlog::critical("Rule Param parsing error at rule:7029, cannot parse header:{}", header);
		}
	}
}

bool FlightOperationTimeForCcConfigParam::MatchFlightNumber(const std::string& flightNumber) const {
	if (_flightNumberList.empty()) {
		return true;
	}
	return std::find(_flightNumberList.begin(), _flightNumberList.end(), flightNumber) != _flightNumberList.end();
}

bool FlightOperationTimeForCcConfigParam::MatchFleet(const std::string& fleet) const {
	if (_fleetList.empty()) {
		return true;
	}
	return std::find(_fleetList.begin(), _fleetList.end(), fleet) != _fleetList.end();
}

bool FlightOperationTimeForCcConfigParam::MatchParam(const Segment* segment) const {

	if (!MatchFlightNumber(segment->getFlightNumber())) {
		return false;
	} 
	
	if (!MatchFleet(segment->getFleetCD())) {
		return false;
	}

	return true;
}