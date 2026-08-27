
#include "basicCalculation.h"
#include "UtilDbg.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "RuleStatistics.h"
#include "CustomBiz/CustomBiz.h"

#include <algorithm>
#include <math.h>

#include <chrono>
#include <ctime>
#include <iostream>
#include "RuleEngine.h"

int months_between(long start, long end)
{
	// 1. 将 long 类型时间值转换为时间点类型
	using namespace std::chrono;
	auto start_time_point = system_clock::from_time_t(start);
	auto end_time_point = system_clock::from_time_t(end);

	// 2. 将时间点转换为本地日期和时间
	time_t start_time = system_clock::to_time_t(start_time_point);
	time_t end_time = system_clock::to_time_t(end_time_point);

	auto start_tm = std::localtime(&start_time);
	auto end_tm = std::localtime(&end_time);

	// 3. 计算月份差异
	int months_diff = (end_tm->tm_year - start_tm->tm_year) * 12;
	months_diff += end_tm->tm_mon - start_tm->tm_mon;

	return months_diff;
}

/*
 系统流程：初始化装载时先清空historyCrewStatisticsList
*/
void BasicCalculation::clearCAFaireHistoryData(SharedPtr<CrewDataContext> data)
{
	string airline = data->scenario.airline;
	bool isFD = (data->scenario.division == "P");

	//飞行并且属于CA，先清空HISTORY_CREW_STATISTICS数据
	if (!(airline == "CA" && isFD))
		return;

	data->historyCrewStatisticsList.clear();

}

/*
  根据Manday的数据，计算从年初到优化场景前的统计数据，提供RO公平性/均衡性使用。
  仅在初始化时更新统计数据，提供给RO计算公平性使用。不用于法规检查。
  并且RO在分配、删除Roster等操作时，需自行维护该HISTORY_CREW_STATISTICS数据
*/
void BasicCalculation::calcualteCrewsStatistics(SharedPtr<CrewDataContext> data)
{
	string airline = data->scenario.airline;
	bool isFD = (data->scenario.division == "P");

	//飞行并且属于CA，先清空HISTORY_CREW_STATISTICS数据
	if (!(airline == "CA" && isFD))
		return;

	vector<SharedPtr<CREW>>& crews = data->crewList;
	if (crews.size() == 0) return;

	if (data->scenario.bases.size() == 0) return;
	string base = data->scenario.bases[0];
	int offsetMinutes = data->getAirportOffsetMinutes(base);

	time_t startTm = data->scenario.startDtUTC;
	time_t endTm = data->scenario.endDtUTC;

	time_t yearStartTm = Utility::GetInstancePtr()->getLocalYearStartInUTC(startTm, offsetMinutes);

	//int months = months_between(yearStartTm, endTm);
	map<time_t, time_t> monthWindows=Utility::GetInstancePtr()->getMonthRollingWindows(yearStartTm, endTm, offsetMinutes, 1);

	for (auto& crew : crews)
	{
		double ftPercentage = 1.0;
		//干部员工不参与公平性统计
		vector<SharedPtr<CREW_TEAM>>& crewTeams = crew->teamList;
		bool isMgmtCrew = true;
		for (auto& team : crewTeams)
		{
			if (crew->idCrew != team->idcrew) continue;

			if (team->effDt > endTm) continue;
			if (team->expDt > 0 && team->expDt < startTm) continue;
			
			//HardCode, 普通员工组：MGMT-EXCLUDE
			if (team->teamName == "MGMT-EXCLUDE")
			{
				isMgmtCrew = false;
			}
			else if (team->teamName == "CM60")
			{
				ftPercentage = 0.6;
			}
		}
		if (isMgmtCrew) continue;

		//获取Crew技术能力
		vector<SharedPtr<CREW_RANK>>& crewRanks = crew->rankList;
		string crewRank="", crewPosition = "";
		for (auto& rank : crewRanks)
		{
			if (crew->idCrew != rank->idCrew) continue;

			if (rank->effUtc > endTm) continue;
			if (rank->expUtc > 0 && rank->expUtc < startTm) continue;

			if (rank->rank == "SO") continue;
			crewRank = rank->rank;
			crewPosition = rank->position;
			break;
		}

		/*
			获取Crew的报务能力，HardCode：_reportQuals中资质
			国航独有逻辑，暂时Hardcode
			RTEW > RTEE > RTES > RTWW > RTWS > RTAW > RTAS
		*/
		vector<SharedPtr<CREW_QUALIFICATION>>& crewQuals = crew->qualificationList;
		string crewRadioQual = "";
		for (auto& qual : crewQuals)
		{
			if (crew->idCrew != qual->idCrew) continue;

			if (qual->issuedUtc > endTm) continue;
			if (qual->expiryUtc > 0 && qual->expiryUtc < startTm) continue;

			int level = _ruleEngine->_reportQuals[qual->qual];
			if (level == 0) continue; //不是报务资质

			if (crewRadioQual == "")
				crewRadioQual = qual->qual;
			else
			{
				//有更高报务资质
				if (level < _ruleEngine->_reportQuals[crewRadioQual])
					crewRadioQual = qual->qual;
			}
		}

		//crew的Manday数据
		vector<SharedPtr<CREW_MANDAY_FD>>& crewMandays = crew->mandayFdList;

		for (auto& window : monthWindows)
		{
			std::time_t t = static_cast<std::time_t>(window.first);
			std::tm *tm = std::localtime(&t);
			string month = std::to_string(tm->tm_mon + 1);

			double iTotalBLH = 0;
			long lTotalFltFairness = 0;
			double iTotalStandby = 0;

			for (auto& manday : crewMandays)
			{
				if (crew->idCrew != manday->idCrew) continue;

				if ((manday->crewDateUtc > window.second) || (manday->crewDateUtc < window.first)) continue;

				iTotalBLH += manday->ft;
				lTotalFltFairness += (int)manday->custData1;
				iTotalStandby += manday->CSB;
			}

			shared_ptr<HISTORY_CREW_STATISTICS> ref = std::shared_ptr<HISTORY_CREW_STATISTICS>(new HISTORY_CREW_STATISTICS());
			ref->crewId = crew->idCrew;
			ref->crewRank = crewRank;
			ref->crewPositions = crewPosition;
			ref->crewRadioQual = crewRadioQual;
			ref->month = month;
			ref->totalBlockMinutes = (int)iTotalBLH;
			ref->ftPercentage = ftPercentage;
			ref->totalFairness = lTotalFltFairness;
			ref->totalStandby = (int)iTotalStandby;
			data->historyCrewStatisticsList.push_back(ref);
		}
	}
}

/*
   相同Position和RadioQual的人员公平性：计算平均飞时和平均航班系数
*/

void updateDepartmentStatistics(LegalityChecker* rule, SharedPtr<CrewDataContext> data)
{
	string airline = data->scenario.airline;
	bool isFD = (data->scenario.division == "P");

	//飞行并且属于CA，先清空HISTORY_CREW_STATISTICS数据
	if (!(airline == "CA" && isFD))
		return;

	data->historyDepartmentStatisticsList.clear();

	vector<SharedPtr<HISTORY_CREW_STATISTICS>>& crewsStatistics = data->historyCrewStatisticsList;
}