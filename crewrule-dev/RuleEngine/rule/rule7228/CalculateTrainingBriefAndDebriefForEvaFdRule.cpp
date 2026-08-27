#include "CalculateTrainingBriefAndDebriefForEvaFdRule.h"
#include <cfloat>
#include <algorithm>

#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"

void CalculateTrainingBriefAndDebriefForEvaFdRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (_ruleParams.empty() || rosters.empty()) {
		return;
	}

	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return;
	}
	std::shared_ptr<CREW> crew = iterCrew->second;
	string crewBase = crew->getPrimeBase();

	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		ROSTER* currRoster = const_cast<ROSTER*>(roster);
		CalculateDuty(currRoster, crew);
	}

}

void CalculateTrainingBriefAndDebriefForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(TrainingBriefAndDebriefForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(TrainingBriefAndDebriefForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CalculateTrainingBriefAndDebriefForEvaFdRule::CalculateDuty(ROSTER* roster, const std::shared_ptr<CREW>& crew) {
	for (auto& duty : roster->pairing->getDutyVec()) {
		CalculateDuty(duty, roster, crew);
	}
}

void CalculateTrainingBriefAndDebriefForEvaFdRule::CalculateDuty(Duty* duty, ROSTER* roster, const std::shared_ptr<CREW>& crew) {
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

		//roster从学员维度检查
		auto tmProgramCourse = this->_dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId, currSegment->getDBId());
		if (tmProgramCourse != nullptr) {

			auto tmProgram = this->_dbData->tmProgramIndex->getById(tmProgramCourse->programId);
			auto [briefMinutes, debriefMinutes] = this->_dbData->tmCourseBriefIndex->getCourseBriefAndDebrief(tmProgramCourse->courseId,
				(tmProgram != nullptr && tmProgram->isSoloCourse()) ? (tmProgramCourse->role.empty() ? "TE" : tmProgramCourse->role) : "TE");

			if (firstSeg->getDBId() == tmProgramCourse->fltId) {
				//Duty的第一段就是SIM航段，则签到时间设置在Duty上
				SetDutyBrief(duty, roster, briefMinutes);
				isExistBrief = true;
			}
			if (lastSeg->getDBId() == tmProgramCourse->fltId) {
				//Duty的最后一段是SIM航段，则签出时间设置在Duty上
				SetDutyDebrief(duty, roster, debriefMinutes);
			}

			prevSegBriefMinutes = briefMinutes;
			prevSegDebriefMinutes = debriefMinutes;
			if (prevSegment != nullptr)	{
				//Duty的首个SIM航段不是Duty的第一个航段，则签到时间和签出时间设置在Segment上
				if (!isExistBrief) {
					SetSegmentBrief(roster->pairing, duty, prevSegment, currSegment, briefMinutes);
					segmentNodeMap.insert(std::make_pair(prevSegment->getDBId(), currSegment->getDBId()));
					isExistBrief = true;
					continue;
				}
			}
		}
		//else { //当Crew以学员和教员连续混排时，分成“学员段”和“教员段”分别设置Brief和Debrief
		//	if (isBrief) {
		//		SetSegmentDebrief(roster->pairing, duty, prevSegment, currSegment, prevSegDebriefMinutes);
		//      segmentNodeMap.insert(std::make_pair(prevSegment->getDBId(), currSegment->getDBId()));
		//      isBrief = false;//重新开始设置SIM Segment的Brief
		//	}
		//	
		//}

		//roster从非学员维度检查(即：教员IP、检查员CK、伙伴PNR等)
		auto tmProgramCourseInstructor = this->_dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId, currSegment->getDBId());
		if (tmProgramCourseInstructor != nullptr) {

			auto [briefMinutes, debriefMinutes] = this->_dbData->tmCourseBriefIndex->getCourseBriefAndDebrief(tmProgramCourseInstructor->courseId, tmProgramCourseInstructor->role);

			if (firstSeg->getDBId() == tmProgramCourseInstructor->fltId) {
				//Duty的第一段就是SIM航段，则签到时间设置在Duty上
				SetDutyBrief(duty, roster, briefMinutes);
				isExistBrief = true;
			}
			if (lastSeg->getDBId() == tmProgramCourseInstructor->fltId) {
				//Duty的最后一段是SIM航段，则签出时间设置在Duty上
				SetDutyDebrief(duty, roster, debriefMinutes);
			}

			prevSegBriefMinutes = briefMinutes;
			prevSegDebriefMinutes = debriefMinutes;
			if (prevSegment != nullptr)	{
				//Duty的首个SIM航段不是Duty的第一个航段，则签到时间和签出时间设置在Segment上
				if (!isExistBrief) {
					SetSegmentBrief(roster->pairing, duty, prevSegment, currSegment, briefMinutes);
					segmentNodeMap.insert(std::make_pair(prevSegment->getDBId(), currSegment->getDBId()));
					isExistBrief = true;
					continue;
				}
			}
		}
		//else { //当Crew以学员和教员连续混排时，分成“学员段”和“教员段”分别设置Brief和Debrief
		//	if (isBrief) {
		//		SetSegmentDebrief(roster->pairing, duty, prevSegment, currSegment, prevSegDebriefMinutes);
		//      segmentNodeMap.insert(std::make_pair(prevSegment->getDBId(), currSegment->getDBId()));
		//      isBrief = false;//重新开始设置SIM Segment的Brief
		//	}
		//	
		//}

		if (tmProgramCourse == nullptr && tmProgramCourseInstructor == nullptr) {
			//当Crew以学员和教员连续混排，“学员段”和“教员段”合并在一起设置Brief和Debrief。 SIM Segment Debrief为最后一个课程Debrief（可能是教员也可能是学员）
			if (isExistBrief && prevSegment != nullptr) {
				SetSegmentDebrief(roster->pairing, duty, prevSegment, currSegment, prevSegDebriefMinutes);
				segmentNodeMap.insert(std::make_pair(prevSegment->getDBId(), currSegment->getDBId()));
				isExistBrief = false;//重新开始设置SIM Segment的Brief
			}

		}
	}
	updatePairingNodeOfSegment(duty, segmentNodeMap);
}

