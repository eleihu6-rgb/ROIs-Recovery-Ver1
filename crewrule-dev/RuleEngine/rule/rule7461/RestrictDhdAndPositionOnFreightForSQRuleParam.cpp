/**
 * @file RestrictDhdAndPositionOnFreightForSQRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-12-12
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "RestrictDhdAndPositionOnFreightForSQRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

namespace {

std::vector<std::string> parsePipeListUpper(const std::string& raw) {
	std::vector<std::string> result;
	std::vector<std::string> tokens;
	split(trim(raw), '|', tokens);
	for (const auto& token : tokens) {
		const std::string upper = strToUpper(trim(token));
		if (!upper.empty()) {
			result.push_back(upper);
		}
	}
	return result;
}

std::string normalizeUpper(const std::string& raw) {
	return strToUpper(trim(raw));
}

}

void RestrictDhdAndPositionOnFreightForSQRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			const std::string valueUpper = normalizeUpper(substr);
			switch (i) {
			case enum_to_underlying(ParamLocation::IS_HOME_BASE): {
				if (valueUpper != RuleParamConstant::ALL) {
					_isHomeBase = valueUpper;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DEADHEAD_AND_POSITIONING_ASSIGNMENTS): {
				if (valueUpper != RuleParamConstant::ALL) {
					_deadheadAndPositioningAssignments = parsePipeListUpper(substr);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FREIGHT_FLEET_TYPES): {
				if (valueUpper != RuleParamConstant::ALL) {
					_freightFleetTypes = parsePipeListUpper(substr);
				}
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void RestrictDhdAndPositionOnFreightForSQRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = normalizeUpper(iter->first);
		headeValue = trim(iter->second);
		const std::string valueUpper = normalizeUpper(headeValue);
		//Bases,Ranks,Fleets,Teams,Birthday Assignments,Days Off Before Birthday,Days Off After Birthday,Latest End Time,Earliest Start Time
		if (header == "IS HOME BASE") {
			if (valueUpper != RuleParamConstant::ALL) {
				_isHomeBase = valueUpper;
			}
		}
		else if (header == "DEADHEAD AND POSITIONING ASSIGNMENTS") {
			if (valueUpper != RuleParamConstant::ALL) {
				_deadheadAndPositioningAssignments = parsePipeListUpper(headeValue);
			}
		}
		else if (header == "FREIGHT FLEET TYPES") {
			if (valueUpper != RuleParamConstant::ALL) {
				_freightFleetTypes = parsePipeListUpper(headeValue);
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool RestrictDhdAndPositionOnFreightForSQRuleParam::IsFreightFlight(const Segment* segment) const {
	if (segment == nullptr) {
		return false;
	}

	const std::string serviceType = segment->getServiceType();
	if (serviceType == "F") {
		return true;
	}
	if (serviceType == "J") {
		return false;
	}

	if (_freightFleetTypes.empty() || _freightFleetTypes[0].empty() || _freightFleetTypes[0] == "*") {
		return false;
	}

	return find(_freightFleetTypes.begin(), _freightFleetTypes.end(), segment->getFleetCD()) != _freightFleetTypes.end();
}

bool RestrictDhdAndPositionOnFreightForSQRuleParam::IsPassengerFlight(const Segment* segment) const {
	if (segment == nullptr) {
		return false;
	}

	const std::string serviceType = segment->getServiceType();
	if (serviceType == "J") {
		return true;
	}
	if (serviceType == "F") {
		return false;
	}

	return !IsFreightFlight(segment);
}

bool RestrictDhdAndPositionOnFreightForSQRuleParam::MatchHomeBase(bool isAtBase) const {
	if (_isHomeBase == "N") {
		return !isAtBase;
	}
	return isAtBase;
}

bool RestrictDhdAndPositionOnFreightForSQRuleParam::MatchFreightDhdSegment(const Segment* segment) const {
	if (!IsFreightFlight(segment))
		return false;
	if (_deadheadAndPositioningAssignments.empty() || _deadheadAndPositioningAssignments[0].empty() || _deadheadAndPositioningAssignments[0] == "*")
		return true;

	return find(_deadheadAndPositioningAssignments.begin(), _deadheadAndPositioningAssignments.end(), segment->getAssignment()) != _deadheadAndPositioningAssignments.end();
}
