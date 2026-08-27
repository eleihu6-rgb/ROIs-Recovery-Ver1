#include "TrainingCourseUtils.h"

#include <algorithm>

#include "CrewDB.h"
#include "Utility.h"

#include "../constant/Constants.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"
#include "index/TmPairingIndex.h"

#include "Log/Logger.h"

#include "RosterUtils.h"
#include "StringUtils.h"
#include "TimeUtils.h"

/*
* 获得结束时间的Gap差值，单位秒。备注：获得结束时间的本地时间通过 UTC + offsetTZMinutes。
* 业务场景：地面任务一般情况下，任务时间段如下[2025/1/1 20:00,2025/1/1  23:59]，实际用户想表达是[2025/1/1 20:00:00, 2025/1/2 00:00:00) 到1/1结束，但不到1/2。因此需要新增1分钟
* @param endTime：结束时间（UTC)
* @return
*/
inline static int GetEndTimeGapInSec(const time_t endTime, const int offsetTZMinutes) {
	constexpr int gapInSec = 60; //60秒

	if (TimeUtils::IsLastMinuteOfDay(endTime, offsetTZMinutes)) {
		return gapInSec;
	}
	return 0;
}

std::shared_ptr<TmCourse> TrainingCourseUtils::GetCourseByCourseId(const long long courseId, const std::shared_ptr<CrewDataContext>& dbData) {
	auto iter = dbData->tmCourseMap.find(courseId);
	if (iter == dbData->tmCourseMap.end()) {
		return nullptr;
	}
	return iter->second;
}

std::tuple<std::shared_ptr<TmDevice>, std::shared_ptr<TmDeviceTime>> TrainingCourseUtils::GetDeviceOfProgramCourse(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<CrewDataContext>& dbData) {
	auto& tmDeviceTimeIndex = dbData->tmDeviceTimeIndex;
	auto tmDeviceTime = tmDeviceTimeIndex->getByUtcTime(programCourse->resourceCode, programCourse->startTime, programCourse->endTime);

	auto& tmDeviceMap = dbData->tmDeviceMap;
	auto iterDevice = tmDeviceMap.find(programCourse->resourceCode);
	if (iterDevice == tmDeviceMap.end()) {
		return std::make_tuple(nullptr, tmDeviceTime);
	}
	return std::make_tuple(iterDevice->second, tmDeviceTime);
}

const map<long long, vector<std::shared_ptr<RosterProgramCourse>>> TrainingCourseUtils::GetRosterProgramCourseGroupByProgramId(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData) {
	map<long long, vector<std::shared_ptr<RosterProgramCourse>>> results;
	auto& tmProgramCourseIndex = dbData->tmProgramCourseIndex;
	auto& tmProgramCourseInstructorIndex = dbData->tmProgramCourseInstructorIndex;

	//学员TE
	auto tmProgramCourseList = tmProgramCourseIndex->getByCrewId(crew->idCrew);
	for (auto& tmProgramCourse : tmProgramCourseList)
	{
		if (tmProgramCourse->groupId.empty()) {
			continue;
		}
		std::shared_ptr<RosterProgramCourse> rosterProgramCourse = std::make_shared<RosterProgramCourse>();
		rosterProgramCourse->programCourse = tmProgramCourse;

		auto iter = results.find(tmProgramCourse->programId);
		if (iter == results.end()) {

			results.insert(std::make_pair(tmProgramCourse->programId, vector<std::shared_ptr<RosterProgramCourse>>{ rosterProgramCourse }));
		}
		else {
			iter->second.emplace_back(rosterProgramCourse);
		}
	}

	////IP/CK/PNR等非学员
	//auto tmProgramCourseInstructor = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	//if (tmProgramCourseInstructor != nullptr) {

	//	auto traineeProgramCourse = tmProgramCourseIndex->getAnyOneByGroupId(tmProgramCourseInstructor->groupId);
	//	if (traineeProgramCourse == nullptr) {
	//		Logger::getRuleLogger()->error("[GetRosterProgramCourseGroupByProgramId] The training course has instructors, but no trainees.[groupId={}]", tmProgramCourseInstructor->groupId);
	//		continue;
	//	}

	//	std::shared_ptr<RosterProgramCourse> rosterProgramCourse = std::make_shared<RosterProgramCourse>();
	//	rosterProgramCourse->roster = const_cast<ROSTER*>(roster);
	//	rosterProgramCourse->programCourseInstructor = tmProgramCourseInstructor;
	//	rosterProgramCourse->programCourse = traineeProgramCourse;

	//	long long programId = traineeProgramCourse->programId;
	//	auto iter = results.find(programId);
	//	if (iter == results.end()) {
	//		results.insert(std::make_pair(programId, vector<std::shared_ptr<RosterProgramCourse>>{ rosterProgramCourse }));
	//	}
	//	else {
	//		iter->second.emplace_back(rosterProgramCourse);
	//	}
	//}

	for (auto& pair : results) {
		auto& rosterProgramCourseList = pair.second;
		std::sort(rosterProgramCourseList.begin(), rosterProgramCourseList.end(), [](shared_ptr<RosterProgramCourse>& a, shared_ptr<RosterProgramCourse>& b) {
			return a->programCourse->startTime < b->programCourse->startTime;
			});
	}
	return results;
}

