#pragma once


#include "RuleEngine.h"
#include "RuleParams.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "Utility.h"
#include "UtilFunc.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "utils/StringUtils.h"

/*
 8121: 机组不同飞法规（同时该法规涉及表也支持同飞要求，但是属于软性规则，以OR算法实现)
 该法规和专门适用EVA客户的8057逻辑类似，但是属于产品标准功能和法规
 2022.11.07
*/
bool LegalityChecker::checkGenCrewFlyTogether(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_FLY_TOGETHER>>& preferences = crew->crewFlyTogetherList;
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& cofs = this->_dbData->crewOnFlt;

	int offsetMinutes = this->_dbData->getCrewBaseOffsetMinutes(crew->idCrew, this->_dbData->scenario.startDtUTC);

	string crewId = crew->idCrew;
	//if (crewId == "0000011519" || crewId == "0000011748")
	//	printf("");

	if (rosters.size() == 0)
		return true;

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
	vector<Duty *> duties;
	vector<Segment*> segments;
	vector<SharedPtr<CrewOnFlight>> crews;
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>::iterator crews_it;
	vector<string>::iterator related;
	long long fltId;

	vector<SharedPtr<CREW_FLY_TOGETHER>> tempPrefs;
	for (vector<SharedPtr<CREW_FLY_TOGETHER>>::iterator preference = preferences.begin(); preference != preferences.end(); ++preference)
	{
		if ((*preference)->flyTogetherIndicator == "Y" || (*preference)->flyTogetherIndicator == "N")
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

		for (vector<SharedPtr<CREW_FLY_TOGETHER>>::iterator preference = tempPrefs.begin(); preference != tempPrefs.end(); ++preference)
		{
			

			const auto& assignments = (*preference)->restrictionTypeList;
			string relatedCrews = (*preference)->crewIdA;
			if (relatedCrews == crewId)
				relatedCrews = (*preference)->crewIdB;
			if (relatedCrews == crewId)
			{
				string errorMsg = "Exceptions: Wrong crew fly together data(" + crewId + ").";
				printf(errorMsg.c_str());
				continue;
			}

			if (!((*preference)->strAttributes.empty() || (*preference)->strAttributes == "*")
				&& !Utility::GetInstancePtr()->isPairingMatchAttributes((*roster)->pairing->getAttribute(), (*preference)->strAttributes))
				continue;

			duties = (*roster)->pairing->getDutyVec();

			for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
			{
				segments = (*duty)->getSegments();
				for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
				{

					if (!(Utility::GetInstancePtr()->isTimeOverlap((*preference)->effectiveDate - offsetMinutes * 60, (*preference)->expiryDate - offsetMinutes * 60 + 24 * 3600 - 1, (*segment)->getStartTimeUtcAct(), (*segment)->getEndTimeUtcAct())))
						continue;
					if (!((*preference)->strAirports.empty() || (*preference)->strAirports == "*")
						&& find((*preference)->airports.begin(), (*preference)->airports.end(), (*segment)->getDepStationRead()) == (*preference)->airports.end()
						&& find((*preference)->airports.begin(), (*preference)->airports.end(), (*segment)->getArrStationRead()) == (*preference)->airports.end())
						continue;
					fltId = (*segment)->getDBId();

					crews_it = cofs.find(fltId);
					if (crews_it != cofs.end())
					{
						crews = (*crews_it).second;
						for (vector<SharedPtr<CrewOnFlight>>::iterator singleCrew = crews.begin(); singleCrew != crews.end(); ++singleCrew)
						{
							if ((*preference)->restrictionType.empty() || (*preference)->restrictionType == "*")
								continue;
							if ((*singleCrew)->crewId == relatedCrews && (*preference)->flyTogetherIndicator == "N" && find(assignments.begin(), assignments.end(), (*singleCrew)->assignment) != assignments.end() && find(assignments.begin(), assignments.end(), (*segment)->getAssignment()) != assignments.end())
							{
								string msg = "The crew member cannot fly together with crew member {0:singleCrewId} on the flight (ID={1:fltId}).";
								msg = StringUtils::Format(msg, (*singleCrew)->crewId, fltId);

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
								rv->operation_result.insert(pair<string, string>("singleCrewId", (*singleCrew)->crewId));
								rv->operation_result.insert(pair<string, string>("fltId", Utility::GetInstancePtr()->llToa(fltId)));
								rv->violation_msg = msg;
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER) {
									return false;
								}
							}
						}

					}

				}

			}

		}

	}

	return bReturn;

}
