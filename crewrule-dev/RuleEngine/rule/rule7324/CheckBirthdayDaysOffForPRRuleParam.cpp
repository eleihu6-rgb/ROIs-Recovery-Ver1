/**
 * @file CheckBirthdayDaysOffForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "CheckBirthdayDaysOffForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckBirthdayDaysOffForPRRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::BIRTHDAY_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _birthdayAssignments);
					_birthdayAssignmentsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::BEFORE_AFTER_BIRTHDAY_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _beforeAndAfterBirthdayAssignments);
					_beforeAndAfterBirthdayAssignmentsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DAYS_OFF_BEFORE_BIRTHDAY): {
				_daysOffBeforeBirthday = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::DAYS_OFF_AFTER_BIRTHDAY): {
				_daysOffAfterBirthday = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::LATEST_END_TIME): {
				_latestEndTimeHHmm = substr;
				_latestEndTimeHHmmMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::EARLIEST_START_TIME): {
				_earliestStartTimeHHmm = substr;
				_earliestStartTimeHHmmMinutes = TimeUtils::hhmmToMinutes(substr);
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

void CheckBirthdayDaysOffForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Birthday Assignments,Before/After Birthday Assignments,Days Off Before Birthday,Days Off After Birthday,Latest End Time,Earliest Start Time
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
		else if (header == "BIRTHDAY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _birthdayAssignments);
				_birthdayAssignmentsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "BEFORE/AFTER BIRTHDAY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _beforeAndAfterBirthdayAssignments);
				_beforeAndAfterBirthdayAssignmentsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "DAYS OFF BEFORE BIRTHDAY") {
			_daysOffBeforeBirthday = atoi(headeValue.c_str());
		}
		else if (header == "DAYS OFF AFTER BIRTHDAY") {
			_daysOffAfterBirthday = atoi(headeValue.c_str());
		}
		else if (header == "LATEST END TIME") {
			_latestEndTimeHHmm = headeValue;
			_latestEndTimeHHmmMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "EARLIEST START TIME") {
			_earliestStartTimeHHmm = headeValue;
			_earliestStartTimeHHmmMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckBirthdayDaysOffForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckBirthdayDaysOffForPRRuleParam::MatchBirthdayAssignment(const Activity* activity) const {
	if (!_birthdayAssignmentsMatch.Match(*activity)) {
		return false;
	}
	return true;
}

bool CheckBirthdayDaysOffForPRRuleParam::MatchBeforeAndAfterBirthdayAssignment(const Activity* activity) const {
	if (!_beforeAndAfterBirthdayAssignmentsMatch.Match(*activity)) {
		return false;
	}
	return true;
}