const std::vector<std::shared_ptr<ROSTER>> TrainingCourseUtils::GetInstructorRostersOnCourse(const string& groupId, const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::shared_ptr<ROSTER>> results;
	const auto programCourseInstructors = dbData->tmProgramCourseInstructorIndex->getByGroupId(groupId);
	for (const auto& programCourseInstructor : programCourseInstructors) {
		auto iterCrew = dbData->crewIdMap.find(programCourseInstructor->crewId);
		if (iterCrew == dbData->crewIdMap.end()) {
			Logger::getRuleLogger()->error("[GetInstructorRostersOnCourse] Crew ({}) does not exist.", programCourseInstructor->crewId);
			continue;
		}
		auto& cofCrew = iterCrew->second;
		for (auto& cofRoster : cofCrew->rosterList) {
			if (cofRoster->rosterId == programCourseInstructor->rosterId || cofRoster->rosterId == programCourseInstructor->rosterGroundId) {
				results.emplace_back(cofRoster);
				break;
			}
		}
	}
	return results;
}

std::set<string> TrainingCourseUtils::GetPIPCrewsInProgram(const ROSTER* roster, const long long programId, const string& simioe, const vector<string>& phases, const std::shared_ptr<CrewDataContext>& dbData) {
	std::set<string> crewIds;
	auto& tmProgramCourseIndex = dbData->tmProgramCourseIndex;
	auto& tmProgramCourseInstructorIndex = dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCoursePnrIndex = dbData->tmProgramCoursePnrIndex;

	auto tmProgramCourses = tmProgramCourseIndex->getByProgramId(programId);
	for (auto& tmProgramCourse : tmProgramCourses) {
		if (tmProgramCourse->simioe != simioe || (!phases.empty() && std::find(phases.begin(), phases.end(), tmProgramCourse->coursePhase) == phases.end())) {
			continue;
		}
		auto tmProgramCoursePnr = tmProgramCoursePnrIndex->getByProgramCourseId(GetProgramCourseParentId(tmProgramCourse));
		if (tmProgramCoursePnr == nullptr) {
			continue;
		}
		if (!tmProgramCoursePnr->needPip) {
			continue;
		}
		if (tmProgramCourse->groupId.empty()) {
			continue;
		}
		auto tmProgramCourseIpList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(tmProgramCourse->groupId, TrainingRole::IP);
		auto tmProgramCourseCkList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(tmProgramCourse->groupId, TrainingRole::CK);
		for (auto& tmProgramCourseIp : tmProgramCourseIpList) {
			crewIds.emplace(tmProgramCourseIp->crewId);
		}
		for (auto& tmProgramCourseCk : tmProgramCourseCkList) {
			crewIds.emplace(tmProgramCourseCk->crewId);
		}
	}
	return crewIds;
}

long long TrainingCourseUtils::GetProgramCourseParentId(const std::shared_ptr<TmProgramCourse>& programCourse) {
	long long parentId = programCourse->parentId;//默认时，假设当前是子课程
	if (parentId == 0) {
		//当前为父课程
		parentId = programCourse->id;
	}
	return parentId;
}

vector<long long> TrainingCourseUtils::GetProgramCourseParentIds(const vector<std::shared_ptr<TmProgramCourse>>& programCourses) {
	vector<long long> parentProgramCourseIds;
	for (auto& tmProgramCourse : programCourses) {
		if (tmProgramCourse->parentId == 0) {
			parentProgramCourseIds.emplace_back(tmProgramCourse->id); 
		}
		else {
			parentProgramCourseIds.emplace_back(tmProgramCourse->parentId);
		}
	}
	return parentProgramCourseIds;
}


vector<int> TrainingCourseUtils::GetCourseDurationWithSIM(const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const long long courseId, const std::shared_ptr<CrewDataContext>& dbData) {
	set<int> durations;
	auto tmPairingChartList = TrainingCourseUtils::GetPairingChart(crew, tmProgramCoursePnr, 0, courseId, dbData);
	for (auto& tmPairingChart : tmPairingChartList) {
		//获得SIM的课程时长
		durations.emplace(tmPairingChart->durationMinutes);
	}
	return vector<int>(durations.begin(), durations.end());
}

vector<std::shared_ptr<TmPairingChart>> TrainingCourseUtils::GetPairingChart(const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const long long flightId, const long long courseId, const std::shared_ptr<CrewDataContext>& dbData) {
	if (!tmProgramCoursePnr)
		return vector<std::shared_ptr<TmPairingChart>>();
	if (tmProgramCoursePnr != nullptr && tmProgramCoursePnr->tmPairingChartId != 0) {
		auto tmPairingChart = dbData->tmPairingChartIndex->getById(tmProgramCoursePnr->tmPairingChartId);
		if (tmPairingChart == nullptr) {
			return {};
		}
		return {tmPairingChart};
	}
	const auto tmProgram = dbData->tmProgramIndex->getById(tmProgramCoursePnr->programId);
	if (tmProgram == nullptr) {
		return vector<std::shared_ptr<TmPairingChart>>();
    }
	return TrainingCourseUtils::GetPairingChart(tmProgram, flightId, courseId, crew, dbData);
}

