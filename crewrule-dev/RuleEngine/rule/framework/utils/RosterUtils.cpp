#include "RosterUtils.h"

#include <algorithm>
#include "UtilFunc.h"
#include "TimeUtils.h"
#include "TimezoneUtils.h"
#include "DutyUtils.h"
#include "StringUtils.h"
#include "RuleParams.h"
#include <bitset>
#include <set>
#include "Utility.h"
#include "../constant/Constants.h"
#include "CompetenceValidationUtils.h"
#include "index/TmProgramIndex.h"

inline static Segment* GetPairingSegment(const Pairing* pairing, const long long flightId) {
	if (pairing == nullptr) return nullptr;

	for (auto& duty : pairing->getDutyVec()) {
		for (auto& segment : duty->getSegmentsRead()) {
			if (segment->getDBId() == flightId) {
				return segment;
			}
		}
	}
	return nullptr;
}

bool RosterUtils::IsConsecutiveLocalDay(const ROSTER* prevRoster, const ROSTER* currRoster) {
	if (prevRoster == nullptr) {
		return true;
	}
	time_t prevRosterDay = TimeUtils::Floor(prevRoster->getEndTimeLocAct(), ChronoUnit::DAYS);
	time_t currRosterDay = TimeUtils::Floor(currRoster->getStartTimeLocAct(), ChronoUnit::DAYS);
	return (currRosterDay- prevRosterDay) <= 24*60*60; //24*60*60 一天秒数
}

bool RosterUtils::IsConsecutiveLocalDayByRestStart(const ROSTER* prevRoster, const ROSTER* currRoster) {
	if (prevRoster == nullptr) {
		return true;
	}
	time_t prevRosterDay = TimeUtils::Floor(prevRoster->getRestStartLocAct(), ChronoUnit::DAYS);
	time_t currRosterDay = TimeUtils::Floor(currRoster->getStartTimeLocAct(), ChronoUnit::DAYS);
	return (currRosterDay - prevRosterDay) <= 24 * 60 * 60; //24*60*60 一天秒数
}

int RosterUtils::GetRosterDaysByAssignmentInRange(const std::vector<const ROSTER*>& rosters, vector<string> dutyAssignments, time_t start, time_t end, int CrewBaseOffsetMinutes) {
	std::set<int> dutyDays;
	
	for (const auto & roster : rosters) {
		if (roster->getStartTimeLocAct() >= end || roster->getEndTimeLocAct() <= start)
			continue;
		// 存在pairing
		if (roster->pairing != nullptr) {
			const auto & duties = roster->pairing->getDutyVec();
			for (const auto & duty : duties) {
				if (std::find(dutyAssignments.begin(), dutyAssignments.end(), duty->getAssignment()) == dutyAssignments.end()) {
					continue;
				}
				time_t dutyStart = duty->getStartTimeUtcAct() + CrewBaseOffsetMinutes * 60;
				time_t dutyEnd = duty->getEndTimeUtcAct() + CrewBaseOffsetMinutes * 60;
				if (dutyStart < start && dutyEnd <= end) {
					dutyStart = start;
				}
				else if (dutyStart >= start && dutyEnd > end) {
					dutyEnd = end;
				}

				int days = static_cast<int>(dutyEnd - dutyStart) / (3600 * 24);
				int startDay = static_cast<int>(dutyStart - start) / (3600 * 24);
				if (days == 0) {
					if (startDay >= 0) {
						dutyDays.insert(startDay);
					}
				}
				for (int i = 0; i < days; i++) {
					if (startDay + i >= 0) {
						dutyDays.insert(startDay + i);
					}
				}
			}
		}
		// 地面任务
		else {
			/*if (roster->isMergeFdpWithFly) {*/
			if (std::find(dutyAssignments.begin(), dutyAssignments.end(), roster->qualifier) == dutyAssignments.end()) {
				continue;
			}
			time_t rosterStart = const_cast<ROSTER*>(roster)->getStartTimeUtcAct() + CrewBaseOffsetMinutes * 60;
			time_t rosterEnd = const_cast<ROSTER*>(roster)->getEndTimeUtcAct() + CrewBaseOffsetMinutes * 60;
			int days = static_cast<int>(rosterEnd - rosterStart) / (3600 * 24);
			int startDay = static_cast<int>(rosterStart - start) / (3600 * 24);
			if (days == 0) {
				if (startDay >= 0) {
					dutyDays.insert(startDay);
				}
			}
			for (int i = 0; i < days; i++) {
				if (startDay + i >= 0) {
					dutyDays.insert(startDay + i);
				}
			}
			//}
		}
	}
	return static_cast<int>(dutyDays.size());
}

std::map<const ROSTER*, const ROSTER*> RosterUtils::GetRosterMapForCalloutStandby(const std::vector<const ROSTER*>& rosters, const vector<string>& standbyAssignments, const int delta) {
	std::map<const ROSTER*, const ROSTER*> resultMap;
	for (int i = 0; i < (int)rosters.size() - 1; ++i)
	{
		//仅需要判断Roster的Assignment(rosters.qualifier)是否在standbyAssignments即可, 这里同时判断AssignmentGroup(rosters.duty)为保证老配置的兼容性
		if (std::find(standbyAssignments.cbegin(), standbyAssignments.cend(), rosters[i]->duty) == standbyAssignments.cend() 
		&& std::find(standbyAssignments.cbegin(), standbyAssignments.cend(), rosters[i]->qualifier) == standbyAssignments.cend())
			continue;
		if (rosters[i + 1]->duty != "FLY" || !(rosters[i + 1]->pairing))
			continue;
		if (rosters[i]->actStrUtc < rosters[i + 1]->actStrUtc && (rosters[i]->actRestStrUtc + delta) >= rosters[i + 1]->actStrUtc)
		{
			resultMap.insert(std::make_pair(rosters[i], rosters[i + 1]));
		}
	}
	return resultMap;
}


