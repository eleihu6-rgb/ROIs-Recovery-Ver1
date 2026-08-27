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

/*
   该法规已经专门适用EVA客户，其他客户采用产品标准功能和法规，8122
*/

bool LegalityChecker::checkCrewFlyTogether(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue, fltAssignments;
	bool isEnable = false;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "CREW FLY TOGETHER")
			isEnable = (headeValue == "Y");
		if (header == "FLIGHT ASSIGNMENTS")
			fltAssignments = headeValue;
	}

	if (!isEnable)
		return bReturn;
	
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	//vector<SharedPtr<CREW_BASE>> bases = crew->baseList;
	//vector<SharedPtr<CREW_RANK>> ranks = crew->rankList;
	vector<SharedPtr<CREW_PREFERENCE>>& preferences = crew->preferenceList;
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& cofs = this->_dbData->crewOnFlt;

	int offsetMinutes = this->_dbData->getCrewBaseOffsetMinutes(crew->idCrew, this->_dbData->scenario.startDtUTC);

	string crewId = crew->idCrew;

	if (rosters.size() == 0)
		return true;
	vector<string> strAssignments;
	split(fltAssignments, '|', strAssignments);
	time_t lCheckedStart = 0, lCheckedEnd = 0, rosterStart, rosterEnd;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	vector<string> relatedCrews;
	vector<Duty *> duties;
	vector<Segment*> segments;
	vector<SharedPtr<CrewOnFlight>> crews;
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>::iterator crews_it;
	vector<string>::iterator related;
	long long fltId;

	vector<SharedPtr<CREW_PREFERENCE>> tempPrefs;
	for (vector<SharedPtr<CREW_PREFERENCE>>::iterator preference = preferences.begin(); preference != preferences.end(); ++preference)
	{
		if ((*preference)->prefType == "NO_FLY_TOGETHER" || (*preference)->prefType == "FLY_TOGETHER")
		{
			tempPrefs.push_back((*preference));
		}
	}

	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
		if ((this->_application == ROSTER_OPTIMIZER) && (!((*roster)->needRuleCheck) || (*roster)->source != "CR"))
			continue;
		if (!(*roster)->pairing)
			continue;
		rosterStart = (*roster)->actStrUtc;
		rosterEnd = (*roster)->restStrUtc;

		if (!(Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, rosterStart, rosterEnd)))
			continue;

		for (vector<SharedPtr<CREW_PREFERENCE>>::iterator preference = tempPrefs.begin(); preference != tempPrefs.end(); ++preference)
		{
			//if ((*preference)->prefType != "NO_FLY_TOGETHER" && (*preference)->prefType != "FLY_TOGETHER")
			//	continue;
			if (!(Utility::GetInstancePtr()->isTimeOverlap((*preference)->strDtloc - offsetMinutes * 60, (*preference)->endDtLoc - offsetMinutes * 60 + 24 * 3600 - 1, rosterStart, rosterEnd)))
				continue;

			relatedCrews = (*preference)->relatedCrewIds;

			duties = (*roster)->pairing->getDutyVec();

			for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
			{
				segments = (*duty)->getSegments();
				for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
				{
					string fltAssignment = (*segment)->getAssignment();

					if (fltAssignments != "*")
						if (std::find(strAssignments.begin(), strAssignments.end(), fltAssignment) == strAssignments.end())
							continue;

					fltId = (*segment)->getDBId();

					crews_it = cofs.find(fltId);
					if (crews_it != cofs.end())
					{
						crews = (*crews_it).second;
						for (vector<SharedPtr<CrewOnFlight>>::iterator singleCrew = crews.begin(); singleCrew != crews.end(); ++singleCrew)
						{
							related = std::find(relatedCrews.begin(), relatedCrews.end(), (*singleCrew)->crewId);
							if (related != relatedCrews.end() && (*preference)->prefType == "NO_FLY_TOGETHER" && (*singleCrew)->assignment == (*preference)->assignment)
							{
								string msg = "Crew cannot fly together with crew member=" + (*singleCrew)->crewId + " on flight(ID=";
								msg += Utility::GetInstancePtr()->llToa(fltId)+").";
								pCrew->legalMessage.push_back(msg);
								this->setLegalityMessage(crew, pCrew, singleRule, msg);
								pCrew->isLegal = false;
								bReturn = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = crew->idCrew;
								rv->rosterId = (*roster)->rosterId;
								rv->pairingId = (*roster)->pairId;
								rv->dutySequenceNumber = (*duty)->getDutySegNum();
								rv->segmentId = (*segment)->getDBId();
								rv->startDTUtc = (*segment)->getStartTimeUtcAct();
								rv->endDTUtc = (*segment)->getEndTimeUtcAct();
								rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("singleCrewId", (*singleCrew)->crewId));
								rv->operation_result.insert(pair<string, string>("label", (*roster)->label));
								rv->operation_result.insert(pair<string, string>("fltId", Utility::GetInstancePtr()->llToa(fltId)));
								rv->violation_msg = msg;
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER){
									return false;
								}
							}
							if (related == relatedCrews.end() && (*preference)->prefType == "FLY_TOGETHER" && this->GetApplication() != ROSTER_OPTIMIZER && (*singleCrew)->assignment == (*preference)->assignment)
							{
								string msg = "Crew must fly with crew member=" + (*singleCrew)->crewId;
								pCrew->legalMessage.push_back(msg);
								this->setLegalityMessage(crew, pCrew, singleRule, msg);
								pCrew->isLegal = false;
								bReturn = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = crew->idCrew;
								rv->rosterId = (*roster)->rosterId;
								rv->pairingId = (*roster)->pairId;
								rv->dutySequenceNumber = (*duty)->getDutySegNum();
								rv->segmentId = (*segment)->getDBId();
								rv->startDTUtc = (*segment)->getStartTimeUtcAct();
								rv->endDTUtc = (*segment)->getEndTimeUtcAct();
								rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("crewId", (*singleCrew)->crewId));
								rv->violation_msg = msg;
								this->addRuleViolations(rv, singleRule);
							}
						}

					}

				}

			}

		}

	}

	return bReturn;
}