vector<std::shared_ptr<TmPairingChart>> TrainingCourseUtils::GetPairingChart(const std::shared_ptr<TmProgram>& tmProgram, const long long flightId, const long long courseId, const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData) {
	vector<std::shared_ptr<TmPairingChart>> pairingChartList;
	auto programBuddyCourses = dbData->tmProgramBuddyCourseIndex->getByProgramAndCourse(tmProgram->id, courseId);
	int buddyNumber = (int)programBuddyCourses.size();
	vector<std::shared_ptr<CREW>> buddyCrews;//buddy的Crew
	for (auto& programBuddyCourse : programBuddyCourses) {
		auto programBuddy = dbData->tmProgramBuddyIndex->getById(programBuddyCourse->programBuddyId);
		if (programBuddy != nullptr) {
			auto iterCrew = dbData->crewIdMap.find(programBuddy->buddyId);
			if (iterCrew != dbData->crewIdMap.end()) {
				buddyCrews.emplace_back(iterCrew->second);
			}
		}
	}
	auto tmPairingChartCourses = dbData->tmPairingChartCourseIndex->getByCourseId(courseId);
	auto rfOfTE = dbData->rosterFlightMgr.get(flightId, crew->idCrew);
	for (auto& tmPairingChartCourse : tmPairingChartCourses) {
		auto tmPairingChart = dbData->tmPairingChartIndex->getById(tmPairingChartCourse->pairingChartId);
		if (tmPairingChart != nullptr &&
			tmPairingChart->buddyNumber == buddyNumber
			&& (tmProgram->startDate >= tmPairingChart->effDt && tmProgram->startDate < tmPairingChart->expDt)) {

			if (!Utility::GetInstancePtr()->isCrewRankQualified(crew, tmPairingChart->teRanks, tmPairingChart->effDt, tmPairingChart->expDt)) {
				continue;
			}

			if (rfOfTE != nullptr && !tmPairingChart->teRanks.empty() 
				&& std::find(tmPairingChart->teRanks.begin(), tmPairingChart->teRanks.end(), rfOfTE->activeRank) == tmPairingChart->teRanks.end()) {
				continue;
			}

			bool matchBuddy = true;
			for (size_t i = 0; i < buddyCrews.size(); i++) {
				auto& buddyCrew = buddyCrews.at(i);
				if (i >= tmPairingChart->allBuddyRanks.size()) {
					break;
				}
				auto& buddyRanks = tmPairingChart->allBuddyRanks.at(i);
				if (!Utility::GetInstancePtr()->isCrewRankQualified(buddyCrew, buddyRanks, tmPairingChart->effDt, tmPairingChart->expDt)) {
					matchBuddy = false;
					break;
				}

				auto rfOfBuddy = dbData->rosterFlightMgr.get(flightId, buddyCrew->idCrew);
				if (rfOfBuddy != nullptr && !buddyRanks.empty()
					&& std::find(buddyRanks.begin(), buddyRanks.end(), rfOfBuddy->activeRank) == buddyRanks.end()) {
					matchBuddy = false;
					break;
				}
			}

			if (matchBuddy) {
				pairingChartList.emplace_back(tmPairingChart);
			}
		}
	}
	return pairingChartList;
}

vector<std::shared_ptr<TmProgramCourse>> TrainingCourseUtils::GetProgramCourses(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData) {
	vector<std::shared_ptr<TmProgramCourse>> programCourses;

	auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByCrewId(crew->idCrew);
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (tmProgramCourse->groupId.empty()) {
			//未排课，则忽略
			continue;
		}
		programCourses.emplace_back(tmProgramCourse);
	}
	dbData->tmProgramCourseIndex->sortByStartTime(programCourses);
	return programCourses;
}

map<long long, vector<std::shared_ptr<TmProgramCourse>>> TrainingCourseUtils::GetProgramCourseInProgram(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData) {
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap; //map<programId, 培训计划program下已经排课的programCourse>
	
	auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByCrewId(crew->idCrew);
	//按startTime排序
	dbData->tmProgramCourseIndex->sortByStartTime(tmProgramCourseList);
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (tmProgramCourse->groupId.empty()) {
			//未排课，则忽略
			continue;
		}
		auto iterProgramCourse = programCourseMap.find(tmProgramCourse->programId);
		if (iterProgramCourse == programCourseMap.end()) {
			vector<std::shared_ptr<TmProgramCourse>> tmProgramCourseList;
			tmProgramCourseList.emplace_back(tmProgramCourse);
			programCourseMap.insert(std::make_pair(tmProgramCourse->programId, tmProgramCourseList));

		}
		else {
			iterProgramCourse->second.emplace_back(tmProgramCourse);
		}
	}
	
	return programCourseMap;
}

map<long long, vector<std::shared_ptr<TmProgramCourse>>> TrainingCourseUtils::GetProgramCourseInProgramByInstructor(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData) {
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap; //map<programId, programId对应的ProgramCourseList>

	auto programCourseInstructorList = dbData->tmProgramCourseInstructorIndex->getByCrewId(crew->idCrew);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (programCourseInstructor->groupId.empty()) {
			continue;
		}
		auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByGroupId(programCourseInstructor->groupId);
		for (auto& tmProgramCourse : tmProgramCourseList) {
			auto programId = tmProgramCourse->programId;
			auto iter = programCourseMap.find(programId);
			if (iter == programCourseMap.end()) {
				vector<std::shared_ptr<TmProgramCourse>> tmpProgramCourseList;
				tmpProgramCourseList.emplace_back(tmProgramCourse);
				programCourseMap.insert(std::make_pair(programId, tmpProgramCourseList));
			}
			else {
				auto& tmpProgramCourseList = iter->second;
				tmpProgramCourseList.emplace_back(tmProgramCourse);
			}
		}
	}
	return programCourseMap;
}

