#include <iostream>
#include <fstream>
#include "UtilFunc.h"
#include "FileDirUtil.h"
#include "RuleTool.h"
#include "ErrorCodeDef.h"

using namespace std;
/*
说明：
1 exe返回0表示成功，否则为错误码
2 manday功能：
  功能：重新计算指定场景指定时间段内manday
       参数 manday scenarioId + startDt + endDt，如 ruleTool.exe manday 2365 2015-3-1 2015-4-1
3 导出pairing
  功能：按po结果质量检查工具导出pairing到txt
       参数 export-pairing scenarioId，如 ruleTool.exe export-pairing 3778
  
*/

//error code
#define SUCCESS                       0
#define ERR_DB_INIT                   1
#define ERR_DB_CONN_CREATE            2
#define ERR_DB_STMT_CREATE            3
#define ERR_DB_STMT_PREPARE           4
#define ERR_DB_BIND                   5
#define ERR_DB_EXEC                   6
#define ERR_DB_DATA                   7     //invalid data, eg NULL
#define ERR_PARAM                   100
#define ERR_UNSUPPORT               101     //
#define ERR_EXCEPT           0xFFFFFFFF

//20190523 ain, mantis#5276, 编译时间
const char buildTime[100] = "Build time: " __DATE__ " " __TIME__ ".";
#ifndef CREWRULE_GITHASH
#define CREWRULE_GITHASH "N/A"
#endif
const char crewRuleGitHash[128] = CREWRULE_GITHASH;

string dbConn = "121.40.48.189:10000/orcl";
string dbUsername = "CREW_DEV_07";
string dbPassword = "rois07";