std::vector<Pairing*> RosterUtils::GetPairingForCalloutStandby(const std::vector<const ROSTER*>& rosters, const vector<string>& standbyAssignments) {
	std::vector<Pairing*> result;
	std::map<const ROSTER*, const ROSTER*> map = GetRosterMapForCalloutStandby(rosters, standbyAssignments);
	for (const auto& pair : map) {
		if (pair.second != nullptr && pair.second->pairing != nullptr) {
			result.push_back(pair.second->pairing);
		}
	}
	return result;
}

const SharedPtr<ROSTER> RosterUtils::GetRosterByPairingId(const vector<SharedPtr<ROSTER>>& rosters, const long long pairingId) {
	if (pairingId == 0) {
		//地面任务
		return nullptr;
	}
	SharedPtr<ROSTER> roster = nullptr;
	for (auto& roster : rosters) {
		if (roster->pairId == pairingId) {
			return roster;
		}
	}
	return roster;
}

int RosterUtils::GetDutyPeriodInSecsForGround(const ROSTER* roster, const SharedPtr<CrewDataContext>& dbData) {
	int mergeDP = const_cast<ROSTER*>(roster)->dutyValues.getMergeDp(0);
	if (mergeDP > 0) {
		return mergeDP;
	}

	auto& qualifier = roster->qualifier;
	auto dbRosterAssignment = dbData->assignmentNameMap.find(qualifier);
	double dp_pct = 1.0;
	if (dbRosterAssignment != dbData->assignmentNameMap.end()) {
		dp_pct = dbRosterAssignment->second->DP_PCT;
	}
	return GetDutyPeriodInSecsForGround(roster, dp_pct);
}

int RosterUtils::GetDutyPeriodInSecsForGround(const ROSTER* roster, const double dp_pct) {
	int dp = static_cast<int>(roster->actRestStrUtc - roster->actStrUtc);
	return static_cast<int>(dp * dp_pct) ;
}

int RosterUtils::GetTimeZoneOffset(const time_t baseUtcTime, const std::shared_ptr<CREW>& crew, const SharedPtr<CrewDataContext>& dbData) {
	return GetTimeZoneOffset(baseUtcTime, crew->getPrimeBase(), dbData);
}

int RosterUtils::GetTimeZoneOffset(const time_t baseUtcTime, const std::string base, const SharedPtr<CrewDataContext>& dbData) {
	string station = base;
	string airlinecode = dbData->scenario.airline;
	if (airlinecode == "BR") {
		//针对长荣，需求要求固定为 TPE 机场时区时间
		station = "TPE";
	}
	string depZoneId = dbData->getAirportZoneId(station);
	int offset = TimezoneUtils::GetTimezoneOffset(baseUtcTime, depZoneId);
	return offset;
}

//std::vector<const ROSTER*> RosterUtils::GetTrainingRosters(const std::vector<const ROSTER*>& rosters, const SharedPtr<CrewDataContext>& dbData) {
//	std::vector<const ROSTER*> trainingRosters;
//	for (auto& roster : rosters) {
//		if (roster->pairing == nullptr) {
//			if (!roster->tmGroupId.empty()) {
//				trainingRosters.emplace_back(roster);
//			}
//		}
//		else {
//			auto rfs = dbData->rosterFlightMgr.getByPairingId(roster->pairing->getDbId());
//			for (auto& rf : rfs) {
//				if (!rf->tmGroupId.empty()) {
//					trainingRosters.emplace_back(roster);
//					break;
//				}
//			}
//		}
//	}
//	return trainingRosters;
//}

std::shared_ptr<TmCourse> RosterUtils::GetTrainingCourseByRoster(const ROSTER& roster, const SharedPtr<CrewDataContext>& dbData) {
	return GetTrainingCourse(roster.idcrew, roster.rosterId, roster.pairId, roster.tmGroupId, dbData);
}

std::shared_ptr<TmCourse> RosterUtils::GetTrainingCourseByMandayActivity(const MandayActivity& mandayActivity, const SharedPtr<CrewDataContext>& dbData) {
	return GetTrainingCourse(mandayActivity.getCrewId(), mandayActivity.getRosterId(), mandayActivity.getPairingId(), mandayActivity.getTmGroupId(), dbData);
}

std::shared_ptr<TmCourse> RosterUtils::GetTrainingCourse(const string crewId, const long long rosterId, const long long pairingId, const string tmGroupId, const SharedPtr<CrewDataContext>& dbData) {
	std::vector<std::string> tmGroupValues;
	long long courseId = 0;
	if (pairingId == 0) {
		//地面任务
		split(tmGroupId, '&', tmGroupValues);
		if (tmGroupValues.size() <= 0) {
			return nullptr;
		}
		courseId = atoll(tmGroupValues[0].c_str());
	}
	else {
		if (dbData->scenarioId > 0) { //RO场景无训练数据，通过RosterFlight获取训练数据
			vector<shared_ptr<RosterFlight>> rosterFlights = dbData->rosterFlightMgr.get(crewId);
			for (auto& rosterFlight : rosterFlights) {
				if (rosterFlight->rosterId == rosterId && !rosterFlight->tmGroupId.empty()) {
					split(rosterFlight->tmGroupId, '&', tmGroupValues);
					break;
				}
			}
		}
		else {
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getByRosterId(rosterId, tmGroupId);
			if (tmProgramCourse != nullptr) {
				courseId = tmProgramCourse->courseId;
			}
			else {
				auto tmProgramCourseInstructor = dbData->tmProgramCourseInstructorIndex->getByRosterId(rosterId, tmGroupId);
				if (tmProgramCourseInstructor != nullptr) {
					courseId = tmProgramCourseInstructor->courseId;
				}
			}
		}
	}


	auto iterCourse = dbData->tmCourseMap.find(courseId);
	if (iterCourse == dbData->tmCourseMap.end()) {
		return nullptr;
	}
	return iterCourse->second;
}


