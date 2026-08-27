/**
 * @file RequiredMinNumOfCourseForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "RequiredMinNumOfCourseForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include <climits>
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"

bool RequiredMinNumOfCourseForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
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
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crewBase, this->GetDataContext());

	//按program分组，获得已排课的programCourse。返回值：map<programId, 培训计划program下已经排课的programCourse>
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap = TrainingCourseUtils::GetProgramCourseInProgram(crew, this->GetDataContext());

	vector<std::shared_ptr<TmProgramCourse>> allProgramCourseList;
	for (auto& pair : programCourseMap) {
		allProgramCourseList.insert(allProgramCourseList.end(), pair.second.begin(), pair.second.end());
	}
	this->_dbData->tmProgramCourseIndex->sortByStartTime(allProgramCourseList);
	for (auto& pair : programCourseMap) {
		auto& programId = pair.first;
		auto& tmProgramCourseList = pair.second;

		for (const auto& ruleParam : _ruleParams) {
			if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
				continue;
			}
			_ruleViolation.SetRuleParam(ruleParam);

			bool valid = CheckRule(programId, tmProgramCourseList, allProgramCourseList, offsetTZMinutes, crew, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

//tmProgramCourseList: 必须已经按startTime升序排序
bool RequiredMinNumOfCourseForEvaFdRule::CheckRule(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const vector<std::shared_ptr<TmProgramCourse>>& allProgramCourseList, const int offsetTZMinutes, const std::shared_ptr<CREW>& crew, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const {
	bool passAllRule = true;

	auto& tmProgram = _dbData->tmProgramIndex->getById(programId);
	if (tmProgram == nullptr) return true;
	auto& tmFootprint = _dbData->tmFootprintIndex->getById(tmProgram->footprintId);
	if (tmFootprint == nullptr) return true;

	if (!ruleParam.MatchFootprintSubType(tmFootprint)) {
		return true;
	}

	auto [limitStartTime, limitEndTime] = GetLimitTimeWindow(tmProgram, tmProgramCourseList, offsetTZMinutes, ruleParam);
	if (limitStartTime < 0 || limitEndTime < 0) {
		Logger::getRuleLogger()->debug("[CheckRule] [WARN] limitStartTime:{}, limitEndTime:{}, programId:{}, firstDutyDate:{}, startReferenceTime:{}, endReferenceTime:{}", 
			limitStartTime, limitEndTime, tmProgram->id, tmProgram->firstDutyDate, ruleParam._startReferenceTime, ruleParam._endReferenceTime);
		return true;
	}
	
	if (ruleParam._unit == "P") {//指定时间段必须安排X课程最小Y节
		bool valid = false, matchCrew = false;
		int count = 0;
		for (auto& tmProgramCourse : allProgramCourseList) {
			if (ruleParam.MatchCrewFleets(crew, tmProgramCourse)) {
				matchCrew = true;
				if (ruleParam.MatchCourseCode(tmProgramCourse)
					&& (tmProgramCourse->startTime >= limitStartTime && tmProgramCourse->endTime <= limitEndTime)) {
					count++;
					if (count >= ruleParam._minLimitsOfCourse) {
						valid = true;
						break;
					}
				}
			}
		}
		if (!valid && matchCrew) {
			passAllRule = false;
			ThrowRuleViolation(tmProgram, limitStartTime, limitEndTime, ruleParam);
			//ThrowRuleViolationForPeriod(tmProgram, limitStartTime, limitEndTime, ruleParam);
		}
	}
	else if (ruleParam._unit == "M") {//指定时间段每个月必须安排X课程最小Y节
		int MonthNum = TimeUtils::DiffCalendarMonth(limitStartTime, limitEndTime);
		time_t limitStartMonthBase = Utility::GetInstancePtr()->getLocalMonthStartInUTC(limitStartTime, offsetTZMinutes);

		size_t index = 0;
		int period = ruleParam._period <= 0 ? 1 : ruleParam._period;
		for (int i = 0; i < MonthNum; i += period) {
			bool valid = false, matchCrew = false;

			time_t limitStartMonth = TimeUtils::AddMonth(limitStartMonthBase, offsetTZMinutes, i);
			time_t limitEndMonth = TimeUtils::AddMonth(limitStartMonthBase, offsetTZMinutes, i + period) - 1;

			int count = 0;
			for (; index < allProgramCourseList.size(); index++) {
				auto& tmProgramCourse = allProgramCourseList.at(index);
				if (ruleParam.MatchCrewFleets(crew, tmProgramCourse)) {
					matchCrew = true;
					if (ruleParam.MatchCourseCode(tmProgramCourse)
						&& (tmProgramCourse->startTime >= limitStartMonth && tmProgramCourse->endTime <= limitEndMonth)) {
						count++;
						if (count >= ruleParam._minLimitsOfCourse) {
							valid = true;
							break;
						}
					}
				}
			}
			if (!valid && matchCrew) {
				passAllRule = false;
				ThrowRuleViolation(tmProgram, limitStartMonth, limitEndMonth, ruleParam);
				//ThrowRuleViolationForMonthly(tmProgram, limitStartMonth, limitEndMonth, ruleParam);
			}
		}
	}
	return passAllRule;
}

const std::tuple<time_t, time_t> RequiredMinNumOfCourseForEvaFdRule::GetLimitTimeWindow(const std::shared_ptr<TmProgram>& tmProgram, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const int offsetTZMinutes, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const {

	//开始时间是FDD(First Duty Date)，若FDD未配置，则不告警
	static time_t INVALID_TIME = utcStrToUtc("9999-12-31");
	if (ruleParam._startReferenceTime == "FDD" && (tmProgram->firstDutyDate == INVALID_TIME || tmProgram->firstDutyDate <= 0)) {
		return std::make_tuple(-1, -1);
	}

	time_t limitStartTime = GetReferenceTime(tmProgram, tmProgramCourseList, ruleParam._startReferenceTime, offsetTZMinutes);
	if (limitStartTime > 0) {
		limitStartTime += (time_t)ruleParam._beginDay * 24 * 60 * 60;
	}

	time_t limitEndTime = GetReferenceTime(tmProgram, tmProgramCourseList, ruleParam._endReferenceTime, offsetTZMinutes);
	if (limitEndTime > 0) {
		limitEndTime += (time_t)ruleParam._endDay * 24 * 60 * 60;
	}
	return std::make_tuple(limitStartTime, limitEndTime);
}

const time_t RequiredMinNumOfCourseForEvaFdRule::GetReferenceTime(const std::shared_ptr<TmProgram>& tmProgram, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const string& referenceTime, const int offsetTZMinutes) const {
	static time_t INVALID_TIME = utcStrToUtc("9999-12-31");
	if (referenceTime == "IOE") {
		for (auto& tmProgramCourse : tmProgramCourseList) {
			//前提tmProgramCourseList是已经排序按startTime升序排序，并且是已排课
			if (tmProgramCourse->simioe == "IOE" && !tmProgramCourse->groupId.empty()) {
				return (tmProgramCourse->startTime == INVALID_TIME || tmProgramCourse->startTime <= 0) ? -1 : tmProgramCourse->startTime;
			}
		}
	}
	else if (referenceTime == "FDD") {
		//First Duty Date是本地时间，需要转换成UTC时间
		return (tmProgram->firstDutyDate == INVALID_TIME || tmProgram->firstDutyDate <= 0) ? this->_dbData->scenario.endDtUTC : (tmProgram->firstDutyDate - (time_t)offsetTZMinutes * 60);
	}
	return -1;
}

void RequiredMinNumOfCourseForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(RequiredMinNumOfCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(RequiredMinNumOfCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void RequiredMinNumOfCourseForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgram>& tmProgram, const time_t limitStartMonth, const time_t limitEndMonth, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const {
	//課程(xx)在指定日期範圍內尚未安排
	string msg = "The course ({0:courseCode}) remains unscheduled for the required date range.";
	msg = StringUtils::Format(msg, ruleParam._courseCodes);

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
	rv->startDTUtc = limitStartMonth;
	rv->endDTUtc = limitEndMonth;

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(tmProgram->id)));
	rv->operation_result.insert(pair<string, string>("courseCodes", ruleParam._courseCodes));
	rv->operation_result.insert(pair<string, string>("minNumber", StringUtils::itos(ruleParam._minLimitsOfCourse)));
	_ruleViolation.AddRuleViolations(rv);
}

void RequiredMinNumOfCourseForEvaFdRule::ThrowRuleViolationForMonthly(const std::shared_ptr<TmProgram>& tmProgram, const time_t limitStartMonth, const time_t limitEndMonth, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const {
	//机组人员每月至少安排X课Y节。
	string msg = "The number of courses ({0:courseCode}) per month is less than {1:minNum}.";
	msg = StringUtils::Format(msg, ruleParam._courseCodes, ruleParam._minLimitsOfCourse);

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
	rv->startDTUtc = limitStartMonth;
	rv->endDTUtc = limitEndMonth;

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("ruleId", "7249.1"));
	rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(tmProgram->id)));
	rv->operation_result.insert(pair<string, string>("courseCodes", ruleParam._courseCodes));
	rv->operation_result.insert(pair<string, string>("minNumber", StringUtils::itos(ruleParam._minLimitsOfCourse)));
	_ruleViolation.AddRuleViolations(rv);
}

void RequiredMinNumOfCourseForEvaFdRule::ThrowRuleViolationForPeriod(const std::shared_ptr<TmProgram>& tmProgram, const time_t limitStartTime, const time_t limitEndTime, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const {
	//机组人员在指定时间段内至少安排X课Y节。
	string msg = "The number of courses ({0:courseCode}) within the period is less than {1:minNum}.";
	msg = StringUtils::Format(msg, ruleParam._courseCodes, ruleParam._minLimitsOfCourse);

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
	rv->startDTUtc = limitStartTime;
	rv->endDTUtc = limitEndTime;

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("ruleId", "7249.2"));
	rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(tmProgram->id)));
	rv->operation_result.insert(pair<string, string>("courseCodes", ruleParam._courseCodes));
	rv->operation_result.insert(pair<string, string>("minNumber", StringUtils::itos(ruleParam._minLimitsOfCourse)));
	_ruleViolation.AddRuleViolations(rv);
}