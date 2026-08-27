/**
 * @file LimitCourseRoleNumbersForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitCourseRoleNumbersForEvaFdRule.h"
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

bool LimitCourseRoleNumbersForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
		
		bool valid = CheckRule(roster);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


//检查TE/IP/CK/PNR的 min、max 人数限制
bool LimitCourseRoleNumbersForEvaFdRule::CheckRule(const ROSTER* roster) const {
	bool passAllRule = true;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	//roster从学员维度检查
	const auto programCourseList = tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : programCourseList) {
		if (programCourse->groupId.empty()) {
			//没有安排roster，人员数量检查则忽略
			continue;
		}

		if (!CheckCourseNumberOfPeople(roster, programCourse)) {
			passAllRule = false;
		}

	}

	//roster从非学员维度检查
	const auto programCourseInstructorList = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (programCourseInstructor->groupId.empty()) {
			//没有安排roster，人员数量检查则忽略
			continue;
		}

		//获得该课程的所有学员(COF)，检查教员满足人数要求
		const auto programCoursesInGroup = tmProgramCourseIndex->getByGroupId(programCourseInstructor->groupId);
		for (const auto& programCourseInGroup : programCoursesInGroup) {
			auto iterCrew = this->_dbData->crewIdMap.find(programCourseInGroup->crewId);
			if (iterCrew == this->_dbData->crewIdMap.end()) {
				Logger::getRuleLogger()->error("[CheckRule] Crew ({}) does not exist when checking role numbers.", programCourseInGroup->crewId);
				continue;
			}
			auto& cofCrew = iterCrew->second;
			for (auto& cofRoster : cofCrew->rosterList) {
				const auto cofProgramCourseList = tmProgramCourseIndex->getByRosterId(cofRoster->rosterId);
				for (auto& cofProgramCourse : cofProgramCourseList) {
					if (cofProgramCourse->groupId == programCourseInGroup->groupId) { //仅检查同一节课
						if (!CheckCourseNumberOfPeople(cofRoster.get(), programCourseInGroup)) {
							passAllRule = false;
						}
					}
				}
				if (!passAllRule) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool LimitCourseRoleNumbersForEvaFdRule::CheckCourseNumberOfPeople(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	bool passAllRule = true;
	auto& tmCourseRoleIndex = this->_dbData->tmCourseRoleIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->GetDataContext());
	if (tmCourse == nullptr) {
		return true;
	}
	_ruleViolation.SetParam("courseId", StringUtils::lltos(tmCourse->id));
	_ruleViolation.SetParam("courseCode", tmCourse->courseCode);

	//获得同一节课所有人员（同组）的计划课程ID列表
	auto tmProgramCoursesInGroup = tmProgramCourseIndex->getByGroupId(programCourse->groupId);
	auto parentProgramCourseIds = TrainingCourseUtils::GetProgramCourseParentIds(tmProgramCoursesInGroup);//注意同组program course可能存在多个program
	
	//场景1：检查某角色的人员数量
	vector<string> checkedRoles;//已经检查的Role
	if (!CheckCourseNumberOfOtherRolePeopleWithProgramCourseRole(checkedRoles, roster, programCourse->groupId, parentProgramCourseIds)) {
		passAllRule = false;
	}

	//针对标准化配置进行检查角色人员数量，忽略掉已经检查的角色(checkedRoles)
	if (!CheckCourseNumberOfPeopleWithCourseRole(checkedRoles, roster, programCourse->groupId, programCourse->courseId)) {
		passAllRule = false;
	}

	//场景2：检查某角色某资质的人员数量
	if (!CheckCourseNumberOfIPRoleQualPeopleWithProgramCourseRole(roster, programCourse->groupId, parentProgramCourseIds)) {
		passAllRule = false;
	}
	return passAllRule;
}

bool LimitCourseRoleNumbersForEvaFdRule::CheckCourseNumberOfOtherRolePeopleWithProgramCourseRole(vector<string>& checkedRoles, const ROSTER* roster, const string& groupId, const vector<long long>& parentProgramCourseIds) const {
	bool passAllRule = true;

	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseRoleIndex = this->_dbData->tmProgramCourseRoleIndex;

	auto tmProgramCourseRoleMap = tmProgramCourseRoleIndex->getByProgramCourseIds(parentProgramCourseIds, "OTHER_ROLE");
	//针对个性化配置进行检查角色(IP、CK、PNR、PIP、TE等)人员数量
	for (auto& pair : tmProgramCourseRoleMap) {
		auto& role = pair.first;
		auto& tmProgramCourseRoleList = pair.second;
		checkedRoles.emplace_back(role);

		int requiredRoleTotalNumber = 0;//配置规则中当前课程的角色人数
		size_t ignoreRoleCount = 0;
		for (auto& tmProgramCourseRole : tmProgramCourseRoleList) {
			int roleNumber = tmProgramCourseRole->roleNumber;
			if (roleNumber < 0) {
				roleNumber = 0;
				ignoreRoleCount++;
			}
			requiredRoleTotalNumber += roleNumber; //配置每个学员需要的ROLE数量，因此需要累计成课程需要ROLE总数
		}
		if (ignoreRoleCount == tmProgramCourseRoleList.size()) {
			//未配置role的人员数量，则不用检查
			continue;
		}

		//检查 role 角色的人员数量
		int acturalRoleNumber = 0;
		if (role == TrainingRole::TE) {
			auto tmProgramCourseList = tmProgramCourseIndex->getByGroupId(groupId);
			acturalRoleNumber = (int)tmProgramCourseList.size();
		}
		else {
			auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(groupId, role);
			acturalRoleNumber = (int)tmProgramCourseInstructorList.size();//实际Training Role人数
		}
		if (requiredRoleTotalNumber >= 0 && acturalRoleNumber != requiredRoleTotalNumber) {
			passAllRule = false;
			_ruleViolation.SetParam("role", role);
			ThrowRuleViolationForNumberOfPeople(roster);
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}

	return passAllRule;
}

bool LimitCourseRoleNumbersForEvaFdRule::CheckCourseNumberOfIPRoleQualPeopleWithProgramCourseRole(const ROSTER* roster, const string& groupId, const vector<long long>& parentProgramCourseIds) const {
	bool passAllRule = true;

	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseRoleIndex = this->_dbData->tmProgramCourseRoleIndex;
	auto& tmProgramCourseRoleQualIndex = this->_dbData->tmProgramCourseRoleQualIndex;

	auto tmProgramCourseRoleMap = tmProgramCourseRoleIndex->getByProgramCourseIds(parentProgramCourseIds, "IP");
	if (tmProgramCourseRoleMap.empty()) {
		//针对标准化配置进行检查ROLE人员数量，最后检查
		return true;
	}
	for (auto& pair : tmProgramCourseRoleMap) {
		auto& role = pair.first;//人员训练角色
		auto& tmProgramCourseRoleList = pair.second;//该角色对应的programCourseRole的配置
		

		//针对个性化配置进行检查某角色(IP、CK、PNR、PIP等)拥有某资质的人员数量
		for (auto& tmProgramCourseRole : tmProgramCourseRoleList) {
			//检查拥有IP角色，拥有资质的人员数量
			auto tmProgramCourseRoleQualList = tmProgramCourseRoleQualIndex->getByProgramCourseRoleId(tmProgramCourseRole->id);

			for (auto& tmProgramCourseRoleQual : tmProgramCourseRoleQualList) {
				int requiredRoleQualNumber = tmProgramCourseRoleQual->roleNumber;
				if (requiredRoleQualNumber < 0) {
					//无效配置，忽略检查
					continue;
				}

				//检查 role 角色拥有资质的人员数量
				int acturalRoleQualNumber = 0;//实际Training Role拥有资质人数
				auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(groupId, role);
				if (tmProgramCourseRoleQual->roleQuals.empty()) {
					//未配置资质要求，则acturalNumberOfRoleQual等于 已经排班的角色人员数量
					acturalRoleQualNumber = (int)tmProgramCourseInstructorList.size();
				}
				else {
					for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
						auto iterCrew = _dbData->crewIdMap.find(tmProgramCourseInstructor->crewId);
						if (iterCrew == _dbData->crewIdMap.end()) {
							//Logger::getRuleLogger()->error("[LimitCourseRoleNumbersForEvaFdRule] crew {} don't exist.", tmProgramCourseInstructor->crewId);
							continue;
						}
						//获得人员有效资质列表
						vector<string> crewQuals = RosterUtils::GetValidQualificationOfCrew(roster, iterCrew->second);

						if (tmProgramCourseRoleQual->roleQualOption == "OR") {
							for (auto& roleQual : tmProgramCourseRoleQual->roleQuals) {
								if (std::find(crewQuals.cbegin(), crewQuals.cend(), roleQual) != crewQuals.cend()) {
									acturalRoleQualNumber++;
									break;
								}
							}
						}
						else if (tmProgramCourseRoleQual->roleQualOption == "AND") {
							bool match = true;
							for (auto& roleQual : tmProgramCourseRoleQual->roleQuals) {
								if (std::find(crewQuals.cbegin(), crewQuals.cend(), roleQual) == crewQuals.cend()) {
									match = false;
									break;
								}
							}
							if (match) {
								acturalRoleQualNumber++;
							}
						}

					}
				}

				if (requiredRoleQualNumber >= 0 && acturalRoleQualNumber != requiredRoleQualNumber) {
					passAllRule = false;
					_ruleViolation.SetParam("role", role);
					ThrowRuleViolationForNumberOfRoleQualPeople(roster);
					if (!IsCheckAllRule()) {
						return passAllRule;
					}
				}

			}


		}

	}

	return passAllRule;
}

bool LimitCourseRoleNumbersForEvaFdRule::CheckCourseNumberOfPeopleWithCourseRole(const vector<string>& checkedRoles, const ROSTER* roster, const string& groupId, const long long& courseId) const {
	bool passAllRule = true;
	auto& tmCourseRoleIndex = this->_dbData->tmCourseRoleIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	auto tmCourseRoleList = tmCourseRoleIndex->getByCourseId(courseId);
	for (auto& tmCourseRole : tmCourseRoleList) {
		if (std::find(checkedRoles.begin(), checkedRoles.end(), tmCourseRole->role) != checkedRoles.end()) {
			//个性化配置已经检查过，则不在检查
			continue;
		}
		if (tmCourseRole->role.empty()) {
			continue;
		}

		int acturalRoleNumber = 0;
		if (tmCourseRole->role == TrainingRole::TE) {//学员TE角色
			auto tmProgramCourseList = tmProgramCourseIndex->getByGroupId(groupId);
			acturalRoleNumber = (int)tmProgramCourseList.size();//上课学员的角色人员数量
		}
		else {
			//其他角色，包括：IP、CK、PNR（除TE）
			auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(groupId, tmCourseRole->role);
			acturalRoleNumber = (int)tmProgramCourseInstructorList.size();//上课的角色人员数量
		}
		if (acturalRoleNumber < tmCourseRole->minCapacity || acturalRoleNumber > tmCourseRole->maxCapacity) {
			passAllRule = false;
			_ruleViolation.SetParam("role", tmCourseRole->role);
			ThrowRuleViolationForNumberOfPeople(roster);
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

void LimitCourseRoleNumbersForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitCourseRoleNumbersForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitCourseRoleNumbersForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitCourseRoleNumbersForEvaFdRule::ThrowRuleViolationForNumberOfRoleQualPeople(const ROSTER* roster) const {
	string role = _ruleViolation.GetParam("role");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//机组人员(XXX)的角色(XXX)资质（XXX)人数与课程要求不一致
	std::string msg = "The number of crew role ({0:role}) qualification is not consistent with the course ({1:courseCode}) requirements.";
	msg = StringUtils::Format(msg, role, courseCode);

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
	rv->operation_result.insert(pair<string, string>("role", role));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitCourseRoleNumbersForEvaFdRule::ThrowRuleViolationForNumberOfPeople(const ROSTER* roster) const {
	string role = _ruleViolation.GetParam("role");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//机组人员(XXX)的角色(XXX)人数与课程要求不一致
	std::string msg = "The number of crew role ({0:role}) is not consistent with the course ({1:courseCode}) requirements.";
	msg = StringUtils::Format(msg, role, courseCode);

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
	rv->operation_result.insert(pair<string, string>("role", role));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	_ruleViolation.AddRuleViolations(rv);
}