string RosterUtils::GetTrainingCourseCodeByRoster(const ROSTER& roster, const long long flightId, const SharedPtr<CrewDataContext>& dbData) {
	return GetTrainingCourseCode(roster.idcrew, roster.rosterId, flightId, dbData);
}

string RosterUtils::GetTrainingCourseCodeByMandayActivity(const MandayActivity& mandayActivity, const long long flightId, const SharedPtr<CrewDataContext>& dbData) {
	return GetTrainingCourseCode(mandayActivity.getCrewId(), mandayActivity.getRosterId(), flightId, dbData);
}

std::shared_ptr<TmCourse> RosterUtils::GetTrainingCourseByRoster(const ROSTER& roster, const long long flightId, const SharedPtr<CrewDataContext>& dbData) {
	return GetTrainingCourse(roster.idcrew, roster.rosterId, flightId, dbData);
}

std::shared_ptr<TmCourse> RosterUtils::GetTrainingCourseByMandayActivity(const MandayActivity& mandayActivity, const long long flightId, const SharedPtr<CrewDataContext>& dbData) {
	return GetTrainingCourse(mandayActivity.getCrewId(), mandayActivity.getRosterId(), flightId, dbData);
}

string RosterUtils::GetTrainingCourseCode(const string crewId, const long long rosterId, const long long flightId, const SharedPtr<CrewDataContext>& dbData) {
	if (dbData->scenarioId > 0) { //RO场景无训练数据，通过RosterFlight获取训练数据
		auto rf = dbData->rosterFlightMgr.get(flightId, crewId);
		if (rf != nullptr) {
			return rf->courseCode;
		}
	}
	else {
		auto tmCourse = RosterUtils::GetTrainingCourse(crewId, rosterId, flightId, dbData);
		if (tmCourse != nullptr) {
			return tmCourse->courseCode;
		}
	}
	return "";
}

std::shared_ptr<TmCourse> RosterUtils::GetTrainingCourse(const string crewId, const long long rosterId, const long long flightId, const SharedPtr<CrewDataContext>& dbData) {
	if (dbData->scenarioId > 0) { //RO场景无训练数据，通过RosterFlight获取训练数据
		auto rf = dbData->rosterFlightMgr.get(flightId, crewId);
		if (rf != nullptr) {
			auto iter = dbData->tmCourseCodeMap.find(rf->courseCode);
			if (iter != dbData->tmCourseCodeMap.end()) {
				return iter->second;
			}
		}
	}
	else {
		long long courseId = 0;
		auto programCourse = dbData->tmProgramCourseIndex->getByRosterId(rosterId, flightId);
		if (programCourse != nullptr) {
			courseId = programCourse->courseId;
		}
		else {
			auto programCourseInstructor = dbData->tmProgramCourseInstructorIndex->getByRosterId(rosterId, flightId);
			if (programCourseInstructor == nullptr) {
				return nullptr;
			}
			else {
				courseId = programCourseInstructor->courseId;
			}
		}

		auto iterCourse = dbData->tmCourseMap.find(courseId);
		if (iterCourse == dbData->tmCourseMap.end()) {
			return nullptr;
		}
		return iterCourse->second;
	}
	return nullptr;
}

//通过Roster获得训练角色
std::vector<std::string> RosterUtils::GetTrainingRoleByRoster(const ROSTER& roster, const vector<long long>& flightIds, const SharedPtr<CrewDataContext>& dbData) {
	return GetTrainingRole(roster.idcrew, roster.rosterId, roster.pairId, flightIds, roster.tmRole, dbData);
}

//通过Roster获得训练角色
std::vector<std::string> RosterUtils::GetTrainingRoleByMandayActivity(const MandayActivity& mandayActivity, const vector<long long>& flightIds, const SharedPtr<CrewDataContext>& dbData) {
	return GetTrainingRole(mandayActivity.getCrewId(), mandayActivity.getRosterId(), mandayActivity.getPairingId(), flightIds, mandayActivity.getRole(), dbData);
}

std::vector<std::tuple<std::string, std::string>> RosterUtils::GetTrainingAssignmentRoleByRoster(const ROSTER& roster, const vector<long long>& flightIds, const SharedPtr<CrewDataContext>& dbData) {
	return GetTrainingAssignmentRole(roster, flightIds, dbData);
}

std::tuple<time_t, time_t> RosterUtils::GetQualExtension(const std::shared_ptr<CREW_QUALIFICATION>& crewQual, const multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigsForQualMap) {
	const time_t effTimeUtc = crewQual->issuedUtc;
	const time_t expTimeUtc = crewQual->expiryUtc;

	const std::string& qual = crewQual->qual;
	auto pos = qualExtensionConfigsForQualMap.equal_range(qual);
	while (pos.first != pos.second)
	{
		time_t baseEffTimeUtc = 0;
		time_t baseExpTimeUtc = 0;

		auto& activityConfig = pos.first->second;

		Activity* activity = std::get<0>(activityConfig);
		auto& config = std::get<1>(activityConfig);

		
		if (activity->getEndTimeUtcAct() < expTimeUtc) {
			//资质过期前安排资质扩展有效期任务
			int days = std::abs(TimeUtils::DiffDay(activity->getStartTimeUtcAct(), expTimeUtc));
			if (days > config->expiredBeforeDays) {
				return std::make_tuple(effTimeUtc, expTimeUtc);
			}
			baseEffTimeUtc = effTimeUtc;
			baseExpTimeUtc = expTimeUtc;
		}
		else {
			baseEffTimeUtc = activity->getStartTimeUtcAct();
			baseExpTimeUtc = activity->getStartTimeUtcAct();
		}
			
		//if (config->expiredBeforeDays)

		if (config->extensionUnit == "CD")
			return std::make_tuple(baseEffTimeUtc, baseExpTimeUtc + (3600 * 24) * config->extensionTime);
		else if (config->extensionUnit == "CW")
			return std::make_tuple(baseEffTimeUtc, baseExpTimeUtc + (3600 * 24) * 7 * config->extensionTime);
		else if (config->extensionUnit == "CM")
			return  std::make_tuple(baseEffTimeUtc, Utility::GetInstancePtr()->addMonths(baseExpTimeUtc, config->extensionTime));
		else
			return std::make_tuple(effTimeUtc, expTimeUtc);
		++pos.first;
	}
	return std::make_tuple(effTimeUtc, expTimeUtc);
}

multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> RosterUtils::GetQualExtensionConfigs(const ROSTER* roster , const map<string, multimap<string, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigMap) {
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> results;
	if (roster->pairing) {
		const auto& segments = roster->pairing->getSegmentsRead();
		for (const auto& segment : segments) {
			auto tmp = GetQualExtensionConfigs(segment->getAssignment(), segment, qualExtensionConfigMap);
			results.insert(tmp.begin(), tmp.end());
		}
	}
	else {
		results = GetQualExtensionConfigs(roster->qualifier, roster, qualExtensionConfigMap);
	}

	return results;
}

multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> RosterUtils::GetQualExtensionConfigs(const std::string& rosterAssignment, const Activity* activity, const map<string, multimap<string, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigMap) {
	auto iter = qualExtensionConfigMap.find(rosterAssignment);
	if (iter == qualExtensionConfigMap.end())
	{
		return multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>>();
	}
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> results;
	for (auto& pair : iter->second) {
		results.insert(std::make_pair(pair.first, std::make_tuple(const_cast<Activity*>(activity), pair.second)));
	}
	
	return results;
}

//multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> RosterUtils::GetQualExtensionConfigs(const SharedPtr<CREW>& crew, const Activity* activity, const map<string, multimap<string, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigMap) {
//	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> results;
//	if (crew == nullptr) {
//		return results;
//	}
//	return GetQualExtensionConfigs(crew, activity, qualExtensionConfigMap);
//}

multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> RosterUtils::GetQualExtensionConfigs(const SharedPtr<CREW>& crew, const map<string, multimap<string, std::shared_ptr<QualExtensionConfig>>>& qualExtensionConfigMap) {
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> results;
	if (crew == nullptr) {
		return results;
	}
	for (auto& roster : crew->rosterList) {
		if (roster->pairing == nullptr) {
			auto tmp = GetQualExtensionConfigs(roster->qualifier, roster.get(), qualExtensionConfigMap);
			results.insert(tmp.begin(), tmp.end());
		}
		else {
			for (auto& segment : roster->pairing->getSegments()) {
				auto tmp = GetQualExtensionConfigs(segment->getAssignment(), segment, qualExtensionConfigMap);
				results.insert(tmp.begin(), tmp.end());
			}
		}
	}
	return results;
}

std::vector<std::string> RosterUtils::GetTrainingRole(const string crewId, const long long rosterId, const long long pairingId, const vector<long long>& flightIds, const string role, const SharedPtr<CrewDataContext>& dbData) {
	std::vector<std::string> trainingRoles;

	if (pairingId == 0) {
		//地面任务
		trainingRoles.emplace_back(role);
	}
	else {
		if (dbData->scenarioId > 0) { //RO场景无训练数据，通过RosterFlight获取训练数据
			vector<shared_ptr<RosterFlight>> rosterFlights = dbData->rosterFlightMgr.get(crewId);
			for (auto& rosterFlight : rosterFlights) {
				if (rosterFlight->rosterId == rosterId && rosterFlight->pairingId == pairingId 
					&& std::find(flightIds.cbegin(), flightIds.cend(), rosterFlight->fltId) != flightIds.cend() && !rosterFlight->tmRole.empty()) {
					trainingRoles.emplace_back(rosterFlight->tmRole);
				}
			}
		}
		else {
			for (auto flightId : flightIds) {
				auto tmProgramCourse = dbData->tmProgramCourseIndex->getByRosterId(rosterId, flightId);
				if (tmProgramCourse != nullptr) {
					trainingRoles.emplace_back(tmProgramCourse->role.empty() ? TrainingRole::TE : tmProgramCourse->role);
				}
				else {
					auto tmProgramCourseInstructor = dbData->tmProgramCourseInstructorIndex->getByRosterId(rosterId, flightId);
					if (tmProgramCourseInstructor != nullptr) {
						trainingRoles.emplace_back(tmProgramCourseInstructor->role);
					}
				}
			}
		}
	}
	return trainingRoles;
}

