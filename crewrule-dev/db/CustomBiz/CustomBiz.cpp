#include "CustomBiz.h"
#include "CustomBizInternal.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "Log/Logger.h"
#include <algorithm>
using namespace std;

int customBizLoadData(CrewDataContext* dbData) {
	try {
		//临时逻辑
		if (dbData->scenario.airline == "HO") {
			//return customBizLoadDataHO(dbData);
		}
		else if (dbData->scenario.airline == "CA"&&dbData->scenario.division == "C")
		{
			customBizLoadDataCA(dbData);
		
			//op#2426, 第四天优化 CACCDOM模式，ptn for ro只保留场景结束日期一天的
			filterPairingForCACCDOM(dbData);
		}
	}
	catch (...) {
		Logger::getRuleLogger()->error("exception: customBizLoadData({}) fail", dbData->scenario.airline.c_str());
	}
	return 0;
}

string makePairingLabel(Pairing* pairing, CrewDataContext* dbData) {
	if (!pairing || !dbData) {
		return "";//20190605 ain, mantis#5886, 增加参数保护
	}
    return makePairingLabel_OK(pairing, dbData->airportCodeMap);
}

void calculatePairingListRankCombination(vector<Pairing*>& pairings, CrewDataContext* dbData) {
	//OP#1932, 仅当场景包含rule 8091时计算rankCombination
	bool found8091 = false;
	for (auto& item : dbData->ruleList) {
		if (item.function == 8091) {
			found8091 = true;
			break;
		}
	}
	if (found8091) {
		calculatePairingRankCombination_common(pairings, dbData);
		return;
	}
	else {
		Logger::getRuleLogger()->warn("skip calc pairing.rank-combination, no rule 8091 exist");
	}
}

void calculatePairingOptions(vector<Pairing*>& pairings, CrewDataContext* dbData) {
	//OP#1932, 仅当场景包含rule 8091时计算rankCombination
	bool found8091 = false;
	for (auto& item : dbData->ruleList) {
		if (item.function == 8091) {
			found8091 = true;
			break;
		}
	}
	if (found8091) {
		calculatePairingOptions_common(pairings, dbData);
		return;
	}
	else {
		Logger::getRuleLogger()->warn("skip calc pairing.rank-combination, no rule 8091 exist");
	}
}

void calculatePairingOptionByComposition(vector<Pairing*>& pairings, CrewDataContext* dbData) {
	bool found8091 = false;
	for (auto& item : dbData->ruleList) {
		if (item.function == 8091) {
			found8091 = true;
			break;
		}
	}
	if (found8091) {
		calculatePairingOptionByComposition_common(pairings, dbData);
		return;
	}
	else {
		Logger::getRuleLogger()->warn("skip calc pairing.rank-combination, no rule 8091 exist");
	}
}

void calculatePairingDutyTimes(Pairing* pairing, CrewDataContext* dbData) {

	long fdpStart = 0, fdpEnd = 0, dpStart = 0, dpEnd = 0, ftStart = 0, ftEnd = 0, bhStart = 0, bhEnd = 0;
	long act_fdpStart = 0, act_fdpEnd = 0, act_dpStart = 0, act_dpEnd = 0;

	if (!pairing || !dbData) {
		return;//20190605 ain, mantis#5886, 增加参数保护
	}

	//vector<SharedPtr<mandayTimes>> result;
	map<string, SharedPtr<ASSIGNMENT>>::iterator dbPairingAssignment = dbData->assignmentNameMap.find(pairing->getPrimeActivity());
	string base = pairing->getBase();
	int iBHAdj = pairing->getBlockMinsAdjustment() * 60;
	for (std::size_t j = 0; j < pairing->getNumDuties(); j++)
	{
		Duty* duty = pairing->getDuty(j);
        //计算FDP、DP、FT等
		calculatePairingDutyTimes(duty, dbData);
	}
	//rest
	int iSize = (int)pairing->getNumDuties();
	if (iSize > 1){
		for (int i = 0; i < iSize - 1; i++){
			Duty* duty = pairing->getDuty(i);
			time_t endUtc = duty->getEndTimeUtcAct() + duty->getActualDropoffMin() * 60;
			time_t startUtc = pairing->getDuty(i + 1)->getStartTimeUtcAct() - pairing->getDuty(i + 1)->getActualPickupMin() * 60;
			duty->setActualRest((int)((startUtc - endUtc) / 60));

			//计算Duty的计划休息（EVA)
			time_t schEndUtc = duty->getLastSegment()->getEndTimeUtcSch() + duty->getMinDebrief() * 60 + duty->getMinDropoff() * 60;
			time_t schStartUtc = pairing->getDuty(i + 1)->getFirstSegment()->getStartTimeUtcSch() - pairing->getDuty(i + 1)->getMinBrief() * 60 - pairing->getDuty(i + 1)->getMinPickup() * 60;
			duty->setScheduleRest((int)((schStartUtc - schEndUtc) / 60));
		}
	}
}

