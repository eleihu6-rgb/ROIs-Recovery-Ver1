/**
 * @file CheckEarnedDaysOffForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-08-21
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "CheckEarnedDaysOffForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckEarnedDaysOffForPRRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::WORKING_ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _workingAssignmentGroups);
					_workingAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::WORKING_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _workingAssignments);
					_workingAssignmentsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::WORKING_LEVEL): {
				_workingLevel = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::DO_ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _doAssignmentGroups);
					_doAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DO_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _doAssignments);
					_doAssignmentsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::BLANK_DAY_COUNTED_AS_DO): {
				_isBlankDayCountedAsDO = (substr == RuleParamConstant::IGNORED) ? true : (substr == "Y");
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_WORKING_DAYS): {
				_consecutiveWorkingDays = substr;

				vector<string> splitstrs;
				split(_consecutiveWorkingDays.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_consecutiveWorkingDaysLower = atoi(splitstrs[0].c_str());
					_consecutiveWorkingDaysUpper = atoi(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FIXED_REQUIRED_DO): {
				_fixedRequiredDO = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<double>(atof(substr.c_str()));
				break;
			}
			case enum_to_underlying(ParamLocation::PERCENT_REQUIRED_DO): {
				_percentRequiredDO = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<double>(atof(substr.c_str()));
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):{
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CheckEarnedDaysOffForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Working Assignment Groups,Working Assignments,Working Level,DO Assignment Groups,DO Assignments,Blank Day Counted as DO(Y/N),Consecutive Working Days,Fixed Required DO,DO%
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
		else if (header == "WORKING ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _workingAssignmentGroups);
				_workingAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());

			}
		}
		else if (header == "WORKING ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _workingAssignments);
				_workingAssignmentsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "WORKING LEVEL") {
			_workingLevel = strToUpper(headeValue);
		}
		else if (header == "DO ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _doAssignmentGroups);
				_doAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "DO ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _doAssignments);
				_doAssignmentsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "BLANK DAY COUNTED AS DO(Y/N)") {
			_isBlankDayCountedAsDO = (headeValue == RuleParamConstant::IGNORED) ? true : (headeValue == "Y");
		}
		else if (header == "CONSECUTIVE WORKING DAYS") {
			_consecutiveWorkingDays = headeValue;

			vector<string> splitstrs;
			split(_consecutiveWorkingDays.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_consecutiveWorkingDaysLower = atoi(splitstrs[0].c_str());
				_consecutiveWorkingDaysUpper = atoi(splitstrs[1].c_str());
			}
		}
		else if (header == "FIXED REQUIRED DO") {
			_fixedRequiredDO = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<double>(atof(headeValue.c_str()));
		}
		else if (header == "DO%") {
			_percentRequiredDO = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<double>(atof(headeValue.c_str()));
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckEarnedDaysOffForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckEarnedDaysOffForPRRuleParam::MatchWorkingAssignmentGroupAndAssignment(const Activity* activity) const {
	if (_workingAssignmentsMatch.Match(*activity) && _workingAssignmentGroupsMatch.Match(*activity)) {
		return true;
	}
	return false;
}

bool CheckEarnedDaysOffForPRRuleParam::MatchDOAssignmentGroupAndAssignment(const Activity* activity) const {
	if (_doAssignmentsMatch.Match(*activity) && _doAssignmentGroupsMatch.Match(*activity)) {
		return true;
	}
	return false;
}

bool CheckEarnedDaysOffForPRRuleParam::MatchConsecutiveWorkingDays(const int consecutiveWorkingDays) const {
	if (consecutiveWorkingDays >= _consecutiveWorkingDaysLower && consecutiveWorkingDays < _consecutiveWorkingDaysUpper) {
		return true;
	}
	return false;
}