map<long long, vector<std::shared_ptr<TmProgramCourse>>> TrainingCourseUtils::GetAllProgramCourseInProgram(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData) {
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap; //map<programId, 培训计划program下所有的programCourse>

	auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByCrewId(crew->idCrew);
	for (auto& tmProgramCourse : tmProgramCourseList) {
		auto iterProgramCourse = programCourseMap.find(tmProgramCourse->programId);
		if (iterProgramCourse == programCourseMap.end()) {
			vector<std::shared_ptr<TmProgramCourse>> tmProgramCourseList;
			tmProgramCourseList.emplace_back(tmProgramCourse);
			programCourseMap.insert(std::make_pair(tmProgramCourse->programId, tmProgramCourseList));

		}
		else {
			iterProgramCourse->second.emplace_back(tmProgramCourse);
		}
	}
	return programCourseMap;
}

//map<long long, vector<std::shared_ptr<TmProgramCourseAndSegment>>> TrainingCourseUtils::GetAllProgramCourseAndSegmentInDuty(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData) {
//	map<long long, vector<std::shared_ptr<TmProgramCourseAndSegment>>> programCourseSegmentMap; //map<dutyId, 同一个Duty内安排的TmProgramCourseAndSegment>
//	for (auto& roster : rosters) {
//		if (roster->pairing == nullptr) {
//			continue;
//		}
//		for (auto& duty : roster->pairing->getDutyVec()) {
//			for (auto& segment : duty->getSegmentsRead()) {
//				auto tmProgramCourse = dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId, segment->getDBId());
//				if (tmProgramCourse == nullptr) {
//					continue;
//				}
//
//				std::shared_ptr<TmProgramCourseAndSegment> programCourseAndSegment = std::make_shared<TmProgramCourseAndSegment>();
//				programCourseAndSegment->roster = const_cast<ROSTER*>(roster);
//				programCourseAndSegment->duty = duty;
//				programCourseAndSegment->segment = segment;
//				programCourseAndSegment->programCourse = tmProgramCourse;
//
//				auto iterProgramCourseSegment = programCourseSegmentMap.find(duty->getDutyId());
//				if (iterProgramCourseSegment == programCourseSegmentMap.end()) {
//					vector<std::shared_ptr<TmProgramCourseAndSegment>> tmProgramCourseSegmentList;
//					tmProgramCourseSegmentList.emplace_back(programCourseAndSegment);
//					programCourseSegmentMap.insert(std::make_pair(duty->getDutyId(), tmProgramCourseSegmentList));
//				}
//				else {
//					iterProgramCourseSegment->second.emplace_back(programCourseAndSegment);
//				}
//			}
//		}
//	}
//	return programCourseSegmentMap;
//}

//map<long long, vector<std::shared_ptr<TmProgramCourseAndSegment>>> TrainingCourseUtils::GetAllProgramCourseAndSegmentInProgram(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData) {
//	map<long long, vector<std::shared_ptr<TmProgramCourseAndSegment>>> programCourseSegmentMap; //map<programId, 培训计划program下已经排课的TmProgramCourseAndSegment>
//	for (auto& roster : rosters) {
//		if (roster->pairing == nullptr) {
//			continue;
//		}
//		for (auto& duty : roster->pairing->getDutyVec()) {
//			for (auto& segment : duty->getSegmentsRead()) {
//				auto tmProgramCourse = dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId, segment->getDBId());
//				if (tmProgramCourse == nullptr) {
//					continue;
//				}
//				std::shared_ptr<TmProgramCourseAndSegment> programCourseAndSegment = std::make_shared<TmProgramCourseAndSegment>();
//				programCourseAndSegment->roster = const_cast<ROSTER*>(roster);
//				programCourseAndSegment->duty = duty;
//				programCourseAndSegment->segment = segment;
//				programCourseAndSegment->programCourse = tmProgramCourse;
//
//				auto iterProgramCourseSegment = programCourseSegmentMap.find(tmProgramCourse->programId);
//				if (iterProgramCourseSegment == programCourseSegmentMap.end()) {
//					vector<std::shared_ptr<TmProgramCourseAndSegment>> tmProgramCourseSegmentList;
//					tmProgramCourseSegmentList.emplace_back(programCourseAndSegment);
//					programCourseSegmentMap.insert(std::make_pair(tmProgramCourse->programId, tmProgramCourseSegmentList));
//
//				}
//				else {
//					iterProgramCourseSegment->second.emplace_back(programCourseAndSegment);
//				}
//			}
//		}
//	}
//	return programCourseSegmentMap;
//}

map<long long, vector<std::shared_ptr<TmProgramCourse>>> TrainingCourseUtils::GetProgramCourseMapByParent(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList) {
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap; //map<TmProgramCourse.parentId, TmProgramCourse>

	for (auto& tmProgramCourse : tmProgramCourseList) {
		auto iterProgramCourse = programCourseMap.find(tmProgramCourse->parentId);
		if (iterProgramCourse == programCourseMap.end()) {
			vector<std::shared_ptr<TmProgramCourse>> list;
			list.emplace_back(tmProgramCourse);
			programCourseMap.insert(std::make_pair(tmProgramCourse->parentId, list));

		}
		else {
			iterProgramCourse->second.emplace_back(tmProgramCourse);
		}
	}
	return programCourseMap;
}


map<long long, set<string>> TrainingCourseUtils::GetProgramBuddyMap(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CrewDataContext>& dbData) {
	map<long long, set<string>> courseBuddyCrewIdMap;//map<courseId, buddy的crewId列表>
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (courseBuddyCrewIdMap.find(tmProgramCourse->courseId) == courseBuddyCrewIdMap.end()) {
			set<string> buddyCrewIds = GetProgramBuddyByCourse(programId, tmProgramCourse->courseId, dbData);
			courseBuddyCrewIdMap.insert(std::make_pair(tmProgramCourse->courseId, buddyCrewIds));
		}
	}
	return courseBuddyCrewIdMap;
}

