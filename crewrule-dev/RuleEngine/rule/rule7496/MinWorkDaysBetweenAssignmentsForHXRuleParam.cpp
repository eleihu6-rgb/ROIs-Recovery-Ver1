/**
 * @file MinWorkDaysBetweenAssignmentsForHXRuleParam.cpp
 * @brief 7496法规参数实现类
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-05
**/

#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "MinWorkDaysBetweenAssignmentsForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"

using namespace std;

void MinWorkDaysBetweenAssignmentsForHXRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::CONSECUTIVE_ASSIGNMENT_GROUP_A): {
				_strConsecutiveAssignmentGroupA = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					_consecutiveAssignmentGroupAMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_ASSIGNMENT_A): {
				_strConsecutiveAssignmentA = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					_consecutiveAssignmentAMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_ASSIGNMENT_GROUP_B): {
				_strConsecutiveAssignmentGroupB = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					_consecutiveAssignmentGroupBMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_ASSIGNMENT_B): {
				_strConsecutiveAssignmentB = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					_consecutiveAssignmentBMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DIRECTIONAL): {
				_isDirectional = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_WORKING_DAYS): {
				_minWorkingDays = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::WORKING_ASSIGNMENT_GROUP): {
				_strWorkingAssignmentGroup = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					_workingAssignmentGroupMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::WORKING_ASSIGNMENTS): {
				_strWorkingAssignments = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					_workingAssignmentsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::COUNT_BLANK_DAY): {
				_isCountBlankDay = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void MinWorkDaysBetweenAssignmentsForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Consecutive Assignment Group A,Consecutive Assignment A,Consecutive Assignment Group B,Consecutive Assignment B,Directional(Y/N),Min Working Days,Working Assignment Group,Working Assignments,Count Blank Day(Y/N)
		if (header == "CONSECUTIVE ASSIGNMENT GROUP A") {
			_strConsecutiveAssignmentGroupA = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				_consecutiveAssignmentGroupAMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "CONSECUTIVE ASSIGNMENT A") {
			_strConsecutiveAssignmentA = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				_consecutiveAssignmentAMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "CONSECUTIVE ASSIGNMENT GROUP B") {
			_strConsecutiveAssignmentGroupB = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				_consecutiveAssignmentGroupBMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "CONSECUTIVE ASSIGNMENT B") {
			_strConsecutiveAssignmentB = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				_consecutiveAssignmentBMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "DIRECTIONAL(Y/N)" || header == "DIRECTIONAL") {
			_isDirectional = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "MIN WORKING DAYS") {
			_minWorkingDays = atoi(headeValue.c_str());
		}
		else if (header == "WORKING ASSIGNMENT GROUP") {
			_strWorkingAssignmentGroup = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				_workingAssignmentGroupMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "WORKING ASSIGNMENTS") {
			_strWorkingAssignments = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				_workingAssignmentsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "COUNT BLANK DAY(Y/N)" || header == "COUNT BLANK DAY") {
			_isCountBlankDay = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool MinWorkDaysBetweenAssignmentsForHXRuleParam::MatchConsecutiveAssignmentA(const ROSTER* roster) const {
	if (_strConsecutiveAssignmentGroupA != RuleParamConstant::ALL && !_strConsecutiveAssignmentGroupA.empty()) {
		if (!_consecutiveAssignmentGroupAMatch.Match(*roster)) {
			return false;
		}
	}
	if (_strConsecutiveAssignmentA != RuleParamConstant::ALL && !_strConsecutiveAssignmentA.empty()) {
		if (!_consecutiveAssignmentAMatch.Match(*roster)) {
			return false;
		}
	}
	return true;
}

bool MinWorkDaysBetweenAssignmentsForHXRuleParam::MatchConsecutiveAssignmentB(const ROSTER* roster) const {
	if (_strConsecutiveAssignmentGroupB != RuleParamConstant::ALL && !_strConsecutiveAssignmentGroupB.empty()) {
		if (!_consecutiveAssignmentGroupBMatch.Match(*roster)) {
			return false;
		}
	}
	if (_strConsecutiveAssignmentB != RuleParamConstant::ALL && !_strConsecutiveAssignmentB.empty()) {
		if (!_consecutiveAssignmentBMatch.Match(*roster)) {
			return false;
		}
	}
	return true;
}

bool MinWorkDaysBetweenAssignmentsForHXRuleParam::MatchWorkingAssignment(const ROSTER* roster) const {
	if (_strWorkingAssignmentGroup != RuleParamConstant::ALL && !_strWorkingAssignmentGroup.empty()) {
		if (!_workingAssignmentGroupMatch.Match(*roster)) {
			return false;
		}
	}
	if (_strWorkingAssignments != RuleParamConstant::ALL && !_strWorkingAssignments.empty()) {
		if (!_workingAssignmentsMatch.Match(*roster)) {
			return false;
		}
	}
	return true;
}