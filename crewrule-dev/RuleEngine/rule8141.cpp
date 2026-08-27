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

bool LegalityChecker::checkMax_X_Segs_In_Y_Days(RULE_LEGALITY * pCrew, const DBRule* singleRule){

	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	vector<string> baseVec, rankVec, crewTeamVec, fleetVec, assignmentVec;
	int minTimes, maxTimes, period;
	string unit, type;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			split(headeValue, '|', baseVec);
		}
		else if (header == "RANKS") {
			split(headeValue, '|', rankVec);
		}
		else if (header == "FLEETS") {
			split(headeValue, '|', fleetVec);
		}
		else if (header == "CREW TEAMS") {
			split(headeValue, '|', crewTeamVec);
		}
		else if (header == "ASSIGNMENTS") {
			split(headeValue, '|', assignmentVec);
		}
		else if (header == "MIN TIMES") {
			minTimes = stoi(headeValue);
		}
		else if (header == "MAX TIMES") {
			maxTimes = stoi(headeValue);
		}
		else if (header == "PERIOD") {
			period = stoi(headeValue);
		}
		else if (header == "UNIT") {
			unit = headeValue;
		}
	}

	if (pCrew->crewIndex < 0){ return true; }
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)return true;
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

	vector<string> positionsVec;
	split("*", '|', positionsVec);
	bool bRetu = Utility::GetInstancePtr()->isCrewQualified(crew, baseVec, rankVec, fleetVec, crewTeamVec, positionsVec, lCheckedStart, lCheckedEnd);
	if (!bRetu)return true;


	return bReturn;
}