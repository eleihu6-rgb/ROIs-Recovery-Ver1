/**
 * @file LimitProgramCourseOnFlightForEvaFdRuleParam.h
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
#include "LimitProgramCourseOnFlightForEvaFdRuleParam.h"
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

void LimitProgramCourseOnFlightForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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

			case enum_to_underlying(ParamLocation::COURSE_TYPE): {
				_courseType = substr;
				_courseTypeMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_FLEETS): {
				_crewFleet = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _crewFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_A_COURSE_CODES): {
				_crewACourseCodes = substr;
				_crewACourseCodesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_B_PROHIBITED_COURSE_CODES): {
				_prohibitedCourseCodes = substr;
				_prohibitedCourseCodesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::CREW_B_PROHIBITED_FOOTPRINT_TYPES): {
				_prohibitedFootprintTypes = substr;
				_prohibitedFootprintTypesMatch.SetExpression(strToUpper(substr), this->GetRule());
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

void LimitProgramCourseOnFlightForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Course Type,Crew Fleets,Crew A Course Codes,Crew B Prohibited Course Codes,Crew B Prohibited Footprint Types
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
		else if (header == "COURSE TYPE") {
			_courseType = headeValue;
			_courseTypeMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "CREW FLEETS") {
			_crewFleet = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _crewFleets);
			}
		}
		else if (header == "CREW A COURSE CODES") {
			_crewACourseCodes = headeValue;
			_crewACourseCodesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "CREW B PROHIBITED COURSE CODES") {
			_prohibitedCourseCodes = headeValue;
			_prohibitedCourseCodesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "CREW B PROHIBITED FOOTPRINT TYPES") {
			_prohibitedFootprintTypes = headeValue;
			_prohibitedFootprintTypesMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitProgramCourseOnFlightForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitProgramCourseOnFlightForEvaFdRuleParam::MatchCrewFleets(std::shared_ptr<CREW> crew, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	std::vector<string> bases, ranks, teams, positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, bases, ranks, this->_crewFleets, teams, positions, programCourse->startTime, programCourse->endTime))
		return true;
	return false;
}

bool LimitProgramCourseOnFlightForEvaFdRuleParam::MatchProgramStatusAndFootprintType(const ROSTER& roster) const {
	auto& dbData = this->GetRule()->GetDataContext();

	//当前教员crew以学员身份检查（针对未训完，因此仅需要从学员维度检查）
	auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByCrewId(roster.idcrew);
	if (tmProgramCourseList.empty()) {
		//学员无课程，则不用检查该规则
		return false;
	}
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (!MatchProgramStatusAndFootprintType(tmProgramCourse)) {
			return false;
		}
	}
	return true;
}

bool LimitProgramCourseOnFlightForEvaFdRuleParam::MatchProgramStatusAndFootprintType(const std::shared_ptr<TmProgramCourse>& teProgramCourse) const {
	auto& dbData = this->GetRule()->GetDataContext();
	const auto program = dbData->tmProgramIndex->getById(teProgramCourse->programId);
	if (program == nullptr) {
		Logger::getRuleLogger()->error("[MatchProgramStatusAndFootprintType] program is null. programCourseId={}, programId={}", teProgramCourse->id, teProgramCourse->programId);
		return false;
	}
/*	if (!_programStatusMatch.Match(program->status)) {
		return false;
	}
	
	auto tmFootprint = dbData->tmFootprintIndex->getById(program->footprintId);
	if (tmFootprint != nullptr && !_footprintTypesMatch.Match(tmFootprint->footprintType)) {
		return false;
	}*/
	return true;
}

bool LimitProgramCourseOnFlightForEvaFdRuleParam::MatchParam(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<CREW>& crew) const {

	auto tmCourseA = TrainingCourseUtils::GetCourseByCourseId(programCourseA->courseId, this->GetRule()->GetDataContext());
	if (tmCourseA == nullptr || !_courseTypeMatch.Match(tmCourseA->courseType)) {
		return false;
	}

	if (tmCourseA == nullptr || !_crewACourseCodesMatch.Match(tmCourseA->courseCode)) {
		return false;
	}

	if (!MatchCrewFleets(crew, programCourseA)) {
		return false;
	}

	this->GetRule()->getRuleViolation().SetParam("courseACode", tmCourseA->courseCode);
	return true;
}

bool LimitProgramCourseOnFlightForEvaFdRuleParam::MatchParam(const std::shared_ptr<TmProgramCourse>& cofProgramCourse, const std::shared_ptr<TmCourse>& cofCourse) const {

	auto& dbData = this->GetRule()->GetDataContext();

	if (cofCourse == nullptr || !_courseTypeMatch.Match(cofCourse->courseType)) {
		return false;
	}
	auto iterCrew = dbData->crewIdMap.find(cofProgramCourse->crewId);
	if (iterCrew == dbData->crewIdMap.end()) {
		return false;
	}

	if (!MatchCrewFleets(iterCrew->second, cofProgramCourse)) {
		return false;
	}

	return true;
}

int LimitProgramCourseOnFlightForEvaFdRuleParam::CheckParam(const std::shared_ptr<TmProgramCourse>& cofProgramCourse, const std::shared_ptr<TmCourse>& cofCourse, const std::shared_ptr<TmFootprint>& cofFootprint) const {
	auto& dbData = this->GetRule()->GetDataContext();

	if (_prohibitedFootprintTypes != RuleParamConstant::IGNORED && _prohibitedFootprintTypesMatch.Match(cofFootprint->footprintType)) {
		return (int)WarnCode::FOOTPRINT_WARN;
	}

	if (_prohibitedCourseCodes != RuleParamConstant::IGNORED && _prohibitedCourseCodesMatch.Match(cofCourse->courseCode)) {
		return (int)WarnCode::COURSE_CODE_WARN;
	}

	return (int)WarnCode::NO_WARN;
}
