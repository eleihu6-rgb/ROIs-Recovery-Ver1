#pragma once

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
#include "utils/StringUtils.h"

//8114
bool LegalityChecker::checkCrewRankFleetSpecial(RULE_LEGALITY * pCrew, const DBRule* singleRule){
	bool bReturn = true;
	if (pCrew->crewIndex < 0 || pCrew->crewIndex >= (int)_dbData->crewList.size())
		return true;
	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	string header, headeValue;
	string fleetSpecific;
	vector<string> activeRankVec, actingRankVec, assignmentGroupVec, flightFleetVec, fleetGroupVec;
	rule8114* cache = (rule8114*)singleRule->parsedParam.get();
	activeRankVec = cache->activeRankVec;
	actingRankVec = cache->actingRankVec;
	assignmentGroupVec = cache->assignmentGroupVec;
	flightFleetVec = cache->flightFleetVec;
	fleetSpecific = cache->fleetSpecific;
	vector<SharedPtr<CREW_FLEET>> fleets = crew->fleetList;
	vector<SharedPtr<CREW_RANK>> ranks = crew->rankList;
	vector<SharedPtr<ROSTER>>  rosters = crew->rosterList;
	long long expTime = 0;

	for (std::size_t i = 0; i < rosters.size(); i++){
		//RO优化，只检查与pCrew对应的分配（也就是新分配）
		if(this->_application == ROSTER_OPTIMIZER && rosters[i]->pairId != this->_dbData->pairingList[pCrew->PairingIndex]->getDbId())
			continue;
		
		time_t roster_start = rosters[i]->actStrUtc;
		time_t roster_end = rosters[i]->actRestStrUtc;
		string activeRank = "NULL";
		string rank = rosters[i]->actingRank;
		bool bFoundRank = false;
		//判断 activeRank与actingRank是否合法
		for (vector<SharedPtr<CREW_RANK>>::iterator iter = ranks.begin(); iter != ranks.end(); ++iter)
		{
			if ((*iter)->expUtc < 0 || (*iter)->expUtc == NULL)
			{
				expTime = time(NULL) + 2 * 365 * 24 * 60 * 60;
			}
			else
				expTime = (*iter)->expUtc;

			if ((*iter)->effUtc <= roster_start && expTime > rosters[i]->actRestStrUtc)
			{
				activeRank = (*iter)->rank;
				bool isDown = Utility::GetInstancePtr()->isDownRankInScenario(activeRank, rank, activeRankVec, actingRankVec);
				if (isDown)
				{
					bFoundRank = true;
					break;
				}
			}
		}
		//不合法进行下一个roster的rank判断
		if (!bFoundRank)continue;
		bool isTureAssignmentGroup = false;

		if (!rosters[i]->pairing){
			continue;
		}
		for (std::size_t m = 0; m < rosters[i]->pairing->getNumDuties(); m++){
			Duty* duty = rosters[i]->pairing->getDuty(m);
			for (std::size_t j = 0; j < duty->getNumSegments(); j++){
				Segment* seg = duty->getSegment(j);
				string fleet = seg->getFleetCD();
				SharedPtr<RosterFlight> rf = this->_dbData->rosterFlightMgr.get(seg->getDBId(), rosters[i]->idcrew);
				if (rf != NULL){
					vector <string> v1, v2, v3;
					split(rf->tsFlag, '|', v1);
					split(cache->exceptionCode, '|', v2);
					v3.insert(v3.end(), v2.begin(), v2.end());
					v3.insert(v3.end(), v1.begin(), v1.end());	
					stable_sort(v3.begin(), v3.end());
					int n = static_cast<int>(unique(v3.begin(), v3.end()) - v3.begin());
					if (n != v3.size() && v1[0] != "" && v2[0] != ""){
						continue;
					}
				}
				if (std::find(flightFleetVec.begin(), flightFleetVec.end(), fleet) == flightFleetVec.end()){
					continue;
				}
				for (std::size_t k = 0; k < assignmentGroupVec.size(); k++){
					if (this->_dbData->isAssignmentInGroup(seg->getAssignment(), assignmentGroupVec[k])){
						isTureAssignmentGroup = true;
						break;
					}
				}
				if (!isTureAssignmentGroup)continue;
				string acType = this->_dbData->fleetMap[seg->getFleetCD()].acType;
				bReturn = false;
				for (std::size_t k = 0; k < ranks.size(); k++){
					if (ranks[k]->acType == acType
						&&seg->getStartTimeUtcAct() >= ranks[k]->effUtc
						&&seg->getEndTimeUtcAct() <= ranks[k]->expUtc){
						fleetGroupVec.clear();
						split(ranks[k]->fleetGroup, fleetGroupVec, "|");
						if (std::find(fleetGroupVec.begin(), fleetGroupVec.end(), fleetSpecific) != fleetGroupVec.end()){
							bReturn = true;
							break;
						}
					}
				}
				
				if (!bReturn){
					string errorMsg = "Segment ID: {0:segmentId} - fleet does not match.";
					errorMsg = StringUtils::Format(errorMsg, seg->getDBId());

					this->setLegalityMessage(seg, singleRule, errorMsg);

					//RO优化，在pCrew里记录isLegal的结果
					if (this->_application == ROSTER_OPTIMIZER)
						pCrew->isLegal = false;

					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = rosters[i]->idcrew;
					rv->rosterId = rosters[i]->rosterId;
					rv->pairingId = rosters[i]->pairId;
					rv->segmentId = seg->getDBId();
					rv->startDTUtc = seg->getStartTimeUtcAct();
					rv->endDTUtc = seg->getEndTimeUtcAct();
					rv->violation_msg = errorMsg;
					rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
					rv->operation_result.insert(pair<string, string>("crewId", rosters[i]->idcrew));
					rv->operation_result.insert(pair<string, string>("label", rosters[i]->label));
					rv->operation_result.insert(pair<string, string>("fleetSpecific", fleetSpecific));
					this->addRuleViolations(rv, singleRule);
				}

			}
		}
	}

	return bReturn;
}
