/**
 * @file CheckDaysOffDefinitionFor5JRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "CheckDaysOffDefinitionFor5JRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckDaysOffDefinitionFor5JRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::UNAVAILABLE_ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _unavailableAssignmentGroups);
					_unavailableAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::UNAVAILABLE_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _unavailableAssignments);
					_unavailableAssignmentsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::HOME_BASE): {
				if (substr != RuleParamConstant::ALL) {
					_homeBase = substr;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::INCLUDE_BLANK_DAY): {
				if (substr != RuleParamConstant::ALL) {
					_includeBlankDay = substr;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::INCLUDE_LAYOVER_REST): {
				if (substr != RuleParamConstant::ALL) {
					_includeLayoverRest = substr;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::INCLUDE_PAIRING_BASE_REST): {
				if (substr != RuleParamConstant::ALL) {
					_includePairingBaseRest = substr;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DAYS_OFF_ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _daysOffAssignmentGroups);
					_daysOffAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DAYS_OFF_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _daysOffAssignments);
					_daysOffAssignmentsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CHECK_PERIOD): {
				if (substr != RuleParamConstant::ALL) {
					_checkPeriod = stoi(substr);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CHECK_MODE): {
				if (substr != RuleParamConstant::ALL) {
					_checkMode = substr;
				}
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CheckDaysOffDefinitionFor5JRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "UNAVAILABLE ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _unavailableAssignmentGroups);
				_unavailableAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "UNAVAILABLE ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _unavailableAssignments);
				_unavailableAssignmentsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "HOME BASE") {
			if (headeValue != RuleParamConstant::ALL) {
				_homeBase = headeValue;
			}
		}
		else if (header == "INCLUDE BLANK DAY") {
			if (headeValue != RuleParamConstant::ALL) {
				_includeBlankDay = headeValue;
			}
		}
		else if (header == "INCLUDE LAYOVER REST") {
			if (headeValue != RuleParamConstant::ALL) {
				_includeLayoverRest = headeValue;
			}
		}
		else if (header == "INCLUDE PAIRING BASE REST") {
			if (headeValue != RuleParamConstant::ALL) {
				_includePairingBaseRest = headeValue;
			}
		}
		else if (header == "DAYS OFF ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _daysOffAssignmentGroups);
				_daysOffAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "DAYS OFF ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _daysOffAssignments);
				_daysOffAssignmentsMatch.SetExpression(headeValue, this->GetRule());
			}

		}
		else if (header == "CHECK PERIOD") {
			if (headeValue != RuleParamConstant::ALL) {
				_checkPeriod = stoi(headeValue);
			}
		}
		else if (header == "CHECK MODE") {
			if (headeValue != RuleParamConstant::ALL) {
				_checkMode = headeValue;
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckDaysOffDefinitionFor5JRuleParam::MatchDoAssignment(const Activity* activity) const {
	if (!_daysOffAssignmentGroupsMatch.Match(*activity)) {
		return false;
	}
	if (!_daysOffAssignmentsMatch.Match(*activity)) {
		return false;
	}
	return true;
}

bool CheckDaysOffDefinitionFor5JRuleParam::MatchDaysOff(const time_t restStart, const time_t restEnd) const {
	return true;
}

int CheckDaysOffDefinitionFor5JRuleParam::GetUnavailableDaysByRosters(const std::vector<const ROSTER*> rosters, const time_t start, const time_t end, const std::shared_ptr<CrewDataContext>& dbData) const {
	vector<string> unavailableAssignments;
	if (!_unavailableAssignments.empty() && _unavailableAssignments[0] != "*")
		unavailableAssignments = _unavailableAssignments;

	if (!_unavailableAssignmentGroups.empty() && _unavailableAssignmentGroups[0] != "*") {
		for (const auto& group : _unavailableAssignmentGroups) {
			const auto& assignments = dbData->getAssignmentsInGroup(group);
			unavailableAssignments.insert(unavailableAssignments.end(), assignments.begin(), assignments.end());
		}
	}

	// CheckDaysOffFor5JRule 传入的 start/end 为基地本地时间；GetRosterDaysByAssignmentInRange 内部用
	// roster/duty 的 UTC 活动时间 + CrewBaseOffsetMinutes 换算到与 start/end 同一日历轴后再按天计数。
	// 传 0 会把 UTC 当日边界与本地检查窗错位，导致 Unavailable 天数统计偏差。
	int crewBaseOffsetMinutes = 0;
	if (!rosters.empty() && dbData != nullptr) {
		const string& crewId = rosters.front()->idcrew;

		// 方案 A：以检查区间起点为“当前”参考。start 为本地时刻，先借场景起点 UTC 的基地偏移做 bootstrap，
		// 将 start 近似换算为 UTC，再按该 UTC 查当时生效的 crew_base 偏移（支持检查期内换基地）。
		const int bootstrapOffsetMinutes = dbData->getCrewBaseOffsetMinutes(crewId, dbData->scenario.startDtUTC);
		const time_t checkStartUtc = static_cast<time_t>(start) - static_cast<time_t>(bootstrapOffsetMinutes) * 60;
		crewBaseOffsetMinutes = dbData->getCrewBaseOffsetMinutes(crewId, checkStartUtc);
	}

	return RosterUtils::GetRosterDaysByAssignmentInRange(rosters, unavailableAssignments, start, end, crewBaseOffsetMinutes);
}