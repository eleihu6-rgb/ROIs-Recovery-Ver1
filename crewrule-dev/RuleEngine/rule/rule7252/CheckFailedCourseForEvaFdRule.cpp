/**
 * @file CheckFailedCourseForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckFailedCourseForEvaFdRule.h"
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
#include "index/TmPairingIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool CheckFailedCourseForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	map<long long, shared_ptr<TmProgramCourse>> failProgramCourseMap;
	for (auto& roster : rosters) {
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));

		bool valid = CheckRule(failProgramCourseMap, roster);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}

	////按program分组，获得已排课的programCourse。返回值：map<programId, 培训计划program下已排课排课的programCourse>
	//map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap = TrainingCourseUtils::GetProgramCourseInProgram(crew, this->GetDataContext());

	//for (auto& pair : programCourseMap) {
	//	long long programId = pair.first;
	//	vector<std::shared_ptr<TmProgramCourse>> tmProgramCourseList = pair.second;

	//	for (auto& tmProgramCourse : tmProgramCourseList) {
	//		if (tmProgramCourse->trainingResult == "N") {
	//			ThrowRuleViolation(tmProgramCourse);
	//		}
	//	}
	//}
	return passAllRule;
}

bool CheckFailedCourseForEvaFdRule::CheckRule(map<long long, shared_ptr<TmProgramCourse>>& failProgramCourseMap, const ROSTER* roster) const {
	bool passAllRule = true;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	const auto programCourseList = tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : programCourseList) {
		if (programCourse->groupId.empty()) {
			//没有安排roster，人员数量检查则忽略
			continue;
		}

		if (programCourse->trainingResult == "N") {
			passAllRule = false;
			failProgramCourseMap[programCourse->programId] = programCourse;
			ThrowRuleViolation(roster, programCourse);

		}
	}

	//培训课程失败后，第一个飞行任务需要告警(该飞行任务若是训练，则不能与失败课程在同一program)
	if (roster->pairing != nullptr) {
		for (auto& duty : roster->pairing->getDutyVec()) {
			for (auto& segment : duty->getSegments()) {
				if (!segment->getIsOperating()) {
					continue;
				}

				set<long long> delProgramIds;
				for (auto& failProgramCoursePair : failProgramCourseMap) {
					auto& failProgramId = failProgramCoursePair.first;
					auto& failProgramCourse = failProgramCoursePair.second;


					if (failProgramCourse->endTime < segment->getStartTimeUtcAct()) {
						auto tmProgramCourseList = tmProgramCourseIndex->getByFlightId(failProgramId, segment->getDBId());

						if (tmProgramCourseList.empty()) {
							passAllRule = false;
							delProgramIds.emplace(failProgramId);
							ThrowRuleViolation(roster, segment, failProgramCourse);
						}
					}
				}
				//产生告警后，就删除
				for (auto& delProgramId : delProgramIds) {
					failProgramCourseMap.erase(delProgramId);
				}
			}
		}
	}


	return passAllRule;
}

void CheckFailedCourseForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckFailedCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckFailedCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckFailedCourseForEvaFdRule::ThrowRuleViolation(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const {
	auto& dbData = this->GetDataContext();
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
	auto tmProgram = dbData->tmProgramIndex->getById(tmProgramCourse->programId);

	//在训练计划的课程X不合格
	std::string msg = "The program course ({0:courseCode}) failed.";
	msg = StringUtils::Format(msg, (tmCourse == nullptr ? "N/A" : tmCourse->courseCode));

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = tmProgramCourse->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->segmentId = tmProgramCourse->fltId;
	}
	rv->startDTUtc = tmProgramCourse->startTime;
	rv->endDTUtc = tmProgramCourse->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("courseId", (tmCourse == nullptr ? "-1" : StringUtils::lltos(tmCourse->id))));
	rv->operation_result.insert(pair<string, string>("courseCode", (tmCourse == nullptr ? "N/A" : tmCourse->courseCode)));
	rv->operation_result.insert(pair<string, string>("programId", (tmProgram == nullptr ? "-1" : StringUtils::lltos(tmProgram->id))));
	rv->operation_result.insert(pair<string, string>("programName", (tmProgram == nullptr ? "N/A" : tmProgram->name)));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckFailedCourseForEvaFdRule::ThrowRuleViolation(const ROSTER* roster, const Segment* segment, const std::shared_ptr<TmProgramCourse>& failProgramCourse) const {
	auto& dbData = this->GetDataContext();

	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(failProgramCourse->courseId, dbData);

	//课程（{0:courseCode}）失败后，机组不能操作除飞行训练以外的任何FLT。
	std::string msg = "After the failure of course ({0:courseCode}), the crew can not operate any FLT other than flight training.";
	msg = StringUtils::Format(msg, (tmCourse == nullptr ? "N/A" : tmCourse->courseCode));

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = segment->getPairingId();
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->segmentId = segment->getDBId();
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("failProgramCourseId", StringUtils::lltos(failProgramCourse->id)));
	_ruleViolation.AddRuleViolations(rv);
}
