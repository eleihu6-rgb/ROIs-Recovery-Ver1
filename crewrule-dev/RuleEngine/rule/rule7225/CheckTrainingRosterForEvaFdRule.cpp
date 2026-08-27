/**
 * @file CheckTrainingRosterForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckTrainingRosterForEvaFdRule.h"
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

bool CheckTrainingRosterForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	//检查课程间限制
	const auto rosterProgramCourseMap = TrainingCourseUtils::GetRosterProgramCourseGroupByProgramId(crew, this->GetDataContext());
	for (auto& pair : rosterProgramCourseMap) {
		vector<std::shared_ptr<RosterProgramCourse>> allPrevRosterProgramCourseList;
		auto& rosterProgramCourseList = pair.second;
		for (std::size_t i = 0; i < rosterProgramCourseList.size(); i++) {
			std::shared_ptr<RosterProgramCourse> currRosterProgramCourse = rosterProgramCourseList[i];
			std::shared_ptr<RosterProgramCourse> nextRosterProgramCourse = (i + 1 >= rosterProgramCourseList.size()) ? nullptr : rosterProgramCourseList[i + 1];
			_ruleViolation.SetParam("rosterId", StringUtils::lltos(currRosterProgramCourse->programCourse->rosterId));
			bool valid = CheckRule(currRosterProgramCourse, nextRosterProgramCourse, allPrevRosterProgramCourseList, crew);
			if (!valid) {
				passAllRule = false;
			}
			allPrevRosterProgramCourseList.emplace_back(currRosterProgramCourse);
		}
	}
	return passAllRule;
}

bool CheckTrainingRosterForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	//获得人员有效资质列表
	vector<string> crewQuals = RosterUtils::GetValidQualificationOfCrew(roster, crew);

	if (!CheckCourseStartTimeAndTimePeriod(roster, crew)) {
		valid = false;
	}

	if (!CheckCourseRoleQualification(roster, crew, crewQuals)) {
		valid = false;
	}

	if (!CheckCourseNumberOfPeople(roster)) {
		valid = false;
	}

	if (!CheckCourseDevice(roster, crew, crewQuals)) {
		valid = false;
	}
	
	return valid;
}

bool CheckTrainingRosterForEvaFdRule::CheckRule(const std::shared_ptr<RosterProgramCourse>& currRosterProgramCourse, const std::shared_ptr<RosterProgramCourse>& nextRosterProgramCourse, const vector<std::shared_ptr<RosterProgramCourse>>& allPrevRosterProgramCourseList, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	//课程间隔天数限制
	if (!CheckGapBetweenCourses(currRosterProgramCourse, nextRosterProgramCourse, crew)) {
		valid = false;
	}
	
	//课程间强制关联关系
	if (!CheckDependencyBetweenCourses(currRosterProgramCourse, allPrevRosterProgramCourseList, crew)) {
		valid = false;
	}

	return valid;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseStartTimeAndTimePeriod(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	//roster从学员维度检查
	const auto programCourseList = this->_dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : programCourseList) {
		if (!CheckCourseStartTimeAndTimePeriod(roster, crew, programCourse)) {
			valid = false;
		}
	}

	///roster从非学员维度检查(即：教员IP、检查员CK、伙伴PNR等)
	const auto programCourseInstructorList = this->_dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (programCourseInstructor->groupId.empty()) {
			return true;
		}
		//获得教员IP/检查员CK/伙伴PNR等同组（同一节课）的任意一名学员的计划课程

		const auto programCourse = this->_dbData->tmProgramCourseIndex->getAnyOneByGroupId(programCourseInstructor->groupId);
		if (programCourse != nullptr) {
			if (!CheckCourseStartTimeAndTimePeriod(roster, crew, programCourse)) {
				valid = false;
			}
		}
	}

	return valid;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseStartTimeAndTimePeriod(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& teProgramCourse) const {
	bool passAllRule = true;
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(teProgramCourse->courseId, this->GetDataContext());

	time_t rosterStartTime = roster->getStartTimeLocAct();
	time_t rosterEndTime = roster->getEndTimeLocAct();
	int rosterStartTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterStartTime);
	int rosterEndTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterEndTime);
	int rosterDurationMinute = static_cast<int>(roster->getEndTimeUtcAct() - roster->getStartTimeUtcAct()) / 60;
	int rosterCourseLegNum = -1;
	if (teProgramCourse != nullptr) {
		if (roster->pairing != nullptr) {
			//SIM或Line培训课程
			auto iterFlight = this->_dbData->flightIdMap.find(teProgramCourse->fltId);
			if (iterFlight != this->_dbData->flightIdMap.end()) {
				rosterStartTime = iterFlight->second->getStartTimeLocAct();
				rosterEndTime = iterFlight->second->getEndTimeLocAct();
				rosterStartTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterStartTime);
				rosterEndTimeMinute = TimeUtils::GetMinutesFromMidnight(rosterEndTime);
				rosterDurationMinute = static_cast<int>(iterFlight->second->getEndTimeUtcAct() - iterFlight->second->getStartTimeUtcAct()) / 60;
			}
		}
		if (tmCourse != nullptr && tmCourse->courseType == CourseType::LINE) {
			rosterCourseLegNum = GetRosterCourseLegNum(roster, crew, teProgramCourse);
			_ruleViolation.SetParam("rosterCourseLegNum", StringUtils::itos(rosterCourseLegNum));
		}

		_ruleViolation.SetParam("programCourseId", StringUtils::lltos(teProgramCourse->id));
		_ruleViolation.SetParam("courseId", StringUtils::lltos(teProgramCourse->courseId));
		_ruleViolation.SetParam("rosterStartTime", TimeUtils::Format(rosterStartTime, "yyyy-mm-dd HH:mm"));
		_ruleViolation.SetParam("rosterEndTime", TimeUtils::Format(rosterEndTime, "yyyy-mm-dd HH:mm"));
		_ruleViolation.SetParam("rosterDurationMinute", TimeUtils::MinutesTohhmm(rosterDurationMinute));

		const auto teProgramCoursePnr = this->_dbData->tmProgramCoursePnrIndex->getByProgramCourseId(teProgramCourse->id);
		if (teProgramCoursePnr == nullptr) { 
			//标准化配置，按TmCourse配置检查
			const auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(teProgramCourse->courseId, this->GetDataContext());
			if (tmCourse == nullptr) {
				Logger::getRuleLogger()->error("[CheckCourseStartTimeAndTimePeriod] TmCourse is null.courseId={}", teProgramCourse->courseId);
				return true;
			}
			//检查培训课程Start Time限制
			if (!CheckCourseStartTime(rosterStartTimeMinute, tmCourse)) {
				passAllRule = false;
				_ruleViolation.SetParam("trainingCourseStartTime", tmCourse->startTime);

				ThrowRuleViolationForCourseStartTime(roster);

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}

			//检查培训课程Time Period限制 - 开始时间和结束时间
			if (!CheckCourseTimePeriod(rosterStartTimeMinute, rosterEndTimeMinute, tmCourse)) {
				passAllRule = false;
				_ruleViolation.SetParam("trainingCourseTimePeriod", tmCourse->timePeriod);

				ThrowRuleViolationForCourseTimePeriod(roster);

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}

			auto tmCourseDurationList = _dbData->tmCourseDurationIndex->getByCourseId(tmCourse->id);
			bool valid = true;
			for (auto& tmCourseDuration : tmCourseDurationList) {
				//_ruleViolation.SetParam("courseDuration", TimeUtils::MinutesTohhmm(tmCourseDuration->duration));
				if (!CheckCourseTimePeriodDuration(rosterDurationMinute, rosterCourseLegNum, tmCourseDuration, tmCourse)) {
					valid = false;
					break;
				}
			}
			if (!valid) {
				passAllRule = false;
				ThrowRuleViolationForCourseTimePeriodDuration(roster);

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
		else {
			//存在个性化配置，按TmProgramCoursePnr配置检查
			_ruleViolation.SetParam("programCoursePnrId", StringUtils::lltos(teProgramCoursePnr->id));

			//检查培训课程Start Time限制
			if (!CheckCourseStartTime(rosterStartTimeMinute, teProgramCoursePnr)) {
				passAllRule = false;
				_ruleViolation.SetParam("trainingCourseStartTime", teProgramCoursePnr->startTime);

				ThrowRuleViolationForCourseStartTime(roster);

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}

			//检查培训课程Time Period限制 - 开始时间和结束时间
			if (!CheckCourseTimePeriod(rosterStartTimeMinute, rosterEndTimeMinute, teProgramCoursePnr)) {
				passAllRule = false;
				_ruleViolation.SetParam("trainingCourseTimePeriod", teProgramCoursePnr->timePeriod);

				ThrowRuleViolationForCourseTimePeriod(roster);

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}

			if (!CheckCourseTimePeriodDuration(rosterDurationMinute, rosterCourseLegNum, teProgramCoursePnr, tmCourse)) {
				passAllRule = false;

				_ruleViolation.SetParam("rosterDurationMinute", TimeUtils::MinutesTohhmm(rosterDurationMinute));
				_ruleViolation.SetParam("rosterCourseLegNum", StringUtils::itos(rosterCourseLegNum));
				ThrowRuleViolationForCourseTimePeriodDuration(roster);

				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseIPCKQualification(const vector<string>& crewQuals, const vector<std::shared_ptr<TmProgramCourseIpck>>& tmProgramCourseIpckList) const {
	bool passAllRule = true;
	if (tmProgramCourseIpckList.empty()) {
		return true;
	}
	bool valid = false;
	for (auto& tmProgramCourseIpck : tmProgramCourseIpckList) {
		if (CheckCourseIPCKQualification(crewQuals, tmProgramCourseIpck)) {
			valid = true;
			break;
		}
	}
	if (!valid) {
		passAllRule = false;
	}
	return passAllRule;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals) const {

	bool passAllRule = true;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCourseIpckIndex = this->_dbData->tmProgramCourseIpckIndex;

	//仅针对非学员
	const auto programCourseInstructorList = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (programCourseInstructor->groupId.empty()) {
			continue;
		}

		const auto teProgramCourse = tmProgramCourseIndex->getAnyOneByGroupId(programCourseInstructor->groupId);
		if (teProgramCourse == nullptr) {
			Logger::getRuleLogger()->warn("[CheckCourseRoleQualification] TmProgramCourse does not exist.[groupId={}]", programCourseInstructor->groupId);
			continue;
		}
		_ruleViolation.SetParam("courseId", StringUtils::lltos(teProgramCourse->courseId));
		_ruleViolation.SetParam("programCourseInstructorId", StringUtils::lltos(programCourseInstructor->id));
		_ruleViolation.SetParam("role", programCourseInstructor->role);

		if (programCourseInstructor->role == TrainingRole::PNR) {//检查PNR角色的资质

			const auto teProgramCoursePnr = this->_dbData->tmProgramCoursePnrIndex->getByProgramCourseId(teProgramCourse->id);
			if (teProgramCoursePnr == nullptr) {
				//通过TmCourseRole等配置进行标准化检查PNR资质
				if (!CheckCourseRoleQualification(roster, crew, crewQuals, programCourseInstructor->role, teProgramCourse->courseId)) {
					passAllRule = false;
					ThrowRuleViolationForCourseRoleQualification(roster);
				}
			}
			else {
				//通过TmProgramCoursePnr配置进行个性化检查PNR资质
				if (!CheckCoursePnrQualification(roster, crew, crewQuals, teProgramCoursePnr)) {
					passAllRule = false;
					ThrowRuleViolationForPnrQualification(roster);

					if (!IsCheckAllRule()) {
						return passAllRule;
					}
				}

			}
		}
		else if (programCourseInstructor->role == TrainingRole::IP || programCourseInstructor->role == TrainingRole::CK) {
			auto tmProgramCourseIpckList = tmProgramCourseIpckIndex->getByProgramCourseId(teProgramCourse->id);
			if (tmProgramCourseIpckList.empty()) {
				//通过TmCourseRole等配置进行标准化检查IP/CK资质
				if (!CheckCourseRoleQualification(roster, crew, crewQuals, programCourseInstructor->role, teProgramCourse->courseId)) {
					passAllRule = false;
					ThrowRuleViolationForCourseRoleQualification(roster);
				}
			}
			else {
				//通过TmProgramCourseIpck配置进行个性化检查IP/CK资质
				if (!CheckCourseIPCKQualification(crewQuals, tmProgramCourseIpckList)) {
					passAllRule = false;
					ThrowRuleViolationForCourseIPCKQualification(roster);

					if (!IsCheckAllRule()) {
						return passAllRule;
					}
				}
			}
		}
		else {
			//通过TmCourseRole等配置进行标准化检查其他资质
			if (!CheckCourseRoleQualification(roster, crew, crewQuals, programCourseInstructor->role, teProgramCourse->courseId)) {
				passAllRule = false;
				ThrowRuleViolationForCourseRoleQualification(roster);
			}
		}
	}

	return passAllRule;
}

//检查TE/IP/CK/PNR的 min、max 人数限制
bool CheckTrainingRosterForEvaFdRule::CheckCourseNumberOfPeople(const ROSTER* roster) const {
	bool passAllRule = true;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	//roster从非学员维度检查
	const auto programCourseInstructorList = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (programCourseInstructor->groupId.empty()) {
			//没有安排roster，人员数量检查则忽略
			continue;
		}
		auto tmProgramCourse = tmProgramCourseIndex->getAnyOneByGroupId(programCourseInstructor->groupId);
		if (tmProgramCourse == nullptr) {
			Logger::getRuleLogger()->warn("[CheckCourseNumberOfPeople] TmProgramCourse does not exist.[groupId={}]", programCourseInstructor->groupId);
			continue;
		}

		if (!CheckCourseNumberOfPeople(roster, programCourseInstructor->role, tmProgramCourse)) {
			passAllRule = false;
		}

	}

	//roster从学员维度检查
	const auto programCourseList = tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : programCourseList) {
		if (programCourse->groupId.empty()) {
			//没有安排roster，人员数量检查则忽略
			continue;
		}
		if (!CheckCourseNumberOfPeople(roster, TrainingRole::TE, programCourse)) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseNumberOfPeople(const ROSTER* roster, const string& role,const std::shared_ptr<TmProgramCourse>& teProgramCourse) const {
	bool passAllRule = true;
	auto& tmCourseRoleIndex = this->_dbData->tmCourseRoleIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCoursePnrIndex = this->_dbData->tmProgramCoursePnrIndex;
	auto& tmProgramCourseIpckIndex = this->_dbData->tmProgramCourseIpckIndex;

	_ruleViolation.SetParam("role", role);
	if (role == TrainingRole::PNR) {
		auto tmProgramCourseIds = tmProgramCourseIndex->getIdsByGroupId(teProgramCourse->groupId);
		auto tmProgramCoursePnrList = tmProgramCoursePnrIndex->getByProgramCourseIds(tmProgramCourseIds);
		if (tmProgramCoursePnrList.empty()) {
			//针对标准化配置进行检查PNR人员数量
			if (!CheckCourseNumberOfPeopleWithCourseRole(roster, role, teProgramCourse->groupId, teProgramCourse->courseId)) {
				passAllRule = false;
				ThrowRuleViolationForNumberOfPeople(roster);
			}
		}
		else {
			//针对个性化配置进行检查PNR、PIP人员数量
			int pnrTotalNumber = 0;//配置规则中当前课程的PNR人数
			int pipTotalNumber = 0;//配置规则中当前课程的PIP人数
			for (auto& tmProgramCoursePnr : tmProgramCoursePnrList) {
				pnrTotalNumber += tmProgramCoursePnr->pnrNumber; //PNR配置每个学员需要的PNR数量，因此需要累计成课程需要PNR总数
				pipTotalNumber = tmProgramCoursePnr->pipNumber;//PIP针对培训教员需要的LIP资质，因此不需要累计
			}

			//检查 PNR 资质的人员数量
			auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(teProgramCourse->groupId, TrainingRole::PNR);
			int numberOfPNR = (int)tmProgramCourseInstructorList.size();//实际PNR人数
			if (numberOfPNR < pnrTotalNumber) {
				passAllRule = false;
				_ruleViolation.SetParam("role", TrainingRole::PNR);
				ThrowRuleViolationForNumberOfPeople(roster);
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}

			//检查PIP(拥有IP教员角色和LIP资质的人员) 人员数量
			int numberOfPIP = 0;//实际PIP人数
			vector<string> quals{ "LIP" };
			tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(teProgramCourse->groupId, TrainingRole::IP);
			for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
				auto iterCrew = this->_dbData->crewIdMap.find(tmProgramCourseInstructor->crewId);
				if (iterCrew == this->_dbData->crewIdMap.end()) {
					continue;
				}
				auto crewQuals = RosterUtils::GetValidQualificationOfCrew(roster, iterCrew->second);

				if (quals.empty() || StringUtils::Intersect(quals, crewQuals)) {
					numberOfPIP++;
				}
			}

			if (numberOfPIP < pipTotalNumber) {
				passAllRule = false;
				_ruleViolation.SetParam("role", "IP(LIP)");
				ThrowRuleViolationForNumberOfPeople(roster);
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}

		}

	}
	else if (role == TrainingRole::IP || role == TrainingRole::CK) {
		auto tmProgramCourseIds = tmProgramCourseIndex->getIdsByGroupId(teProgramCourse->groupId);
		auto tmProgramCourseIpckList = tmProgramCourseIpckIndex->getByProgramCourseIds(tmProgramCourseIds);
		if (tmProgramCourseIpckList.empty()) {
			//针对标准化配置进行检查IP/CK人员数量
			if (!CheckCourseNumberOfPeopleWithCourseRole(roster, role, teProgramCourse->groupId, teProgramCourse->courseId)) {
				passAllRule = false;
				ThrowRuleViolationForNumberOfPeople(roster);
			}
		}
		else {
			//针对个性化配置进行检查IP/CK人员数量
			int ipckTotalNumber = tmProgramCourseIpckList[0]->ipckNumber;

			auto tmProgramCourseIpList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(teProgramCourse->groupId, TrainingRole::IP);
			auto tmProgramCourseCkList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(teProgramCourse->groupId, TrainingRole::CK);
			int numberOfIPCK = (int)(tmProgramCourseIpList.size() + tmProgramCourseCkList.size());//实际IP/CK人数

			if (numberOfIPCK < ipckTotalNumber) {
				passAllRule = false;
				_ruleViolation.SetParam("role", TrainingRole::IP + "/" + TrainingRole::CK);
				ThrowRuleViolationForNumberOfPeople(roster);
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
	}
	else {
		//针对标准化配置进行检查角色人员数量
		if (!CheckCourseNumberOfPeopleWithCourseRole(roster, role, teProgramCourse->groupId, teProgramCourse->courseId)) {
			passAllRule = false;
			ThrowRuleViolationForNumberOfPeople(roster);
		}
	}
	return passAllRule;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseNumberOfPeopleWithCourseRole(const ROSTER* roster, const string& role, const string& groupId, const long long& courseId) const {
	bool passAllRule = true;
	auto& tmCourseRoleIndex = this->_dbData->tmCourseRoleIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCoursePnrIndex = this->_dbData->tmProgramCoursePnrIndex;

	auto tmCourseRoleList = tmCourseRoleIndex->getByCourseId(courseId);
	for (auto& tmCourseRole : tmCourseRoleList) {
		if (tmCourseRole->role != role) {
			continue;
		}

		if (role == TrainingRole::TE) {//教员TE角色
			auto tmProgramCourseList = tmProgramCourseIndex->getByGroupId(groupId);
			int numberOfTE = (int)tmProgramCourseList.size();//上课的角色人员数量
			if (numberOfTE < tmCourseRole->minCapacity || numberOfTE > tmCourseRole->maxCapacity) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
		else {
			//其他角色，包括：IP、CK、PNR（除TE）
			auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(groupId, tmCourseRole->role);
			int numberOfRole = (int)tmProgramCourseInstructorList.size();//上课的角色人员数量
			if (numberOfRole < tmCourseRole->minCapacity || numberOfRole > tmCourseRole->maxCapacity) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseDevice(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals) const {
	bool passAllRule = true;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	//roster从非学员维度检查
	const auto programCourseInstructorList = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for(auto& programCourseInstructor : programCourseInstructorList) {
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

		if (!CheckCourseDeviceType(programCourseDevice, tmProgramCourse)) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceType(roster);
		}

		int warnCode = CheckCourseDeviceTime(tmProgramCourse, programCourseDevice, programCourseDeviceTime);
		if ((warnCode & (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::NOT_AVAILABLE) == (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::NOT_AVAILABLE) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceTime(roster);
		}
		if ((warnCode & (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::TIME_OVERLAP) == (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::TIME_OVERLAP) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceTime(roster);
		}
		if ((warnCode & (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::NUM_OF_PEOPLE) == (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::NUM_OF_PEOPLE) {
			passAllRule = false;
			ThrowRuleViolationForCourseNumberOfPeopleWithDevice(roster);
		}
	}

	//roster从学员维度检查
	const auto programCourseList = tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for(auto& programCourse : programCourseList) {
		
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

		if (!CheckCourseDeviceType(programCourseDevice, programCourse)) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceType(roster);
		}

		int warnCode = CheckCourseDeviceTime(programCourse, programCourseDevice, programCourseDeviceTime);
		if ((warnCode & (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::NOT_AVAILABLE) == (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::NOT_AVAILABLE) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceTime(roster);
		}
		if ((warnCode & (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::TIME_OVERLAP) == (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::TIME_OVERLAP) {
			passAllRule = false;
			ThrowRuleViolationForCourseDeviceTime(roster);
		}
		if ((warnCode & (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::NUM_OF_PEOPLE) == (int)CheckTrainingRosterForEvaFdRule::DeviceWarnCode::NUM_OF_PEOPLE) {
			passAllRule = false;
			ThrowRuleViolationForCourseNumberOfPeopleWithDevice(roster);
		}
	}
	return passAllRule;
}

//个性化检查计划训练课程伙伴PNR(Partner)的base/rank/fleet/team/qual 限制
bool CheckTrainingRosterForEvaFdRule::CheckCoursePnrQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr) const {
	std::vector<string> positions;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, tmProgramCoursePnr->pnrBases, tmProgramCoursePnr->pnrRanks, tmProgramCoursePnr->pnrFleets, tmProgramCoursePnr->pnrTeams, positions, roster->getStartTimeUtcAct(), roster->getRestStartUtcAct())) {
		return false;
	}

	if (tmProgramCoursePnr->pnrQuals.empty()) {
		return true;
	}

	bool valid = false;
	if (tmProgramCoursePnr->pnrQualOption == "OR") {
		valid = false;
		for (auto& qual : tmProgramCoursePnr->pnrQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), qual) != crewQuals.cend()) {
				valid = true;
				break;
			}
		}
	}
	else if (tmProgramCoursePnr->pnrQualOption == "AND") {
		valid = true;
		for (auto& qual : tmProgramCoursePnr->pnrQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), qual) == crewQuals.cend()) {
				valid = false;
				break;
			}
		}
	}
	return valid;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseIPCKQualification(const vector<string>& crewQuals, const std::shared_ptr<TmProgramCourseIpck>& tmProgramCourseIpck) const {
	if (tmProgramCourseIpck->ipckQuals.empty()) {
		return true;
	}
	bool valid = false;
	if (tmProgramCourseIpck->ipckQualOption == "OR") {
		valid = false;
		for (auto& qual : tmProgramCourseIpck->ipckQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), qual) != crewQuals.cend()) {
				valid = true;
				break;
			}
		}
	}
	else if (tmProgramCourseIpck->ipckQualOption == "AND") {
		valid = true;
		for (auto& qual : tmProgramCourseIpck->ipckQuals) {
			if (std::find(crewQuals.cbegin(), crewQuals.cend(), qual) == crewQuals.cend()) {
				valid = false;
				break;
			}
		}
	}
	return valid;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const string& crewRole,  const long long courseId) const {
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
		for (auto& tmCourseRoleBase : tmCourseRoleBaseList) {
			if (CheckCourseRoleQualification(roster, crew, crewQuals, tmCourseRoleBase)) {
				//配置base、rank、fleet、team后，再检查资质qual
				auto tmCourseRoleQualList = tmCourseRoleQualIndex->getByCourseRoleBaseId(tmCourseRoleBase->id);
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
		if (!valid) {
			passAllRule = false;
			break;
		}
	}
	return passAllRule;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const std::shared_ptr<TmCourseRoleBase>& tmCourseRoleBase) const {
	std::vector<string> positions;
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, tmCourseRoleBase->bases, tmCourseRoleBase->ranks, tmCourseRoleBase->fleets, tmCourseRoleBase->teams, positions, roster->getStartTimeUtcAct(), roster->getRestStartUtcAct())) {
		return false;
	}
	return true;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseRoleQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& crewQuals, const string& crewRole, const std::shared_ptr<TmCourseRoleQual>& tmCourseRoleQual) const {
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

bool CheckTrainingRosterForEvaFdRule::CheckCourseStartTime(const int rosterStartTimeMinute, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const {
	bool passAllRule = true;
	if (programCoursePnr->startTimeOption == "MUST") {
		bool valid = false;
		for (auto& startTimeMinute : programCoursePnr->startTimeMinutes) {
			if (rosterStartTimeMinute == startTimeMinute) {
				//配置多个开始时间，任意一个满足，则认为合法
				valid = true;
				break;
			}
		}

		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseStartTime(const int rosterStartTimeMinute, const std::shared_ptr<TmCourse>& tmCourse) const {
	bool passAllRule = true;
	if (tmCourse->startTimeOption == "MUST") {
		bool valid = false;
		for (auto& startTimeMinute : tmCourse->startTimeMinutes) {
			if (rosterStartTimeMinute == startTimeMinute) {
				//配置多个开始时间，任意一个满足，则认为合法
				valid = true;
				break;
			}
		}

		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

//检查训练课程TimePeriod合规 - 开始时间和结束时间
bool CheckTrainingRosterForEvaFdRule::CheckCourseTimePeriod(const int rosterStartTimeMinute, const int rosterEndTimeMinute, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const {
	bool passAllRule = true;
	if (programCoursePnr->timePeriodOption == "MUST") {
		bool valid = false;
		for (std::size_t i = 0; i < programCoursePnr->timePeriodEndMinutes.size(); i++) {
			int timePeriodStartMinute = programCoursePnr->timePeriodStartMinutes[i];
			int timePeriodEndMinute = programCoursePnr->timePeriodEndMinutes[i];

			if ((rosterStartTimeMinute >= timePeriodStartMinute && rosterStartTimeMinute <= timePeriodEndMinute) &&
				(rosterEndTimeMinute >= timePeriodStartMinute && rosterEndTimeMinute <= timePeriodEndMinute)) {
				//配置多个开始时间，任意一个满足，则认为合法
				valid = true;
				break;
			}
		}

		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseTimePeriod(const int rosterStartTimeMinute, const int rosterEndTimeMinute, const std::shared_ptr<TmCourse>& tmCourse) const {
	bool passAllRule = true;
	if (tmCourse->timePeriodOption == "MUST") {
		bool valid = false;
		for (std::size_t i = 0; i < tmCourse->timePeriodEndMinutes.size(); i++) {
			int timePeriodStartMinute = tmCourse->timePeriodStartMinutes[i];
			int timePeriodEndMinute = tmCourse->timePeriodEndMinutes[i];

			if ((rosterStartTimeMinute >= timePeriodStartMinute && rosterStartTimeMinute <= timePeriodEndMinute) &&
				(rosterEndTimeMinute >= timePeriodStartMinute && rosterEndTimeMinute <= timePeriodEndMinute)) {
				//配置多个开始时间，任意一个满足，则认为合法
				valid = true;
				break;
			}
		}

		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

//检查训练课程时间段限制 - 持续时长
bool CheckTrainingRosterForEvaFdRule::CheckCourseTimePeriodDuration(const int rosterDurationMinute, const int rosterCourseLegNum, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr, const std::shared_ptr<TmCourse>& tmCourse) const {
	bool valid = true;
	int programCourseDuration = GetProgramCourseDuration(programCoursePnr);
	if (programCourseDuration <= 0) {
		return true;
	}
	if (programCoursePnr->unit != "LEG") {
		_ruleViolation.SetParam("programCourseDurationHHmm", TimeUtils::MinutesTohhmm(programCourseDuration));

		if (tmCourse->courseType == CourseType::GROUND) {
			if (rosterDurationMinute != programCourseDuration) {
				valid = false;
			}
		}
		else if (tmCourse->courseType == CourseType::SIM) {
			if (rosterDurationMinute < programCourseDuration) {
				valid = false;
			}
		}
	}
	else {
		if (rosterCourseLegNum < programCourseDuration) {
			_ruleViolation.SetParam("programCourseLegNum", StringUtils::itos(programCourseDuration));
			valid = false;
		}
	}

	return valid;
}

bool CheckTrainingRosterForEvaFdRule::CheckCourseTimePeriodDuration(const int rosterDurationMinute, const int rosterCourseLegNum, const std::shared_ptr<TmCourseDuration>& tmCourseDuration, const std::shared_ptr<TmCourse>& tmCourse) const {
	bool valid = true;
	if (rosterCourseLegNum < 0) {
		//培训课程类型(CourseType)为GROUND、SIM
		if (tmCourse->courseType == CourseType::GROUND) {
			if (tmCourseDuration->duration >= 0 && rosterDurationMinute != tmCourseDuration->duration) {
				_ruleViolation.SetParam("programCourseDurationHHmm", TimeUtils::MinutesTohhmm(tmCourseDuration->duration));
				valid = false;
			}
		}
		else if (tmCourse->courseType == CourseType::SIM) {
			if (tmCourseDuration->duration >= 0 && rosterDurationMinute < tmCourseDuration->duration) {
				_ruleViolation.SetParam("programCourseDurationHHmm", TimeUtils::MinutesTohhmm(tmCourseDuration->duration));
				valid = false;
			}
		}
	}
	else {
		//培训课程类型(CourseType)为Line
		if (tmCourseDuration->num >= 0 && rosterCourseLegNum < tmCourseDuration->num) {
			_ruleViolation.SetParam("programCourseLegNum", StringUtils::itos(tmCourseDuration->num));
			valid = false;
		}
	}
	return valid;
}

//检查训练课程设备类型（Device）限制
bool CheckTrainingRosterForEvaFdRule::CheckCourseDeviceType(const std::shared_ptr<TmDevice>& programCourseDevice, const std::shared_ptr<TmProgramCourse>& programCourse) const {
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
	auto& tmCourseRoleDeviceIndex = this->_dbData->tmCourseRoleDeviceIndex;
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
	if (course->deviceType != programCourseDeviceType) {
		//设备类型（大类）不一致
		return false;
	}

	if (course->deviceGroups.empty()) {
		//EVA特有
		auto tmCourseRoleList = tmCourseRoleIndex->getByCourseId(courseId);
		for (auto& tmCourseRole : tmCourseRoleList) {
			auto tmCourseRoleDeviceList = tmCourseRoleDeviceIndex->getByCourseRoleId(tmCourseRole->id);
			if (tmCourseRoleDeviceList.empty()) {
				continue;
			}
			bool valid = false;
			for (auto& tmCourseRoleDevice : tmCourseRoleDeviceList) {
				//多条CourseRoleDevice其中一条满足即可

				if (tmCourseRoleDevice->option == "MUST") { //检查具体设备的资源代码
					if (std::find(tmCourseRoleDevice->deviceCodes.begin(), tmCourseRoleDevice->deviceCodes.end(), programCourseDeviceResourceCode) != tmCourseRoleDevice->deviceCodes.end()) {
						//设备资源代码一致
						valid = true;
						break;
					}
				}
				else if (tmCourseRoleDevice->deviceTypes.empty() || StringUtils::Intersect(tmCourseRoleDevice->deviceTypes, programCourseDeviceResourceTypes)) { //检查具体设备的资源类型
					//资源类型（小类）一致
					valid = true;
					break;
				}
			}
			if (!valid) {
				return false;
			}
		}
	}
	else {
		//公版
		if (!StringUtils::Intersect(course->deviceGroups, programCourseDeviceResourceTypes)) {
			//资源类型（小类）不一致
			return false;
		}
	}
	return true;
}

int CheckTrainingRosterForEvaFdRule::CheckCourseDeviceTime(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmDevice>& programCourseDevice, const std::shared_ptr<TmDeviceTime>& programCourseDeviceTime) const {
	int warnCode = (int)DeviceWarnCode::NO;
	//该设备是否有可用资源：未排过-可以直接排；排过课-看是否是同一 course code
	if ( programCourseDevice != nullptr && programCourseDevice->publishStatus == 0 ) {
		//设备不可用
		warnCode = warnCode | (int)DeviceWarnCode::NOT_AVAILABLE;
		return warnCode;
	}

	if (programCourseDeviceTime == nullptr) {
		return warnCode;
	}

	if (programCourseDeviceTime->status == "N" || programCourseDeviceTime->status == "U_O") {
		//设备时间不可用
		warnCode = warnCode | (int)DeviceWarnCode::NOT_AVAILABLE;
		return warnCode;
	}

	auto& tmDeviceTimeIndex = this->_dbData->tmDeviceTimeIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	time_t programCourseDeviceStartTime = TimeUtils::GetFullTime(programCourseDeviceTime->startDate, programCourseDeviceTime->startTime);
	time_t programCourseDeviceEndTime = TimeUtils::GetFullTime(programCourseDeviceTime->endDate, programCourseDeviceTime->endTime);
	auto& allDeviceTimeList = tmDeviceTimeIndex->getByResourceCode(programCourseDevice->resourceCode);
	int numberOfDeviceTime = 0; //与programCourseDeviceTime时间存在重叠，使用该设备的人数
	for (auto& deviceTime : allDeviceTimeList) {
		if (deviceTime->id == programCourseDeviceTime->id) {
			numberOfDeviceTime++;
			continue;
		}
		time_t startTime = TimeUtils::GetFullTime(deviceTime->startDate, deviceTime->startTime);
		time_t endTime = TimeUtils::GetFullTime(deviceTime->endDate, deviceTime->endTime);
		if (TimeUtils::IsAbsoluteTimesCovered(programCourseDeviceStartTime, programCourseDeviceEndTime, startTime, endTime)) {
			numberOfDeviceTime++;
			auto programCourseListOfdevice = tmProgramCourseIndex->getByDeviceTimeId(deviceTime->id);
			if (!programCourseListOfdevice.empty() && programCourseListOfdevice[0]->groupId == programCourse->groupId)
			{
				//同一上课课程使用该设备，时间冲突则忽略
				continue;
			}
			warnCode = warnCode | (int)DeviceWarnCode::TIME_OVERLAP;
		}
	}

	if (numberOfDeviceTime > programCourseDevice->roomCapacity) {
		warnCode = warnCode | (int)DeviceWarnCode::NUM_OF_PEOPLE;
	}
	return warnCode;
}

//课程间隔天数限制
bool CheckTrainingRosterForEvaFdRule::CheckGapBetweenCourses(const std::shared_ptr<RosterProgramCourse>& currRosterProgramCourse, const std::shared_ptr<RosterProgramCourse>& nextRosterProgramCourse, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	if (nextRosterProgramCourse == nullptr) {
		return true;
	}

	int gap = TimeUtils::DiffDay(currRosterProgramCourse->programCourse->endTime, nextRosterProgramCourse->programCourse->startTime);
	auto tmProgramCourseMoreList = _dbData->tmProgramCourseMoreIndex->getByProgramCourseId(currRosterProgramCourse->programCourse->id);
	for (auto& tmProgramCourseMore : tmProgramCourseMoreList) {
		if (gap < tmProgramCourseMore->minGap || gap > tmProgramCourseMore->maxGap) {
			valid = false;

			auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(currRosterProgramCourse->programCourse->courseId, this->GetDataContext());
			if (tmCourse != nullptr) {
				_ruleViolation.SetParam("currCourseCode", tmCourse->courseCode);
			}
			tmCourse = TrainingCourseUtils::GetCourseByCourseId(nextRosterProgramCourse->programCourse->courseId, this->GetDataContext());
			if (tmCourse != nullptr) {
				_ruleViolation.SetParam("nextCourseCode", tmCourse->courseCode);
			}
			auto tmProgram = _dbData->tmProgramIndex->getById(currRosterProgramCourse->programCourse->programId);
			if (tmProgram != nullptr) {
				_ruleViolation.SetParam("programName", tmProgram->name);
			}

			_ruleViolation.SetParam("currProgramCourseId", StringUtils::lltos(currRosterProgramCourse->programCourse->id));
			_ruleViolation.SetParam("nextProgramCourseId", StringUtils::lltos(nextRosterProgramCourse->programCourse->id));
			_ruleViolation.SetParam("gap", StringUtils::itos(gap));
			_ruleViolation.SetParam("minGap", StringUtils::itos(tmProgramCourseMore->minGap, true));
			_ruleViolation.SetParam("maxGap", StringUtils::itos(tmProgramCourseMore->maxGap, true));
			ThrowRuleViolationForGapBetweenCourses(currRosterProgramCourse->programCourse);

			if (!IsCheckAllRule()) {
				return valid;
			}
		}
	}

	return valid;
}

//课程间强制关联关系
bool CheckTrainingRosterForEvaFdRule::CheckDependencyBetweenCourses(const std::shared_ptr<RosterProgramCourse>& currRosterProgramCourse, const vector<std::shared_ptr<RosterProgramCourse>>& allPrevRosterProgramCourseList, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	auto& dependencySeqs = currRosterProgramCourse->programCourse->coursePrepositions;//获得依赖的前序计划课程序号列表
	for (auto& dependencySeq : dependencySeqs) {
		bool exist = false;
		for (auto& prevRosterProgramCourse : allPrevRosterProgramCourseList) {
			if (dependencySeq == prevRosterProgramCourse->programCourse->courseSeq) {
				exist = true;
				break;
			}
		}
		if (!exist) {
			valid = false;
			_ruleViolation.SetParam("programCourseId", StringUtils::lltos(currRosterProgramCourse->programCourse->id));
			_ruleViolation.SetParam("programId", StringUtils::lltos(currRosterProgramCourse->programCourse->programId));
			auto tmProgram = _dbData->tmProgramIndex->getById(currRosterProgramCourse->programCourse->programId);
			if (tmProgram != nullptr) {
				_ruleViolation.SetParam("programName", tmProgram->name);
			}

			_ruleViolation.SetParam("courseId", StringUtils::lltos(currRosterProgramCourse->programCourse->courseId));
			auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(currRosterProgramCourse->programCourse->courseId, this->GetDataContext());
			if (tmCourse != nullptr) {
				_ruleViolation.SetParam("courseCode", tmCourse->courseCode);
			}
			ThrowRuleViolationForDependencyBetweenCourses(currRosterProgramCourse->programCourse);

			if (!IsCheckAllRule()) {
				return valid;
			}
		}
	}
	return valid;
}

int CheckTrainingRosterForEvaFdRule::GetProgramCourseDuration(const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const {
	int duration = 0;
	if (programCoursePnr->unit == "H") {
		//小时
		duration = static_cast<int>(programCoursePnr->duration * 60);
	}
	else if (programCoursePnr->unit == "M") {
		//分钟
		duration = static_cast<int>(programCoursePnr->duration);
	}
	else if (programCoursePnr->unit == "LEG") {
		//航段数量
		duration = static_cast<int>(programCoursePnr->duration);
	}
	return duration;
}

int CheckTrainingRosterForEvaFdRule::GetRosterCourseLegNum(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& teProgramCourse) const {
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;

	int rosterLegNum = 0;
	long long parentId = teProgramCourse->parentId;//默认时，假设当前是子课程
	if (parentId == 0) {
		//当前为父课程
		parentId = teProgramCourse->id;
	}
	auto children = tmProgramCourseIndex->getChildrenByParentId(parentId);
	rosterLegNum = (int)children.size();
	return rosterLegNum;
}

void CheckTrainingRosterForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckTrainingRosterForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckTrainingRosterForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForCourseStartTime(const ROSTER* roster) const {
	string trainingCourseStartTime = _ruleViolation.GetParam("trainingCourseStartTime");
	string rosterStartTime = _ruleViolation.GetParam("rosterStartTime");
	string courseId = _ruleViolation.GetParam("courseId");
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string programCoursePnrId = _ruleViolation.GetParam("programCoursePnrId");


	//培训课程开始时间与排班开始时间不同
	std::string msg = "The start time of the training course ({0:trainingCourseStartTime}) differs from the start time of the roster ({1:rosterStartTime}).";
	msg = StringUtils::Format(msg, trainingCourseStartTime, rosterStartTime);

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = roster->pairing->getStartTimeUtcAct();
		rv->endDTUtc = roster->pairing->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("trainingCourseStartTime", trainingCourseStartTime));
	rv->operation_result.insert(pair<string, string>("rosterStartTime", rosterStartTime));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("programCoursePnrId", programCoursePnrId));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForCourseTimePeriod(const ROSTER* roster) const{
	string trainingCourseTimePeriod = _ruleViolation.GetParam("trainingCourseTimePeriod");
	string rosterStartTime = _ruleViolation.GetParam("rosterStartTime");
	string rosterEndTime = _ruleViolation.GetParam("rosterEndTime");
	string courseId = _ruleViolation.GetParam("courseId");
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string programCoursePnrId = _ruleViolation.GetParam("programCoursePnrId");

	//排班时间段不能超出培训课程时间段
	std::string msg = "The roster period ({0:rosterStartTime}-{1:rosterEndTime}) cannot exceed the training course period ({2:trainingCourseTimePeriod}).";
	msg = StringUtils::Format(msg, rosterStartTime, rosterEndTime, trainingCourseTimePeriod);

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = roster->pairing->getStartTimeUtcAct();
		rv->endDTUtc = roster->pairing->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("trainingCourseTimePeriod", trainingCourseTimePeriod));
	rv->operation_result.insert(pair<string, string>("rosterStartTime", rosterStartTime));
	rv->operation_result.insert(pair<string, string>("rosterEndTime", rosterEndTime));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("programCoursePnrId", programCoursePnrId));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForCourseTimePeriodDuration(const ROSTER* roster) const {
	string programCourseDurationHHmm = _ruleViolation.GetParam("programCourseDurationHHmm");
	string rosterDurationMinute = _ruleViolation.GetParam("rosterDurationMinute");

	string programCourseLegNum = _ruleViolation.GetParam("programCourseLegNum");
	string rosterCourseLegNum = _ruleViolation.GetParam("rosterCourseLegNum");

	string courseId = _ruleViolation.GetParam("courseId");
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string programCoursePnrId = _ruleViolation.GetParam("programCoursePnrId");

	//排班持续时间不能超出培训课程持续时间
	std::string msg = "The roster duration ({0:rosterDurationMinute}) should be not less than training course duration ({1:programCourseDurationHHmm}).";
	msg = StringUtils::Format(msg, rosterDurationMinute, programCourseDurationHHmm);
	
	if (!programCourseLegNum.empty() && !rosterCourseLegNum.empty()) {
		//排班训练航段数量不能超出培训课程航段数量
		msg = "The number of roster segments ({0:rosterCourseLegNum}) cannot exceed the number of training course segments ({0:programCourseLegNum}).";
		msg = StringUtils::Format(msg, rosterCourseLegNum, programCourseLegNum);
	}

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = roster->pairing->getStartTimeUtcAct();
		rv->endDTUtc = roster->pairing->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programCourseDurationHHmm", programCourseDurationHHmm));
	rv->operation_result.insert(pair<string, string>("rosterDurationMinute", rosterDurationMinute));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("programCoursePnrId", programCoursePnrId));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForCourseIPCKQualification(const ROSTER* roster) const {
	string crewId = _ruleViolation.GetParam("crewId");
	string courseId = _ruleViolation.GetParam("courseId");
	string programCourseInstructorId = _ruleViolation.GetParam("programCourseInstructorId");

	//机组人员需要培训课程IP/CK资质
	std::string msg = "The crew({0:crewId}) has NO qualification for the training courses role(IP/CK).";
	msg = StringUtils::Format(msg, crewId);

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
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

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForPnrQualification(const ROSTER* roster) const {
	string crewId = _ruleViolation.GetParam("crewId");
	string courseId = _ruleViolation.GetParam("courseId");
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string programCoursePnrId = _ruleViolation.GetParam("programCoursePnrId");

	//机组人员需要培训课程IP/CK资质
	std::string msg = "The crew({0:crewId}) has NO qualification for the training courses role(PNR).";
	msg = StringUtils::Format(msg, crewId);

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
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

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForCourseRoleQualification(const ROSTER* roster) const {
	string crewId = _ruleViolation.GetParam("crewId");
	string courseId = _ruleViolation.GetParam("courseId");
	string programCourseInstructorId = _ruleViolation.GetParam("programCourseInstructorId");
	string role = _ruleViolation.GetParam("role");

	//机组人员需要培训课程IP/CK资质
	std::string msg = "The crew({0:crewId}) has NO qualification for the training courses role({1:role}).";
	msg = StringUtils::Format(msg, crewId, role);

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
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

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForCourseDeviceType(const ROSTER* roster) const {
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string resourceCode = _ruleViolation.GetParam("resourceCode");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//培训课程不能使用该设备
	std::string msg = "The device ({0:resourceCode}) cannot be used in training courses ({1:courseCode}).";
	msg = StringUtils::Format(msg, resourceCode, courseCode);

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
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
	_ruleViolation.AddRuleViolations(rv);
}

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForCourseDeviceTime(const ROSTER* roster) const {
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string resourceCode = _ruleViolation.GetParam("resourceCode");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//培训课程的设备使用时间冲突或者状态不可用
	std::string msg = "The device ({0:resourceCode}) of training course ({1:courseCode}) is unavailable.";
	msg = StringUtils::Format(msg, resourceCode, courseCode);

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
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
	_ruleViolation.AddRuleViolations(rv);
}


void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForCourseNumberOfPeopleWithDevice(const ROSTER* roster) const {
	string resourceCode = _ruleViolation.GetParam("resourceCode");

	//同时使用设备人数超过限制
	std::string msg = "The number of people using the device ({0:resourceCode}) exceeds the limit.";
	msg = StringUtils::Format(msg, resourceCode);

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = roster->pairing->getStartTimeUtcAct();
		rv->endDTUtc = roster->pairing->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("resourceCode", resourceCode));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForNumberOfPeople(const ROSTER* roster) const {
	string role = _ruleViolation.GetParam("role");

	//XX角色人数与课程要求不一致
	std::string msg = "The number of role ({0:role}) is not consistent with the course requirements.";
	msg = StringUtils::Format(msg, role);

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
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = roster->pairing->getStartTimeUtcAct();
		rv->endDTUtc = roster->pairing->getEndTimeUtcAct();
	}
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("role", role));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForGapBetweenCourses(const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string gap = _ruleViolation.GetParam("gap");
	string minGap = _ruleViolation.GetParam("minGap");
	string maxGap = _ruleViolation.GetParam("maxGap");

	string programName = _ruleViolation.GetParam("programName");
	string currProgramCourseId = _ruleViolation.GetParam("currProgramCourseId");
	string nextProgramCourseId = _ruleViolation.GetParam("nextProgramCourseId");
	string currCourseCode = _ruleViolation.GetParam("currCourseCode");
	string nextCourseCode = _ruleViolation.GetParam("nextCourseCode");

	//XXX训练计划的训练课程间隔天数不在允许XXX范围内
	std::string msg = "The number of days ({0:gap}) between training course ({1:currCourseCode} to {2:nextCourseCode}) in the program ({3:programName})  is not within the allowed range of '{4:minGap}' to '{5:maxGap}'.";
	msg = StringUtils::Format(msg, gap, currCourseCode, nextCourseCode, programName, minGap, maxGap);

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


	rv->pairingId = -1;
	rv->segmentId = programCourse->fltId;
	rv->startDTUtc = programCourse->startTime;
	rv->endDTUtc = programCourse->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("gap", gap));
	rv->operation_result.insert(pair<string, string>("minGap", minGap));
	rv->operation_result.insert(pair<string, string>("maxGap", maxGap));
	rv->operation_result.insert(pair<string, string>("programName", programName));
	rv->operation_result.insert(pair<string, string>("currProgramCourseId", currProgramCourseId));
	rv->operation_result.insert(pair<string, string>("nextProgramCourseId", nextProgramCourseId));
	rv->operation_result.insert(pair<string, string>("currCourseCode", currCourseCode));
	rv->operation_result.insert(pair<string, string>("nextCourseCode", nextCourseCode));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckTrainingRosterForEvaFdRule::ThrowRuleViolationForDependencyBetweenCourses(const std::shared_ptr<TmProgramCourse>& programCourse) const {
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string programId = _ruleViolation.GetParam("programId");
	string programName = _ruleViolation.GetParam("programName");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//XXX训练计划的XXX训练课程开始前，必须完成前序课程
	std::string msg = "A pre-course must be completed before the training course ({0:courseCode}) of the program ({1:programName}) begins.";
	msg = StringUtils::Format(msg, courseCode, programName);

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

	rv->pairingId = -1;
	rv->segmentId = programCourse->fltId;
	rv->startDTUtc = programCourse->startTime;
	rv->endDTUtc = programCourse->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("programId", programId));
	rv->operation_result.insert(pair<string, string>("programName", programName));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	_ruleViolation.AddRuleViolations(rv);
}