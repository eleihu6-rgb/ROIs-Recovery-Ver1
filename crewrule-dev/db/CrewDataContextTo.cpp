#include <stdio.h>
#include <vector>
#include <algorithm>

#include <memory>
#include <iostream>
#include <fstream>
#include <time.h>

#include "JsonParser/JsonParser.h"
#include "JsonParser/SegmentJson.h"
#include "JsonParser/DBRuleJson.h"
#include "Pairing.h"
#include "Duty.h"
#include "Segment.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "index/TmProgramIndex.h"
#include "index/TmCourseIndex.h"

inline static string getTrainingGroupId(const long long courseId, const string& courseCode, const string& resourceCode, const time_t startTimeUtc, CrewDataContext* dbData) {
	stringstream ss;
	ss << courseId << "&";
	ss << courseCode << "&";
	ss << resourceCode << "&";
	ss << utcToUtcString(startTimeUtc);
	return ss.str();
}

inline static string getCourseCode(const long long courseId, CrewDataContext* dbData) {
	auto iterCourse = dbData->tmCourseMap.find(courseId);
	if (iterCourse != dbData->tmCourseMap.end()) {
		return iterCourse->second->courseCode;
	}
	return "";
}

inline static long long getNewTraningIdTO() {
	static std::atomic<long long> trainingId(0);
	trainingId.fetch_add(-1, std::memory_order_relaxed); // 原子加法
	return trainingId;
}


inline static void fixTrainingPairingAndDutyBriefAndPickupTime(Duty* duty, shared_ptr<PairingDutyNode> brief, shared_ptr<PairingDutyNode> pickup, CrewDataContext* dbData) {
	duty->setStartTimeLocAct(brief->getStartLoc());
	duty->setStartTimeUtcAct(brief->getStartUtc());
	duty->setStartTimeLocSch(brief->getStartLoc());
	duty->setStartTimeUtcSch(brief->getStartUtc());
}

inline static void fixTrainingPairingAndDutyDebriefAndDropoffTime(Duty* duty, shared_ptr<PairingDutyNode> debrief, shared_ptr<PairingDutyNode> dropoff, CrewDataContext* dbData) {
	duty->setEndTimeLocAct(debrief->getEndLoc());
	duty->setEndTimeUtcAct(debrief->getEndUtc());
	duty->setEndTimeLocSch(debrief->getEndLoc());
	duty->setEndTimeUtcSch(debrief->getEndUtc());
}


//设置Training Duty的签到和签出
inline static void SetTrainingDutyBrief(Duty* duty, const int briefMinutes, CrewDataContext* dbData) {
	if (briefMinutes >= 0) {
		duty->setMinBrief(briefMinutes);

		if (duty->getActualBriefMin() != briefMinutes) {
			Segment* firstSeg = duty->getFirstSegment();
			auto brief = duty->getFirstBreif();

			//修改Brief时长
			int offsetTZInSec = static_cast<int>(brief->getEndLoc() - brief->getEndUtc());

			time_t briefStartUtc = brief->getEndUtc() - (time_t)briefMinutes * 60;
			brief->setStartUtc(briefStartUtc);
			brief->setStartLoc(briefStartUtc + offsetTZInSec);
			if (firstSeg != nullptr) {
				brief->setEndLoc(firstSeg->getStartTimeLoc("ACT"));
				brief->setEndUtc(firstSeg->getStartTimeUtc("ACT"));
			}

			auto pickup = duty->getFirstPickup();
			int pickupInSec = static_cast<int>(pickup->getEndUtc() - pickup->getStartUtc());
			pickup->setEndUtc(brief->getStartUtc());
			pickup->setEndLoc(brief->getStartLoc());
			pickup->setStartUtc(pickup->getEndUtc() - pickupInSec);
			pickup->setStartLoc(pickup->getEndLoc() - pickupInSec);
			duty->setActualBriefMin(static_cast<long>(brief->getEndUtc() - brief->getStartUtc()) / 60);

			fixTrainingPairingAndDutyBriefAndPickupTime(duty, brief, pickup, dbData);
		}
	}
}

