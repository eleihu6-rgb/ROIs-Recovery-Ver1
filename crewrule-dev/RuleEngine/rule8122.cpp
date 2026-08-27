#pragma once


#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/StringUtils.h"
#include "../utils/TimeUtils.h"

/*
 8122: 机组偏好法规
 该法规和专门适用EVA客户的8052逻辑类似，但是属于产品标准功能和法规
 2022.11.07
*/

bool LegalityChecker::checkGenCrewPreference(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLY_PREFERENCE>>& preferences = crew->crewFlyPreferenceList;

	int offsetMinutes = this->_dbData->getCrewBaseOffsetMinutes(crew->idCrew, this->_dbData->scenario.startDtUTC);

	string crewId = crew->idCrew;
	//if (crewId == "0000011748" || crewId == "10000011748")
	//	printf("");

	time_t lCheckedStart = this->_dbData->scenario.startDtUTC;
	time_t lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;

	string assignment, label, attribute;
	time_t rosterStart, rosterEnd;

	for (vector<SharedPtr<CREW_FLY_PREFERENCE>>::iterator preference = preferences.begin(); preference != preferences.end(); ++preference)
	{
		//Hard Rules
		if ((*preference)->soft != "N")
			continue;
		if ((*preference)->prefType != 0 && (*preference)->prefType != 1)
			continue;

		if (!(Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, (*preference)->effectiveDate - offsetMinutes * 60, (*preference)->expiryDate - offsetMinutes * 60 + 24 * 3600 - 1)))
			continue;

		//暂时假设标签、航班号设置是单选，不支持多选
		const string& prefAttributes = (*preference)->attributes;
		const string& prefFltNums = (*preference)->flightNums;
		const string& prefDir = (*preference)->dir;

		const string& prefStations = (*preference)->stations;

		vector<string> strAirports;
		split(prefStations, '|', strAirports);


		int iMatchedRoster = 0;
		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
		{
			if (!((*roster)->pairing))
				continue;

			if (this->_application == ROSTER_OPTIMIZER && !((*roster)->needRuleCheck))
				continue;
			label = (*roster)->pairing->getLabel();
			rosterStart = (*roster)->actStrUtc;
			rosterEnd = (*roster)->actRestStrUtc;
			auto tempOffsetMinutes = this->_dbData->getAirportOffsetMinutes((*roster)->location);

			if (!(Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, rosterStart, rosterEnd)))
				continue;
			if (!(Utility::GetInstancePtr()->isTimeOverlap(rosterStart, rosterEnd, (*preference)->effectiveDate - tempOffsetMinutes * 60, (*preference)->expiryDate - tempOffsetMinutes * 60)))
				continue;

			assignment = (*roster)->duty;

			if ((*roster)->pairing)
				attribute = (*roster)->pairing->getAttribute();
			else
				attribute = "";

			bool bMatchAttribute = false;
			if (prefAttributes == "" || prefAttributes == "*")
				bMatchAttribute = true;
			else if (attribute == "" )
				bMatchAttribute = false;
			else if ( attribute.find(prefAttributes) != string::npos)
				bMatchAttribute = true;

			vector<string> stations, fltNums, dirs;
			vector<Duty *> duties = (*roster)->pairing->getDutyVec();
			string pairingBase= (*roster)->pairing ->getBase();
			for (auto& duty : duties)
			{
				vector<Segment*> segments = duty->getSegments();
				for (auto segment : segments)
				{
					const string& dep = segment->getDepStation();
					const string& arr = segment->getArrStation();
					const string& flight = segment->getAirline() + segment->getFlightNumber();
					const string& dir = segment->getDomIntType();

					if (dep != pairingBase)
						if (find(stations.begin(), stations.end(), dep) == stations.end())
							stations.push_back(dep);
					if (arr != pairingBase)
						if (find(stations.begin(), stations.end(), arr) == stations.end())
							stations.push_back(arr);

					if (find(fltNums.begin(), fltNums.end(), flight) == fltNums.end())
						fltNums.push_back(flight);

					if (find(dirs.begin(), dirs.end(), dir) == dirs.end())
						dirs.push_back(dir);
				}
			}

			bool bMatchFltNum = false;
			if (prefFltNums == "" || prefFltNums == "*")
				bMatchFltNum = true;
			else if (find(fltNums.begin(), fltNums.end(), prefFltNums) != fltNums.end())
				bMatchFltNum = true;

			bool bMatchStation = false;
			if (prefStations == "" || prefStations == "*")
				bMatchStation = true;
			else
			{
				for (auto& station : stations)
				{
					if (find(strAirports.begin(), strAirports.end(), station) != strAirports.end())
					{
						bMatchStation = true;
						break;
					}
				}
			}
		
			bool bMatchDir = false;
			bool bViolationDir = false;
			if (prefDir == "" || prefDir == "*")
				bMatchDir = true;
			else if (find(dirs.begin(), dirs.end(), prefDir) != dirs.end()) {
				bMatchDir = true;
				bViolationDir = true;
			}

			bool isLegal = true;
			string prefType = "";
			//偏好：不能执行符合条件的任务
			if ((*preference)->prefType == 1)
			{
				if (bMatchFltNum && bMatchStation && bMatchAttribute && bMatchDir)
					isLegal = false;
				else
					isLegal = true;
				prefType = "Cannot";
			}
			//偏好：偏好执行符合条件的任务环
			else if ((*preference)->prefType == 0)
			{
				if (bMatchFltNum && bMatchStation && bMatchAttribute && bMatchDir)
					isLegal = true;
				else
					isLegal = false;
				prefType = "Must";
			}

			if (!isLegal)
			{
				if (this->GetApplication() == ROSTER_OPTIMIZER && (*roster)->needRuleCheck == false)
				{
					continue;
				}
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				
				string msg;
				if (bViolationDir) {
					msg = StringUtils::Format("The crew is restricted to operate this duty type from {0:limitLocalStartTime} to {1:limitLocalEndTime}", 
						TimeUtils::Format((*preference)->effectiveDate, "yyyy-mm-dd"), 
						TimeUtils::Format((*preference)->expiryDate, "yyyy-mm-dd"));
				}
				else {
					msg = "[" + label + "] violates crew member ("+crewId+")'s preference (" + prefType+")";
					rv->operation_result.insert(pair<string, string>("pref", prefType));
					if ((*preference)->attributes != "") {
						string attributeName = (*preference)->attributes;
						if (this->_dbData->attributeNameMap.find((*preference)->attributes) != this->_dbData->attributeNameMap.end())
						{
							attributeName += " ";
							attributeName += this->_dbData->attributeNameMap[(*preference)->attributes];
						}
						msg += ", Attribute=" + attributeName;
						rv->operation_result.insert(pair<string, string>("attribute", ",Attribute=" + attributeName));
					}
					if (prefFltNums != "" && prefFltNums != "*")
						msg += ", Flights=" + prefFltNums;
					if (prefStations != "" && prefStations != "*")
						msg += ", Stations=" + prefStations;
					msg += ".";
				}
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(crew, pCrew, singleRule, msg);
				bReturn = false;
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				rv->crewId = crew->idCrew;
				rv->rosterId = (*roster)->rosterId;
				rv->pairingId = (*roster)->pairId;
				if (bViolationDir) {
					rv->startDTUtc = (*preference)->effectiveDate - tempOffsetMinutes * 60;
					rv->endDTUtc = (*preference)->expiryDate - tempOffsetMinutes * 60;
				}
				else {
					rv->startDTUtc = rosterStart;
					rv->endDTUtc = rosterEnd;
				}
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				rv->violation_msg = msg;
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}
		}

	}

	return bReturn;
}
