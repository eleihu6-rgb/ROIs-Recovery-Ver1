/**
 * @file LimitMaxGapDaysBetweenCoursesForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitMaxGapDaysBetweenCoursesForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"




bool LimitMaxGapDaysBetweenCoursesForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
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

bool LimitMaxGapDaysBetweenCoursesForEvaFdRule::CheckRule(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const {
	bool valid = true;
	for (auto& ruleParam : _ruleParams) {
		bool matched = false;
		for (size_t i = 0; i < tmProgramCourseList.size(); i++) {
			auto& tmProgramCourse = tmProgramCourseList.at(i);
			if (ruleParam.MatchParam(tmProgramCourse)) {
				matched = true;
				time_t limitStartTimeUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(tmProgramCourse->startTime, offsetTZMinutes);
				time_t limitEndTimeUtc = limitStartTimeUtc + (time_t)ruleParam._maxGapDays * 24 * 60 * 60 - 1;
				if (!ruleParam.CheckParam(i + 1, tmProgramCourseList, limitStartTimeUtc, limitEndTimeUtc)) {
					valid = false;
					ThrowRuleViolation(tmProgramCourse, ruleParam);
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
			}
		}
		if (matched) {
			//特殊需求：只要当前规则匹配到条件，则后续规则不在匹配
			break;
		}
	}

	return valid;
}

void LimitMaxGapDaysBetweenCoursesForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitMaxGapDaysBetweenCoursesForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam& ruleParam) const {

	//在program中课程中，课程{courseA} 和 课程{courseB}之间间隔天数超过 {maxGapDays} 天
	string msg = "The gap exceeds {0:maxGapDays} days between course {1:courseA} and course {2:courseB}.";
	msg = StringUtils::Format(msg, ruleParam._maxGapDays, ruleParam._courseACodes, ruleParam._courseBCodes);

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
	rv->startDTUtc = tmProgramCourse->startTime;
	rv->endDTUtc = tmProgramCourse->endTime;

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("courseA", ruleParam._courseACodes));
	rv->operation_result.insert(pair<string, string>("courseB", ruleParam._courseBCodes));
	rv->operation_result.insert(pair<string, string>("maxGapDays", StringUtils::itos(ruleParam._maxGapDays)));
	_ruleViolation.AddRuleViolations(rv);


}