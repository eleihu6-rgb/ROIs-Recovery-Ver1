/**
 * @file LimitCourseWeekdayFor5JRule.cpp
 * @brief 7388法规规则类实现 - Course只能安排在指定weekday
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-07
**/

#include <numeric>
#include "../RuleSytem.h"
#include "LimitCourseWeekdayFor5JRule.h"
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
#include <algorithm>

bool LimitCourseWeekdayFor5JRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
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
	bool next = true;
	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);

	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crew, this->GetDataContext());

	for (auto& roster : rosters) {
		if (this->IsRosterOptimizerModel() && (roster->source == "PA")) {
			//RO忽略掉对预占的检查
			continue;
		}
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));

		bool valid = CheckRule(roster, offsetTZMinutes, crew);
		if (!valid) {
			passAllRule = false;
		}
	}

	return passAllRule;
}

bool LimitCourseWeekdayFor5JRule::CheckRule(const ROSTER* roster, const int offsetTZMinutes, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCoursePnrIndex = this->_dbData->tmProgramCoursePnrIndex;
	auto& tmProgramIndex = this->_dbData->tmProgramIndex;

	//检查学员课程安排时间是否在Weekday
	if (roster->pairing == nullptr) {
		return true;
	}

	for(auto& duty : roster->pairing->getDutyVec()) {
		for(auto& segment : duty->getSegmentsRead()) {
			auto programCourse = tmProgramCourseIndex->getByRosterId(roster->rosterId, segment->getDBId());
			if (programCourse == nullptr) {
				continue;
			}

			auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->GetDataContext());
			if (tmCourse == nullptr) {
				continue;
			}

			auto tmProgramCoursePnr = tmProgramCoursePnrIndex->getByProgramCourseId(programCourse->parentId);
			if (tmProgramCoursePnr == nullptr) {
				continue;
			}
		
			time_t checkInLoc = duty->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
			int weekday = TimeUtils::GetDayOfWeekend(checkInLoc) + 1;
			if (!tmProgramCoursePnr->dayOfWeeks.empty() && std::find(tmProgramCoursePnr->dayOfWeeks.begin(), tmProgramCoursePnr->dayOfWeeks.end(), weekday) == tmProgramCoursePnr->dayOfWeeks.end()) {
				valid = false;
				ThrowRuleViolation(roster, duty, programCourse, tmProgramCoursePnr, tmCourse, checkInLoc);

				if (!IsCheckAllRule()) {
					return valid;
				}
			}
		}
	}
	return valid;
}

void LimitCourseWeekdayFor5JRule::ThrowRuleViolation(const ROSTER* roster, const Duty* duty, const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const std::shared_ptr<TmCourse>& tmCourse, const time_t checkInLoc) const {
	string strCheckInLoc = utcToUtcDtString(checkInLoc);
	//课程【{courseCode}】排课日期【{date}】不符合允许的星期范围（{allowedWeekdays}）
	std::string msg = "Course {0:courseCode} scheduled date {1:checkInLoc} is not within allowed weekdays ({2:allowedWeekdays}).";
	msg = StringUtils::Format(msg, tmCourse->courseCode, strCheckInLoc, tmProgramCoursePnr->strDayOfWeek);

	SharedPtr<CREW> ppCrew = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex];
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = ppCrew->idCrew;
	rv->rosterId = programCourse->rosterId;
	rv->pairingId = roster->pairId;
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->segmentId = programCourse->fltId;
	rv->startDTUtc = programCourse->startTime;
	rv->endDTUtc = programCourse->endTime;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(std::pair<std::string, std::string>("courseCode", tmCourse->courseCode));
	rv->operation_result.insert(std::pair<std::string, std::string>("checkInLoc", strCheckInLoc));
	rv->operation_result.insert(std::pair<std::string, std::string>("allowedWeekdays", tmProgramCoursePnr->strDayOfWeek));

	_ruleViolation.AddRuleViolations(rv);
}

void LimitCourseWeekdayFor5JRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CourseWeekdayFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CourseWeekdayFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}