/**
 * @file CheckCourseDeviceAvailForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckCourseDeviceAvailForEvaFdRule.h"
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

bool CheckCourseDeviceAvailForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

bool CheckCourseDeviceAvailForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool passAllRule = true;
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

		int warnCode = CheckCourseDeviceTime(roster, tmProgramCourse, programCourseDevice, programCourseDeviceTime);
		if ((warnCode & (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::NOT_AVAILABLE) == (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::NOT_AVAILABLE) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceNotAvail(roster, tmProgramCourse);
		}
		if ((warnCode & (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::TIME_OVERLAP) == (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::TIME_OVERLAP) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceTime(roster, tmProgramCourse);
		}
		if ((warnCode & (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::TIME_OVERLAP2) == (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::TIME_OVERLAP2) {
			passAllRule = false;
			//ThrowRuleViolationForCourseDeviceTime2(roster, tmProgramCourse);
		}
		if ((warnCode & (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::NUM_OF_PEOPLE) == (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::NUM_OF_PEOPLE) {
			passAllRule = false;
			ThrowRuleViolationForCourseNumberOfPeopleWithDevice(roster, tmProgramCourse);
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

		int warnCode = CheckCourseDeviceTime(roster, programCourse, programCourseDevice, programCourseDeviceTime);
		if ((warnCode & (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::NOT_AVAILABLE) == (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::NOT_AVAILABLE) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceNotAvail(roster, programCourse);

			//获得该课程的所有教员(COF)，检查教员是否满足课程设备可用性
			const auto cofRosters = TrainingCourseUtils::GetInstructorRostersOnCourse(programCourse->groupId, this->GetDataContext());
			for (auto& cofRoster : cofRosters) {
				ThrowRuleViolationForCourseDeviceNotAvail(cofRoster.get(), programCourse);
			}
		}
		if ((warnCode & (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::TIME_OVERLAP) == (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::TIME_OVERLAP) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceTime(roster, programCourse);

			//获得该课程的所有教员(COF)，检查教员是否满足课程设备可用性
			const auto cofRosters = TrainingCourseUtils::GetInstructorRostersOnCourse(programCourse->groupId, this->GetDataContext());
			for (auto& cofRoster : cofRosters) {
				ThrowRuleViolationForCourseDeviceTime(cofRoster.get(), programCourse);
			}
		}
		if ((warnCode & (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::TIME_OVERLAP2) == (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::TIME_OVERLAP2) {
			passAllRule = false;
			//ThrowRuleViolationForCourseDeviceTime2(roster, programCourse);
		}
		if ((warnCode & (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::NUM_OF_PEOPLE) == (int)CheckCourseDeviceAvailForEvaFdRule::DeviceWarnCode::NUM_OF_PEOPLE) {
			passAllRule = false;
			ThrowRuleViolationForCourseNumberOfPeopleWithDevice(roster, programCourse);

			//获得该课程的所有教员(COF)，检查教员是否满足课程设备可用性
			const auto cofRosters = TrainingCourseUtils::GetInstructorRostersOnCourse(programCourse->groupId, this->GetDataContext());
			for (auto& cofRoster : cofRosters) {
				ThrowRuleViolationForCourseNumberOfPeopleWithDevice(cofRoster.get(), programCourse);
			}
		}
	}
	return passAllRule;
}

int CheckCourseDeviceAvailForEvaFdRule::CheckCourseDeviceTime(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmDevice>& programCourseDevice, const std::shared_ptr<TmDeviceTime>& programCourseDeviceTime) const {
	int warnCode = (int)DeviceWarnCode::NO;
	//该设备是否有可用资源：未排过-可以直接排；排过课-看是否是同一 course code
	if ( programCourseDevice != nullptr && programCourseDevice->publishStatus == 0 ) {
		//设备不可用
		warnCode = warnCode | (int)DeviceWarnCode::NOT_AVAILABLE;
		return warnCode;
	}

	if (programCourseDeviceTime != nullptr && (programCourseDeviceTime->status == "N" || programCourseDeviceTime->status == "U_O")) {
		//设备时间不可用
		warnCode = warnCode | (int)DeviceWarnCode::NOT_AVAILABLE;
		return warnCode;
	}

	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;

	//检查设备容量限制(只需要统计TE人数)
	auto tmProgramCoursesWithDevice = tmProgramCourseIndex->getByDevice(programCourse->resourceCode, programCourse->startTime, programCourse->endTime);
	set<string> crewIds;
	std::for_each(tmProgramCoursesWithDevice.begin(), tmProgramCoursesWithDevice.end(), [&crewIds](const std::shared_ptr<TmProgramCourse>& programCourse) {
			crewIds.emplace(programCourse->crewId);
		});
	int numberOfAssignedTE = (int)crewIds.size(); //同一时间使用该设备的人数
	if (numberOfAssignedTE > programCourseDevice->roomCapacity) {
		_ruleViolation.SetParam("numberOfAssignedTE", StringUtils::itos(numberOfAssignedTE));//已分配学员的设备数量
		_ruleViolation.SetParam("deviceRoomCapacity", StringUtils::itos(programCourseDevice->roomCapacity));//可用设备数量
		warnCode = warnCode | (int)DeviceWarnCode::NUM_OF_PEOPLE;
	}

	//检查设备使用时间冲突，假设前提：TmDeviceTime中同一设备的使用开始时间和结束时间不会重复，这个有客户端和算法保证
	auto& tmDeviceTimeIndex = this->_dbData->tmDeviceTimeIndex;
	//int offsetTZMinutes = tmDeviceTimeIndex->getTimeZoneOffset(programCourse->resourceCode, programCourse->startTime);
	if (programCourseDeviceTime != nullptr && programCourseDeviceTime->status != "U_F") {
		//time_t programCourseStartTimeLoc = programCourse->startTime + (time_t)offsetTZMinutes * 60;
		//time_t programCourseEndTimeLoc = programCourse->endTime + (time_t)offsetTZMinutes * 60;

		for (auto& tmProgramCourseWithDevice : tmProgramCoursesWithDevice) {
			if (tmProgramCourseWithDevice->groupId == programCourse->groupId) {
				continue;
			}
			//不同课程在相同时间使用同一设备，若是SubCourse关系，则不违规；否则违规
			if (TrainingCourseUtils::IsSubProgramCourseRelated(programCourse, tmProgramCourseWithDevice, _dbData)) {
				//若是SubCourse关系, 不同课程可以相同时间使用同一设备
				continue;
			}
			warnCode = warnCode | (int)DeviceWarnCode::TIME_OVERLAP;
			_ruleViolation.SetParam("otherCrewId", tmProgramCourseWithDevice->crewId);
			_ruleViolation.SetParam("otherProgramCourseId", StringUtils::lltos(tmProgramCourseWithDevice->id));
			_ruleViolation.SetParam("otherProgramId", StringUtils::lltos(tmProgramCourseWithDevice->programId));
			_ruleViolation.SetParam("otherCourseId", StringUtils::lltos(tmProgramCourseWithDevice->courseId));
			auto tmOtherCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourseWithDevice->courseId, _dbData);
			_ruleViolation.SetParam("otherCourseCode", tmOtherCourse == nullptr ? "N/A" : tmOtherCourse->courseCode);
			break;
		}
	}

	//检查所有存在交集的设备时间
	auto tmDeviceTimeOverlapList = tmDeviceTimeIndex->getTimeOverlapByUtcTime(programCourse->resourceCode, programCourse->startTime, programCourse->endTime, false);
	for (auto& tmDeviceTime : tmDeviceTimeOverlapList) {
		
		if (!(tmDeviceTime->status == "N" || tmDeviceTime->status == "U_O")) {
			continue;
		}
		warnCode = warnCode | (int)DeviceWarnCode::TIME_OVERLAP2;

		time_t otherDeviceStartTimeLoc = tmDeviceTime->startDateLoc + tmDeviceTime->startTimeMinutes;
		time_t otherDeviceEndTimeLoc = tmDeviceTime->endDateLoc + tmDeviceTime->endTimeMinutes;
		int offsetTZMinutes = _dbData->tmDeviceTimeIndex->getTimeZoneOffset(tmDeviceTime->resourceCode, otherDeviceStartTimeLoc);

		time_t otherDeviceStartTimeUtc = otherDeviceStartTimeLoc - (time_t)offsetTZMinutes * 60;
		time_t otherDeviceEndTimeUtc = otherDeviceEndTimeLoc - (time_t)offsetTZMinutes * 60;

		_ruleViolation.SetParam("otherDeviceStartTimeLoc", StringUtils::lltos(otherDeviceStartTimeLoc));
		_ruleViolation.SetParam("otherDeviceEndTimeLoc", StringUtils::lltos(otherDeviceEndTimeLoc));

		_ruleViolation.SetParam("otherDeviceStartTimeUtc", StringUtils::lltos(otherDeviceEndTimeUtc));
		_ruleViolation.SetParam("otherDeviceEndTimeUtc", StringUtils::lltos(otherDeviceEndTimeUtc));

		_ruleViolation.SetParam("otherDeviceStartTimeHHmmLoc", tmDeviceTime->startTime);
		_ruleViolation.SetParam("otherDeviceEndTimeHHmmLoc", tmDeviceTime->endTime);


		ThrowRuleViolationForCourseDeviceTime2(roster, programCourse);
	}
	return warnCode;
}

void CheckCourseDeviceAvailForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckCourseDeviceAvailForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckCourseDeviceAvailForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckCourseDeviceAvailForEvaFdRule::ThrowRuleViolationForCourseDeviceNotAvail(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string resourceCode = _ruleViolation.GetParam("resourceCode");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//培训课程的设备使用时间冲突或者状态不可用
	std::string msg = "The device ({0:resourceCode}) of training course ({1:courseCode}) of crew ({2:crewId}) is unavailable.";
	msg = StringUtils::Format(msg, resourceCode, courseCode, roster->idcrew);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("resourceCode", resourceCode));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("cofCrewId", roster->idcrew));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckCourseDeviceAvailForEvaFdRule::ThrowRuleViolationForCourseDeviceTime(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string resourceCode = _ruleViolation.GetParam("resourceCode");
	string courseCode = _ruleViolation.GetParam("courseCode");
	string overlapDeviceStartTimeLoc = _ruleViolation.GetParam("overlapDeviceStartTimeLoc");
	string overlapDeviceEndTimeLoc = _ruleViolation.GetParam("overlapDeviceEndTimeLoc");

	string otherCrewId = _ruleViolation.GetParam("otherCrewId");
	string otherCourseCode = _ruleViolation.GetParam("otherCourseCode");
	string otherProgramCourseId = _ruleViolation.GetParam("otherProgramCourseId");
	string otherProgramId = _ruleViolation.GetParam("otherProgramId");
	string otherCourseId = _ruleViolation.GetParam("otherCourseId");


	//培训课程的设备使用时间冲突或者状态不可用
	std::string msg = "The device ({0:resourceCode}) has been occupied by another course ({1:otherCourseCode}) of crew ({2:otherCrewId}).";
	msg = StringUtils::Format(msg, resourceCode, otherCourseCode, otherCrewId);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("resourceCode", resourceCode));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("otherProgramCourseId", otherProgramCourseId));
	rv->operation_result.insert(pair<string, string>("otherCourseCode", otherCourseCode));
	rv->operation_result.insert(pair<string, string>("cofCrewId", roster->idcrew));
	rv->operation_result.insert(pair<string, string>("overlapDeviceStartTimeLoc", overlapDeviceStartTimeLoc));
	rv->operation_result.insert(pair<string, string>("overlapDeviceEndTimeLoc", overlapDeviceEndTimeLoc));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckCourseDeviceAvailForEvaFdRule::ThrowRuleViolationForCourseDeviceTime2(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string resourceCode = _ruleViolation.GetParam("resourceCode");
	string courseCode = _ruleViolation.GetParam("courseCode");
	string overlapDeviceStartTimeLoc = _ruleViolation.GetParam("overlapDeviceStartTimeLoc");
	string overlapDeviceEndTimeLoc = _ruleViolation.GetParam("overlapDeviceEndTimeLoc");

	string otherDeviceStartTimeLoc = _ruleViolation.GetParam("otherDeviceStartTimeLoc");
	string otherDeviceEndTimeLoc = _ruleViolation.GetParam("otherDeviceEndTimeLoc");
	string otherDeviceStartTimeHHmmLoc = _ruleViolation.GetParam("otherDeviceStartTimeHHmmLoc");
	string otherDeviceEndTimeHHmmLoc = _ruleViolation.GetParam("otherDeviceEndTimeHHmmLoc");

	//培训课程的设备使用时间冲突
	//std::string msg = "The device ({0:resourceCode}) has been occupied during the [{1:otherDeviceStartTimeLoc}-{2:otherDeviceEndTimeLoc}] time period.";
	//msg = StringUtils::Format(msg, resourceCode, TimeUtils::Format((time_t)atoll(otherDeviceStartTimeLoc.c_str())), TimeUtils::Format((time_t)atoll(otherDeviceEndTimeLoc.c_str())));
	std::string msg = "The device ({0:resourceCode}) has been occupied during the [{1:otherDeviceStartTimeHHmmLoc}-{2:otherDeviceEndTimeHHmmLoc}] time period.";
	msg = StringUtils::Format(msg, resourceCode, otherDeviceStartTimeHHmmLoc, otherDeviceEndTimeHHmmLoc);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("resourceCode", resourceCode));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("cofCrewId", roster->idcrew));
	rv->operation_result.insert(pair<string, string>("overlapDeviceStartTimeLoc", overlapDeviceStartTimeLoc));
	rv->operation_result.insert(pair<string, string>("overlapDeviceEndTimeLoc", overlapDeviceEndTimeLoc));
	rv->operation_result.insert(pair<string, string>("otherDeviceStartTimeLoc", otherDeviceStartTimeLoc));
	rv->operation_result.insert(pair<string, string>("otherDeviceEndTimeLoc", otherDeviceEndTimeLoc));
	_ruleViolation.AddRuleViolations(rv);
}


void CheckCourseDeviceAvailForEvaFdRule::ThrowRuleViolationForCourseNumberOfPeopleWithDevice(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string resourceCode = _ruleViolation.GetParam("resourceCode");
	string courseCode = _ruleViolation.GetParam("courseCode");

	string numberOfAssignedTE = _ruleViolation.GetParam("numberOfAssignedTE");//已分配学员的设备数量
	string deviceRoomCapacity = _ruleViolation.GetParam("deviceRoomCapacity");//可用设备数量

	//设备({2:resourceCode}) 已排学员({0:numberOfAssignedTE})超出学员最大容量限制({1:deviceRoomCapacity})
	std::string msg = "The assigned number of TE ({0:numberOfAssignedTE}) exceeds TE Capacity ({1:deviceRoomCapacity}) of the device ({2:resourceCode}).";
	msg = StringUtils::Format(msg, numberOfAssignedTE, deviceRoomCapacity, resourceCode);

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
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = programCourse->startTime;
		rv->endDTUtc = programCourse->endTime;
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("resourceCode", resourceCode));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("cofCrewId", roster->idcrew));
	_ruleViolation.AddRuleViolations(rv);
}
