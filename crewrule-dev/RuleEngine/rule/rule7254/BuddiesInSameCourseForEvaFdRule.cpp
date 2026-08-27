/**
 * @file BuddiesInSameCourseForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "BuddiesInSameCourseForEvaFdRule.h"
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
#include <iterator>

bool BuddiesInSameCourseForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
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

	//按program分组，获得已排课的programCourse。返回值：map<programId, 培训计划program下已排课排课的programCourse>
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap = TrainingCourseUtils::GetProgramCourseInProgram(crew, this->GetDataContext());

	for (auto& pair : programCourseMap) {
		long long programId = pair.first;
		vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList = pair.second;

		map<long long, set<string>> courseBuddyCrewIdMap = TrainingCourseUtils::GetProgramBuddyMap(programId, tmProgramCourseList, _dbData);//map<courseId, buddy的crewId列表>

		for (auto& tmProgramCourse : tmProgramCourseList) {
			if (!CheckRule(tmProgramCourse, courseBuddyCrewIdMap, crew)) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					break;
				}
			}
			
		}
	}
	return passAllRule;
}

bool BuddiesInSameCourseForEvaFdRule::CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const map<long long, set<string>>& courseBuddyCrewIdMap, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	auto iterBuddy = courseBuddyCrewIdMap.find(tmProgramCourse->courseId);
	if (iterBuddy == courseBuddyCrewIdMap.end()) {
		//课程tmProgramCourse->courseId，无buddy要求，因此直接退出返回true
		return true;
	}
	auto& requiredBuddyCrewIds = iterBuddy->second;//当前programCourse课程需要的buddy

	set<string> actualOtherCrewIds;//与tmProgramCourse.groupId在同一节课的所有其他学员（不包含自己)
	auto programCoursesInSameGroup = _dbData->tmProgramCourseIndex->getByGroupId(tmProgramCourse->groupId);
	for (auto& programCourseInSameGroup : programCoursesInSameGroup) {
		if (programCourseInSameGroup->crewId != crew->idCrew) {
			actualOtherCrewIds.emplace(programCourseInSameGroup->crewId);
		}
	}
	
	//// 检查 requiredBuddyCrewIds 是否是 actualOtherCrewIds 的子集，若不是子集，则存在buddy没有安排到同一节课，此时需要告警
	//if (!std::includes(actualOtherCrewIds.begin(), actualOtherCrewIds.end(), requiredBuddyCrewIds.begin(), requiredBuddyCrewIds.end())) {
	//	valid = false;
	//}

	set<string> missBuddyCrewIds;
	//集合 requiredBuddyCrewIds 减去 actualOtherCrewIds ，若不是空集合，则获得未排课的buddy，此时需要告警
	std::set_difference(requiredBuddyCrewIds.begin(), requiredBuddyCrewIds.end(),
		actualOtherCrewIds.begin(), actualOtherCrewIds.end(),
		std::inserter(missBuddyCrewIds, missBuddyCrewIds.begin()));
	if (!missBuddyCrewIds.empty()) {
		valid = false;
		ThrowRuleViolation(tmProgramCourse, missBuddyCrewIds);
		//ThrowRuleViolationForBuddy(tmProgramCourse, missBuddyCrewIds);
	}

	return valid;
}

void BuddiesInSameCourseForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(BuddiesInSameCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(BuddiesInSameCourseForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void BuddiesInSameCourseForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const set<string>& missBuddyCrewIds) const {
	auto& dbData = this->GetDataContext();
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
	auto tmProgram = dbData->tmProgramIndex->getById(tmProgramCourse->programId);

	//學員【xx】在program【xx】的課程【xx】沒有與buddy學員【xx】安排在同樣的日期時間
	std::string msg = "The crew {0:crewId} for course ({1:courseCode}) in program ({2:programName}) is not scheduled at the same time as buddy Crew {3:missBuddyCrewIds}.";
	msg = StringUtils::Format(msg, tmProgramCourse->crewId, (tmCourse == nullptr ? "N/A" : tmCourse->courseCode), (tmProgram == nullptr ? "N/A" : tmProgram->name), StringUtils::Join(missBuddyCrewIds, "|"));

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
	rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(tmProgramCourse->programId)));
	rv->operation_result.insert(pair<string, string>("programName", (tmProgram == nullptr ? "N/A" : tmProgram->name)));
	rv->operation_result.insert(pair<string, string>("courseId", StringUtils::lltos(tmProgramCourse->courseId)));
	rv->operation_result.insert(pair<string, string>("courseCode", (tmCourse == nullptr ? "N/A" : tmCourse->courseCode)));
	rv->operation_result.insert(pair<string, string>("missBuddyCrewIds", StringUtils::Join(missBuddyCrewIds, "|")));
	_ruleViolation.AddRuleViolations(rv);
}

void BuddiesInSameCourseForEvaFdRule::ThrowRuleViolationForBuddy(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const set<string>& missBuddyCrewIds) const {
	auto& dbData = this->GetDataContext();
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
	auto tmProgram = dbData->tmProgramIndex->getById(tmProgramCourse->programId);

	//學員【xx】在program【xx】的課程【xx】沒有與buddy學員【xx】安排在同樣的日期時間
	std::string msg = "The crew {0:crewId} for course ({1:courseCode}) in program ({2:programName}) is not scheduled at the same time as buddy Crew {3:missBuddyCrewIds}.";
	msg = StringUtils::Format(msg, tmProgramCourse->crewId, (tmCourse == nullptr ? "N/A" : tmCourse->courseCode), (tmProgram == nullptr ? "N/A" : tmProgram->name), StringUtils::Join(missBuddyCrewIds, "|"));

	for (auto& buddyCrewId : missBuddyCrewIds) {
		auto iterCrew = dbData->crewIdMap.find(buddyCrewId);
		if (iterCrew == dbData->crewIdMap.end()) {
			continue;
		}
		auto& buddyCrew = iterCrew->second;
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		if (_ruleViolation.GetRuleLegality() != nullptr) {
			_ruleViolation.GetRuleLegality()->isLegal = false;
			_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

			rv->rosterId = -1;
			rv->crewId = buddyCrew->idCrew;
			_ruleViolation.SetLegalityMessage(buddyCrew, msg);
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		}
		else {
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
		}

		rv->pairingId = -1;
		rv->startDTUtc = tmProgramCourse->startTime;
		rv->endDTUtc = tmProgramCourse->endTime;
		rv->violation_msg = msg;
		rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(tmProgramCourse->programId)));
		rv->operation_result.insert(pair<string, string>("programName", (tmProgram == nullptr ? "N/A" : tmProgram->name)));
		rv->operation_result.insert(pair<string, string>("courseId", StringUtils::lltos(tmProgramCourse->courseId)));
		rv->operation_result.insert(pair<string, string>("courseCode", (tmCourse == nullptr ? "N/A" : tmCourse->courseCode)));
		rv->operation_result.insert(pair<string, string>("missBuddyCrewIds", StringUtils::Join(missBuddyCrewIds, "|")));
		_ruleViolation.AddRuleViolations(rv);
	}

}