std::vector<std::tuple<std::string, std::string>>  RosterUtils::GetTrainingAssignmentRole(const ROSTER& roster, const vector<long long>& flightIds, const SharedPtr<CrewDataContext>& dbData) {
	std::vector<std::tuple<std::string, std::string>> trainingRoles;
	const string& crewId = roster.idcrew;
	const long long rosterId = roster.rosterId;
	const long long pairingId = roster.pairId;
	if (pairingId == 0) {
		//地面任务
		trainingRoles.emplace_back(std::make_tuple(roster.qualifier, roster.tmRole));
	}
	else {
		if (dbData->scenarioId > 0) { //RO场景无训练数据，通过RosterFlight获取训练数据
			vector<shared_ptr<RosterFlight>> rosterFlights = dbData->rosterFlightMgr.get(crewId);
			for (auto& rosterFlight : rosterFlights) {
				if (rosterFlight->rosterId == rosterId && rosterFlight->pairingId == pairingId
					&& std::find(flightIds.cbegin(), flightIds.cend(), rosterFlight->fltId) != flightIds.cend()) {
					trainingRoles.emplace_back(std::make_tuple(rosterFlight->assignment, rosterFlight->tmRole));
				}
			}
		}
		else {
			for (auto flightId : flightIds) {
				//优化不使用GetPairingSegment()需要在ProgramCourse和ProgramCourseInstructor数据库表新增Assignment字段
				//auto segment = GetPairingSegment(roster.pairing, flightId);
				auto tmProgramCourse = dbData->tmProgramCourseIndex->getByRosterId(rosterId, flightId);
				if (tmProgramCourse != nullptr) {
					//trainingRoles.emplace_back(std::make_tuple(segment == nullptr ? "" : segment->getAssignment(), tmProgramCourse->role.empty() ? TrainingRole::TE : tmProgramCourse->role));
					trainingRoles.emplace_back(std::make_tuple(tmProgramCourse->rfAssignment, tmProgramCourse->role.empty() ? TrainingRole::TE : tmProgramCourse->role));
				}
				else {
					auto tmProgramCourseInstructor = dbData->tmProgramCourseInstructorIndex->getByRosterId(rosterId, flightId);
					if (tmProgramCourseInstructor != nullptr) {
						//trainingRoles.emplace_back(std::make_tuple(segment == nullptr ? "" : segment->getAssignment(), tmProgramCourseInstructor->role));
						trainingRoles.emplace_back(std::make_tuple(tmProgramCourseInstructor->rfAssignment, tmProgramCourseInstructor->role));
					}
					else {
						auto segment = GetPairingSegment(roster.pairing, flightId);
						trainingRoles.emplace_back(std::make_tuple(segment == nullptr ? "" : segment->getAssignment(), ""));
					}
				}
			}
		}
	}

	return trainingRoles;
}

int RosterUtils::GetEndTimeGapInSec(const Activity* activity, const int offsetTZMinutes, const string timeType) {
	constexpr int gapInSec = 60; //60秒

	time_t endTime = activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;

	if (typeid(*activity) == typeid(ROSTER)) {
		const ROSTER* roster = (const ROSTER*)activity;
		endTime = roster->getRestStartUtcAct() + (time_t)offsetTZMinutes * 60;
		if (timeType == "SCH") {
			endTime = roster->getRestStartUtcSch() + (time_t)offsetTZMinutes * 60;
		}
	}
	else {
		endTime = activity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;
		if (timeType == "SCH") {
			endTime = activity->getEndTimeUtcSch() + (time_t)offsetTZMinutes * 60;
		}
	}

	if (TimeUtils::IsLastSecondOfDay(endTime)) {
		if (typeid(*activity) == typeid(ROSTER)) {
			//结束时间为23:59:59，地面任务需要增加1秒
			return 1;
		}
		else if (typeid(*activity) == typeid(Segment)) {
			const Segment& segment = static_cast<const Segment&>(*activity);
			//结束时间为23:59:59，地面任务建立虚拟航班需要增加1秒
			return segment.getFlightFlag() == "A" ? 0 : 1;
		}
	}
	else if (TimeUtils::IsLastMinuteOfDay(endTime)) {
		if (typeid(*activity) == typeid(ROSTER)) {
			//结束时间为23:59，地面任务需要增加1分钟
			return gapInSec;
		}
		else if (typeid(*activity) == typeid(Segment)) {
			const Segment& segment = static_cast<const Segment&>(*activity);
			//结束时间为23:59，地面任务建立虚拟航班需要增加1分钟
			return segment.getFlightFlag() == "A" ? 0 : gapInSec;
		}
	}
	return 0;
}

int RosterUtils::GetEndTimeGapInSec(const Activity* activity, const string timeType) {
	if (activity == nullptr) {
		return 0;
	}
	constexpr int gapInSec = 60; //60秒

	time_t endTime = activity->getEndTimeLocAct();

	if (typeid(*activity) == typeid(ROSTER)) {
		const ROSTER* roster = (const ROSTER*)activity;
		endTime = roster->getRestStartLocAct();
		if (timeType == "SCH") {
			endTime = roster->getRestStartLocSch();
		}
	}
	else {
		endTime = activity->getEndTimeLocAct();
		if (timeType == "SCH") {
			endTime = activity->getEndTimeLocSch();
		}
	}

	if (TimeUtils::IsLastMinuteOfDay(endTime)) {
		if (typeid(*activity) == typeid(ROSTER)) {
			//结束时间为23:59，地面任务需要增加1分钟
			return gapInSec;
		}
		else if (typeid(*activity) == typeid(Segment)) {
			const Segment& segment = static_cast<const Segment&>(*activity);
			//结束时间为23:59，地面任务建立虚拟航班需要增加1分钟
			return segment.getFlightFlag() == "A" ? 0 : gapInSec;
		}
	}
	return 0;
}

vector<string> RosterUtils::GetValidQualificationOfCrew(const ROSTER* roster, const std::shared_ptr<CREW>& crew) {
	return GetValidQualificationOfCrew(roster->getStartTimeUtcAct(), roster->getRestStartUtcAct(), crew);
}

vector<string> RosterUtils::GetValidQualificationOfCrew(const time_t startTime, const time_t endTime, const std::shared_ptr<CREW>& crew) {
	vector<string> crewQuals;
	for (auto& qual : crew->qualificationList) {
		if (CompetenceValidationUtils::IsValid(qual, startTime, endTime)) {
			crewQuals.emplace_back(qual->qual);
		}
	}
	return crewQuals;
}

