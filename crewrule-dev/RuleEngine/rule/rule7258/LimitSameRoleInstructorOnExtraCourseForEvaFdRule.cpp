/**
 * @file LimitSameRoleInstructorOnExtraCourseForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitSameRoleInstructorOnExtraCourseForEvaFdRule.h"
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



bool LimitSameRoleInstructorOnExtraCourseForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
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
			bool valid = CheckRule(programId, tmProgramCourse, tmProgramCourseList, crew);
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
			bool valid = CheckRule(programId, tmProgramCourse, tmProgramCourseList, crew);//crew是教员
			if (!valid) {
				passAllRule = false;
			}
		}
	}
	return passAllRule;
}

bool LimitSameRoleInstructorOnExtraCourseForEvaFdRule::CheckRule(const long long programId, const std::shared_ptr<TmProgramCourse>& currProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	auto& programCourseA = currProgramCourse;
	for (size_t i = 0; i < tmProgramCourseList.size(); i++) {
		auto& programCourseB = tmProgramCourseList.at(i);
		if (programCourseA->id == programCourseB->id //A和B相同，则忽略
			|| programCourseA->courseId != programCourseB->courseId  //A和B不是同一课程，则忽略
			|| (!programCourseA->isExtraCourse && !programCourseB->isExtraCourse)) //A和B都是正常课程,则忽略
			continue;

		if (!CheckRule(programCourseA, programCourseB, crew)) {
			valid = false;
		}
	}
	return valid;
}

bool LimitSameRoleInstructorOnExtraCourseForEvaFdRule::CheckRule(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourseA->courseId, this->_dbData);
	if (tmCourse == nullptr) {
		return true;
	}
	for (auto& ruleParam : this->_ruleParams) {
		if (ruleParam.MatchCourse(tmCourse)) {
			auto programCourseAInstructorList = _dbData->tmProgramCourseInstructorIndex->getByGroupIdAndRole(programCourseA->groupId, ruleParam._trainingRoles);
			auto programCourseBInstructorList = _dbData->tmProgramCourseInstructorIndex->getByGroupIdAndRole(programCourseB->groupId, ruleParam._trainingRoles);

			set<string> crewAIds, crewBIds;
			for (auto& programCourseAInstructor : programCourseAInstructorList) {
				crewAIds.emplace(programCourseAInstructor->crewId);
			}

			for (auto& programCourseBInstructor : programCourseBInstructorList) {
				crewBIds.emplace(programCourseBInstructor->crewId);
			}

			if (crewAIds.empty() || crewBIds.empty()) {
				//若角色未分配人员，则不告警
				continue;
			}
			set<string> sameCrewIds;
			if (StringUtils::Intersect(sameCrewIds, crewAIds, crewBIds)) {
				valid = false;
				ThrowRuleViolation(sameCrewIds, programCourseA, programCourseB, ruleParam);
			}
		}
	}

	return valid;
}

void LimitSameRoleInstructorOnExtraCourseForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitSameRoleInstructorOnExtraCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitSameRoleInstructorOnExtraCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitSameRoleInstructorOnExtraCourseForEvaFdRule::ThrowRuleViolation(set<string>& sameCrewIds, const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const LimitSameRoleInstructorOnExtraCourseForEvaFdRuleParam& ruleParam) const {
	string& crewId = programCourseA->crewId;

	auto courseA = TrainingCourseUtils::GetCourseByCourseId(programCourseA->courseId, _dbData);
	string strSameCrewIds = StringUtils::Join(sameCrewIds, ",");
	//同一课程的加课({0:courseCode})禁止重复分配同一教员({1:crewId})。
	string msg = "The same instructor ({0:sameCrewIds}) cannot be assigned to the extra course ({1:courseA}).";
	msg = StringUtils::Format(msg, strSameCrewIds, courseA->courseCode);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = programCourseA->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	auto roster = this->_dbData->findRoster(programCourseA->crewId, programCourseA->rosterId);
	if (roster == nullptr) {
		rv->pairingId = -1;
		Logger::getRuleLogger()->warn("[ERROR] Roster {} of crew ({}) do not exist.", programCourseA->rosterId, programCourseA->crewId);
	}
	else {
		rv->pairingId = roster == nullptr ? -1 : roster->pairId;
	}
	rv->segmentId = programCourseA->fltId;
	rv->startDTUtc = std::min(programCourseA->startTime, programCourseB->endTime);
	rv->endDTUtc = std::max(programCourseA->startTime, programCourseB->endTime);

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("sameCrewIds", strSameCrewIds));
	rv->operation_result.insert(pair<string, string>("courseA", courseA->courseCode));

	rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(programCourseA->programId)));
	rv->operation_result.insert(pair<string, string>("programCourseAId", StringUtils::lltos(programCourseA->id)));
	rv->operation_result.insert(pair<string, string>("programCourseBId", StringUtils::lltos(programCourseB->id)));
	rv->operation_result.insert(pair<string, string>("programCourseAIsExtraCourse", StringUtils::lltos(programCourseA->isExtraCourse)));
	rv->operation_result.insert(pair<string, string>("programCourseBIsExtraCourse", StringUtils::lltos(programCourseB->isExtraCourse)));
	rv->operation_result.insert(pair<string, string>("fltAId", StringUtils::lltos(programCourseA->fltId)));
	rv->operation_result.insert(pair<string, string>("fltBId", StringUtils::lltos(programCourseB->fltId)));
	_ruleViolation.AddRuleViolations(rv);


}