/**
 * @file CheckMinNumberOfDaysOffBasicForPRRuleParam.h
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
#include "CheckMinNumberOfDaysOffBasicForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckMinNumberOfDaysOffBasicForPRRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::LEAVE_ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _leaveAssignmentGroups);
					_leaveAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::LEAVE_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _leaveAssignments);
					_leaveAssignmentsMatch.SetExpression(substr, this->GetRule());
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
			case enum_to_underlying(ParamLocation::LATEST_DEBRIEF_BREFORE_FIRST_DO): {
				_latestDebriefBeforeFirstDOHHmm = substr;
				_latestDebriefBeforeFirstDOHHmmMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::EARLIEST_BRIEF_AFTER_LAST_DO): {
				_earliestBriefAfterLastDOHHmm = substr;
				_earliestBriefAfterLastDOHHmmMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::INCLUDE_BLANK_DAYS): {
				if (substr != RuleParamConstant::ALL) {
					_includeBlankDays = substr == "Y";
				}
			}
			case enum_to_underlying(ParamLocation::DAYS_IN_MONTH): {
				_daysInMonth = substr;
				if (substr != RuleParamConstant::ALL) {
					_daysInMonthInt = stoi(substr);
				}
			}
			case enum_to_underlying(ParamLocation::MAX_CONSECUTIVE_WORKING_DAYS_BTW_DO): {
				if (substr != RuleParamConstant::ALL) {
					_maxConsecutiveWorkingDays = stoi(substr);
				}
			}
			case enum_to_underlying(ParamLocation::SPACING): {
				_spacingStr = substr;
				if (substr != RuleParamConstant::ALL) {
					_spacing = stoi(substr);
				}
			}
			case enum_to_underlying(ParamLocation::COVERED_WEEKENDS): {
				if (substr != RuleParamConstant::ALL) {
					_coverdWeekends = substr == "Y";
				}
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

void CheckMinNumberOfDaysOffBasicForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Birthday Assignments,Days Off Before Birthday,Days Off After Birthday,Latest End Time,Earliest Start Time
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "EXCLUDE TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _excludeTeams);
			}
		}
		else if (header == "LEAVE ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _leaveAssignmentGroups);
				_leaveAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "LEAVE ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _leaveAssignments);
				_leaveAssignmentsMatch.SetExpression(headeValue, this->GetRule());
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
		else if (header == "LATEST DEBRIEF BEFORE FIRST DO") {
			_latestDebriefBeforeFirstDOHHmm = headeValue;
			_latestDebriefBeforeFirstDOHHmmMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "EARLIEST BRIEF AFTER LAST DO") {
			_earliestBriefAfterLastDOHHmm = headeValue;
			_earliestBriefAfterLastDOHHmmMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "INCLUDE BLANK DAYS") {
			if (headeValue != RuleParamConstant::ALL) {
				_includeBlankDays = headeValue == "Y";
			}
		}
		else if (header == "DAYS IN MONTH") {
			if (headeValue != RuleParamConstant::ALL) {
				_daysInMonth = headeValue;
				if (!_daysInMonth.empty() && _daysInMonth != "*") {
					_daysInMonthInt = stoi(headeValue);
				}
			}
		}
		else if (header == "MAX CONSECUTIVE WORKING DAYS BTW DO") {
			if (headeValue != RuleParamConstant::ALL) {
				_maxConsecutiveWorkingDays = stoi(headeValue);
			}
		}
		else if (header == "SPACING") {
			if (headeValue != RuleParamConstant::ALL) {
				_spacingStr = headeValue;
				if (!_spacingStr.empty() && _spacingStr != "*") {
					_spacing = stoi(headeValue);
				}
			}
		}
		else if (header == "COVERD WEEKENDS") {
			if (headeValue != RuleParamConstant::ALL) {
				_coverdWeekends = headeValue == "Y";
			}
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMinNumberOfDaysOffBasicForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return false;

	if (!_excludeTeams.empty() && !_excludeTeams[0].empty() && _excludeTeams[0] != "*" && Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _excludeTeams, positions, checkedStartTime, checkedEndTime))
		return false;
	return true;
}

bool CheckMinNumberOfDaysOffBasicForPRRuleParam::MatchLeaveAssignment(const Activity* activity) const {
	if (!_leaveAssignmentGroupsMatch.Match(*activity)) {
		return false;
	}
	if (!_leaveAssignmentsMatch.Match(*activity)) {
		return false;
	}
	return true;
}

bool CheckMinNumberOfDaysOffBasicForPRRuleParam::MatchDoAssignment(const Activity* activity) const {
	if (!_daysOffAssignmentGroupsMatch.Match(*activity)) {
		return false;
	}
	if (!_daysOffAssignmentsMatch.Match(*activity)) {
		return false;
	}
	return true;
}

bool CheckMinNumberOfDaysOffBasicForPRRuleParam::MatchDays(const int day) const {
	if (_daysInMonth.empty() || _daysInMonth == "*")
		return true;

	return day == _daysInMonthInt;
}