void calculateRosterDP(ROSTER* roster, CrewDataContext* dbData) {
	if (!roster || !dbData)
		return;

	if (roster->pairing)
		return;

	const auto& assignment = dbData->assignmentNameMap.find(roster->qualifier);
	if (assignment == dbData->assignmentNameMap.end())
		return;

	const auto& duration = static_cast<long>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct());

	int dpGap = 0;

	if (Utility::GetInstancePtr()->checkCoverdDPGapTimeRange(roster->actStrLoc, roster->actEndLoc, dbData)) {
		dpGap = assignment->second->DP_GAP;
	}

	roster->dpMinutes = Utility::GetInstancePtr()->ceil(((duration + assignment->second->before_pct_dp_gap * 60) * assignment->second->DP_PCT + dpGap * 60 + assignment->second->after_pct_dp_gap * 60) / 60);
}

//计算FDP
//1. 计算duty级dutyNode
//2. 计算seg级dutyNode
//3. 若无seg级dutyNode，遍历2102判断是否长中转，若是则计入Brief/debrief
//4. 计算seg自身
long calculateDutyFdp(Duty* duty, CrewDataContext* dbData, CalculationManday FDP) {
	// 2022.12.10 DP/GQ
	// 此函数计算FDP的逻辑和 BasicCalculation.cpp中函数long getCrewManDayAndFlightDutyPeriod(...)计算FDP重复
	// BasicCalculation用于合并执勤期duty FDP计算，CustomBiz用于通用duty FDP计算
	// 两边逻辑有差异，对于长中转 BasicCalculation检查bIncludeCO， CustomBiz中检查bIncludeLongTransitCO，
	// 对于Tracking， BasicCalculation有确实duty node补actual brief/debrief time等逻辑， CustomBiz中没有
	// 目前两边的代码逻辑都保留，后续需要仔细梳理manday 和 fdp计算逻辑，将代码合并
	if (!duty) {
		return 0;//20190605 ain, mantis#5886, 增加参数保护
	}

	///TEST
	//if (duty->getPairingId() == 27494768) {
	//	for (Segment* s : duty->getSegments()) {
	//		cout << "**DBG seg  " << s->getFlightNumber()
	//			<< " sch=" << utcToUtcString(s->getStartTimeLocSch())
	//			<< " act=" << utcToUtcString(s->getStartTimeLocAct())
	//			<< " " << utcToUtcString(s->getEndTimeLocAct())
	//			<< "  " << ((s->getEndTimeLocAct() - s->getStartTimeLocAct()) / 60)
	//			<< endl;
	//	}
	//	for (auto& node : duty->pairingDutyNodes) {
	//		cout << "**DBG node " << node->getNode()
	//			<< " " << utcToUtcString(node->getStartLoc())
	//			<< " " << utcToUtcString(node->getEndLoc())
	//			<< "  " << ((node->getEndLoc() - node->getStartLoc()) / 60)
	//			<< endl;
	//	}
	//	cout << "";
	//}
	long fdp = 0;
	vector<shared_ptr<PairingDutyNode>>& pairingDutyNodes = duty->pairingDutyNodes;
	bool nowSegIsHasNode = false;
	vector<Segment*> Segments = duty->getSegments();
	bool hasFDP = false;
	const bool useStickTime = RuleParams::GetInstancePtr()->bUseStickTime;
	const long minConnectionTimeSeconds = static_cast<long>(RuleParams::GetInstancePtr()->minConnectionTimeMinutes * 60);

	auto getStickDurationSeconds = [](Segment* seg) -> long {
		const long blkSeconds = seg->getBlkSeconds() > 0 ? seg->getBlkSeconds(): static_cast<long>(seg->getEndTimeUtcAct() - seg->getStartTimeUtcAct());
		return std::max<long>(0, blkSeconds);
	};

	auto getAssumedArrivalUtc = [&](Segment* seg) -> time_t {
		if (useStickTime) {
			time_t stdUtc = seg->getStartTimeUtcAct();
			return stdUtc + getStickDurationSeconds(seg);
		}
		return seg->getEndTimeUtcAct();
	};

	//检查是否包含FDP > 0 段
	for (std::size_t i = 0; i < Segments.size(); i++){
		map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
		if (segAssignment != dbData->assignmentNameMap.end() && segAssignment->second != nullptr && segAssignment->second->FDP_PCT > 0){
			hasFDP = true;
			break;
		}
	}
	if (!hasFDP){
		return 0;
	}
	//if (Segments[0]->getDBId() == 50438827) {
	//	cout <<  "";
	//}
	//计算Duty级dutyNode
	for (std::size_t i = 0; i < pairingDutyNodes.size(); i++){
		if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "BRIEF" && RuleParams::GetInstancePtr()->bIncludeCI){
			fdp += static_cast<long>(pairingDutyNodes[i]->getEndLoc() - pairingDutyNodes[i]->getStartLoc());
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DEBRIEF" && RuleParams::GetInstancePtr()->bIncludeCO){
			fdp += static_cast<long>(pairingDutyNodes[i]->getEndLoc() - pairingDutyNodes[i]->getStartLoc());
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "DROPOFF" && RuleParams::GetInstancePtr()->bDropoffCount){
			fdp += static_cast<long>(pairingDutyNodes[i]->getEndLoc() - pairingDutyNodes[i]->getStartLoc());
		}
		else if (pairingDutyNodes[i]->getType() == "DUTY" && pairingDutyNodes[i]->getNode() == "PICKUP" && RuleParams::GetInstancePtr()->bPickupCount){
			fdp += static_cast<long>(pairingDutyNodes[i]->getEndLoc() - pairingDutyNodes[i]->getStartLoc());
		}		
	}
	bool isLT2ndDHD = false;
	if (RuleParams::GetInstancePtr()->bIncludeLastDHD == false) {
		bool transitStart = false;
		isLT2ndDHD = true;
		for (int s = 0; s < (int)Segments.size() - 1; s++) {
			auto seg = Segments[s];
			auto nextseg = Segments[s + 1];
			if (transitStart == false) {
				long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(seg, nextseg);
				if (longTransit)
					transitStart = true;
			}

			if (transitStart) {
				if (nextseg->getIsOperating()) {
					isLT2ndDHD = false;
					break;
				}
			}
		}
		if (transitStart == false)
			isLT2ndDHD = false;
	}

	long longTransitStart = 0;
	long longTransitEnd = 0;
	//20210725 ain, mantis#9399, fdp统计 seg层级 node增加 type=SEGMENT判断
	//计算Seg级 DutyNode
	for (std::size_t j = 0; j < pairingDutyNodes.size(); j++){
		if (pairingDutyNodes[j]->getType() != "SEGMENT") {
			continue;
		}
		/*if (isLT2ndDHD)
			continue;*/
		bool nodeMatchSeg = false;
		for (std::size_t i = 0; i < Segments.size(); i++) {
			if (Segments[i]->getDBId() == pairingDutyNodes[j]->getToSegmentId())
				nodeMatchSeg = true;
		}
		if (nodeMatchSeg){
			nowSegIsHasNode = true;
			if (pairingDutyNodes[j]->getNode() == "BRIEF" && RuleParams::GetInstancePtr()->bIncludeLongTransitCI){
				fdp += static_cast<long>(pairingDutyNodes[j]->getEndLoc() - pairingDutyNodes[j]->getStartLoc());
			}
			else if (pairingDutyNodes[j]->getNode() == "DEBRIEF" && RuleParams::GetInstancePtr()->bIncludeLongTransitCO){
				fdp += static_cast<long>(pairingDutyNodes[j]->getEndLoc() - pairingDutyNodes[j]->getStartLoc());
			}
			else if (pairingDutyNodes[j]->getNode() == "DROPOFF" && RuleParams::GetInstancePtr()->bDropoffCount){
				fdp += static_cast<long>(pairingDutyNodes[j]->getEndLoc() - pairingDutyNodes[j]->getStartLoc());
			}
			else if (pairingDutyNodes[j]->getNode() == "PICKUP" && RuleParams::GetInstancePtr()->bPickupCount){
				fdp += static_cast<long>(pairingDutyNodes[j]->getEndLoc() - pairingDutyNodes[j]->getStartLoc());
			}

			///TEST
			//if (duty->getNumSegments() > 0 && duty->getSegment(0)->getDBId() == 61840835) {
			//	cout << "**DBG CustomBiz calculateDutyFdp fdp=" << fdp
			//		<< " seg.dutyNode=" << pairingDutyNodes[j]->getType()
			//		<< " toSegmentId=" << pairingDutyNodes[j]->getToSegmentId()
			//		<< " " << utcToUtcString(pairingDutyNodes[j]->getStartLoc())
			//		<< " " << utcToUtcString(pairingDutyNodes[j]->getEndLoc())
			//		<< endl;
			//}
		}
	}

	//遍历Seg
	for (int i = 0; i < (int)Segments.size(); i++) {
		bool preSeg = false, nowSeg = false;
		if (i > 0){
			map<string, SharedPtr<ASSIGNMENT>>::iterator sAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());
			if ((sAssignment != dbData->assignmentNameMap.end() && sAssignment->second->FDP_PCT > 0)
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bIncludeLastDHD&& Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostHSB && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData)))
			{
				nowSeg = true;
			}
			sAssignment = dbData->assignmentNameMap.find(Segments[i - 1]->getAssignment());
			if ((sAssignment != dbData->assignmentNameMap.end() && sAssignment->second->FDP_PCT > 0)
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY)
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround)
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay)
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i - 1]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB)
				//|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostHSB && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				) {
				preSeg = true;
			}
		}
		//尝试在 seg[i-1]和 seg[i]之间寻找 brief、debrief，用于后续判断是否应将seg间距加入FDP
		shared_ptr<PairingDutyNode> briefBetweenSeg;
		shared_ptr<PairingDutyNode> debriefBetweenSeg;
		if (i > 0) {
			for (auto& node : pairingDutyNodes) {
				if (node->getType() != "SEGMENT") {
					continue;
				}
				if (node->getNode() == "BRIEF" && node->getToSegmentId() == Segments[i]->getDBId()) {
					briefBetweenSeg = node;
				}
				if (node->getNode() == "DEBRIEF" && node->getFromSegmentId() == Segments[i - 1]->getDBId()) {
					debriefBetweenSeg = node;
				}
			}
		}
		//SEG之间的计算
		//1. 若包含duty间 brief、debrief，则按seg node累加fdp，seg间距不计入FDP
		//2. 若没有dutyNode，则按 2102判断是否长中转，若是则按2102计算brief/debrief加入FDP
		//3. 若不是长中转，则将seg间距加入
		if (briefBetweenSeg && debriefBetweenSeg) {
			if (RuleParams::GetInstancePtr()->bIncludeLongTransitBreak)
				fdp += static_cast<long>(briefBetweenSeg->getStartTimeUtcAct() - debriefBetweenSeg->getEndTimeUtcAct());
		}
		else if ((!briefBetweenSeg || !debriefBetweenSeg) && i != 0 && nowSeg && preSeg) {
			const auto prevAssignment = dbData->assignmentNameMap.find(Segments[i - 1]->getAssignment());
			const auto currAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());

			if (minConnectionTimeSeconds > 0) {
				long connection = static_cast<long>(Segments[i]->getStartTimeUtcAct() - getAssumedArrivalUtc(Segments[i - 1]));
				if (connection < 0) {
					connection = 0;
				}
				fdp += std::max(connection, minConnectionTimeSeconds);
			}
			else {
				long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(Segments[i - 1], Segments[i]);
				if (longTransit){
					//20201106 mantis#8973: 大过站FDP计算逻辑更正
					int blank = static_cast<int>(Segments[i]->getStartTimeUtcAct() - Segments[i - 1]->getEndTimeUtcAct());
					if (blank > (longTransit->pseudoCI + longTransit->pseudoCO + longTransit->pseudoDropoff + longTransit->pseudoPickup) * 60 ) {
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitCI) {
							fdp += longTransit->pseudoCI * 60;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitCO) {
							fdp += longTransit->pseudoCO * 60;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitDropoff) {
							fdp += longTransit->pseudoDropoff * 60;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitPickup) {
							fdp += longTransit->pseudoPickup * 60;
						}
						if (RuleParams::GetInstancePtr()->bIncludeLongTransitBreak) {
							fdp += blank - longTransit->pseudoCI * 60 - longTransit->pseudoCO * 60 
								- longTransit->pseudoDropoff * 60 - longTransit->pseudoPickup * 60;
						}
					}
					else {
						fdp += blank;
					}
					//20201103 mantis#8950 seg长中转需加上 ATD-STD
					fdp += static_cast<long>(Segments[i]->getStartTimeUtcAct() - Segments[i]->getStartTimeUtcSch());
				}	
				else {
					//20200917 ain, mantis#8766, seg之间不是长中转则全部算入fdp
					fdp += static_cast<long>(Segments[i]->getStartTimeUtcAct() - Segments[i - 1]->getEndTimeUtcAct());
				}
			}
		}
		
		//SEG自身
		nowSegIsHasNode = false;
		map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = dbData->assignmentNameMap.find(Segments[i]->getAssignment());	
		if (segAssignment == dbData->assignmentNameMap.end() || segAssignment->second->FDP_PCT == 0){
			/*if ((i == 0 && RuleParams::GetInstancePtr()->bPreFerryCount)
				|| (i == Segments.size() - 1 && RuleParams::GetInstancePtr()->bIncludeLastDHD)){*/
			if ((dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bIncludeLastDHD && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "FERRY") && RuleParams::GetInstancePtr()->bPreFerryCount && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePreSBY && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "CSB") && RuleParams::GetInstancePtr()->bIncludePostSBY && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePreGround && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "GND") && RuleParams::GetInstancePtr()->bIncludePostGround && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePreStay && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "STAY") && RuleParams::GetInstancePtr()->bIncludePostStay && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePreHSB && Utility::GetInstancePtr()->findAfterFdpSeg(i, duty, dbData))
				|| (dbData->isAssignmentInGroup(Segments[i]->getAssignment(), "HSB") && RuleParams::GetInstancePtr()->bIncludePostHSB && Utility::GetInstancePtr()->findBeforeFdpSeg(i, duty, dbData))) {
				
				long segmentSeconds = useStickTime ? getStickDurationSeconds(Segments[i]) : static_cast<long>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct());
				if (segmentSeconds <= 0) {
					segmentSeconds = static_cast<long>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct());
				}
				fdp += segmentSeconds;
			}
			continue;
		}
		double fdpPct = segAssignment->second->FDP_PCT;

		//20190924 ain, mantis#6777, 引入dutyNode后fdp计算不再需要CalculationManday[FDP], 直接用seg.act计算
		//fdp += Segments[i]->getEndTimeUtc(FDP.end) - Segments[i]->getStartTimeUtc(FDP.str);
		long segmentSeconds = useStickTime ? getStickDurationSeconds(Segments[i]) : static_cast<long>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct());
		if (segmentSeconds <= 0) {
			segmentSeconds = static_cast<long>(Segments[i]->getEndTimeUtcAct() - Segments[i]->getStartTimeUtcAct());
		}
		fdp += static_cast<long>(segmentSeconds * fdpPct);
	}
	
	//按照2107法规固定增加FIXED EXTENSTION设置值
	fdp += 60 * (RuleParams::GetInstancePtr()->iFixedValueToFDP) + 60 * (RuleParams::GetInstancePtr()->beforeFixValueToFDP);

	// only for TG, 比较transitTime和postActivityThreshold=30比较，如果小于30分钟，fdp减去俩者的差
	if (RuleParams::GetInstancePtr()->postActivityThreshold > 0) {

		const auto & lastFdpSegment = duty->getLastFdpSegment();
		if (lastFdpSegment) {
			size_t segmentIdAfterFDP = std::numeric_limits<size_t>::max();
			for (size_t i = 0; i < duty->getSegmentsRead().size(); ++i) {
				const auto& segment = duty->getSegment(i);
				if (segment == lastFdpSegment && i != duty->getSegmentsRead().size() - 1) {
					segmentIdAfterFDP = i + 1;
					break;
				}
			}
			if (segmentIdAfterFDP < std::numeric_limits<size_t>::max()) {
				const auto transitTime = duty->getSegment(segmentIdAfterFDP)->getStartTimeUtc("ACT") - lastFdpSegment->getEndTimeUtc("ACT");
				fdp += std::min((long)transitTime, static_cast<long>(RuleParams::GetInstancePtr()->postActivityThreshold * 60));
			}
		}
	}
	return fdp;
}

