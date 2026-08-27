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
	各公司要充分考虑隔离对空勤人员心理、生理周期的影响，抓好各项工作落实，编排任务时要做到科学严谨，
	目前应按照每位空勤人员的隔离或集中管理时间累计每月不超过21天、连续3个月不超50天、每年不超180天执行；
	疫情隔离：Crew Manday表quarantine字段() - 0不隔离，1-集中隔离，2-居家隔离

法规ID：8119
 2022.10.30
项目：国航飞行派遣优化项目

流程：
	  1、当前组员ROSTERS时间范围内，根据规则重新计算疫情隔离数据，并更新Manday数据。（其他代码实现）
	  2、根据法规参数设置，检查历史日期范围内疫情隔离数据（本法规）。

 8119法规参数设置，检查一段时间内机组员工居家隔离/集中隔离/所有隔离的最大上限
	 BASES       - 机组基地，支持|分隔多个基地和通配符*，如PEK|CTU
	 RANKS     - 机组级别，支持|分隔多个级别和通配符*，如CAP|RFO
	 FLEETS    - 机组成员机型，支持|分隔多个机型和通配符*，如P77|P7R
	 CREW TEAMS - 机组员工组，支持|分隔多个员工组和通配符*，如AN|SP
	 以上4个参数，属于筛选组员的条件，即适用该隔离上限的员工
	 PERIOD - 时间范围，数字类型，如3
	 UNIT - 时间单位，字符类型，取值：CD日历天/CW日历周/CM日历月，如CM
	 TYPE - 隔离类型，Q - 集中隔离，H - 居家隔离，健康检测，A - 集中和居家隔离，如A
	 MAX LIMITS - 隔离天数的最大上限，整数数字类型，如12
*/


bool LegalityChecker::checkQuarantinePeriod(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strBases = "*", strRanks = "*", strFleets = "*", strTeams = "*", strPeriod, strUnit, strMax,strType = "Q";
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	//Bases,Ranks,Fleets,Crew Teams,Period,Unit,Prorated,Max Limits, TYPE
	/*
 	 8119 法规参数设置，检查一段时间内机组员工居家隔离/集中隔离/所有隔离的最大上限
	 BASES       - 机组基地，支持|分隔多个基地和通配符*，如PEK|CTU
	 RANKS     - 机组级别，支持|分隔多个级别和通配符*，如CAP|RFO
	 FLEETS    - 机组成员机型，支持|分隔多个机型和通配符*，如P77|P7R
	 CREW TEAMS - 机组员工组，支持|分隔多个员工组和通配符*，如AN|SP
	 以上4个参数，属于筛选组员的条件，即适用该隔离上限的员工
	 PERIOD - 时间范围，数字类型，如3
	 UNIT - 时间单位，字符类型，取值：CD日历天/CW日历周/CM日历月，如CM
	 TYPE - 隔离类型，C - 集中隔离，H - 居家隔离，健康检测，A - 集中和居家隔离，如A
	 MAX LIMITS - 隔离天数的最大上限，整数数字类型，如12
	*/
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
		if (header == "PERIOD")
			strPeriod = headeValue;
		if (header == "UNIT")
			strUnit = headeValue;
		if (header == "TYPE")
			strType = headeValue;
		if (header == "MAX LIMITS")
			strMax = headeValue;
	}

	int iMax = stoi(strMax);

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
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams,"*", lCheckedStart, lCheckedEnd))
		return true;

	map<time_t, time_t>::iterator iter_date;

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };

	vector<SharedPtr<CREW_MANDAY_FD>>& cfd = crew->mandayFdList;
	vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;
	vector<SharedPtr<CREW_BASE>>&  bases = crew->baseList;

	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	if (ranks.size() < 1 && strRanks != "*")
		return true;
	bool isFd = (crew->division == "P");

	string base = crew->getPrimeBase();

	if (base == "")
		base = "PEK";

	auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	if (isFd)
		stable_sort(cfd.begin(), cfd.end(), cmpFD);
	else
		stable_sort(cabin.begin(), cabin.end(), cmpCC);

	map<time_t, time_t>& mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(strUnit, strPeriod, lCheckedStart, lCheckedEnd, weekdayStartFrom, iOffsetMinutes);

	for (iter_date = mpRange.begin(); iter_date != mpRange.end(); ++iter_date)
	{
		if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, strTeams, (*iter_date).first, (*iter_date).second))
			continue;

		if (this->_application == ROSTER_OPTIMIZER && pCrew->RosterIndex >= 0)
		{
			if (!(Utility::GetInstancePtr()->isTimeOverlap(iter_date->first, iter_date->second, rosters[pCrew->RosterIndex]->actStrUtc, rosters[pCrew->RosterIndex]->actRestStrUtc))) {
				continue;
			}
		}

		if (!(Utility::GetInstancePtr()->isTimeOverlap(iter_date->first, iter_date->second, lCheckedStart, lCheckedEnd)))
			continue;

		int  iCumQuaran = 0, iCumHomeQuaran=0;
		if (isFd)
		{
			for (size_t j = 0; j < cfd.size(); j++)
			{
				if (cfd[j]->crewDateUtc >= iter_date->first && cfd[j]->crewDateUtc <= iter_date->second)
				{
					if (cfd[j]->QUARANTINE == 1)
						iCumQuaran += 1;
					if (cfd[j]->QUARANTINE == 2)
						iCumHomeQuaran += 1;
				}
			}
		}
		else
		{
			for (size_t j = 0; j < cabin.size(); j++)
			{
				if (cabin[j]->crewDateUtc >= iter_date->first && cabin[j]->crewDateUtc <= iter_date->second)
				{
					if (cfd[j]->QUARANTINE == 1)
						iCumQuaran += 1;
					if (cfd[j]->QUARANTINE == 2)
						iCumHomeQuaran += 1;
				}
			}
		}

		utcToLocalDtStr(iter_date->first, startUtcStr, sizeof(startUtcStr));
		utcToLocalDtStr(iter_date->second, endUtcStr, sizeof(endUtcStr));
		time_t startTime = iter_date->first;
		time_t endTime = iter_date->second;

		if ((iCumQuaran > iMax && strType=="C") || (iCumHomeQuaran > iMax && strType == "H") || (iCumHomeQuaran+ iCumHomeQuaran > iMax && strType == "A"))
		{
			bReturn = false;

			string message = "UTC: From {0:startUtcStr} to {1:endUtcStr}, the actual cumulative quarantine period ({2:Quarantine}) exceeds the maximum allowed of [{3:period} {4:unit}] {5:strMax}.";
			message = StringUtils::Format(message, startUtcStr, endUtcStr, iCumQuaran, strPeriod, strUnit, strMax);

			SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
			this->setLegalityMessage(ppCrew, pCrew, singleRule, message);

			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crew->idCrew;
			rv->startDTUtc = startTime;
			rv->endDTUtc = endTime;
			rv->violation_msg = message;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
			rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
			rv->operation_result.insert(pair<string, string>("Quarantine", std::to_string(iCumQuaran)));
			rv->operation_result.insert(pair<string, string>("strMax", strMax));
			rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strUnit + "]"));
			this->addRuleViolations(rv, singleRule);
			pCrew->isLegal = false;
			pCrew->skipCheckInLaterIterations = false;
			if (this->GetApplication() == ROSTER_OPTIMIZER) {
				return false;
			}
		}
	}
	return bReturn;
}