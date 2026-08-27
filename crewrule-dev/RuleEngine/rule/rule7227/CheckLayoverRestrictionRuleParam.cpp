/**
 * @file CheckLayoverRestrictionRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "Utility.h"
#include "StringUtil.h"
#include "spdlog/spdlog.h"
#include "CheckLayoverRestrictionRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"

using namespace std;

namespace {

bool IsAnyValue(const std::string& value) {
	const std::string normalized = trim(value);
	return normalized.empty() ||
		normalized == RuleParamConstant::ALL ||
		normalized == RuleParamConstant::IGNORED ||
		normalized == RuleParamConstant::IGNORED_2;
}

std::string NormalizeUpper(const std::string& value) {
	return strToUpper(trim(value));
}

}

void CheckLayoverRestrictionRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_BASE):
				_pairingBase = substr;
				break;
			case enum_to_underlying(ParamLocation::ASSIGNMENTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				break;
			case enum_to_underlying(ParamLocation::AIRLINE_CODE):
				_airlineCode = substr;
				break;
			case enum_to_underlying(ParamLocation::FLIGHT_FLEETS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _flightFleets);
				}
				break;
			case enum_to_underlying(ParamLocation::FLIGHT_NUMBERS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _flightNumbers);
				}
				break;
			case enum_to_underlying(ParamLocation::DEPS):
				ParseAirportPattern(substr, _deps, _depsRaw, _depsPattern);
				break;
			case enum_to_underlying(ParamLocation::ARVS):
				ParseAirportPattern(substr, _arvs, _arvsRaw, _arvsPattern);
				break;
			case enum_to_underlying(ParamLocation::START_DATE):
				_startDate = substr;
				break;
			case enum_to_underlying(ParamLocation::END_DATE):
				_endDate = substr;
				break;
			case enum_to_underlying(ParamLocation::FORCE_LAYOVER):
				_forceLayover = substr;
				break;
			case enum_to_underlying(ParamLocation::FORCE_NOT_LAYOVER):
				_forceNotLayover = substr;
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CheckLayoverRestrictionRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "PAIRING BASE") {
			_pairingBase = headeValue;
		}
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "AIRLINE CODE") {
			_airlineCode = headeValue;
		}
		else if (header == "FLIGHT FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightFleets);
			}
		}
		else if (header == "FLIGHT NUMBERS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightNumbers);
			}
		}
		else if (header == "DEPS") {
			ParseAirportPattern(headeValue, _deps, _depsRaw, _depsPattern);
		}
		else if (header == "ARVS") {
			ParseAirportPattern(headeValue, _arvs, _arvsRaw, _arvsPattern);
		}
		else if (header == "START DATE") {
			_startDate = headeValue;
		}
		else if (header == "END DATE") {
			_endDate = headeValue;
		}
		else if (header == "FORCE LAYOVER") {
			_forceLayover = headeValue;
		}
		else if (header == "FORCE NOT LAYOVER") {
			_forceNotLayover = headeValue;
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

void CheckLayoverRestrictionRuleParam::ParseAirportPattern(const std::string& value,
	std::vector<std::string>& plainValues,
	std::string& rawValue,
	AirportPattern& pattern) {
	rawValue = trim(value);
	plainValues.clear();
	pattern = AirportPattern{};
	if (IsAnyValue(rawValue)) {
		return;
	}

	std::string expression = rawValue;
	std::string excludedText;
	if (StringUtils::unwrapExcludedText(expression, excludedText)) {
		pattern.isNegated = true;
		expression = excludedText;
	}

	std::vector<std::string> tokens;
	split(expression, '|', tokens);
	for (const auto& token : tokens) {
		const std::string normalized = NormalizeUpper(token);
		if (normalized.empty() || normalized == RuleParamConstant::ALL) {
			continue;
		}
		plainValues.push_back(normalized);
		pattern.values.push_back(normalized);
	}

	if (!pattern.values.empty()) {
		pattern.allowAny = false;
	}
	else {
		pattern = AirportPattern{};
	}
}

bool CheckLayoverRestrictionRuleParam::AirportPattern::Matches(const std::string& airport) const {
	if (allowAny) {
		return true;
	}
	const bool contains = std::find(values.cbegin(), values.cend(), airport) != values.cend();
	return isNegated ? !contains : contains;
}



bool CheckLayoverRestrictionRuleParam::MatchParam(const Segment* segment) const {

	if (_assignments.size() > 0 && _assignments[0] != "*" && find(_assignments.begin(), _assignments.end(), segment->getAssignment()) == _assignments.end())
		return false;
	if (_airlineCode != "*" && _airlineCode != segment->getAirline())
		return false;
	if (_flightFleets.size() > 0 && _flightFleets[0] != "*" && find(_flightFleets.begin(), _flightFleets.end(), segment->getFleetCD()) == _flightFleets.end())
		return false;
	if (_flightNumbers.size() > 0 && _flightNumbers[0] != "*" && find(_flightNumbers.begin(), _flightNumbers.end(), segment->getFlightNumber()) == _flightNumbers.end())
		return false;
	if (!MatchDepStation(segment->getDepStation()))
		return false;
	if (!MatchArvStation(segment->getArrStation()))
		return false;
	if (_startDate != "*" || _endDate != "*") {
		if (!TimeUtils::isTimeInMonthDayRange(segment->getStartTimeLocAct(), _startDate, _endDate))
			return false;
	}
	


	return true;
}

bool CheckLayoverRestrictionRuleParam::MatchDepStation(const std::string& depStation) const {
	return _depsPattern.Matches(depStation);
}

bool CheckLayoverRestrictionRuleParam::MatchArvStation(const std::string& arrStation) const {
	return _arvsPattern.Matches(arrStation);
}

bool CheckLayoverRestrictionRuleParam::HasDepConstraint() const {
	return !_depsPattern.allowAny;
}

bool CheckLayoverRestrictionRuleParam::HasArvConstraint() const {
	return !_arvsPattern.allowAny;
}
