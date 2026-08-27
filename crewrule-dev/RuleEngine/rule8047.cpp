#pragma once

#include "RuleEngine.h"
#include "Utility.h"

//#include <time.h>
#include <algorithm>
#include <iostream>

//#include "CrewDB.h"
#include "UtilFunc.h"
//#include <OrLog.h>
#include "RuleParams.h"
//#include "UtilDbg.h"
//#include "StringUtil.h"


bool LegalityChecker::checkMinRestsAfterWorkingDuties(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	const auto& parameters = singleRule->params;

	//BASE,RANK,FLEET,#WORKS,MIN RESTS,WORKING ASSIGNMENT GROUPS,REST ASSIGNMENT GROUPS
	//*,*,*,6,1,FLY;SBY;GND;TRG,DO;LEA;LO
	string header, headeValue;
	string strBase, strRank, strFleet, strRestGroups, strWorkingGroups, strXWorks, strMinRests;
	bool bCountPostRest, bBlankDay;
	for (const auto& parameter: parameters)
	{
		header = parameter.first;
		headeValue = parameter.second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASE")
			strBase = headeValue;
		if (header == "RANK")
			strRank = headeValue;
		if (header == "FLEET")
			strFleet = headeValue;

		if (header == "#WORK DAYS")
			strXWorks = headeValue;
		if (header == "REST ASSIGNMENT GROUPS")
			strRestGroups = headeValue;
		if (header == "WORKING ASSIGNMENT GROUPS")
			strWorkingGroups = headeValue;
		if (header == "MIN RESTS")
			strMinRests = headeValue;
		if (header == "UTILIZE POST DUTY REST")
			bCountPostRest = (headeValue == "Y");
		if (header == "COUNT BLANK DAY")
			bBlankDay = (headeValue == "Y");
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;

	if (rosters.size() == 0)
		return true;

	int iWorks = stoi(strXWorks);
	int iMinRests = stoi(strMinRests);
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		//ROSCRW-7309 RO 8047检查应该包含场景前后的日期
		lCheckedStart = this->_dbData->scenario.startDtUTC - (iWorks + iMinRests) * (24 * 3600);
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600 + (iWorks + iMinRests) * (24 * 3600);
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<string> strRests, strWorks;
	split(strRestGroups, '|', strRests);
	split(strWorkingGroups, '|', strWorks);
	//boost::split(strRests, strRestGroups, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(strWorks, strWorkingGroups, boost::is_any_of("|"), boost::token_compress_on);

	vector<string> strRestAssignments, strWorkAssignments;
	const vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	for (const auto& assignment :assignments)
	{
		if (this->_dbData->version == 3 || assignment->airline == this->_dbData->scenario.airline)
		{
			if (std::find(strRests.begin(), strRests.end(), assignment->assignmentGroup) != strRests.end())
				strRestAssignments.push_back(assignment->assignemnt);
			if (std::find(strWorks.begin(), strWorks.end(), assignment->assignmentGroup) != strWorks.end())
				strWorkAssignments.push_back(assignment->assignemnt);
		}
	}

	time_t rosterStart, rosterEnd;
	string rosterDuty;
	int iDaysOff = 0;
	for (std::size_t i = 0; i < rosters.size(); ++i)
	{
		rosterStart = rosters[i]->actStrUtc;
		rosterEnd = rosters[i]->restStrUtc;
		if ((rosterStart >= lCheckedStart && rosterStart <= lCheckedEnd) || (rosterEnd >= lCheckedStart && rosterEnd <= lCheckedEnd))
		{
			rosterDuty = rosters[i]->duty;
			if (std::find(strWorkAssignments.begin(), strWorkAssignments.end(), rosterDuty) == strWorkAssignments.end())
			{
				continue;
			}

			std::size_t index = (std::size_t)beforeNonConsWorkingRoster(rosters, (int)i, strWorkAssignments);
			string location = rosters[i]->location;
			auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(location);
			time_t firstRoster = rosters[i]->actStrUtc;
			time_t lastRoster = rosters[index]->actRestStrUtc;
			time_t start = Utility::GetInstancePtr()->getLocalDayStartInUTC(firstRoster, iOffsetMinutes);
			time_t end = Utility::GetInstancePtr()->getLocalDayStartInUTC(lastRoster, iOffsetMinutes) + 24 * 3600;
			int days = static_cast<int>(end - start) / (24 * 3600);
			//if ((end - start) % (24 * 3600)) {
			//	days++;
			//}
			start = end;
			end = start + 24 * 3600 * iMinRests;

			// 超过最大连续数，直接告警
			if (days > iWorks) {
				// 忽略预占违规
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					bool hasOptimizerRoster = false;
					for (size_t j = i; j <= index; j++) {
						if (rosters[j]->source != "PA")
							hasOptimizerRoster = true;
					}
					if (!hasOptimizerRoster)
						continue;
				}
				bReturn = false;
				string msg = strXWorks + " working days exceed ( " + to_string(iWorks) + ").";
				this->setLegalityMessage(crew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				//rv->rosterId = rosters[iCurrentIndex]->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = firstRoster;
				rv->endDTUtc = lastRoster;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strXWorks", strXWorks));
				rv->operation_result.insert(pair<string, string>("strMinRests", strMinRests));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}

			iDaysOff = 0;
			if (days >= iWorks)
			{
				//end of day range
				if (!bCountPostRest)
					iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, strRestAssignments, start, end);
				else
					iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, strRestAssignments, start, end, iOffsetMinutes, bBlankDay, bCountPostRest, this->_dbData->airportCodeMap, "", 1);

			}

			//illegal cases
			if ((iDaysOff < iMinRests) && (days >= iWorks))
			{
				//8047法规如果违规任务在RO场景内，并且前后两个任务都属于预占，忽略该违规
				if (this->_application == ROSTER_OPTIMIZER)
				{
					if (rosters[i]->source == "PA" && rosters[index]->source == "PA")
					{
						//并且之后的Roster也是预占才忽略
						bool isAllPresAssigned = true;

						for (std::size_t k = max(i, index) + 1; k < rosters.size(); ++k)
						{
							if (rosters[k]->actStrUtc > end)
								break;
							if (rosters[k]->source != "PA")
							{
								isAllPresAssigned = false;
								break;
							}
						}
						if (isAllPresAssigned)
							continue;
					}
				}
				bReturn = false;
				string msg = strXWorks + " working days must be followed by " + strMinRests + " rest rosters.";
				this->setLegalityMessage(crew, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				//rv->rosterId = rosters[iCurrentIndex]->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = firstRoster;
				rv->endDTUtc = lastRoster;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("strXWorks", strXWorks));
				rv->operation_result.insert(pair<string, string>("strMinRests", strMinRests));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}
		}
	}

	return bReturn;
}