bool RosterUtils::IsValidCrewQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const vector<string>& quals, const bool defaultValid) {
	bool valid = defaultValid;//crew没有quals时，认定的合法性
	for (auto& crewQual : crew->qualificationList) {
		if (std::find(quals.begin(), quals.end(), crewQual->qual) == quals.end()) {
			continue;
		}
		if (CompetenceValidationUtils::IsValid(crewQual, roster->getStartTimeUtcAct(), roster->getRestStartUtcAct())) {
			valid = true;
			break;
		}
	}
	return valid;
}

bool RosterUtils::IsValidCrewQualification(const Segment* segment, const std::shared_ptr<CREW>& crew, const vector<string>& quals, const bool defaultValid) {
	bool valid = defaultValid;//crew没有quals时，认定的合法性
	for (auto& crewQual : crew->qualificationList) {
		if (std::find(quals.begin(), quals.end(), crewQual->qual) == quals.end()) {
			continue;
		}
		if (CompetenceValidationUtils::IsValid(crewQual, segment->getStartTimeUtcAct(), segment->getEndTimeUtcAct())) {
			valid = true;
			break;
		}
	}
	return valid;
}

vector<const ROSTER*> RosterUtils::FilterRoster(const vector<const ROSTER*>& rosters, const time_t startTimeUtc, const time_t endTimeUtc) {
	vector<const ROSTER*> filterRosters;
	for (auto& roster : rosters) {
		if (TimeUtils::IsAbsoluteTimesCovered(roster->actStrUtc, roster->actRestStrUtc, startTimeUtc, endTimeUtc)) {
			filterRosters.emplace_back(roster);
		}
	}
	return filterRosters;
}

//获得场景开始时间（本地时区）
time_t RosterUtils::GetScenarioStartLoc(const std::shared_ptr<CREW> crew, const SharedPtr<CrewDataContext>& dbData) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	string base = (crew == nullptr || application == ROSTER_OPTIMIZER) ? dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"] : crew->getPrimeBase();
	int timezoneOffsetMinutes = RosterUtils::GetTimeZoneOffset(dbData->scenario.startDtUTC, base, dbData);
	return dbData->scenario.startDtUTC + (time_t)(timezoneOffsetMinutes * 60);
}

//获得场景开始时间（本地时区）
time_t RosterUtils::GetScenarioStartLoc(const SharedPtr<CrewDataContext>& dbData) {
	return GetScenarioStartLoc(nullptr, dbData);
}

//获得场景结束时间（本地时区）
time_t RosterUtils::GetScenarioEndLoc(const std::shared_ptr<CREW> crew, const SharedPtr<CrewDataContext>& dbData) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	string base = (crew == nullptr || application == ROSTER_OPTIMIZER) ? dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"] : crew->getPrimeBase();
	int timezoneOffsetMinutes = RosterUtils::GetTimeZoneOffset(dbData->scenario.endDtUTC, base, dbData);
	return  dbData->scenario.endDtUTC + (time_t)(timezoneOffsetMinutes * 60);
}

//获得场景结束时间（本地时区）
time_t RosterUtils::GetScenarioEndLoc(const SharedPtr<CrewDataContext>& dbData) {
	return GetScenarioEndLoc(nullptr, dbData);
}

int RosterUtils::GetConsecutiveTimesWithCurrRoster(const ROSTER* prevRoster, const ROSTER* currRoster) {
	if (currRoster == nullptr) {
		return -1;
	}
	if (prevRoster == nullptr && currRoster != nullptr) {
		return 1;
	}
	time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevRoster->getRestStartLocAct(), 0);
	time_t endLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currRoster->getStartTimeLocAct(), 0);
	int gap = (int)(endLocalDay - startLocalDay);
	if (gap == 0 || gap == 24 * 60 * 60) {
		//二个Roster连续
		return 1;
	}
	return -1;
}

int RosterUtils::GetConsecutiveTimesWithCurrActivity(const Activity* prevActivity, const Activity* currActivity, const int offsetTZMinutes) {
	if (currActivity == nullptr) {
		return -1;
	}
	if (prevActivity == nullptr && currActivity != nullptr) {
		return 1;
	}

	time_t prevActivityEndTimeLocAct = prevActivity->getEndTimeUtcAct() + offsetTZMinutes * 60;
	if (typeid(*prevActivity) == typeid(ROSTER)) {
		prevActivityEndTimeLocAct = ((ROSTER*)prevActivity)->getRestStartUtcAct() + offsetTZMinutes * 60;
	}

	time_t currActivityStartTimeLocAct = currActivity->getStartTimeUtcAct() + offsetTZMinutes * 60;

	time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevActivityEndTimeLocAct, 0);
	time_t endLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currActivityStartTimeLocAct, 0);
	int gap = (int)(endLocalDay - startLocalDay);
	if (gap == 0 || gap == 24 * 60 * 60) {
		//二个Roster连续
		return 1;
	}
	return -1;
}

int RosterUtils::GetConsecutiveDaysWithCurrRoster(const ROSTER* prevRoster, const ROSTER* currRoster) {
	if (currRoster == nullptr) {
		return -1;
	}
	int days = TimeUtils::DiffCalendarDay(currRoster->getStartTimeLocAct(), currRoster->getRestStartLocAct());
	if (prevRoster == nullptr && currRoster != nullptr) {
		return days;
	}
	time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevRoster->getRestStartLocAct(), 0);
	time_t endLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currRoster->getStartTimeLocAct(), 0);
	int gap = (int)(endLocalDay - startLocalDay);
	if (gap == 0) {
		return days - 1;
	}
	if (gap == 24 * 60 * 60) {
		return days;
	}
	return -1;
}

