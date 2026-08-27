/**
 * @file LimitDutyDaysOffForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitDutyDaysOffForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void LimitDutyDaysOffForHXRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::CONSECUTIVE_DAYS): {
				_consecutiveDays = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_AGREE_TO_WORK_ON_THE_LAST_DAY): {
				_isCrewAgreeWork = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::DHD_ON_THE_LAST_DAY): {
				_isDHDLastDay = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::EXCLUDING_FIRST_RECOVERY_6_OFFSET_DO): {
				_excludingFirstRecovery6OffsetdDo = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::FOLLOWING_START_OF_DDO): {
				_followingStartOfDDO = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::LAYOVER_ASSIGNMENTS): {
				_strLayoverAssignments = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					split(substr, '|', _layoverAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::LAYOVER_ASSIGNMENTS_DURATION): {
				_strLayoverAssignmentsDuration = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					_layoverAssignmentsDuration = TimeUtils::hhmmToMinutes(substr);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_CONSECUTIVE_DO): {
				_minConsecutiveDO = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<int>(atoi(substr.c_str()));
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_DO): {
				_minDO = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<int>(atoi(substr.c_str()));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LimitDutyDaysOffForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Consecutive Days,Crew Agree to Work on the Last Day(Y/N),DHD on the Last Day(Y/N),Excluding First Recovery 6 offset DO(Y/N),Following Start of DDO(Y/N),Layover Assignments,Layover Assignments Duration,Min Consecutive DO,Min DO
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
		else if (header == "CONSECUTIVE DAYS") {
			_consecutiveDays = atoi(headeValue.c_str());
		}
		else if (header == "CREW AGREE TO WORK ON THE LAST DAY(Y/N)") {
			_isCrewAgreeWork = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "DHD ON THE LAST DAY(Y/N)") {
			_isDHDLastDay = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "EXCLUDING FIRST RECOVERY 6 OFFSET DO(Y/N)") {
			_excludingFirstRecovery6OffsetdDo = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "FOLLOWING START OF DDO(Y/N)") {
			_followingStartOfDDO = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "MIN CONSECUTIVE DO" || header == "MIN CONSECUTIVE DDO") {
			_minConsecutiveDO = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<int>(atoi(headeValue.c_str()));
		}
		else if (header == "MIN DO" || header == "MIN DDO") {
			_minDO = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<int>(atoi(headeValue.c_str()));
		}
		else if (header == "LAYOVER ASSIGNMENTS") {
			_strLayoverAssignments = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				split(headeValue, '|', _layoverAssignments);
			}
		}
		else if (header == "LAYOVER ASSIGNMENTS DURATION" || header == "LAYOVER ASSIGNMENT DURATION") {
			_strLayoverAssignmentsDuration = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				_layoverAssignmentsDuration = TimeUtils::hhmmToMinutes(headeValue);
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitDutyDaysOffForHXRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

int LimitDutyDaysOffForHXRuleParam::GetIncConsecutiveDays() const {
	int actConsecutiveDays = 0;
    if (_isCrewAgreeWork != nullptr && *_isCrewAgreeWork) {
		actConsecutiveDays += 1;
	}
	if (_isDHDLastDay != nullptr && *_isDHDLastDay) {
		actConsecutiveDays += 1;
	}
	return actConsecutiveDays;
}

bool LimitDutyDaysOffForHXRuleParam::IsCheckLayoverAssignment() const {
	return !this->_layoverAssignments.empty() && this->_layoverAssignmentsDuration > 0;
}