map<long long, set<string>> TrainingCourseUtils::GetProgramBuddyMap(const long long programId, const std::shared_ptr<CrewDataContext>& dbData) {
	map<long long, set<string>> courseBuddyCrewIdMap;//map<courseId, buddy的crewId列表>

	auto programBuddyCourseList = dbData->tmProgramBuddyCourseIndex->getByProgramId(programId);
	for (auto& programBuddyCourse : programBuddyCourseList) {
		auto tmProgramBuddy = dbData->tmProgramBuddyIndex->getById(programBuddyCourse->programBuddyId);

		auto iterBuddyCrew = courseBuddyCrewIdMap.find(programBuddyCourse->courseId);
		if (iterBuddyCrew == courseBuddyCrewIdMap.end()) {
			set<string> buddyCrewIds;
			buddyCrewIds.emplace(tmProgramBuddy->buddyId);
			courseBuddyCrewIdMap.insert(std::make_pair(programBuddyCourse->courseId, buddyCrewIds));
		}
		else {
			set<string>& buddyCrewIds = iterBuddyCrew->second;
			buddyCrewIds.emplace(tmProgramBuddy->buddyId);
		}
	}
	return courseBuddyCrewIdMap;
}

//获得program中course的buddy
set<string> TrainingCourseUtils::GetProgramBuddyByCourse(const long long programId, const long long courseId, const std::shared_ptr<CrewDataContext>& dbData) {
	set<string> buddyCrewIds;
	auto programBuddyCourseList = dbData->tmProgramBuddyCourseIndex->getByProgramAndCourse(programId, courseId);
	for (auto& programBuddyCourse : programBuddyCourseList) {
		auto tmProgramBuddy = dbData->tmProgramBuddyIndex->getById(programBuddyCourse->programBuddyId);
		buddyCrewIds.emplace(tmProgramBuddy->buddyId);
	}
	return buddyCrewIds;
}

bool TrainingCourseUtils::IsSubProgramCourseRelated(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<CrewDataContext>& dbData) {
	if (programCourseA->fltId != 0 && programCourseB->fltId != 0  && programCourseA->fltId == programCourseB->fltId) {

		if (programCourseA->crewId == programCourseB->crewId) {
			//场景1：学员trainee的subcourse（一般不会出现，比如：当前课角色TE，subcourse课程角色是TE）（programCourseA和programCourseB是同一crew）
			if (dbData->scenarioId > 0) { //RO场景无训练数据，通过RosterFlight获取训练数据
				auto rf = dbData->rosterFlightMgr.get(programCourseA->fltId, programCourseA->crewId);
				if (rf == nullptr) {
					return false;
				}
				if ((rf->tmProgramCourseId == programCourseA->id && rf->subTmProgramCourseId == programCourseB->id) ||
					(rf->tmProgramCourseId == programCourseB->id && rf->subTmProgramCourseId == programCourseA->id)) {
					return true;
				}
			}
			else {
				if (programCourseA->groupId.empty()) {
					return false;
				}
				if ((programCourseA->subTmProgramCourseId == programCourseB->id) ||	(programCourseB->subTmProgramCourseId == programCourseA->id)) {
					return true;
				}
			}
		}
		else {
			//场景2：教员instructor的subcourse（比如：当前课角色IP，subcourse课程角色是TE）
			//if (dbData->scenarioId > 0) { //RO场景无训练数据，通过RosterFlight获取训练数据
			//	auto rfA = dbData->rosterFlightMgr.get(programCourseA->fltId, programCourseA->crewId);
			//	if (rfA != nullptr && rfA->tmProgramCourseId == 0 && rfA->subTmProgramCourseId == programCourseA->id) {
			//		return true;
			//	}

			//	auto rfB = dbData->rosterFlightMgr.get(programCourseB->fltId, programCourseB->crewId);
			//	if (rfB != nullptr && rfB->tmProgramCourseId == 0 && rfB->subTmProgramCourseId == programCourseB->id) {
			//		return true;
			//	}
			//}
			//else {
			//	auto programCourseInstructorA = dbData->tmProgramCourseInstructorIndex->getByCrewId(programCourseA->crewId, programCourseA->fltId);
			//	if (programCourseInstructorA != nullptr && !programCourseInstructorA->groupId.empty()&& programCourseInstructorA->subTmProgramCourseId == programCourseA->id) {
			//		return true;
			//	}

			//	auto programCourseInstructorB = dbData->tmProgramCourseInstructorIndex->getByCrewId(programCourseB->crewId, programCourseB->fltId);
			//	if (programCourseInstructorB != nullptr && !programCourseInstructorB->groupId.empty() && programCourseInstructorB->subTmProgramCourseId == programCourseB->id) {
			//		return true;
			//	}
			//}

			auto rfA = dbData->rosterFlightMgr.get(programCourseA->fltId, programCourseA->crewId);
			if (rfA != nullptr && rfA->tmProgramCourseId == 0 && rfA->subTmProgramCourseId == programCourseA->id) {
				return true;
			}

			auto rfB = dbData->rosterFlightMgr.get(programCourseB->fltId, programCourseB->crewId);
			if (rfB != nullptr && rfB->tmProgramCourseId == 0 && rfB->subTmProgramCourseId == programCourseB->id) {
				return true;
			}
		}

	}
	return false;
}

