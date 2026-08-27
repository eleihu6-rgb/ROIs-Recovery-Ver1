/**
 * @file CheckStandbyCalloutDurationFor5JRuleParam.cpp
 * @brief
 * @author OpenAI
 * @version 1.0
 * @date 2026-05-21
**/

#include <algorithm>
#include <map>
#include <sstream>
#include "CheckStandbyCalloutDurationFor5JRuleParam.h"
#include "RuleParams.h"
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

void splitAndNormalize(const string& value, vector<string>& results) {
	split(value, '|', results);
	for (auto& result : results) {
		result = normalizeToken(result);
	}
	results.erase(remove_if(results.begin(), results.end(), [](const string& item) {
		return item.empty();
	}), results.end());
}
}

void CheckStandbyCalloutDurationFor5JRuleParam::ParseParam(const std::string& paramString) {
	stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		string substr;
		getline(ss, substr, delimInParam);
		substr = normalizeToken(substr);
		if (substr.empty()) {
			continue;
		}

		switch (i) {
		case enum_to_underlying(ParamLocation::STANDBY_ASSIGNMENT_GROUPS): {
			_standbyAssignmentGroups = substr;
			_standbyAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
			break;
		}
		case enum_to_underlying(ParamLocation::CALL_OUT_ASSIGNMENTS): {
			if (substr != RuleParamConstant::ALL) {
				splitAndNormalize(substr, _callOutAssignments);
			}
			break;
		}
		case enum_to_underlying(ParamLocation::COMBINED): {
			_combinedType = strToUpper(substr);
			break;
		}
		case enum_to_underlying(ParamLocation::MAX_DURATION): {
			_maxDuration = substr;
			if (substr != RuleParamConstant::ALL && isHHmm(substr.c_str())) {
				_maxDurationMinutes = TimeUtils::hhmmToMinutes(substr);
			}
			break;
		}
		default:
			Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
		}
	}
}

void CheckStandbyCalloutDurationFor5JRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
		const string header = normalizeToken(iter->first);
		const string value = normalizeToken(iter->second);

		if (header == "STANDBY ASSIGNMENT GROUPS") {
			_standbyAssignmentGroups = value;
			_standbyAssignmentGroupsMatch.SetExpression(value, this->GetRule());
		}
		else if (header == "CALL OUT ASSIGNMENTS") {
			if (!value.empty() && value != RuleParamConstant::ALL) {
				splitAndNormalize(value, _callOutAssignments);
			}
		}
		else if (header == "COMBINED" || header == "COMBINED(DP/FDP)") {
			_combinedType = strToUpper(value);
		}
		else if (header == "MAX DURATION") {
			_maxDuration = value;
			if (!value.empty() && value != RuleParamConstant::ALL && isHHmm(value.c_str())) {
				_maxDurationMinutes = TimeUtils::hhmmToMinutes(value);
			}
		}
		else {
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
		}
	}
}

bool CheckStandbyCalloutDurationFor5JRuleParam::MatchStandbyAssignmentGroups(const ROSTER* roster) const {
	if (_standbyAssignmentGroups.empty() || _standbyAssignmentGroups == RuleParamConstant::ALL) {
		return true;
	}

	return roster != nullptr && _standbyAssignmentGroupsMatch.Match(*roster);
}

bool CheckStandbyCalloutDurationFor5JRuleParam::MatchCallOutAssignments(const string& assignment) const {
	if (_callOutAssignments.empty()) {
		return true;
	}

	string normalizedAssignment = assignment;
	normalizedAssignment = normalizeToken(normalizedAssignment);
	return find(_callOutAssignments.begin(), _callOutAssignments.end(), normalizedAssignment) != _callOutAssignments.end();
}

bool CheckStandbyCalloutDurationFor5JRuleParam::MatchMergedStandbyCallout(const ROSTER* standbyRoster, const ROSTER* flyRoster) const {
	if (standbyRoster == nullptr || flyRoster == nullptr || flyRoster->pairing == nullptr || flyRoster->getDutyNums() == 0) {
		return false;
	}
	int gap = static_cast<long>(flyRoster->actStrUtc - standbyRoster->actRestStrUtc);
	return gap < 5*60;//gap小于5分钟（包含重叠,gap小于0），认为存在抓飞
}

bool CheckStandbyCalloutDurationFor5JRuleParam::CheckMaxDuration(const ROSTER* standbyRoster, const ROSTER* flyRoster) const {
	if (_maxDuration.empty() || _maxDuration == RuleParamConstant::ALL) {
		return true;
	}

	if (standbyRoster == nullptr || flyRoster == nullptr || flyRoster->pairing == nullptr || flyRoster->pairing->getFirstDuty() == nullptr) {
		return false;
	}

	const time_t standbyStart = standbyRoster->getStartTimeUtcAct();
	time_t dutyEnd = 0;

	auto firstDuty = flyRoster->pairing->getFirstDuty();
	if (firstDuty == nullptr) {
		return true;
	}

	if (_combinedType == "FDP") {
		// CMSCEB-1283 【BUG】【RULE 7387】当设置Combine Type为FDP时，应该按照FDP合并而不是DP
		if (firstDuty->getLastFlySegment() == nullptr) {
			dutyEnd = firstDuty->getStartTimeUtcAct();
		}
		else {
			dutyEnd = firstDuty->getLastFlySegment()->getEndTimeUtcAct();
		}
	}
	else {
		//_combinedType == "DP"
		dutyEnd = firstDuty->getEndTimeUtcAct();
	}

	this->GetRule()->getRuleViolation().SetParam("dutyEnd", to_string(dutyEnd));
	const time_t duration = dutyEnd - standbyStart;

	return duration <= static_cast<time_t>(_maxDurationMinutes) * 60;
}
