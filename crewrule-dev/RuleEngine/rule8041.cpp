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
#include "../utils/PhaseUtils.h"


bool LegalityChecker::checkConsecutiveRosters(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	//BASE,RANK,FLEET,MAX CONSECUTIVE DAYS,ASSIGNMENT GROUP
	string strBase, strRank, strFleet, strMode = "PTN";
	string strMaxConsecutiveDays, strAssignmentGroupSetting;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
		if (header == "BASE") {
			strBase = headeValue;
		}
		if (header == "RANK") {
			strRank = headeValue;
		}
		if (header == "FLEET") {
			strFleet = headeValue;
		}
		if (header == "MAX CONSECUTIVE DAYS") {
			strMaxConsecutiveDays = headeValue;
		}
		if (header == "ASSIGNMENT GROUP") {
			strAssignmentGroupSetting = headeValue;
		}
		if (header == "MODE") {
			strMode = headeValue;
		}
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	string crewId = crew->idCrew;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
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
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;

	vector<string> strAssignmentGroups;
	split(strAssignmentGroupSetting, '|', strAssignmentGroups);
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> assignmentCodes;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if (find(strAssignmentGroups.begin(), strAssignmentGroups.end(), (*assignment)->assignmentGroup) != strAssignmentGroups.end()
			&& (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
		{
			assignmentCodes.push_back((*assignment)->assignemnt);
		}
	}
	int iMaxConsDays = stoi(strMaxConsecutiveDays);
	string crewBase = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, lCheckedStart);
	if (crewBase == "")
		return true;
	auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(crewBase);
	vector<time_t> daysWindows;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		time_t rosterStart = crew->rosterList[pCrew->RosterIndex]->actStrUtc;
		time_t rosterEnd = crew->rosterList[pCrew->RosterIndex]->actEndUtc;
		time_t start = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterStart, iOffsetMinutes);
		time_t end = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterEnd, iOffsetMinutes) + 24 * 3600;
		int i = static_cast<int>(end - start) / (3600 * 24) + iMaxConsDays * 2;
		start = start - iMaxConsDays*(24 * 3600);
		for (int j = 0; j <= i; ++j)
		{
			daysWindows.push_back(start + j*(24 * 3600));
		}
	}
	else
	{
		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
		{
			if ((*roster) != nullptr && !PhaseUtils::IsChecked((*roster).get(), singleRule->phase, this->_dbData)) {
				continue;
			}
			time_t rosterStart = (*roster)->actStrUtc;
			time_t rosterEnd = (*roster)->actEndUtc;
			time_t start = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosterStart, iOffsetMinutes);
			if (std::find(daysWindows.begin(), daysWindows.end(), start) == daysWindows.end())
				daysWindows.push_back(start);
		}
	}
	time_t checkStart, checkEnd;
	int iCons = 0;
	//if (crew->idCrew == "F02706")
	//printf("");
	for (std::size_t index = 0; index < daysWindows.size(); ++index)
	{
		checkStart = daysWindows[index];
		checkEnd = checkStart + (iMaxConsDays + 1)*(24 * 3600);
		//if (checkStart == 1531411200)
		//printf("");
		iCons = Utility::GetInstancePtr()->howManyConsecutiveDayswithAssgnGroups(rosters, checkStart, checkEnd, assignmentCodes, iOffsetMinutes, this->_application, strMode == "PTN");
		if (iCons > iMaxConsDays)
		{
			bool hasRORoster = Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, checkStart, checkEnd);

			if ((this->_application == ROSTER_OPTIMIZER) && (!hasRORoster))
				continue;

			char startUtcStr[30] = { 0 };
			char endUtcStr[30] = { 0 };
			Utility::GetInstancePtr()->UTCToUTCStr(checkStart + iOffsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
			Utility::GetInstancePtr()->UTCToUTCStr(checkEnd - 1 + iOffsetMinutes * 60, endUtcStr, sizeof(endUtcStr));

			string msg = "[" + string(startUtcStr) + "-" + string(endUtcStr) + "]The number of consecutive roster days (" + Utility::GetInstancePtr()->iToa(iCons)+") ";
			msg += "with assignment groups(" + strAssignmentGroupSetting + ") exceeds the limitation(" + strMaxConsecutiveDays + ") in " + strMode + " mode.";
			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage(crew, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			pCrew->skipCheckInLaterIterations = true;
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crew->idCrew;
			//rv->rosterId = (*roster)->rosterId;
			//rv->pairingId = (*roster)->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = checkStart;
			rv->endDTUtc = checkEnd;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
			rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
			rv->operation_result.insert(pair<string, string>("iCons", Utility::GetInstancePtr()->iToa(iCons)));
			rv->operation_result.insert(pair<string, string>("strAssignmentGroupSetting", strAssignmentGroupSetting));
			rv->operation_result.insert(pair<string, string>("strMaxConsecutiveDays", strMaxConsecutiveDays));
			rv->operation_result.insert(pair<string, string>("strMode", strMode));
			rv->violation_msg = msg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
	}
	return bReturn;
}


int Utility::howManyConsecutiveDayswithAssgnGroups(vector<SharedPtr<ROSTER>>& rosters, time_t start, time_t end, vector<string>& assignments, int offsetMinutes, int application, bool isRosterMode)
{
	int iReturn = 0;
	int iMax = 0;
	time_t roster_start, roster_end, tempStart, tempEnd;
	string assignment;
	int iRosterCount = 0;
	//bool bNeedCheck = false;
	time_t duty_start, duty_end;
	//last count roster/duty end time
	time_t count_start = 0;
	time_t last_count_end = 0;
	time_t last_start = 0;
	bool isBreak = true;
	//last duty/roster end time
	time_t last_end = 0;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
		roster_start = (*roster)->actStrUtc;
		roster_end = (*roster)->actRestStrUtc;
		assignment = (*roster)->qualifier;
		if (!(roster_start >= start  && roster_start < end))
			continue;
		if (find(assignments.begin(), assignments.end(), assignment) == assignments.end())
		{
			if (count_start>0)
				iMax = max(iMax, (int)(last_count_end - count_start) / (24 * 3600) + 1);
			isBreak = true;
			continue;
		}

		if (isRosterMode || (!(*roster)->pairing))
		{
			tempStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster_start, offsetMinutes);
			tempEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster_end, offsetMinutes);

			if (tempEnd > end)
				tempEnd = end;

			if (isBreak)
			{
				count_start = tempStart;
				last_count_end = tempEnd;
				last_start = tempStart;
				last_end = roster_end;
				iRosterCount = 0;
			}

			if (tempStart == last_count_end || abs(tempStart - last_count_end) == 24 * 3600 || isBreak)
			{
				last_count_end = tempEnd;
				last_start = tempStart;
				last_end = roster_end;
				iRosterCount++;
				isBreak = false;
				continue;
			}
			else
			{
				if (last_end > end)
					iMax = max(iMax, (int)(last_count_end - count_start) / (24 * 3600));
				else
					iMax = max(iMax, (int)(last_count_end - count_start) / (24 * 3600) + 1);
				isBreak = true;
			}
		}
		else
		{
			iRosterCount++;
			vector<Duty *> duties = (*roster)->pairing->getDutyVec();
			for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
			{
				duty_start = (*duty)->getStartTimeUtcAct();
				duty_end = (*duty)->getEndTimeUtcAct();
				tempStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(duty_start, offsetMinutes);
				tempEnd = Utility::GetInstancePtr()->getLocalDayStartInUTC(duty_end, offsetMinutes);
				if (tempEnd > end)
					tempEnd = end;
				if (isBreak)
				{
					count_start = tempStart;
					last_count_end = tempEnd;
					last_start = tempStart;
					iRosterCount = 0;
					last_end = duty_end;
				}
				//mantis3601 根据duty start判断是否连续，而不是DUTY END
				//if (tempStart == last_count_end || abs(tempStart - last_count_end) == 24 * 3600 || isBreak)
				if (tempStart == last_count_end || abs(tempStart - last_start) == 24 * 3600 || isBreak)
				{
					last_count_end = tempEnd;
					last_start = tempStart;
					last_end = duty_end;
					isBreak = false;
					continue;
				}
				else
				{
					if (last_end > end)
						iMax = max(iMax, (int)(last_count_end - count_start) / (24 * 3600));
					else
						iMax = max(iMax, (int)(last_count_end - count_start) / (24 * 3600) + 1);
					isBreak = true;
				}

			}
		}

	}
	if (last_end > end)
		iReturn = max(iMax, (int)(last_count_end - count_start) / (24 * 3600));
	else
		iReturn = max(iMax, (int)(last_count_end - count_start) / (24 * 3600) + 1);

	//Ignore the single roster in this time frame
	if (iRosterCount == 1 && isRosterMode)
		iReturn = 0;

	//if (application == ROSTER_OPTIMIZER && !bNeedCheck)
	//	iReturn = 0;
	return iReturn;
}