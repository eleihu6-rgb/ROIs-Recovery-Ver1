/**
 * @file CheckAllowedMultiSectorDutyForFreighterForSQRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-12-12
**/


#include <sstream>
#include <map>
#include <algorithm>
#include <functional>
#include <limits>
#include "spdlog/spdlog.h"
#include "CheckAllowedMultiSectorDutyForFreighterForSQRuleParam.h"
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

string NormalizeScopeToken(const string& value) {
	return strToUpper(trim(value));
}

int ParseSegmentCountBound(const std::string& value, int wildcardValue) {
	const std::string normalized = trim(value);
	if (normalized.empty() || normalized == RuleParamConstant::ALL) {
		return wildcardValue;
	}
	return stoi(normalized);
}

void ParseSegmentNumberRange(const std::string& value, int& lower, int& upper) {
	const std::string normalized = trim(value);
	if (normalized.empty() || normalized == RuleParamConstant::ALL) {
		return;
	}

	const auto dashPos = normalized.find('-');
	if (dashPos == std::string::npos) {
		const int exactCount = stoi(normalized);
		lower = exactCount;
		upper = exactCount;
		return;
	}

	lower = ParseSegmentCountBound(normalized.substr(0, dashPos), 0);
	upper = ParseSegmentCountBound(normalized.substr(dashPos + 1), std::numeric_limits<int>::max());
}

bool IsPureOperatingDuty(const Duty* duty) {
	if (duty == nullptr || duty->getSegmentsRead().empty()) {
		return false;
	}

	for (const auto& seg : duty->getSegmentsRead()) {
		if (!seg->getIsOperating()) {
			return false;
		}
	}
	return true;
}

bool IsPurePositionDuty(const Duty* duty) {
	if (duty == nullptr || duty->getSegmentsRead().empty()) {
		return false;
	}

	for (const auto& seg : duty->getSegmentsRead()) {
		if (seg->getIsOperating()) {
			return false;
		}
	}
	return true;
}

std::vector<std::string> SplitRouteTokens(const std::string& route) {
	std::vector<std::string> tokens;
	std::stringstream ss(route);
	std::string token;
	while (std::getline(ss, token, '-')) {
		tokens.emplace_back(trim(token));
	}
	return tokens;
}

bool RoutePatternMatches(const std::string& pattern, const std::string& route) {
	if (pattern == RuleParamConstant::ALL) {
		return true;
	}
	if (pattern.find('*') == std::string::npos) {
		return pattern == route;
	}

	const auto patternTokens = SplitRouteTokens(pattern);
	const auto routeTokens = SplitRouteTokens(route);
	std::map<std::pair<std::size_t, std::size_t>, bool> memo;

	std::function<bool(std::size_t, std::size_t)> match = [&](std::size_t patternIndex, std::size_t routeIndex) -> bool {
		const auto key = std::make_pair(patternIndex, routeIndex);
		if (const auto iter = memo.find(key); iter != memo.end()) {
			return iter->second;
		}
		if (patternIndex == patternTokens.size()) {
			return memo[key] = (routeIndex == routeTokens.size());
		}

		const auto& patternToken = patternTokens[patternIndex];
		if (patternToken == RuleParamConstant::ALL) {
			if (match(patternIndex + 1, routeIndex)) {
				return memo[key] = true;
			}
			return memo[key] = (routeIndex < routeTokens.size() && match(patternIndex, routeIndex + 1));
		}

		return memo[key] = (routeIndex < routeTokens.size() &&
			patternToken == routeTokens[routeIndex] &&
			match(patternIndex + 1, routeIndex + 1));
	};

	return match(0, 0);
}

}  // namespace