inline static void SetTrainingDutyDebrief(Duty* duty, const int debriefMinutes, CrewDataContext* dbData) {
	if (debriefMinutes >= 0) {
		duty->setMinDebrief(debriefMinutes);

		if (duty->getActualDebriefMin() != debriefMinutes) {
			Segment* lastSeg = duty->getLastSegment();
			auto debrief = duty->getLastDebrief();

			//修改Debrief时长
			int offsetTZInSec = static_cast<int>(debrief->getStartLoc() - debrief->getStartUtc());
			time_t debreifEndUtc = debrief->getStartUtc() + (time_t)debriefMinutes * 60;

			if (lastSeg != nullptr) {
				debrief->setStartLoc(lastSeg->getEndTimeLoc("ACT"));
				debrief->setStartUtc(lastSeg->getEndTimeUtc("ACT"));
			}
			debrief->setEndUtc(debreifEndUtc);
			debrief->setEndLoc(debreifEndUtc + offsetTZInSec);

			auto dropoff = duty->getLastDropoff();
			int dropoffInSec = static_cast<int>(dropoff->getEndUtc() - dropoff->getStartUtc());
			dropoff->setStartUtc(debrief->getEndUtc());
			dropoff->setStartLoc(debrief->getEndLoc());
			dropoff->setEndUtc(dropoff->getStartUtc() + dropoffInSec);
			dropoff->setEndLoc(dropoff->getStartLoc() + dropoffInSec);
			duty->setActualDebriefMin(static_cast<long>(debrief->getEndUtc() - debrief->getStartUtc()) / 60);

			fixTrainingPairingAndDutyDebriefAndDropoffTime(duty, debrief, dropoff, dbData);
		}
	}

}

inline static void SetTrainingSegmentBrief(Duty* duty, Segment* fromSegment, Segment* toSegment, const int briefMinutes, CrewDataContext* dbData) {
	if (briefMinutes > 0) {
		createPairingNodeOfSeg(duty, fromSegment, toSegment, briefMinutes, 0, dbData);
	}
}

inline static void SetTrainingSegmentDebrief(Duty* duty, Segment* fromSegment, Segment* toSegment, const int debriefMinutes, CrewDataContext* dbData) {
	if (debriefMinutes > 0) {
		createPairingNodeOfSeg(duty, fromSegment, toSegment, 0, debriefMinutes, dbData);
	}
}

