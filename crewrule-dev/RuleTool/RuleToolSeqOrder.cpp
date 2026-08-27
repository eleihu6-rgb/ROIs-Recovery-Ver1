/*
RuleTool模块：计算号位 rosterFlight.seqOrder
*/
#include <stdio.h>
#include <time.h>
#include <fstream>
#include "RuleTool.h"
//#include "UtilFunc.h"
#include "UtilFunc.h"
#include "OrLog.h"

//20190914 ain, OP#2279, 重算历史号位
int RuleTool::reCalculateSeqOrder(long long scenarioId, string startDt, string endDt) {
	bool success = false;
	int ret = 0;
	int i = 0;
	time_t startLoc = 0;
	time_t endLoc = 0;
	

	printf(">> calculate start %s %s\n", startDt.c_str(), endDt.c_str());

	//20180410 ain, mantis#3104, 添加cmdline startDt/endDt检查
	if (!checkDateTimeStr(startDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", startDt.c_str());
		goto CLEANUP;
	}
	if (!checkDateTimeStr(endDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", endDt.c_str());
		goto CLEANUP;
	}

	printf("load data...\n");
	startLoc = utcStrToUtc((char*)startDt.c_str());
	endLoc = utcStrToUtc((char*)endDt.c_str());
	ret = dbData->loadData(scenarioId, startLoc, endLoc, 0, "", "", "", ""); //不指定base/rank/fleet/ruleSet
	if (ret != 0) {
		printf("load data fail %d\n", ret);
		goto CLEANUP;
	}

	//reset seqOrder=0
	for (auto& it : dbData->crewIdMap) {
		auto& crewId = it.first;
		for (auto& rosterFlight : dbData->rosterFlightMgr.get(crewId)) {
			rosterFlight->seqOrder = 0;
		}
	}

	printf("init ruleEngine...\n");
	_legality->setDataContext(dbData);

	//调用rule 重新计算,manday计算结果保存在各个 crew.mandayList
	printf("crews.size=%d\n", dbData->crewList.size());
	printf("pairings.size=%d\n", dbData->pairingList.size());

	//计算
	printf("calculate rosterFlight.seqOrder...\n");
	for (Pairing * pg : dbData->pairingList) {
		_legality->recalculatePairingSeqOrder(pg, dbData);
	}

	//ruleEngine计算seqOrder失败可能赋值 seqOrder=-2以传递出错警告，save前清理负值seqOrder
	for (auto& it : dbData->crewIdMap) {
		auto& crewId = it.first;
		for (auto& rosterFlight : dbData->rosterFlightMgr.get(crewId)) {
			if (rosterFlight->seqOrder < 0)
				rosterFlight->seqOrder = 0;
		}
	}

	//保存结果
	printf("save result...\n");
	ret = dbData->saveSeqOrder();
	if (ret != 0) {
		printf("save fail %d\n", ret);
		goto CLEANUP;
	}

	printf("success\n");
CLEANUP:
	printf("<< calculate END\n");
	return ret;	
}