int RosterUtils::GetConsecutiveDaysWithCurrRosterByStartTime(const ROSTER* prevRoster, const ROSTER* currRoster) {
	if (currRoster == nullptr) {
		return -1;
	}
	//基于roster开始时间计算连续天数，每个roster的start time作为判断依据
	if (prevRoster == nullptr && currRoster != nullptr) {
		return 1;
	}
	// 使用prevRoster的start time和currRoster的start time判断连续性
	time_t prevLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevRoster->getStartTimeLocAct(), 0);
	time_t currLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currRoster->getStartTimeLocAct(), 0);
	int gap = (int)(currLocalDay - prevLocalDay);
	if (gap == 0) {
		// 同一天开始，返回0表示不新增连续天数（这一天已经被prevRoster覆盖）
		return 0;
	}
	if (gap == 24 * 60 * 60) {
		// 连续的第二天，返回1表示新增1天连续
		return 1;
	}
	return -1;
}

int RosterUtils::GetConsecutiveDaysWithCurrActivity(const Activity* prevActivity, const Activity* currActivity) {
	if (currActivity == nullptr) {
		return -1;
	}

	time_t currActivityStartTimeLocAct = currActivity->getStartTimeLocAct();
	time_t currActivityEndTimeLocAct = currActivity->getEndTimeLocAct();
	if (typeid(*currActivity) == typeid(ROSTER)) {
		currActivityEndTimeLocAct = ((ROSTER*)currActivity)->getRestStartLocAct();
	}

	int days = TimeUtils::DiffCalendarDay(currActivityStartTimeLocAct, currActivityEndTimeLocAct);
	if (prevActivity == nullptr && currActivity != nullptr) {
		return days;
	}
	time_t prevActivityEndTimeLocAct = prevActivity->getEndTimeLocAct();
	if (typeid(*prevActivity) == typeid(ROSTER)) {
		prevActivityEndTimeLocAct = ((ROSTER*)prevActivity)->getRestStartLocAct();
	}

	time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevActivityEndTimeLocAct, 0);
	time_t endLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currActivityStartTimeLocAct, 0);
	int gap = (int)(endLocalDay - startLocalDay);
	if (gap == 0) {
		return days - 1;
	}
	if (gap == 24 * 60 * 60) {
		return days;
	}
	return -1;
}

vector<SharedPtr<ROSTER>> RosterUtils::FilterRostersByQualExtension(const int ruleRosterIndex, const std::shared_ptr<CREW>& crew, const SharedPtr<CrewDataContext>& dbData) {
	vector<SharedPtr<ROSTER>> rosters;

	for (int index = 0; index < (int)crew->rosterList.size(); index++) {
		auto& tmpRoster = crew->rosterList[index];
		if (dbData->qualExtensionConfigMap.find(tmpRoster->qualifier) != dbData->qualExtensionConfigMap.end()) {
			rosters.emplace_back(tmpRoster);
		}
		else if (index == ruleRosterIndex) {
			rosters.emplace_back(tmpRoster);
		}
	}
	return rosters;
}


unordered_map<long long, const ROSTER*> RosterUtils::GetPairingRosterMap(const std::vector<const ROSTER*>& rosters) {
	unordered_map<long long, const ROSTER*> pairingRosterMap;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		pairingRosterMap.insert(std::make_pair(roster->pairing->getDbid(), roster));
	}
	return pairingRosterMap;
}

int RosterUtils::GetActualRestMinutes(time_t& actRestStartTimeUtc, time_t& actRestEndTimeUtc, const Activity* currActivity, const Activity* nextActivity, const SharedPtr<CrewDataContext>& dbData) {
	actRestStartTimeUtc = 0;
	actRestEndTimeUtc = 0;
	if ((currActivity != nullptr && typeid(*currActivity) == typeid(Duty)) && (nextActivity != nullptr && typeid(*nextActivity) == typeid(Duty))) {
		Duty* currDuty = (Duty*)currActivity;
		Duty* nextDuty = (Duty*)nextActivity;
		actRestStartTimeUtc = currDuty->getLastDropoff()->getEndTimeUtcAct();
		actRestEndTimeUtc = nextDuty->getFirstPickup()->getStartTimeUtcAct();
	}
	else if ((currActivity != nullptr && typeid(*currActivity) == typeid(Duty)) && (nextActivity != nullptr && typeid(*nextActivity) == typeid(ROSTER))) {
		Duty* currDuty = (Duty*)currActivity;
		ROSTER* nextRoster = (ROSTER*)nextActivity;
		actRestStartTimeUtc = currDuty->getLastDropoff()->getEndTimeUtcAct();
		actRestEndTimeUtc = nextRoster->getStartTimeUtcAct();
	}
	else if ((currActivity != nullptr && typeid(*currActivity) == typeid(ROSTER)) && (nextActivity != nullptr && typeid(*nextActivity) == typeid(Duty))) {
		ROSTER* currRoster = (ROSTER*)currActivity;
		Duty* nextDuty = (Duty*)nextActivity;
		actRestStartTimeUtc = currRoster->getRestStartUtcAct();
		actRestEndTimeUtc = nextDuty->getFirstPickup()->getStartTimeUtcAct();
	}
	else if ((currActivity != nullptr && typeid(*currActivity) == typeid(ROSTER)) && (nextActivity != nullptr && typeid(*nextActivity) == typeid(ROSTER))) {
		ROSTER* currRoster = (ROSTER*)currActivity;
		ROSTER* nextRoster = (ROSTER*)nextActivity;
		actRestStartTimeUtc = currRoster->getRestStartUtcAct();
		actRestEndTimeUtc = nextRoster->getStartTimeUtcAct();
	}
	else if (currActivity == nullptr && (nextActivity != nullptr && typeid(*nextActivity) == typeid(ROSTER))) {
		ROSTER* nextRoster = (ROSTER*)nextActivity;
		actRestStartTimeUtc = dbData->scenario.startDtUTC;
		actRestEndTimeUtc = nextRoster->getStartTimeUtcAct();
	}
	else if (currActivity == nullptr && (nextActivity != nullptr && typeid(*nextActivity) == typeid(Duty))) {
		Duty* nextDuty = (Duty*)nextActivity;
		actRestStartTimeUtc = dbData->scenario.startDtUTC;
		actRestEndTimeUtc = nextDuty->getFirstPickup()->getStartTimeUtcAct();
	}
	else if ((currActivity != nullptr && typeid(*currActivity) == typeid(Duty)) && nextActivity == nullptr) {
		Duty* currDuty = (Duty*)currActivity;
		actRestStartTimeUtc = currDuty->getLastDropoff()->getEndTimeUtcAct();
		actRestEndTimeUtc = dbData->scenario.endDtUTC;
	}
	else if ((currActivity != nullptr && typeid(*currActivity) == typeid(ROSTER)) && nextActivity == nullptr) {
		ROSTER* currRoster = (ROSTER*)currActivity;
		actRestStartTimeUtc = currRoster->getRestStartUtcAct();
		actRestEndTimeUtc = dbData->scenario.endDtUTC;
	}
	else {
		return -1;
	}
	return (actRestEndTimeUtc - actRestStartTimeUtc) / 60;
}

