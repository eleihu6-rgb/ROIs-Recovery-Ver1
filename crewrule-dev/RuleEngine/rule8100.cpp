#include "RuleEngine.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "utils/StringUtils.h"

bool LegalityChecker::checkDOGap(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue,pGap;
	vector<string> baseVec, rankVec, crewTeamVec, fleetVec;
	int gap;
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
		else if (header == "GAP TIME") {
			pGap = headeValue;
			gap = hhmmStrToMinutes(pGap);
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
	vector<string> doAssignments, restAssignments;
	vector<SharedPtr<DBRule_8014>> assignments = this->_dbData->rule_8014;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->assignmentGroup == "DO" && (this->_dbData->version == 3 || (*assignment)->airline == this->_dbData->scenario.airline))
			doAssignments.push_back((*assignment)->assignemnt);
		if ((*assignment)->assignmentGroup == "NLEA" && (this->_dbData->version == 3 || (*assignment)->airline == this->_dbData->scenario.airline))
			restAssignments.push_back((*assignment)->assignemnt);
	}

	for (int i = 0; i < (int)rosters.size(); i++)
	{
		if (find(doAssignments.begin(), doAssignments.end(), rosters[i]->duty) == doAssignments.end())
			continue;
		int iPrevDO = i;
		int j = i + 1;
		for (j = i + 1; j < (int)rosters.size(); j++)
		{
			//下一个不是DO,或者间隔超过1天的DO停止循环
			if (find(doAssignments.begin(), doAssignments.end(), rosters[j]->duty) != doAssignments.end()
				&& static_cast<int>(rosters[j]->actStrUtc - rosters[iPrevDO]->actStrUtc) <= 24 * 3600)
			{
				iPrevDO = j;
			}
			else
				break;
		}
		//检查roster[i],rosters[iPrevDO]两侧是否有足够休息gap
		//第一个和最后一个没有必要检查
		if (i != 0 && iPrevDO != (int)rosters.size() - 1)
		{
			int iPrevWorkingIndex = Utility::GetInstancePtr()->getWorkingRosterIndexBefore(rosters, restAssignments, i);
			if (iPrevWorkingIndex < 0 || iPrevWorkingIndex >= i)
				continue;
			int iPrevRest = static_cast<int>(rosters[i]->actStrUtc - rosters[iPrevWorkingIndex]->actRestStrUtc) / 60;

			int iNextWorkingIndex = Utility::GetInstancePtr()->getNextWorkingRosterIndex(rosters, restAssignments, iPrevDO);
			if (iNextWorkingIndex < 0 || iNextWorkingIndex <= iPrevDO)
				continue;
			int iNextRest = static_cast<int>(rosters[iNextWorkingIndex]->actStrUtc - rosters[iPrevDO]->actRestStrUtc) / 60;

			if (iPrevRest < gap && iNextRest < gap)
			{
				//illeage rosters
				bReturn = false;
				string msg = "The actual rest period ({0:actualRest}) before the days off roster [{1:rosterId}] or after [{2:rosterId2}] is less than the minimum required {3:pGap}.";
				msg = StringUtils::Format(msg, Utility::GetInstancePtr()->formatMinutes(max(iPrevRest, iNextRest)), rosters[i]->rosterId, rosters[i]->rosterId, pGap);

				this->setLegalityMessage(rosters[i], NULL, NULL, msg);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				if (crew)
					rv->crewId = crew->idCrew;
				rv->rosterId = rosters[i]->rosterId;
				rv->pairingId = rosters[i]->pairId;
				//rv->dutySequenceNumber = duty->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = rosters[i]->actStrUtc;
				rv->endDTUtc = rosters[i]->actRestStrUtc;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				rv->operation_result.insert(pair<string, string>("actualRest", Utility::GetInstancePtr()->formatMinutes(max(iPrevRest, iNextRest))));
				rv->operation_result.insert(pair<string, string>("minGapRest", pGap));
				this->addRuleViolations(rv, NULL);
			}
		}
			
	}
	return bReturn;
}