long calculateDP(Duty* duty, CrewDataContext* dbData) {
	long dp = 0;
	auto& dpDefinition = RuleParams::GetInstancePtr()->getDPDefinition();
	if (!dpDefinition.dpAssignments.empty()) {
		for (const auto& seg : duty->getSegmentsRead()) {
			if (dpDefinition.matchSegment(seg)) {
				dp += static_cast<long>(seg->getBlkMinutes() * 60 * dpDefinition.dpPct);
			}
		}
	}
	return dp;
}

void calculatePairingDutyTimes(Duty* duty, CrewDataContext* dbData) {

	if (!duty || !dbData) {
		return;//20190605 ain, mantis#5886, 增加参数保护
	}
	if (duty->isDutyTimesCalculated)
		return;

	time_t fdpStart = 0, fdpEnd = 0, dpStart = 0, dpEnd = 0, ftStart = 0, ftEnd = 0, bhStart = 0, bhEnd = 0;
	time_t act_fdpStart = 0, act_fdpEnd = 0, act_dpStart = 0, act_dpEnd = 0;
	time_t sch_fdpStart = 0, sch_fdpEnd = 0, sch_dpStart = 0, sch_dpEnd = 0;

	//从 duty.pairing_id定位 pairing对象
	Pairing* pairing = NULL;
	if (dbData->pairingIdMap.find(duty->getPairingId()) != dbData->pairingIdMap.end()) {
		pairing = dbData->pairingIdMap[duty->getPairingId()];
	}
	string pairingAssignment = pairing ? pairing->getQualifier() : "FLY";
	int iBHAdj = pairing ? pairing->getBlockMinsAdjustment() * 60 : 0;
	
	CalculationManday FDP = dbData->getCalculationManday("FDP");
	CalculationManday ACT_FDP = dbData->getCalculationManday("ACT FDP");
	CalculationManday DP = dbData->getCalculationManday("DP");
	CalculationManday ACT_DP = dbData->getCalculationManday("ACT DP");
	CalculationManday BLH = dbData->getCalculationManday("BLH");
	CalculationManday ACT_BLH = dbData->getCalculationManday("ACT BLH");
	CalculationManday FT = dbData->getCalculationManday("FT");
	//vector<SharedPtr<mandayTimes>> result;
	map<string, SharedPtr<ASSIGNMENT>>::iterator dbPairingAssignment = dbData->assignmentNameMap.find(pairingAssignment);
	//string base = pairing->getBase();
	//20190530 ain, mantis#5804, 移除冗余逻辑, 避免 null except
	//int dutiesSize = pairing->getNumDuties();

	//op#2246 计算seg pickup dropoff
	for (auto s : duty->getSegments()){
		RuleParams::GetInstancePtr()->calculateSegPickUpAndDropOff(s,&dbData->airportList);
		if (s->getSplitDutyPickUpMin() != 0 && s->getSplitDutyDropOffMin() != 0) {
			duty->setSpiltDutyPickUpMin(s->getSplitDutyPickUpMin());
			duty->setSpiltDutyDropOffMin(s->getSplitDutyDropOffMin());
		}
	}
	//BLH / ACT_BLH
	if (BLH.str.size() <= 0)
		duty->calculateDutyBlockTime(0, "SCH", "SCH");
	else
		duty->calculateDutyBlockTime(0, BLH.str, BLH.end);
	if (ACT_BLH.str.size() <= 0)
		duty->calculateDutyBlockTime(1, "ACT", "ACT");
	else
		duty->calculateDutyBlockTime(1, ACT_BLH.str, ACT_BLH.end);

	duty->calculateDutySchBlockTime();

	//segment != FLY时 dp_end忽略debrief, 按末尾segment.end
	Segment* lastSegment = duty->getLastSegment();
	//if (lastSegment && lastSegment->getAssignment() != "FLY" && lastSegment->getAssignment() != "OPR") {
	//	dpEnd = lastSegment->getEndTimeUtc(DP.end);
	//	act_dpEnd = lastSegment->getEndTimeUtc(ACT_DP.end);
	//}
	//else {
	sch_dpEnd = duty->getDPSchEndUtcTimes();
	act_dpEnd = duty->getEndTimeUtc(ACT_DP.end);
	dpEnd = duty->getEndTimeUtc(DP.end);


	//}
	//根据rule 2107计算 fdp.start/end
	//fdp/dp start
	fdpStart = duty->getFDPStartUtcTimes(FDP.str);
	act_fdpStart = duty->getFDPStartUtcTimes(ACT_FDP.str);
	sch_fdpStart = duty->getFDPSchStartUtcTimes();
	dpStart = duty->getStartTimeUtc(DP.str);
	act_dpStart = duty->getStartTimeUtc(ACT_DP.str);
	sch_dpStart = duty->getDPSchStartUtcTimes();
	
	//fdp end
	if (dbData->scenario.airline != "BR")
	{
		fdpEnd = duty->getFDPEndMinusLongRestUtcTimes(FDP.end);
		act_fdpEnd = duty->getFDPEndMinusLongRestUtcTimes(ACT_FDP.end);
		if (fdpEnd <= 0)
			fdpEnd = fdpStart;
		if (act_fdpEnd <= 0)
			act_fdpEnd = act_fdpStart;
		if (sch_fdpEnd <= 0)
			sch_fdpEnd = sch_fdpStart;
	}
	else {
		Segment* lastFly = duty->getLastFlySegment();
		if (lastFly)
		{
			fdpEnd = lastFly->getEndTimeUtc(FDP.end);
			act_fdpEnd = lastFly->getEndTimeUtc(ACT_FDP.end);
			sch_fdpEnd = lastFly->getEndTimeUtc("SCH");
		}
		else
		{
			fdpEnd = fdpStart;
			act_fdpEnd = act_fdpStart;
			sch_fdpEnd = sch_fdpStart;
		}
	}


	//FDP/ACT_FDP
	double fdpPct = (dbPairingAssignment != dbData->assignmentNameMap.end()) && dbPairingAssignment->second != nullptr ? dbPairingAssignment->second->FDP_PCT : 1;
	if (fdpStart < fdpEnd)
	{
		long fdp = static_cast<long>((fdpEnd - fdpStart) * fdpPct);
		duty->setFDPInSecs(fdp);
	}
	if (dbData->scenario.airline != "BR")
	{
		long fdp = calculateDutyFdp(duty, dbData,FDP);
		duty->setFDPInSecs(fdp);
	}
	if (act_fdpStart < act_fdpEnd)
	{
		long fdp = static_cast<long>((act_fdpEnd - act_fdpStart) * fdpPct);
		duty->setActualFDP(fdp / 60);
	}
	if (dbData->scenario.airline != "BR")
	{
		long fdp = calculateDutyFdp(duty, dbData, ACT_FDP);
		duty->setActualFDP(fdp / 60);
	}
	if (sch_fdpStart < sch_fdpEnd)
	{
		long sch_fdp = static_cast<long>((sch_fdpEnd - sch_fdpStart) * fdpPct);
		duty->setScheduleFDP(sch_fdp / 60);
	}

	//DP/ACT_DP
	double dpPct = (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->DP_PCT : 1;
	int dpGap = 0;
	int beforePctDpGap = (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->before_pct_dp_gap * 60 : 0;
	int afterPctDpGap = (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->after_pct_dp_gap * 60 : 0;
	int dpAdjust = calculateDP(duty, dbData);
	for (const auto& seg : duty->getSegmentsRead()) {
		const auto & dbSegAssignment = dbData->assignmentNameMap.find(seg->getAssignment());
		if (dbSegAssignment == dbData->assignmentNameMap.end())
			continue;

		if (Utility::GetInstancePtr()->checkCoverdDPGapTimeRange(seg->getStartTimeLocAct(), seg->getEndTimeLocAct(), dbData)) {
			dpGap += dbSegAssignment->second->DP_GAP;
		}
	}
	if (dpStart < dpEnd)
	{
		long dp = static_cast<long>((dpEnd - dpStart + beforePctDpGap) * dpPct) + dpGap * 60 + afterPctDpGap + dpAdjust;
		duty->setDPInSecs(dp);
	}
	
	if (act_dpStart < act_dpEnd)
	{
		long dp = static_cast<long>((act_dpEnd - act_dpStart + beforePctDpGap) * dpPct) + dpGap * 60 + afterPctDpGap + dpAdjust;
		duty->setActualDP(dp / 60);
	}

	if (sch_dpStart < sch_dpEnd)
	{
		long dp = static_cast<long>((sch_dpEnd - sch_dpStart + beforePctDpGap) * dpPct) + dpGap * 60 + afterPctDpGap + dpAdjust;
		duty->setScheduleDP(dp / 60);
	}
}