long RosterUtils::GetDPInMinsWithTruncation(const ROSTER* groundRoster, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData) {
	int dp = 0;
	auto iter = dbData->assignmentNameMap.find(groundRoster->qualifier);

	if (iter == dbData->assignmentNameMap.end()) {
		dp = (int)round((std::min(groundRoster->getRestStartUtcAct(), upperLimitTimeUtc) - std::max(groundRoster->getStartTimeUtcAct(), lowerLimitTimeUtc)));
	}
	else {
		dp = (int)round((std::min(groundRoster->getRestStartUtcAct(), upperLimitTimeUtc) - std::max(groundRoster->getStartTimeUtcAct(), lowerLimitTimeUtc)) * (iter->second->DP_PCT));
	}
	return dp < 0 ? 0 : dp / 60;
}

bool RosterUtils::ExistExceptionCode(const ROSTER* roster, const set<string>& exceptionCodes, const SharedPtr<CrewDataContext>& dbData) {
	if (exceptionCodes.empty() || roster == nullptr || roster->pairing == nullptr) {
		return false;
	}
	return ExistExceptionCode(roster, roster->pairing, exceptionCodes, dbData);
}

//检查Pairing是否存在exception Code（若存在，则返回true并忽略法规检查）
bool RosterUtils::ExistExceptionCode(const ROSTER* roster, const Pairing* pairing, const set<string>& exceptionCodes, const SharedPtr<CrewDataContext>& dbData) {
	if (exceptionCodes.empty() || roster == nullptr || pairing == nullptr) {
		return false;
	}
	for (const auto& duty : pairing->getDutyVec()) {
		if (ExistExceptionCode(roster, duty, exceptionCodes, dbData)) {
			return true;
		}
	}
	return false;
}

//检查Duty是否存在exception Code（若存在，则返回true并忽略法规检查）
bool RosterUtils::ExistExceptionCode(const ROSTER* roster, const Duty* duty, const set<string>& exceptionCodes, const SharedPtr<CrewDataContext>& dbData) {
	if (exceptionCodes.empty() || roster == nullptr || duty == nullptr) {
		return false;
	}
	for (auto& segment : duty->getSegmentsRead()) {
		if (ExistExceptionCode(roster, segment, exceptionCodes, dbData)) {
			return true;
		}
	}
	return false;
}

//检查Segment是否存在exception Code（若存在，则返回true并忽略法规检查）
bool RosterUtils::ExistExceptionCode(const ROSTER* roster, const Segment* segment, const set<string>& exceptionCodes, const SharedPtr<CrewDataContext>& dbData) {
	if (exceptionCodes.empty() || roster == nullptr || segment == nullptr) {
		return false;
	}
	const auto& rf = dbData->rosterFlightMgr.get(segment->getDBId(), roster->idcrew);
	if (rf == nullptr)
		return false;
	if (rf->tsFlag.empty() && rf->exceptionCodes.empty())
		return false;

	return StringUtils::Intersect(exceptionCodes, rf->tsFlags) || StringUtils::Intersect(exceptionCodes, rf->exceptionCodes);
}

int RosterUtils::GetActualEntryTimes(const vector<Segment*>& segments, const vector<std::string>& airportAreas) {
	if (segments.empty() || airportAreas.empty()) {
		return 0;
	}

	int entryCount = 0;
	bool previousWasInTargetArea = false; // 上一个位置（到达机场）是否在目标区域内

	for (size_t i = 0; i < segments.size(); ++i) {
		const Segment* segment = segments[i];
		if (!segment) continue;

		// 检查当前航段的出发机场
		string departureAirport = segment->getDepStation();
		bool currentIsInTargetAreaOnDeparture = false;

		for (const auto& area : airportAreas) {
			if (departureAirport.find(area) != string::npos) {
				currentIsInTargetAreaOnDeparture = true;
				break;
			}
		}

		// 检查当前航段的到达机场
		string arrivalAirport = segment->getArrStation();
		bool currentIsInTargetAreaOnArrival = false;

		for (const auto& area : airportAreas) {
			if (arrivalAirport.find(area) != string::npos) {
				currentIsInTargetAreaOnArrival = true;
				break;
			}
		}

		// 如果之前不在目标区域内，而现在到达了目标区域，则计为一次进入
		if (!previousWasInTargetArea && currentIsInTargetAreaOnArrival) {
			entryCount++;
		}

		// 更新状态：当前航段结束后是否在目标区域内
		previousWasInTargetArea = currentIsInTargetAreaOnArrival;
	}

	return entryCount;
}
