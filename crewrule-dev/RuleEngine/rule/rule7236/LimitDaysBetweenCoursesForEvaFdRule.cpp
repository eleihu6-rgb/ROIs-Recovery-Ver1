/**
 * @file LimitDaysBetweenCoursesForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include <climits>
#include "../RuleSytem.h"
#include "LimitDaysBetweenCoursesForEvaFdRule.h"
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

//根据父课程分组
map<long long, vector<std::shared_ptr<TmProgramCourse>>> GetProgramCourseMapByParentId(const vector<std::shared_ptr<TmProgramCourse>>& allProgramCourseList) {
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMapBasedParent;
	for (const auto& programCourse : allProgramCourseList) {
		programCourseMapBasedParent[programCourse->parentId].emplace_back(programCourse);
	}
    return programCourseMapBasedParent;
}

bool LimitDaysBetweenCoursesForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
	if (this->_ruleParams.empty() || crew == nullptr) {
		return true;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : crew->rosterList) {
		rosters.emplace_back(roster.get());
	}

	if (rosters.empty()) {
		return true;
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

	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	bool passAllRule = true;
	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);

	//检查课程间限制
	const auto programCourseMap = TrainingCourseUtils::GetProgramCourseInProgram(crew, this->GetDataContext());
	for (auto& pair : programCourseMap) {
        auto& allProgramCourseList = pair.second;//Program中所有已排课的子课程列表
		if (allProgramCourseList.size() <= 1) {
			continue;
		}

		map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMapBasedParent = GetProgramCourseMapByParentId(allProgramCourseList);
		for (auto& kv : programCourseMapBasedParent) {
            auto currParentId = kv.first;
			auto& currChildRosterProgramCourseList = kv.second;

			//按startTime升序排序
			std::sort(currChildRosterProgramCourseList.begin(), currChildRosterProgramCourseList.end(), [](shared_ptr<TmProgramCourse>& a, shared_ptr<TmProgramCourse>& b) {
				return a->startTime < b->startTime;
			});

			//获得课程间限制规则
			auto tmProgramCourseMoreList = _dbData->tmProgramCourseMoreIndex->getByProgramCourseId(currParentId);

			for (auto& tmProgramCourseMore : tmProgramCourseMoreList) {
				//获得依赖的计划课程
				auto dependenceParentProgramCourse = _dbData->tmProgramCourseIndex->getRootByProgramId(currChildRosterProgramCourseList[0]->programId, tmProgramCourseMore->dependence);
				if (dependenceParentProgramCourse == nullptr) {
					continue;
				}
				auto dependenceChildProgramCourseList = _dbData->tmProgramCourseIndex->getChildrenByParentId(dependenceParentProgramCourse->id);
				if (dependenceChildProgramCourseList.empty()) {
					continue;
				}
				//按startTime升序排序
				std::sort(dependenceChildProgramCourseList.begin(), dependenceChildProgramCourseList.end(), [](shared_ptr<TmProgramCourse>& a, shared_ptr<TmProgramCourse>& b) {
					return a->startTime < b->startTime;
					});

				bool valid = CheckRule(currChildRosterProgramCourseList, dependenceChildProgramCourseList, tmProgramCourseMore, crew, offsetTZMinutes);
				if (!valid) {
					passAllRule = false;
					if (!IsCheckAllRule()) {
						return passAllRule;
					}
				}
			}
		}
	}
	return passAllRule;
}

//课程间隔天数限制
bool LimitDaysBetweenCoursesForEvaFdRule::CheckRule(const vector<std::shared_ptr<TmProgramCourse>>& currChildRosterProgramCourseList, const vector<std::shared_ptr<TmProgramCourse>>& dependenceChildProgramCourseList,
	const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const {
	if (currChildRosterProgramCourseList.empty() || dependenceChildProgramCourseList.empty()) {
		return true;
	}

	std::shared_ptr<TmProgramCourse> currProgramCourse = nullptr;
	std::shared_ptr<TmProgramCourse> prevProgramCourse = nullptr;
	//currChildRosterProgramCourseList与dependenceChildProgramCourseList已经按startTime升序排序，courseSeq小的要求先排
	if (currChildRosterProgramCourseList[0]->courseSortSeq > dependenceChildProgramCourseList[0]->courseSortSeq) {
        prevProgramCourse = dependenceChildProgramCourseList[dependenceChildProgramCourseList.size() - 1];
		currProgramCourse = currChildRosterProgramCourseList[0];
	}
	else {
		prevProgramCourse = currChildRosterProgramCourseList[currChildRosterProgramCourseList.size() - 1];
		currProgramCourse = dependenceChildProgramCourseList[0];
	}

	//间隔n个日历日（不包括开始日期和结束日期）
	int actGap = (int)std::fabs(TimeUtils::GetCalendarDaysInBetween(prevProgramCourse->endTime, currProgramCourse->startTime, offsetTZMinutes));

	if (actGap < tmProgramCourseMore->minGap || actGap > tmProgramCourseMore->maxGap) {
		auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(currChildRosterProgramCourseList[0]->courseId, this->GetDataContext());
		if (tmCourse != nullptr) {
			_ruleViolation.SetParam("currCourseCode", tmCourse->courseCode);
		}
		tmCourse = TrainingCourseUtils::GetCourseByCourseId(dependenceChildProgramCourseList[0]->courseId, this->GetDataContext());
		if (tmCourse != nullptr) {
			_ruleViolation.SetParam("prevCourseCode", tmCourse->courseCode);
		}
		auto tmProgram = _dbData->tmProgramIndex->getById(currChildRosterProgramCourseList[0]->programId);
		if (tmProgram != nullptr) {
			_ruleViolation.SetParam("programName", tmProgram->name);
		}

		_ruleViolation.SetParam("currProgramCourseId", StringUtils::lltos(currProgramCourse->id));
		_ruleViolation.SetParam("prevProgramCourseId", StringUtils::lltos(prevProgramCourse->id));
		_ruleViolation.SetParam("gap", StringUtils::itos(actGap));
		_ruleViolation.SetParam("minGap", StringUtils::itos(tmProgramCourseMore->minGap, true));
		_ruleViolation.SetParam("maxGap", StringUtils::itos(tmProgramCourseMore->maxGap, true));
		ThrowRuleViolationForGapBetweenCourses(currProgramCourse, tmProgramCourseMore);
		return false;
	}
	return true;
}

void LimitDaysBetweenCoursesForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitDaysBetweenCoursesForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitDaysBetweenCoursesForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitDaysBetweenCoursesForEvaFdRule::ThrowRuleViolationForGapBetweenCourses(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore) const {
	string gap = _ruleViolation.GetParam("gap");
	string minGap = _ruleViolation.GetParam("minGap");
	string maxGap = _ruleViolation.GetParam("maxGap");

	string programName = _ruleViolation.GetParam("programName");
	string currProgramCourseId = _ruleViolation.GetParam("currProgramCourseId");
	string prevProgramCourseId = _ruleViolation.GetParam("prevProgramCourseId");
	string currCourseCode = _ruleViolation.GetParam("currCourseCode");
	string prevCourseCode = _ruleViolation.GetParam("prevCourseCode");

	//Crew(XXX)的训练计划(XXX)的训练课程(XXX)间隔天数不在允许XXX范围内
	std::string msg = "Course ({0:prevCourseCode}) and course({1:currCourseCode}) does not meet the interval requirement of {2:minGap}-{3:maxGap} days";
	msg = StringUtils::Format(msg, prevCourseCode, currCourseCode, minGap, (maxGap == StringUtils::itos(INT_MAX) ? "" : maxGap) );

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		//rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->rosterId = programCourse->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = -1;
	rv->segmentId = programCourse->fltId;
	rv->startDTUtc = programCourse->startTime;
	rv->endDTUtc = programCourse->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("gap", gap));
	rv->operation_result.insert(pair<string, string>("minGap", minGap));
	rv->operation_result.insert(pair<string, string>("maxGap", maxGap));
	rv->operation_result.insert(pair<string, string>("programId", std::to_string(programCourse->programId)));
	rv->operation_result.insert(pair<string, string>("programName", programName));
	rv->operation_result.insert(pair<string, string>("currProgramCourseId", currProgramCourseId));
	rv->operation_result.insert(pair<string, string>("prevProgramCourseId", prevProgramCourseId));
	rv->operation_result.insert(pair<string, string>("currCourseCode", currCourseCode));
	rv->operation_result.insert(pair<string, string>("prevCourseCode", prevCourseCode));
	rv->operation_result.insert(pair<string, string>("tmProgramCourseMoreId", std::to_string(tmProgramCourseMore->id)));

	_ruleViolation.AddRuleViolations(rv);
}

