#pragma once


#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "utils/StringUtils.h"

/*
原始需求：
	自然月曾经飞过偏离航线后，本月必须有连续3天的休息.
	连续3天的休息日无需在偏离航线之后，在执行偏离航线之前也视为满足要求。
	机组成员执行多次偏离航线，仅需满足在自然月内一次连续3天的休息日。

	偏离航线：6P/8P配比航班，也可以用航班号/Attribute定义

法规ID：8118
 2022.09.30 - 10.08

项目：国航飞行派遣优化项目

假设：
       预占偏离航线，但是本月不满足休息要求，该优化业务场景不存在，即使存在，也会导致该组员无法新分配任务；
	   预占偏离航线，新分配任务导致本月不满足休息要求，该业务场景可检查并被法规阻止；
	   预占任务，导致无足够休息，新分配偏离航线任务导致本月不满足休息要求，该业务场景可检查并被法规阻止；
*/
bool LegalityChecker::checkExemptFlightRest(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;

	string rDOGroup, rCompostions = "*", rAttributes = "*", rFlights = "*", rPeriod = "1", rUnit = "CD", rMinRest;

	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		// Min consecutive rest days for roster with compositions and attributes and flights num in  UNIT PERIOD
		//法规参数设置
		if (header == "COMPOSITIONS")
			rCompostions = headeValue;
		if (rCompostions == "BASIC")
			rCompostions = rCompostions + "|" + "2P";

		if (header == "ATTRIBUTES")
			rAttributes = headeValue;
		if (header == "FLIGHT NUMS")
			rFlights = headeValue;
		if (header == "DO ASSIGNMENT GROUP")
			rDOGroup = headeValue;
		if (header == "MIN CONSECUTIVE REST DAYS")
			rMinRest = headeValue;
	}

	vector<string>  strAttributes, strCompostions, strFlights;
	split(rAttributes, '|', strAttributes);
	split(rCompostions, '|', strCompostions);
	split(rFlights, '|', strFlights);

	int period = stoi(rPeriod);
	int iConsecutive = stoi(rMinRest);
	if (iConsecutive < 1)
		iConsecutive = 1;

	//读取ASSIGNMENT配置数据
	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> daysOffs, restAssignments;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		if ((*assignment)->assignmentGroup == rDOGroup && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
		{
			daysOffs.push_back((*assignment)->assignemnt);
		}
		if ((*assignment)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
			restAssignments.push_back((*assignment)->assignemnt);
	}

	string crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	//if (crewId == "0000021190")
	//	printf("");

	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	if (rosters.size() == 0)
		return true;

	time_t rollingWindow_start, rollingWindow_end;
	if (this->GetApplication() != ROSTER_OPTIMIZER && !rosters.empty())
	{
		rollingWindow_start = rosters[0]->actStrUtc;
		rollingWindow_end = rosters[rosters.size() - 1]->actEndUtc;
	}
	else
	{
		rollingWindow_start = this->_dbData->scenario.startDtUTC;
		rollingWindow_end = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	time_t tempStart = rosters[0]->actEndUtc;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(this->_dbData->crewList[pCrew->crewIndex]->baseList, tempStart);
	int offsetMinutes = 0;
	if (base.empty())
		base = _dbData->scenario.bases[0];
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	//月份时间范围
	map<time_t, time_t> mp = Utility::GetInstancePtr()->getMonthRollingWindows(rollingWindow_start, rollingWindow_end, offsetMinutes, 1);

	string fltAttr;
	//检查当前ROSTERS是否有符合条件的ROSTER。满足条件检查所在月份是否有符合条件的休息日
	for (auto it = rosters.begin(); it != rosters.end(); ++it)
	{
		SharedPtr<ROSTER> roster = *it;
		if (!(roster->pairing))
			continue;

		//忽略已经被检查的任务，以满足RO性能要求。
		//该法规不能忽略：比如先分配一个需要3天休息的任务，此时符合条件，后面再分配一个不符合法规设置的任务环，此时不检查可能导致不满足3天休息要求。
		//if ((this->GetApplication() == ROSTER_OPTIMIZER) && (rosters[pCrew->RosterIndex]->pairId != roster->pairId))
		//	continue;

		//任务环标签是否包含法规设置
		bool bHas = false;
		if (rAttributes != "*")
		{
			fltAttr = roster->pairing->getAttribute();

			for (vector<string>::iterator oneAtt = strAttributes.begin(); oneAtt != strAttributes.end(); ++oneAtt)
			{
				if (fltAttr.find((*oneAtt)) != std::string::npos)
				{
					bHas = true;
					break;
				}
			}
			if (!bHas)
				continue;
		}
		else
			bHas = true;

		if (!bHas)
			continue;

		bool bFindRoster = false;
		if ((rCompostions != "*") | (rFlights != "*"))
		{
			vector<Duty *> duties = roster->pairing->getDutyVec();

			for (auto& duty : duties)
			{
				//配比是否符合法规设置
				string strComplement = duty->getCompositionName();
				if (rCompostions != "*")
					if (std::find(strCompostions.begin(), strCompostions.end(), strComplement) == strCompostions.end())
						continue;

				//航班是否符合法规设置
				if (rFlights != "*")
				{
					vector<Segment *> segments = duty->getSegments();

					for (auto& segment : segments)
					{
						string fltNum = segment->getFlightNumber();
						if (std::find(strFlights.begin(), strFlights.end(), fltNum) == strFlights.end())
							continue;
						else
							bFindRoster = true;
					}
				}
				else
					bFindRoster = true;
			}
		}
		else
			bFindRoster = true;

		time_t rosterStart = roster->getStartTimeUtcAct();
		//存在偏离航线，检查休息要求
		if (bFindRoster)
		{
			for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); mp_it++)
			{
				time_t start = (*mp_it).first;
				time_t end = (*mp_it).second;

				if (start <= rosterStart && end >= rosterStart)
				{
					//检查在时间范围内是否有足够休息日，返回满足条件连续休息日的个数
					int iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, offsetMinutes, true, true, this->_dbData->airportCodeMap, "", iConsecutive, false, "", false);

					if (iDaysOff < 1)
					{
						string msg = "Crew members must have {0:iConsecutive} consecutive rest days within the calendar month.";
						msg = StringUtils::Format(msg, iConsecutive);
						pCrew->legalMessage.push_back(msg);
						this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
						pCrew->isLegal = false;
						bReturn = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
						rv->startDTUtc = start;
						rv->endDTUtc = end;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						rv->operation_result.insert(pair<string, string>("COMPOSITIONS", rCompostions));
						rv->operation_result.insert(pair<string, string>("ATTRIBUTES", rAttributes));
						rv->operation_result.insert(pair<string, string>("FLIGHT NUMS", rFlights));
						rv->operation_result.insert(pair<string, string>("DO ASSIGNMENT GROUP", rDOGroup));
						rv->operation_result.insert(pair<string, string>("MIN CONSECUTIVE REST DAYS", rMinRest));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}
					}
				}
			}
		}
	}
	return bReturn;
}