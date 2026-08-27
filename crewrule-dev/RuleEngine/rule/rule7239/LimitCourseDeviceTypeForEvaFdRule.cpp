/**
 * @file LimitCourseDeviceTypeForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitCourseDeviceTypeForEvaFdRule.h"
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

bool LimitCourseDeviceTypeForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
		
		bool valid = CheckRule(roster, crew);
		if (!valid) {
			passAllRule = false;
		}
	}

	return passAllRule;
}

bool LimitCourseDeviceTypeForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool passAllRule = true;

	//获得人员有效资质列表
	vector<string> crewQuals = RosterUtils::GetValidQualificationOfCrew(roster, crew);

	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	//roster从非学员维度检查
	const auto programCourseInstructorList = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (programCourseInstructor->groupId.empty()) {
			continue;
		}
		auto tmProgramCourse = tmProgramCourseIndex->getAnyOneByGroupId(programCourseInstructor->groupId);
		if (tmProgramCourse == nullptr) {
			Logger::getRuleLogger()->warn("[CheckCourseDevice] TmProgramCourse does not exist.[groupId={}]", programCourseInstructor->groupId);
			continue;
		}
		auto [programCourseDevice, programCourseDeviceTime] = TrainingCourseUtils::GetDeviceOfProgramCourse(tmProgramCourse, this->GetDataContext());
		if (programCourseDevice == nullptr) {
			continue;
		}

		_ruleViolation.SetParam("programCourseId", StringUtils::lltos(tmProgramCourse->id));
		auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, this->GetDataContext());
		if (tmCourse != nullptr) {
			_ruleViolation.SetParam("courseCode", tmCourse->courseCode);
		}
		_ruleViolation.SetParam("deviceType", programCourseDevice->deviceType);
		_ruleViolation.SetParam("resourceType", programCourseDevice->resourceType);
		_ruleViolation.SetParam("resourceCode", programCourseDevice->resourceCode);

		if (!CheckCourseDeviceType(roster, crew, crewQuals, programCourseDevice, tmProgramCourse)) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceType(roster);
		}
	}

	//roster从学员维度检查
	const auto programCourseList = tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : programCourseList) {
		
		auto [programCourseDevice, programCourseDeviceTime] = TrainingCourseUtils::GetDeviceOfProgramCourse(programCourse, this->GetDataContext());

		if (programCourseDevice == nullptr) {
			continue;
		}

		_ruleViolation.SetParam("programCourseId", StringUtils::lltos(programCourse->id));
		auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->GetDataContext());
		if (tmCourse != nullptr) {
			_ruleViolation.SetParam("courseCode", tmCourse->courseCode);
		}
		_ruleViolation.SetParam("deviceType", programCourseDevice->deviceType);
		_ruleViolation.SetParam("resourceType", programCourseDevice->resourceType);
		_ruleViolation.SetParam("resourceCode", programCourseDevice->resourceCode);

		if (!CheckCourseDeviceType(roster, crew, crewQuals, programCourseDevice, programCourse)) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceType(roster);

			//获得该课程的所有教员(COF)，检查教员是否满足课程设备类型要求
			const auto cofRosters = TrainingCourseUtils::GetInstructorRostersOnCourse(programCourse->groupId, this->GetDataContext());
			for (auto& cofRoster : cofRosters) {
				ThrowRuleViolationForCourseDeviceType(cofRoster.get());
			}
		}
	}
	return passAllRule;
}

//检查训练课程设备类型（Device）限制
bool LimitCourseDeviceTypeForEvaFdRule::CheckCourseDeviceType(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmDevice>& programCourseDevice, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	//比较“ProgramCourse 中 Device 设备类型" 与 "Course的Device 设备类型”是否一致
	//tm_course.device_type（仅一个值） ：对照tm_device.resouce_desc的首字母。(必填的，Device大类), 会转换到 tmDevice.deviceType
	//tm_course.device_group（可以多个值，或关系）：对照tm_device.resource_type（可以多个值，或关系）(公版的device配置，Device小类)
	//tm_course_role_device.device_type（可以多个值，或关系）：对照 tm_device.resource_type（可以多个值，或关系）（EVA独有的配置，Device小类）
	//tm_course_role_device.device_codes（可以多个值，或关系）：对照 tm_device.resource_code（EVA独有的配置，Device具体设备）

	if (programCourseDevice == nullptr) {
		//Program Course没有设置Device
		return true;
	}

	auto& tmCourseRoleIndex = this->_dbData->tmCourseRoleIndex;
	auto& tmCourseRoleBaseIndex = this->_dbData->tmCourseRoleBaseIndex;
	auto& tmCourseRoleDeviceIndex = this->_dbData->tmCourseRoleDeviceIndex;
	auto& tmCourseRoleQualIndex = this->_dbData->tmCourseRoleQualIndex;
	auto& tmCourseMap = this->_dbData->tmCourseMap;

	//获得ProgramCourse中设备类型、资源类型、资源代码
	auto& programCourseDeviceType = programCourseDevice->deviceType;
	auto& programCourseDeviceResourceType = programCourseDevice->resourceType;
	auto& programCourseDeviceResourceTypes = programCourseDevice->resourceTypes;
	auto& programCourseDeviceResourceCode = programCourseDevice->resourceCode;


	//获得Course中设备类型，并于Course中设备类型进行比较
	auto& courseId = programCourse->courseId;
	auto iterCourse = tmCourseMap.find(courseId);
	if (iterCourse == tmCourseMap.end()) {
		return true;
	}
	auto& course = iterCourse->second;
	if (course->deviceOption == "MUST" && course->deviceType != programCourseDeviceType) {
		//设备类型（大类）不一致
		return false;
	}

	if (course->deviceGroups.empty()) {
		//EVA特有
		auto tmCourseRoleList = tmCourseRoleIndex->getByCourseId(courseId);
		for (auto& tmCourseRole : tmCourseRoleList) {

			auto tmCourseRoleBaseList = tmCourseRoleBaseIndex->getByCourseRoleId(tmCourseRole->id);
			for (auto& tmCourseRoleBase : tmCourseRoleBaseList) {

				if (!MatchCourseRoleBase(roster, crew, crewQuals, tmCourseRoleBase)) {
					continue;
				}

				auto tmCourseRoleQualList = tmCourseRoleQualIndex->getByCourseRoleBaseId(tmCourseRoleBase->id);
				if (!MatchCourseRoleQualification(roster, crew, crewQuals, tmCourseRoleQualList)) {
					continue;
				}

				auto tmCourseRoleDeviceList = tmCourseRoleDeviceIndex->getByCourseRoleBaseId(tmCourseRoleBase->id);
				if (tmCourseRoleDeviceList.empty()) {
					continue;
				}
				bool valid = false;
				int suggestionCount = 0;
				for (auto& tmCourseRoleDevice : tmCourseRoleDeviceList) {
					//多条CourseRoleDevice其中一条满足即可
					if (tmCourseRoleDevice->deviceCodes.empty() && tmCourseRoleDevice->deviceTypes.empty()) {
						continue;
					}
					if (tmCourseRoleDevice->option == "MUST") { //检查具体设备的资源代码
						if (std::find(tmCourseRoleDevice->deviceCodes.begin(), tmCourseRoleDevice->deviceCodes.end(), programCourseDeviceResourceCode) != tmCourseRoleDevice->deviceCodes.end()) {
							//设备资源代码不一致
							valid = true;
							break;
						}

						if (tmCourseRoleDevice->deviceTypes.empty() || StringUtils::Intersect(tmCourseRoleDevice->deviceTypes, programCourseDeviceResourceTypes)) { //检查具体设备的资源类型
							//资源类型（小类）一致
							valid = true;
							break;
						}
					}
					else {
						suggestionCount++;//tmCourseRoleDevice->option == "SUGGESTION"的数量
					}
				}
				if (suggestionCount == tmCourseRoleDeviceList.size()) {
					//全部都是SUGGESTION，则合法
					valid = true;
				}
				if (!valid) {
					return false;
				}
			}
		}
	}
	else {
		//公版
		if (course->deviceOption == "MUST" && !StringUtils::Intersect(course->deviceGroups, programCourseDeviceResourceTypes)) {
			//资源类型（小类）不一致
			return false;
		}
	}
	return true;
}

bool LimitCourseDeviceTypeForEvaFdRule::MatchCourseRoleBase(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase) const {
	std::vector<string> positions;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, tmCourseRoleBase->bases, tmCourseRoleBase->ranks, tmCourseRoleBase->fleets, tmCourseRoleBase->teams, positions, roster->getStartTimeUtcAct(), roster->getRestStartUtcAct())) {
		return false;
	}
	return true;
}

bool LimitCourseDeviceTypeForEvaFdRule::MatchCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const vector<std::shared_ptr<TmCourseRoleQual>>& tmCourseRoleQualList) const {
	bool valid = false;
	if (tmCourseRoleQualList.empty()) {
		return true;
	}
	for (auto& tmCourseRoleQual : tmCourseRoleQualList) {
		if (MatchCourseRoleQualification(roster, crew, crewQuals, tmCourseRoleQual)) {
			//同一角色，配置多条qual条件，满足一条即可
			valid = true;
			break;
		}
	}
	return valid;
}

bool LimitCourseDeviceTypeForEvaFdRule::MatchCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmCourseRoleQual>& tmCourseRoleQual) const {
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

void LimitCourseDeviceTypeForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitCourseDeviceTypeForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitCourseDeviceTypeForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitCourseDeviceTypeForEvaFdRule::ThrowRuleViolationForCourseDeviceType(const ROSTER* roster) const {
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string resourceCode = _ruleViolation.GetParam("resourceCode");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//培训课程不能使用该设备
	std::string msg = "The device ({0:resourceCode}) cannot be used in training courses ({1:courseCode}) of crew ({2:crewId}).";
	msg = StringUtils::Format(msg, resourceCode, courseCode, roster->idcrew);

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
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("resourceCode", resourceCode));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("cofCrewId", roster->idcrew));
	_ruleViolation.AddRuleViolations(rv);
}