inline static void updatePairingNodeOfTrainingSegment(Duty* duty, const map<long long, long long>& segmentNodeMap, CrewDataContext* dbData) {
	if (segmentNodeMap.empty()) {
		//不存在基于Segment的Pairing Duty Node，则退出
		return;
	}
	//移除多余的SIM Segment Node
	auto& pairingDutyNodes = duty->pairingDutyNodes;
	pairingDutyNodes.erase(std::remove_if(pairingDutyNodes.begin(), pairingDutyNodes.end(),
		[dbData, segmentNodeMap](const auto& pairingDutyNode) {

			if (pairingDutyNode->getType() != "SEGMENT") {
				return false;
			}
			auto iterFromSeg = dbData->flightIdMap.find(pairingDutyNode->getFromSegmentId());
			if (iterFromSeg == dbData->flightIdMap.end()) {
				return false;
			}
			auto iterToSeg = dbData->flightIdMap.find(pairingDutyNode->getToSegmentId());
			if (iterToSeg == dbData->flightIdMap.end()) {
				return false;
			}
			if ((iterFromSeg->second->getAssignment() == "FLY" || iterFromSeg->second->getAssignment() == "OPR") && (iterToSeg->second->getAssignment() == "FLY" || iterToSeg->second->getAssignment() == "OPR")) {
				//飞行航段
				return false;
			}

			auto iterSegmentNode = segmentNodeMap.find(pairingDutyNode->getFromSegmentId());
			if (iterSegmentNode == segmentNodeMap.end() || (iterSegmentNode != segmentNodeMap.end() && iterSegmentNode->second != pairingDutyNode->getToSegmentId())) {
				return true;
			}
			return false;
		}), pairingDutyNodes.end());


	//重新排序节点
	std::map<std::string, int> typeNodeOrderMap = { {"DUTY|PICKUP", 1},	{"DUTY|BRIEF", 2}, {"SEGMENT|DEBRIEF", 3}, {"SEGMENT|DROPOFF", 4},
		{"SEGMENT|PICKUP", 5},	{"SEGMENT|BRIEF", 6}, {"DUTY|DEBRIEF", 7}, {"DUTY|DROPOFF", 8} };

	std::sort(pairingDutyNodes.begin(), pairingDutyNodes.end(), [&typeNodeOrderMap](shared_ptr<PairingDutyNode>& src, shared_ptr<PairingDutyNode>& dest) {
		if (src->getStartUtc() < dest->getStartUtc()) {
			return true;
		}
		else if (src->getStartUtc() > dest->getStartUtc()) {
			return false;
		}
		else {
			int srcTypeNodeOrder = -1, destTypeNodeOrder = -1;
			string key = src->getType() + "|" + src->getNode();
			auto iter = typeNodeOrderMap.find(key);
			if (iter != typeNodeOrderMap.end()) {
				srcTypeNodeOrder = iter->second;
			}

			key = dest->getType() + "|" + dest->getNode();
			iter = typeNodeOrderMap.find(key);
			if (iter != typeNodeOrderMap.end()) {
				destTypeNodeOrder = iter->second;
			}

			return (srcTypeNodeOrder < destTypeNodeOrder);
		}
		});

	//重新设置groupId，前提已经按DUTY和SEGMENT节点排序
	int segmentGroupId = 2;
	int seq = 1;
	for (auto& pairingDutyNode : pairingDutyNodes) {
		if (pairingDutyNode->getType() == "DUTY") {
			pairingDutyNode->setGroupId(1);
		}
		else {
			pairingDutyNode->setGroupId(segmentGroupId);
			if (pairingDutyNode->getNode() == "BRIEF") {
				//Segment Brief Node 是最后一个节点
				segmentGroupId++;
			}
		}
		pairingDutyNode->setSequence(seq);
		seq++;
	}

}

