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
#include "utils/StringUtils.h"
// #include "customBiz\customBiz.h"
#include "CustomBiz/CustomBiz.h"

/*
 2019.7.17 sgq
 该法规和checkMaxCummulative函数功能从代码角度重复，考虑将来整合到一起。
 但是目前Cumulative表没有保存fatigue数据，无法复用现有代码，所以新建8105
 条件具备后，代码重构
 功能：检查某一段时间内，遍历CREW的 Roster里Pairing对象，累积Fatiguie，和限制对比
 限制：crew对象下roster数据的日期范围
*/
bool LegalityChecker::checkMaxCummuFatigue(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	if (pCrew->crewIndex < 0 || pCrew->crewIndex >= (int)this->_dbData->crewList.size())
	{
		printf("Exception in 8105: crew index out of index!");
		return true;
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	if (crew->rosterList.size() == 0)
		return true;
	//if (crew->idCrew == "A00178")
	//	printf("");

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string maxValue, period, period_type, strBase, strRank, strFleet;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")
			strBase = headeValue;
		if (header == "RANKS")
			strRank = headeValue;
		if (header == "FLEETS")
			strFleet = headeValue;

		if (header == "MAX FATIGUE LIMITS") maxValue = headeValue;
		if (header == "PERIOD")  period = headeValue;
		if (header == "UNIT") period_type = headeValue;
	}
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
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

	double iMaxLimit = stod(maxValue);
	int iPeriod = stoi(period);

	//check datetime boundary
	int numOfDaysInScenario = static_cast<int>(this->_dbData->scenario.endDtUTC - this->_dbData->startUtc) / (24 * 3600);

	int offsetMinutes  = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(lCheckedStart);
	time_t rollingWindow_start, rollingWindow_end;
	int iRollingUnit = 60 * 60;
	map<time_t, time_t> mtt;
	if (period_type == "RH")
	{
		if (iPeriod > numOfDaysInScenario * 24)
		{
			//cout << "Exception in 8105: unsupported data/time range." 
			//	<< " periodType=" << period_type
			//	<< " iPeriod_Rule8105[iPeriod]=" << iPeriod
			//	<< " numOfDaysInScenario=" << numOfDaysInScenario
			//	<< endl;
			return true;
		}

		rollingWindow_start = lCheckedStart - iPeriod * 60 * 60;
		rollingWindow_end = lCheckedEnd + iPeriod * 60 * 60;
		mtt = Utility::GetInstancePtr()->getRollingWindows(iPeriod * 60, rollingWindow_start, rollingWindow_end, iRollingUnit);

	}
	else if (period_type == "CD")
	{
		if (iPeriod > numOfDaysInScenario)
		{
			//cout << "Exception in 8105: unsupported data/time range." 
			//	<< " periodType=" << period_type
			//	<< " iPeriod_Rule8105[iPeriod]=" << iPeriod
			//	<< " numOfDaysInScenario=" << numOfDaysInScenario 
			//	<< endl;
			return true;
		}
		int cd = 24 * 60 * 60;
		if (this->GetApplication() == ROSTER_OPTIMIZER && pCrew->RosterIndex >= 0)
		{

			rollingWindow_start = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[pCrew->RosterIndex]->actStrUtc, offsetMinutes) - iPeriod * cd;
			rollingWindow_end = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[pCrew->RosterIndex]->actEndUtc, offsetMinutes) + iPeriod * cd;
		}
		else
		{
			rollingWindow_start = Utility::GetInstancePtr()->getLocalDayStartInUTC(lCheckedStart - iPeriod * cd, offsetMinutes);
			rollingWindow_end = Utility::GetInstancePtr()->getLocalDayStartInUTC(lCheckedEnd + iPeriod * cd, offsetMinutes) + cd;
		}
		iPeriod = iPeriod * 24;
		iRollingUnit = iRollingUnit * 24;
		mtt = Utility::GetInstancePtr()->getRollingWindows(iPeriod * 60, rollingWindow_start, rollingWindow_end, iRollingUnit);
	}
	else if (period_type == "CM")
	{
		if (iPeriod > 1)
		{
			//cout << "Exception in 8105: unsupported data/time range." 
			//	<< " periodType=" << period_type
			//	<< " iPeriod_Rule8105[iPeriod]=" << iPeriod
			//	<< " numOfDaysInScenario=" << numOfDaysInScenario
			//	<< endl;
			return true;
		}
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
		mtt = Utility::GetInstancePtr()->getMonthRollingWindows(rollingWindow_start, rollingWindow_end, offsetMinutes, iPeriod);

	}
	else
	{
		string error = "Exception in 8105: not supported parameters:" + period_type;
		printf(error.c_str());
		return true;
	}
	for (map<time_t, time_t>::iterator ix = mtt.begin(); ix != mtt.end(); ++ix)
	{
		double fatigue = 0;
		for (auto& roster : rosters)
		{
			if (!(Utility::GetInstancePtr()->isTimeOverlap(roster->actStrUtc, roster->actRestStrUtc, ix->first, ix->second)))
				continue;
			if (!(roster->pairing))
				continue;
			double points=roster->pairing->getTotalFatiguePoints();
			if (points <= 0)
				continue;

			time_t start = max(roster->actStrUtc, ix->first);
			time_t end = min(roster->actRestStrUtc, ix->second);
			double ratio = 1.0 * ((end - start) / (roster->actRestStrUtc - roster->actStrUtc));
			fatigue += (points * ratio);
		}

		if (fatigue > iMaxLimit)
		{
			char startUtcStr[30] = { 0 };
			char endUtcStr[30] = { 0 };
			Utility::GetInstancePtr()->UTCToUTCStr(ix->first + offsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
			Utility::GetInstancePtr()->UTCToUTCStr(ix->second + +offsetMinutes * 60, endUtcStr, sizeof(endUtcStr));

			string actFatigue = Utility::GetInstancePtr()->iToa((int)fatigue);
			string msg = "The actual fatigue level ({0:actFatigue}) exceeds the maximum allowed value ({1:maxValue}) in the [UTC: {2:startUtcStr} - {3:endUtcStr}] window for this {4:period} {5:period_type}.";
			msg = StringUtils::Format(msg, actFatigue, maxValue, startUtcStr, endUtcStr, period, period_type);

			SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
			this->setLegalityMessage(ppCrew, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crew->idCrew;
			rv->startDTUtc = ix->first;
			rv->endDTUtc = ix->second;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
			rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
			rv->operation_result.insert(pair<string, string>("actFatigue", actFatigue));
			rv->operation_result.insert(pair<string, string>("maxFatigue", maxValue));
			rv->operation_result.insert(pair<string, string>("period", period));
			rv->operation_result.insert(pair<string, string>("period_type", period_type));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
	}
	return true;
}
