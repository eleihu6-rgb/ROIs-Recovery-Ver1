/*
RuleTool模块：计算 recency
*/
#include <stdio.h>
#include <time.h>
#include <fstream>
#include "RuleTool.h"
#include "UtilFunc.h"



int RuleTool::reCalculateRecency(long long scenarioId, string startDt, string endDt) {

	bool success = false;
	int i = 0;
	int ret = 0;
	time_t startLoc = 0;
	time_t endLoc = 0;
	Scenario scenario;
	vector<string> emptyList;

	//20180410 ain, mantis#3104, 添加cmdline startDt/endDt检查
	if (!checkDateTimeStr(startDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", startDt.c_str());
		goto CLEANUP;
	}
	if (!checkDateTimeStr(endDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", endDt.c_str());
		goto CLEANUP;
	}

	startLoc = utcStrToUtc((char*)startDt.c_str());
	endLoc = utcStrToUtc((char*)endDt.c_str());
	//20180516 ain, mantis#3345, 数据源兼容 db/server 
	ret = dbData->loadData(scenarioId, startLoc, endLoc, 0, "", "", "", ""); //不指定base/rank/fleet/ruleSet/division
	if (ret != 0) {
		printf("load data fail %d\n", ret);
		goto CLEANUP;
	}
	//20190405 ain, mantis#5121, 添加数据检查
	if (dbData->scenario.category != "RO") {
		printf("ERROR: %lld is not a RO scenario\n", scenarioId);
		ret = ERR_PARAM;
		goto CLEANUP;
	}
	if (dbData->crewList.size() == 0) {
		printf("ERROR: no crew loaded in scenario %lld\n", scenarioId);
		ret = ERR_PARAM;
		goto CLEANUP;		
	}


	//按roster重算recency
	printf("computeCrewRecency\n");
	ret = computeCrewRecency(dbData.get(), scenarioId, "ROIS");
	if (ret != 0) {
		goto CLEANUP;
	}

	//save
	ret = dbData->saveRecency();
	if (ret != 0) {
		goto CLEANUP;
	}

CLEANUP:
	printf("reCalculateRecency end\n");
	if (ret != 0) {
		printf("ERROR: %d\n", ret);
	}
	return ret;
}
int RuleTool::reCalculateRecency(long long scenarioId) {

	bool success = false;
	int i = 0;
	int ret = 0;

	//load
	ret = dbData->loadData(scenarioId); 
	if (ret != 0) {
		printf("load data fail %d\n", ret);
		goto CLEANUP;
	}
	//20190405 ain, mantis#5121, 添加数据检查
	if (dbData->scenario.category != "RO") {
		printf("ERROR: %lld is not a RO scenario\n", scenarioId);
		ret = ERR_PARAM;
		goto CLEANUP;
	}
	if (dbData->crewList.size() == 0) {
		printf("ERROR: no crew loaded in scenario %lld\n", scenarioId);
		ret = ERR_PARAM;
		goto CLEANUP;
	}

	//按roster重算recency
	printf("computeCrewRecency\n");
	ret = computeCrewRecency(dbData.get(), scenarioId, "ROIS");
	if (ret != 0) {
		goto CLEANUP;
	}

	//save
	ret = dbData->saveRecency();
	if (ret != 0) {
		goto CLEANUP;
	}
CLEANUP:
	printf("reCalculateRecency end\n");
	if (ret != 0) {
		printf("ERROR: compute recency fail %d\n", ret);
	}
	return ret;
}