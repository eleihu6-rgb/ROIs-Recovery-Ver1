#include <stdio.h>
#include <algorithm>
#include <vector>

#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

using namespace std;

//针对传入crew上roster计算 recency
//1、移除旧 recency，但保留0场景盆
//2、遍历crew/roster/sement，计算recency
//3、计算结果保存在 dataCtx->recencyMgr中
//assignmentNameMap: 判断segment是否需要计算recency
//crewRecencyMap:    输入为已有结果，输出为计算结果
//成功返回0，失败返回错误码
int computeCrewRecency(CrewDataContext* dataCtx, long long scenarioId, string modifyUser) {
	//mantis#2635, 修正将remove 旧recency放在循环外, 避免循环中错误清空上一循环结果
	dataCtx->recencyMgr.removeRecencyNotInScenario(0);

	for (auto& crew : dataCtx->crewList) {
		computeSingleCrewRecency(dataCtx, crew, scenarioId, modifyUser);
	}
	return 0;
}


//mantis#1828
//计算单个 roster -> recency, 计算结果加入 result
void computeSingleRosterRecency(SharedPtr<ROSTER>& roster, CrewDataContext* dataCtx, long long scenarioId, string modifyUser) {
	//mantis#1958, 计算recency包括0场景预占
	if (roster->idscenario != scenarioId && roster->idscenario != 0)
		return;
	if (roster->pairing == NULL)
		return;

	for (auto& duty : roster->pairing->getDutyVec()) {
		for (auto& segment : duty->getSegments()) {
			string assignment = segment->getAssignment();
			if (dataCtx->assignmentNameMap.find(assignment) == dataCtx->assignmentNameMap.end()) {
				Logger::getRuleLogger()->error("ERROR: invalid data, segment.asssignment={} not in assignmentNameMap", assignment.c_str());
				continue;
			}
			if (!dataCtx->assignmentNameMap[assignment]->isRecency) {
				continue;
			}
			//make new recencyy data
			SharedPtr<CrewRecency> item(new CrewRecency);
			item->scenarioId = scenarioId;
			item->idcrew = roster->idcrew;
			item->crewDateUtc = segment->getStartTimeUtcSch();
			item->crewDateLoc = utcToLocal(item->crewDateUtc);
			item->depAirport = segment->getDepStation();
			item->arvAirport = segment->getArrStation();
			item->operate = segment->getAssignment();
			item->fleet = segment->getFleetCD();
			item->actingRank = roster->actingRank;
			item->role = roster->role;
			item->rosterId = roster->rosterId;
			item->status = "A";
			item->iduser = modifyUser;
			item->tmst = time(0);

			//若为新出现recency，则insert
			//否则对比是否时间更新，是则替换
			//if (result.find(item) == result.end()) {
			dataCtx->recencyMgr.addRecency(item);
			//}
			//else {
			//	auto& itemAlreadyExist = result.find(item);
			//	if ((*itemAlreadyExist)->crewDateUtc < item->crewDateUtc) {
			//		(*itemAlreadyExist)->copy(item.get());
			//	}
			//}
		}
	}
	return;
}

//针对传入crew上roster计算 recency
//scenarioId:        只计算当前场景roster，按参数判断
//assignmentNameMap: 判断segment是否需要计算recency
//成功返回0，失败返回错误码
int computeSingleCrewRecency(CrewDataContext* dataCtx, SharedPtr<CREW>& crew, long long scenarioId, string modifyUser) {
	int ret = 0;
	int i = 0;

	for (auto& roster : crew->rosterList) {
		computeSingleRosterRecency(roster, dataCtx, scenarioId, modifyUser);
	}
	return ret;
}

//按scenarioId筛选
//按时间范围筛选
//按相同 crewId/dep/arv/fleet/role/rank筛选最新recency
//return: 0=success, other=err
int filterLatestRecency(long long scenarioId, time_t startUtc, time_t endUtc, RecencyMgr& mgr, vector<SharedPtr<CrewRecency>>& result) {
	stringstream ss;
	map<string, SharedPtr<CrewRecency>> filterMap;
	for (auto& recencyOfCrew : mgr.getRecencyMap()) {
		string crewId = recencyOfCrew.first;
		for (auto& recencyList : recencyOfCrew.second) {
			for (auto& recency : recencyList.second) {

				if (recency->scenarioId != scenarioId) {
					continue;
				}
				if (recency->crewDateUtc  < startUtc || recency->crewDateUtc > endUtc) {
					continue;
				}

				ss.str("");
				ss << recency->idcrew;
				ss << "::" << recency->depAirport;
				ss << "::" << recency->arvAirport;
				ss << "::" << recency->fleet;
				ss << "::" << recency->actingRank;
				ss << "::" << recency->role;

				string key = ss.str();
				if (filterMap.find(key) == filterMap.end()
					|| filterMap[key]->crewDateUtc < recency->crewDateUtc) {
					filterMap[key] = recency;
				}
			}
		}
	}

	//汇总 filterMap结果为vector
	for (auto& it : filterMap) {
		result.push_back(it.second);
	}
	return 0;
}
