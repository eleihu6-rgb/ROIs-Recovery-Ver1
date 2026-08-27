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

/*
原始需求：
	各公司要充分考虑隔离对空勤人员心理、生理周期的影响，抓好各项工作落实，编排任务时要做到科学严谨，
	目前应按照每位空勤人员的隔离或集中管理时间累计每月不超过21天、连续3个月不超50天、每年不超180天执行；
	疫情隔离：Crew Manday表quarantine字段() - 0不隔离，1-集中隔离，2-居家隔离

法规ID：8120
 2022.11.01
项目：国航飞行派遣优化项目

整体流程：
	  1、当前组员ROSTERS时间范围内，根据规则重新计算疫情隔离数据，并更新Manday数据。（本代码实现）
	  2、根据法规参数设置，检查历史日期范围内疫情隔离数据（非本法规，属于8119法规设置）。

 8120法规参数设置(隔离期定义法规)，设置居家隔离/集中隔离需要的天数
	 ATTRIBUTES -任务环标签，支持|分隔多个标签和通配符*，如7|8
	 FLIGHT NUMS - 航班号，支持|分隔多个航班号和通配符*，如CA101|CA102
	 CENTRALIZED QUARANTINE ASSIGNMENTS - 集中隔离预占的地面任务代码，支持|分隔多个标签和通配符*，如ISLN1|ISLN2
	 HOME  QUARANTINEASSIGNMENTS - 居家隔离或健康检测预占的地面任务代码，支持|分隔多个标签和通配符*，如ISLN3|ISLN4
	 CENTRALIZED QUARANTINE - 集中隔离天数，整数类型，如7
	 HOME  QUARANTINE- 健康检测天数，整数类型，如3

	 本代码：
	 1、读取法规参数设置，读取RO优化新分配任务，更新CrewManday数据
	 2、读取Roster预占任务环，更新CrewManday数据

	 流程和逻辑：
	 1、Rosters日期范围内的隔离数据初始化（重置成默认不隔离）
	 2、满足条件的任务环，在该Roster之后集中隔离、居家隔离的天数范围内，都更新crew manday隔离数据
	 3、满足条件的地面任务，直接更新任务所在天的Crew manday数据。
	 4、先更新2，再单独更新3，避免多个条件重置错误数据。地面任务优先满足条件的任务环。
*/


/*
   内部函数：查找机组Manday所在updateDate的日期数据，并把隔离数据更新成updateValue
   注：该函数有性能优化空间
*/
void updateCrewManday(time_t updateDate,bool isFd, vector<SharedPtr<CREW_MANDAY_FD>>& pilots, vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabins,int updateValue)
{
	bool bFind = false;
	if (isFd)
	{
		for (auto& pilot : pilots)
		{
			if (pilot->crewDateUtc == updateDate)
			{
				pilot->QUARANTINE = updateValue;
				bFind = true;
				break;
			}
		}
	}
	else
	{
		for (auto& cabin : cabins)
		{
			if (cabin->crewDateUtc == updateDate)
			{
				cabin->QUARANTINE = updateValue;
				bFind = true;
				break;
			}
		}
	}

	//新增manday对象
	if (!bFind)
	{
		if (isFd)
		{
			SharedPtr<CREW_MANDAY_FD> item(new CREW_MANDAY_FD());
			item->reset();
			item->crewDateUtc = updateDate;
			item->QUARANTINE = updateValue;
			pilots.push_back(item);
		}
		else
		{
			SharedPtr<CREW_MANDAY_CC_AM> item(new CREW_MANDAY_CC_AM());
			item->reset();
			item->crewDateUtc = updateDate;
			item->QUARANTINE = updateValue;
			cabins.push_back(item);
		}
	}
}

void LegalityChecker::setQuarantineByDefinition(RULE_LEGALITY * pCrew)
{
	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::CA_QUARANTINE_DEFINITION);
	for (auto& rule : rules)
	{
		setQuarantineByDefinition(pCrew, &rule);
	}
}


