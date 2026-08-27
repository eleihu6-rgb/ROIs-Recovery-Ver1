/**
 * @file LimitCoursePipNumbersForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitCoursePipNumbersForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool LimitCoursePipNumbersForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

	bool passAllRule = true;
	bool next = true;
	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);
	for (auto& roster : rosters) {
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));
		
		bool valid = CheckRule(roster);
		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}


bool LimitCoursePipNumbersForEvaFdRule::CheckRule(const ROSTER* roster) const {
	bool passAllRule = true;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	//roster从学员维度检查
	const auto programCourseList = tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : programCourseList) {
		if (programCourse->groupId.empty()) {
			//没有安排roster，人员数量检查则忽略
			continue;
		}

		if (!CheckRule(roster, programCourse)) {
			passAllRule = false;
		}

	}

	//roster从非学员维度检查
	const auto programCourseInstructorList = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (programCourseInstructor->groupId.empty()) {
			//没有安排roster，人员数量检查则忽略
			continue;
		}

		//获得该课程的所有学员(COF)，检查教员满足人数要求
		const auto programCoursesInGroup = tmProgramCourseIndex->getByGroupId(programCourseInstructor->groupId);
		for (const auto& programCourseInGroup : programCoursesInGroup) {
			auto iterCrew = this->_dbData->crewIdMap.find(programCourseInGroup->crewId);
			if (iterCrew == this->_dbData->crewIdMap.end()) {
				Logger::getRuleLogger()->error("[CheckRule] Crew ({}) does not exist when checking role numbers.", programCourseInGroup->crewId);
				continue;
			}
			auto& cofCrew = iterCrew->second;
			for (auto& cofRoster : cofCrew->rosterList) {
				const auto cofProgramCourseList = tmProgramCourseIndex->getByRosterId(cofRoster->rosterId);
				for (auto& cofProgramCourse : cofProgramCourseList) {
					if (cofProgramCourse->groupId == programCourseInGroup->groupId) { //仅检查同一节课
						if (!CheckRule(cofRoster.get(), programCourseInGroup)) {
							passAllRule = false;
						}
					}
				}
				if (!passAllRule) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

/*
* 检查PIP
* roster: 排班roster
* teProgramCourse: 学员的program course
* parentProgramCourseIds: programCourse对应的父的teProgramCourseId
*/
bool LimitCoursePipNumbersForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	bool passAllRule = true;
	auto& tmProgramPipIndex = this->_dbData->tmProgramPipIndex;
	auto& tmProgramCoursePnrIndex = this->_dbData->tmProgramCoursePnrIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;

	auto& tmProgramIndex = this->_dbData->tmProgramIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->GetDataContext());
	auto tmProgram = tmProgramIndex->getById(programCourse->programId);
	if (tmCourse == nullptr) {
		//Logger::getRuleLogger()->debug("[ERROR] course don't exist. courseId={}", programCourse->courseId);
		return true;
	}
	if (tmProgram == nullptr) {
		//Logger::getRuleLogger()->debug("[ERROR] program don't exist. courseId={}", programCourse->programId);
		return true;
	}

	long long parentProgramCourseId = TrainingCourseUtils::GetProgramCourseParentId(programCourse);
	auto tmProgramCoursePnr = tmProgramCoursePnrIndex->getByProgramCourseId(parentProgramCourseId);
	if (tmProgramCoursePnr == nullptr || !tmProgramCoursePnr->needPip) {
		return true;
	}

	_ruleViolation.SetParam("programId", StringUtils::lltos(programCourse->programId));
	_ruleViolation.SetParam("programName", tmProgram->name);
	_ruleViolation.SetParam("courseId", StringUtils::lltos(tmCourse->id));
	_ruleViolation.SetParam("courseCode", tmCourse->courseCode);

	//检查PIP(拥有IP教员角色和LIP资质的人员) 人员数量和crewId列表
	auto tmProgramPips = tmProgramPipIndex->getByProgramId(programCourse->programId, programCourse->simioe, programCourse->coursePhase);
	for (auto& tmProgramPip : tmProgramPips) {
	    //获得program中对应的大阶段和小阶段的实际PIP人数
		auto actualCrewIdsOfPIP = TrainingCourseUtils::GetPIPCrewsInProgram(roster, programCourse->programId, tmProgramPip->simioe, tmProgramPip->phase, this->GetDataContext());

		if (tmProgramPip->pipNumber >= 0 && tmProgramPip->pipNumber < (int)actualCrewIdsOfPIP.size()) {
			ThrowRuleViolation(roster, programCourse, tmProgramPip, actualCrewIdsOfPIP);
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}

		if (tmProgramPip->pipNumber >= 0) {
			int remainingPipNumber = tmProgramPip->pipNumber - (int)actualCrewIdsOfPIP.size(); //剩余可以灵活安排PIP人数 = program规则配置PIP人数(tmProgramPip.pipNumber) - program实际排班PIP人数
			if (remainingPipNumber >= (int)tmProgramPip->crewIds.size()) {
				//“剩余可以灵活安排PIP人数” 大于 “指定安排人数”（tmProgramPip->crewIds.size()），则退出（不用检查当前安排PIP人员是否满足tmProgramPip->crewIds要求）
				continue;
			}
		}
		set<string> missingCrewIds;//缺失的CrewId;
		for (auto& crewId : tmProgramPip->crewIds) {
			if (std::find(actualCrewIdsOfPIP.begin(), actualCrewIdsOfPIP.end(), crewId) == actualCrewIdsOfPIP.end()) {
				missingCrewIds.emplace(crewId);
			}
		}
		if (!missingCrewIds.empty()) {
			_ruleViolation.SetParam("role", "PIP");
			ThrowRuleViolation(roster, missingCrewIds, programCourse, tmProgramPip, actualCrewIdsOfPIP);
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	
	return passAllRule;
}

void LimitCoursePipNumbersForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitCoursePipNumbersForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitCoursePipNumbersForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitCoursePipNumbersForEvaFdRule::ThrowRuleViolation(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmProgramPip>& tmProgramPip, const std::set<string>& actualCrewIdsOfPIP) const {
	string programId = _ruleViolation.GetParam("programId");
	string programName = _ruleViolation.GetParam("programName");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//培训计划PIP人数超过限制值
	std::string msg = "The PIP number ({0:actualCrewPIPNum}) on phase ({1:simioe}/{2:phase}) of program ({3:programName}) exceeds the limitation ({4:limitPipNumber}).";
	msg = StringUtils::Format(msg, actualCrewIdsOfPIP.size(), programCourse->simioe, StringUtils::Join(tmProgramPip->phase,","), programName, tmProgramPip->pipNumber);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		//rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->rosterId = roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getRestStartUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->segmentId = programCourse->fltId;
		rv->startDTUtc = roster->pairing->getStartTimeUtcAct();
		rv->endDTUtc = roster->pairing->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programId", programId));
	rv->operation_result.insert(pair<string, string>("programName", programName));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("simioe", programCourse->simioe));
	rv->operation_result.insert(pair<string, string>("phase", programCourse->coursePhase));
	rv->operation_result.insert(pair<string, string>("limitPipNumber", StringUtils::itos(tmProgramPip->pipNumber)));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitCoursePipNumbersForEvaFdRule::ThrowRuleViolation(const ROSTER* roster, const set<string>& missingCrewIds, const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmProgramPip>& tmProgramPip, const std::set<string>& actualCrewIdsOfPIP) const {
	string programId = _ruleViolation.GetParam("programId");
	string programName = _ruleViolation.GetParam("programName");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//培训计划需要分配机组人员(XXX)为PIP
	std::string msg = "The phase ({0:simioe}/{1:phase}) of program ({2:programName}) requires assigning the crew ({3:crewIds}) to PIP role.";
	msg = StringUtils::Format(msg, programCourse->simioe, StringUtils::Join(tmProgramPip->phase, ","), programName, StringUtils::Join(missingCrewIds, ","));
	
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		//rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->rosterId = roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getRestStartUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->segmentId = programCourse->fltId;
		rv->startDTUtc = roster->pairing->getStartTimeUtcAct();
		rv->endDTUtc = roster->pairing->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programId", programId));
	rv->operation_result.insert(pair<string, string>("programName", programName));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	_ruleViolation.AddRuleViolations(rv);
}
