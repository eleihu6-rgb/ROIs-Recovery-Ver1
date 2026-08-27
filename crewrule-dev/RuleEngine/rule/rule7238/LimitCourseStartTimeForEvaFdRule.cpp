/**
 * @file LimitCourseStartTimeForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitCourseStartTimeForEvaFdRule.h"
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

bool LimitCourseStartTimeForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
	//检查课程以及设备限制
	for (auto& roster : rosters) {
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));
		
		bool valid = CheckRule(roster, crew);
		if (!valid) {
			passAllRule = false;
		}
	}

	return passAllRule;
}

bool LimitCourseStartTimeForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	if (!CheckCourseStartTime(roster, crew)) {
		valid = false;
	}

	return valid;
}

bool LimitCourseStartTimeForEvaFdRule::CheckCourseStartTime(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	//roster从学员维度检查
	const auto programCourseList = this->_dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : programCourseList) {
		if (!CheckCourseStartTime(roster, crew, programCourse, true)) {
			valid = false;
		}
	}

	///roster从非学员维度检查(即：教员IP、检查员CK、伙伴PNR等)
	const auto programCourseInstructorList = this->_dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (programCourseInstructor->groupId.empty()) {
			continue;
		}
		//获得教员IP/检查员CK/伙伴PNR等同组（同一节课）的任意一名学员的计划课程

		const auto programCourse = this->_dbData->tmProgramCourseIndex->getAnyOneByGroupId(programCourseInstructor->groupId);
		if (programCourse != nullptr) {
			if (!CheckCourseStartTime(roster, crew, programCourse, false)) {
				valid = false;
			}
		}
	}

	return valid;
}

bool LimitCourseStartTimeForEvaFdRule::CheckCourseStartTime(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& teProgramCourse, const bool isTrainee) const {
	bool passAllRule = true;
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(teProgramCourse->courseId, this->GetDataContext());

	time_t rosterStartTime = roster->getStartTimeLocAct();
	time_t rosterEndTime = roster->getEndTimeLocAct();
	int rosterStartTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterStartTime);
	int rosterEndTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterEndTime);
	int rosterDurationMinute = static_cast<int>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct()) / 60;
	int rosterCourseLegNum = -1;
	if (teProgramCourse != nullptr) {
		if (roster->pairing != nullptr) {
			//SIM或Line培训课程
			auto iterFlight = this->_dbData->flightIdMap.find(teProgramCourse->fltId);
			if (iterFlight != this->_dbData->flightIdMap.end()) {
				rosterStartTime = iterFlight->second->getStartTimeLocAct();
				rosterEndTime = iterFlight->second->getEndTimeLocAct();
				rosterStartTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterStartTime);
				rosterEndTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterEndTime);
				rosterDurationMinute = static_cast<int>(iterFlight->second->getEndTimeUtcAct() - iterFlight->second->getStartTimeUtcAct()) / 60;
			}
		}

		_ruleViolation.SetParam("programCourseId", StringUtils::lltos(teProgramCourse->id));
		_ruleViolation.SetParam("programCourseParentId", StringUtils::lltos(teProgramCourse->parentId));
		_ruleViolation.SetParam("courseId", StringUtils::lltos(teProgramCourse->courseId));
		_ruleViolation.SetParam("rosterStartTime", TimeUtils::Format(rosterStartTime, "yyyy-mm-dd HH:mm"));
		_ruleViolation.SetParam("rosterEndTime", TimeUtils::Format(rosterEndTime, "yyyy-mm-dd HH:mm"));
		_ruleViolation.SetParam("rosterDurationMinute", TimeUtils::MinutesTohhmm(rosterDurationMinute));

		const auto teProgramCoursePnr = this->_dbData->tmProgramCoursePnrIndex->getByProgramCourseId( TrainingCourseUtils::GetProgramCourseParentId(teProgramCourse) );
		if (teProgramCoursePnr == nullptr) { 
			//标准化配置，按TmCourse配置检查
			const auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(teProgramCourse->courseId, this->GetDataContext());
			if (tmCourse == nullptr) {
				Logger::getRuleLogger()->error("[CheckCourseStartTime] TmCourse is null.courseId={}", teProgramCourse->courseId);
				return true;
			}
			//检查培训课程Start Time限制
			if (!CheckCourseStartTime(rosterStartTimeMinute, tmCourse)) {
				passAllRule = false;
				_ruleViolation.SetParam("trainingCourseStartTime", tmCourse->startTime);

				ThrowRuleViolationForCourseStartTime(roster);

				if (isTrainee) {
					//获得该课程的所有教员(COF)，检查教员是否满足课程开始时间要求
					const auto cofRosters = TrainingCourseUtils::GetInstructorRostersOnCourse(teProgramCourse->groupId, this->GetDataContext());
					for (auto& cofRoster : cofRosters) {
						ThrowRuleViolationForCourseStartTime(cofRoster.get());
					}
				}

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}

		}
		else {
			//存在个性化配置，按TmProgramCoursePnr配置检查
			_ruleViolation.SetParam("programCoursePnrId", StringUtils::lltos(teProgramCoursePnr->id));

			//检查培训课程Start Time限制
			if (!CheckCourseStartTime(rosterStartTimeMinute, teProgramCoursePnr)) {
				passAllRule = false;
				_ruleViolation.SetParam("trainingCourseStartTime", teProgramCoursePnr->startTime);

				ThrowRuleViolationForCourseStartTime(roster);

				if (isTrainee) {
					//获得该课程的所有教员(COF)，检查教员是否满足课程开始时间要求
					const auto cofRosters = TrainingCourseUtils::GetInstructorRostersOnCourse(teProgramCourse->groupId, this->GetDataContext());
					for (auto& cofRoster : cofRosters) {
						ThrowRuleViolationForCourseStartTime(cofRoster.get());
					}
				}

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
	}
	return passAllRule;
}

bool LimitCourseStartTimeForEvaFdRule::CheckCourseStartTime(const int rosterStartTimeMinute, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const {
	bool passAllRule = true;
	if (programCoursePnr->startTimeOption == "MUST") {
		bool valid = false;
		for (auto& startTimeMinute : programCoursePnr->startTimeMinutes) {
			if (rosterStartTimeMinute == startTimeMinute) {
				//配置多个开始时间，任意一个满足，则认为合法
				valid = true;
				break;
			}
		}

		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool LimitCourseStartTimeForEvaFdRule::CheckCourseStartTime(const int rosterStartTimeMinute, const std::shared_ptr<TmCourse>& tmCourse) const {
	bool passAllRule = true;
	if (tmCourse->startTimeOption == "MUST") {
		bool valid = false;
		for (auto& startTimeMinute : tmCourse->startTimeMinutes) {
			if (rosterStartTimeMinute == startTimeMinute) {
				//配置多个开始时间，任意一个满足，则认为合法
				valid = true;
				break;
			}
		}

		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

void LimitCourseStartTimeForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitCourseStartTimeForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitCourseStartTimeForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitCourseStartTimeForEvaFdRule::ThrowRuleViolationForCourseStartTime(const ROSTER* roster) const {
	string trainingCourseStartTime = _ruleViolation.GetParam("trainingCourseStartTime");
	string rosterStartTime = _ruleViolation.GetParam("rosterStartTime");
	string courseId = _ruleViolation.GetParam("courseId");
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string programCoursePnrId = _ruleViolation.GetParam("programCoursePnrId");


	//培训课程开始时间与排班开始时间不同
	std::string msg = "The start time of the training course ({0:trainingCourseStartTime}) of crew ({1:crewId})  differs from the start time of the roster ({2:rosterStartTime}).";
	msg = StringUtils::Format(msg, trainingCourseStartTime, roster->idcrew, rosterStartTime);

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
		rv->startDTUtc = roster->pairing->getStartTimeUtcAct();
		rv->endDTUtc = roster->pairing->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("trainingCourseStartTime", trainingCourseStartTime));
	rv->operation_result.insert(pair<string, string>("rosterStartTime", rosterStartTime));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("programCoursePnrId", programCoursePnrId));
	rv->operation_result.insert(pair<string, string>("cofCrewId", roster->idcrew));
	_ruleViolation.AddRuleViolations(rv);
}