void LegalityChecker::setQuarantineByDefinition(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;

	string rAttributes = "*", rFlights = "*", rCentAssignments="*", rHomeAssignments ="*",rCentQuar,rHomeQuar;

	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		//法规参数设置
		if (header == "ATTRIBUTES")
			rAttributes = headeValue;
		if (header == "FLIGHT NUMS")
			rFlights = headeValue;
		if (header == "CENTRALIZED QUARANTINE ASSIGNMENTS")
			rCentAssignments = headeValue;
		if (header == "HOME QUARANTINE ASSIGNMENTS")
			rHomeAssignments = headeValue;
		if (header == "CENTRALIZED QUARANTINE")
			rCentQuar = headeValue;
		if (header == "HOME QUARANTINE")
			rHomeQuar = headeValue;
	}

	int iCentQuar = stoi(rCentQuar);
	int iHomeQuar = stoi(rHomeQuar);

	vector<string>  strAttributes, strCentAssignments,strHomeAssignments, strFlights;
	split(rAttributes, '|', strAttributes);
	split(rCentAssignments, '|', strCentAssignments);
	split(rHomeAssignments, '|', strHomeAssignments);
	split(rFlights, '|', strFlights);

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	string crewId = crew->idCrew;
	//if (crewId == "0000021190")
	//	printf("");

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return;

	vector<SharedPtr<CREW_MANDAY_FD>>& pilots = crew->mandayFdList;
	vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabins = crew->mandayCcAmList;

	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	if (ranks.size() < 1 )
		return ;
	bool isFd = (crew->division == "P");
	if (isFd)
		stable_sort(pilots.begin(), pilots.end(), cmpFD);
	else
		stable_sort(cabins.begin(), cabins.end(), cmpCC);

	string base = crew->getPrimeBase();

	if (base == "")
		base = "PEK";

	auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	
	//初始化Roster范围内Manday数据
	time_t firstDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[0]->actStrUtc, iOffsetMinutes);
	time_t lastDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[rosters.size() - 1]->actStrUtc, iOffsetMinutes);
	int iDays = static_cast<int>(lastDay - firstDay) / (24 * 60 * 60);
	for (int i = 0; i < iDays + 1; i++)
	{
		time_t updateDay = firstDay + i * (24 * 60 * 60);
		updateCrewManday(updateDay, isFd, pilots, cabins, 0);
	}

	for (auto& roster : rosters)
	{
		//地面任务是更新任务所在日期的Manday数据，而满足条件的任务环，在此之后若干天都更新成隔离数据
		if (roster->pairing)
		{
			//任务环标签是否包含法规设置
			bool bHas = false;
			if (rAttributes != "*")
			{
				string fltAttr = roster->pairing->getAttribute();

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

			bHas = false;
			if  (rFlights != "*")
			{
				vector<Duty *> duties = roster->pairing->getDutyVec();

				for (auto& duty : duties)
				{
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
								bHas = true;
						}
					}
					else
						bHas = true;
				}
			}
			else
				bHas = true;
			if (!bHas)
				continue;

			//第一入境点的第二天
			time_t dayStart = 0;
			vector<Duty *> duties = roster->pairing->getDutyVec();
			if (duties.size() == 0)
			{
				printf("Exception, duty size =0!");
			}

			vector<Segment *> segments = duties[duties.size() - 1]->getSegments();
			for (auto& segment : segments)
			{
				string arr=segment->getArrStation();
				string country = this->_dbData->findAirportCountry(arr);
				if (country == "CN")
				{
					dayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(segment->getEndTimeUtcAct(), this->_dbData->getAirportOffsetMinutes(arr));
					if (dayStart < segment->getEndTimeUtcAct())
						dayStart += 24 * 60 * 60;
					break;
				}
			}

			if (dayStart >= 0)
			{
				int iUpdateValue = 0;

				for (int i = 0; i < iCentQuar; i++)
				{
					time_t updateDay = dayStart + i * (24 * 60 * 60);
					updateCrewManday(updateDay, isFd, pilots, cabins, 1);

				}
				for (int i = iCentQuar; i < iCentQuar + iHomeQuar; i++)
				{
					time_t updateDay = dayStart + i * (24 * 60 * 60);
					updateCrewManday(updateDay, isFd, pilots, cabins, 2);
				}
			}
		}
	}

	//最后总体根据地面任务重置Manday数据（不能纳入上个循环原因，在于根据任务环逻辑可能错误设置Manday数据)
	for (auto& roster : rosters)
	{
		//地面任务是更新任务所在日期的Manday数据，而满足条件的任务环，在此之后若干天都更新成隔离数据
		if (!(roster->pairing))
		{
			string duty = roster->duty;

			time_t dayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster->actStrUtc, iOffsetMinutes);
			int iUpdateValue = 0;
			if (std::find(strCentAssignments.begin(), strCentAssignments.end(), roster->duty) != strCentAssignments.end())
			{
				iUpdateValue = 1;
			}
			if (std::find(strHomeAssignments.begin(), strHomeAssignments.end(), roster->duty) != strHomeAssignments.end())
			{
				iUpdateValue = 1;
			}
			updateCrewManday(dayStart, isFd, pilots, cabins, iUpdateValue);
		}
	}


}
