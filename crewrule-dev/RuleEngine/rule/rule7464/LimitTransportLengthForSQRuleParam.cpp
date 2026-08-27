/**
 * @file LimitTransportLengthForSQRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-17
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "LimitTransportLengthForSQRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"

using namespace std;

void LimitTransportLengthForSQRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::SERVICE_TYPE): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _serviceTypes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEET_GROUP): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _fleetGroups);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_FLAGS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightFlags);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_ASSIGNMENTS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _flightAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::EXCEPTION_FLIGHT_ROUTES): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _exceptionFlightRoutes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_TRANSPORT_LENGTH): {
				_maxTransportLength = substr;
				_maxTransportLengthMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY): {
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LimitTransportLengthForSQRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Flight Flags,Flight Assignments,Exception Flight Routes,Max Transport Length
		if (header == "SERVICE TYPE") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _serviceTypes);
			}
		}
		else if (header == "FLEET GROUP") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _fleetGroups);
			}
		}
		else if (header == "FLIGHT FLAGS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightFlags);
			}
		}
		else if (header == "FLIGHT ASSIGNMENTS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _flightAssignments);
			}
		}
		else if (header == "EXCEPTION FLIGHT ROUTES") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _exceptionFlightRoutes);
			}
		}
		else if (header == "MAX TRANSPORT LENGTH") {
			_maxTransportLength = headeValue;
			_maxTransportLengthMinutes = TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//匹配规则参数是否满足
bool LimitTransportLengthForSQRuleParam::MatchParam(const Segment* segment) const {
	if (!MatchFlightFlags(segment)) {
		return false;
	}

	if (!MatchFlightAssignments(segment)) {
		return false;
	}

	return true;
}

bool LimitTransportLengthForSQRuleParam::MatchDuty(const Duty* duty) const {
	if (_serviceTypes.empty() && _fleetGroups.empty()) {
		return true;
	}
	if (duty == nullptr) {
		return false;
	}

	if (!_serviceTypes.empty()) {
		bool sawOperating = false;
		bool matched = false;
		for (const auto* seg : duty->getSegmentsRead()) {
			if (seg == nullptr) {
				continue;
			}
			std::string serviceType = seg->getServiceType();
			if (serviceType.empty()) {
				serviceType = seg->getFltType();
			}
			if (seg->getIsOperating()) {
				sawOperating = true;
				if (std::find(_serviceTypes.begin(), _serviceTypes.end(), serviceType) != _serviceTypes.end()) {
					matched = true;
					break;
				}
			}
		}
		if (!matched && !sawOperating) {
			for (const auto* seg : duty->getSegmentsRead()) {
				if (seg == nullptr) {
					continue;
				}
				std::string serviceType = seg->getServiceType();
				if (serviceType.empty()) {
					serviceType = seg->getFltType();
				}
				if (std::find(_serviceTypes.begin(), _serviceTypes.end(), serviceType) != _serviceTypes.end()) {
					matched = true;
					break;
				}
			}
		}
		if (!matched) {
			return false;
		}
	}

	if (!_fleetGroups.empty()) {
		const auto& dbData = this->GetRule()->GetDataContext();
		if (!dbData) {
			return false;
		}
		bool sawFleet = false;
		bool matched = false;
		for (const auto* seg : duty->getSegmentsRead()) {
			if (seg == nullptr) {
				continue;
			}
			const std::string fleet = seg->getFleetCD();
			if (fleet.empty()) {
				continue;
			}
			const auto it = dbData->fleetMap.find(fleet);
			if (it == dbData->fleetMap.end()) {
				continue;
			}
			sawFleet = true;
			if (std::find(_fleetGroups.begin(), _fleetGroups.end(), it->second.fleetGrp) != _fleetGroups.end()) {
				matched = true;
				break;
			}
		}
		if (!matched || !sawFleet) {
			return false;
		}
	}

	return true;
}

bool LimitTransportLengthForSQRuleParam::IsAllowedFlightRoute(const Segment* segment) const {
	if (_exceptionFlightRoutes.empty()) {
		return true;
	}
	string route = segment->getDepStationRead() + "-" + segment->getArrStationRead();
	return std::find(_exceptionFlightRoutes.begin(), _exceptionFlightRoutes.end(), route) != _exceptionFlightRoutes.end();
}

bool LimitTransportLengthForSQRuleParam::MatchFlightFlags(const Segment* segment) const {
	if (_flightFlags.empty()) {
		return true;
	}
	return std::find(_flightFlags.begin(), _flightFlags.end(), segment->getFlightFlag()) != _flightFlags.end();
}

bool LimitTransportLengthForSQRuleParam::MatchFlightAssignments(const Segment* segment) const {
	if (_flightAssignments.empty()) {
		return true;
	}
	return std::find(_flightAssignments.begin(), _flightAssignments.end(), segment->getAssignment()) != _flightAssignments.end();
}
