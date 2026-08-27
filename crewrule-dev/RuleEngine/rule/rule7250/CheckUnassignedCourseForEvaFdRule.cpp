/**
 * @file CheckUnassignedCourseForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckUnassignedCourseForEvaFdRule.h"
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

bool CheckUnassignedCourseForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
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

	//按program分组，获得已排课的programCourse。返回值：map<programId, 培训计划program下所有排课的programCourse>
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap = TrainingCourseUtils::GetAllProgramCourseInProgram(crew, this->GetDataContext());

	for (auto& pair : programCourseMap) {
		long long programId = pair.first;
		auto tmProgram = this->_dbData->tmProgramIndex->getById(programId);
		if (tmProgram == nullptr || tmProgram->isSoloCourse()) {
			continue;
        }
		vector<std::shared_ptr<TmProgramCourse>> tmProgramCourseList = pair.second;
		std::sort(tmProgramCourseList.begin(), tmProgramCourseList.end(), [](const std::shared_ptr<TmProgramCourse>& a, const std::shared_ptr<TmProgramCourse>& b) {
			//多个key排序顺序：按phase升序,seq降序,groupId降序
			return std::tie(a->coursePhase, b->courseSortSeq, b->groupId) < std::tie(b->coursePhase, a->courseSortSeq, a->groupId);

		});

		if (!CheckRuleOnlyMaxSeq(programId, tmProgramCourseList)) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckUnassignedCourseForEvaFdRule::CheckRule(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList) const {
	bool valid = true;
	std::shared_ptr<TmProgramCourse> assignedProgramCourse = nullptr;//课程按seq倒序后，seq值较大的已分配program course。后续seq值较小未分配则需要告警

	set<long long> parentIds;
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (tmProgramCourse->parentId != 0) {
			parentIds.emplace(tmProgramCourse->parentId);
		}
	}

	std::shared_ptr<TmProgramCourse> prevProgramCourse = nullptr;
	bool assigned = false;//coursePhase是否有课程分配
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (parentIds.find(tmProgramCourse->id) != parentIds.end()) {
			//忽略父program course课程，仅针对子program course进行告警
			continue;
		}

		if (prevProgramCourse == nullptr || prevProgramCourse->coursePhase != tmProgramCourse->coursePhase) {
			assigned = false;
		}

		if (!tmProgramCourse->groupId.empty()) {
			assigned = true;
			assignedProgramCourse = tmProgramCourse;
		}
		else if (assigned) {
			valid = false;
			ThrowRuleViolation(assignedProgramCourse, tmProgramCourse);
		}

		prevProgramCourse = tmProgramCourse;
	}
	return valid;
}

bool CheckUnassignedCourseForEvaFdRule::CheckRuleOnlyMaxSeq(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList) const {
	bool valid = true;
	std::shared_ptr<TmProgramCourse> maxSeqProgramCourse = nullptr;//某阶段phase的最大seq的program Course

	set<long long> parentIds;
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (tmProgramCourse->parentId != 0) {
			parentIds.emplace(tmProgramCourse->parentId);
		}
	}

	std::shared_ptr<TmProgramCourse> prevProgramCourse = nullptr;
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (parentIds.find(tmProgramCourse->id) != parentIds.end()) {
			//忽略父program course课程，仅针对子program course进行告警
			continue;
		}

		if (prevProgramCourse == nullptr || prevProgramCourse->coursePhase != tmProgramCourse->coursePhase) {
			maxSeqProgramCourse = tmProgramCourse;//已经按seq倒序排序，因此phase的第一个program course，就是最大
		}

		if (!maxSeqProgramCourse->groupId.empty() && tmProgramCourse->groupId.empty()) {
			valid = false;
			ThrowRuleViolation(maxSeqProgramCourse, tmProgramCourse);
		}
		prevProgramCourse = tmProgramCourse;
	}
	return valid;
}

void CheckUnassignedCourseForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckUnassignedCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckUnassignedCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckUnassignedCourseForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& assignedProgramCourse, const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const {
	auto& dbData = this->GetDataContext();
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
	auto tmProgram = dbData->tmProgramIndex->getById(tmProgramCourse->programId);

	//在训练计划（X)课程Y未分配
	std::string msg = "The previous program course ({0:courseCode}) with phase ({1:coursePhase}/{2:courseSeq}) is unassigned in the program ({3:programName}).";
	msg = StringUtils::Format(msg, (tmCourse == nullptr ? "N/A" : tmCourse->courseCode), tmProgramCourse->coursePhase, tmProgramCourse->courseSeq, (tmProgram == nullptr ? "N/A" : tmProgram->name));

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = assignedProgramCourse->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	auto roster = dbData->findRoster(assignedProgramCourse->crewId, assignedProgramCourse->rosterId);
	if (roster == nullptr) {
		rv->pairingId = -1;
	}
	else {
		rv->pairingId = roster->pairId;
	}
	rv->segmentId = assignedProgramCourse->fltId;
	rv->startDTUtc = assignedProgramCourse->startTime;
	rv->endDTUtc = assignedProgramCourse->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programCourseId", StringUtils::lltos(tmProgramCourse->id)));
	rv->operation_result.insert(pair<string, string>("courseId", (tmCourse == nullptr ? "-1" : StringUtils::lltos(tmCourse->id))));
	rv->operation_result.insert(pair<string, string>("courseCode", (tmCourse == nullptr ? "N/A" : tmCourse->courseCode)));
	rv->operation_result.insert(pair<string, string>("programId", (tmProgram == nullptr ? "-1" : StringUtils::lltos(tmProgram->id))));
	rv->operation_result.insert(pair<string, string>("programName", (tmProgram == nullptr ? "N/A" : tmProgram->name)));
	_ruleViolation.AddRuleViolations(rv);
}
