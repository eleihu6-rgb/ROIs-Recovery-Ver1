/*
RuleTool模块：自动测试
1、遍历输入dir下子目录
2、每一个目录作为一个 test case，读入其中input.txt
3、输入output.txt
4、与 expect_output.txt对比
*/
#include <sys/stat.h> 
#include <stdio.h>
#include <time.h>
#ifdef WIN32
#include <direct.h>
#endif
//#include <direct.h>
#include <algorithm>
#include <fstream>
#include "RuleTool.h"
#include "UtilFunc.h"
#include "CustomBiz/CustomBiz.h"
#include "RuleParams.h"
#include "PairingAttrCalculator.h"
#include "GroundAttrCalculator.h"

int RuleTool::reCalculatePairingTag(long long scenarioId, string startDt, string endDt, string division) {
	int ret = 0;
	int i = 0;
	time_t startLoc = 0;
	time_t endLoc = 0;

	//20180410 ain, mantis#3104, 添加cmdline startDt/endDt检查
	if (!checkDateTimeStr(startDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", startDt.c_str());
		return ret;
	}
	if (!checkDateTimeStr(endDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", endDt.c_str());
		return ret;
	}

	startLoc = utcStrToUtc((char*)startDt.c_str());
	endLoc = utcStrToUtc((char*)endDt.c_str());
	//20180321 ain, mantis#2985, 数据源兼容 db/server 
	ret = dbData->loadData(scenarioId, startLoc, endLoc, 0, "", "", "", division); //不指定base/rank/fleet/ruleSet/division
	if (ret != 0) {
		printf("load data fail %d\n", ret);
		return ret;
	}
	
	//计算
	PairingAttributeCalculator pairingAttrCalculator(dbData->scenario.airline, dbData->flightList, dbData->routeList, dbData->attributeIdMap, dbData->airportCodeMap, dbData->assignmentNameGroupMap, dbData->rankMap, dbData->tagCategoryList, dbData->tagFlightGroupMap, dbData->tagDutyGroupMap,
		dbData->tagPairingGroupMap, dbData->tagGroupTableMap, dbData->tagGroupMap, dbData->tagFlightCompositionGroupMap);
	if (dbData->version == 3) {
		pairingAttrCalculator.calculateAndSetPairingTag(dbData->pairingList);
	}
	GroundAttributeCalculator groundAttrCalculator(dbData->scenario.airline, dbData->airportCodeMap, dbData->assignmentNameGroupMap, dbData->assignmentNameMap, dbData->tagCategoryList, dbData->tagRosterGroundGroupMap, dbData->tagGroupTableMap, dbData->tagGroupMap);
	groundAttrCalculator.calculateAndSetGroundTag(dbData->rosterList);

	dbData->savePairingTag();
	return ret;
}