void CheckAllowedMultiSectorDutyForFreighterForSQRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::SERVICE_TYPE): {
				if (substr != RuleParamConstant::ALL) {
					_serviceType = substr;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_NUMBER_IN_DUTY): {
				if (substr != RuleParamConstant::ALL) {
					_segmentNumberInDuty = substr;
					ParseSegmentNumberRange(substr, _segmentNumberInDutyStart, _segmentNumberInDutyEnd);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ALLOWED_SECTORS): {
				split(substr, '|', _allowedSectors);
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENT): {
				ParseDutyAssignmentScope(substr);
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CheckAllowedMultiSectorDutyForFreighterForSQRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Birthday Assignments,Days Off Before Birthday,Days Off After Birthday,Latest End Time,Earliest Start Time
		if (header == "FLIGHT TYPE" || header == "SERVICE TYPE") {
			if (headeValue != RuleParamConstant::ALL) {
				_serviceType = headeValue;
			}
		}
		else if (header == "SEGMENT NUMBER IN DUTY") {
			if (headeValue != RuleParamConstant::ALL) {
				_segmentNumberInDuty = headeValue;
				ParseSegmentNumberRange(headeValue, _segmentNumberInDutyStart, _segmentNumberInDutyEnd);
			}
		}
		else if (header == "ALLOWED SECTORS") {
			split(headeValue, '|', _allowedSectors);
		}
		else if (header == "DUTY OPERATING TYPE") {
			ParseDutyAssignmentScope(headeValue);
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

void CheckAllowedMultiSectorDutyForFreighterForSQRuleParam::ParseDutyAssignmentScope(const std::string& value) {
	const string scope = NormalizeScopeToken(value);
	if (scope.empty() || scope == "*" || scope == RuleParamConstant::ALL) {
		_dutyAssignmentScope = DutyAssignmentScope::ANY;
		_dutyAssignmentScopeRaw = "ANY";
		return;
	}

	if (scope == "FLY") {
		_dutyAssignmentScope = DutyAssignmentScope::FLY;
		_dutyAssignmentScopeRaw = "FLY";
		return;
	}

	Logger::getRuleLogger()->warn("Rule 7462 duty operating type not recognized or unsupported: {}, fallback to ANY", value);
	_dutyAssignmentScope = DutyAssignmentScope::ANY;
	_dutyAssignmentScopeRaw = "ANY";
}

bool CheckAllowedMultiSectorDutyForFreighterForSQRuleParam::MatchServiceType(const Duty* duty) const {
	if (duty == nullptr) {
		return false;
	}

	if (_serviceType.empty() || _serviceType == "*")
		return true;

	const auto & segments = duty->getSegmentsRead();
	if (segments.empty())
		return false;

	for (const auto& seg : segments) {
		if (seg->getIsOperating() && seg->getServiceType() == _serviceType) {
			return true;
		}
	}
	return false;
}

bool CheckAllowedMultiSectorDutyForFreighterForSQRuleParam::MatchDutyAssignment(const Duty* duty) const {
	if (duty == nullptr || duty->getSegmentsRead().empty()) {
		return false;
	}

	switch (_dutyAssignmentScope) {
	case DutyAssignmentScope::FLY:
		return IsPureOperatingDuty(duty);
	case DutyAssignmentScope::ANY:
	default:
		return true;
	}
}

bool CheckAllowedMultiSectorDutyForFreighterForSQRuleParam::MatchSegmentNumber(const Duty* duty) const {
	const auto& count = duty->getSegmentsRead().size();

	if (_segmentNumberInDuty.empty() || _segmentNumberInDuty == "*")
		return true;

	return count >= _segmentNumberInDutyStart && count <= _segmentNumberInDutyEnd;
}

bool CheckAllowedMultiSectorDutyForFreighterForSQRuleParam::CheckAllowedSectors(const string route) const {
	bool invalid = true;

	if (_allowedSectors.empty() || _allowedSectors[0].empty()) {
		return invalid;
	}

	if (_allowedSectors[0] == "*") {
		invalid = false;
		return invalid;
	}

	for (const auto& allowedSector : _allowedSectors) {
		if (RoutePatternMatches(allowedSector, route)) {
			invalid = false;
			break;
		}
	}

	return invalid;
}

bool CheckAllowedMultiSectorDutyForFreighterForSQRuleParam::IsDutyPatternAllowed(const Duty* duty) const {
	if (duty == nullptr || duty->getSegmentsRead().empty()) {
		return false;
	}

	return !CheckAllowedSectors(GetDutyRoute(duty));
}

std::string CheckAllowedMultiSectorDutyForFreighterForSQRuleParam::GetDutyRoute(const Duty* duty) const {
	const auto& segments = duty->getSegmentsRead();

	string route = "";
	for (size_t i = 0; i < segments.size(); i++) {
		route += segments[i]->getDepStation() + "-";

		if (i == segments.size() - 1) {
			route += segments[i]->getArrStation();
		}
	}

	return route;
}
