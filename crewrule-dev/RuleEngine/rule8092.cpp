#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/StringUtils.h"

//8092
//PARAM crewId 空("")表示不检查, 用于避免重复计算
bool LegalityChecker::checkExpatCrewCombinationRestriction(Pairing * pg, const DBRule* singleRule, string crewAId){
	bool bReturn = true;
	if (!pg){
		return true;
	}

	if (pg->getSegments().empty())
		return true;
	//SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	string FlightAssignment,alertMessage;
	vector<string> CrewANalitiesVec, CrewABaseVec, CrewARanksVec, CrewAFleetVec, CrewAActingRankVec, CrewATeamVec,
	CrewBNalitiesVec, CrewBBaseVec, CrewBRanksVec, CrewBFleetVec, CrewBQualificationVec, CrewBTeamVec,
		FlightAssignmentVec,CrewAAgeVec,CrewBAgeVec, AttributesVec;
	int MinLimits, MaxLimits;
	rule8092* cache = (rule8092*)singleRule->parsedParam.get();
	CrewANalitiesVec = cache->CrewANalitiesVec;
	CrewABaseVec = cache->CrewABaseVec;
	CrewAAgeVec = cache->CrewAAgeVec;
	CrewARanksVec = cache->CrewARanksVec;
	CrewAFleetVec = cache->CrewAFleetVec;
	CrewAActingRankVec = cache->CrewAActingRankVec;
	CrewATeamVec = cache->CrewATeamVec;
	CrewBNalitiesVec = cache->CrewBNalitiesVec;
	CrewBBaseVec = cache->CrewBBaseVec;
	CrewBAgeVec = cache->CrewBAgeVec;
	CrewBRanksVec = cache->CrewBRanksVec;
	CrewBFleetVec = cache->CrewBFleetVec;
	CrewBQualificationVec = cache->CrewBQualificationVec;
	CrewBTeamVec = cache->CrewBTeamVec;
	MinLimits = cache->MinLimits;
	MaxLimits = cache->MaxLimits;
	FlightAssignmentVec = cache->FlightAssignmentVec;
	alertMessage = cache->alertMessage;
	AttributesVec = cache->AttributesVec;
	if (!AttributesVec.empty() && AttributesVec[0] != "*" && !AttributesVec[0].empty()) {
		if (!Utility::GetInstancePtr()->isPairingMatchAttributes(pg->getAttribute(), AttributesVec))
			return true;
	}
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (std::size_t i = 0; i < pg->getSegments().size(); i++){
		//对于当前flight是否违规的判断
		bool isFLightCheck = true;
		Segment* seg = pg->getSegment(i);
		vector<SharedPtr<CrewOnFlight>>& crewOnFlt = this->_dbData->crewOnFlt[seg->getDBId()];
		int cftSize = 0;
		for (auto cft : crewOnFlt){
			if (FlightAssignmentVec[0] == "*" || find(FlightAssignmentVec.begin(), FlightAssignmentVec.end(), cft->assignment) != FlightAssignmentVec.end()){
				cftSize++;
			}
		}
		if (cftSize <= 1)continue;
		for (std::size_t j = 0; j < crewOnFlt.size(); j++){
			//筛选crewA
			if (crewAId != "" && crewOnFlt[j]->crewId
				!= crewAId) {
				continue;
			}

			string crewAactingRank, crewABase;
			//找到当前pairing在该crew下的roster 获取参数
			SharedPtr<CREW> crew = crewOnFlt[j]->crew;
			crewAactingRank = crewOnFlt[j]->actingRank;
			for (auto roster : crew->rosterList){
				if (roster->pairId == pg->getDbId()){
					crewABase = roster->getBase();
					break;
				}
			}
			//Crew A check
			string assignment = seg->getAssignment();
			//20191216 ain, mantis#7297, 若crewRank在日期范围无定义则按 rank="", 触发不匹配
			auto crewRankA = crew->getActiveRankInTimes(seg->getStartTimeUtcAct(), seg->getEndTimeUtcAct());
			string rankA = (crewRankA ? crewRankA->rank : "");
			string nationality = crew->nationality;
			if (FlightAssignmentVec[0] != "*" && find(FlightAssignmentVec.begin(), FlightAssignmentVec.end(), assignment) == FlightAssignmentVec.end()){
				continue;
			}
			if (CrewANalitiesVec[0] != "*" && find(CrewANalitiesVec.begin(), CrewANalitiesVec.end(), nationality) == CrewANalitiesVec.end()){
				continue;
			}
			if (CrewABaseVec[0] != "*" && find(CrewABaseVec.begin(), CrewABaseVec.end(), crewABase) == CrewABaseVec.end()){
				continue;
			}
			if (CrewAActingRankVec[0] != "*" && find(CrewAActingRankVec.begin(), CrewAActingRankVec.end(), crewAactingRank) == CrewAActingRankVec.end()){
				continue;
			}
			if (CrewARanksVec[0] != "*" && find(CrewARanksVec.begin(), CrewARanksVec.end(), rankA) == CrewARanksVec.end()){
				continue;
			}
			if (CrewAFleetVec[0] != "*" && find(CrewAFleetVec.begin(), CrewAFleetVec.end(), seg->getAssignment()) == CrewAFleetVec.end()){
				continue;
			}
			if (CrewATeamVec[0] != "*" && !CrewATeamVec[0].empty()) {
				bool matched = false;
				for (const auto & team : crew->teamList) {
					if (
						(team->effDt < pg->getEndTimeLocAct())
						&&
						(team->expDt < 0 || team->expDt > pg->getStartTimeLocAct())
						)
					{
						if (find(CrewATeamVec.begin(), CrewATeamVec.end(), team->teamName) != CrewATeamVec.end())
						{
							matched = true;
							break;
						}
					}
				}
				if (!matched) continue;
			}
			
			//20190819 ain, 8092提高健壮性, crew.rosterList为空时按dbData.start计算年纪
			time_t crewAgeDatetime = crew->rosterList.empty() ? this->_dbData->startUtc : crew->rosterList[0]->getStartTimeUtcAct();
			int CrewAAge = (int)crew->getAgeByTime(crewAgeDatetime);
			if (CrewAAgeVec[0] != "*" && (CrewAAge<stoi(CrewAAgeVec[0]) || (CrewAAgeVec.size() > 1 && CrewAAge>stoi(CrewAAgeVec[1])))){
				continue;
			}
			int numberOfPlanned = 0, numberOfFilled = 0, numberOfQualified = 0;
			auto& plans = seg->getPlanComposition();
			bool isCabin = (crew->division != "P");
			if (CrewBRanksVec[0] == "*")
			{
				for (auto singleCom = plans.begin(); singleCom != plans.end(); ++singleCom)
				{
					if (isCabin == RuleParams::GetInstancePtr()->isCabinRank((*singleCom).first))
						numberOfPlanned += (*singleCom).second;
				}
			}
			else
			{
				for (vector<string>::iterator rank = CrewBRanksVec.begin(); rank != CrewBRanksVec.end(); ++rank)
				{
					auto plan = plans.find((*rank));
					if (plan != plans.end())
					{
						numberOfPlanned += (*plan).second;
					}
				}
			}
			//20190916 yuankai.cai mantis#6629 新增对于组员执行任务类型的筛选
			if (FlightAssignmentVec[0] != "*" && find(FlightAssignmentVec.begin(), FlightAssignmentVec.end(), crewOnFlt[j]->assignment) == FlightAssignmentVec.end()){
				continue;
			}
			for (std::size_t k = 0; k < crewOnFlt.size(); k++){
				SharedPtr<CREW> crewB = crewOnFlt[k]->crew;
				//20191216 ain, mantis#7297, crewRank在日期范围无定义则按 rank="", 触发后续逻辑不匹配
				auto crewRankB = crewB->getActiveRankInTimes(seg->getStartTimeUtcAct(), seg->getEndTimeUtcAct());
				string rankB = (crewRankB ? crewRankB->rank : "");
				if (CrewBRanksVec[0] != "*" && find(CrewBRanksVec.begin(), CrewBRanksVec.end(), rankB) == CrewBRanksVec.end()){
					continue;
				}
				//20190916 yuankai.cai mantis#6629 新增对于组员执行任务类型的筛选
				if (FlightAssignmentVec[0] != "*" && find(FlightAssignmentVec.begin(), FlightAssignmentVec.end(), crewOnFlt[k]->assignment) == FlightAssignmentVec.end()){
					continue;
				}
				numberOfFilled++;
				if (crewB->idCrew == crew->idCrew)continue;
				//crew B check
				if (CrewBNalitiesVec[0] != "*" && find(CrewBNalitiesVec.begin(), CrewBNalitiesVec.end(), crewB->nationality) == CrewBNalitiesVec.end()){
					continue;
				}
				string crewBBase;
				for (auto roster : crewB->rosterList){
					if (roster->pairId == pg->getDbId()){
						crewBBase = roster->getBase();
						break;
					}
				}
				if (CrewBBaseVec[0] != "*" && find(CrewBBaseVec.begin(), CrewBBaseVec.end(), crewBBase) == CrewBBaseVec.end()){
					continue;
				}

				if (CrewBTeamVec[0] != "*" && !CrewBTeamVec[0].empty()) {
					bool matched = false;
					for (const auto & team : crewB->teamList) {
						if (
							(team->effDt < pg->getEndTimeLocAct())
							&&
							(team->expDt < 0 || team->expDt > pg->getStartTimeLocAct())
							)
						{
							if (find(CrewBTeamVec.begin(), CrewBTeamVec.end(), team->teamName) != CrewBTeamVec.end())
							{
								matched = true;
								break;
							}
						}
					}
					if (!matched) continue;
				}
				
				//20190819 ain, 提高健壮性, crew.rosterList为空时按dbData.start计算年纪
				time_t crewBAgeDatetime = crewB->rosterList.empty() ? this->_dbData->startUtc : crewB->rosterList[0]->getStartTimeUtcAct();
				int CrewBAge = (int)crewB->getAgeByTime(crewBAgeDatetime);
				if (CrewBAgeVec[0] != "*" && (CrewBAge<stoi(CrewBAgeVec[0]) || (CrewBAgeVec.size() > 1 && CrewBAge>stoi(CrewBAgeVec[1])))){
					continue;
				}

				//20200829 ain, mantis#8682, 8092 qual匹配逻辑需考虑 eff/exp
				bool isQual = true;
				if (CrewBQualificationVec.empty() || 
					CrewBQualificationVec[0] == "*" || 
					CrewBQualificationVec[0] == "") {
					//no need check
				}
				else {
					for (auto& qual : CrewBQualificationVec) {
						bool hasQual = Utility::GetInstancePtr()->isCrewHasQual(crewB, qual, pg->getStartTimeUtcAct(), pg->getEndTimeUtcAct(), crewOnFlt[k]->assignment, qualExtensionConfigsForQualMap);
						if (!hasQual) {
							isQual = false;
							break;
						}
					}
				}

				if (isQual){
					numberOfQualified++;
				}
			}
			string errorMsg;
			if (this->GetApplication() == ROSTER_OPTIMIZER 
				&& (numberOfPlanned - numberOfFilled + numberOfQualified) > MinLimits
				&& numberOfQualified < MaxLimits){
				return true;
			}
			if (numberOfQualified < MinLimits){
				errorMsg = "Segment ID: {0:segmentId} - the number of qualified crew members ({1:numberOfQualified}) is less than the minimum requirement of {2:MinLimits}.";
				errorMsg = StringUtils::Format(errorMsg, seg->getDBId(), numberOfQualified, MinLimits);

				isFLightCheck = false;
				bReturn = false;
			}
			if (numberOfQualified > MaxLimits){
				errorMsg = "Segment ID: {0:segmentId} - the number of qualified crew members ({1:numberOfQualified}) exceed the maximum limit of {2:MaxLimits}.";
				errorMsg = StringUtils::Format(errorMsg, seg->getDBId(), numberOfQualified, MaxLimits);
				isFLightCheck = false;
				bReturn = false;
			}
			if (!isFLightCheck){
				for (std::size_t k = 0; k < crewOnFlt.size(); k++){
					SharedPtr<CREW> crewB = crewOnFlt[k]->crew;
					if (crewB->idCrew == crew->idCrew)continue;

					//20210617 kaiwen.ni mantis#9358 新增对于组员执行任务类型的筛选
					if (FlightAssignmentVec[0] != "*" && find(FlightAssignmentVec.begin(), FlightAssignmentVec.end(), crewOnFlt[k]->assignment) == FlightAssignmentVec.end()) {
						continue;
					}

					this->setLegalityMessage(seg, singleRule, errorMsg);

					RULE_VIOLATION* rv = new RULE_VIOLATION();
					//rv->crewId = crewB->idCrew;
					rv->crewId = crew->idCrew;
					rv->pairingId = pg->getDbId();
					rv->segmentId = seg->getDBId();
					rv->startDTUtc = seg->getStartTimeUtcAct();
					rv->endDTUtc = seg->getEndTimeUtcAct();
					rv->violation_msg = errorMsg;
					rv->operation_result.insert(pair<string, string>("alertMessage", alertMessage));
					rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
					this->addRuleViolations(rv, singleRule);
				}
			}
		}

	}


	return bReturn;
	
};