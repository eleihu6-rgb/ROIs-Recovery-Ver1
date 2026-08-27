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


bool LegalityChecker::checkDutyOnCrewBirthday(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;

	string strAllowed;
	bool bCountBlankDay;

	//ALLOWED ASSIGNMENT GROUP,ALLOW BLANK DAY
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "ALLOWED ASSIGNMENT GROUP") {
			strAllowed = headeValue;
		}
		if (header == "ALLOW BLANK DAY") {
			bCountBlankDay = (headeValue == "Y");
		}
	}
	//

	vector<SharedPtr<DBRule_8014>> assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> allowedGroup;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->assignmentGroup == strAllowed && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
		{
			allowedGroup.push_back((*assignment)->assignemnt);
		}
	}

	vector<SharedPtr<ROSTER>> rosters, rosters2;
	if (this->GetApplication() == ROSTER_OPTIMIZER && pCrew->RosterIndex >= 0)
		rosters.push_back(this->_dbData->crewList[pCrew->crewIndex]->rosterList[pCrew->RosterIndex]);
	else
		rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	tm birthday = this->_dbData->crewList[pCrew->crewIndex]->birthdayTm;
	string base;
	time_t start = this->_dbData->scenario.startDtUTC + 24 * 60 * 60;
	time_t birthday_utc = Utility::GetInstancePtr()->getBirthdayInAYear(start, birthday);
	long long roster_id = 0, pairing_id = 0;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		base = (*roster)->getBase();
		auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
		birthday_utc = Utility::GetInstancePtr()->getLocalDayStartInUTC(birthday_utc, offsetMinutes);
		time_t roster_start = (*roster)->actStrUtc;
		time_t roster_end = (*roster)->restStrUtc;

		if (Utility::GetInstancePtr()->isTimeOverlap(roster_start, roster_end, birthday_utc, birthday_utc + 24 * 60 * 60))
		{
			rosters2.push_back((*roster));
			roster_id = (*roster)->rosterId;
			pairing_id = (*roster)->pairId;
		}
	}

	int iNumberOfAllowed = 0, iNumberOfNotAllowed = 0;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters2.begin(); roster != rosters2.end(); roster++)
	{
		string roster_assignment = (*roster)->duty;
		if (std::find(allowedGroup.begin(), allowedGroup.end(), roster_assignment) != allowedGroup.end())
			iNumberOfAllowed++;
		else
			iNumberOfNotAllowed++;
	}

	if (((!bCountBlankDay) && (iNumberOfAllowed == 0)) || (iNumberOfNotAllowed > 0))
	{
		isValid = false;
		string birthString = Utility::GetInstancePtr()->iToa(birthday.tm_mon + 1) + "/" + Utility::GetInstancePtr()->iToa(birthday.tm_mday);
		string msg = "No working roster is permitted on a crew member's birthday(" + birthString + ").";

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
		this->setLegalityMessage(ppCrew, pCrew, singleRule, msg);
		pCrew->isLegal = false;
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
		if (roster_id)
		{
			rv->rosterId = roster_id;
			rv->pairingId = pairing_id;
		}
		rv->startDTUtc = birthday_utc;
		rv->endDTUtc = birthday_utc + 24 * 60 * 60;
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
		//OP#1448提供message参数给gantt
		rv->operation_result.insert(pair<string, string>("birthString", birthString));
		rv->violation_msg = msg;
		this->addRuleViolations(rv, singleRule);
		if (this->GetApplication() == ROSTER_OPTIMIZER)
			return isValid;
	}

	return isValid;
}