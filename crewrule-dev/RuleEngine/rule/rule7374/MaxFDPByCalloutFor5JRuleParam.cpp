/**
 * @file MaxFDPByCalloutFor5JRuleParam.cpp
 * @brief
 * @author OpenAI
 * @version 1.0
 * @date 2026-05-28
**/

#include <algorithm>
#include <map>
#include <sstream>
#include "MaxFDPByCalloutFor5JRuleParam.h"
#include "StringUtil.h"
#include "UtilFunc.h"
#include "../utils/TimeUtils.h"
#include "spdlog/spdlog.h"

using namespace std;

namespace {
string normalizeToken(string value) {
	trim(value);
	return strToUpper(value);
}

bool parseTimeRange(const string& value, int& startMinutes, int& endMinutes) {
	vector<string> splitstrs;
	split(value, '-', splitstrs);
	if (splitstrs.size() != 2) {
		return false;
	}

	startMinutes = TimeUtils::hhmmToMinutes(splitstrs[0]);
	endMinutes = TimeUtils::hhmmToMinutes(splitstrs[1]);
	return startMinutes >= 0 && endMinutes >= 0;
}
}

void MaxFDPByCalloutFor5JRuleParam::ParseParam(const std::string& paramString) {
	stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		string substr;
		getline(ss, substr, delimInParam);
		substr = normalizeToken(substr);
		if (substr.empty()) {
			continue;
		}

		switch (i) {
		case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS):
			_assignmentGroups = substr;
			_assignmentGroupsMatch.SetExpression(substr, this->GetRule());
			break;
		case enum_to_underlying(ParamLocation::STANDBY_START_RANGE):
			_standbyStartRange = substr;
			if (!parseTimeRange(substr, _standbyStartRangeStartMinutes, _standbyStartRangeEndMinutes)) {
				Logger::getRuleLogger()->error("Rule {} standby start range parse failed: {}", RuleFuncId, substr);
			}
			break;
		case enum_to_underlying(ParamLocation::STANDBY_OVERLAP_RANGE):
			_standbyOverlapRange = substr;
			if (!parseTimeRange(substr, _standbyOverlapRangeStartMinutes, _standbyOverlapRangeEndMinutes)) {
				Logger::getRuleLogger()->error("Rule {} standby overlap range parse failed: {}", RuleFuncId, substr);
			}
			break;
		case enum_to_underlying(ParamLocation::STANDBY_LENGTH_THRESHOLD):
			_standbyLengthThreshold = substr;
			_standbyLengthThresholdMinutes = TimeUtils::hhmmToMinutes(substr);
			break;
		default:
			Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			break;
		}
	}
}

void MaxFDPByCalloutFor5JRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
		const string header = normalizeToken(iter->first);
		const string value = normalizeToken(iter->second);

		if (header == "ASSIGNMENT GROUPS") {
			_assignmentGroups = value;
			_assignmentGroupsMatch.SetExpression(value, this->GetRule());
		}
		else if (header == "STANDBY START RANGE") {
			_standbyStartRange = value;
			if (!parseTimeRange(value, _standbyStartRangeStartMinutes, _standbyStartRangeEndMinutes)) {
				Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, invalid standby start range: {}", dbRule.idRule, dbRule.idRuleParam, value);
			}
		}
		else if (header == "STANDBY OVERLAP RANGE") {
			_standbyOverlapRange = value;
			if (!parseTimeRange(value, _standbyOverlapRangeStartMinutes, _standbyOverlapRangeEndMinutes)) {
				Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, invalid standby overlap range: {}", dbRule.idRule, dbRule.idRuleParam, value);
			}
		}
		else if (header == "STANDBY LENGTH THRESHOLD") {
			_standbyLengthThreshold = value;
			_standbyLengthThresholdMinutes = TimeUtils::hhmmToMinutes(value);
		}
		else {
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
		}
	}
}

bool MaxFDPByCalloutFor5JRuleParam::MatchAssignmentGroup(const ROSTER* standbyRoster) const {
	if (_assignmentGroups.empty()) {
		return true;
	}

	return standbyRoster != nullptr && _assignmentGroupsMatch.Match(*standbyRoster);
}

bool MaxFDPByCalloutFor5JRuleParam::ShouldIgnoreOverlapByStandbyStart(const ROSTER* standbyRoster) const {
	if (standbyRoster == nullptr || _standbyStartRangeStartMinutes < 0 || _standbyStartRangeEndMinutes < 0) {
		return false;
	}

	return TimeUtils::IsTimesInRange(standbyRoster->getStartTimeLocAct(),
		_standbyStartRangeStartMinutes,
		_standbyStartRangeEndMinutes);
}

bool MaxFDPByCalloutFor5JRuleParam::MatchParam(const ROSTER* standbyRoster, const ROSTER* flyRoster, const Duty& duty) const {
	if (standbyRoster == nullptr || flyRoster == nullptr) {
		return false;
	}

	if (!MatchAssignmentGroup(standbyRoster)) {
		return false;
	}

	if (flyRoster->callinSBY_FDPMins <= 0) {
		return false;
	}

	return _standbyLengthThresholdMinutes >= 0;
}