bool TrainingCourseUtils::IsSubProgramCourse(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<CrewDataContext>& dbData) {
	if (programCourse == nullptr || programCourse->groupId.empty()) {
		return false;
	}
	auto rf = dbData->rosterFlightMgr.get(programCourse->fltId, programCourse->crewId);
	return rf != nullptr && rf->subTmProgramCourseId == programCourse->id;
}

shared_ptr<bool> TrainingCourseUtils::IsMainCourseInstructor(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const std::shared_ptr<CrewDataContext>& dbData) {
	shared_ptr<bool> result = IsSubCourseInstructor(programCourseInstructor, dbData);
	if (result == nullptr) {
		return nullptr;
	}
	return std::make_shared<bool>(!(*result));
}

shared_ptr<bool> TrainingCourseUtils::IsSubCourseInstructor(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const std::shared_ptr<CrewDataContext>& dbData) {
	if (programCourseInstructor == nullptr || programCourseInstructor->groupId.empty()) {
		return nullptr;
	}
	auto rfs = dbData->rosterFlightMgr.get(programCourseInstructor->fltId);
	for (auto& rf : rfs) {
		if (rf->tmGroupId == programCourseInstructor->groupId && rf->subTmProgramCourseId != 0) {
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getById(rf->subTmProgramCourseId);
			if (tmProgramCourse == nullptr) {
				return nullptr;
			}
			auto tmProgramCoursePnr = dbData->tmProgramCoursePnrIndex->getByProgramCourseId(tmProgramCourse->parentId);
			if (tmProgramCoursePnr == nullptr) {
				return nullptr;
			}
			return std::make_shared<bool>(programCourseInstructor->role == tmProgramCoursePnr->subIpRole);
		}
	}
	return nullptr;
}

const std::shared_ptr<TmProgramCourse> TrainingCourseUtils::GetProgramCourseOfSubCourse(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const std::shared_ptr<CrewDataContext>& dbData) {
	if (programCourseInstructor == nullptr || programCourseInstructor->groupId.empty()) {
		return nullptr;
	}
	auto rfs = dbData->rosterFlightMgr.get(programCourseInstructor->fltId);
	for (auto& rf : rfs) {
		if (rf->tmGroupId == programCourseInstructor->groupId && rf->subTmProgramCourseId != 0) {
			//获得sub course的programCourseId
			return dbData->tmProgramCourseIndex->getById(rf->subTmProgramCourseId);
		}
	}
	return nullptr;
}

int TrainingCourseUtils::GetSIMOrGNDProgramCourseDuration(const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<TmCourse>& tmCourse, const int offsetTZMinutes, const std::shared_ptr<CrewDataContext>& dbData) {
	int duration = static_cast<int>(programCourse->endTime + GetEndTimeGapInSec(programCourse->endTime, offsetTZMinutes) - programCourse->startTime) / 60;

	std::shared_ptr<TmCourse> tmMainCourse = tmCourse;//默认当前课程是主课程（Main Course）

	auto tmProgramCoursePnr = dbData->tmProgramCoursePnrIndex->getByProgramCourseId(programCourse->parentId);
	if (tmProgramCoursePnr != nullptr && !tmProgramCoursePnr->teRoles.empty() && !tmProgramCoursePnr->teConfigurableCourse.empty()) {
		//判断是否为SubCourse
		if (dbData->scenarioId > 0) { //RO场景无训练数据，通过RosterFlight获取训练数据
			auto rf = dbData->rosterFlightMgr.get(programCourse->fltId, programCourse->crewId);
			if (rf != nullptr) {
				auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByGroupId(rf->tmGroupId);
				if (!tmProgramCourseList.empty()) {
					//获得主课程的Course
					tmMainCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourseList[0]->courseId, dbData);
				}
			}
		}
		else {
			auto programCourseInstructor = dbData->tmProgramCourseInstructorIndex->getByCrewId(programCourse->crewId, programCourse->fltId);
			if (programCourseInstructor != nullptr && !programCourseInstructor->groupId.empty()) {
				auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByGroupId(programCourseInstructor->groupId);
				if (!tmProgramCourseList.empty()) {
					//获得主课程的Course
					tmMainCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourseList[0]->courseId, dbData);
				}
			}
		}
	}
	
	if (tmMainCourse != nullptr && tmMainCourse->courseType == CourseType::GROUND) {
		//需要扣除[12:30,13:30]之间休息时长
		static int restStartHHmm = TimeUtils::hhmmToMinutes("12:30");
		static int restEndHHmm = TimeUtils::hhmmToMinutes("13:30");
		duration = TimeUtils::GetDuration(programCourse->startTime + (time_t)offsetTZMinutes * 60, programCourse->endTime + GetEndTimeGapInSec(programCourse->endTime, offsetTZMinutes) + (time_t)offsetTZMinutes * 60, restStartHHmm, restEndHHmm) / 60;
	}

	return duration;
}

