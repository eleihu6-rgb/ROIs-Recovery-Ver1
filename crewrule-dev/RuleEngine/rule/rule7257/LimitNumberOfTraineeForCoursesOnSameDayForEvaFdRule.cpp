/**
 * @file LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"



bool LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
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

	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crew, this->GetDataContext());

	//获得已排课的programCourse
	vector<std::shared_ptr<TmProgramCourse>> tmProgramCourseList = TrainingCourseUtils::GetProgramCourses(crew, this->GetDataContext());

	bool valid = CheckRule(tmProgramCourseList, crew, offsetTZMinutes);
	if (!valid) {
		passAllRule = false;
		if (!this->IsCheckAllRule()) {
			return passAllRule;
		}
	}
	return passAllRule;
}

bool LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule::CheckRule(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const {
	bool valid = true;
	for (auto& ruleParam : _ruleParams) {
		for (size_t i = 0; i < tmProgramCourseList.size(); i++) {
			auto& tmProgramCourse = tmProgramCourseList.at(i);
			std::set<time_t> requiredCourseLocalDates;
			if (ruleParam.MatchParam(requiredCourseLocalDates, tmProgramCourse, offsetTZMinutes)) {
				if (!CheckRule(tmProgramCourse, requiredCourseLocalDates, offsetTZMinutes, ruleParam)) {
					valid = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
			}
		}
	}
	return valid;
}

bool LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule::CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const std::set<time_t>& requiredCourseLocalDates, const int offsetTZMinutes, const LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam& ruleParam) const {
	bool valid = true;
	auto courseIds = ruleParam.GetCourseIds(ruleParam._courseCodes);
	auto tmProgramCourseList = this->_dbData->tmProgramCourseIndex->getByCourseIds(courseIds);

	for (auto& requiredCourseLocalDate : requiredCourseLocalDates) {
		int peopleNumber = 0;
		for (auto& cofProgramCourse : tmProgramCourseList) {
			if (cofProgramCourse->groupId.empty()) {
				continue;
			}
			time_t cofStartLocalDay = TimeUtils::GetStartTimeOfDay(cofProgramCourse->startTime + (time_t)offsetTZMinutes * 60);
			time_t cofEndLocalDay = TimeUtils::GetStartTimeOfDay(cofProgramCourse->endTime + (time_t)offsetTZMinutes * 60);

			if (requiredCourseLocalDate == cofStartLocalDay) {
				peopleNumber++;
			}

			if (cofStartLocalDay != cofEndLocalDay && requiredCourseLocalDate == cofEndLocalDay) {
				peopleNumber++;
			}
		}

		if (peopleNumber > 0 && (peopleNumber < ruleParam._peopleNumberLower || peopleNumber > ruleParam._peopleNumberUpper)) {
			valid = false;
			ThrowRuleViolation(tmProgramCourse, requiredCourseLocalDate, offsetTZMinutes, ruleParam);
		}
	}
	return valid;
}

void LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const time_t requiredCourseLocalDate, const int offsetTZMinutes, const LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam& ruleParam) const {

	//课程{courseA}不符合学员人数(限制范围（在一个自然天中）)要求(peopleNumberRange)。
	string msg = "The course {0:course} doesn't meet trainee ({1:dayNums}) number requirements ({2:peopleNumberRange}).";
	msg = StringUtils::Format(msg, ruleParam._courseCodes, ruleParam._dayNums, ruleParam._peopleNumberRange);

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

	rv->pairingId = -1;
	rv->startDTUtc = requiredCourseLocalDate - (time_t)offsetTZMinutes * 60;
	rv->endDTUtc = requiredCourseLocalDate - (time_t)offsetTZMinutes * 60 + (time_t)24 * 60 * 60 * ruleParam._dayNums - 1;

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("course", ruleParam._courseCodes));
	rv->operation_result.insert(pair<string, string>("peopleNumberRange", ruleParam._peopleNumberRange));
	_ruleViolation.AddRuleViolations(rv);


}