//设置Duty的签到和签出
void CalculateTrainingBriefAndDebriefForEvaFdRule::SetDutyBrief(Duty* duty, ROSTER* roster, const int briefMinutes) {
	auto& dbData = this->GetDataContext();

	if (briefMinutes >= 0) {
		duty->setMinBrief(briefMinutes);

		if (duty->getActualBriefMin() != briefMinutes) {
			Segment* firstSeg = duty->getFirstSegment();
			auto brief = duty->getFirstBreif();

			//修改Brief时长
			int offsetTZInSec = static_cast<int>(brief->getEndLoc() - brief->getEndUtc());

			if (dbData->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" || brief->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) {
				time_t briefStartUtc = brief->getEndUtc() - (time_t)briefMinutes * 60;
				brief->setStartUtc(briefStartUtc);
				brief->setStartLoc(briefStartUtc + offsetTZInSec);
			}
			if (firstSeg != nullptr) {
				brief->setEndLoc(firstSeg->getStartTimeLoc("ACT"));
				brief->setEndUtc(firstSeg->getStartTimeUtc("ACT"));
			}

			auto pickup = duty->getFirstPickup();
			int pickupInSec = static_cast<int>(pickup->getEndUtc() - pickup->getStartUtc());
			if (dbData->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" || pickup->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) {
				pickup->setEndUtc(brief->getStartUtc());
				pickup->setEndLoc(brief->getStartLoc());
			}
			if (dbData->systemParamMap["RE_CALC_PICKUP_WHILE_MANUAL_MODIFY"] == "Y" || pickup->getIsManualModify() == 0) {
				pickup->setStartUtc(pickup->getEndUtc() - pickupInSec);
				pickup->setStartLoc(pickup->getEndLoc() - pickupInSec);
			}
			duty->setActualBriefMin(static_cast<long>(brief->getEndUtc() - brief->getStartUtc()) / 60);

			fixPairingAndDutyBriefAndPickupTime(duty, roster, brief, pickup);
		}
	}
}

