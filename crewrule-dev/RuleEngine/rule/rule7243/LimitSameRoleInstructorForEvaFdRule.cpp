/**
 * @file LimitSameRoleInstructorForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitSameRoleInstructorForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"



bool LimitSameRoleInstructorForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
	if (this->_ruleParams.empty() || crew == nullptr) {
		return true;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : crew->rosterList) {
		rosters.emplace_back(roster.get());
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER || rosters.empty())
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

 	bool passAllRule = true;
	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);

	//按program分组，获得已排课的programCourse。返回值：map<programId, 培训计划program下已经排课的programCourse>
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap = TrainingCourseUtils::GetProgramCourseInProgram(crew, this->GetDataContext()); 
	for (auto& pair : programCourseMap) {
		auto& programId = pair.first;
		auto& tmProgramCourseList = pair.second;
		if (tmProgramCourseList.size() <= 1) {
			continue;
		}
		for (const auto& tmProgramCourse : tmProgramCourseList) {
			bool valid = CheckRule(programId, tmProgramCourse, tmProgramCourseList, crew, true);//crew是学员
			if (!valid) {
				passAllRule = false;
			}
		}
	}

	//从教员维度， map<programId, programId对应的ProgramCourseList>
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMapByInstructor = TrainingCourseUtils::GetProgramCourseInProgramByInstructor(crew, this->GetDataContext());
	for (auto& pair : programCourseMapByInstructor) {
		auto& programId = pair.first;
		auto& tmProgramCourseList = pair.second;//与crew（教员）在同一节的学员课程，并且这些课程在同一Program内
		if (tmProgramCourseList.size() <= 1) {
			continue;
		}
		for (const auto& tmProgramCourse : tmProgramCourseList) {
			bool valid = CheckRule(programId, tmProgramCourse, tmProgramCourseList, crew, false);//crew是教员
			if (!valid) {
				passAllRule = false;
			}
		}
	}

	return passAllRule;
}

bool LimitSameRoleInstructorForEvaFdRule::CheckRule(const long long programId, const std::shared_ptr<TmProgramCourse>& currProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const bool isTrainee) const {
	bool valid = true;

	auto& programCourseA = currProgramCourse;
	for (size_t i = 0; i < tmProgramCourseList.size(); i++) {
		auto& programCourseB = tmProgramCourseList.at(i);
		if (programCourseA->id == programCourseB->id) continue;

		//获得限制规则
		auto programCourseLimitationList = _dbData->tmProgramCourseLimitationIndex->getByProgramCourseId(programCourseA->parentId);
		for (auto& programCourseLimitation : programCourseLimitationList) {
			if (!CheckRule(programCourseA, programCourseB, programCourseLimitation, crew, isTrainee)) {
				valid = false;
				ThrowRuleViolation(programCourseA, programCourseB, programCourseLimitation);
			}
		}
	}
	return valid;
}

bool LimitSameRoleInstructorForEvaFdRule::CheckRule(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<TmProgramCourseLimitation>& programCourseLimitation, const std::shared_ptr<CREW>& crew, const bool isTrainee) const {
	bool valid = true;
	if (std::find(programCourseLimitation->limitCourseSeqs.begin(), programCourseLimitation->limitCourseSeqs.end(), programCourseB->courseSeq) == programCourseLimitation->limitCourseSeqs.end()) {
		return true;
	}
	auto programCourseAInstructorList =  _dbData->tmProgramCourseInstructorIndex->getByGroupIdAndRole(programCourseA->groupId, programCourseLimitation->startRoles);
	auto programCourseBInstructorList = _dbData->tmProgramCourseInstructorIndex->getByGroupIdAndRole(programCourseB->groupId, programCourseLimitation->endRoles);

	set<string> crewAIds, crewBIds;
	for (auto& programCourseAInstructor : programCourseAInstructorList) {
		crewAIds.emplace(programCourseAInstructor->crewId);
	}

	for (auto& programCourseBInstructor : programCourseBInstructorList) {
		crewBIds.emplace(programCourseBInstructor->crewId);
	}

	if (crewAIds.empty() || crewBIds.empty()) {
		//若角色未分配人员，则不告警
		return true;
	}

	if (!isTrainee && crewAIds.find(crew->idCrew) == crewAIds.end() && crewBIds.find(crew->idCrew) == crewBIds.end()) {
		//如果当前检查Crew是教员，若告警对象不是该教员，则忽略告警
		return true;
	}
	_ruleViolation.SetParam("crewAIds", StringUtils::Join(crewAIds, ","));
	_ruleViolation.SetParam("crewBIds", StringUtils::Join(crewBIds, ","));
	if (programCourseLimitation->limitOption == "MUST SAME") {
		return crewAIds == crewBIds;
	}
	else if (programCourseLimitation->limitOption == "MUST NOT SAME") {
		return !StringUtils::Intersect(crewAIds, crewBIds);
	}
	return valid;
}

void LimitSameRoleInstructorForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitSameRoleInstructorForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitSameRoleInstructorForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitSameRoleInstructorForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<TmProgramCourseLimitation>& programCourseLimitation) const {
	string& crewId = programCourseA->crewId;

	string crewAIds = _ruleViolation.GetParam("crewAIds");
	auto courseA = TrainingCourseUtils::GetCourseByCourseId(programCourseA->courseId, _dbData);
	string& roleA = programCourseLimitation->startRole;

	string crewBIds = _ruleViolation.GetParam("crewBIds");
	auto courseB = TrainingCourseUtils::GetCourseByCourseId(programCourseB->courseId, _dbData);
	string& roleB = programCourseLimitation->endRole;

	string msg = "invalid";
	if (programCourseLimitation->limitOption == "MUST SAME") {
		//计划课程A(XXX角色)和课程B(XXX角色)的不能分配同一教员
		msg = "The trainee crew ({0:crewId}) should have the same person as ({1:roleA}) ({2:crewAIds}) for course ({3:courseA}) and ({4:roleB}) ({5:crewBIds}) for another course ({6:courseB}).";
		msg = StringUtils::Format(msg, crewId, roleA, crewAIds, courseA->courseCode, roleB, crewBIds, courseB->courseCode);
	}
	else if (programCourseLimitation->limitOption == "MUST NOT SAME") {
		//计划课程A(XXX角色)和课程B(XXX角色)的不能分配不同教员
		msg = "The trainee crew ({0:crewId}) cannot have the same person as ({1:roleA}) ({2:crewAIds}) for course ({3:courseA}) and ({4:roleB}) ({5:crewBIds}) for another course ({6:courseB}).";
		msg = StringUtils::Format(msg, crewId, roleA, crewAIds, courseA->courseCode, roleB, crewBIds, courseB->courseCode);
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = -1;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = -1;
	rv->startDTUtc = std::min({ programCourseA->startTime, programCourseA->endTime, programCourseB->startTime, programCourseB->endTime });
	rv->endDTUtc = std::max({ programCourseA->startTime, programCourseA->endTime, programCourseB->startTime, programCourseB->endTime });

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("crewAIds", crewAIds));
	rv->operation_result.insert(pair<string, string>("roleA", roleA));
	rv->operation_result.insert(pair<string, string>("courseA", courseA->courseCode));
	rv->operation_result.insert(pair<string, string>("crewBIds", crewBIds));
	rv->operation_result.insert(pair<string, string>("courseB", courseB->courseCode));
	rv->operation_result.insert(pair<string, string>("roleB", roleB));
	rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(programCourseA->programId)));
	rv->operation_result.insert(pair<string, string>("programCourseAId", StringUtils::lltos(programCourseA->id)));
	rv->operation_result.insert(pair<string, string>("programCourseBId", StringUtils::lltos(programCourseB->id)));
	rv->operation_result.insert(pair<string, string>("programCourseAParentId", StringUtils::lltos(programCourseA->parentId)));
	rv->operation_result.insert(pair<string, string>("fltAId", StringUtils::lltos(programCourseA->fltId)));
	rv->operation_result.insert(pair<string, string>("fltBId", StringUtils::lltos(programCourseB->fltId)));
	_ruleViolation.AddRuleViolations(rv);


}