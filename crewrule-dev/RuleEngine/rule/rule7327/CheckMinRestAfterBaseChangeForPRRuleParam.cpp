/**
 * @file CheckMinRestAfterBaseChangeForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-27
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "CheckMinRestAfterBaseChangeForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckMinRestAfterBaseChangeForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::WORKING_ASSIGNMENT_GROUPS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _workingAssignmentGroups);
					_workingAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_REST): {
				_minRest = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::REST_TYPE): {
				_restType = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::INCLUDING_LOCAL_NIGHTS): {
				_strIncludingLocalNights = substr;
				_includingLocalNightsNum = atoi(substr.c_str());
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

void CheckMinRestAfterBaseChangeForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Working Assignment Groups,Min Rest,Rest Type,Including Local Nights
		if (header == "BASES") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "WORKING ASSIGNMENT GROUPS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _workingAssignmentGroups);
				_workingAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "MIN REST") {
			_minRest = atoi(headeValue.c_str());
		}
		else if (header == "REST TYPE") {
			_restType = strToUpper(headeValue);
		}
		else if (header == "INCLUDING LOCAL NIGHTS") {
			_strIncludingLocalNights = headeValue;
			_includingLocalNightsNum = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMinRestAfterBaseChangeForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckMinRestAfterBaseChangeForPRRuleParam::MatchWorkingAssignmentGroup(const Activity* activity) const {
	if (_workingAssignmentGroupsMatch.Match(*activity)) {
		return true;
	}
	return false;
}

