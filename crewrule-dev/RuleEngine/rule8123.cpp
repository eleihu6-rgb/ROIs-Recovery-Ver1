#pragma once


#include "RuleEngine.h"
//#include "Utility.h"

//#include <time.h>
#include <algorithm>
//#include <iostream>

//#include "CrewDB.h"
#include "UtilFunc.h"
//#include "RuleParams.h"
//#include "UtilDbg.h"
//#include "StringUtil.h"
#include "utils/StringUtils.h"

/*
 8123: 前因后果泪法规
 前序飞过中高风险航线或机场，后续X天不可以飞某种类型航线或进行隔离
 例如：海南疫情期间，飞过海口或三亚机场 7天内，后续不可飞国内，可飞国际，如果不飞的话安排隔离7天。
	 8123 法规参数设置，检查在执行完某些航站任务之后，X天内不允许执行某些标签任务
	 BASES       - 机组基地，支持|分隔多个基地和通配符*，如PEK|CTU
	 RANKS     - 机组级别，支持|分隔多个级别和通配符*，如CAP|RFO
	 FLEETS    - 机组成员机型，支持|分隔多个机型和通配符*，如P77|P7R
	 CREW TEAMS - 机组员工组，支持|分隔多个员工组和通配符*，如AN|SP
	 以上4个参数，属于筛选组员的条件，即适用该法规的员工
	 PREV STATIONS - 执行某些航站的航线之后，启用限制逻辑。支持|分隔多个航站和通配符*,如PEK|SHE
	 LIMITED DAYS - 时间范围(天），数字类型，如3
	 LIMITED ATTRIBUTES - 执行"PREV STATIONS"航线后，在“LIMITED DAYS”时间范围内不允许执行这些标签任务.
		   支持|分隔多个标签和通配符*，如7|8
	注意：
	  1、“LIMITED DAYS”的日期范围，包含"PREV STATIONS"的任务环后的休息。
 2022.11.21
*/

bool LegalityChecker::checkRosterBringLimitation(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	/*
	*/
	string header, headeValue;
	string strBases = "*", strRanks = "*", strFleets = "*", strTeams = "*", strLimitedDays, strAttributes="*", strStations = "*";
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
		if (header == "BASES")
			strBases = headeValue;
		if (header == "RANKS")
			strRanks = headeValue;
		if (header == "FLEETS")
			strFleets = headeValue;
		if (header == "CREW TEAMS")
			strTeams = headeValue;
		if (header == "PREV STATIONS")
			strStations = headeValue;
		if (header == "LIMITED DAYS")
			strLimitedDays = headeValue;
		if (header == "LIMITED ATTRIBUTES")
			strAttributes = headeValue;
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER || this->_application == ROSTER_EDITOR)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<string>  strLimitedAttributes, strPerformedStations;
	split(strAttributes, '|', strLimitedAttributes);
	split(strStations, '|', strPerformedStations);

	time_t tempStart = rosters[0]->actEndUtc;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, tempStart);
	int offsetMinutes = 0;
	if (base.empty())
		base = _dbData->scenario.bases[0];
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	int period = 0;
	period = stoi(strLimitedDays);

	for (std::size_t i =0 ; i < rosters.size(); i ++)
	{
		if (!(rosters[i]->pairing))
			continue;
		vector<Duty*> duties = rosters[i]->pairing->getDutyVec();

		bool isMatchStation = false;
		for (auto& duty : duties)
		{
			vector<Segment*> segments = duty->getSegments();
			for (auto& segment : segments)
			{
				string arr = segment->getArrSta();
				if (find(strPerformedStations.begin(), strPerformedStations.end(), arr) != strPerformedStations.end())
				{
					isMatchStation = true;
					break;
				}
			}
		}
		if (!isMatchStation)
			continue;

		time_t startWindow = rosters[i]->actRestStrUtc;

		startWindow = Utility::GetInstancePtr()->getLocalDayStartInUTC(startWindow, offsetMinutes);
		if (startWindow < rosters[i]->actRestStrUtc)
			startWindow += 24 * 60 * 60;

		time_t endWindow = startWindow + period * (24 * 60 * 60);
		int iNextRoster=Utility::GetInstancePtr()->getNextAttributeRoster(rosters, (int)i, strAttributes);

		if (iNextRoster == FAILURE)
			continue;
		//两个Roster都是预占，并且属于RO，无需告警
		if ((this->GetApplication() == ROSTER_OPTIMIZER) 
			&& (rosters[i]->source == "PA") && (rosters[iNextRoster]->source == "PA"))
			continue;
		//违规情形
		if (rosters[iNextRoster]->actStrUtc < endWindow)
		{
			bReturn = false;

			string msg = "Crew members cannot be assigned rosters with attributes ({0:strAttributes}) within {1:strLimitedDays} days after operating at the station ({2:strStations}).";
			msg = StringUtils::Format(msg, strAttributes, strLimitedDays, strStations);

			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			rv->startDTUtc = startWindow;
			rv->endDTUtc = endWindow;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->operation_result.insert(pair<string, string>("PREV STATIONS", strStations));
			rv->operation_result.insert(pair<string, string>("LIMITED ATTRIBUTES", strAttributes));
			rv->operation_result.insert(pair<string, string>("LIMITED DAYS", strLimitedDays));
			this->addRuleViolations(rv, singleRule);
		}
	}
	return bReturn;
}