const vector<std::shared_ptr<TmProgramCourseInstructor>> TrainingCourseUtils::GetInstructorListByProgramCourse(const std::shared_ptr<TmProgramCourse>& programCourse, const string& role, const bool includeSubCourse, const std::shared_ptr<CrewDataContext>& dbData) {
	vector<std::shared_ptr<TmProgramCourseInstructor>> results;
	auto& tmProgramIndex = dbData->tmProgramIndex;
	auto& tmProgramCourseInstructorIndex = dbData->tmProgramCourseInstructorIndex;

	auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByGroupIdAndRole(programCourse->groupId, role);
	results.insert(results.end(), tmProgramCourseInstructorList.begin(), tmProgramCourseInstructorList.end());

	auto tmProgram = tmProgramIndex->getById(programCourse->programId);
	if (tmProgram != nullptr && tmProgram->isSoloCourse()) {
        //Solo Course模拟sub course结构，但不可能是sub course关系，直接返回
		return results;
	}

	if (dbData->scenarioId > 0) { //RO场景无训练数据，通过RosterFlight获取训练数据
		if (includeSubCourse) {
			auto rf = dbData->rosterFlightMgr.get(programCourse->fltId, programCourse->crewId);
			if (rf != nullptr && rf->tmProgramCourseId == 0 && rf->subTmProgramCourseId == programCourse->id) {
				//rf为父课程的rosterFlight，获得父课程的教员
				auto tmProgramCourseInstructorOfSubCourse = tmProgramCourseInstructorIndex->getByRosterId(rf->rosterId, rf->fltId);
				auto tmProgramCourseInstructorListOfSubCourse = tmProgramCourseInstructorIndex->getByGroupIdAndRole(tmProgramCourseInstructorOfSubCourse->groupId, role);
				results.insert(results.end(), tmProgramCourseInstructorListOfSubCourse.begin(), tmProgramCourseInstructorListOfSubCourse.end());
			}
		}
	}
	else {
		if (includeSubCourse) {
			auto programCourseInstructor = dbData->tmProgramCourseInstructorIndex->getByCrewId(programCourse->crewId, programCourse->fltId);
			if (programCourseInstructor != nullptr && !programCourseInstructor->groupId.empty() && programCourseInstructor->subTmProgramCourseId == programCourse->id) {
				//rf为父课程的rosterFlight，获得父课程的教员
				auto tmProgramCourseInstructorListOfSubCourse = tmProgramCourseInstructorIndex->getByGroupIdAndRole(programCourseInstructor->groupId, role);
				results.insert(results.end(), tmProgramCourseInstructorListOfSubCourse.begin(), tmProgramCourseInstructorListOfSubCourse.end());
			}
		}
	}
	return results;

}

const vector<std::shared_ptr<TmProgramCourseInstructor>> TrainingCourseUtils::GetSubCourseInstructorListByProgramCourse(const std::shared_ptr<TmProgramCourse>& programCourse, const string& role, const std::shared_ptr<CrewDataContext>& dbData) {
	vector<std::shared_ptr<TmProgramCourseInstructor>> results;
	if (programCourse == nullptr) {
		return results;
	}
	auto& tmProgramCourseInstructorIndex = dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCoursePnrIndex = dbData->tmProgramCoursePnrIndex;
	string tmpRole = role;
	if (tmpRole == TrainingRole::IP) {
		auto tmProgramCoursePnr = tmProgramCoursePnrIndex->getByProgramCourseId(programCourse->parentId);
		if (tmProgramCoursePnr != nullptr && !tmProgramCoursePnr->subIpRole.empty()) {
			tmpRole = tmProgramCoursePnr->subIpRole;
		}
		else {
			return vector<std::shared_ptr<TmProgramCourseInstructor>>();
		}
	}

	auto rf = dbData->rosterFlightMgr.get(programCourse->fltId, programCourse->crewId);
	if (rf == nullptr) {
		results;
	}

	auto tmProgramCourseInstructorListOfSubCourse = tmProgramCourseInstructorIndex->getByGroupIdAndRole(rf->tmGroupId, tmpRole);
	results.insert(results.end(), tmProgramCourseInstructorListOfSubCourse.begin(), tmProgramCourseInstructorListOfSubCourse.end());
	return results;
}

const vector<std::shared_ptr<TmFootprint>> TrainingCourseUtils::GetFootprintList(const ROSTER* roster, const Segment* segment, const std::shared_ptr<CrewDataContext>& dbData, const bool containInstructor) {
	vector<std::shared_ptr<TmFootprint>> footprintList;

	vector<std::shared_ptr<TmProgramCourse>> programCourseList;
	set<long long> footprintIds;
	
	//crew为学员角色
	auto programCourse = dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId, segment->getDBId());
	if (programCourse != nullptr) {
		programCourseList.emplace_back(programCourse);
	}

	if (containInstructor) {
		//crew为非学员角色
		auto programCourseInstructor = dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId, segment->getDBId());
		if (programCourseInstructor != nullptr && !programCourseInstructor->groupId.empty()) {
			auto tmpProgramCourseList = dbData->tmProgramCourseIndex->getByGroupId(programCourseInstructor->groupId);
			programCourseList.insert(programCourseList.end(), tmpProgramCourseList.begin(), tmpProgramCourseList.end());
		}
	}

	for(auto& tmpProgramCourse: programCourseList) {
		auto tmProgram = dbData->tmProgramIndex->getById(tmpProgramCourse->programId);
		if (tmProgram != nullptr && footprintIds.find(tmProgram->footprintId) == footprintIds.end()) {
			footprintIds.emplace(tmProgram->footprintId);
			auto tmFootprint = dbData->tmFootprintIndex->getById(tmProgram->footprintId);
			if (tmFootprint != nullptr) {
				footprintList.emplace_back(tmFootprint);
			}
		}
    }

	return footprintList;
}

