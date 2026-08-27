/**
 * @file RestrictInstructorHoldRoleForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include <climits>
#include "../RuleSytem.h"
#include "RestrictInstructorHoldRoleForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"

bool RestrictInstructorHoldRoleForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
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

	//map<资质名称，该资质对应的人员资质列表>
	map<string, vector<std::shared_ptr<CREW_QUALIFICATION>>> crewQualMap = GetCrewQualMap(crew);

	//crew->qualificationList
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);

		//获得crew作为学员最早复训课程未通过的时间
		time_t earliestCourseFailTime = GetEarliestCourseFailTime(crew, ruleParam);

		for (auto& roster : rosters) {
			////获得资质最早过期时间
			//time_t earliestExpiryTime = GetEarliestExpiryTimeOfQual(ruleParam._crewQuals, crew, checkedStartTime, checkedEndTime);
			auto& tmProgramCourseInstructorList = _dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
			for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
				if (!ruleParam._prohibitedRolesMatch.Match(tmProgramCourseInstructor->role)) {
					continue;
				}

				//场景1：若复训课程不合格，则不能胜任X角色的教员
				bool valid = CheckRule(earliestCourseFailTime, tmProgramCourseInstructor, ruleParam);
				if (!valid) {
					ThrowRuleViolationForCourseFail(roster, ruleParam);
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}

				//场景2：资质过期，则不能胜任X角色的教员
				valid = CheckRule(tmProgramCourseInstructor, crewQualMap, crew, checkedStartTime, checkedEndTime, ruleParam);
				if (!valid) {
					ThrowRuleViolationForQualExpire(roster, ruleParam);
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
			}
		}
	}
	return passAllRule;
}

const map<string, vector<std::shared_ptr<CREW_QUALIFICATION>>> RestrictInstructorHoldRoleForEvaFdRule::GetCrewQualMap(const std::shared_ptr<CREW>& crew) const {
	map<string, vector<std::shared_ptr<CREW_QUALIFICATION>>> crewQualMap;//map<资质名称，该资质对应的人员资质列表(必须按开始时间升序排序)>
	for (auto& crewQual : crew->qualificationList) {
		auto iter = crewQualMap.find(crewQual->qual);
		if (iter == crewQualMap.end()) {
			vector<std::shared_ptr<CREW_QUALIFICATION>> list;
			list.emplace_back(crewQual);
			crewQualMap.insert(std::make_pair(crewQual->qual, list));
		}
		else {
			iter->second.emplace_back(crewQual);
		}
	}
	//由于crew->qualificationList已经按时间排序，这里crewQualMap.value不在排序
	return crewQualMap;
}

const time_t RestrictInstructorHoldRoleForEvaFdRule::GetEarliestCourseFailTime(const std::shared_ptr<CREW>& crew, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const {
	time_t earliestCourseFailTime = -1;
	auto& tmProgramCourseList = _dbData->tmProgramCourseIndex->getByCrewId(crew->idCrew);
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (tmProgramCourse->groupId.empty()) {
			continue;
		}
		if (tmProgramCourse->trainingResult == "N") {
			//trainingResult为N，表示培训课程不合格
			auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, _dbData);
			if (tmCourse != nullptr && ruleParam._recurrentTrainingCourseCodesMatch.Match(tmCourse->courseCode)) {
				if (earliestCourseFailTime == -1 || earliestCourseFailTime > tmProgramCourse->endTime) {
					earliestCourseFailTime = tmProgramCourse->endTime;
				}
			}
		}
	}
	return earliestCourseFailTime;
}

bool RestrictInstructorHoldRoleForEvaFdRule::CheckRule(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const map<string, vector<std::shared_ptr<CREW_QUALIFICATION>>>& crewQualMap, const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const {
	static time_t INVALID_TIME = utcStrToUtc("9999-12-31");

	auto& requiredCrewQuals = ruleParam._crewQuals;
	if (requiredCrewQuals.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (auto& pair : crewQualMap) {
		auto& qual = pair.first;
		auto& qualList = pair.second;

		if (std::find(requiredCrewQuals.begin(), requiredCrewQuals.end(), qual) == requiredCrewQuals.end()) {
			continue;
		}
		
		bool valid = false;
		for (size_t i = 0; i < qualList.size(); i++) {
			auto& currQual = qualList.at(i);
			time_t effUtc = (currQual->issuedUtc == INVALID_TIME) ? INT_MIN : currQual->issuedUtc;
			time_t expUtc = (currQual->expiryUtc == INVALID_TIME) ? INT_MAX : currQual->expiryUtc;

			if ((effUtc <= programCourseInstructor->startTime) && (expUtc < 0 || expUtc > programCourseInstructor->endTime))
			{
				valid = true;
				break;
			}
		}
		
		if (!valid) {
			passAllRule = false;
			break;
		}
	}
	return passAllRule;
}

bool RestrictInstructorHoldRoleForEvaFdRule::CheckRule(const time_t earliestCourseFailTime, const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const {
	if (earliestCourseFailTime > 0 && programCourseInstructor->startTime > earliestCourseFailTime) {
		return false;
	}
	return true;
}

void RestrictInstructorHoldRoleForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(RestrictInstructorHoldRoleForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(RestrictInstructorHoldRoleForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void RestrictInstructorHoldRoleForEvaFdRule::ThrowRuleViolationForCourseFail(const ROSTER* roster, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const {
	//机组人员复训课程(XXX)成绩不合格，不能担任教员X角色。
	string msg = "Crew recurrent course ({0:courseCode}) failed, cannot be assigned the {1:role} role.";
	msg = StringUtils::Format(msg, ruleParam._recurrentTrainingCourseCodes, ruleParam._prohibitedRoles);

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
	rv->operation_result.insert(pair<string, string>("recurrentTrainingCourseCodes", ruleParam._recurrentTrainingCourseCodes));
	rv->operation_result.insert(pair<string, string>("prohibitedRoles", ruleParam._prohibitedRoles));
	_ruleViolation.AddRuleViolations(rv);
}

void RestrictInstructorHoldRoleForEvaFdRule::ThrowRuleViolationForQualExpire(const ROSTER* roster, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const {

	//成员资质过期, 不能担任教员X角色。
	string msg = "Crew qualification ({0:qual}) has expired, cannot be assigned the ({1:role}) role.";
	msg = StringUtils::Format(msg, ruleParam._crewQual, ruleParam._prohibitedRoles);

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
	rv->operation_result.insert(pair<string, string>("crewQual", ruleParam._crewQual));
	rv->operation_result.insert(pair<string, string>("prohibitedRoles", ruleParam._prohibitedRoles));
	_ruleViolation.AddRuleViolations(rv);
}