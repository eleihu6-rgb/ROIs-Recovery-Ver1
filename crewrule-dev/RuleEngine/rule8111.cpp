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


bool  LegalityChecker::checkMaxStudentInflight(RULE_LEGALITY * pCrew, const DBRule* singleRule){
	
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;
	string fleets, minComp, maxComp, comments;
	int minLimit = 0, maxLimit = 999;
	vector<string> commentVec,fleetVec;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "FLEETS"){
			fleets = headeValue;
			split(fleets, '|', fleetVec);
		}
		else if (header == "MINCOMP"){
			minComp = headeValue;
			minLimit = stoi(minComp);
		}
		else if (header == "MAXCOMP"){
			maxComp = headeValue;
			maxLimit = stoi(maxComp);
		}
		else if (header == "COMMENTS"){
			comments = headeValue;
			split(comments, '|', commentVec);
		}
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	for (auto roster : rosters){
		if (roster->pairId == 0)continue;
		Pairing* p = roster->pairing;
		string fleet = p->getFirstSegment()->getFleetCD();
		long long segmentId = p->getFirstSegment()->getDBId();
		if (fleetVec[0] != "*" && find(fleetVec.begin(), fleetVec.end(), fleet) == fleetVec.end()){
			continue;
		}
		int count = 0;
		vector<SharedPtr<RosterFlight>> rfs = this->_dbData->rosterFlightMgr.get(segmentId);
		vector<string>  rfcomments;
		for (auto rf : rfs){
			split(rf->comments, '|', rfcomments);
			for (auto com : rfcomments){
				string comtemp = getStringByFilterDigit(com);
				if (find(commentVec.begin(), commentVec.end(), com) != commentVec.end()){
					count++;
				}
			}
		}
		if (count <= maxLimit - minLimit){

			string msg = "The quantity ({0:count}) is not within the allowed range of {1:minLimit} to {2:maxLimit}.";
			msg = StringUtils::Format(msg, count, minLimit, maxLimit);

			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			rv->rosterId = roster->rosterId;
			rv->startDTUtc = roster->getStartTimeUtcAct();
			rv->endDTUtc = roster->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			rv->violation_msg = msg;
			this->addRuleViolations(rv, singleRule);
			return false;
		}
	}

	return true;
}

bool  LegalityChecker::checkMaxStudentInflight_ro(SharedPtr<CREW>& crew, Pairing* p, string comments){
	const vector<DBRule>& dutyBuilder = this->_dbData->getRuleFunctions(RULES::MAX_STUDENT_IN_FLIGHT);
	for (std::size_t j = 0; j < dutyBuilder.size(); j++){

		auto& parameter = dutyBuilder[j].params;
		map<string, string>::const_iterator iter;
		string header, headeValue;
		string fleets, minComp, maxComp;
		int minLimit = 0, maxLimit = 999;
		vector<string> commentVec, fleetVec;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			if (header == "FLEETS"){
				fleets = headeValue;
				split(fleets, '|', fleetVec);
			}
			else if (header == "MINCOMP"){
				minComp = headeValue;
				minLimit = stoi(minComp);
			}
			else if (header == "MAXCOMP"){
				maxComp = headeValue;
				maxLimit = stoi(maxComp);
			}
			else if (header == "COMMENTS"){
				split(headeValue, '|', commentVec);
			}
		}
		if (!p)return false;
		string fleet = p->getFirstSegment()->getFleetCD();
		long long segmentId = p->getFirstSegment()->getDBId();
		if (fleetVec[0] != "*" && find(fleetVec.begin(), fleetVec.end(), fleet) == fleetVec.end()){
			continue;
		}
		int count = 0;
		vector<SharedPtr<RosterFlight>> rfs = this->_dbData->rosterFlightMgr.get(segmentId);
		vector<string>  rfcomments;
		//先统计传入comments的计数
		split(comments, '|', rfcomments);
		for (auto com : rfcomments){
			string comtemp = getStringByFilterDigit(com);
			if (find(commentVec.begin(), commentVec.end(), comtemp) != commentVec.end()){
				count++;
			}
		}
		//统计所有rf上的comments计数
		for (auto rf : rfs){		
			vector<string>  commentsTemp;
			split(rf->comments, '|', commentsTemp);
			for (auto com : commentsTemp){
				string comtemp = getStringByFilterDigit(com);
				if (find(commentVec.begin(), commentVec.end(), comtemp) != commentVec.end()){
					count++;
				}
			}
		}
		if (count < maxLimit - minLimit){
			return false;
		}
	}
	return true;
}