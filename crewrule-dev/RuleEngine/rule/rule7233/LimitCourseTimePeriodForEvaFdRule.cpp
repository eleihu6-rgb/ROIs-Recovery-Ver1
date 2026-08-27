/**
 * @file LimitCourseTimePeriodForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitCourseTimePeriodForEvaFdRule.h"
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

bool LimitCourseTimePeriodForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crew->getPrimeBase(), this->GetDataContext());
	//检查课程开始时间和结束时间是否满足Time Period要求
	for (auto& roster : rosters) {
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));
		
		bool valid = CheckRule(roster, crew, offsetTZMinutes);
		if (!valid) {
			passAllRule = false;
		}
	}

	return passAllRule;
}

bool LimitCourseTimePeriodForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const {
	bool valid = true;

	//roster从学员维度检查
	const auto programCourseList = this->_dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : programCourseList) {
		if (!CheckCourseTimePeriod(roster, crew, programCourse, true, offsetTZMinutes)) {
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
			if (!CheckCourseTimePeriod(roster, crew, programCourse, false, offsetTZMinutes)) {
				valid = false;
			}
		}
	}

	return valid;
}

bool LimitCourseTimePeriodForEvaFdRule::CheckCourseTimePeriod(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& teProgramCourse, const bool isTrainee, const int offsetTZMinutes) const {
	bool passAllRule = true;
	time_t rosterStartTime = roster->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
	time_t rosterEndTime = roster->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;
	int rosterStartTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterStartTime);
	int rosterEndTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterEndTime);
	int rosterDurationMinute = static_cast<int>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct()) / 60;
	if (teProgramCourse != nullptr) {
		if (roster->pairing != nullptr) {
			//SIM或Line培训课程
			auto iterFlight = this->_dbData->flightIdMap.find(teProgramCourse->fltId);
			if (iterFlight != this->_dbData->flightIdMap.end()) {
				rosterStartTime = iterFlight->second->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
				rosterEndTime = iterFlight->second->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;
				rosterStartTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterStartTime);
				rosterEndTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterEndTime);
				rosterDurationMinute = static_cast<int>(iterFlight->second->getEndTimeUtcAct() - iterFlight->second->getStartTimeUtcAct()) / 60;
			}
		}

		_ruleViolation.SetParam("rosterStartTime", TimeUtils::Format(rosterStartTime, "yyyy-mm-dd HH:mm"));
		_ruleViolation.SetParam("rosterEndTime", TimeUtils::Format(rosterEndTime, "yyyy-mm-dd HH:mm"));
		_ruleViolation.SetParam("rosterDurationMinute", TimeUtils::MinutesTohhmm(rosterDurationMinute));

		const auto teProgramCoursePnr = this->_dbData->tmProgramCoursePnrIndex->getByProgramCourseId(teProgramCourse->parentId >0 ? teProgramCourse->parentId : teProgramCourse->id);
		if (teProgramCoursePnr == nullptr) { 
			//标准化配置，按TmCourse配置检查
			const auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(teProgramCourse->courseId, this->GetDataContext());
			if (tmCourse == nullptr) {
				Logger::getRuleLogger()->error("[CheckCourseTimePeriod] TmCourse is null.courseId={}", teProgramCourse->courseId);
				return true;
			}

			//检查培训课程Time Period限制 - 开始时间和结束时间
			if (!CheckCourseTimePeriod(rosterStartTimeMinute, rosterEndTimeMinute, tmCourse)) {
				passAllRule = false;

				ThrowRuleViolationForCourseTimePeriod(roster, teProgramCourse, tmCourse, nullptr);

				//if (isTrainee) {
				//	//获得该课程的所有教员(COF)，检查教员是否满足课程要求
				//	const auto cofRosters = TrainingCourseUtils::GetInstructorRostersOnCourse(teProgramCourse->groupId, this->GetDataContext());
				//	for (auto& cofRoster : cofRosters) {
				//		ThrowRuleViolationForCourseTimePeriod(cofRoster.get(), teProgramCourse, tmCourse, nullptr);
				//	}
				//}

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}

		}
		else {
			//存在个性化配置，按TmProgramCoursePnr配置检查

			//检查培训课程Time Period限制 - 开始时间和结束时间
			if (!CheckCourseTimePeriod(rosterStartTimeMinute, rosterEndTimeMinute, teProgramCoursePnr)) {
				passAllRule = false;
				ThrowRuleViolationForCourseTimePeriod(roster, teProgramCourse, nullptr, teProgramCoursePnr);

				//if (isTrainee) {
				//	//获得该课程的所有教员(COF)，检查教员是否满足课程要求
				//	const auto cofRosters = TrainingCourseUtils::GetInstructorRostersOnCourse(teProgramCourse->groupId, this->GetDataContext());
				//	for (auto& cofRoster : cofRosters) {
				//		ThrowRuleViolationForCourseTimePeriod(cofRoster.get(), teProgramCourse, nullptr, teProgramCoursePnr);
				//	}
				//}

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
	}
	return passAllRule;
}

//检查训练课程TimePeriod合规 - 开始时间和结束时间
bool LimitCourseTimePeriodForEvaFdRule::CheckCourseTimePeriod(const int rosterStartTimeMinute, const int rosterEndTimeMinute, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const {
	bool passAllRule = true;
	if (programCoursePnr->timePeriodOption == "MUST") {
		bool valid = false;
		for (std::size_t i = 0; i < programCoursePnr->timePeriodEndMinutes.size(); i++) {
			int timePeriodStartMinute = programCoursePnr->timePeriodStartMinutes[i];
			int timePeriodEndMinute = programCoursePnr->timePeriodEndMinutes[i];

			if (TimeUtils::IsTimesInRange(rosterStartTimeMinute, timePeriodStartMinute, timePeriodEndMinute) &&
				TimeUtils::IsTimesInRange(rosterEndTimeMinute, timePeriodStartMinute, timePeriodEndMinute)) {
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

bool LimitCourseTimePeriodForEvaFdRule::CheckCourseTimePeriod(const int rosterStartTimeMinute, const int rosterEndTimeMinute, const std::shared_ptr<TmCourse>& tmCourse) const {
	bool passAllRule = true;
	if (tmCourse->timePeriodOption == "MUST") {
		bool valid = false;
		for (std::size_t i = 0; i < tmCourse->timePeriodEndMinutes.size(); i++) {
			int timePeriodStartMinute = tmCourse->timePeriodStartMinutes[i];
			int timePeriodEndMinute = tmCourse->timePeriodEndMinutes[i];

			if (TimeUtils::IsTimesInRange(rosterStartTimeMinute, timePeriodStartMinute, timePeriodEndMinute) &&
				TimeUtils::IsTimesInRange(rosterEndTimeMinute , timePeriodStartMinute , timePeriodEndMinute)) {
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

void LimitCourseTimePeriodForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitCourseTimePeriodForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitCourseTimePeriodForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitCourseTimePeriodForEvaFdRule::ThrowRuleViolationForCourseTimePeriod(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& teProgramCourse, const std::shared_ptr<TmCourse>& tmCourse, const std::shared_ptr<TmProgramCoursePnr>& teProgramCoursePnr) const{
	string trainingCourseTimePeriod = teProgramCoursePnr == nullptr ? tmCourse->timePeriod : teProgramCoursePnr->timePeriod;
	string rosterStartTime = _ruleViolation.GetParam("rosterStartTime");
	string rosterEndTime = _ruleViolation.GetParam("rosterEndTime");
	string courseId = teProgramCourse == nullptr ? "" : StringUtils::lltos(teProgramCourse->courseId);
	string programCourseId = teProgramCourse == nullptr ? "" : StringUtils::lltos(teProgramCourse->id);
	string programCoursePnrId = teProgramCoursePnr == nullptr ? "" : StringUtils::lltos(teProgramCoursePnr->id);

	//排班时间段不能超出培训课程时间段
	std::string msg = "The roster period ({0:rosterStartTime}-{1:rosterEndTime}) of crew ({2:crewId}) cannot exceed the training course period ({3:trainingCourseTimePeriod}).";
	msg = StringUtils::Format(msg, rosterStartTime, rosterEndTime, roster->idcrew, trainingCourseTimePeriod);

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
	rv->operation_result.insert(pair<string, string>("trainingCourseTimePeriod", trainingCourseTimePeriod));
	rv->operation_result.insert(pair<string, string>("rosterStartTime", rosterStartTime));
	rv->operation_result.insert(pair<string, string>("rosterEndTime", rosterEndTime));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("programCoursePnrId", programCoursePnrId));
	rv->operation_result.insert(pair<string, string>("cofCrewId", roster->idcrew));
	_ruleViolation.AddRuleViolations(rv);
}