const map<long long, vector<std::shared_ptr<TmCourse>>> TrainingCourseUtils::GetFlightCourseMap(const std::shared_ptr<CREW>& crew, const std::shared_ptr<CrewDataContext>& dbData) {
	map<long long, vector<std::shared_ptr<TmCourse>>> results;

	//从学员角度
	auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByCrewId(crew->idCrew);
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (tmProgramCourse->groupId.empty()) {
			//未排课，则忽略
			continue;
		}
		auto course = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
		if (course != nullptr) {
			results[tmProgramCourse->fltId].emplace_back(course);
		}
	}

	//从教员角度
	auto tmProgramCourseInstructorList = dbData->tmProgramCourseInstructorIndex->getByCrewId(crew->idCrew);
	for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
		if (tmProgramCourseInstructor->groupId.empty()) {
			//未排课，则忽略
			continue;
		}
		auto course = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourseInstructor->courseId, dbData);
		if (course != nullptr) {
			results[tmProgramCourseInstructor->fltId].emplace_back(course);
		}
	}
	return results;
}

const map<long long, vector<std::shared_ptr<TmCourse>>> TrainingCourseUtils::GetFlightCourseMap(const ROSTER* roster, const std::shared_ptr<CrewDataContext>& dbData) {
	map<long long, vector<std::shared_ptr<TmCourse>>> results;
    if (roster == nullptr) {
		return results;
	}
	//从学员角度
    auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (tmProgramCourse->groupId.empty()) {
			//未排课，则忽略
			continue;
		}
		auto course = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
		if (course != nullptr) {
			results[tmProgramCourse->fltId].emplace_back(course);
		}
	}

	//从教员角度
	auto tmProgramCourseInstructorList = dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
		if (tmProgramCourseInstructor->groupId.empty()) {
			//未排课，则忽略
			continue;
		}
		auto course = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourseInstructor->courseId, dbData);
		if (course != nullptr) {
			results[tmProgramCourseInstructor->fltId].emplace_back(course);
		}
	}
	return results;
}

const map<long long, vector<std::shared_ptr<TmCourse>>> TrainingCourseUtils::GetFlightCourseMap(const Pairing* pairing, const std::shared_ptr<CrewDataContext>& dbData) {
	if (pairing == nullptr || dbData == nullptr) {
		return {};
	}

	const auto rosterFlights = dbData->rosterFlightMgr.getByPairingId(pairing->getDbId());
	for (const auto& rosterFlight : rosterFlights) {
		if (rosterFlight == nullptr || rosterFlight->crewId.empty()) {
			continue;
		}
		auto crewIter = dbData->crewIdMap.find(rosterFlight->crewId);
		if (crewIter == dbData->crewIdMap.end() || crewIter->second == nullptr) {
			continue;
		}
		return TrainingCourseUtils::GetFlightCourseMap(crewIter->second, dbData);
	}

	return {};
}

int TrainingCourseUtils::GetConsecutiveDaysWithCurrProgramCourse(const std::shared_ptr<TmProgramCourse>& prevProgramCourse, const std::shared_ptr<TmProgramCourse>& currProgramCourse, const int offsetTZMinutes) {
	if (currProgramCourse== nullptr) {
		return -1;
	}
	int days = TimeUtils::DiffCalendarDay(currProgramCourse->startTime + (time_t)offsetTZMinutes * 60, currProgramCourse->endTime + (time_t)offsetTZMinutes * 60);
	if (prevProgramCourse== nullptr && currProgramCourse!= nullptr) {
		return days;
	}
	time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevProgramCourse->endTime + (time_t)offsetTZMinutes * 60, 0);
	time_t endLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currProgramCourse->startTime + (time_t)offsetTZMinutes * 60, 0);
	int gap = (int)(endLocalDay - startLocalDay);
	if (gap == 0) {
		return days - 1;
	}
	if (gap == 24 * 60 * 60) {
		return days;
	}
	return -1;
}

std::shared_ptr<TmProgramCourse> TrainingCourseUtils::FindNearestProgramCourse(
	const std::shared_ptr<TmProgramCourse>& currProgramCourse,
	const vector<std::shared_ptr<TmProgramCourse>>& programCourseList) {
	/*
	这个实现考虑了以下情况：
		1. 检查输入参数是否为空
		2. 计算两个时间段之间的最小距离：
		- 如果当前课程结束时间早于或等于比较课程开始时间，则距离为开始时间差
		- 如果比较课程结束时间早于或等于当前课程开始时间，则距离为结束时间差
		- 如果两个时间段重叠，则距离为0（最接近的情况）
		3. 返回具有最小时间差的课程
		4. 如果有多个相同的最短距离课程，则返回第一个遇到的课程
	*/
	if (!currProgramCourse || programCourseList.empty()) {
		return nullptr;
	}

	time_t currStart = currProgramCourse->startTime;
	time_t currEnd = currProgramCourse->endTime;

	time_t minDifference = std::numeric_limits<time_t>::max();
	std::shared_ptr<TmProgramCourse> nearestCourse = nullptr;

	for (const auto& programCourse : programCourseList) {
		if (!programCourse) {
			continue;
		}

		time_t courseStart = programCourse->startTime;
		time_t courseEnd = programCourse->endTime;

		// Calculate the minimal temporal distance between the two time periods
		time_t diff = 0;

		if (currEnd <= courseStart) {
			// Current course ends before or when compared course starts
			diff = courseStart - currEnd;
		}
		else if (courseEnd <= currStart) {
			// Compared course ends before or when current course starts
			diff = currStart - courseEnd;
		}
		else {
			// Time periods overlap, difference is 0 (closest possible)
			return programCourse;  // Return the overlapping course as it's nearest
		}

		if (diff < minDifference) {
			minDifference = diff;
			nearestCourse = programCourse;
		}
	}

	return nearestCourse;
}