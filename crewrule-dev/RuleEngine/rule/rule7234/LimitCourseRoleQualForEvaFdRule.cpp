/**
 * @file LimitCourseRoleQualForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitCourseRoleQualForEvaFdRule.h"
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

bool LimitCourseRoleQualForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
	//检查课程人员资质
	for (auto& roster : rosters) {
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));
		
		bool valid = CheckRule(roster, crew);
		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;
	const auto programCourseList = this->_dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : programCourseList) {
		//获得该课程的所有教员(COF)，检查教员是否满足资质要求
		const auto programCourseInstructors = this->_dbData->tmProgramCourseInstructorIndex->getByGroupId(programCourse->groupId);
		for (const auto& programCourseInstructor : programCourseInstructors) {
			auto iterCrew = this->_dbData->crewIdMap.find(programCourseInstructor->crewId);
			if (iterCrew == this->_dbData->crewIdMap.end()) {
				Logger::getRuleLogger()->error("[CheckRule] Crew ({}) does not exist when checking course role qual.", programCourseInstructor->crewId);
				continue;
			}
			auto& cofCrew = iterCrew->second;
			for (auto& cofRoster : cofCrew->rosterList) {
				if (cofRoster->rosterId == programCourseInstructor->rosterId || cofRoster->rosterId == programCourseInstructor->rosterGroundId) {
					if (!CheckCourseRoleQualification(cofRoster.get(), cofCrew, programCourse)) {
						valid = false;
					}
					break;
				}
			}
		}
	}
	
	if (programCourseList.empty()) {
	    //以教员身份进行检查
		valid = CheckCourseRoleQualification(roster, crew, nullptr);
	}
	return valid;
}

bool LimitCourseRoleQualForEvaFdRule::CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& currProgramCourse) const {
	bool passAllRule = true;

	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCourseRoleIndex = this->_dbData->tmProgramCourseRoleIndex;

	//仅针对非学员
	const auto programCourseInstructorList = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (programCourseInstructor->groupId.empty()) {
			continue;
		}

		std::shared_ptr<TmProgramCourse> teProgramCourse = currProgramCourse;
		if (currProgramCourse == nullptr) {
			teProgramCourse = tmProgramCourseIndex->getAnyOneByGroupId(programCourseInstructor->groupId);
		}
		if (teProgramCourse == nullptr) {
			Logger::getRuleLogger()->warn("[CheckCourseRoleQualification] TmProgramCourse does not exist.[groupId={}]", programCourseInstructor->groupId);
			continue;
		}
		_ruleViolation.SetParam("courseId", StringUtils::lltos(teProgramCourse->courseId));
		_ruleViolation.SetParam("programCourseInstructorId", StringUtils::lltos(programCourseInstructor->id));
		_ruleViolation.SetParam("role", programCourseInstructor->role);

		//获得人员有效资质列表
		vector<string> crewQuals = RosterUtils::GetValidQualificationOfCrew(roster, crew);

		long long parentProgramCourseId = TrainingCourseUtils::GetProgramCourseParentId(teProgramCourse);

		auto tmProgramCourseRoleMap = tmProgramCourseRoleIndex->getByProgramCourseId(parentProgramCourseId, "OTHER_ROLE");

		auto iterRole = tmProgramCourseRoleMap.find(programCourseInstructor->role);

		if (iterRole == tmProgramCourseRoleMap.end()) {
			//通过TmCourseRole等配置进行标准化检查PNR资质
			if (!CheckCourseRoleQualification(roster, crew, crewQuals, programCourseInstructor->role, teProgramCourse->courseId, programCourseInstructor->fltId)) {
				passAllRule = false;
				ThrowRuleViolationForCourseRoleQualification(roster);
			}
		}
		else {
			//通过TmProgramCourseRole配置进行个性化检查Role资质
			auto& tmProgramCourseRoleList = iterRole->second;
			for (auto& tmProgramCourseRole : tmProgramCourseRoleList) {
				if (!CheckCourseRoleQualification(roster, crew, crewQuals, tmProgramCourseRole, programCourseInstructor->fltId)) {
					passAllRule = false;
					ThrowRuleViolationForRoleQualification(roster);

					if (!IsCheckAllRule()) {
						return passAllRule;
					}
				}
			}
		}
	}
	return passAllRule;
}


//个性化检查计划训练课程伙伴PNR(Partner)的base/rank/fleet/team/qual 限制
bool LimitCourseRoleQualForEvaFdRule::CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const long long fltId) const {
	std::vector<string> positions;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, tmProgramCourseRole->bases, tmProgramCourseRole->ranks, tmProgramCourseRole->fleets, tmProgramCourseRole->teams, positions, roster->getStartTimeUtcAct(), roster->getRestStartUtcAct())) {
		return false;
	}

	auto rf = _dbData->rosterFlightMgr.get(fltId, roster->idcrew);
	auto& requiredActingRanks = tmProgramCourseRole->actingRanks;
	if (rf != nullptr && !requiredActingRanks.empty() && std::find(requiredActingRanks.begin(), requiredActingRanks.end(), rf->actingRank) == requiredActingRanks.end()) {
		return false;
	}

	auto& tmProgramCourseRoleQualList = this->_dbData->tmProgramCourseRoleQualIndex->getByProgramCourseRoleId(tmProgramCourseRole->id);
	bool passAllRule = false;
	for (auto& tmProgramCourseRoleQual : tmProgramCourseRoleQualList) {
		if (tmProgramCourseRoleQual->roleQuals.empty()) {
			return true;
		}

		bool valid = false;
		if (tmProgramCourseRoleQual->roleQualOption == "OR") {
			valid = false;
			for (auto& roleQual : tmProgramCourseRoleQual->roleQuals) {
				if (std::find(crewQuals.cbegin(), crewQuals.cend(), roleQual) != crewQuals.cend()) {
					valid = true;
					break;
				}
			}
		}
		else if (tmProgramCourseRoleQual->roleQualOption == "AND") {
			valid = true;
			for (auto& roleQual : tmProgramCourseRoleQual->roleQuals) {
				if (std::find(crewQuals.cbegin(), crewQuals.cend(), roleQual) == crewQuals.cend()) {
					valid = false;
					break;
				}
			}
		}

		if (valid) {
			//tmProgramCourseRoleQualList中任意一条合法，则认为合法
			passAllRule = true;
			break;
		}

	}
	return passAllRule;
}

bool LimitCourseRoleQualForEvaFdRule::CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const string& crewRole,  const long long courseId, const long long fltId) const {
	bool passAllRule = true;
	auto& tmCourseRoleIndex = this->_dbData->tmCourseRoleIndex;
	auto& tmCourseRoleBaseIndex = this->_dbData->tmCourseRoleBaseIndex;
	auto& tmCourseRoleQualIndex = this->_dbData->tmCourseRoleQualIndex;

	auto tmCourseRoleList = tmCourseRoleIndex->getByCourseId(courseId);
	for (auto& tmCourseRole : tmCourseRoleList) {
		if (tmCourseRole->role != crewRole) {
			continue;
		}
		
		//检查base、rank、fleet、team
		auto tmCourseRoleBaseList = tmCourseRoleBaseIndex->getByCourseRoleId(tmCourseRole->id);
		bool valid = false;
		int ignoreRoleQualCount = 0;
		for (auto& tmCourseRoleBase : tmCourseRoleBaseList) {
			if (CheckCourseRoleQualification(roster, crew, crewQuals, tmCourseRoleBase, fltId)) {
				//配置base、rank、fleet、team后，再检查资质qual
				auto tmCourseRoleQualList = tmCourseRoleQualIndex->getByCourseRoleBaseId(tmCourseRoleBase->id);
				if (tmCourseRoleQualList.empty()) {
					//未配置qual条件，则忽略检查
					ignoreRoleQualCount++;
				}
				for (auto& tmCourseRoleQual : tmCourseRoleQualList) {
					if (CheckCourseRoleQualification(roster, crew, crewQuals, crewRole, tmCourseRoleQual)) {
						//同一角色，配置多条qual条件，满足一条即可
						valid = true;
						break;
					}
				}
				if (valid) {
					break;
				}
			}
		}
		if (ignoreRoleQualCount == tmCourseRoleBaseList.size()) {
			//所有RoleBase都忽略检查RoleQual，说明都没有RoleQual，则认为合法
			valid = true;
		}
		if (!valid) {
			passAllRule = false;
			break;
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualForEvaFdRule::CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const long long fltId) const {
	std::vector<string> positions;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, tmCourseRoleBase->bases, tmCourseRoleBase->ranks, tmCourseRoleBase->fleets, tmCourseRoleBase->teams, positions, roster->getStartTimeUtcAct(), roster->getRestStartUtcAct())) {
		return false;
	}
	auto rf = _dbData->rosterFlightMgr.get(fltId, roster->idcrew);
	auto& requiredActingRanks = tmCourseRoleBase->actingRanks;
	if (rf != nullptr && !requiredActingRanks.empty() && std::find(requiredActingRanks.begin(), requiredActingRanks.end(), rf->actingRank) == requiredActingRanks.end()) {
		return false;
	}
	return true;
}

bool LimitCourseRoleQualForEvaFdRule::CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const string& crewRole, const std::shared_ptr<TmCourseRoleQual>& tmCourseRoleQual) const {
	if (tmCourseRoleQual->quals.empty()) {
		return true;
	}
	bool valid = false;
	if (tmCourseRoleQual->condition == "OR") {
		valid = false;
		for (auto& qual : tmCourseRoleQual->quals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), qual) != crewQuals.cend()) {
				valid = true;
				break;
			}
		}
	}
	else if (tmCourseRoleQual->condition == "AND") {
		valid = true;
		for (auto& qual : tmCourseRoleQual->quals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), qual) == crewQuals.cend()) {
				valid = false;
				break;
			}
		}
	}
	return valid;
}

void LimitCourseRoleQualForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitCourseRoleQualForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitCourseRoleQualForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitCourseRoleQualForEvaFdRule::ThrowRuleViolationForRoleQualification(const ROSTER* roster) const {
	string crewId = _ruleViolation.GetParam("crewId");
	string courseId = _ruleViolation.GetParam("courseId");
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string programCoursePnrId = _ruleViolation.GetParam("programCoursePnrId");

	//机组人员需要培训课程IP/CK资质
	std::string msg = "The crew({0:crewId}) has NO qualification for the training courses role(PNR).";
	msg = StringUtils::Format(msg, roster->idcrew);

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
	rv->operation_result.insert(pair<string, string>("crewId", crewId));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("programCoursePnrId", programCoursePnrId));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitCourseRoleQualForEvaFdRule::ThrowRuleViolationForCourseRoleQualification(const ROSTER* roster) const {
	string crewId = _ruleViolation.GetParam("crewId");
	string courseId = _ruleViolation.GetParam("courseId");
	string programCourseInstructorId = _ruleViolation.GetParam("programCourseInstructorId");
	string role = _ruleViolation.GetParam("role");

	//机组人员需要培训课程IP/CK资质
	std::string msg = "The crew({0:crewId}) has NO qualification for the training courses role({1:role}).";
	msg = StringUtils::Format(msg, roster->idcrew, role);

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
	rv->operation_result.insert(pair<string, string>("crewId", crewId));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("programCourseInstructorId", programCourseInstructorId));
	_ruleViolation.AddRuleViolations(rv);
}