std::tuple<std::shared_ptr<TmProgramCourse>, std::shared_ptr<RosterFlight>> CrewDataContext::updateProgramCourseTO(ROSTER* roster, const long long programCourseId, const long long fltId, const string& resourceCode, bool needCreateSubTm, const string& role) {
	//根据parentProgramCourseId创建children program course设置parentProgramCourseId、rosterId、fltId、startTime、endTime、groupId等，并更新RosterFlight（TO会先调用addRoster）
	auto parentProgramCourse = this->tmProgramCourseIndex->getById(programCourseId);
	if (parentProgramCourse == nullptr) {
		return std::make_tuple(nullptr, nullptr);
	}
	std::shared_ptr<TmProgramCourse> programCourse = parentProgramCourse;
    if (needCreateSubTm) {
        programCourse = std::make_shared<TmProgramCourse>(*parentProgramCourse);
        programCourse->parentId = programCourseId;
        programCourse->id = getNewTraningIdTO();
    }
    if (!roster->pairing) {
        programCourse->rosterGroundId = roster->rosterId;
    } else {
        programCourse->rosterId = roster->rosterId;
    }

	string courseCode = getCourseCode(programCourse->courseId, this);

	programCourse->role = role;
	programCourse->rosterDate = (roster->strUtc/(24*60*60))*(24*60*60);
	programCourse->startTime = roster->strUtc + roster->brief;
	programCourse->endTime = roster->restStrUtc - roster->debrief;
	programCourse->fltId = fltId;
	programCourse->groupId = getTrainingGroupId(programCourse->courseId, courseCode, resourceCode, programCourse->startTime, this);
	programCourse->resourceCode = resourceCode;
	programCourse->source = "CR";
	this->tmProgramCourseMap.insert(std::make_pair(programCourse->id, programCourse));
	this->tmProgramCourseIndex->createIndex(programCourse);

	// set training values only for ground roster
	if (!roster->pairing) {
		roster->tmRole = role;
		roster->tmGroupId = programCourse->groupId;
		roster->tmProgramCourseId = programCourse->id;
		roster->tmResourceCode = resourceCode;
		roster->tmParentProgramCourseId = programCourse->parentId;
	}

	std::shared_ptr<RosterFlight> rf{nullptr};
	if (fltId != 0) {
		rf = this->rosterFlightMgr.get(fltId, roster->idcrew);
		rf->courseCode = courseCode;
		rf->tmGroupId = programCourse->groupId;
		rf->tmResourceCode = programCourse->resourceCode;
		rf->tmProgramCourseId = programCourse->id;
		rf->parentTmProgramCourseId = programCourse->parentId;
		rf->tmRole = programCourse->role;
		auto fltIt = this->flightIdMap.find(fltId);
		if (fltIt != this->flightIdMap.end()) {
			programCourse->startTime = fltIt->second->getStartTimeUtcAct();
			programCourse->endTime = fltIt->second->getEndTimeUtcAct();
		}
	}

	return std::make_tuple(programCourse, rf);
}

std::tuple<std::shared_ptr<TmProgramCourseInstructor>, std::shared_ptr<RosterFlight>> CrewDataContext::createProgramCourseInstructorTO(ROSTER* roster, const long long courseId, const long long fltId, const string& resourceCode, const string& role, const std::shared_ptr<TmProgramCourse>& subProgramCourse) {
	string courseCode = getCourseCode(courseId, this);

	std::shared_ptr<TmProgramCourseInstructor> programCourseInstructor = std::make_shared<TmProgramCourseInstructor>();
	programCourseInstructor->id = getNewTraningIdTO();
	programCourseInstructor->crewId = roster->idcrew;
	programCourseInstructor->role = role;
    if (!roster->pairing) {
        programCourseInstructor->rosterGroundId = roster->rosterId;
    } else {
        programCourseInstructor->rosterId = roster->rosterId;
    }
	programCourseInstructor->fltId = fltId;
	programCourseInstructor->resourceCode = resourceCode;
	programCourseInstructor->startTime = roster->strUtc + roster->brief;
	programCourseInstructor->endTime = roster->restStrUtc - roster->debrief;
	programCourseInstructor->courseId = courseId;
	programCourseInstructor->source = "CR";
	programCourseInstructor->groupId = getTrainingGroupId(courseId, courseCode, resourceCode, programCourseInstructor->startTime, this);
	this->tmProgramCourseInstructorMap.insert(std::make_pair(programCourseInstructor->id, programCourseInstructor));
	this->tmProgramCourseInstructorIndex->createIndex(programCourseInstructor);
	// set training values only for ground roster
	if (!roster->pairing) {
		roster->tmRole = role;
		roster->tmGroupId = programCourseInstructor->groupId;
		roster->tmResourceCode = resourceCode;
	}
	std::shared_ptr<RosterFlight> rf{nullptr};
	if (fltId != 0) {
		rf = this->rosterFlightMgr.get(fltId, roster->idcrew);
		rf->courseCode = courseCode;
		rf->tmGroupId = programCourseInstructor->groupId;
		rf->tmResourceCode = programCourseInstructor->resourceCode;
		rf->tmRole = programCourseInstructor->role;
		if (subProgramCourse != nullptr) {
			string subCourseCode = getCourseCode(subProgramCourse->courseId, this);
			rf->subTmProgramCourseId = subProgramCourse->id;
			rf->parentTmProgramCourseId = subProgramCourse->parentId;
			rf->tmSubRole = subProgramCourse->role;
			rf->subCourseCode = subCourseCode;
		}
		auto fltIt = this->flightIdMap.find(fltId);
		if (fltIt != this->flightIdMap.end()) {
			programCourseInstructor->startTime = fltIt->second->getStartTimeUtcAct();
			programCourseInstructor->endTime = fltIt->second->getEndTimeUtcAct();
		}
	}

	return std::make_tuple(programCourseInstructor, rf);
}

