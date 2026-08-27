/**
 * @file ConsecutiveTaskBeforeAfterDayOffForHXRuleParam.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-03
**/

#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "ConsecutiveTaskBeforeAfterDayOffForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/BaseUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"

using namespace std;

void ConsecutiveTaskBeforeAfterDayOffForHXRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				_assignmentGroups = substr;
				_assignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				_assignments = substr;
				_assignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ATTRIBUTES): {
				_strAttributes = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					split(substr.c_str(), '|', _attributes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_DAYS_RANGE): {
				_strConsecutiveDaysRange = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					vector<string> splitstrs;
					split(substr.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 1) {
						if (splitstrs[0] != RuleParamConstant::ALL && !splitstrs[0].empty()) {
							_consecutiveDaysRangeLower = atoi(splitstrs[0].c_str());
						}
						else {
							_consecutiveDaysRangeLower = 0;
						}
					}
					if (splitstrs.size() >= 2) {
						if (splitstrs[1] != RuleParamConstant::ALL && !splitstrs[1].empty()) {
							_consecutiveDaysRangeUpper = atoi(splitstrs[1].c_str());
						}
						else {
							_consecutiveDaysRangeUpper = std::numeric_limits<int>::max();
						}
					}

					//如果连续天数范围的下限和上限相等，或者上限为无穷大，则最大连续天数等于下限值
					if (_consecutiveDaysRangeLower == _consecutiveDaysRangeUpper || _consecutiveDaysRangeUpper == std::numeric_limits<int>::max()) {
						_maxConsecutiveDays = _consecutiveDaysRangeLower;
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_PRE_DAYS_OFF): {
				_strMinPreDaysOff = substr;
				_minPreDaysOff = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_POST_DAYS_OFF): {
				_strMinPostDaysOff = substr;
				_minPostDaysOff = atoi(substr.c_str());
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void ConsecutiveTaskBeforeAfterDayOffForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Assignment Groups,Assignments,Attributes,Consecutive Days Range,Min Pre Days Off,Min Post Days Off
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "ASSIGNMENT GROUPS") {
			_assignmentGroups = headeValue;
			_assignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ASSIGNMENTS") {
			_assignments = headeValue;
			_assignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ATTRIBUTES") {
			_strAttributes = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				split(headeValue.c_str(), '|', _attributes);
			}
		}
		else if (header == "CONSECUTIVE DAYS RANGE") {
			_strConsecutiveDaysRange = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				vector<string> splitstrs;
				split(headeValue.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 1) {
					if (splitstrs[0] != RuleParamConstant::ALL && !splitstrs[0].empty()) {
						_consecutiveDaysRangeLower = atoi(splitstrs[0].c_str());
					}
					else {
						_consecutiveDaysRangeLower = 0;
					}
				}
				if (splitstrs.size() >= 2) {
					if (splitstrs[1] != RuleParamConstant::ALL && !splitstrs[1].empty()) {
						_consecutiveDaysRangeUpper = atoi(splitstrs[1].c_str());
					}
					else {
						_consecutiveDaysRangeUpper = std::numeric_limits<int>::max();
					}
				}

				//如果连续天数范围的下限和上限相等，或者上限为无穷大，则最大连续天数等于下限值
				if (_consecutiveDaysRangeLower == _consecutiveDaysRangeUpper || _consecutiveDaysRangeUpper == std::numeric_limits<int>::max()) {
					_maxConsecutiveDays = _consecutiveDaysRangeLower;
				}
			}
		}
		else if (header == "MIN PRE DAYS OFF") {
			_strMinPreDaysOff = headeValue;
			_minPreDaysOff = atoi(headeValue.c_str());
		}
		else if (header == "MIN POST DAYS OFF") {
			_strMinPostDaysOff = headeValue;
			_minPostDaysOff = atoi(headeValue.c_str());
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool ConsecutiveTaskBeforeAfterDayOffForHXRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool ConsecutiveTaskBeforeAfterDayOffForHXRuleParam::MatchAssignment(const ROSTER* roster) const {
	if (!_assignmentGroupsMatch.Match(*roster)) {
		return false;
	}
	if (!_assignmentsMatch.Match(*roster)) {
		return false;
	}
	if (!MatchAttributes(roster)) {
		return false;
	}
	return true;
}

bool ConsecutiveTaskBeforeAfterDayOffForHXRuleParam::MatchConsecutiveDaysRange(const int consecutiveDays) const {
	if (_strConsecutiveDaysRange.empty() || _strConsecutiveDaysRange == RuleParamConstant::ALL) {
		return true;
	}
	return consecutiveDays >= _consecutiveDaysRangeLower && consecutiveDays <= _consecutiveDaysRangeUpper;
}

bool ConsecutiveTaskBeforeAfterDayOffForHXRuleParam::MatchAttributes(const ROSTER* roster) const {
	if (_attributes.empty()) {
		return true;
	}

	bool foundAttr = false;
	std::vector<std::string> attributes;
	if (roster->pairing == nullptr) {
		split(roster->attribute, '|', attributes);
	}
	else {
		split(roster->pairing->getAttribute(), '|', attributes);
	}
	for (const auto& attr : attributes) {
		if (std::find(_attributes.begin(), _attributes.end(), attr) != _attributes.end()) {
			foundAttr = true;
			break;
		}
	}
	return foundAttr;
}

bool ConsecutiveTaskBeforeAfterDayOffForHXRuleParam::MatchParam(const ROSTER* roster) const {
	return MatchAssignment(roster);
}