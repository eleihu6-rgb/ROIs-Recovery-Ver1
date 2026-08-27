/**
 * @file RestrictTraineeHoldAssignmentForEvaFdRuleParam.h
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
#include "RestrictTraineeHoldAssignmentForEvaFdRuleParam.h"
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

void RestrictTraineeHoldAssignmentForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::FOOTPRINT_TYPES): {
				_footprintTypes = substr;
				_footprintTypesMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FOOTPRINT_SUBTYPES): {
				_footprintSubTypes = substr;
				_footprintSubTypesMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::PROGRAM_STATUS): {
				_programStatus = substr;
				_programStatusMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::PROHIBITED_COURSE_CODES): {
				_prohibitedCourseCodes = substr;
				_prohibitedCourseCodesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::PROHIBITED_ROLES): {
				_prohibitedRoles = substr;
				_prohibitedRolesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::PROHIBITED_ASSIGNMENT_GROUPS): {
				_prohibitedAssignmentGroups = substr;
				_prohibitedAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::PROHIBITED_ASSIGNMENTS): {
				_prohibitedAssignments = substr;
				_prohibitedAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::TO_FIRST_DUTY_DATE): {
				_toFirstDutyDate = (substr == "Y");
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

void RestrictTraineeHoldAssignmentForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Footprint Types,Program Status,Prohibited Course Codes,Prohibited Roles,Prohibited Assignment Groups,Prohibited Assignments,to First Duty Date(Y/N)
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
		else if (header == "FOOTPRINT TYPES") {
			_footprintTypes = headeValue;
			_footprintTypesMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "FOOTPRINT SUBTYPES") {
			_footprintSubTypes = headeValue;
			_footprintSubTypesMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "PROGRAM STATUS") {
			_programStatus = headeValue;
			_programStatusMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "PROHIBITED COURSE CODES") {
			_prohibitedCourseCodes = headeValue;
			_prohibitedCourseCodesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "PROHIBITED ROLES") {
			_prohibitedRoles = headeValue;
			_prohibitedRolesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "PROHIBITED ASSIGNMENT GROUPS") {
			_prohibitedAssignmentGroups = headeValue;
			_prohibitedAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "PROHIBITED ASSIGNMENTS") {
			_prohibitedAssignments = headeValue;
			_prohibitedAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "TO FIRST DUTY DATE(Y/N)") {
			_toFirstDutyDate = (headeValue == "Y");
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool RestrictTraineeHoldAssignmentForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool RestrictTraineeHoldAssignmentForEvaFdRuleParam::MatchProgramStatus(const std::shared_ptr<CREW>& crew) const {
	if (this->_programStatus == RuleParamConstant::IGNORED) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	auto programList = dbData->tmProgramIndex->getByCrewId(crew->idCrew);
	for (auto& program : programList) {
		if (_programStatusMatch.Match(program->status)) {
			return true;
		}
	}
	return false;
}

bool RestrictTraineeHoldAssignmentForEvaFdRuleParam::CheckRole(const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor, const time_t limitStartTime, const time_t limitEndTime) const {
	if (!(tmProgramCourseInstructor->startTime <= limitEndTime && tmProgramCourseInstructor->endTime >= limitStartTime)) {
		//不在检查范围时间段内，则直接返回true
		return true;
	}

	if (_prohibitedRoles == RuleParamConstant::IGNORED) {
		return true;
	}

	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourseInstructor->courseId, this->GetRule()->GetDataContext());
	if ((_prohibitedCourseCodes == RuleParamConstant::IGNORED || _prohibitedCourseCodesMatch.Match(tmCourse->courseCode)) 
		&& _prohibitedRolesMatch.Match(tmProgramCourseInstructor->role)) {
		return false;
	}
	return true;
}

bool RestrictTraineeHoldAssignmentForEvaFdRuleParam::CheckAssignment(const ROSTER* roster, const time_t limitStartTime, const time_t limitEndTime) const {
	auto& dbData = this->GetRule()->GetDataContext();
	auto& tmProgramCourseIndex = dbData->tmProgramCourseIndex;
	auto& tmProgramCourseInstructorIndex = dbData->tmProgramCourseInstructorIndex;

	//_prohibitedAssignmentGroups 和 _prohibitedAssignments 是检查条件，若配置为*则表示忽略检查
	if (_prohibitedAssignmentGroups == RuleParamConstant::IGNORED && _prohibitedAssignments == RuleParamConstant::IGNORED) {
		return true;
	}

	if (roster->pairing == nullptr) {
		//非训练课程判断条件 roster->tmProgramCourseId == 0

		if (roster->tmProgramCourseId != 0) {
			//检查针对非训练任务，若是训练课程的任务，则直接返回true
			return true;
		}
		if (!(roster->getStartTimeUtcAct() <= limitEndTime && roster->getRestStartUtcAct() >= limitStartTime)) {
			//不在检查范围时间段内，则直接返回true
			return true;
		}

		if ((_prohibitedAssignmentGroups != RuleParamConstant::IGNORED && _prohibitedAssignmentGroupsMatch.Match(*roster)) && 
			(_prohibitedAssignments != RuleParamConstant::IGNORED && _prohibitedAssignmentsMatch.Match(*roster))){
			return false;
		}
		else if (_prohibitedAssignmentGroups != RuleParamConstant::IGNORED && _prohibitedAssignmentGroupsMatch.Match(*roster)) {
			return false;
		}
		else if (_prohibitedAssignments != RuleParamConstant::IGNORED && _prohibitedAssignmentsMatch.Match(*roster)) {
			return false;
		}

	}
	else {
		for (auto& segment : roster->pairing->getSegmentsRead()) {
			auto tmProgramCourse = tmProgramCourseIndex->getByRosterId(roster->rosterId, segment->getDBId());
			if (tmProgramCourse != nullptr)  {
				//检查针对非训练任务，若是训练课程的任务，则直接返回true
				continue;
			}

			auto tmProgramCourseInstructor = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId, segment->getDBId());
			if (tmProgramCourseInstructor != nullptr) {
				//检查针对非训练任务，若是训练课程的任务，则直接返回true
				continue;
			}

			if (!(segment->getStartTimeUtcAct() <= limitEndTime && segment->getEndTimeUtcAct() >= limitStartTime)) {
				//不在检查范围时间段内，则直接返回true
				return true;
			}

			if ((_prohibitedAssignmentGroups != RuleParamConstant::IGNORED && _prohibitedAssignmentGroupsMatch.Match(*segment)) && 
				(_prohibitedAssignments != RuleParamConstant::IGNORED && _prohibitedAssignmentsMatch.Match(*segment))) {
				return false;
			}
			else if (_prohibitedAssignmentGroups != RuleParamConstant::IGNORED && _prohibitedAssignmentGroupsMatch.Match(*segment)) {
				return false;
			}
			else if (_prohibitedAssignments != RuleParamConstant::IGNORED && _prohibitedAssignmentsMatch.Match(*segment)) {
				return false;
			}

		}
	}
	return true;
}