void CalculateTrainingBriefAndDebriefForEvaFdRule::SetDutyDebrief(Duty* duty, ROSTER* roster, const int debriefMinutes) {
	auto& dbData = this->GetDataContext();

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
			if (dbData->systemParamMap["RE_CALC_DEBRIEF_WHILE_MANUAL_MODIFY"] == "Y" || debrief->getIsManualModify() == 0 || duty->getDebriefNeedRuleReCalc()) {
				debrief->setEndUtc(debreifEndUtc);
				debrief->setEndLoc(debreifEndUtc + offsetTZInSec);
			}

			auto dropoff = duty->getLastDropoff();
			int dropoffInSec = static_cast<int>(dropoff->getEndUtc() - dropoff->getStartUtc());
			dropoff->setStartUtc(debrief->getEndUtc());
			dropoff->setStartLoc(debrief->getEndLoc());
			if (dbData->systemParamMap["RE_CALC_DROPOFF_WHILE_MANUAL_MODIFY"] == "Y" || dropoff->getIsManualModify() == 0 || duty->getDebriefNeedRuleReCalc()) {
				dropoff->setEndUtc(dropoff->getStartUtc() + dropoffInSec);
				dropoff->setEndLoc(dropoff->getStartLoc() + dropoffInSec);
			}
			duty->setActualDebriefMin(static_cast<long>(debrief->getEndUtc() - debrief->getStartUtc()) / 60);

			fixPairingAndDutyDebriefAndDropoffTime(duty, roster, debrief, dropoff);
		}
	}

}

void CalculateTrainingBriefAndDebriefForEvaFdRule::SetSegmentBrief(Pairing* pairing, Duty* duty, Segment* fromSegment, Segment* toSegment, const int briefMinutes) {
	if (briefMinutes > 0) {
		createPairingNodeOfSeg(duty, fromSegment, toSegment, briefMinutes, 0, this->_dbData.get());
	}
}

void CalculateTrainingBriefAndDebriefForEvaFdRule::SetSegmentDebrief(Pairing* pairing, Duty* duty, Segment* fromSegment, Segment* toSegment, const int debriefMinutes) {
	if (debriefMinutes > 0) {
		createPairingNodeOfSeg(duty, fromSegment, toSegment, 0, debriefMinutes, this->_dbData.get());
	}
}

