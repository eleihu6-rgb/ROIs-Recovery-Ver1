/**
 * @file LimitSameDeviceInProgramForEvaFdRuleParam.h
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
#include "LimitSameDeviceInProgramForEvaFdRuleParam.h"
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

void LimitSameDeviceInProgramForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::CREW_FLEETS): {
				_crewFleet = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _crewFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FOOTPRINT_TYPES): {
				_footprintTypes = substr;
				_footprintTypesMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_CODES): {
				_courseCodes = substr;
				_courseCodesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::DEVICE_GROUPS): {
				_strDeviceGroups = substr;
				if (substr != RuleParamConstant::ALL) {
					if (substr.find("|") != string::npos) {
						split(strToUpper(substr), '|', _anyOfDeviceGroups);
					}
					else {
						split(strToUpper(substr), '$', _mustOneOfDeviceGroups);
					}
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

void LimitSameDeviceInProgramForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Crew Fleets,Footprint Types,Course Codes,Device Groups
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
		else if (header == "CREW FLEETS") {
			_crewFleet = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _crewFleets);
			}
		}
		else if (header == "FOOTPRINT TYPES") {
			_footprintTypes = headeValue;
			_footprintTypesMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "COURSE CODES") {
			_courseCodes = headeValue;
			_courseCodesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "DEVICE GROUPS" || header == "DEVICE TYPES") {
			_strDeviceGroups = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("|") != string::npos) {
					split(strToUpper(headeValue), '|', _anyOfDeviceGroups);
				}
				else {
					split(strToUpper(headeValue), '$', _mustOneOfDeviceGroups);
				}
			}
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitSameDeviceInProgramForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitSameDeviceInProgramForEvaFdRuleParam::MatchFootprintType(const std::shared_ptr<TmFootprint>& tmFootprint) const {

	if (!_footprintTypesMatch.Match(tmFootprint->footprintType)) {
		return false;
	}
	return true;
}

bool LimitSameDeviceInProgramForEvaFdRuleParam::MatchCrewFleets(std::shared_ptr<CREW> crew, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	std::vector<string> bases, ranks, teams, positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, bases, ranks, this->_crewFleets, teams, positions, programCourse->startTime, programCourse->endTime))
		return true;
	return false;
}

bool LimitSameDeviceInProgramForEvaFdRuleParam::MatchParam(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<CREW>& crew) const {
	auto tmCourseA = TrainingCourseUtils::GetCourseByCourseId(programCourseA->courseId, this->GetRule()->GetDataContext());
	if (tmCourseA == nullptr || !_courseCodesMatch.Match(tmCourseA->courseCode)) {
		return false;
	}

	auto tmCourseB = TrainingCourseUtils::GetCourseByCourseId(programCourseB->courseId, this->GetRule()->GetDataContext());
	if (tmCourseB == nullptr || !_courseCodesMatch.Match(tmCourseB->courseCode)) {
		return false;
	}

	if (!MatchCrewFleets(crew, programCourseA) || !MatchCrewFleets(crew, programCourseB)) {
		return false;
	}

	return true;
}

bool LimitSameDeviceInProgramForEvaFdRuleParam::CheckParam(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB) const {
	auto& dbData = this->GetRule()->GetDataContext();
	auto iterADevice = dbData->tmDeviceMap.find(programCourseA->resourceCode);
	if (iterADevice == dbData->tmDeviceMap.end()) {
		return true;
	}

	auto iterBDevice = dbData->tmDeviceMap.find(programCourseB->resourceCode);
	if (iterBDevice == dbData->tmDeviceMap.end()) {
		return true;
	}

	if (_strDeviceGroups == RuleParamConstant::IGNORED) {
		return StringUtils::Intersect(iterADevice->second->resourceTypes, iterBDevice->second->resourceTypes);
	}
	
	if (_mustOneOfDeviceGroups.empty()) {
		if (!StringUtils::Intersect(iterADevice->second->resourceTypes, _anyOfDeviceGroups) || !StringUtils::Intersect(iterBDevice->second->resourceTypes, _anyOfDeviceGroups)) {
			return false;
		}
	}
	else {
		bool matched = false;
		for (auto& _mustOneOfDeviceGroup : _mustOneOfDeviceGroups) {
			if (std::find(iterADevice->second->resourceTypes.begin(), iterADevice->second->resourceTypes.end(), _mustOneOfDeviceGroup) != iterADevice->second->resourceTypes.end() 
				&& std::find(iterBDevice->second->resourceTypes.begin(), iterBDevice->second->resourceTypes.end(), _mustOneOfDeviceGroup) != iterBDevice->second->resourceTypes.end()) {
				matched = true;
				break;
			}
		}
		if (!matched) {
			return false;
		}
	}
	return true;
}