//7228 计算Training Duty签到和签出，并更新Duty和Pairing Duty Node
void CrewDataContext::calcTrainingDutyBriefAndDebriefTO(Duty* duty, Segment* courseSegment, const long long courseId, const string& role) {
	bool isExistBrief = false;
	Segment* firstSeg = duty->getFirstSegment();
	Segment* lastSeg = duty->getLastSegment();

	auto segments = duty->getSegments();
	int prevSegBriefMinutes = -1, prevSegDebriefMinutes = -1;//前一个SIM Segment的签到和签出
	map<long long, long long> segmentNodeMap;//map<fromSegmentId, toSegmentId>
	for (size_t i = 0; i < segments.size(); i++) {
		Segment* currSegment = segments.at(i);
		Segment* prevSegment = (i == 0) ? nullptr : segments.at(i - 1);
		Segment* nextSegment = (i == segments.size() - 1) ? nullptr : segments.at(i + 1);

		auto [briefMinutes, debriefMinutes] = this->tmCourseBriefIndex->getCourseBriefAndDebrief(courseId, role);

		if (firstSeg->getDBId() == courseSegment->getDBId()) {
			//Duty的第一段就是SIM航段，则签到时间设置在Duty上
			SetTrainingDutyBrief(duty, briefMinutes, this);
			isExistBrief = true;
		}
		if (lastSeg->getDBId() == courseSegment->getDBId()) {
			//Duty的最后一段是SIM航段，则签出时间设置在Duty上
			SetTrainingDutyDebrief(duty, debriefMinutes, this);
		}

		prevSegBriefMinutes = briefMinutes;
		prevSegDebriefMinutes = debriefMinutes;
		if (prevSegment != nullptr) {
			//Duty的首个SIM航段不是Duty的第一个航段，则签到时间和签出时间设置在Segment上
			if (!isExistBrief) {
				SetTrainingSegmentBrief(duty, prevSegment, currSegment, briefMinutes, this);
				segmentNodeMap.insert(std::make_pair(prevSegment->getDBId(), currSegment->getDBId()));
				isExistBrief = true;
				continue;
			}
		}

	
		//当Crew以学员和教员连续混排，“学员段”和“教员段”合并在一起设置Brief和Debrief。 SIM Segment Debrief为最后一个课程Debrief（可能是教员也可能是学员）
		if (isExistBrief && prevSegment != nullptr) {
			SetTrainingSegmentDebrief(duty, prevSegment, currSegment, prevSegDebriefMinutes, this);
			segmentNodeMap.insert(std::make_pair(prevSegment->getDBId(), currSegment->getDBId()));
			isExistBrief = false;//重新开始设置SIM Segment的Brief
		}
	}
	updatePairingNodeOfTrainingSegment(duty, segmentNodeMap, this);
}

void CrewDataContext::delTrainingRosterTO(SharedPtr<ROSTER>& roster) {
	auto tmProgramCourseList = this->tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for (auto& programCourse : tmProgramCourseList) {
		this->tmProgramCourseIndex->removeIndex(programCourse);
		this->tmProgramCourseMap.erase(programCourse->id);
	}
	
	auto tmProgramCourseInstructorList = this->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : tmProgramCourseInstructorList) {
		this->tmProgramCourseInstructorIndex->removeIndex(programCourseInstructor);
		this->tmProgramCourseInstructorMap.erase(programCourseInstructor->id);
	}
}