void CalculateTrainingBriefAndDebriefForEvaFdRule::updatePairingNodeOfSegment(Duty* duty, const map<long long, long long>& segmentNodeMap) {
	if (segmentNodeMap.empty()) {
		//不存在基于Segment的Pairing Duty Node，则退出
		return;
	}
	//移除多余的SIM Segment Node
	auto& pairingDutyNodes = duty->pairingDutyNodes;
	auto& dbData = this->GetDataContext();
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

void CalculateTrainingBriefAndDebriefForEvaFdRule::fixPairingAndDutyBriefAndPickupTime(Duty* duty, ROSTER* roster, shared_ptr<PairingDutyNode> brief, shared_ptr<PairingDutyNode> pickup) {
	duty->setStartTimeLocAct(brief->getStartLoc());
	duty->setStartTimeUtcAct(brief->getStartUtc());
	duty->setStartTimeLocSch(brief->getStartLoc());
	duty->setStartTimeUtcSch(brief->getStartUtc());

	auto iterPairing = this->GetDataContext()->pairingIdMap.find(duty->getPairingId());
	if (iterPairing != this->GetDataContext()->pairingIdMap.end()) {
		auto& pairing = iterPairing->second;

		pairing->setMandyOtherTimes(vector<shared_ptr<mandayTimes>>());//清空缓存，需要重新计算manday
		Duty* firstDuty = pairing->getFirstDuty();
		if (firstDuty->getDutyId() == duty->getDutyId()) { //第一个Duty需要修改Pairing和Roster的开始时间
			Segment* firstSegment = firstDuty->getFirstSegment();
			pairing->setStartTimeLocAct(pickup->getStartLoc());
			pairing->setStartTimeUtcAct(pickup->getStartUtc());
			pairing->setStartTimeLocSch(firstSegment->getStartTimeLocSch() - firstDuty->getMinBrief() * 60 - firstDuty->getMinPickup() * 60);
			pairing->setStartTimeUtcSch(firstSegment->getStartTimeUtcSch() - firstDuty->getMinBrief() * 60 - firstDuty->getMinPickup() * 60);

			//roster时间调整
			//roster->strUtc = pairing->getStartTimeUtcSch();
			//roster->strLoc = pairing->getStartTimeLocSch();
			//roster->endUtc = pairing->getEndTimeIncludingRestUtcSch();
			//roster->endLoc = pairing->getEndTimeIncludingRestLocSch();
			//roster->restStrUtc = pairing->getEndTimeUtcSch();
			//roster->restStrLoc = pairing->getEndTimeLocSch();
			roster->actStrUtc = pairing->getStartTimeUtcAct();
			roster->actStrLoc = pairing->getStartTimeLocAct();
			//roster->actEndUtc = pairing->getEndTimeIncludingRestUtcAct();
			//roster->actEndLoc = pairing->getEndTimeIncludingRestLocAct();
			//roster->actRestStrUtc = pairing->getEndTimeUtcAct();
			//roster->actRestStrLoc = pairing->getEndTimeLocAct();
		}
	}
}

void CalculateTrainingBriefAndDebriefForEvaFdRule::fixPairingAndDutyDebriefAndDropoffTime(Duty* duty, ROSTER* roster, shared_ptr<PairingDutyNode> debrief, shared_ptr<PairingDutyNode> dropoff) {
	duty->setEndTimeLocAct(debrief->getEndLoc());
	duty->setEndTimeUtcAct(debrief->getEndUtc());
	duty->setEndTimeLocSch(debrief->getEndLoc());
	duty->setEndTimeUtcSch(debrief->getEndUtc());

	auto iterPairing = this->GetDataContext()->pairingIdMap.find(duty->getPairingId());
	if (iterPairing != this->GetDataContext()->pairingIdMap.end()) {
		auto& pairing = iterPairing->second;
		
		pairing->setMandyOtherTimes(vector<shared_ptr<mandayTimes>>());//清空缓存，需要重新计算manday
		Duty* lastDuty = pairing->getLastDuty();
		if (lastDuty->getDutyId() == duty->getDutyId()) { //最后一个Duty需要修改Pairing和Roster的结束时间
			Segment* lastSegment = lastDuty->getLastSegment();

			pairing->setEndTimeLocAct(dropoff->getEndLoc());
			pairing->setEndTimeUtcAct(dropoff->getEndUtc());
			pairing->setEndTimeLocSch(lastSegment->getEndTimeLocSch() + lastDuty->getMinDebrief() * 60 + lastDuty->getMinDropoff() * 60);
			pairing->setEndTimeUtcSch(lastSegment->getEndTimeUtcSch() + lastDuty->getMinDebrief() * 60 + lastDuty->getMinDropoff() * 60);

			//roster时间调整
			//roster->strUtc = pairing->getStartTimeUtcSch();
			//roster->strLoc = pairing->getStartTimeLocSch();
			//roster->endUtc = pairing->getEndTimeIncludingRestUtcSch();
			//roster->endLoc = pairing->getEndTimeIncludingRestLocSch();
			//roster->restStrUtc = pairing->getEndTimeUtcSch();
			//roster->restStrLoc = pairing->getEndTimeLocSch();
			//roster->actStrUtc = pairing->getStartTimeUtcAct();
			//roster->actStrLoc = pairing->getStartTimeLocAct();
			//roster->actEndUtc = pairing->getEndTimeIncludingRestUtcAct();
			//roster->actEndLoc = pairing->getEndTimeIncludingRestLocAct();
			roster->actRestStrUtc = pairing->getEndTimeUtcAct();
			roster->actRestStrLoc = pairing->getEndTimeLocAct();
		}
	}
}