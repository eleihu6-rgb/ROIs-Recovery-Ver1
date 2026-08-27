/**
 * @file LimitTrainingRoleInTeamForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitTrainingRoleInTeamForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"

using namespace std;

void LimitTrainingRoleInTeamForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES):{
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS):{
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS):{
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

			case enum_to_underlying(ParamLocation::CREW_TEAMS): {
				_crewTeam = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _crewTeams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_ROLES): {
				_crewRole = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _crewRoles);
				}
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

void LimitTrainingRoleInTeamForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Crew Teams,Crew Roles
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
		else if (header == "CREW TEAMS") {
			_crewTeam = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _crewTeams);
			}
		}
		else if (header == "CREW ROLES") {
			_crewRole = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _crewRoles);
			}
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitTrainingRoleInTeamForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitTrainingRoleInTeamForEvaFdRuleParam::MatchParam(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, std::shared_ptr<CREW> crew) const {
	//判断机组人员所属Teams是否满足
	std::vector<string> bases, ranks, fleets, teams, positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, bases, ranks, fleets, _crewTeams, positions, programCourseInstructor->startTime, programCourseInstructor->endTime))
		return true;
	return false;
}

bool LimitTrainingRoleInTeamForEvaFdRuleParam::CheckParam(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor) const {
	if (std::find(_crewRoles.begin(), _crewRoles.end(), programCourseInstructor->role) != _crewRoles.end()) {
		return false;
	}
	return true;
}
