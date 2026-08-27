/**
 * @file GroundRosterMinRestFor5JRuleParam.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-05-18
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "spdlog/spdlog.h"
#include "GroundRosterMinRestFor5JRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void GroundRosterMinRestFor5JRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignmentGroups);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_REST): {
				_minRest = substr;
				_minRestMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void GroundRosterMinRestFor5JRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroups);
			}
		}
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "MIN REST") {
			_minRest = headeValue;
			_minRestMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool GroundRosterMinRestFor5JRuleParam::MatchGroundAssignments(const ROSTER& roster) const {
	if (_assignments.empty()) {
		return true;
	}
	string assignment = roster.qualifier;
	auto iter = std::find(_assignments.cbegin(), _assignments.cend(), assignment);
	return iter != _assignments.cend();
}

bool GroundRosterMinRestFor5JRuleParam::MatchWorkAssignment(const ROSTER& roster) const {
	auto& dbData = this->GetRule()->GetDataContext();
	auto iter = dbData->assignmentNameMap.find(roster.qualifier);
	if (iter != dbData->assignmentNameMap.end()) {
		auto& assignment = iter->second;
		//Assignment Code Type 只要是W, S, T，且DP pct>0 (代表有DP值),法规才计算最小休息时间（主要通过Assignments配置来控制）
		//若Assignment Code有設置Rest Duration，則該值擁有最優先，覆蓋法規給的計算值（即法规不用计算，使用客户端设置的值）。
		if (assignment != nullptr && assignment->DP_PCT > 0) {
			return true;
		}
	}
	return false;
}

bool GroundRosterMinRestFor5JRuleParam::MatchGroundAssignmentGroups(const ROSTER& roster) const {
	if (_assignmentGroups.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	return dbData->isAssignmentInGroup(roster.qualifier, _assignmentGroups);
}

bool GroundRosterMinRestFor5JRuleParam::MatchParam(const ROSTER& roster) const {
	if (!MatchWorkAssignment(roster)) {
		return false;
	}

	if (!MatchGroundAssignmentGroups(roster)) {
		return false;
	}

	if (!MatchGroundAssignments(roster)) {
		return false;
	}

	return true;
}