#include <stdio.h>
#include <time.h>
#include <iostream>
#include <sstream>
#include <fstream>
#include <string>
#include <omp.h>
#include <unordered_map>
#include <unordered_set>
#include <sys/timeb.h>
#include <direct.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
//#include "JsonPairing.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "StringUtil.h"
//#include "..\RuleExport\rule.h"
#include "OrLog.h"
#include "indexCrewBaseRankFleet.h"
#include "UtilDbg.h"
#include "index2dArray.h"
#include "UtilFunc.h"
#include "..\RuleEngine\RuleEngine.h"
//#include "..\RuleEngine\RuleEngine.h"
#include "OrLog.h"
#include "httpUtil.h"

using namespace std;

//说明:
//1 test http server rest api
//2 send / receive http req by mongoose
//3 call restful api: 
//  /api/orengine/ro/solution
//  /api/scenario/roster/deletebyscenario
//  /api/orengine/ro/comptxt
//
void testHttpServer(long long scenarioId) {
	int ret = 0;
	LegalityChecker ruleEngine(ROSTER_EDITOR);
	SharedPtr<CrewDataContext> dbData(new CrewDataContext(CREW_APP_TYPE_OR, true));//CREW_APP_TYPE_RULESRV
	ret = dbData->loadData(scenarioId);
	//dbData->loadDataCsv("ro_input.txt");
	//dbData->loadDataFromHttpServer(scenarioId);
	if (ret == SUCCESS) {
		printf("load data OK\n");
	}
	else {
		printf("load data fail\n");
	}
	//ret = dbData->loadDataCsv("scenario_data.csv.txt");
	//dbData->saveScenarioCsv("scenario_data.csv.txt");

	printf("saveDataToHttpServer(ro_output.gz)...\n");
	ret = dbData->saveDataToHttpServer("ro_result_output.txt");
	if (ret != SUCCESS) {
		printf("save data fail %d\n", ret);
	}

	printf("clearScenario()...\n");
	string url = dbData->configDataSourceUrl + "/api/scenario/roster/deletebyscenario";
	const char * contentType = "application/json";
	char postBuf[256] = { 0 };
	int postLen = _snprintf(postBuf, sizeof(postBuf), "%lld", scenarioId);
	string token = "";
	ret = sendHttpReq(url, token, contentType, postBuf, postLen, "test_http_response.txt");
	if (ret != SUCCESS) {
		printf("clear scenario fail %d\n", ret);
	}

	printf("loadScenario 2nd...\n");
	SharedPtr<CrewDataContext> dbData2(new CrewDataContext(CREW_APP_TYPE_OR, true));//CREW_APP_TYPE_RULESRV
	ret = dbData2->loadData(scenarioId);
	if (ret != SUCCESS) {
		printf("load data 2nd fail %d\n", ret);
	}
	printf("end\n");
	getchar();
}