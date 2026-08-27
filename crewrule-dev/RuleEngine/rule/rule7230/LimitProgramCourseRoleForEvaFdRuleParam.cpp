/**
 * @file LimitProgramCourseRoleForEvaFdRuleParam.h
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
#include "LimitProgramCourseRoleForEvaFdRuleParam.h"
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

void LimitProgramCourseRoleForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::COURSE_CODES): {
				_courseCodes = substr;
				_courseCodeMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::PROGRAM_STATUSES): {
				_programStatuses = substr;
				_programStatusMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FOOTPRINT_TYPES): {
				_footprintTypes = substr;
				_footprintTypeMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ROLES): {
				_roles = substr;
				_roleMatch.SetExpression(substr, this->GetRule());
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

void LimitProgramCourseRoleForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Course Codes,Program Statuses,Footprint Types,Roles
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
		else if (header == "COURSE CODES") {
			_courseCodes = headeValue;
			_courseCodeMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "PROGRAM STATUSES") {
			_programStatuses = headeValue;
			_programStatusMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "FOOTPRINT TYPES") {
			_footprintTypes = headeValue;
			_footprintTypeMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "ROLES") {
			_roles = headeValue;
			_roleMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitProgramCourseRoleForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitProgramCourseRoleForEvaFdRuleParam::MatchProgramStatusAndFootprintType(const ROSTER& roster) const {
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

bool LimitProgramCourseRoleForEvaFdRuleParam::MatchProgramStatusAndFootprintType(const std::shared_ptr<TmProgramCourse>& teProgramCourse) const {
	auto& dbData = this->GetRule()->GetDataContext();
	const auto program = dbData->tmProgramIndex->getById(teProgramCourse->programId);
	if (program == nullptr) {
		Logger::getRuleLogger()->error("[MatchProgramStatusAndFootprintType] program is null. programCourseId={}, programId={}", teProgramCourse->id, teProgramCourse->programId);
		return false;
	}
	if (!_programStatusMatch.Match(program->status)) {
		return false;
	}
	
	auto tmFootprint = dbData->tmFootprintIndex->getById(program->footprintId);
	if (tmFootprint != nullptr && !_footprintTypeMatch.Match(tmFootprint->footprintType)) {
		return false;
	}
	return true;
}

bool LimitProgramCourseRoleForEvaFdRuleParam::MatchParam(const ROSTER& roster, const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor) const {
	if (programCourseInstructor->groupId.empty()) {
		return false;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	long long courseId = programCourseInstructor->courseId;
	if (courseId <= 0) {
		//兼容老版本客户端
		//获得教员IP/检查员CK/伙伴PNR等同组（同一节课）的任意一名学员的计划课程
		const auto teProgramCourse = dbData->tmProgramCourseIndex->getAnyOneByGroupId(programCourseInstructor->groupId);
		if (teProgramCourse == nullptr) {
			return false;
		}
		courseId = teProgramCourse->courseId;
	}

	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(courseId, this->GetRule()->GetDataContext());
	if (tmCourse == nullptr) {
		return false;
	}

	this->GetRule()->getRuleViolation().SetParam("programCourseInstructorId", StringUtils::lltos(programCourseInstructor->id));
	this->GetRule()->getRuleViolation().SetParam("courseId", StringUtils::lltos(courseId));
	this->GetRule()->getRuleViolation().SetParam("role", programCourseInstructor->role);
	this->GetRule()->getRuleViolation().SetParam("courseCode", tmCourse->courseCode);

	if (!_courseCodeMatch.Match(tmCourse->courseCode)) {
		return false;
	}

	if (!MatchProgramStatusAndFootprintType(roster)) {
		return false;
	}
	return true;
}

bool LimitProgramCourseRoleForEvaFdRuleParam::CheckParam(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor) const {
	if (!_roleMatch.Match(programCourseInstructor->role)) {
		return false;
	}
	return true;
}