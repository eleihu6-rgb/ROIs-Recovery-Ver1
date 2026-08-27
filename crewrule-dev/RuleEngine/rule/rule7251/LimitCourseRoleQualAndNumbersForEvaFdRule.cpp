/**
 * @file LimitCourseRoleQualAndNumbersForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitCourseRoleQualAndNumbersForEvaFdRule.h"
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

inline static bool isCrewQualified(std::unordered_set<string>& baseWarnTypes, const SharedPtr<CREW>& crew, const long long fltId, const vector<string>& bases, const vector<string>& ranks, const vector<string>& fleets, const vector<string>& teams, const vector<string>& actingRanks, const time_t eff, const time_t exp, const std::shared_ptr<CrewDataContext>& dbData) {

	if (!Utility::GetInstancePtr()->isCrewBaseQualified(crew, bases, eff, exp)) {
		baseWarnTypes.emplace("base");
	}

	if (!Utility::GetInstancePtr()->isCrewRankQualified(crew, ranks, eff, exp)) {
		baseWarnTypes.emplace("rank");
	}

	if (!Utility::GetInstancePtr()->isCrewFleetQualified(crew, fleets, eff, exp)) {
		baseWarnTypes.emplace("fleet");
	}

	if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, teams, eff, exp)) {
		baseWarnTypes.emplace("team");
	}

	auto rf = dbData->rosterFlightMgr.get(fltId, crew->idCrew);
	auto& requiredActingRanks = actingRanks;
	if (rf != nullptr && !requiredActingRanks.empty() && std::find(requiredActingRanks.begin(), requiredActingRanks.end(), rf->actingRank) == requiredActingRanks.end()) {
		baseWarnTypes.emplace("acting rank");
	}

	return baseWarnTypes.empty() ? true : false;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRule(const ROSTER* roster) const {
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

		if (!CheckRule(roster, programCourse, nullptr)) {
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
		auto programCoursesInGroup = tmProgramCourseIndex->getByGroupId(programCourseInstructor->groupId);

		/**
		* 处理主课程或子课程的教员场景
		* 若是主课程员则需要把子课程加入programCoursesInGroup进行检查 
		* 若是子课程教员则需要把子课程学员课程加入programCoursesInGroup进行检查，清除到programCourseInstructor.groupId同一节课的学员
		*/
		auto programCourseOfSubCourse = TrainingCourseUtils::GetProgramCourseOfSubCourse(programCourseInstructor, this->_dbData);
		if (programCourseOfSubCourse != nullptr) {
			auto isSubCourseInstructor = TrainingCourseUtils::IsSubCourseInstructor(programCourseInstructor, this->_dbData);
			if (isSubCourseInstructor != nullptr && *isSubCourseInstructor) {
				programCoursesInGroup.clear();//programCourseInstructor是子课程的IP教员
			}
			programCoursesInGroup.emplace_back(programCourseOfSubCourse);
		}

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
						if (!CheckRule(cofRoster.get(), programCourseInGroup, roster)) {
							passAllRule = false;
						}
					}
				}
				if (!passAllRule) {
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
			}
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const {
	bool passAllRule = true;
	auto& tmCourseRoleIndex = this->_dbData->tmCourseRoleIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(checkedProgramCourse->courseId, this->GetDataContext());
	if (tmCourse == nullptr) {
		return true;
	}

	_ruleViolation.SetParam("courseId", StringUtils::lltos(tmCourse->id));
	_ruleViolation.SetParam("courseCode", tmCourse->courseCode);

	//获得同一节课所有人员（同组）的计划课程ID列表
	auto tmProgramCoursesInGroup = tmProgramCourseIndex->getByGroupId(checkedProgramCourse->groupId);
	auto parentProgramCourseIds = TrainingCourseUtils::GetProgramCourseParentIds(tmProgramCoursesInGroup);//注意同组program course可能存在多个program

	set<string> checkedRoles;//已经检查的Role
	if (!CheckRuleWithProgramCourseRole(checkedRoles, roster, checkedProgramCourse, parentProgramCourseIds, instructorRoster)) {
		passAllRule = false;
	}

	if (!CheckRuleWithProgramCourseIpRole(checkedRoles, roster, checkedProgramCourse, parentProgramCourseIds, instructorRoster)) {
		passAllRule = false;
	}
	
	if (!CheckRuleWithPairingChart(checkedRoles, roster, checkedProgramCourse, instructorRoster)) {
		passAllRule = false;
	}

	//针对标准化配置进行检查角色人员数量，忽略掉已经检查的角色(checkedRoles)
	if (!CheckRuleWithCourseRole(checkedRoles, roster, checkedProgramCourse, instructorRoster)) {
		passAllRule = false;
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithProgramCourseRole(set<string>& checkedRoles, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<long long>& parentProgramCourseIds, const ROSTER* instructorRoster) const {
	bool passAllRule = true;

	auto& tmProgramCourseRoleIndex = this->_dbData->tmProgramCourseRoleIndex;

	auto tmProgramCourseRoleMap = tmProgramCourseRoleIndex->getByProgramCourseIds(parentProgramCourseIds, "OTHER_ROLE");
	auto tmProgramCourseRoleMapOfIPRole = tmProgramCourseRoleIndex->getByProgramCourseIds(parentProgramCourseIds, "IP");
	tmProgramCourseRoleMap.merge(tmProgramCourseRoleMapOfIPRole);
	//针对个性化配置进行检查角色(IP、CK、PNR、PIP、TE等)人员数量
	for (auto& pair : tmProgramCourseRoleMap) {
		auto& role = pair.first;
		auto& tmProgramCourseRoleList = pair.second;

		if (std::find(checkedRoles.begin(), checkedRoles.end(), role) != checkedRoles.end()) {
			//已经检查过，则不在检查
			continue;
		}
		checkedRoles.emplace(role);
		
		_ruleViolation.SetParam("role", role);

		if (!tmProgramCourseRoleList.empty() && !CheckRuleWithProgramCourseRole(roster, checkedProgramCourse, role, tmProgramCourseRoleList, instructorRoster)) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithProgramCourseRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const string& role, const vector<std::shared_ptr<TmProgramCourseRole>>& tmProgramCourseRoleList, const ROSTER* instructorRoster) const {
	bool passAllRule = false;
	WarnCode warnCode = WarnCode::NO_WARN;
	WarnInfo warnInfo;
	for (auto& tmProgramCourseRole : tmProgramCourseRoleList) {
		bool valid = false;
		if (CheckRoleNumberWithProgramCourseRole(roster, role, tmProgramCourseRole, checkedProgramCourse, instructorRoster)) {
			valid = true;
		}
		else {
			warnCode = WarnCode::ROLE_NUMBER_WARN;
		}

		if (valid && !CheckBaseWithProgramCourseRole(warnInfo, roster, role, tmProgramCourseRole, checkedProgramCourse, instructorRoster)) {
			valid = false;
			warnCode = WarnCode::BASE_WARN;
		}

		if (valid) {
			//多条tmProgramCourseRole满足其中一个即可
			passAllRule = true;
			break;
		}
	}

	if (!passAllRule) {
		_ruleViolation.SetParam("role", role);
		if ((int)warnCode == (int)WarnCode::ROLE_NUMBER_WARN) {
			//人员数量都没有匹配上，则提示人数告警
			ThrowRuleViolationForNumberOfPeople(instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
		}
		else if ((int)warnCode == (int)WarnCode::BASE_WARN) {
			//人员数量能匹配上，但仍然违规，则提示base、rank、fleet、team以及qual资质不满足要求
			ThrowRuleViolationForBase(warnInfo, instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
		}
	}

	return passAllRule;

}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRoleNumberWithProgramCourseRole(const ROSTER* roster, const string& role, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const {
	bool valid = true;

	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;

	int requiredRoleTotalNumber = tmProgramCourseRole->roleNumber;//配置规则中当前课程的角色人数
	if (requiredRoleTotalNumber <= 0) {
		return true;
	}

	//检查 role 角色的人员数量
	int actualRoleNumber = 0;
	if (role == TrainingRole::TE) {
		auto tmProgramCourseList = tmProgramCourseIndex->getByGroupId(checkedProgramCourse->groupId);
		//actualRoleNumber = GetActualRoleNumber(tmProgramCourseRole, tmProgramCourseList);
		actualRoleNumber = (int)tmProgramCourseList.size();//角色人员数量，这里不需要检查查base、rank、fleet、team以及qual（后续再检查）
	}
	else {
		//auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(checkedProgramCourse->groupId, role);
		auto tmProgramCourseInstructorList = TrainingCourseUtils::GetInstructorListByProgramCourse(checkedProgramCourse, role, true, this->_dbData);
		//actualRoleNumber = GetActualRoleNumber(tmProgramCourseRole, tmProgramCourseInstructorList);//实际Training Role人数
		actualRoleNumber = (int)tmProgramCourseInstructorList.size();//角色人员数量，这里不需要检查查base、rank、fleet、team以及qual（后续再检查）
	}
	if (requiredRoleTotalNumber >= 0 && actualRoleNumber != requiredRoleTotalNumber) {
		valid = false;
	}
	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckBaseWithProgramCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const string& role, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const {
	bool valid = true;

	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	if (role == TrainingRole::TE) {
		auto tmProgramCourseList = tmProgramCourseIndex->getByGroupId(checkedProgramCourse->groupId);
		if (!CheckBaseWithProgramCourseRole(warnInfo, roster, tmProgramCourseRole, tmProgramCourseList, instructorRoster)) {
			valid = false;
		}
	}
	else {
		//auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(checkedProgramCourse->groupId, role);
		auto tmProgramCourseInstructorList = TrainingCourseUtils::GetInstructorListByProgramCourse(checkedProgramCourse, role, true, this->_dbData);
		if (!CheckBaseWithProgramCourseRole(warnInfo, roster, tmProgramCourseRole, tmProgramCourseInstructorList, instructorRoster)) {
			valid = false;
		}
	}
	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckBaseWithProgramCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList, const ROSTER* instructorRoster) const {
	bool valid = true;
	for (auto& programCourse : programCourseList) {
		//每个角色都必须满足base、rank、fleet、team以及qual资质要求
		auto iterCrew = _dbData->crewIdMap.find(programCourse->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}
		auto& crew = iterCrew->second;

		if (!MatchRoleBaseAndQualification(warnInfo, tmProgramCourseRole, programCourse->startTime, programCourse->endTime, crew, programCourse->fltId)) {
			valid = false;
			break;
		}
	}
	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckBaseWithProgramCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	bool valid = true;
	for (auto& programCourseInstructor : programCourseInstructorList) {
		//每个角色都必须满足base、rank、fleet、team以及qual资质要求
		auto iterCrew = _dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}
		auto& crew = iterCrew->second;

		if (!MatchRoleBaseAndQualification(warnInfo, tmProgramCourseRole, programCourseInstructor->startTime, programCourseInstructor->endTime, crew, programCourseInstructor->fltId)) {
			valid = false;
			break;
		}

	}
	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithProgramCourseIpRole(set<string>& checkedRoles, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<long long>& parentProgramCourseIds, const ROSTER* instructorRoster) const {
	bool passAllRule = true;

	//已经检查过，则不在检查(临时控制，后续IP全部迁移到tm_program_course_ip_role后，可以去掉)
	if (std::find(checkedRoles.begin(), checkedRoles.end(), TrainingRole::IP) != checkedRoles.end()) {
		return true;
	}

	auto& tmProgramCourseIpRoleIndex = this->_dbData->tmProgramCourseIpRoleIndex;
	checkedRoles.emplace(TrainingRole::IP);
	_ruleViolation.SetParam("role", TrainingRole::IP);

	auto tmProgramCourseIpRoleList = tmProgramCourseIpRoleIndex->getByProgramCourseIds(parentProgramCourseIds);
	//针对个性化配置进行检查满足特定base、fleet、qual的角色IP人员数量
	if (!tmProgramCourseIpRoleList.empty() && !CheckRuleWithProgramCourseIpRole(roster, checkedProgramCourse, tmProgramCourseIpRoleList, instructorRoster)) {
		passAllRule = false;
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<std::shared_ptr<TmProgramCourseIpRole>>& tmProgramCourseIpRoleList, const ROSTER* instructorRoster) const {
	bool passAllRule = false;

	auto& tmProgramCourseIpRoleBaseIndex = this->_dbData->tmProgramCourseIpRoleBaseIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;

	//auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(checkedProgramCourse->groupId, TrainingRole::IP);
	vector<std::shared_ptr<TmProgramCourseInstructor>> tmProgramCourseInstructorList;
	if (TrainingCourseUtils::IsSubProgramCourse(checkedProgramCourse, this->_dbData)) {
		tmProgramCourseInstructorList = TrainingCourseUtils::GetSubCourseInstructorListByProgramCourse(checkedProgramCourse, TrainingRole::IP, this->_dbData);
	}
	else {
		tmProgramCourseInstructorList = TrainingCourseUtils::GetInstructorListByProgramCourse(checkedProgramCourse, TrainingRole::IP, true, this->_dbData);
	}
	
	WarnInfo warnInfo;
	WarnCode warnCode = WarnCode::NO_WARN;
	for (auto& tmProgramCourseIpRole : tmProgramCourseIpRoleList) {
		bool valid = false;
		WarnInfo tmpWarnInfo;
		WarnCode tmpWarnCode = WarnCode::NO_WARN;
		auto tmProgramCourseIpRoleBaseList = tmProgramCourseIpRoleBaseIndex->getByProgramCourseIpRoleId(tmProgramCourseIpRole->id);
		if (CheckRuleWithProgramCourseIpRole(tmpWarnCode, tmpWarnInfo, roster, tmProgramCourseIpRole, tmProgramCourseIpRoleBaseList, checkedProgramCourse->groupId, tmProgramCourseInstructorList, instructorRoster)) {
			valid = true;
			warnInfo.baseWarnCrewIds.clear();
			warnInfo.baseWarnTypes.clear();
		}
		else {
			warnInfo.baseWarnCrewIds.insert(tmpWarnInfo.baseWarnCrewIds.begin(), tmpWarnInfo.baseWarnCrewIds.end());
			warnInfo.baseWarnTypes.insert(tmpWarnInfo.baseWarnTypes.begin(), tmpWarnInfo.baseWarnTypes.end());
			warnCode = tmpWarnCode;
		}
		if (valid) {
			//多条tmProgramCourseIpRole满足其中一个即可
			passAllRule = true;
			break;
		}
	}

	if (!passAllRule) {
		//IP角色仅会报人员数量不一致告警，因为在检查人数时必须考虑base、rank、fleet、team以及qual资质等要求
		_ruleViolation.SetParam("role", TrainingRole::IP);
		if ((int)warnCode == (int)WarnCode::ROLE_NUMBER_WARN) {
			//人员数量都没有匹配上，则提示人数告警
			ThrowRuleViolationForNumberOfPeople(instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
		}
		else if ((int)warnCode == (int)WarnCode::QUAL_NUMBER_WARN) {
			//人员数量都没有匹配上，则提示人数告警
			ThrowRuleViolationForNumberOfRoleQualPeople(instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
		}
		else {
			//人员数量能匹配上，但仍然违规，则提示base、rank、fleet、team以及qual资质不满足要求
			ThrowRuleViolationForBase(warnInfo, instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithProgramCourseIpRole(WarnCode& warnCode, WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const vector<std::shared_ptr<TmProgramCourseIpRoleBase>>& tmProgramCourseIpRoleBaseList, const string& groupId, const vector<std::shared_ptr<TmProgramCourseInstructor>>& tmProgramCourseInstructorList,const ROSTER* instructorRoster) const {
	bool passAllRule = false;

	for (auto& tmProgramCourseIpRoleBase : tmProgramCourseIpRoleBaseList) {
		bool valid = false;

		if (CheckRoleNumberWithProgramCourseIpRole(roster, tmProgramCourseIpRole, tmProgramCourseIpRoleBase, tmProgramCourseInstructorList, instructorRoster)) {
			valid = true;
		}
		else {
			warnCode = WarnCode::ROLE_NUMBER_WARN;
		}

		if (valid && CheckQualNumberWithProgramCourseIpRole(roster, tmProgramCourseIpRole, tmProgramCourseIpRoleBase, tmProgramCourseInstructorList, instructorRoster)) {
			valid = true;
		}
		else {
			valid = false;
			warnCode = WarnCode::QUAL_NUMBER_WARN;
		}

		if (valid && !CheckBaseWithProgramCourseIpRole(warnInfo, roster, tmProgramCourseIpRole, tmProgramCourseIpRoleBase, tmProgramCourseInstructorList, instructorRoster)) {
			valid = false;
			warnCode = WarnCode::BASE_WARN;
		}

		if (valid) {
			//多条tmProgramCourseIpRole+tmProgramCourseIpRoleBase满足其中一个即可
			passAllRule = true;
			warnInfo.baseWarnTypes.clear();
			warnInfo.baseWarnCrewIds.clear();
			break;
		}
	}
	return passAllRule;
}

//bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckQualNumberWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const string& groupId, const ROSTER* instructorRoster) const {
//	bool valid = false;
//
//	auto& tmProgramCourseIpRoleBaseIndex = this->_dbData->tmProgramCourseIpRoleBaseIndex;
//	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
//	auto tmProgramCourseIpRoleBaseList = tmProgramCourseIpRoleBaseIndex->getByProgramCourseIpRoleId(tmProgramCourseIpRole->id);
//	if (tmProgramCourseIpRoleBaseList.empty()) {
//		return true;
//	}
//
////auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(checkedProgramCourse->groupId, TrainingRole::IP);
//  auto tmProgramCourseInstructorList = TrainingCourseUtils::GetInstructorListByProgramCourse(checkedProgramCourse, TrainingRole::IP, true, this->_dbData);
//	for (auto& tmProgramCourseIpRoleBase : tmProgramCourseIpRoleBaseList) {
//		if (CheckQualNumberWithProgramCourseIpRole(roster, tmProgramCourseIpRole, tmProgramCourseIpRoleBase, tmProgramCourseInstructorList, instructorRoster)) {
//			valid = true;
//		}
//	}
//	return valid;
//}


//获得所有分组
inline static vector<set<string>> GetSubGroupList(const set<string>& crewIds, const size_t groupMemberCount) {
	vector<set<string>> subGroupList;
	vector<string> tmpCrewIds;
	tmpCrewIds.insert(tmpCrewIds.end(), crewIds.begin(), crewIds.end());
	for (size_t i = 0; i < tmpCrewIds.size(); i++) {
		set<string> subGroup;
		for (size_t j = i; j < i + groupMemberCount; j++) {
			if (j >= tmpCrewIds.size()) {
				break;
			}
			subGroup.emplace(tmpCrewIds[j]);
		}
		subGroupList.emplace_back(subGroup);
	}
	return subGroupList;
}

inline static bool MatchRoleQualNumber(const set<string>& prepareAssignCrewIds, const size_t index, const vector<std::shared_ptr<TmProgramCourseIpRoleQual>>& tmProgramCourseIpRoleQualList, const map<std::shared_ptr<TmProgramCourseIpRoleQual>, vector<set<string>>>& roleQualNumOfSubGroupMap) {
	if (index >= tmProgramCourseIpRoleQualList.size()) {
		return true;
	}
	std::shared_ptr<TmProgramCourseIpRoleQual> tmProgramCourseIpRoleQual = tmProgramCourseIpRoleQualList[index];
	auto iter = roleQualNumOfSubGroupMap.find(tmProgramCourseIpRoleQual);
	if (iter == roleQualNumOfSubGroupMap.end()) {
		return false;
	}
	auto& subGroupList = iter->second;
	for (auto& assignCrewIds : subGroupList) {
		if (!StringUtils::Intersect(prepareAssignCrewIds, assignCrewIds)) {
			set<string> tmpPrepareAssignCrewIds = prepareAssignCrewIds;
			tmpPrepareAssignCrewIds.insert(assignCrewIds.begin(), assignCrewIds.end());
			return MatchRoleQualNumber(tmpPrepareAssignCrewIds, index + 1, tmProgramCourseIpRoleQualList, roleQualNumOfSubGroupMap);
		}
	}
	return false;
}

//仅IP角色检查人员数量是否满足，与资质无关
bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRoleNumberWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	auto& tmProgramCourseIpRoleQualList = this->_dbData->tmProgramCourseIpRoleQualIndex->getByProgramCourseIpRoleBaseId(tmProgramCourseIpRoleBase->id);
	if (tmProgramCourseIpRoleQualList.empty()) {
		return true;
	}

	int totalRoleNumber = 0;
	bool isMinLimit = false;
	for (auto& tmProgramCourseIpRoleQual : tmProgramCourseIpRoleQualList) {
		int roleNumber = tmProgramCourseIpRoleQual->roleNumber;
		if (roleNumber <= 0) {
			roleNumber = 1;
			isMinLimit = true;
		}
		totalRoleNumber += roleNumber;
	}
	if (isMinLimit) {
		return (int)programCourseInstructorList.size() >= totalRoleNumber;
	}
	return (int)programCourseInstructorList.size() == totalRoleNumber;
}

//检查满足资质的人员数量，规则：要求资质规则人数都要满足，并且这些人员不能重复。例如：要求“满足资质A 人数2，满足资质B 人数3”，则一共需要5个人，其中2个资质A要求，3人满足资质B要求（注意若某人拥有A、B资质，只能分到A或B其中一个组中）。
bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckQualNumberWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	auto& tmProgramCourseIpRoleQualList = this->_dbData->tmProgramCourseIpRoleQualIndex->getByProgramCourseIpRoleBaseId(tmProgramCourseIpRoleBase->id);
	if (tmProgramCourseIpRoleQualList.empty()) {
		return true;
	}

	//遍历IP角色的教员，满足各资质需求的人数
	map<std::shared_ptr<TmProgramCourseIpRoleQual>, set<string>> roleQualNumMap;//map<资质规则，实际满足资质人员集合>
	for (auto& programCourseInstructor : programCourseInstructorList) {
		auto iterCrew = _dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}
		auto& crew = iterCrew->second;

		for (auto& tmProgramCourseIpRoleQual : tmProgramCourseIpRoleQualList) {
			if (MatchRoleQualification(tmProgramCourseIpRoleBase, tmProgramCourseIpRoleQual, programCourseInstructor->startTime, programCourseInstructor->endTime, crew, programCourseInstructor->fltId)) {
				auto iterRoleQualNum = roleQualNumMap.find(tmProgramCourseIpRoleQual);
				if (iterRoleQualNum == roleQualNumMap.end()) {
					set<string> crewIds;
					crewIds.insert(programCourseInstructor->crewId);
					roleQualNumMap.insert(std::make_pair(tmProgramCourseIpRoleQual, crewIds));
				}
				else {
					auto& crewIds = iterRoleQualNum->second;
					crewIds.insert(programCourseInstructor->crewId);
				}
			}
		}
	}

	for (auto& tmProgramCourseIpRoleQual : tmProgramCourseIpRoleQualList) {
		auto iterRoleQualNum = roleQualNumMap.find(tmProgramCourseIpRoleQual);
		if (iterRoleQualNum == roleQualNumMap.end()) {
			//没有人员满足要求
			return false;
		}
	}

	map<std::shared_ptr<TmProgramCourseIpRoleQual>, vector<set<string>>> roleQualNumOfSubGroupMap;//map<资质规则，vector<满足资质最小数量(TmProgramCourseIpRoleQual.roleNumber)人员集合>>
	for (auto& pair : roleQualNumMap) {
		auto& tmProgramCourseIpRoleQual = pair.first;
		auto& crewIds = pair.second;
		int roleNumber = tmProgramCourseIpRoleQual->roleNumber < 0 ? 0 : tmProgramCourseIpRoleQual->roleNumber;
		if (roleNumber > 0 && roleNumber > (int)crewIds.size()) {
			//IP角色要求的实际资质人员数量小于不满足要求
			return false;
		}
		if (roleNumber <= 0) roleNumber = 1;
		roleQualNumOfSubGroupMap[tmProgramCourseIpRoleQual] = GetSubGroupList(crewIds, roleNumber);
	}

	//循环迭代检查，要求资质规则人数都要满足，并且这些人员	
	auto& subGroupList = roleQualNumOfSubGroupMap[tmProgramCourseIpRoleQualList[0]];
	for (const auto& assigedCrewIds : subGroupList) {
		if (MatchRoleQualNumber(assigedCrewIds, 1, tmProgramCourseIpRoleQualList, roleQualNumOfSubGroupMap)) {
			return true;
		}

	}
	return false;
}

//bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckBaseWithProgramCourseIpRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const string& groupId, const ROSTER* instructorRoster) const {
//	bool passAllRule = true;
//	auto& tmProgramCourseIpRoleBaseIndex = this->_dbData->tmProgramCourseIpRoleBaseIndex;
//	auto& tmProgramCourseIpRoleQualIndex = this->_dbData->tmProgramCourseIpRoleQualIndex;
//	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
//	
//	auto tmProgramCourseIpRoleBaseList = tmProgramCourseIpRoleBaseIndex->getByProgramCourseIpRoleId(tmProgramCourseIpRole->id);
//	if (tmProgramCourseIpRoleBaseList.empty()) {
//		return true;
//	}
//
////auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(checkedProgramCourse->groupId, TrainingRole::IP);
//  auto tmProgramCourseInstructorList = TrainingCourseUtils::GetInstructorListByProgramCourse(checkedProgramCourse, TrainingRole::IP, true, this->_dbData);
//	for (auto& tmProgramCourseIpRoleBase : tmProgramCourseIpRoleBaseList) {
//		if (!CheckBaseWithProgramCourseIpRole(roster, tmProgramCourseIpRole, tmProgramCourseIpRoleBase, tmProgramCourseInstructorList, instructorRoster)) {
//			passAllRule = false;
//		}
//	}
//	return passAllRule;
//}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckBaseWithProgramCourseIpRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	bool valid = true;
	for (auto& programCourseInstructor : programCourseInstructorList) {
		//每个教员都必须满足base、rank、fleet、team以及qual资质要求
		auto iterCrew = _dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}
		auto& crew = iterCrew->second;

		if (!MatchRoleBase(warnInfo, tmProgramCourseIpRole, tmProgramCourseIpRoleBase, programCourseInstructor->startTime, programCourseInstructor->endTime, crew, programCourseInstructor->fltId)) {
			valid = false;
			break;
		}

	}
	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithCourseRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList, const ROSTER* instructorRoster) const {
	bool passAllRule = true;
	WarnInfo warnInfo;
	for (auto& tmCourseRoleBase : tmCourseRoleBaseList) {
		bool valid = false;

		if (valid && !CheckBaseWithCourseRole(warnInfo, roster, checkedProgramCourse, tmCourseRoleBase, programCourseList, instructorRoster)) {
			valid = false;
		}

		if (valid) {
			//满足任何一个tmCourseRoleBase即可
			passAllRule = true;
			break;
		}
	}
	if (!passAllRule) {
		ThrowRuleViolationForBase(warnInfo, instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithCourseRole(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	bool passAllRule = true;
	WarnCode warnCode = WarnCode::NO_WARN;
	WarnInfo warnInfo;
	for (auto& tmCourseRoleBase : tmCourseRoleBaseList) {
		bool valid = false;
		if (CheckQualNumberWithCourseRole(roster, tmCourseRoleBase, programCourseInstructorList, instructorRoster)) {
			valid = true;
		}
		else {
			warnCode = WarnCode::QUAL_NUMBER_WARN;
		}

		if (valid && !CheckBaseWithCourseRole(warnInfo, roster, tmCourseRoleBase, programCourseInstructorList, instructorRoster)) {
			valid = false;
			warnCode = WarnCode::BASE_WARN;
		}

		if (valid) {
			//满足任何一个tmCourseRoleBase即可
			passAllRule = true;
			break;
		}
	}
	if (!passAllRule) {
		if ((int)warnCode == (int)WarnCode::QUAL_NUMBER_WARN) {
			ThrowRuleViolationForNumberOfRoleQualPeople(instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
		}
		else if ((int)warnCode == (int)WarnCode::BASE_WARN) {
			ThrowRuleViolationForBase(warnInfo, instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckQualNumberWithCourseRole(const ROSTER* roster, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	bool passAllRule = true;

	auto& tmCourseRoleQualIndex = this->_dbData->tmCourseRoleQualIndex;
	int actualRoleQualNumber = 0;
	//检查base、rank、fleet、team
	map<std::shared_ptr<TmCourseRoleBase>, map<std::shared_ptr<TmCourseRoleQual>, int>> baseRoleQualNumMap; //map<std::shared_ptr<TmCourseRoleBase>, map<std::shared_ptr<TmCourseRoleQual>, 满足base和资质的实际人员数量>>
	for (auto& programCourseInstructor : programCourseInstructorList) {
		//每个角色都必须满足tmCourseRoleBase
		auto iterCrew = _dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		auto& crew = iterCrew->second;
		WarnInfo warnInfo;
		if (MatchRoleBase(warnInfo, tmCourseRoleBase, programCourseInstructor->startTime, programCourseInstructor->endTime, crew, programCourseInstructor->fltId)) {
			//配置base、rank、fleet、team后，再检查资质qual
			auto tmCourseRoleQualList = tmCourseRoleQualIndex->getByCourseRoleBaseId(tmCourseRoleBase->id);
			if (tmCourseRoleQualList.empty()) {
				//未配置qual条件
				continue;
			}
			for (auto& tmCourseRoleQual : tmCourseRoleQualList) {
				if (MatchRoleQualification(tmCourseRoleQual, programCourseInstructor->startTime, programCourseInstructor->endTime, crew)) {
					//同一角色，配置多条qual条件，满足一条即可
					actualRoleQualNumber++;
					auto iterRoleBase = baseRoleQualNumMap.find(tmCourseRoleBase);
					if (iterRoleBase == baseRoleQualNumMap.end()) {
						map<std::shared_ptr<TmCourseRoleQual>, int> roleQualMap;
						roleQualMap.insert(std::make_pair(tmCourseRoleQual, 1));
						baseRoleQualNumMap.insert(std::make_pair(tmCourseRoleBase, roleQualMap));
					}
					else {
						auto& roleQualMap = iterRoleBase->second;
						auto iterRoleQual = roleQualMap.find(tmCourseRoleQual);
						if (iterRoleQual == roleQualMap.end()) {
							roleQualMap.insert(std::make_pair(tmCourseRoleQual, 1));
						}
						else {
							iterRoleQual->second++;
						}
					}
				}
			}
		}
	}

	for (auto& pair : baseRoleQualNumMap) {
		auto& roleQualMap = pair.second;
		for (auto& pair2 : roleQualMap) {
			auto& tmCourseRoleQual = pair2.first;
			auto actualRoleQualNumber = pair2.second;
			if (tmCourseRoleQual->peopleLimit >= 0 && actualRoleQualNumber < tmCourseRoleQual->peopleLimit) {
				passAllRule = false;
			}
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckBaseWithCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList, const ROSTER* instructorRoster) const {
	bool valid = true;
	if (programCourseList.empty()) {
		return true;
	}
	//检查base、rank、fleet、team
	for (auto& programCourse : programCourseList) {
		//每个角色都必须满足base、rank、fleet、team以及qual资质要求
		auto iterCrew = _dbData->crewIdMap.find(programCourse->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		auto& crew = iterCrew->second;
		//满足tmCourseRoleBaseList中任意一个即可
		if (!MatchRoleBase(warnInfo, tmCourseRoleBase, programCourse->startTime, programCourse->endTime, crew, programCourse->fltId)) {
			valid = false;
			break;
		}
	}
	if (!valid) {
		ThrowRuleViolationForBase(warnInfo, instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
	}
	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckBaseWithCourseRole(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	bool valid = true;
	if (programCourseInstructorList.empty()) {
		return true;
	}

	//检查base、rank、fleet、team
	for (auto& programCourseInstructor : programCourseInstructorList) {
		//每个角色都必须满足base、rank、fleet、team以及qual资质要求
		auto iterCrew = _dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		auto& crew = iterCrew->second;
		if (!MatchRoleBase(warnInfo, tmCourseRoleBase, programCourseInstructor->startTime, programCourseInstructor->endTime, crew, programCourseInstructor->fltId)) {
			valid = false;
			break;
		}
	}
	return valid;
}

//获得学员角色的实际人数
int LimitCourseRoleQualAndNumbersForEvaFdRule::GetActualRoleNumber(const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList) const {
	int actualRoleNumber = 0;
	WarnInfo warnInfo;
	for (auto& programCourse : programCourseList) {
		auto iterCrew = _dbData->crewIdMap.find(programCourse->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		auto& crew = iterCrew->second;
		if (MatchRoleBaseAndQualification(warnInfo, tmProgramCourseRole, programCourse->startTime, programCourse->endTime, crew, programCourse->fltId)) {
			actualRoleNumber++;
		}
	}
	return actualRoleNumber;
}

//获得教员角色的实际人数
int LimitCourseRoleQualAndNumbersForEvaFdRule::GetActualRoleNumber(const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList) const {
	int actualRoleNumber = 0;
	WarnInfo warnInfo;
	for (auto& programCourseInstructor : programCourseInstructorList) {
		auto iterCrew = _dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		auto& crew = iterCrew->second;
		if (MatchRoleBaseAndQualification(warnInfo, tmProgramCourseRole, programCourseInstructor->startTime, programCourseInstructor->endTime, crew, programCourseInstructor->fltId)) {
			actualRoleNumber++;
		}
	}
	return actualRoleNumber;
}

int LimitCourseRoleQualAndNumbersForEvaFdRule::GetActualRoleNumber(const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList, const vector<std::shared_ptr<TmProgramCourse>>& programCourseList) const {
	int actualRoleNumber = 0;

	auto& tmCourseRoleBaseIndex = this->_dbData->tmCourseRoleBaseIndex;
	auto& tmCourseRoleQualIndex = this->_dbData->tmCourseRoleQualIndex;

	//检查base、rank、fleet、team
	for (auto& programCourse : programCourseList) {
		auto iterCrew = _dbData->crewIdMap.find(programCourse->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		auto& crew = iterCrew->second;
		for (auto& tmCourseRoleBase : tmCourseRoleBaseList) {
			bool matched = false;
			WarnInfo warnInfo;
			if (MatchRoleBase(warnInfo, tmCourseRoleBase, programCourse->startTime, programCourse->endTime, crew, programCourse->fltId)) {
				//配置base、rank、fleet、team后，再检查资质qual
				auto tmCourseRoleQualList = tmCourseRoleQualIndex->getByCourseRoleBaseId(tmCourseRoleBase->id);
				if (tmCourseRoleQualList.empty()) {
					//未配置qual条件
					actualRoleNumber++;
					matched = true;
					continue;
				}
				for (auto& tmCourseRoleQual : tmCourseRoleQualList) {
					if (MatchRoleQualification(tmCourseRoleQual, programCourse->startTime, programCourse->endTime, crew)) {
						//同一角色，配置多条qual条件，满足一条即可
						actualRoleNumber++;
						matched = true;
						break;
					}
				}
			}
			
			if (matched) {
				//匹配满足一条即可
				break;
			}
		}
	}
	return actualRoleNumber;
}

int LimitCourseRoleQualAndNumbersForEvaFdRule::GetActualRoleNumber(const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList) const {
	int actualRoleNumber = 0;

	auto& tmCourseRoleBaseIndex = this->_dbData->tmCourseRoleBaseIndex;
	auto& tmCourseRoleQualIndex = this->_dbData->tmCourseRoleQualIndex;

	//检查base、rank、fleet、team
	for (auto& programCourseInstructor : programCourseInstructorList) {
		auto iterCrew = _dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		auto& crew = iterCrew->second;
		for (auto& tmCourseRoleBase : tmCourseRoleBaseList) {
			bool matched = false;
			WarnInfo warnInfo;
			if (MatchRoleBase(warnInfo, tmCourseRoleBase, programCourseInstructor->startTime, programCourseInstructor->endTime, crew, programCourseInstructor->fltId)) {
				//配置base、rank、fleet、team后，再检查资质qual
				auto tmCourseRoleQualList = tmCourseRoleQualIndex->getByCourseRoleBaseId(tmCourseRoleBase->id);
				if (tmCourseRoleQualList.empty()) {
					//未配置qual条件
					actualRoleNumber++;
					matched = true;
					continue;
				}
				for (auto& tmCourseRoleQual : tmCourseRoleQualList) {
					if (MatchRoleQualification(tmCourseRoleQual, programCourseInstructor->startTime, programCourseInstructor->endTime, crew)) {
						//同一角色，配置多条qual条件，满足一条即可
						actualRoleNumber++;
						matched = true;
						break;
					}
				}
			}

			if (matched) {
				//匹配满足一条即可
				break;
			}
		}
	}
	return actualRoleNumber;
}

int LimitCourseRoleQualAndNumbersForEvaFdRule::GetActualRoleNumber(const std::shared_ptr<TmPairingChartRole>& tmPairingChartRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList) const {
	int actualRoleNumber = 0;

	auto& tmPairingChartRoleQualIndex = this->_dbData->tmPairingChartRoleQualIndex;

	//检查base、rank、fleet、team
	auto tmPairingChartRoleQualList = tmPairingChartRoleQualIndex->getByPairingChartRoleId(tmPairingChartRole->id);
	WarnInfo warnInfo;
	for (auto& programCourseInstructor : programCourseInstructorList) {
		auto iterCrew = _dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		auto& crew = iterCrew->second;
		if (MatchRoleBase(warnInfo, tmPairingChartRole, programCourseInstructor->startTime, programCourseInstructor->endTime, crew, programCourseInstructor->fltId)) {
			if (tmPairingChartRoleQualList.empty()) {
				actualRoleNumber++;
				continue;
			}

			for (auto& tmPairingChartRoleQual : tmPairingChartRoleQualList) {
				if (MatchRoleQualification(tmPairingChartRoleQual, programCourseInstructor->startTime, programCourseInstructor->endTime, crew)) {
					//同一角色，配置多条qual条件，满足一条即可
					actualRoleNumber++;
					break;
				}
			}

		}
	}
	return actualRoleNumber;
}

//个性化检查计划训练课程伙伴PNR(Partner)的base/rank/fleet/team/qual 限制
bool LimitCourseRoleQualAndNumbersForEvaFdRule::MatchRoleBaseAndQualification(WarnInfo& warnInfo, const std::shared_ptr<TmProgramCourseRole>& tmProgramCourseRole, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const {
	if (!isCrewQualified(warnInfo.baseWarnTypes, crew, fltId, tmProgramCourseRole->bases, tmProgramCourseRole->ranks, tmProgramCourseRole->fleets, tmProgramCourseRole->teams, tmProgramCourseRole->actingRanks, startTime, endTime, _dbData)) {
		warnInfo.baseWarnCrewIds.emplace(crew->idCrew);
		return false;
	}

	vector<string> crewQuals = RosterUtils::GetValidQualificationOfCrew(startTime, endTime, crew);
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
	if (!passAllRule) {
		warnInfo.baseWarnTypes.emplace("qual");
		warnInfo.baseWarnCrewIds.emplace(crew->idCrew);
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::MatchRoleBase(WarnInfo& warnInfo, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const {
	if (!isCrewQualified(warnInfo.baseWarnTypes, crew, fltId, tmProgramCourseIpRole->bases, tmProgramCourseIpRole->ranks, tmProgramCourseIpRoleBase->fleets, tmProgramCourseIpRoleBase->teams, tmProgramCourseIpRoleBase->actingRanks, startTime, endTime, _dbData)) {
		warnInfo.baseWarnCrewIds.emplace(crew->idCrew);
		return false;
	}
	return true;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::MatchRoleBaseAndQualification(WarnInfo& warnInfo, const std::shared_ptr<TmProgramCourseIpRole>& tmProgramCourseIpRole, const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const std::shared_ptr<TmProgramCourseIpRoleQual>& tmProgramCourseIpRoleQual, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const {
	if (!isCrewQualified(warnInfo.baseWarnTypes, crew, fltId, tmProgramCourseIpRole->bases, tmProgramCourseIpRole->ranks, tmProgramCourseIpRoleBase->fleets, tmProgramCourseIpRoleBase->teams, tmProgramCourseIpRoleBase->actingRanks, startTime, endTime, _dbData)) {
		warnInfo.baseWarnCrewIds.emplace(crew->idCrew);
		return false;
	}

	vector<string> crewQuals = RosterUtils::GetValidQualificationOfCrew(startTime, endTime, crew);
	auto& tmProgramCourseIpRoleQualList = this->_dbData->tmProgramCourseIpRoleQualIndex->getByProgramCourseIpRoleBaseId(tmProgramCourseIpRoleBase->id);

	if (tmProgramCourseIpRoleQual->roleQuals.empty()) {
		return true;
	}

	bool valid = false;
	if (tmProgramCourseIpRoleQual->roleQualOption == "OR") {
		valid = false;
		for (auto& roleQual : tmProgramCourseIpRoleQual->roleQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), roleQual) != crewQuals.cend()) {
				valid = true;
				break;
			}
		}
	}
	else if (tmProgramCourseIpRoleQual->roleQualOption == "AND") {
		valid = true;
		for (auto& roleQual : tmProgramCourseIpRoleQual->roleQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), roleQual) == crewQuals.cend()) {
				valid = false;
				warnInfo.baseWarnTypes.emplace("qual");
				warnInfo.baseWarnCrewIds.emplace(crew->idCrew);
				break;
			}
		}
	}

	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::MatchRoleQualification(const std::shared_ptr<TmProgramCourseIpRoleBase>& tmProgramCourseIpRoleBase, const std::shared_ptr<TmProgramCourseIpRoleQual>& tmProgramCourseIpRoleQual, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const {
	vector<string> crewQuals = RosterUtils::GetValidQualificationOfCrew(startTime, endTime, crew);

	if (tmProgramCourseIpRoleQual->roleQuals.empty()) {
		return true;
	}

	bool valid = false;
	if (tmProgramCourseIpRoleQual->roleQualOption == "OR") {
		valid = false;
		for (auto& roleQual : tmProgramCourseIpRoleQual->roleQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), roleQual) != crewQuals.cend()) {
				valid = true;
				break;
			}
		}
	}
	else if (tmProgramCourseIpRoleQual->roleQualOption == "AND") {
		valid = true;
		for (auto& roleQual : tmProgramCourseIpRoleQual->roleQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), roleQual) == crewQuals.cend()) {
				valid = false;
				break;
			}
		}
	}

	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::MatchRoleBase(WarnInfo& warnInfo, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const {
	if (!isCrewQualified(warnInfo.baseWarnTypes, crew, fltId, tmCourseRoleBase->bases, tmCourseRoleBase->ranks, tmCourseRoleBase->fleets, tmCourseRoleBase->teams, tmCourseRoleBase->actingRanks, startTime, endTime, _dbData)) {
		warnInfo.baseWarnCrewIds.emplace(crew->idCrew);
		return false;
	}
	return true;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::MatchRoleQualification(const std::shared_ptr<TmCourseRoleQual>& tmCourseRoleQual, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew) const {
	if (tmCourseRoleQual->quals.empty()) {
		return true;
	}
	bool valid = false;
	vector<string> crewQuals = RosterUtils::GetValidQualificationOfCrew(startTime, endTime, crew);
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

bool LimitCourseRoleQualAndNumbersForEvaFdRule::MatchRoleBase(WarnInfo& warnInfo, const std::shared_ptr<TmPairingChartRole>& tmPairingChartRole, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew, const long long fltId) const {
	if (!isCrewQualified(warnInfo.baseWarnTypes, crew, fltId, tmPairingChartRole->bases, tmPairingChartRole->ranks, tmPairingChartRole->fleets, tmPairingChartRole->teams, tmPairingChartRole->actingRanks, startTime, endTime, _dbData)) {
		warnInfo.baseWarnCrewIds.emplace(crew->idCrew);
		return false;
	}
	return true;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::MatchRoleQualification(const std::shared_ptr<TmPairingChartRoleQual>& tmPairingChartRoleQual, const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew) const {
	if (tmPairingChartRoleQual->roleQuals.empty()) {
		return true;
	}
	bool valid = false;
	vector<string> crewQuals = RosterUtils::GetValidQualificationOfCrew(startTime, endTime, crew);
	if (tmPairingChartRoleQual->roleQualOption == "OR") {
		valid = false;
		for (auto& qual : tmPairingChartRoleQual->roleQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), qual) != crewQuals.cend()) {
				valid = true;
				break;
			}
		}
	}
	else if (tmPairingChartRoleQual->roleQualOption == "AND") {
		valid = true;
		for (auto& qual : tmPairingChartRoleQual->roleQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), qual) == crewQuals.cend()) {
				valid = false;
				break;
			}
		}
	}
	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithCourseRole(set<string>& checkedRoles, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const {
	bool passAllRule = true;
	auto& tmProgramIndex = this->_dbData->tmProgramIndex;
	auto& tmCourseRoleIndex = this->_dbData->tmCourseRoleIndex;
	auto& tmCourseRoleBaseIndex = this->_dbData->tmCourseRoleBaseIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	auto tmCourseRoleList = tmCourseRoleIndex->getByCourseId(checkedProgramCourse->courseId);
	for (auto& tmCourseRole : tmCourseRoleList) {
		if (tmCourseRole->role.empty()) {
			continue;
		}

		if (this->_dbData->scenario.airline == "BR") {
			if (tmCourseRole->role != TrainingRole::IP && tmCourseRole->role != TrainingRole::TE) {
				//EvaFd 并且仅检查IP和TE的人员总数量（该人员与bases、fleets等无关)
				continue;
			}
		}
		else {
			if (std::find(checkedRoles.begin(), checkedRoles.end(), tmCourseRole->role) != checkedRoles.end()) {
				//个性化配置已经检查过，则不在检查
				continue;
			}
		}

		_ruleViolation.SetParam("role", tmCourseRole->role);

		auto tmCourseRoleBaseList = tmCourseRoleBaseIndex->getByCourseRoleId(tmCourseRole->id);

		int actualRoleNumber = 0;
		if (tmCourseRole->role == TrainingRole::TE) {//学员TE角色
			auto tmProgramCourseList = tmProgramCourseIndex->getByGroupId(checkedProgramCourse->groupId);
			if (this->_dbData->scenario.airline == "BR") {
				auto tmProgram = tmProgramIndex->getById(checkedProgramCourse->programId);
				//EvaFD 仅检查人员总数（该人员与bases、fleets等无关)
				if (tmProgram != nullptr && tmProgram->isSoloCourse()) {
                    ////Solo Course的IP和TE也在Program Course表，因此计算TE人数时，仅针对TE角色
					//actualRoleNumber = std::count_if(tmProgramCourseList.begin(), tmProgramCourseList.end(), [](const std::shared_ptr<TmProgramCourse>& tmProgramCourse) { return tmProgramCourse->role == TrainingRole::TE; });
					
					//Solo Course的TE法规不检查
					continue;
				}
				else {
					actualRoleNumber = (int)tmProgramCourseList.size();
				}

				if (actualRoleNumber < tmCourseRole->minCapacity || actualRoleNumber > tmCourseRole->maxCapacity) {
					passAllRule = false;
					ThrowRuleViolationForNumberOfPeople(instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
				}
			}
			else {
				//actualRoleNumber = GetActualRoleNumber(tmCourseRoleBaseList, tmProgramCourseList);//上课学员的角色人员数量
				actualRoleNumber = (int)tmProgramCourseList.size();//角色人员数量，这里不需要检查查base、rank、fleet、team以及qual（后续再检查）

				if (actualRoleNumber < tmCourseRole->minCapacity || actualRoleNumber > tmCourseRole->maxCapacity) {
					passAllRule = false;
					ThrowRuleViolationForNumberOfPeople(instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
				}

				if (passAllRule && !CheckRuleWithCourseRole(roster, checkedProgramCourse, tmCourseRoleBaseList, tmProgramCourseList, instructorRoster)) {
					passAllRule = false;
				}
			}
		}
		else {
			//其他角色，包括：IP、CK、PNR（除TE）
			//auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(checkedProgramCourse->groupId, tmCourseRole->role);
			vector<std::shared_ptr<TmProgramCourseInstructor>> tmProgramCourseInstructorList;
			if (tmCourseRole->role == TrainingRole::IP && TrainingCourseUtils::IsSubProgramCourse(checkedProgramCourse, this->_dbData)) {
				tmProgramCourseInstructorList = TrainingCourseUtils::GetSubCourseInstructorListByProgramCourse(checkedProgramCourse, tmCourseRole->role, this->_dbData);
			}
			else {
				tmProgramCourseInstructorList = TrainingCourseUtils::GetInstructorListByProgramCourse(checkedProgramCourse, tmCourseRole->role, true, this->_dbData);
			}

			if (this->_dbData->scenario.airline == "BR") {
				//EvaFD 仅检查人员总数（该人员与bases、fleets等无关)
				actualRoleNumber = (int)tmProgramCourseInstructorList.size();

				if (actualRoleNumber < tmCourseRole->minCapacity || actualRoleNumber > tmCourseRole->maxCapacity) {
					passAllRule = false;
					ThrowRuleViolationForNumberOfPeople(instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
				}
			}
			else {
				//actualRoleNumber = GetActualRoleNumber(tmCourseRoleBaseList, tmProgramCourseInstructorList);//上课的角色人员数量
				actualRoleNumber = (int)tmProgramCourseInstructorList.size(); //角色人员数量，这里不需要检查查base、rank、fleet、team以及qual（后续再检查）

				if (actualRoleNumber < tmCourseRole->minCapacity || actualRoleNumber > tmCourseRole->maxCapacity) {
					passAllRule = false;
					ThrowRuleViolationForNumberOfPeople(instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
				}

				if (passAllRule && !CheckRuleWithCourseRole(roster, checkedProgramCourse, tmCourseRoleBaseList, tmProgramCourseInstructorList, instructorRoster)) {
					passAllRule = false;
				}
			}
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithPairingChart(set<string>& checkedRoles, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const ROSTER* instructorRoster) const {
	bool passAllRule = true;
	auto& tmProgramIndex = this->_dbData->tmProgramIndex;
	auto& tmPairingChartRoleIndex = this->_dbData->tmPairingChartRoleIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	checkedRoles.emplace(TrainingRole::PNR);

	auto tmProgram = tmProgramIndex->getById(checkedProgramCourse->programId);
    if (tmProgram != nullptr && tmProgram->isSoloCourse()) {
		//Solo Course的PNR的PairingChartRole规则不检查
		return true;
	}

	_ruleViolation.SetParam("role", TrainingRole::PNR);

	//获得检查规则ParingChart
	vector<std::shared_ptr<TmPairingChart>> tmPairingChartList;
	auto tmProgramCourseList = tmProgramCourseIndex->getByGroupId(checkedProgramCourse->groupId);
	//获得PNR角色
	//auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(checkedProgramCourse->groupId, TrainingRole::PNR);
	auto tmProgramCourseInstructorList = TrainingCourseUtils::GetInstructorListByProgramCourse(checkedProgramCourse, TrainingRole::PNR, true, this->_dbData);
	for (auto& programCourse : tmProgramCourseList) {
		if (SkipCheckingPNR(programCourse)) {
			//设置异常代码，则跳出检查
			continue;
		}
		auto iterCrew = _dbData->crewIdMap.find(programCourse->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		auto& crew = iterCrew->second;

		const auto teProgramCoursePnr = this->_dbData->tmProgramCoursePnrIndex->getByProgramCourseId(TrainingCourseUtils::GetProgramCourseParentId(programCourse));
		auto tmPairingChartList = TrainingCourseUtils::GetPairingChart(crew, teProgramCoursePnr, programCourse->fltId, programCourse->courseId, _dbData);

		if (tmPairingChartList.empty()) {
			continue;
		}
		auto tmProgram = this->_dbData->tmProgramIndex->getById(programCourse->programId);
		long long footprintId = (tmProgram == nullptr) ? -1 : tmProgram->footprintId;
			
		vector<std::shared_ptr<TmPairingChartRole>> tmPairingChartRoleList;
		for (auto& tmPairingChart : tmPairingChartList) {
			auto list = tmPairingChartRoleIndex->getByPairingChartId(tmPairingChart->id);
			tmPairingChartRoleList.insert(tmPairingChartRoleList.end(), list.begin(), list.end());
		}

		if (!tmPairingChartRoleList.empty() && !CheckRuleWithPairingChart(roster, checkedProgramCourse, footprintId, tmPairingChartRoleList, tmProgramCourseInstructorList, instructorRoster)) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRuleWithPairingChart(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& checkedProgramCourse, const long long footprintId, const vector<std::shared_ptr<TmPairingChartRole>>& tmPairingChartRoleList, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	bool passAllRule = false;
	WarnCode warnCode = WarnCode::NO_WARN;
	WarnInfo warnInfo;
	for (auto& tmPairingChartRole : tmPairingChartRoleList) {
		if (tmPairingChartRole->roleNumber <= 0) {
			continue;
		}

		if (!tmPairingChartRole->footprintIds.empty()
			&& std::find(tmPairingChartRole->footprintIds.begin(), tmPairingChartRole->footprintIds.end(), footprintId) == tmPairingChartRole->footprintIds.end()) {
			continue;
		}

		bool valid = false;
		if (CheckRoleNumberWithPairingChart(roster, tmPairingChartRole, programCourseInstructorList, instructorRoster)) {
			valid = true;
		}
		else {
			warnCode = WarnCode::ROLE_NUMBER_WARN;
		}
		if (valid && !CheckBaseWithPairingChart(warnInfo, roster, tmPairingChartRole, programCourseInstructorList, instructorRoster)) {
			_ruleViolation.SetParam("tmPairingChartRoleId", std::to_string(tmPairingChartRole->id));
			valid = false;
			warnCode = WarnCode::BASE_WARN;
		}
		if (valid) {
			//多条tmPairingChartRole满足其中一个即可
			passAllRule = true;
			warnInfo.baseWarnTypes.clear();
			warnInfo.baseWarnCrewIds.clear();
			break;
		}
	}

	if ((int)warnCode == (int)WarnCode::NO_WARN) {
		passAllRule = true;
	}
	if (!passAllRule) {
		_ruleViolation.SetParam("role", TrainingRole::PNR);
		if ((int)warnCode == (int)WarnCode::ROLE_NUMBER_WARN) {
			//人员数量都没有匹配上，则提示人数告警
			ThrowRuleViolationForNumberOfPeople(instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
		}
		else if ((int)warnCode == (int)WarnCode::BASE_WARN) {
			//人员数量能匹配上，但仍然违规，则提示base、rank、fleet、team以及qual资质不满足要求
			ThrowRuleViolationForBase(warnInfo, instructorRoster == nullptr ? roster : instructorRoster, checkedProgramCourse);
		}
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckRoleNumberWithPairingChart(const ROSTER* roster, const std::shared_ptr<TmPairingChartRole>& tmPairingChartRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	bool valid = true;
	int requiredRoleNumber = tmPairingChartRole->roleNumber;
	if (requiredRoleNumber < 0) {
		return true;
	}

	//int actualRoleNumber = GetActualRoleNumber(tmPairingChartRole, programCourseInstructorList);//上课的角色人员数量
	int actualRoleNumber = (int)programCourseInstructorList.size();//角色人员数量，这里不需要检查查base、rank、fleet、team以及qual（后续再检查）

	if (requiredRoleNumber >= 0 && actualRoleNumber != requiredRoleNumber) {
		valid = false;
		//_ruleViolation.SetParam("role", TrainingRole::PNR);
		//ThrowRuleViolationForNumberOfPeople(instructorRoster == nullptr ? roster : instructorRoster);
	}
	return valid;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::CheckBaseWithPairingChart(WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmPairingChartRole>& tmPairingChartRole, const vector<std::shared_ptr<TmProgramCourseInstructor>>& programCourseInstructorList, const ROSTER* instructorRoster) const {
	bool passAllRule = true;

	auto& tmPairingChartRoleQualIndex = this->_dbData->tmPairingChartRoleQualIndex;

	//检查base、rank、fleet、team
	auto tmPairingChartRoleQualList = tmPairingChartRoleQualIndex->getByPairingChartRoleId(tmPairingChartRole->id);

	for (auto& programCourseInstructor : programCourseInstructorList) {
		//每个教员都必须满足base、rank、fleet、team以及qual资质要求
		auto iterCrew = _dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == _dbData->crewIdMap.end()) {
			continue;
		}

		bool valid = false;
		auto& crew = iterCrew->second;
		WarnInfo crewWarnInfo;
		if (MatchRoleBase(crewWarnInfo, tmPairingChartRole, programCourseInstructor->startTime, programCourseInstructor->endTime, crew, programCourseInstructor->fltId)) {
			crewWarnInfo.baseWarnTypes.emplace("qual");
			if (tmPairingChartRoleQualList.empty()) {
				valid = true;
				continue;
			}

			for (auto& tmPairingChartRoleQual : tmPairingChartRoleQualList) {
				if (MatchRoleQualification(tmPairingChartRoleQual, programCourseInstructor->startTime, programCourseInstructor->endTime, crew)) {
					//同一角色，配置多条qual条件，满足一条即可
					valid = true;
					break;
				}
			}
		}
		if (!valid) {
			warnInfo.baseWarnTypes.insert(crewWarnInfo.baseWarnTypes.begin(), crewWarnInfo.baseWarnTypes.end());
			warnInfo.baseWarnCrewIds.emplace(programCourseInstructor->crewId);
			passAllRule = false;
			break;
		}
	}
	if (passAllRule) {
		warnInfo.baseWarnTypes.clear();
		warnInfo.baseWarnCrewIds.clear();
	}
	return passAllRule;
}

bool LimitCourseRoleQualAndNumbersForEvaFdRule::SkipCheckingPNR(const std::shared_ptr<TmProgramCourse> programCourse) const {
	auto& pnrExceptionCodes = _ruleParams[0]._pnrExceptionCodes;

	const auto& rf = this->_dbData->rosterFlightMgr.get(programCourse->fltId, programCourse->crewId);
	if (rf == nullptr || pnrExceptionCodes.empty()) {
		return false;
	}
	set<string> tsFlags;
	split(rf->tsFlag.c_str(), '|', tsFlags);
	return !tsFlags.empty() && StringUtils::Intersect(tsFlags, pnrExceptionCodes);
}

void LimitCourseRoleQualAndNumbersForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitCourseRoleQualAndNumbersForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitCourseRoleQualAndNumbersForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitCourseRoleQualAndNumbersForEvaFdRule::ThrowRuleViolationForRoleQualPeople(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string role = _ruleViolation.GetParam("role");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//机组人员(XXX)的角色(XXX)资质（XXX)课程要求不一致
	std::string msg = "The assigned course ({0:courseCode}) of crew doesn't meet {1:role} qual requirements.";
	msg = StringUtils::Format(msg, courseCode, role);

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
	if (programCourse != nullptr) {
		rv->segmentId = programCourse->fltId;
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("role", role));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("programId", programCourse == nullptr ? "-1" : std::to_string(programCourse->programId)));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitCourseRoleQualAndNumbersForEvaFdRule::ThrowRuleViolationForNumberOfRoleQualPeople(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string role = _ruleViolation.GetParam("role");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//机组人员(XXX)的角色(XXX)资质（XXX)人数与课程要求不一致
	std::string msg = "The assigned course ({0:courseCode}) of crew doesn't meet {1:role} qual and number requirements.";
	msg = StringUtils::Format(msg, courseCode, role);

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
	if (programCourse != nullptr) {
		rv->segmentId = programCourse->fltId;
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("role", role));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("programId", programCourse == nullptr ? "-1" : std::to_string(programCourse->programId)));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitCourseRoleQualAndNumbersForEvaFdRule::ThrowRuleViolationForNumberOfPeople(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string role = _ruleViolation.GetParam("role");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");
	string tmPairingChartRoleId = _ruleViolation.GetParam("tmPairingChartRoleId");

	//机组人员(XXX)的角色(XXX)人数与课程要求不一致
	std::string msg = "The assigned course ({0:courseCode}) of crew doesn't meet role ({1:role}) number requirements.";
	msg = StringUtils::Format(msg, courseCode, role);

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
	if (programCourse != nullptr) {
		rv->segmentId = programCourse->fltId;
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("role", role));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("programId", programCourse == nullptr ? "-1" : std::to_string(programCourse->programId)));
	rv->operation_result.insert(pair<string, string>("tmPairingChartRoleId", tmPairingChartRoleId));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitCourseRoleQualAndNumbersForEvaFdRule::ThrowRuleViolationForBase(const WarnInfo& warnInfo, const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string role = _ruleViolation.GetParam("role");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//机组人员(XXX)的角色(XXX)与rank要求不一致
	std::string msg = "The assigned course ({0:courseCode}) of crew doesn't meet role ({1:role}) {2:baseWarnTypes} requirements.";
	msg = StringUtils::Format(msg, courseCode, role, warnInfo.baseWarnTypes.empty() ? "base/rank/acting rank/fleet/team" : StringUtils::Join(warnInfo.baseWarnTypes, "/"));

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
	if (programCourse != nullptr) {
		rv->segmentId = programCourse->fltId;
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("role", role));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("programId", programCourse == nullptr ? "-1" : std::to_string(programCourse->programId)));
	_ruleViolation.AddRuleViolations(rv);
}