int main_func(int argc, char **argv);
void readDbConfig(string filename);
bool isPairingIdStr(char* str);
int mainProcManday(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcSeqOrder(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcRecency(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcExportPairing(int argc, char** argv, bool hasArgUser, string airline, RuleTool &tool);
int mainProcPoAnalys(int argc, char** argv, RuleTool &tool);
int mainProcImportPairing(int argc, char** argv, bool hasArgUser, string airline, RuleTool &tool);
int mainProcMergeGroup(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcAutoTest(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcScenario(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcScenStatus(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcChangeFlt(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcChangeTag(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcSaveOR(int argc, char** argv, bool hasArgUser, RuleTool &tool);
int mainProcRefreshDP(int argc, char** argv, bool hasArgUser, RuleTool& tool);
string getParamValue(const string& paramStr);

//增加 __try __except处理，避免运行过程中弹出crash提示框，导致没有人工点击进程无法结束
int except_handler(unsigned int code, struct _EXCEPTION_POINTERS *ep) {
	printf("ExceptionCode=0x%08x\n", code);
	return 1;
}

//main: SEH
//捕获 SEH异常
int main(int argc, char **argv) {
	int ret = 0;
	//try {
		Logger::getRuleLogger()->info("{}", buildTime);
		Logger::getRuleConsoleLogger()->info("{}", buildTime);
		Logger::getRuleLogger()->info("Rule githash: {}", crewRuleGitHash);
		Logger::getRuleConsoleLogger()->info("Rule githash: {}", crewRuleGitHash);
		printProcessIdFile();
		ret = main_func(argc, argv);
	//}
	//catch (except_handler(GetExceptionCode(), GetExceptionInformation())) {
	//	cout << ("ERROR: Exception occur!\n") << endl;
	//	ret = ERR_EXCEPT;
	//}
	return ret;
}

//print usage
void printUsage() {
	printf("Usage:\n");
	printf("Usage: RuleTool [function] ...\n");
	printf("Usage: PO Analys            RuleTool.exe poAnalys [scenarioId] [minLtMins] [minLoMins]\n");
	printf("Usage: Compute seqOrder     RuleTool.exe seqOrder [scenarioId] [startDate(YYYY-MM-DD)] [endDate] \n");
	printf("Usage: Compute manday       RuleTool.exe manday [scenarioId] [startDate(YYYY-MM-DD)] [endDate] [Debug(Y/N)]\n");
	printf("Usage: Compute manday       RuleTool.exe manday [scenarioId] [pairingIds] [Debug(Y/N)]\n");
	printf("Usage: Compute manday       RuleTool.exe manday byCrew [scenarioId] [crewIdStr(eg. A0001,A0002)] [startDate] [endDate] [Debug(Y/N)]\n");
	printf("Usage: Compute recency      RuleTool.exe recency [scenarioId] [startDate] [endDate]\n");
	printf("Usage: Check rules          RuleTool.exe scenario [scenarioId]\n");
	printf("Usage: Merge Scenario-Group RuleTool.exe merge_group [scenarioId] [user=xxx]\n");
	printf("Usage: Export Scenario      RuleTool.exe scenario [scenarioId]\n");
	printf("Usage: AutoTest             RuleTool.exe autotest [dir]\n");
	printf("Usage: Scenario-Status      RuleTool.exe scenario_status [scenarioId] [status] [user=xxx]\n");
	printf("Usage: Change Flight        RuleTool.exe change_flight [scenarioId] [flightIdList] [user=xxx]\n");
	printf("Usage: Change Flight ByDate RuleTool.exe change_flight [scenarioId] [startDt(YYYY-MM-DD)] [endDt(YYYY-MM-DD)]\n");
	printf("Usage: Import-Pairnig       RuleTool.exe import-pairing [scenarioId] import_file\n");
	printf("Usage: Import-Pairnig       RuleTool.exe import-pairing-zh [scenarioId] import_file\n");
	printf("Usage: Export-Pairnig       RuleTool.exe export-pairing [scenarioId]\n");
	printf("Usage: Export-Pairnig       RuleTool.exe export-pairing-zh [scenarioId] file [csvFileName] \n");
	printf("Usage: Export-Pairnig       RuleTool.exe export-pairing-mf [scenarioId] OR export-pairing-mf file [csvFileName] [utc/loc] [outputTimeZone 7/8/9...]\n");
	printf("Usage: Save-OR              RuleTool.exe save-or [PO|RO] [filename]\n");
	printf("Usage: *                    default [utc/loc]=utc\n");
	printf("Usage: *                    default [outputTimeZone=0,1,2,...]=0, only work for utc mode\n");
}

//main
int main_func(int argc, char** argv) {
	char * paramFunc = 0;
	bool success = 0;
	int ret = 0;

	if (argc < 2) {
		printUsage();
		return 0;
	}
	paramFunc = argv[1];

	readDbConfig("Database_connection.txt");
	RuleTool &tool = RuleTool::getInstance();
	tool.setDbConfig(dbConn, dbUsername, dbPassword);
	//tool.setUsername(retriveStrArgInCmdline(argc, argv, "username"));
	for (int i = 0; i < argc; i++) {
		printf("%s ", argv[i]);
	}
	printf("\n");

	try {
		//20180820 ain, mantis#3573, ruleTool解析参数username
		bool hasArgUser = checkArgInCmdLine(argc, argv, "username");
		if (hasArgUser) {
			string user = retriveStrArgInCmdline(argc, argv, "username");
			cout << "USER: " << user << endl;
			tool.setLoginUser(user);
		}

		bool hasHost = checkArgInCmdLine(argc, argv, "host");
		if (hasHost) {
			string serverAddr = retriveStrArgInCmdline(argc, argv, "host");
			cout << "serverAddr: " << serverAddr << endl;
			tool.setServerAddr(serverAddr);
		}
		if (0 == strcmp("poAnalys", paramFunc)) {
			ret = mainProcPoAnalys(argc, argv, tool);
		}
		else if (0 == strcmp("manday", paramFunc)) {
			ret = mainProcManday(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("seqOrder", paramFunc)) {
			ret = mainProcSeqOrder(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("recency", paramFunc)) {
			ret = mainProcRecency(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("scenario", paramFunc)) {
			ret = mainProcScenario(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("export-pairing", paramFunc)) {
			ret = mainProcExportPairing(argc, argv, hasArgUser, "", tool);
		}
		else if (0 == strcmp("export-pairing-mf", paramFunc)) {
			ret = mainProcExportPairing(argc, argv, hasArgUser, "mf", tool);
		}
		else if (0 == strcmp("export-pairing-zh", paramFunc)) {
			ret = mainProcExportPairing(argc, argv, hasArgUser, "zh", tool);
		}
		else if (0 == strcmp("import-pairing", paramFunc)) {
			ret = mainProcImportPairing(argc, argv, hasArgUser, "", tool);
		}
		else if (0 == strcmp("import-pairing-zh", paramFunc)) {
			ret = mainProcImportPairing(argc, argv, hasArgUser, "zh", tool);
		}
		else if (0 == strcmp("merge_group", paramFunc)) {
			ret = mainProcMergeGroup(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("autotest", paramFunc)) {
			ret = mainProcAutoTest(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("scenario_status", paramFunc)) {
			ret = mainProcScenStatus(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("change_flight" , paramFunc)) {
			ret = mainProcChangeFlt(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("change_tag", paramFunc)) {
			ret = mainProcChangeTag(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("save-or", paramFunc)) {
			ret = mainProcSaveOR(argc, argv, hasArgUser, tool);
		}
		else if (0 == strcmp("refresh_dp", paramFunc)) {
			ret = mainProcRefreshDP(argc, argv, hasArgUser, tool);
		}
		else {
			printf("ERROR: unknown parameter '%s'\n", paramFunc);
			ret = ERR_PARAM;
		}
	}
	catch (char * ex) {
		printf("EXCEPTION: %s\n", ex);
	}
	catch (string& ex) {
		printf("EXCEPTION: %s\n", ex.c_str());
	}
	catch (exception& ex) {
		printf("EXCEPTION: %s\n", ex.what());
	}
	catch (...) {
		printf("EXCEPTION: unknown\n");
	}
	printf("done\n");

	//20181112 ain, mantis#3902, 输出文件'END_OF_RUN.txt',描述执行是否成功
	writeEndOfRun(ret, "");
	return ret;
}

int mainProcManday(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	int ret = 0;
	if (argc < 2) {
		printUsage();
		exit(1);
	}
	string argv2 = argv[2];
	if (argv2 == "byCrew") {
		long long scenarioId = atoll(argv[3]);
		//2191202 ain, mantis#7197, 若参数长度达到8192则文件传参, 按命令行参数值格式是否'paramN.txt"
		string crewIdStr = getParamValue(argv[4]);
		string startDt = argv[5];
		string endDt = argv[6];
		string division = argv[7];

		ret = tool.reCalculateMandayByCrew(scenarioId, crewIdStr, startDt, endDt, division);
	}
	else {
		long long scenarioId = atoll(argv[2]);
		int mandayArgCount = argc - (hasArgUser ? 1 : 0);
		string argv3 = mandayArgCount > 3 ? getParamValue(argv[3]) : "";
		if (mandayArgCount > 3 && isPairingIdStr((char*)argv3.c_str())) {
			//参数模式: ruleTool.exe manday 0 26093602,26093615
			//2191202 ain, mantis#7197, 若参数长度达到8192则文件传参, 按命令行参数值格式是否'paramN.txt"
			string pairingIdStr = getParamValue(argv[3]);

			ret = tool.reCalculateMandayByPairing(scenarioId, pairingIdStr);
		}
		else if (mandayArgCount < 4) {
			//参数模式: ruleTool.exe manday 6320
			ret = tool.reCalculateManday(scenarioId);
		}
		else {
			//参数模式: ruleTool.exe manday 6320 2018-5-1 2018-5-31
			string startDt = argv[3];
			string endDt = argv[4];
			string division = "";
			if (mandayArgCount > 5)
			{
				division = argv[5];
				//isDebug = (debug == "Y");
			}
			/*if (isDebug)
				tool.setDebugMode(true);*/
			ret = tool.reCalculateManday(scenarioId, startDt, endDt, division);
		}
	}
	return ret;
}

int mainProcSeqOrder(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	int ret = 0;
	if (argc < 4) {
		printUsage();
		exit(1);
	}

	//参数模式: ruleTool.exe manday 6320 2018-5-1 2018-5-31
	long long scenarioId = atoll(argv[2]);
	string startDt = argv[3];
	string endDt = argv[4];
	ret = tool.reCalculateSeqOrder(scenarioId, startDt, endDt);
	
	return ret;
}

int mainProcRecency(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	int ret = 0;
	if (argc < 2) {
		printUsage();
		exit(1);
	}

	long long scenarioId = atoll(argv[2]);
	if (argc < 4) {
		ret = tool.reCalculateRecency(scenarioId);
	}
	else {
		string startDt = argv[3];
		string endDt = argv[4];
		ret = tool.reCalculateRecency(scenarioId, startDt, endDt);
	}
	return ret;
}
int mainProcExportPairing(int argc, char** argv, bool hasArgUser, string airline, RuleTool &tool) {
	int ret = 0;
	if (airline == "") {
		if (checkArgInCmdLine(argc, argv, "loc") && checkArgInCmdLine(argc, argv, "outputTimeZone")) {
			Logger::getRuleLogger()->error("invalid param, outputTimeZone only work for utc mode");
			return -1;
		}
		//utc/loc & tmZone
		string utcOrLoc = checkArgInCmdLine(argc, argv, "loc") ? "loc" : "utc";
		int outputTimeZoneHour = retriveIntArgInCmdline(argc, argv, "outputTimeZone");
		//导出pairing
		if (0 == strncmp(argv[2], "file", strlen("file"))) {
			char* csvFile = argv[3];
			tool.exportPairing(csvFile, utcOrLoc, outputTimeZoneHour);
		}
		else {
			long long scenarioId = atoll(argv[2]);
			tool.exportPairing(scenarioId, utcOrLoc, outputTimeZoneHour);
		}
	}
	else if (airline == "mf") {

		if (checkArgInCmdLine(argc, argv, "loc") && checkArgInCmdLine(argc, argv, "outputTimeZone")) {
			Logger::getRuleLogger()->error("invalid param, outputTimeZone only work for utc mode");
			return -1;			
		}
		//utc/loc & tmZone
		string utcOrLoc = checkArgInCmdLine(argc, argv, "loc") ? "loc" : "utc";
		int outputTimeZoneHour = retriveIntArgInCmdline(argc, argv, "outputTimeZone");
		//导出pairing
		if (0 == strncmp(argv[2], "file", strlen("file"))) {
			char* csvFile = argv[3];
			tool.exportPairingMF(csvFile, utcOrLoc, outputTimeZoneHour);
		}
		else {
			long long scenarioId = atoll(argv[2]);
			tool.exportPairingMF(scenarioId, utcOrLoc, outputTimeZoneHour);
		}
	} 
	else if (airline == "zh") {
		if (checkArgInCmdLine(argc, argv, "loc") && checkArgInCmdLine(argc, argv, "outputTimeZone")) {
			Logger::getRuleLogger()->error("invalid param, outputTimeZone only work for utc mode");
			return -1;			
		}
		//utc/loc & tmZone & delim
		string utcOrLoc = checkArgInCmdLine(argc, argv, "loc") ? "loc" : "utc";
		int outputTimeZoneHour = retriveIntArgInCmdline(argc, argv, "outputTimeZone");
		char* delim = findArgInCmdline(argc, argv, "delim");
		char* tempChars = " ";
		delim = (delim == NULL ? tempChars : delim); //default delim=" "
		if (0 == strncmp(argv[2], "file", strlen("file"))) {
			char* csvFile = argv[3];
			tool.exportPairingZH(csvFile, utcOrLoc, outputTimeZoneHour, delim);
		}
		else {
			long long scenarioId = atoll(argv[2]);
			tool.exportPairingZH(scenarioId, utcOrLoc, outputTimeZoneHour, delim);
		}
	}
	return ret;
}

int mainProcPoAnalys(int argc, char** argv, RuleTool &tool) {
	int ret = 0;
	if (argc < 3) {
		cout << "ERROR: invalid commandline parameters" << endl;
		printUsage();
		return -1;
	}
	long long scenarioId = atoll(argv[2]);
	int minConnectMinutes = 3 * 60;
	if (argc >= 4) {
		minConnectMinutes = atoi(argv[3]);
	}
	int minLayoverMinutes = 10 * 60;
	if (argc >= 5) {
		minLayoverMinutes = atoi(argv[4]);
	}
	tool.doPoAnalys(scenarioId, minConnectMinutes, minLayoverMinutes);
	return ret;
}
int mainProcImportPairing(int argc, char** argv, bool hasArgUser, string airline, RuleTool &tool) {
	int ret = 0;
	if (airline == "") {
		long long scenarioId = atoll(argv[2]);
		ret = tool.importPairing(scenarioId, argv[3]);
	}
	else if (airline == "zh") {
		//utc/loc & tmZone & delim
		string utcOrLoc = checkArgInCmdLine(argc, argv, "loc") ? "loc" : "utc";
		int outputTimeZoneHour = retriveIntArgInCmdline(argc, argv, "outputTimeZone");
		//导入pairing
		long long scenarioId = atoll(argv[2]);
		ret = tool.importPairingZH(scenarioId, argv[3], utcOrLoc, outputTimeZoneHour);
	}
	return ret;
}
int mainProcMergeGroup(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	int ret = 0;
	long long scenarioId = atoll(argv[2]);
	printf("merge group scenario %lld...\n", scenarioId);
	ret = tool.mergeROScenarioGroup(scenarioId);
	if (ret == SUCCESS)
		printf("SUCCESS\n");
	else
		printf("FAIL");
	return ret;
}
int mainProcAutoTest(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	string dir = argc > 2 ? argv[2] : ".";
	int ret = tool.autoTest(dir);
	if (ret == 0)
		printf("SUCCESS\n");
	else
		printf("FAIL\n");
	return ret;
}
int mainProcScenario(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	int ret = 0;
	if (argc < 3) {
		printUsage();
		exit(1);
	}
	long long scenarioId = atoll(argv[2]);
	ret = tool.saveScenarioToCsv(scenarioId);
	return ret;
}
int mainProcScenStatus(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	if (argc < 4) {
		printUsage();
		exit(1);
	}
	long long scenarioId = atoll(argv[2]);
	char * status = argv[3];
	int ret = tool.changeScenarioStatus(scenarioId, status);
	if (ret == 0)
		printf("SUCCESS\n");
	else
		printf("FAIL\n");
	return ret;
}
int mainProcChangeFlt(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	if (argc < 4) {
		printUsage();
		exit(1);
	}
	//20191009 ain, ruleTool change_flight支持两种参数格式
	//1. 按flt_id列表, 如 ruleTool change_flight 0 123,456,789 QQ P ROIS
	//2. 按日期, 刷新日期范围内全部航班, 如 ruleTool change_flight 0 2019-9-1 2019-10-31 QQ P ROIS
	int ret = 0;
	long long scenarioId = atoll(argv[2]);
	string param3 = argv[3];
	if (param3.find_first_of("-") == string::npos) {
		//20191202 ain, mantis#7197, 若参数长度达到8192则文件传参, 按命令行参数值格式是否'paramN.txt"
		//20210627 ain, mantis#9361, 2.0/3.0兼容, 自适应参数 filiale/division
		string flightIdStr = getParamValue(argv[3]);
		string filiale = argc >= 6 ? argv[4] : "";
		string division = argc >= 6 ? argv[5] : "";
		ret = tool.reCalculateByFlight(scenarioId, flightIdStr, filiale, division);
	}
	else {
		if (argc < 5) {
			printUsage();
			exit(1);
		}
		
		string startDt = argv[3];
		string endDt = argv[4];
		string filiale = argc >= 8 ? argv[5] : "";
		string division = argc >= 8 ? argv[6] : "";
		long long ruleSetId = argc >= 8 ? atoll(argv[7]) : 0;
		ret = tool.reCalculateByFlightDate(scenarioId, startDt, endDt, filiale, division, ruleSetId);
	}
	return ret;
}

int mainProcChangeTag(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	if (argc < 5) {
		printUsage();
		exit(1);
	}
	int ret = 0;
	long long scenarioId = atoll(argv[2]);
	string startDt = argv[3];
	string endDt = argv[4];
	string division = argv[5];
	ret = tool.reCalculatePairingTag(scenarioId, startDt, endDt, division);
	return ret;
}

int mainProcRefreshDP(int argc, char** argv, bool hasArgUser, RuleTool& tool) {
	if (argc < 5) {
		printUsage();
		exit(1);
	}
	int ret = 0;
	long long scenarioId = atoll(argv[2]);
	string startDt = argv[3];
	string endDt = argv[4];
	string division = argv[5];
	ret = tool.reRefreshDP(scenarioId, startDt, endDt, division);
	return ret;
}

int mainProcSaveOR(int argc, char** argv, bool hasArgUser, RuleTool &tool) {
	if (argc < 3) {
		printUsage();
		exit(1);
	}
	int ret = 0;
	char* type = argv[2];
	char* filename = argv[3];

	OR_TYPE orType = (0 == strcmp(type, "PO")) ? PO : RO;

	ret = tool.saveOr(filename, orType);
	return ret;
}
//读取DB配置
void readDbConfig(string filename) {
	ifstream f(filename);
	if (f) {
		f >> dbConn;
		f >> dbUsername;
		f >> dbPassword;
	}
	printf("DB connection: %s %s\n", dbUsername.c_str(), dbConn.c_str());
}

//是否pairingIdStr, 可逗号分隔
bool isPairingIdStr(char* str) {
	char *ch = str;
	while (*ch != '\0') {
		if (!isDigit(*ch) && *ch != ',')
			return false;
		ch++;
	}
	return true;
}

//20191202 ain, mantis#7197, 若参数值长度超过8192, 转为文件传参, 文件名格式'paramN.txt"
string getParamValue(const string& paramStr) {
	string str = strToLower(paramStr);
	string value = paramStr;
	//是否文件命格式'paramN.txt', 若不是则按返回命令行数值, 否则读取文件
	if (str.find_first_of("param") == 0 || str.find_last_of(".txt") != str.npos) {
		ifstream f(paramStr);
		getline(f, value);
		f.close();
	}
	return value;
}
