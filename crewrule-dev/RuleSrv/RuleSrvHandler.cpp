
#include <string>
#include <fstream>
#include <iostream>
#include <algorithm>
#include <functional>
#include "RuleEngineHandler.h"
#include "configParam.h"
#include "config.h"
#include "../RuleEngine/RuleEngine.h"
#include "CrewDB.h"
#include "JsonPairing.h"
#include "UtilFunc.h"
#include "OrLog.h"
#include "CustomBiz/CustomBiz.h"
#include "PairingCompositionCalculator.h"
#include "PairingAttrCalculator.h"
#include "Log/Logger.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmTrainingConfigIndex.h"

#include "DutyCode/DutyCodeAssignment.h"

#ifdef _WIN32
#include <direct.h>
#else
#include <sys/stat.h>
#define _snprintf	snprintf
#endif

using namespace std;

// data ctx
static PairingDBContext g_ctx;
static LegalityChecker ruleEngine;

struct UpdatePairingToDuty{
	long long pairingId = 0;
	long long dutyId = -1;
	string type;
	RecalDutyNodeFlag recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_ALL;//重新计算Brief和Debrief标志
};

struct CrewLeaveData {
	string crewId;
	time_t leaveStartDate;
	time_t leaveEndDate;
};

extern void printDebugRosterPairing(const string title, const CrewDataContext* dbData);
extern void debugEmptyCrew(const string title, const CrewDataContext* dbData);

//检查指定crew法规，并打印违规json到outStream
void copyPairingSegmentRankCombination(vector<Pairing*>& targetPairingList, unordered_map<long long, Pairing*>& sourcePairingMap);
//复制PairingSegment配比到Flight上
void updateFlightComposition(Pairing* pairing, SharedPtr<CrewDataContext>& dbData);
int checkCrewsAndPrintJson(ErrorContext * errCtx, ofstream& outStream, SharedPtr<LegalityChecker> ruleEngine, map<string, SharedPtr<CREW>>& updatedCrews, SharedPtr<SwapData>& swapData, bool needMandayOutput = true);
int calculateCompositionForAddPairing(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData, LegalityChecker* ruleEngine);
int PrintJson(ofstream& outStream, vector<Pairing*>& pairings, map<long long, vector < RULE_VIOLATION* >>& pairingViolations, CrewDataContext* dbData = nullptr);
int tryPairingOnCrewsPrintJson(ErrorContext * errCtx, ofstream& outStream, SharedPtr<LegalityChecker> ruleEngine, SharedPtr<CrewDataContext>& dbData, long long pair_id, map<string, SharedPtr<CREW>>& updatedCrews, vector<long long>& temporaryDelRosterIds, string& actingRank);
string checkReasonOfCrewNotMatchScenario(SharedPtr<CrewDataContext>& dbData, string crewId);
SharedPtr<SwapData> makeSwapData(SharedPtr<CrewDataContext>& dbData, vector<string>& opList, vector<SharedPtr<Activity>>& itemList);
int checkPairing_outputJson(string jsonName, string rootDirStr, vector<Pairing*>& pairingList, map<long long, vector<RULE_VIOLATION*>>& pairingViolations, CrewDataContext* dbData = nullptr);

int checkDutyCode_outputJson(const string& jsonName, const string& rootDirStr, const map<Segment*, bool>& dutyCodeViolationMap);
int getDutyCode_outputJson(const string& jsonName, const string& rootDirStr, const map<Segment*, DutyCode::DutyCode>& dutyCodeMap);

int checkPairing_checkLegality(LegalityChecker* ruleEngine, vector<Pairing*>& pairingList, map<long long, vector<RULE_VIOLATION*>>& pairingViolations, bool calcPairingDutyTime = true);
int readJsonInput(const char* jsonText, const char* jsonName, string rootDirStr, rapidjson::Document& document);
void gatherCrewByCofAndCop(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews, unordered_map<long long, Pairing*>& pairingIdMap);
void replaceJsonRosterPairing(unordered_map<long long, Pairing*>& pairingIdMap, vector<SharedPtr<Activity>>& itemList);
int doUpdateActivity(ErrorContext * errCtx, vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, map<string, SharedPtr<CREW>>& updatedCrews);
int doUpdateRosterFlight(vector<string>& opList, vector<SharedPtr<RosterFlight>>& itemList, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW >> &updatedCrews);
int copyFltToSegment(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData);
int doUpdateRosterFlightKpi(vector<string>& opList, vector<SharedPtr<CrewKpiAdjust>>& itemList, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews);
int doUpdateRosterTraining(vector<string>& opList, vector<SharedPtr<Entity>>& itemList, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews);
int doUpdateFatigueResult(vector<shared_ptr<FatigueResult>>& updateFatigueResults, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews);
void doUpdateTaskOnlyBeOperate(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine);
void doUpdateTaskRosterId(const SharedPtr<UpdateActivityIdItem>& updateActivityIdItem, SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine);
int doUpdateCrewsForRosterTraining(const vector<string>& opList, const vector<SharedPtr<Entity>>& itemList, const SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews);
void reCalculationRankCombination(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<bool>& recalCompositionFlagList, SharedPtr<CrewDataContext>& dbData, string jsonName);
void resetFlightToPairingIndex(vector<SharedPtr<Activity>>& itemList, SharedPtr<LegalityChecker>& ruleEngine);
void resetFlightPIC(vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData);
void findUpdatePairingToDuty(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<UpdatePairingDutyNode>& updatePairingDutyNodeList, SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, vector<UpdatePairingToDuty>& updates);
void SetPairingDuty(SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, const vector<UpdatePairingToDuty>& updates);
void resetPairingByDuty(SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, vector<string>& opList, vector<SharedPtr<Activity>>& itemList);
void resetRosterTimeByPairing(SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, vector<string>& opList, vector<SharedPtr<Activity>>& itemList, map<string, SharedPtr<CREW>>& updatedCrews);
void prepareRequestRoster(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<string>& rosterFlightOps, vector<SharedPtr<RosterFlight>>& rosterFlightItems, SharedPtr<LegalityChecker>& ruleEngine, SharedPtr<CrewDataContext>& dbData);
void prepareCheckCrew(vector<SharedPtr<Activity>>& itemList, SharedPtr<LegalityChecker>& ruleEngine, SharedPtr<CrewDataContext>& dbData);
vector<RULE_VIOLATION*> filterRuleViolationsWithPrepareCheckCrew(SharedPtr<LegalityChecker>& ruleEngine, SharedPtr<CrewDataContext>& dbData);

//移除Crew(COF)中Crew
map<string, SharedPtr<CREW>>& removeCrewOnFlight(map<string, SharedPtr<CREW>>& updatedCrews, SharedPtr<CrewDataContext>& dbData);

void removeDuplicate_UpdateList(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<bool>& recalCompositionFlagList, SharedPtr<CrewDataContext>& dbData);

static std::map<long long, std::tuple<int, int>> getDutyLimitsMap(const SharedPtr<CREW>& crew) {
	map<long long, tuple<int, int>> dutyLimitsMap;//map<dutyId, tuple<minRest,maxFDP>>
	for (auto& roster : crew->rosterList) {
		if (roster->pairing == nullptr) {
			continue;
		}
		for (auto& duty : roster->pairing->getDutyVec()) {
			dutyLimitsMap.insert(std::make_pair(duty->getDutyId(), std::make_tuple(duty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST), duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP))));
		}
	}
	return dutyLimitsMap;
}

static void setDutyLimitsMap(const SharedPtr<CREW>& crew, const std::map<long long, std::tuple<int, int>>& dutyLimitsMap) {
	for (auto& roster : crew->rosterList) {
		if (roster->pairing == nullptr) {
			continue;
		}
		for (auto& duty : roster->pairing->getDutyVec()) {
			auto iter = dutyLimitsMap.find(duty->getDutyId());
			if (iter != dutyLimitsMap.end()) {
				auto& limits = iter->second;
				
				duty->setMinRest(std::get<0>(limits), true);
				limitaions* limit = duty->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
				if (limit != nullptr) {
					limit->value = std::get<0>(limits);
					//duty->setLimitationValue(limit->type, std::get<0>(limits), limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->description, limit->classType, limit->reference, true);
				}

				limit = duty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
				if (limit != nullptr) {
					limit->value = std::get<1>(limits);
					//duty->setLimitationValue(limit->type, std::get<1>(limits), limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->description, limit->classType, limit->reference, true);
				}
			}
		}
	}
}

void saveScenarioToCsv(SharedPtr<CrewDataContext>& dbData) {

	try {
		//将scenario数据存入csv文件，用于ruleSrv自动测试
		char scenarioCsvName[1024] = { 0 };
		time_t currentTime = time(0);
		tm currentTm = { 0 };
		FILE * fp = NULL;
		memcpy(&currentTm, localtime(&currentTime), sizeof(tm));
		_snprintf(scenarioCsvName, sizeof(scenarioCsvName) - 1, "%s/inbox/roster/%04d%02d%02d_%02d%02d%02d_loadScenario.data.txt", g_rootDir,
			currentTm.tm_year + 1900, currentTm.tm_mon + 1, currentTm.tm_mday, currentTm.tm_hour, currentTm.tm_min, currentTm.tm_sec);
		//针对重构 ruleSrv editor共享 csv数据包, 检查 scenario.data.txt是否已经存在, 若否才写入数据
		fp = fopen(scenarioCsvName, "rb");
		if (fp == NULL)
			dbData->saveScenarioCsv(scenarioCsvName);
		else
			fclose(fp);
	}
	catch (...) {
		Logger::getRuleLogger()->error("ERROR: saveScenarioCsv fail, scenario={}", dbData->scenarioId);
	}
}

static void printDebugRoster(const string title, const SharedPtr<CrewDataContext>& dbData) {
	auto iterCrew = dbData->crewIdMap.find("761555");
	if (iterCrew != dbData->crewIdMap.end()) {
		auto& crew = iterCrew->second;
		std::cout << title << ":" << crew->idCrew << ", roster size:" << crew->rosterList.size() << ", rosterIds:";
		for (auto& roster : crew->rosterList) {
			if (roster->rosterId < 0) {
				std::cout << roster->rosterId << "|";
			}
		}
		std::cout << std::endl;
	}
}

static void printDebugFlight(const string title, const SharedPtr<CrewDataContext>& dbData) {
	auto iterFlight = dbData->flightIdMap.find(133627);
	if (iterFlight != dbData->flightIdMap.end()) {
		auto& flight = iterFlight->second;
		std::cout << title << ":" << flight->getDBId() << ", date:" << flight->getDate();
		std::cout << std::endl;
	}
}

struct LoadScenarioParam {
	long long scenarioId = 0;
	long long ruleSetId = 0;
	time_t startDtLoc = 0; //init 0
	time_t endDtLoc = 0;   //init 0
	string baseIds;
	string rankIds;
	string fleetIds;
	string qualIds;
};


LoadScenarioParam getScenarioFromJson(const char* path) {
	rapidjson::Document document;
	stringstream ss;
	ss << g_rootDir << "/inbox/roster/" << path;
	string filepath = ss.str();
	formatFilePath(filepath);
	int ret = readFile_Document(filepath.c_str(), document);
	if (ret != 0) {
		Logger::getRuleLogger()->error("ERROR: read scenario json fail, invalid json file {}", readFile_getLastErrMsg());
		throw "invalid json file";
	}
	//parse params
	LoadScenarioParam data;

	if (document.HasMember("scenarioId")) data.scenarioId = document["scenarioId"].GetInt64();
	if (document.HasMember("ruleId")) {
		if (document["ruleId"].IsString())
			data.ruleSetId = atoll(document["ruleId"].GetString());
		else
			data.ruleSetId = document["ruleId"].GetInt64();
	}
	if (document.HasMember("rankIds")) data.rankIds = document["rankIds"].GetString();
	if (document.HasMember("baseIds")) data.baseIds = document["baseIds"].GetString();
	if (document.HasMember("fleetIds")) data.fleetIds = document["fleetIds"].GetString();
	if (document.HasMember("qualIds")) data.qualIds = document["qualIds"].GetString();
	if (document.HasMember("startDtLoc")) data.startDtLoc = utcStrToUtc((char*)document["startDtLoc"].GetString());
	if (document.HasMember("endDtLoc")) data.endDtLoc = utcStrToUtc((char*)document["endDtLoc"].GetString());
	return data;
}

static int rule_mkdir(const char *path) {
#ifndef _WIN32
	return mkdir(path, 0755);
#else
	return _mkdir(path);
#endif
}

int rule_engine_load_data(SharedPtr<CrewDataContext>& dbData, long long scenarioId, const char* jsonName) {
	int ret = 0;
	try {
		if (jsonName == NULL || jsonName[0] == '\0') {
			ret = dbData->loadData(scenarioId);
		}
		else {
			LoadScenarioParam parm = getScenarioFromJson(jsonName);
			ret = dbData->loadData(parm.scenarioId, parm.startDtLoc, parm.endDtLoc, parm.ruleSetId, parm.baseIds, parm.rankIds, parm.fleetIds, "");
		}
		if (ret != SUCCESS) {
			Logger::getRuleLogger()->error("rule_engine_load_data load data {} fail", scenarioId);
			return ret;
		}
		Logger::getRuleLogger()->info("[Load Data] {} end", scenarioId);
	}
	catch (std::exception& e) {
		Logger::getRuleLogger()->error("Exception: load data, {}", e.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("Exception: load data");
	}
	return ret;
}

//********************************************
// load scenario
// 包含leadin部分：dbData->loadDataWithLeadin()
//********************************************
int rule_engine_load(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, long long scenarioId, const char* jsonName) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe


	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][LOAD Scenario] {}", sessionName, scenarioId);

	try {
		//mantis#1065, add param needPreAssign
		//mantis#1645, loadData后再执行 ruleEngine.setDataContext保证 initRankList正确执行
		//mantis#2379, 根据 startDtLoc==0判断是否按参数筛选场景部分数据或读取场景全部数据
		//20171222 ain, mantis#2700, jsonName为char[]时不能按 ==NULL 判断
		//20171225 ain, mantis#2703, loadData失败不再继续执行, 抛出异常信息, 使调用者/client明确获知失败
		int ret = 0;
		if (jsonName == NULL || jsonName[0] == '\0') {
			ret = dbData->loadData(scenarioId);
		}
		else {
			LoadScenarioParam parm = getScenarioFromJson(jsonName);
			ret = dbData->loadData(parm.scenarioId, parm.startDtLoc, parm.endDtLoc, parm.ruleSetId, parm.baseIds, parm.rankIds, parm.fleetIds, "");
		}
		if (ret != SUCCESS) {
			Logger::getRuleLogger()->error("[{}] rule_engine_load load data {} fail", sessionName, scenarioId);
			return ret;
		}
		ruleEngine->setDataContext(dbData);
		saveScenarioToCsv(dbData);
		Logger::getRuleLogger()->info("[{}][LOAD Scenario] {} end", sessionName, scenarioId);		
	}
	catch (std::exception& e) {
		dbCtx.errorCode = -1;
		Logger::getRuleLogger()->error("Exception: load scenario, {}", e.what());
	}
	catch (...) {
		dbCtx.errorCode = -1;
		Logger::getRuleLogger()->error("Exception: load scenario");
	}
	//error msg
	errCtx->errorCode = dbCtx.errorCode;
	strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	return dbCtx.errorCode;
}

int rule_engine_load_by_csv_file(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char* fileName) {
	int ret = -1;
	char path[512] = { 0 };
	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][LOAD Scenario] by csv file", sessionName);

	try {
		_snprintf(path, sizeof(path) - 1, "%s/inbox/roster/%s", g_rootDir, fileName);
		Logger::getRuleLogger()->info("[{}][LOAD Scenario] file: {}", sessionName, path);
			
		ret = dbData->loadDataCsv(path);
		if (ret != SUCCESS) {
			Logger::getRuleLogger()->error("[{}] rule_engine_load_by_csv_file load data fail.file: {}", sessionName, path);
			return ret;
		}
		ruleEngine->setDataContext(dbData);
	}
	catch (std::exception& e) {
		ret = -1;
		Logger::getRuleLogger()->error("Exception: load scenario, {}", e.what());
	}
	catch (...) {
		ret = -1;
		Logger::getRuleLogger()->error("Exception: load scenario");
	}
	return ret;
}

//********************************************
// check pairing
//********************************************
static void newPairingListCopy(vector<Pairing*>& newPairingList, vector<Pairing*>& oldPairingList, unordered_map<long long, Pairing*>& sourcePairingMap){
	for (auto& p : oldPairingList){
		auto iter = sourcePairingMap.find(p->getDbId());
		if (iter == sourcePairingMap.end()) {
			Logger::getRuleLogger()->error("exception: Pairing does not exist in scenario.pairingId={}", p->getDbId());
			continue;
		}
		newPairingList.push_back(iter->second);
	}
}
int rule_engine_check(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonName, const char * session) {
	//PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe
	rapidjson::Document document;
	vector<Pairing*> pairingList;
	vector<Pairing*> newPairingList;
	string sessionStr = session;
	string rootDirStr = g_rootDir;
	string filepath = rootDirStr + "/inbox/roster/" + jsonName;//20180320 ain, 统一inbox路径为 inbox/roster/

	dbData->reset();
	formatFilePath(filepath);

	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][CHECK Pairing] {}", sessionName, filepath.c_str());
	Logger::getRuleConsoleLogger()->info("[{}][Check Pairing] {}", sessionName, filepath.c_str());

	//read input json
	errCtx->errorCode = readFile_PairingList(filepath.c_str(), pairingList, document);
	if (errCtx->errorCode != 0) {
		strncpy(errCtx->errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx->errorMsgBuf));
		strncat(errCtx->errorMsgBuf, " @parse json fail", sizeof(errCtx->errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
		return errCtx->errorCode;
	}
	
	newPairingListCopy(newPairingList, pairingList, dbData->pairingIdMap);

	// loadScenario 流程duty五件套没有计算，导致计算配比有误
	//for (std::size_t i = 0; i < newPairingList.size(); i++) {
	//	//20180914 ain, mantis#4043, ignore empty pairnig
	//	Pairing* p = newPairingList[i];
	//	if (p->getNumDuties() == 0) {
	//		continue;
	//	}
	//	p->resetNewPairingBySegments();
	//	//op#2163 去除五件套赋值逻辑
	//	////20181212 ain, mantis#4623, ruleSrv流程增加环节, 配合计算/检查分离
	//	ruleEngine->calculatePairingFdpRest(p);
	//}
	//calculatePairingListRankCombination(newPairingList, dbData.get());
	//call ruleEngine
	map<long long, vector<RULE_VIOLATION*>> pairingViolations;
	checkPairing_checkLegality(ruleEngine.get(), newPairingList, pairingViolations);

	//20181025 ain, mantis#4344, copy rankCombination
	//copyPairingSegmentRankCombination(pairingList, dbData->pairingIdMap);
	
	
	//write output json
	errCtx->errorCode = checkPairing_outputJson(jsonName, rootDirStr, newPairingList, pairingViolations, dbData.get());
	if (errCtx->errorCode != 0) {
		Logger::getRuleLogger()->error("ERROR: write output json fail, {}", readFile_getLastErrMsg());
	}
	else {
		Logger::getRuleLogger()->info("\tSUCCESS");
		Logger::getRuleConsoleLogger()->info("\tsuccess");
	}

	//------------------- cleanup -------------------
	//clear violation
	for (auto& it : pairingViolations) {
		for (auto& rv : it.second)
			delete rv;
	}
	pairingViolations.clear();
	//
	//clear pairing/duty/seg from json
	deletePairingDutySeg(pairingList);

	//error msg
	strncpy(errCtx->errorMsgBuf, "rule_engine_check fail", sizeof(errCtx->errorMsgBuf));
	return errCtx->errorCode;
}

//********************************************
//成功返回0，失败返回错误码
//********************************************
int rule_engine_check_crew(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonName) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe

	vector<string> crewIdList;
	rapidjson::Document document;
	int ret = 0;
	string rootDirStr = g_rootDir;
	//string crewIdStr = crewId;
	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][Check Crew] {}", sessionName, jsonName);
	Logger::getRuleConsoleLogger()->info("[{}][Check Crew] {}", sessionName, jsonName);

	dbData->reset();
 	if (dbData->scenario.category == "PO") {
		dbCtx.errorCode = -1;
		_snprintf(errCtx->errorMsgBuf, sizeof(errCtx->errorMsgBuf), "check crew failed, scenario %lld is for PO ", dbData->scenarioId);
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
		return -1;
	}

	//解析 input path
	string inDir = rootDirStr + "/inbox/roster/";
	rule_mkdir(inDir.c_str());
	string inPath = inDir + jsonName;

	ifstream inStream;
	string targetCrew;
	inStream.open(inPath);
	if (!inStream) {
		dbCtx.errorCode = -1;
		_snprintf(errCtx->errorMsgBuf, sizeof(errCtx->errorMsgBuf), "read input json '%s' failed ", inPath.c_str());
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
		return -1;
	}

	//读取 input json
	ret = readFile_CrewIdList(inPath.c_str(), crewIdList, document);
	inStream.close();
	if (ret != 0) {
		dbCtx.errorCode = ret;
		strncpy(errCtx->errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx->errorMsgBuf));
		strncat(errCtx->errorMsgBuf, " @parse json fail", sizeof(errCtx->errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
		return ret;
	}
	if (crewIdList.size() == 0)
	{
		dbCtx.errorCode = -1;
		strncpy(errCtx->errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx->errorMsgBuf));
		strncat(errCtx->errorMsgBuf, " @parse json fail and no crew", sizeof(errCtx->errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: No parsed roster, {}", errCtx->errorMsgBuf);
		return -1;
	}

	//创建 output file
	string outDir = rootDirStr + "/outbox/";
	rule_mkdir(outDir.c_str());
	outDir = outDir + "roster/";
	rule_mkdir(outDir.c_str());
	
	//收集更新涉及的crew
	map<string, SharedPtr<CREW>> scenarioCrewIdMap;
	for (auto& c : dbData->crewList) {
		scenarioCrewIdMap[c->idCrew] = c;
	}
	map<string, SharedPtr<CREW>> targetCrews;
	for (std::size_t i = 0; i < crewIdList.size(); i++) {
		string idcrew = crewIdList[i];
		if (scenarioCrewIdMap.find(idcrew) != scenarioCrewIdMap.end())
			targetCrews[idcrew] = dbData->crewIdMap[idcrew];
	}

	///TEST
	long long pid = 27468089L;
	if (dbData->pairingIdMap.find(pid) != dbData->pairingIdMap.end()) {
		//auto * pg = dbData->pairingIdMap[pid];
		////auto crew = dbData->crewIdMap["003558"];
		//shared_ptr<ROSTER> roster;
		//for (auto& crew : dbData->crewList) {
		//	for (auto& r : crew->rosterList) {
		//		if (r->pairId == pid) {
		//			roster = r;
		//			break;
		//		}
		//	}
		//}
		/////TEST
		//cout << "**DBG ptn "
		//	<< " " << pg->getDbId()
		//	<< " " << pg->getPrimeActivity()
		//	<< " " << pg->getBase()
		//	<< " " << utcToUtcString(pg->getStartTimeUtcAct())
		//	<< " " << utcToUtcString(pg->getEndTimeUtcAct())
		//	<< endl;
		//if (roster) {
		//	cout << "**DBG roster "
		//		<< " " << roster->idcrew
		//		<< " " << roster->label
		//		<< " " << utcToUtcString(roster->getStartTimeUtcAct())
		//		<< " " << utcToUtcString(roster->getEndTimeUtcAct())
		//		<< endl;
		//}
	}

	///TEST
	{
		//auto& crew = dbData->crewIdMap["bjjiangzhaojing"];
		//for (auto& r : crew->rosterList) {
		//	std::cout << "**DBG ROSTER "
		//		<< " " << r->idcrew
		//		<< " " << r->duty
		//		<< " " << r->location
		//		<< " " << utcToUtcString(r->actStrLoc)
		//		<< " " << utcToUtcString(r->actRestStrLoc)
		//		<< " " << utcToUtcString(r->actEndLoc)
		//		<< " pg=" << r->pairId 
		//		<< " rid=" << r->rosterId
		//		<< endl;
		//}
	}



	//检查法规并汇总返回json
	ofstream outStream;
	string outpath = outDir + jsonName;
	outStream.open(outpath);

	//检查法规并输出违规结果json
	outStream << "[\n";
	SharedPtr<SwapData> swapData;
	checkCrewsAndPrintJson(errCtx, outStream, ruleEngine, targetCrews, swapData); //不是swap操作,swapData=empty
	outStream << "]";
	outStream.flush();
	outStream.close();

	//checkCrew输出crew的roster中pairing信息
	if (targetCrews.size() < 50) {
		vector<Pairing*> pairingList;
		for (auto& targetCrew : targetCrews) {
			SharedPtr<CREW>& crew = targetCrew.second;
			//crew->rosterList[0]->pairing
			for (auto& roster : crew->rosterList) {
				if (roster->pairing != nullptr) {
					pairingList.emplace_back(roster->pairing);
				}
			}
		}
		map<long long, vector<RULE_VIOLATION*>> pairingViolations;
		checkPairing_outputJson(string(jsonName) + ".pairing", rootDirStr, pairingList, pairingViolations, dbData.get());
	}

	//error msg
	errCtx->errorCode = dbCtx.errorCode;
	strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	return 0;
}
//成功返回0，失败返回错误码
int rule_engine_update_crew(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * csvName){
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe

	int ret = 0;
	vector<string> crewIdList;
	string rootDirStr = g_rootDir;

	dbData->reset();
	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][update crew] {}", sessionName, csvName);
	Logger::getRuleConsoleLogger()->info("[{}][Update Crew] {}", sessionName, csvName);

	DtoUpdateCrew dto;
	string inDir = rootDirStr + "/inbox/roster/";
	string inPath = inDir + csvName;
	ret = dbData->loadDataUpdateCrew(inPath.c_str(), dto);

	if (!dto.updateCrewLastPublishDates.empty()) {
		//仅更新Crew的lastPublishDate字段
		for (auto& crewLastPublishDate : dto.updateCrewLastPublishDates) {
			auto iter = dbData->crewIdMap.find(crewLastPublishDate->crewId);
			if (iter != dbData->crewIdMap.end() && iter->second != nullptr) {
				iter->second->lastPublishDate = crewLastPublishDate->lastPublishDate;
			}
		}

		//创建 output file
		string outDir = rootDirStr + "/outbox/";
		rule_mkdir(outDir.c_str());
		outDir = outDir + "roster/";
		rule_mkdir(outDir.c_str());

		//检查法规并汇总返回json
		ofstream outStream;
		string outpath = outDir + csvName;
		outStream.open(outpath);

		//检查法规并输出违规结果json
		outStream << "[\n";
		outStream << "]";
		outStream.flush();
		outStream.close();
		//error msg
		errCtx->errorCode = dbCtx.errorCode;
		strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
		return 0;
	}
	//进行crew删除
	map<string, int> crewIdToIndexMap;
	int i = 0;
	for (auto crew : dbData->crewList){
		crewIdToIndexMap.insert(map<string, int>::value_type(crew->idCrew, i++));
	}
//	vector<int> delCrewNums;
	for (auto delCrewId : dto.delCrewIds){
		if (dbData->crewIdMap.count(delCrewId) > 0){
			//delCrewNums.push_back(crewIdToIndexMap[delCrewId]);
			dbData->crewIdMap.erase(delCrewId);
			for (i = 0; i < (int)dbData->crewList.size(); i++) {
				if (dbData->crewList[i]->idCrew == delCrewId) {
					dbData->crewList.erase(dbData->crewList.begin() + i);
					break;
				}
			}
		}
		else{
			Logger::getRuleLogger()->info("ERROR: invalid data, delCrew={} not exist", delCrewId.c_str());
			return 0;
			//Logger::getRuleLogger()->error("invalid data");
		}
	}
	//sort(delCrewNums.begin(), delCrewNums.end(), greater<int>());
	//for (auto delCrewNum : delCrewNums){
	//	dbData->crewList.erase(dbData->crewList.begin() + delCrewNum);
	//}
	//进行Crew填充
	crewIdToIndexMap.clear();
	i = 0;
	//删除vector后,索引会紊乱,重新更新索引
	for (auto crew : dbData->crewList){
		crewIdToIndexMap.insert(map<string, int>::value_type(crew->idCrew, i++));
	}
	for (auto addCrew : dto.addOrUpdateCrews){

		//合并rankList, qualificationList, statusList
		mergeCrewRank(addCrew->rankList);
		mergeCrewQualification(addCrew->qualificationList);
		mergeCrewStatus(addCrew->statusList);	

		crewIdList.push_back(addCrew->idCrew);
		if (dbData->crewIdMap.count(addCrew->idCrew)){
			//20190619 ain, mantis#6033, 仅当 inbox/数据包含 crew. Rank/Base时才更新
			auto& crew = dbData->crewIdMap[addCrew->idCrew];
			crew->status = addCrew->status;
			if (!addCrew->rankList.empty()) crew->rankList = addCrew->rankList;
			if (!addCrew->baseList.empty()) crew->baseList = addCrew->baseList;
			if (!addCrew->fleetList.empty()) crew->fleetList = addCrew->fleetList;
			if (!addCrew->qualificationList.empty()) crew->qualificationList = addCrew->qualificationList;
			if (!addCrew->qualificationList.empty()) crew->qualListFiltedByRules = addCrew->qualListFiltedByRules;
			if (!addCrew->qualificationListInDb.empty()) crew->qualificationListInDb = addCrew->qualificationListInDb;
			if (!addCrew->statusList.empty()) crew->statusList = addCrew->statusList;
			if (!addCrew->guaranteeHourList.empty()) crew->guaranteeHourList = addCrew->guaranteeHourList;
		}
		else{
			dbData->crewList.push_back(addCrew);
			dbData->crewIdMap.insert(map<string, SharedPtr<CREW>>::value_type(addCrew->idCrew,addCrew));
		}
	}

	resetCrewRankFleetQualLocalTimeToUtc(dbData, crewIdList);

	//20191017 ain, mantis#6911, 更新crew族数据后刷新索引
	for (auto& addCrew : dto.addOrUpdateCrews){
		auto& crew = dbData->crewIdMap[addCrew->idCrew];
		crew->crewBaseTimezoneOffsetIndex = SharedPtr<CrewBaseTimezoneIndex>(new CrewBaseTimezoneIndex(crew->idCrew, crew->baseList, dbData.get()));
		crew->makeAvgAnnGuaranteeHour();
		crew->makeRosterValidity();
	}

	//创建 output file
	string outDir = rootDirStr + "/outbox/";
	rule_mkdir(outDir.c_str());
	outDir = outDir + "roster/";
	rule_mkdir(outDir.c_str());

	//收集更新涉及的crew
	map<string, SharedPtr<CREW>> targetCrews;
	for (std::size_t i = 0; i < crewIdList.size(); i++) {
		string idcrew = crewIdList[i];
		targetCrews[idcrew] = dbData->crewIdMap[idcrew];
	}

	//检查法规并汇总返回json
	ofstream outStream;
	string outpath = outDir + csvName;
	outStream.open(outpath);

	//检查法规并输出违规结果json
	outStream << "[\n";
	SharedPtr<SwapData> swapData;
	checkCrewsAndPrintJson(errCtx, outStream, ruleEngine, targetCrews, swapData); //不是swap操作,swapData=empty
	outStream << "]";
	outStream.flush();
	outStream.close();
	//error msg
	errCtx->errorCode = dbCtx.errorCode;
	strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	return 0;
}
int rule_engine_try_pairing_on_crew(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonName) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe

	rapidjson::Document document;
	int ret = 0;
	string rootDirStr = g_rootDir;
	//string crewIdStr = crewId;
	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][Try Pairing On Crew] {}", sessionName, jsonName);
	dbData->reset();
	if (dbData->scenario.category == "PO") {
		dbCtx.errorCode = -1;
		_snprintf(errCtx->errorMsgBuf, sizeof(errCtx->errorMsgBuf), "check crew failed, scenario %lld is for PO ", dbData->scenarioId);
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
		return -1;
	}

	//解析 input path
	string inDir = rootDirStr + "/inbox/roster/";
	rule_mkdir(inDir.c_str());
	string inPath = inDir + jsonName;
	ifstream inStream;
	string targetCrew;
	inStream.open(inPath);
	if (!inStream) {
		dbCtx.errorCode = ERR_JSON;
		_snprintf(errCtx->errorMsgBuf, sizeof(errCtx->errorMsgBuf), "read input json '%s' failed ", inPath.c_str());
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
		return ERR_JSON;
	}

	//parse json
	long long pair_id = 0;
	vector<string> crewIdList;
	vector<long long> temporaryDelRosterIds;
	string actingRank = "";

	//读取 input json
	ret = readFile_TryPairingOnCrew(inPath.c_str(), pair_id, crewIdList, temporaryDelRosterIds, actingRank, document);
	inStream.close();
	if (ret != 0) {
		dbCtx.errorCode = ret;
		strncpy(errCtx->errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx->errorMsgBuf));
		strncat(errCtx->errorMsgBuf, " @parse json fail", sizeof(errCtx->errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
		return ret;
	}
	if (crewIdList.size() == 0)
	{
		dbCtx.errorCode = -1;
		strncpy(errCtx->errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx->errorMsgBuf));
		strncat(errCtx->errorMsgBuf, ", no input crewId parsed", sizeof(errCtx->errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: no input crewId found");
		return -1;
	}

	Logger::getRuleLogger()->info("\t{} candidate crews", crewIdList.size());

	//创建 output file
	string outDir = rootDirStr + "/outbox/";
	rule_mkdir(outDir.c_str());
	outDir = outDir + "roster/";
	rule_mkdir(outDir.c_str());

	//收集更新涉及的crew
	map<string, SharedPtr<CREW>> targetCrews;
	for (std::size_t i = 0; i < crewIdList.size(); i++) {
		string idcrew = crewIdList[i];
		targetCrews[idcrew] = dbData->crewIdMap[idcrew];
	}

	//检查法规并汇总返回json
	ofstream outStream;
	string outpath = outDir + jsonName;
	outStream.open(outpath);

	//检查法规并输出违规结果json
	tryPairingOnCrewsPrintJson(errCtx, outStream, ruleEngine, dbData, pair_id, targetCrews, temporaryDelRosterIds, actingRank);
	outStream.flush();
	outStream.close();

	//error msg
	errCtx->errorCode = dbCtx.errorCode;
	strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	return 0;
}

int rule_engine_try_crew_pref_request(ErrorContext * errCtx, char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName) {

	return 0;
}

void ruleSrv_test_log_pairing(string msg, vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext> dbData) {
	///TEST
	for (std::size_t i = 0; i < opList.size(); i++) {

		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "Pairing") {
			Pairing * p = (Pairing*)item.get();
			if (dbData && dbData->pairingIdMap.find(p->getDbId()) != dbData->pairingIdMap.end()) {
				p = dbData->pairingIdMap[p->getDbId()];
			}
			test_log_pairing(msg + " " + op, p);
		}
	}
}

//********************************************
//按json list更新数据
//成功返回0，失败返回错误码
//********************************************
int rule_engine_update_list(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName) {

	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe
	vector<SharedPtr<Activity>> itemList;
	vector<string> opList;
	vector<bool> recalCompositionFlagList;//重算配比标志
	vector<UpdatePairingDutyNode> updatePairingDutyNodeList; //重算PairingDutyNode标志
	vector<SharedPtr<UpdateActivityIdItem>> allUpdateIdList;
	vector<string> rosterFlightOps;
	vector<string> rosterFlightKpiOps;
	vector<SharedPtr<RosterFlight>> rosterFlightItems;
	vector<SharedPtr<CrewKpiAdjust>> rosterFlightKpiItems;
	vector<string> rosterTrainingOps;
	vector<SharedPtr<Entity>> rosterTrainingItems;
	vector<shared_ptr<FatigueResult>> updateFatigueResults;
	SharedPtr<SwapData> swapData;   //若是swap操作，则填充swapData，否则留空
	int ret = 0;
	rapidjson::Document document;
	string rootDirStr = g_rootDir;

	string dbg = "read-json";
	try {

		Logger::getRuleLogger()->info("---------------------------");
		Logger::getRuleLogger()->info("[{}][update List] {}", sessionName, jsonName);
		Logger::getRuleConsoleLogger()->info("[{}][Update Data] {}", sessionName, jsonName);

		ret = readJsonInput(jsonText, jsonName, rootDirStr, document);
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_update_list invalid data");
			return ret;
		}

		//parse json document to opList(add/del/update), itemList(roster/pairing)
		parseJson_UpdateList(document, opList, itemList, recalCompositionFlagList, updatePairingDutyNodeList, allUpdateIdList, updateFatigueResults);

		//parse json to RosterFlights
		parseJson_UpdateRosterFlights(document, rosterFlightOps, rosterFlightItems);
		//parse josn to CrewKpiAdjust
		parseJson_UpdateRosterFlightKpi(document, rosterFlightKpiOps, rosterFlightKpiItems);
		//parse json document to opList(add/del/update), itemList(TmProgramCourse/TmProgramCourseInstructor/TmProgram/TmDeviceTime)
		parseJson_UpdateRosterTraining(document, rosterTrainingOps, rosterTrainingItems);

		//过滤重复ADD数据
		removeDuplicate_UpdateList(opList, itemList, recalCompositionFlagList, dbData);

		dbData->setIs8091AlwaysResetSeqOrder(dbData->systemParamMap["RULESRV_8091_ALWAYS_RESET_SEQORDER"] == "YES");


		//法规服务化，申请Roster和交换Roster更新前，记录请求和交换Roster
		prepareRequestRoster(opList, itemList, rosterFlightOps, rosterFlightItems, ruleEngine, dbData);

		//调整场景的开始时间和结束时间
		dbData->reviseScenarioStartAndEndTime(itemList);

		//法规服务化，申请Roster和交换Roster，预先检查Crew，保留违规信息
		prepareCheckCrew(itemList, ruleEngine, dbData);

		//3.0 pairing手动选择
			if (std::find(opList.begin(), opList.end(), "UPDATECOMP") != opList.end()) {
			for (std::size_t i = 0; i < itemList.size(); i++) {
				SharedPtr<Activity> item = itemList[i];
				Pairing* p = (Pairing*)item.get();
				Pairing* newPairingCopy = new Pairing();
				newPairingCopy->deepCopy(p);
				newPairingCopy->resetOpenComposition();
				for (const auto rf : dbData->rosterFlightMgr.getByPairingId(p->getDbId())) {
					newPairingCopy->fillCompositionRank(rf->activeRank, 1);
				}
				dbData->pairingIdMap[newPairingCopy->getDbId()] = newPairingCopy;
				// 手动选择时，同时刷新pairingList
				for (auto ptn : dbData->pairingList) {
					if (ptn->getDbId() == newPairingCopy->getDbId()) {
						ptn->setComplements(newPairingCopy->getComplements());
						ptn->setSegments(newPairingCopy->getSegments());
						updateFlightComposition(ptn, dbData);
						break;
					}
				}
			}
			Logger::getRuleConsoleLogger()->info("\tsuccess");
			return errCtx->errorCode;
		}
		//20191030 ain, mantis#6747, 问题2, 忽略inbox/json为空, 不抛异常, 避免gantt提示ruleSrv异常
		//if (opList.empty() && itemList.empty() && allUpdateIdList.empty()
		//	&& rosterFlightOps.empty()) {
		//	Logger::getRuleLogger()->error("ERROR: No input roster/pairing found");
		//}

		///TEST
		//for (auto& rf : dbData->rosterFlightMgr.get(98998)) {
		//	cout << "**DBG Before rosterFlt " << rf->fltId
		//		<< " crew=" << rf->crewId
		//		<< " " << rf->actingRank
		//		<< " " << rf->assignment
		//		<< " ptn=" << rf->pairingId
		//		<< " seqOrder=" << rf->seqOrder
		//		<< endl;
		//}
		//for (auto& rf : dbData->rosterFlightMgr.get(98991)) {
		//	cout << "**DBG Before rosterFlt " << rf->fltId
		//		<< " crew=" << rf->crewId
		//		<< " " << rf->actingRank
		//		<< " " << rf->assignment
		//		<< " ptn=" << rf->pairingId
		//		<< " seqOrder=" << rf->seqOrder
		//		<< endl;
		//}

		//OP#1516, swap操作ruleEngine.checkRules()增加参数 SwapData{ beforeRosters, afterRosters, addedRosters, removedRosters}
		//若是swap操作，则填充swapData，否则留空
		dbg = "SwapData";
		string actionFileName = strToUpper(jsonName);
		if (actionFileName.find("SWAPROSTER") != -1) {
			swapData = makeSwapData(dbData, opList, itemList);
		}
		//20190523 ain, mantis#5721, 避免局部 pairingIdMap引用对象过时, 以dbData->pairingIdMap中最新对象为准
		//预处理：若解析json构造了冗余pairing对象，则以dbData中pairing替换，将已存在pairing替换为dbData.pairingList中对象
		dbg = "replace json roster.pairing";
		replaceJsonRosterPairing(dbData->pairingIdMap, itemList);


		// TG updatePairing时，segment里的subFleet变成空
		copyFltToSegment(opList, itemList, dbData);

		//
		//预处理：拷贝flt字段到segment，因法规中直接在segment上访问flt字段
		map<long long, Segment*> fltIdMap;

		//收集更新涉及的crew
		map<string, SharedPtr<CREW>> updatedCrews;

		vector<UpdatePairingToDuty> updates;
		//收集需要更新的数据
		dbg = "calculate-pairing-duty";
		findUpdatePairingToDuty(opList, itemList, updatePairingDutyNodeList, dbData, ruleEngine, updates);
		//update dbData
		dbg = "update-data";
		ret = doUpdateActivity(errCtx, opList, itemList, dbData, ruleEngine, updatedCrews);
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_update_list [doUpdateActivity] process changing fail");
			return ret;
		}

		//20190612 ain, mantis#5790, ruleSrv rosterFlight
		doUpdateRosterFlight(rosterFlightOps, rosterFlightItems, dbData, updatedCrews);

		doUpdateRosterFlightKpi(rosterFlightKpiOps, rosterFlightKpiItems, dbData, updatedCrews);

		doUpdateRosterTraining(rosterTrainingOps, rosterTrainingItems, dbData, updatedCrews);

		doUpdateFatigueResult(updateFatigueResults, dbData, updatedCrews);

		doUpdateTaskOnlyBeOperate(opList, itemList, dbData, ruleEngine);

		//20190422 ain, mantis#5333, pairing变更后刷新索引 dbData.flightToPairing
		resetFlightToPairingIndex(itemList, ruleEngine);

		resetFlightPIC(itemList, dbData);

		//整体更新
		//根据汇总的新 Duty记录，计算五件套和duty.start/end
		dbg = "set-pairing-duty";
		SetPairingDuty(dbData, ruleEngine, updates);
		resetPairingByDuty(dbData, ruleEngine, opList, itemList);
		resetRosterTimeByPairing(dbData, ruleEngine, opList, itemList, updatedCrews);
		if (opList.size() != itemList.size() || opList.size() != recalCompositionFlagList.size()) {
			Logger::getRuleLogger()->error("The opList, itemList and recalCompositionFlagList size is not equals.");
			return -1;
		}
		//rankCombination
		vector<Pairing*> pairingInItemList;
		reCalculationRankCombination(opList, itemList, recalCompositionFlagList, dbData, actionFileName);
		for(size_t i = 0; i < itemList.size(); i++) {
			auto& item = itemList[i];
			bool recalCompositionFlag = recalCompositionFlagList[i];
			if (recalCompositionFlag && item->getClassName() == "Pairing")
				pairingInItemList.push_back((Pairing*)item.get());
		}
		copyPairingSegmentRankCombination(pairingInItemList, dbData->pairingIdMap);

		//update id, for editor save
		dbg = "update-id";
		vector<SharedPtr<UpdateActivityIdItem>> updateDutyIdList;
		vector<SharedPtr<UpdateActivityIdItem>> updateIdList;
		for (auto& updateIdItem : allUpdateIdList) {
			if (updateIdItem->type == "DUTY") {
				updateDutyIdList.emplace_back(updateIdItem);
			}
			else {
				updateIdList.emplace_back(updateIdItem);
			}
		}

		bool isReindexAfterUpdateRosterId = false;
		for (auto& updateIdItem : updateIdList) {
			dbData->updateActivityId(isReindexAfterUpdateRosterId, updateIdItem, updateDutyIdList);
			doUpdateTaskRosterId(updateIdItem, dbData, ruleEngine);
		}
		if (isReindexAfterUpdateRosterId) {
			dbData->reindexAfterUpdateRosterId();
		}

		///获取 COF crew
		dbg = "COF/COP-crew";
		gatherCrewByCofAndCop(opList, itemList, dbData, updatedCrews, dbData->pairingIdMap);

		//check rule
		dbg = "check-rule";
		{
			vector<Pairing*> pairingList;
			map<long long, bool> changedPairingIds;
			for (std::size_t i = 0; i < opList.size(); i++) {
				if (itemList[i]->getClassName() == "ROSTER") {
					SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (itemList[i]);
					if (updatedCrews.find(roster->idcrew) == updatedCrews.end() && dbData->crewIdMap.find(roster->idcrew) != dbData->crewIdMap.end()) {
						updatedCrews[roster->idcrew] = dbData->crewIdMap[roster->idcrew];
					}
					if (opList[i] != "DEL") {
						if (roster->pairing != nullptr && !rosterTrainingItems.empty()) {
							auto iter = dbData->pairingIdMap.find(roster->pairing->getDbId());
							if (iter != dbData->pairingIdMap.end()) {
								if (changedPairingIds.find(roster->pairing->getDbId()) == changedPairingIds.end()) {
									changedPairingIds[roster->pairing->getDbId()] = true;
									pairingList.push_back(roster->pairing);
								}
							}
						}
					}
				}
				else if (itemList[i]->getClassName() == "Pairing") {
					if (opList[i] == "DEL") {
                        //EVAFD mantis 0011657 针对删除pairing，需检查该Pairing同航班的其他pairing
						Pairing* itemPairing = (Pairing*)itemList[i].get();
						vector<Segment*>segs = itemPairing->getSegments();
						for (auto s : segs) {
                            auto iterPairingIds = dbData->flightIdToPairing.find(s->getDBId());
							if (iterPairingIds != dbData->flightIdToPairing.end()) {
								for (auto pId : iterPairingIds->second) {
									if (pId != itemPairing->getDbId()) {
                                        auto iterPairing = dbData->pairingIdMap.find(pId);
										if (iterPairing != dbData->pairingIdMap.end()) {
											if (iterPairing->second != nullptr && changedPairingIds.find(iterPairing->second->getDbId()) == changedPairingIds.end()) {
												changedPairingIds[iterPairing->second->getDbId()] = true;
												pairingList.push_back(iterPairing->second);
											}
										}
									}
								}
							}
						}
					}
					else {
						//20190218 ain, mantis#4949, 汇总checkPGRules()目标按 dbData中对象, 避免pairing计算结果赋值到 itemList中造成后续法规检查数据缺失
						Pairing* item = (Pairing*)itemList[i].get();
						auto iterPairing = dbData->pairingIdMap.find(item->getDbId());
						if (iterPairing == dbData->pairingIdMap.end()) {
							continue;
						}
						Pairing* p = iterPairing->second;
						changedPairingIds[p->getDbId()] = true;
						vector<Pairing*> morePairings;
						vector<Segment*>segs = p->getSegments();
						for (auto s : segs){
							if (dbData->flightIdToPairing.find(s->getDBId()) != dbData->flightIdToPairing.end()){
								for (auto pId : dbData->flightIdToPairing[s->getDBId()]){
									morePairings.push_back(dbData->pairingIdMap[pId]);
								}
							}
						}
						for (auto pp : morePairings){
							if (changedPairingIds.find(pp->getDbId()) == changedPairingIds.end())
							{
								changedPairingIds[pp->getDbId()] = true;
								pairingList.push_back(pp);
							}
						}
						// 如果pairing已经存在，则不重复添加
						if (find(pairingList.begin(), pairingList.end(), p) == pairingList.end())
							pairingList.push_back(p);

						//已分配Crew的Pairing需要检查Crew
						auto rfs = dbData->rosterFlightMgr.getByPairingId(p->getDbId());
						for (auto& rf : rfs) {
							if (updatedCrews.find(rf->crewId) == updatedCrews.end() && dbData->crewIdMap.find(rf->crewId) != dbData->crewIdMap.end()) {
								updatedCrews[rf->crewId] = dbData->crewIdMap[rf->crewId];
							}
						}
					}
				}
			}

			doUpdateCrewsForRosterTraining(rosterTrainingOps, rosterTrainingItems, dbData, updatedCrews);
			//检查法规并汇总返回json
			string outpath = rootDirStr + "/outbox/roster/" + jsonName;
			ofstream outStream;
			outStream.open(outpath);

			///TEST
			//for (auto& rf : dbData->rosterFlightMgr.get(98998)) {
			//	cout << "**DBG AFTER rosterFlt " << rf->fltId
			//		<< " crew=" << rf->crewId
			//		<< " " << rf->actingRank
			//		<< " " << rf->assignment
			//		<< " ptn=" << rf->pairingId
			//		<< " seqOrder=" << rf->seqOrder
			//		<< endl;
			//}
			//for (auto& rf : dbData->rosterFlightMgr.get(98991)) {
			//	cout << "**DBG AFTER rosterFlt " << rf->fltId
			//		<< " crew=" << rf->crewId
			//		<< " " << rf->actingRank
			//		<< " " << rf->assignment
			//		<< " ptn=" << rf->pairingId
			//		<< " seqOrder=" << rf->seqOrder
			//		<< endl;
			//}

			// GJ addSegmentToPairing 先校验了8072 才去重新计算attribute,导致没有用新的attribute去校验法规
			auto dbData = ruleEngine->getDataContext();
			PairingAttributeCalculator pairingAttrCalculator(dbData->scenario.airline, dbData->flightList, dbData->routeList, dbData->attributeIdMap, dbData->airportCodeMap, dbData->assignmentNameGroupMap, dbData->rankMap, dbData->tagCategoryList,
				dbData->tagFlightGroupMap, dbData->tagDutyGroupMap, dbData->tagPairingGroupMap, dbData->tagGroupTableMap, dbData->tagGroupMap, dbData->tagFlightCompositionGroupMap);
			if (dbData->version == 2 || dbData->scenario.airline == "JG") {
				pairingAttrCalculator.calculateAndSetPairingAttr(pairingList);
			}
			else {
				pairingAttrCalculator.calculateAndSetPairingTag(pairingList);
			}
			/*if (!pairingList.empty()) {
				for (const auto& pair : pairingList) {
					ruleEngine->removeCheckPairingInRoster(RULES::CALCULATE_PIF_FOR_EVA_FD, pair->getDbId());
				}
			}*/
			//检查指定crew法规，并打印违规json到outStream
			outStream << "[\n";
			removeCrewOnFlight(updatedCrews, dbData);
			checkCrewsAndPrintJson(errCtx, outStream, ruleEngine, updatedCrews, swapData);
			if (!updatedCrews.empty() && !pairingList.empty())
				outStream << ",\n";
			//20190301 ain, mantis#5048, 流程修改, 先计算配比, 后检查法规, 避免2030检查认为java默认赋值配比违规
			//20190416 yuankai.cai makepairing时不需要计算配比赋值
			//calculateCompositionForAddPairing(opList, itemList, dbData, ruleEngine.get());
			//20190117 ain, OP#1963, ruleSrv pairing流程重构, 先ruleEngine计算/检查, 在计算addPairing配比, 最后输出outbox/
			map<long long, vector < RULE_VIOLATION* >> pairingViolations;
			checkPairing_checkLegality(ruleEngine.get(), pairingList, pairingViolations, false);
			// SGPO-436 SQ特殊逻辑 ---暂时
			if (dbData->scenario.airline == "SQ") {
					pairingAttrCalculator.calculateAndSetPairingTag(pairingList);
			}
			PrintJson(outStream, pairingList, pairingViolations, dbData.get());
			outStream << "]";

			outStream.flush();
			outStream.close();
		}
		if (dbData->systemParamMap.find("RULESRV_8091_ALWAYS_RESET_SEQORDER") != dbData->systemParamMap.end()){
			if (dbData->systemParamMap["RULESRV_8091_ALWAYS_RESET_SEQORDER"] == "YES"){

			}
		}
		//error msg
		dbg = "err-msg";
		errCtx->errorCode = dbCtx.errorCode;
		strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in rule_engine_update_list, dbg={} except={}", dbg, ex);
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in rule_engine_update_list, dbg={} except={}", dbg , ex.what());
	}
	catch (string s){
		Logger::getRuleLogger()->error("EXCEPTION: in rule_engine_update_list, dbg={}  {}", dbg, s);
	}
	catch (...) {
		Logger::getRuleLogger()->error("EXCEPTION: in rule_engine_update_list, dbg={}", dbg);
	}

	///TEST
	long long pid = 27468089L;
	if (dbData->pairingIdMap.find(pid) != dbData->pairingIdMap.end()) {
		auto * pg = dbData->pairingIdMap[pid];
		//auto crew = dbData->crewIdMap["003558"];
		shared_ptr<ROSTER> roster;
		for (auto& crew : dbData->crewList) {
			for (auto& r : crew->rosterList) {
				if (r->pairId == pid) {
					roster = r;
					break;
				}
			}
		}
		///TEST
		cout << "**DBG ptn "
			<< " " << pg->getDbId()
			<< " " << pg->getPrimeActivity()
			<< " " << pg->getBase()
			<< " " << utcToUtcString(pg->getStartTimeUtcAct())
			<< " " << utcToUtcString(pg->getEndTimeUtcAct())
			<< endl;
		if (roster) {
			cout << "**DBG roster "
				<< " " << roster->idcrew
				<< " " << roster->label
				<< " " << utcToUtcString(roster->getStartTimeUtcAct())
				<< " " << utcToUtcString(roster->getEndTimeUtcAct())
				<< endl;
		}
	}

	return errCtx->errorCode;
}
void updateDatas(vector<string>& opList, vector<SharedPtr<Activity>>& itemList,SharedPtr<CrewDataContext>& dbData,
	map<string, SharedPtr<CREW>>& updatedCrews, vector<Pairing*>& pairingList, vector<SharedPtr<Segment>>& flightList){
	if (opList.size() != itemList.size()){
		return;
	}
	pairingList.clear();
	updatedCrews.clear();
	int opSize = (int)opList.size();
	for (int i = 0; i < opSize; i++){
		SharedPtr<Activity> item = itemList[i];
		if (opList[i] == "UPDATE" && item->getClassName() == "Segment"){
			SharedPtr<Activity> item = itemList[i];
			Segment* flt = (Segment*)item.get();
			shared_ptr<Segment>seg (new Segment(*(Segment*)item.get()));
			flightList.push_back(seg);
			vector<SharedPtr<RosterFlight>> rfs = dbData->rosterFlightMgr.get(flt->getDBId());
			vector<long long > pairingIds = dbData->flightIdToPairing[flt->getDBId()];
			for (auto pid : pairingIds){
				if (dbData->pairingIdMap.find(pid) != dbData->pairingIdMap.end())
				pairingList.push_back(dbData->pairingIdMap[pid]);
			}
			for (auto rf : rfs){
				updatedCrews.insert(make_pair(rf->crewId,dbData->crewIdMap[rf->crewId]));
				//pairingList.push_back(dbData->pairingIdMap[rf->pairingId]);			
			}
		}
	}

}
//********************************************
//按json list更新数据
//成功返回0，失败返回错误码
//********************************************
int rule_engine_update_filght(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName) {
	string dbg = "read-json";
	try {
		PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe
		vector<SharedPtr<Activity>> itemList;
		vector<string> opList;
		vector<bool> recalCompositionFlagList;//重算配比标志
		vector<UpdatePairingDutyNode> updatePairingDutyNodeList; //重算PairingDutyNode标志
		vector<SharedPtr<UpdateActivityIdItem>> updateIdList;
		vector<Pairing*> pairingList;
		vector<SharedPtr<Segment>> flightList;
		vector<shared_ptr<FatigueResult>> updateFatigueResults;
		SharedPtr<SwapData> swapData;   //若是swap操作，则填充swapData，否则留空
		int ret = 0;
		rapidjson::Document document;
		string rootDirStr = g_rootDir;
		Logger::getRuleLogger()->info("---------------------------");
		Logger::getRuleLogger()->info("[{}][update Flight] {}", sessionName, jsonName);
		Logger::getRuleConsoleLogger()->info("[{}][Update Flight] {}", sessionName, jsonName);
		dbData->reset();
		ret = readJsonInput(jsonText, jsonName, rootDirStr, document);
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_update_filght invalid data");
			return ret;
		}
		dbData->setIs8091AlwaysResetSeqOrder(dbData->systemParamMap["RULESRV_8091_ALWAYS_RESET_SEQORDER"] == "YES");

		//parse json document to opList(add/del/update), itemList(roster/pairing)
		parseJson_UpdateList(document, opList, itemList, recalCompositionFlagList, updatePairingDutyNodeList, updateIdList, updateFatigueResults);

		//收集更新涉及的crew
		map<string, SharedPtr<CREW>> updatedCrews;
		updateDatas(opList, itemList, dbData, updatedCrews, pairingList, flightList);
		
		Logger::getRuleLogger()->info("rule_engine_update_filght updatedCrews size:{}, pairingList size:{}, flightList size:{}", updatedCrews.size(), pairingList.size(), flightList.size());
		
		//update dbData
		dbg = "update-data";
		ret = doUpdateActivity(errCtx, opList, itemList, dbData, ruleEngine, updatedCrews);
		//重新收集涉及的pairing doupdate可能会更新pairing对象
		updateDatas(opList, itemList, dbData, updatedCrews, pairingList, flightList);
		ruleEngine->resetPairingDutySegTimeByFlight(dbData, flightList, pairingList);
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_update_filght [doUpdateActivity] process changing fail");
			return ret;
		}

		//check rule
		dbg = "check-rule";
		{
			//检查法规并汇总返回json
			string outpath = rootDirStr + "/outbox/roster/" + jsonName;
			ofstream outStream;
			outStream.open(outpath);


			//检查指定crew法规，并打印违规json到outStream
			outStream << "[\n";
			checkCrewsAndPrintJson(errCtx, outStream, ruleEngine, updatedCrews, swapData);
			if (!updatedCrews.empty() && !pairingList.empty())
				outStream << ",\n";
			//20190301 ain, mantis#5048, 流程修改, 先计算配比, 后检查法规, 避免2030检查认为java默认赋值配比违规
			//20190416 yuankai.cai makepairing时不需要计算配比赋值
			//calculateCompositionForAddPairing(opList, itemList, dbData, ruleEngine.get());
			//20190117 ain, OP#1963, ruleSrv pairing流程重构, 先ruleEngine计算/检查, 在计算addPairing配比, 最后输出outbox/
			map<long long, vector < RULE_VIOLATION* >> pairingViolations;
			checkPairing_checkLegality(ruleEngine.get(), pairingList, pairingViolations);
			PrintJson(outStream, pairingList, pairingViolations, dbData.get());
			outStream << "]";

			outStream.flush();
			outStream.close();
		}

		//error msg
		dbg = "err-msg";
		errCtx->errorCode = dbCtx.errorCode;
		strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in rule_engine_update_filght, dbg={}, except={}", dbg, ex);
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in rule_engine_update_filght, dbg={}  except={}", dbg , ex.what());
	}
	catch (string s){
		Logger::getRuleLogger()->error("EXCEPTION: in rule_engine_update_filght, dbg={} {}", dbg, s);
	}
	catch (...) {
		Logger::getRuleLogger()->error("EXCEPTION: in rule_engine_update_filght, dbg={}", dbg);
	}

	return errCtx->errorCode;
}


int rule_engine_route_actual_rest(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe
	vector<SharedPtr<RouteActualRest>> addList;
	vector<SharedPtr<RouteActualRest>> delList;
	vector<SharedPtr<RouteActualRest>> updateList;

	map<string, SharedPtr<CREW>> updatedCrews;
	SharedPtr<SwapData> swapData;
	int ret = 0;
	rapidjson::Document document;
	string rootDirStr = g_rootDir;

	dbData->reset();
	string dbg = "read-json";
	try {

		Logger::getRuleLogger()->info("---------------------------");
		Logger::getRuleLogger()->info("[{}][ROUTE_ACTUAL_REST] {}", sessionName, jsonName);

		ret = readJsonInput(jsonText, jsonName, rootDirStr, document);
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_route_actual_rest invalid data");
			return ret;
		}

		//parse json document to opList(add/del/update), itemList(roster/pairing)
		parseJson_RouteActualRestLists(document, addList, updateList, delList);

		//add/del/update
		for (auto& item : addList) {
			cout << "                         add    "
				<< item->crewId << " " << utcToUtcDtString(item->schDepDtLoc)
				<< " " << item->fltNum << " " << item->restTime << endl;
			dbData->routeActualRestList.push_back(item);
		}
		for (auto& item : updateList) {
			for (auto it = dbData->routeActualRestList.begin(); it != dbData->routeActualRestList.end(); it++) {
				if (item->isSameFltCrew(it->get())) {
					cout << "                         Update "
						<< item->crewId << " " << utcToUtcDtString(item->schDepDtLoc)
						<< " " << item->fltNum << " " << item->restTime << endl;
					(*it)->restTime = item->restTime;
					break;
				}
			}
		}
		for (auto& item : delList) {
			for (auto it = dbData->routeActualRestList.begin(); it != dbData->routeActualRestList.end(); it++) {
				if (item->isSameFltCrew(it->get())) {
					cout << "                         Del    "
						<< item->crewId << " " << utcToUtcDtString(item->schDepDtLoc)
						<< " " << item->fltNum << " " << item->restTime << endl;
					dbData->routeActualRestList.erase(it); 
					break;
				}
			}
		}

		//gather crews
		for (auto& item : addList) {
			updatedCrews[item->crewId] = dbData->crewIdMap[item->crewId];
		}
		for (auto& item : updateList) {
			updatedCrews[item->crewId] = dbData->crewIdMap[item->crewId];
		}
		for (auto& item : delList) {
			updatedCrews[item->crewId] = dbData->crewIdMap[item->crewId];
		}
		
		//check rule
		dbg = "check-rule";
		{
			//检查法规并汇总返回json
			string outpath = rootDirStr + "/outbox/roster/" + jsonName;
			ofstream outStream;
			outStream.open(outpath);

			//检查指定crew法规，并打印违规json到outStream
			outStream << "[\n";
			checkCrewsAndPrintJson(errCtx, outStream, ruleEngine, updatedCrews, swapData);
			outStream << "]";

			outStream.flush();
			outStream.close();
		}

		//error msg
		dbg = "err-msg";
		errCtx->errorCode = dbCtx.errorCode;
		strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in ROUTE_ACTUAL_REST, dbg={} except={}", dbg, ex);
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in ROUTE_ACTUAL_REST, dbg={} except={}", dbg, ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("EXCEPTION: in ROUTE_ACTUAL_REST, dbg={}", dbg);
	}

	return errCtx->errorCode;
}

//201990420 ain, mantis#5357
int rule_engine_crew_preference(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe
	vector<SharedPtr<CREW_PREFERENCE>> addList;
	vector<SharedPtr<CREW_PREFERENCE>> delList;
	vector<SharedPtr<CREW_PREFERENCE>> updateList;

	map<string, SharedPtr<CREW>> updatedCrews;
	SharedPtr<SwapData> swapData;
	int ret = 0;
	rapidjson::Document document;
	string rootDirStr = g_rootDir;

	dbData->reset();
	string dbg = "read-json";
	try {

		Logger::getRuleLogger()->info("---------------------------");
		Logger::getRuleLogger()->info("[{}][CREW_PREFERENCE] {}", sessionName, jsonName);

		ret = readJsonInput(jsonText, jsonName, rootDirStr, document);
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_crew_preference invalid data");
			return ret;
		}

		//parse json document to opList(add/del/update), itemList(roster/pairing)
		parseJson_CrewPreferenceLists(document, addList, updateList, delList);

		//20190416 ain, mantis#4711, 修正 crewIdMap key存在而value为空导致except
		//add/del/update
		//20190426 ain, 合并 add/ update, 按id判断
		vector<SharedPtr<CREW_PREFERENCE>> addOrUpdate;
		addOrUpdate.insert(addOrUpdate.end(), addList.begin(), addList.end());
		addOrUpdate.insert(addOrUpdate.end(), updateList.begin(), updateList.end());
		cout << "                         add:" << addList.size() << " update:" << updateList.size() << " del:" << delList.size() << endl;
		int index = 0;
		for (auto& item : addOrUpdate) {
			index++;
			if (dbData->crewIdMap.find(item->idCrew) != dbData->crewIdMap.end() && dbData->crewIdMap[item->idCrew]) {
				dbData->crewIdMap[item->idCrew]->preferenceList.push_back(item);
				auto& crew = dbData->crewIdMap[item->idCrew];
				bool alreadyExist = false;
				for (std::size_t i = 0; i < crew->preferenceList.size(); i++) {
					if (crew->preferenceList[i]->id == item->id) {
						//20190510 ain, 只打印前50条
						if (index <= 50) {
							cout << "                         update "
								<< item->idCrew << " " << item->pref << " " << item->prefType << " status=" << item->status << endl;
						}
						alreadyExist = true;
						crew->preferenceList[i] = item;
					}
				}
				if (!alreadyExist) {
					//20190510 ain, 只打印前50条
					if (index <= 50) {
						cout << "                         add    "
							<< item->idCrew << " " << item->pref << " " << item->prefType << " status=" << item->status << endl;
					}
					crew->preferenceList.push_back(item);
				}
			}
		}
		//del
		index = 0;
		for (auto& item : delList) {
			index++;
			//20190510 ain, 只打印前50条
			if (index <= 50) {
				cout << "                         del    "
					<< item->idCrew << " " << item->pref << " " << item->prefType << " status=" << item->status << endl;
			}
			if (dbData->crewIdMap.find(item->idCrew) != dbData->crewIdMap.end()) {
				int index = -1;
				auto& crewPreferenceList = dbData->crewIdMap[item->idCrew]->preferenceList;
				for (std::size_t i = 0; i < crewPreferenceList.size(); i++) {
					if (crewPreferenceList[i]->isSame(item.get())) {
						index = (int)i;
						break;
					}
				}
				if (index != -1)
					crewPreferenceList.erase(crewPreferenceList.begin() + index);
			}
		}

		//gather crews
		for (auto& item : addList) {
			updatedCrews[item->idCrew] = dbData->crewIdMap[item->idCrew];
		}
		for (auto& item : updateList) {
			updatedCrews[item->idCrew] = dbData->crewIdMap[item->idCrew];
		}
		for (auto& item : delList) {
			updatedCrews[item->idCrew] = dbData->crewIdMap[item->idCrew];
		}

		//check rule
		dbg = "check-rule";
		{
			//检查法规并汇总返回json
			string outpath = rootDirStr + "/outbox/roster/" + jsonName;
			ofstream outStream;
			outStream.open(outpath);

			//检查指定crew法规，并打印违规json到outStream
			outStream << "[\n";
			// mantis#6772, crew preference will not update manday
			checkCrewsAndPrintJson(errCtx, outStream, ruleEngine, updatedCrews, swapData, false);
			outStream << "]";

			outStream.flush();
			outStream.close();
		}

		//error msg
		dbg = "err-msg";
		errCtx->errorCode = dbCtx.errorCode;
		strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in CREW_PREFERENCE, dbg={} except={}", dbg, ex);
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in CREW_PREFERENCE, dbg={} except={}", dbg, ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("EXCEPTION: in CREW_PREFERENCE, dbg={}", dbg);
	}

	return errCtx->errorCode;
}
int rule_engine_crew_entitlement(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe
	vector<SharedPtr<CREW_ENTITLEMENT>> addList;
	vector<SharedPtr<CREW_ENTITLEMENT>> delList;
	vector<SharedPtr<CREW_ENTITLEMENT>> updateList;

	map<string, SharedPtr<CREW>> updatedCrews;
	SharedPtr<SwapData> swapData;
	int ret = 0;
	rapidjson::Document document;
	string rootDirStr = g_rootDir;

	dbData->reset();
	string dbg = "read-json";
	try {

		Logger::getRuleLogger()->info("---------------------------");
		Logger::getRuleLogger()->info("[{}][CREW_ENTITLEMENT] {}", sessionName, jsonName);

		ret = readJsonInput(jsonText, jsonName, rootDirStr, document);
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_crew_entitlement invalid data");
			return ret;
		}

		//parse json document to opList(add/del/update), itemList(roster/pairing)
		parseJson_CrewEntitlementLists(document, addList, updateList, delList);

		//20190416 ain, mantis#4711, 修正 crewIdMap key存在而value为空导致except
		//add/del/update
		for (auto& item : addList) {
			cout << "                         add    "
				<< item->crewId << " " << item->year << " " << item->type << " all=" << item->entitlement << " used=" << item->used << endl;
			if (dbData->crewIdMap.find(item->crewId) != dbData->crewIdMap.end() && dbData->crewIdMap[item->crewId]) {
				dbData->crewIdMap[item->crewId]->entitlements.push_back(item);
			}
		}
		for (auto& item : updateList) {
			cout << "                         update "
				<< item->crewId << " " << item->year << " " << item->type << " all=" << item->entitlement << " used=" << item->used << endl;
			if (dbData->crewIdMap.find(item->crewId) != dbData->crewIdMap.end() && dbData->crewIdMap[item->crewId]) {
				int index = -1;
				auto& crewEntitlementList = dbData->crewIdMap[item->crewId]->entitlements;
				for (std::size_t i = 0; i < crewEntitlementList.size(); i++) {
					if (crewEntitlementList[i]->isSameItem(item.get())) {
						index = (int)i;
						break;
					}
				}
				if (index == -1)
					crewEntitlementList.push_back(item);
				else
					crewEntitlementList[index] = item;
			}
		}
		for (auto& item : delList) {
			cout << "                         del    "
				<< item->crewId << " " << item->year << " " << item->type << " all=" << item->entitlement << " used=" << item->used << endl;
			if (dbData->crewIdMap.find(item->crewId) != dbData->crewIdMap.end() && dbData->crewIdMap[item->crewId]) {
				int index = -1;
				auto& crewEntitlementList = dbData->crewIdMap[item->crewId]->entitlements;
				for (std::size_t i = 0; i < crewEntitlementList.size(); i++) {
					if (crewEntitlementList[i]->isSameItem(item.get())) {
						index = (int)i;
						break;
					}
				}
				if (index != -1)
					crewEntitlementList.erase(crewEntitlementList.begin() + index);
			}
		}

		//gather crews
		for (auto& item : addList) {
			updatedCrews[item->crewId] = dbData->crewIdMap[item->crewId];
		}
		for (auto& item : updateList) {
			updatedCrews[item->crewId] = dbData->crewIdMap[item->crewId];
		}
		for (auto& item : delList) {
			updatedCrews[item->crewId] = dbData->crewIdMap[item->crewId];
		}

		//check rule
		dbg = "check-rule";
		{
			//检查法规并汇总返回json
			string outpath = rootDirStr + "/outbox/roster/" + jsonName;
			ofstream outStream;
			outStream.open(outpath);

			//检查指定crew法规，并打印违规json到outStream
			outStream << "[\n";
			checkCrewsAndPrintJson(errCtx, outStream, ruleEngine, updatedCrews, swapData);
			outStream << "]";

			outStream.flush();
			outStream.close();
		}

		//error msg
		dbg = "err-msg";
		errCtx->errorCode = dbCtx.errorCode;
		strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in CREW_PREFERENCE, dbg={} except={}", dbg, ex);
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in CREW_PREFERENCE, dbg={} except={}", dbg, ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("EXCEPTION: in CREW_PREFERENCE, dbg={}", dbg);
	}
	return errCtx->errorCode;
}
//********************************************
//成功返回0，失败返回错误码
//********************************************
int rule_engine_crew_manday(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * jsonText, const char * jsonName) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe

	map<string, map<time_t, SharedPtr<CREW_MANDAY_BASIC>>> addOrUpdateMap;
	map<string, map<time_t, SharedPtr<CREW_MANDAY_BASIC>>> delMap;

	map<string, SharedPtr<CREW>> updatedCrews;
	SharedPtr<SwapData> swapData;
	int ret = 0;
	rapidjson::Document document;
	string rootDirStr = g_rootDir;
	time_t nowInUtc = time(0);
	dbData->reset();
	string dbg = "read-json";
	try {

		Logger::getRuleLogger()->info("---------------------------");
		Logger::getRuleLogger()->info("[{}][CREW_MANDAY] {}", sessionName, jsonName);
		Logger::getRuleConsoleLogger()->info("[{}][Update Manday] {}", sessionName, jsonName);

		ret = readJsonInput(jsonText, jsonName, rootDirStr, document);
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_crew_manday invalid data");
			return ret;
		}

		//parse json document to opList(add/del/update), itemList(roster/pairing)
		parseJson_CrewMandayLists(document, addOrUpdateMap, delMap);
		map<string, SharedPtr<CREW>> targetCrews;

		//add/del/update
		for (auto& it : addOrUpdateMap) {
			string crewId = it.first;
			auto& addOrUpdateOfCrew = it.second;
			auto iterCrew = dbData->crewIdMap.find(crewId);
			if (iterCrew == dbData->crewIdMap.end()) {
				continue;
            }
			auto& crew = iterCrew->second;
			if (!crew) {
				continue;
			}
			targetCrews[crew->idCrew] = crew;
			string division = crew->division;
			map<time_t, bool> updateItem;
			//update
			for (auto& md : crew->mandayCcAmList) {
				if (addOrUpdateOfCrew.find(md->dateLoc) != addOrUpdateOfCrew.end()) {
					md->copyFrom(addOrUpdateOfCrew[md->dateLoc].get());
					time_t t = md->dateLoc;
					int offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(t);
					md->crewDateUtc = t - (time_t)offsetMinutes * 60;
					updateItem[md->dateLoc] = true;
				}
			}
			for (auto& md : crew->mandayFdList) {
				if (addOrUpdateOfCrew.find(md->dateLoc) != addOrUpdateOfCrew.end()) {
					md->copyFrom(addOrUpdateOfCrew[md->dateLoc].get());
					time_t t = md->dateLoc;
					int offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(t);
					md->crewDateUtc = t - (time_t)offsetMinutes * 60;
					time_t nowLocalDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(nowInUtc, offsetMinutes);//系统时间转换成本地时间所在天（UTC时区)
					md->recalFleetLanding = (md->crewDateUtc >= nowLocalDayInUtc);//今天和未来时间重新计算FleetLanding
					updateItem[md->dateLoc] = true;
				}
			}
			//add
			for (auto& it2 : addOrUpdateOfCrew) {
				time_t dt = it2.first;
				if (updateItem.find(dt) == updateItem.end()) {
					if (division == "P") {
						SharedPtr<CREW_MANDAY_FD> item(new CREW_MANDAY_FD());
						item->copyFrom(it2.second.get());
						time_t t = item->dateLoc;
						int offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(t);
						item->crewDateUtc = t - (time_t)offsetMinutes * 60;
						time_t nowLocalDayInUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(nowInUtc, offsetMinutes);//系统时间转换成本地时间所在天（UTC时区)
						item->recalFleetLanding = (item->crewDateUtc >= nowLocalDayInUtc);//今天和未来时间重新计算FleetLanding
						crew->mandayFdList.push_back(item);
					}
					else {
						SharedPtr<CREW_MANDAY_CC_AM> item(new CREW_MANDAY_CC_AM());
						item->copyFrom(it2.second.get());
						time_t t = item->dateLoc;
						int offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(t);
						item->crewDateUtc = t - (time_t)offsetMinutes * 60;
						crew->mandayCcAmList.push_back(item);
					}
				}
			}
		}
		//del
		for (auto& it : delMap) {
			string crewId = it.first;
			auto& delOfCrew = it.second;
			auto iterCrew = dbData->crewIdMap.find(crewId);
			if (iterCrew == dbData->crewIdMap.end()) {
				continue;
			}
			auto& crew = iterCrew->second;
			if (!crew) {
				continue;
			}
			targetCrews[crew->idCrew] = crew;
			string division = crew->division;
			if (division == "P") {
				for (auto& md : crew->mandayFdList) {
					time_t dt = md->dateLoc;
					if (delOfCrew.find(dt) != delOfCrew.end()) {
						md->reset(true);
					}
				}
			}
			else {
				for (auto& md : crew->mandayCcAmList) {
					time_t dt = md->dateLoc;
					if (delOfCrew.find(dt) != delOfCrew.end()) {
						md->reset(true);
					}
				}
			}
		}

		//检查法规并汇总返回json
		string outDir = rootDirStr + "/outbox/roster/";
		ofstream outStream;
		string outpath = outDir + jsonName;
		outStream.open(outpath);

		//检查法规并输出违规结果json
		outStream << "[\n";
		SharedPtr<SwapData> swapData;
		checkCrewsAndPrintJson(errCtx, outStream, ruleEngine, targetCrews, swapData); //不是swap操作,swapData=empty
		outStream << "]";
		outStream.flush();
		outStream.close();

		//error msg
		dbg = "err-msg";
		errCtx->errorCode = 0;
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in CREW_MANDAY, dbg={} except={}", dbg, ex);
	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("EXCEPTION: in CREW_MANDAY, dbg={} except={}", dbg, ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("EXCEPTION: in CREW_MANDAY, dbg={}", dbg);
	}	
	

	return errCtx->errorCode;
}
//********************************************
//成功返回0，失败返回错误码
//********************************************
int rule_engine_get_rosters(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char * idcrew, stringstream& outputStream) {

	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe
	dbData->reset();
	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][Get Rosters]", sessionName);
	if (dbData->crewIdMap.find(idcrew) == dbData->crewIdMap.end()) {
		stringstream ss;
		ss << "idcrew=" << idcrew << " not found, get rosters fail";
		Logger::getRuleLogger()->error("[rule_engine_get_rosters] {}", ss.str());
		errCtx->errorCode = -1;
		strncpy(errCtx->errorMsgBuf, ss.str().c_str(), sizeof(errCtx->errorMsgBuf));
		return errCtx->errorCode;
	}

	SharedPtr<CREW>& crew = dbData->crewIdMap[idcrew];
	formatToJson_RosterList(outputStream, crew->rosterList);

	//error msg
	errCtx->errorCode = dbCtx.errorCode;
	strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	return errCtx->errorCode;
}

int rule_engine_query_crew(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> dbData, const char * idcrew, stringstream& outputStream) {
	dbData->reset();
	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][Query Crew]", sessionName);
	if (dbData->crewIdMap.find(idcrew) == dbData->crewIdMap.end()) {
		stringstream ss;
		ss << "idcrew=" << idcrew << " not found, query crew fail";
		Logger::getRuleLogger()->error("[rule_engine_query_crew] {}", ss.str());
		errCtx->errorCode = -1;
		strncpy(errCtx->errorMsgBuf, ss.str().c_str(), sizeof(errCtx->errorMsgBuf));
		return errCtx->errorCode;
	}

	if (dbData->crewIdMap.find(idcrew) == dbData->crewIdMap.end()) {
		errCtx->errorCode = -1;
		strncpy(errCtx->errorMsgBuf, "crew not found", sizeof(errCtx->errorMsgBuf));
	}
	else {
		CREW* crew = dbData->crewIdMap[idcrew].get();
		//printf_single_crew(stdout, crew);
		outputStream << "\n" << crew->idCrew << " " << crew->firstName << " " << crew->lastName << " " << crew->alias << " " << crew->division << " " << crew->nationality << " " << (crew->birthdayTm.tm_year + 1900) << "-" << (crew->birthdayTm.tm_mon + 1) << "-" << (crew->birthdayTm.tm_mday);
		outputStream << "\nbase: ";
		for (auto& item : crew->baseList) {
			outputStream << "\n    " << item->base << "(" << utcToUtcDtString(item->effLoc) << "," << utcToUtcDtString(item->expLoc) << ") ";
		}
		outputStream << "\nrank: ";
		for (auto& item : crew->rankList) {
			outputStream << "\n    " << item->rank << "(" << utcToUtcDtString(crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(item->effUtc)) << "," << utcToUtcDtString(crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(item->expUtc)) << ") ";
		}
		outputStream << "\nfleet: ";
		for (auto& item : crew->fleetList) {
			outputStream << "\n    " << item->fleet << "(" << utcToUtcDtString(crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(item->effUtc)) << "," << utcToUtcDtString(crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(item->expUtc)) << ") ";
		}
		outputStream << "\nqual: ";
		for (auto& item : crew->qualificationList) {
			outputStream << "\n    " << item->qual << "(" << utcToUtcDtString(crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(item->issuedUtc)) << "," << utcToUtcDtString(crew->crewBaseTimezoneOffsetIndex->getLocalDayStart(item->expiryUtc)) << ") ";
		}
		outputStream << "\npref: ";
		for (auto& item : crew->preferenceList) {
			outputStream << item->pref << "(" << utcToUtcDtString((item->strDtloc)) << "," << utcToUtcDtString((item->endDtLoc)) << ") ";
		}
		outputStream << "\nroster: \n";
		for (auto& item : crew->rosterList) {
			outputStream << "    " << utcToUtcDtString(item->strLoc) << " " << item->label << " " << item->duty << " " << item->location << "\n";
		}
	}
	return errCtx->errorCode;
}

int rule_engine_get_worry_crew(ErrorContext* errCtx, const char* sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char* jsonName, const char* session) {
	rapidjson::Document document;
	string sessionStr = session;
	string rootDirStr = g_rootDir;
	string filepath = rootDirStr + "/inbox/roster/" + jsonName;//20180320 ain, 统一inbox路径为 inbox/roster/

	dbData->reset();
	formatFilePath(filepath);

	//参数检查
	if (!filepath.c_str()) {
		//_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Param filepath is NULL ");
		return ERR_JSON_PARAM;
	}

	FILE* pFile = fopen(filepath.c_str(), "r");
	if (pFile == NULL) {
		//_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: not exist or open failed '%s'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	document.ParseStream<0>(is);
	fclose(pFile);

	if (!document.IsArray()) {
		//_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}
	vector<CrewLeaveData> list;
	for (SizeType i = 0; i < document.Size(); i++) {

		Value& doc = document[i];
		CrewLeaveData crewLeavedata;
		if (doc.HasMember("crewId")) {
			crewLeavedata.crewId = doc["crewId"].GetString();
		}
		if (doc.HasMember("leaveStartDate")) {
			string start = doc["leaveStartDate"].GetString();
			crewLeavedata.leaveStartDate = localStrToUtc(const_cast<char*>(start.c_str()), 420);
		}
		if (doc.HasMember("leaveEndDate")) {
			string end = doc["leaveEndDate"].GetString();
			end = end + " 23:59:59";
			crewLeavedata.leaveEndDate = localStrToUtc(const_cast<char*>(end.c_str()), 420);
		}
		list.push_back(crewLeavedata);
	}
	Logger::getRuleLogger()->info("---------------------------");
	for (const auto& crew : list) {
		if (dbData->crewIdMap.find(crew.crewId) != dbData->crewIdMap.end() && dbData->crewIdMap[crew.crewId]->division == dbData->scenario.division) {
			const auto& leavestart = getLocalDayStartInUTC(crew.leaveStartDate, 420);
			const auto& leaveend = getLocalDayStartInUTC(crew.leaveEndDate, 420);
			int days = getDaysByDuration(leavestart, leaveend) + 1;
			const auto& rosters = dbData->crewIdMap[crew.crewId]->rosterList;

			for (int i = 0; i < days; i++) {
				const auto& start = leavestart + i * 86400 - 420 * 60;
				const auto& end = start + 86400 - 60;
				bool hasRoster = false;

				for (const auto& roster : rosters) {
					if (start >= roster->getStartTimeUtcAct() && end <= roster->getEndTimeUtcAct()) {
						if (roster->qualifier != "VAC" && roster->qualifier != "HOL" && roster->qualifier != "VOFF" && roster->qualifier != "VAC_PH") {
							Logger::getRuleLogger()->info("{},{},{}", crew.crewId, utcToUtcDtString(crew.leaveStartDate + 420 * 60), utcToUtcDtString(crew.leaveEndDate + 420 * 60));
						}
						hasRoster = true;
					}
				}
				if (!hasRoster)
					Logger::getRuleLogger()->info("{},{},{}", crew.crewId, utcToUtcDtString(crew.leaveStartDate + 420 * 60), utcToUtcDtString(crew.leaveEndDate + 420 * 60));

			}


			/*for (const auto& roster : rosters) {
				if (roster->getStartTimeUtcAct() >= crew.leaveStartDate && roster->getEndTimeUtcAct() <= crew.leaveEndDate) {
					if (roster->qualifier != "VAC" && roster->qualifier != "HOL" && roster->qualifier != "VOFF" && roster->qualifier != "VAC_PH") {
						Logger::getRuleLogger()->info("{},{},{}", crew.crewId, utcToUtcDtString(crew.leaveStartDate + 420 * 60), utcToUtcDtString(crew.leaveEndDate + 420 * 60));
					}
					const auto & rostersstart = getLocalDayStartInUTC(roster->getStartTimeUtcAct(), 420);
					const auto& leavestart = getLocalDayStartInUTC(crew.leaveStartDate, 420);
					const auto& rosterend = getLocalDayStartInUTC(roster->getEndTimeUtcAct(), 420);
					const auto& leaveend = getLocalDayStartInUTC(crew.leaveEndDate, 420);
					hasRoster = true;
					if (rostersstart != leavestart && rosterend != leaveend)
						Logger::getRuleLogger()->info("{},{},{}", crew.crewId, utcToUtcDtString(crew.leaveStartDate + 420 * 60), utcToUtcDtString(crew.leaveEndDate + 420 * 60));
				}
				
			}
			if (!hasRoster)*/
		}
	}
	
	return 0;
}

//成功返回0，失败返回错误码
int rule_engine_check_duty_code(ErrorContext* errCtx, const char* sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char* jsonName, const char* session) {
	rapidjson::Document document;
	string sessionStr = session;
	string rootDirStr = g_rootDir;
	string filepath = rootDirStr + "/inbox/roster/" + jsonName;//20180320 ain, 统一inbox路径为 inbox/roster/

	dbData->reset();
	formatFilePath(filepath);

	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][Check Duty Code] {}", sessionName, filepath.c_str());
	Logger::getRuleConsoleLogger()->info("[{}][Check Duty Code] {}", sessionName, filepath.c_str());

	//read input json
	vector<long long> pairingIds;
	errCtx->errorCode = readFile_PairingIdList(filepath.c_str(), pairingIds, document);
	if (errCtx->errorCode != 0) {
		strncpy(errCtx->errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx->errorMsgBuf));
		strncat(errCtx->errorMsgBuf, " @parse json fail", sizeof(errCtx->errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
		return errCtx->errorCode;
	}

	std::vector<int> pairingIndices;
	for(int i = 0; i <dbData->pairingList.size(); i++) {
		auto& pairing = dbData->pairingList[i];
		if(std::find(pairingIds.begin(), pairingIds.end(), pairing->getDbId()) != pairingIds.end()) {
			pairingIndices.push_back(i);
		}
    }

	map<Segment*, bool> dutyCodeViolationMap;//key:segment对象, value:true表示有违规

	auto dutyCodeAssignment = dbData->GetDutyCodeAssignment();
	auto resultViolations = dutyCodeAssignment->CheckDutyCode(dbData->pairingList, pairingIndices);

	for (int i = 0; i < resultViolations.size(); i++) {
		auto& segmentViolations = resultViolations[i];
        if (i >= pairingIndices.size()) {
			break;
		}
		int pairingIndex = pairingIndices[i];
		if (pairingIndex >= dbData->pairingList.size()) {
			continue;
		}
		auto pairing = dbData->pairingList[pairingIndex];
		int segmentIndex = 0;
		for (auto duty : pairing->getDutyVec()) {
			for (auto segment : duty->getSegmentsRead()) {
				if (segmentIndex >= segmentViolations.size()) {
					continue;
				}
				dutyCodeViolationMap[segment] = segmentViolations[segmentIndex];
				segmentIndex++;
			}
		}
	}

	//write output json
	errCtx->errorCode = checkDutyCode_outputJson(jsonName, rootDirStr, dutyCodeViolationMap);
	if (errCtx->errorCode != 0) {
		Logger::getRuleLogger()->error("ERROR: write output json fail, {}", readFile_getLastErrMsg());
	}
	else {
		Logger::getRuleLogger()->info("\tSUCCESS");
		Logger::getRuleConsoleLogger()->info("\tsuccess");
	}

	//error msg
	strncpy(errCtx->errorMsgBuf, "rule_engine_check_duty_code fail", sizeof(errCtx->errorMsgBuf));
	return errCtx->errorCode;
}

//成功返回0，失败返回错误码
int rule_engine_get_duty_code(ErrorContext* errCtx, const char* sessionName, SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine, const char* jsonName, const char* session) {
	rapidjson::Document document;
	vector<long long> pairingIds;
	string sessionStr = session;
	string rootDirStr = g_rootDir;
	string filepath = rootDirStr + "/inbox/roster/" + jsonName;

	dbData->reset();
	formatFilePath(filepath);

	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][Get Duty Code] {}", sessionName, filepath.c_str());
	Logger::getRuleConsoleLogger()->info("[{}][Get Duty Code] {}", sessionName, filepath.c_str());

	//read input json
	errCtx->errorCode = readFile_PairingIdList(filepath.c_str(), pairingIds, document);
	if (errCtx->errorCode != 0) {
		strncpy(errCtx->errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx->errorMsgBuf));
		strncat(errCtx->errorMsgBuf, " @parse json fail", sizeof(errCtx->errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
		return errCtx->errorCode;
	}

	std::vector<int> pairingIndices;
	for (int i = 0; i < dbData->pairingList.size(); i++) {
		auto& pairing = dbData->pairingList[i];
		if (std::find(pairingIds.begin(), pairingIds.end(), pairing->getDbId()) != pairingIds.end()) {
			pairingIndices.push_back(i);
		}
	}

	map<Segment*, DutyCode::DutyCode> dutyCodeMap;//key:segment对象, value:DutyCode

	auto dutyCodeAssignment = dbData->GetDutyCodeAssignment();
	auto resultDutyCodes = dutyCodeAssignment->GetDutyCode(dbData->pairingList, pairingIndices);

	for (int i = 0; i < resultDutyCodes.size(); i++) {
		auto& segmentDutyCodes = resultDutyCodes[i];
		if (i >= pairingIndices.size()) {
			break;
		}
		int pairingIndex = pairingIndices[i];
		if (pairingIndex >= dbData->pairingList.size()) {
			continue;
		}
		auto pairing = dbData->pairingList[pairingIndex];
		int segmentIndex = 0;
		for (auto duty : pairing->getDutyVec()) {
			for (auto segment : duty->getSegments()) {
				if (segmentIndex >= segmentDutyCodes.size()) {
					continue;
				}
				auto& dutyCode = segmentDutyCodes[segmentIndex];
				segment->setDutyCodeType(dutyTypeToString(dutyCode.GetDutyType()));
				segment->setDutyCode(dutyCode.GetDutyCode());
				dutyCodeMap[segment] = dutyCode;
				segmentIndex++;
			}
		}
		pairing->initAssignedDutyCode();
	}

	//write output json
	errCtx->errorCode = getDutyCode_outputJson(jsonName, rootDirStr, dutyCodeMap);
	if (errCtx->errorCode != 0) {
		Logger::getRuleLogger()->error("ERROR: write output json fail, {}", readFile_getLastErrMsg());
	}
	else {
		Logger::getRuleLogger()->info("\tSUCCESS");
		Logger::getRuleConsoleLogger()->info("\tsuccess");
	}

	//error msg
	strncpy(errCtx->errorMsgBuf, "rule_engine_get_duty_code fail", sizeof(errCtx->errorMsgBuf));
	return errCtx->errorCode;
}


//********************************************
//成功返回0，失败返回错误码
//********************************************
int rule_engine_update_basedata(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> requestDbData, SharedPtr<CrewDataContext> sessionDbData, SharedPtr<LegalityChecker> ruleEngine, long long scenarioId, const char* jsonName, const char* changeType) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe


	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][Update BaseData] {} {}", sessionName, scenarioId, jsonName);

	try {
		int ret = 0;
		string strChangeType = strToUpper(changeType);
		CrewDataContext::updateBaseData(requestDbData, sessionDbData, strChangeType);
		Logger::getRuleLogger()->info("[{}][Update BaseData] {} end", sessionName, scenarioId);
	}
	catch (std::exception& e) {
		dbCtx.errorCode = -1;
		Logger::getRuleLogger()->error("Exception: update basedata, {}", e.what());
	}
	catch (...) {
		dbCtx.errorCode = -1;
		Logger::getRuleLogger()->error("Exception: update basedata");
	}
	//error msg
	errCtx->errorCode = dbCtx.errorCode;
	strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	return dbCtx.errorCode;
}

//********************************************
//成功返回0，失败返回错误码
//********************************************
int rule_engine_update_scenario(ErrorContext * errCtx, const char * sessionName, SharedPtr<CrewDataContext> requestDbData, SharedPtr<CrewDataContext> sessionDbData, SharedPtr<LegalityChecker> ruleEngine, long long scenarioId, const char* jsonName) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe


	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][Update Scenario] {} {}", sessionName, scenarioId, jsonName);

	try {

		CrewDataContext::copy(requestDbData, sessionDbData);
		Logger::getRuleLogger()->info("[{}][Update Scenario] {} end", sessionName, scenarioId);
	}
	catch (std::exception& e) {
		dbCtx.errorCode = -1;
		Logger::getRuleLogger()->error("Exception: update scenario, {}", e.what());
	}
	catch (...) {
		dbCtx.errorCode = -1;
		Logger::getRuleLogger()->error("Exception: update scenario");
	}
	//error msg
	errCtx->errorCode = dbCtx.errorCode;
	strncpy(errCtx->errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx->errorMsgBuf));
	return dbCtx.errorCode;
}

// 测试用接口，随测试目标更新
int rule_engine_test(SharedPtr<CrewDataContext> dbData, SharedPtr<LegalityChecker> ruleEngine) {
	PairingDBContext dbCtx = g_ctx; //复制副本以保证错误处理thread safe
	ErrorContext errCtx = { 0 };
	int ret = 0;

	//if (dbData->crewList.size() == 0) {
	//	rule_engine_load(&errCtx, "test", dbData, ruleEngine, 851, 0, 0, "", "", "");
	//	if (dbData->crewList.size() == 0) {
	//		strncat(errCtx.errorMsgBuf, "load scenario failed", sizeof(errCtx.errorMsgBuf));
	//		return -1;
	//	}
	//}
	dbData->reset();
	//测试验证输出文件格式
	ofstream outStream;
	SharedPtr<CREW>& crew = dbData->crewList[0];;
	outStream.open("rulesrv_test_output.json");
	if (!outStream) {
		dbCtx.errorCode = -1;
		strncpy(errCtx.errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx.errorMsgBuf));
		strncat(errCtx.errorMsgBuf, " @write outpout json failed ", sizeof(errCtx.errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: {}", errCtx.errorMsgBuf);
		return -1;
	}

	//写入结果 json
	RULE_VIOLATION* tmp = new RULE_VIOLATION;
	vector<RULE_VIOLATION*> rvs;
	rvs.push_back(tmp);
	ret = formatToJson_CrewLegality(outStream, crew, rvs, dbData);
	if (ret != 0) {
		dbCtx.errorCode = ret;
		strncpy(errCtx.errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx.errorMsgBuf));
		strncat(errCtx.errorMsgBuf, " @write outpout json failed ", sizeof(errCtx.errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: {}", errCtx.errorMsgBuf);
	}
	else {
		Logger::getRuleLogger()->info("\tsuccess");
	}
	outStream.flush();
	outStream.close();

	//error msg
	errCtx.errorCode = dbCtx.errorCode;
	strncpy(errCtx.errorMsgBuf, dbCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf));
	return errCtx.errorCode;
}


//检查指定单个crew法规，并打印违规json到outStream
int checkSingleCrewAndPrintJson(ErrorContext * errCtx, ofstream& outStream, SharedPtr<LegalityChecker> ruleEngine, SharedPtr<CREW>& crew, SharedPtr<SwapData>& swapData, bool needMandayOutput = true) {

	//时间范围
	//time_t start = -1;
	//time_t end = -1;
	//for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
	//	if (start == -1 || start > crew->rosterList[i]->strUtc)
	//		start = crew->rosterList[i]->strUtc;
	//	if (end == -1 || end < crew->rosterList[i]->endUtc)
	//		end = crew->rosterList[i]->endUtc;
	//}
	
	///TEST
	//if (crew->idCrew == "002550") {
	//	cout << "";
	//}

	if (crew->baseList.empty()) {
		Logger::getRuleLogger()->error("ERROR: invalid data, crew[{}].crewBase is empty skip rule-check", crew->idCrew.c_str());
		return ERR_INVALID_CREW;
	}

	//检查法规
	int crewIndex = ruleEngine->getCrewIndex(crew->idCrew);
	if (crewIndex == -1) {
		return ERR_INVALID_CREW;
	}

	//if (crew->idCrew == "10720") {
	//	Logger::getRuleLogger()->info("1");
	//}

	RULE_LEGALITY checkItem;
	checkItem.crewIndex = crewIndex;
	checkItem.swapData = swapData;
	
	vector<RULE_LEGALITY *> checkList;
	checkList.push_back(&checkItem);

	ruleEngine->checkRules(checkList);

	//20180430 ain, mantis#3103, 按场景时间重算manday, 兼容division=P/C/A
	SharedPtr<CrewDataContext> dbData = ruleEngine->getDataContext();
	ruleEngine->reCalculateCrewManday(crew, dbData->scenario.startDtUTC, dbData->scenario.endDtUTC);

	//法规服务化，过滤掉之前告警
	vector<RULE_VIOLATION*> rvs = filterRuleViolationsWithPrepareCheckCrew(ruleEngine, dbData);
	//输出json
	ostringstream oss;
	errCtx->errorCode = formatToJson_CrewLegality(oss, crew, rvs, dbData, needMandayOutput);
	outStream << oss.str();
	//Logger::getRuleLogger()->info("   after  formatJson()\n");
	return errCtx->errorCode;
}

int checkPairings(ErrorContext * errCtx, map<long long, vector < RULE_VIOLATION* >>& pairingViolations, SharedPtr<LegalityChecker> ruleEngine, vector<Pairing*>& pairings) {
	
	checkPairing_checkLegality(ruleEngine.get(), pairings, pairingViolations);


	//int ret = formatToJson_PairingList(outStream, pairings, pairingViolations);
	return 0;
}

int PrintJson(ofstream& outStream, vector<Pairing*>& pairings, map<long long, vector < RULE_VIOLATION* >>& pairingViolations, CrewDataContext* dbData) {

	return formatToJson_PairingList(outStream, pairings, pairingViolations, dbData);
}

//检查指定多个crew法规，并打印违规json到outStream
//依赖checkSingleCrewAndPrintJson
int checkCrewsAndPrintJson(ErrorContext * errCtx, ofstream& outStream, SharedPtr<LegalityChecker> ruleEngine, map<string, SharedPtr<CREW>>& updatedCrews, SharedPtr<SwapData>& swapData, bool needMandayOutput) {
	long long lapsed = clock();
	bool firstJsonItem = true;
	SharedPtr<CrewDataContext> dbData = ruleEngine->getDataContext();
	//outStream << "[";
	for (map<string, SharedPtr<CREW>>::iterator it = updatedCrews.begin(); it != updatedCrews.end(); it++) {
		//json数组逗号分隔
		if (firstJsonItem) {
			firstJsonItem = false;
		}
		else {
			int crewIndex = ruleEngine->getCrewIndex(it->second->idCrew);
			
			outStream << "," << "\n";
		}

		int errCode = 0;
		if (it->second.get() != NULL) {
			//获得Pairing阶段的Duty的MinRest、MaxFDP值
			map<long long, tuple<int, int>> dutyLimitsMap= getDutyLimitsMap(it->second);//map<dutyId, tuple<minRest,maxFDP>>
		
			errCode = checkSingleCrewAndPrintJson(errCtx, outStream, ruleEngine, it->second, swapData, needMandayOutput);

			//基于Crew法规会修改Duty的MinRest和MaxFDP, 这里恢复原Pairing阶段的Duty的MinRest、MaxFDP值
			setDutyLimitsMap(it->second, dutyLimitsMap);
		}
		else {
			errCode = ERR_INVALID_CREW;
		}
		//检查失败, 向rest response结果中写入，避免json出现空对象(连续逗号)
		if (errCode != 0) {
			string errorMsg = errCtx->errorMsgBuf;
			if (ERR_INVALID_CREW == errCode) {
				errorMsg = checkReasonOfCrewNotMatchScenario(dbData, it->first);
			}
			Logger::getRuleLogger()->warn("WARN: check rule fail, crew={}, {}", it->first.c_str(), errorMsg.c_str());
			
			outStream << "{\"type\":1,\n"
				<< "\"messageType\":\"OUTBOND\",\n"
				<< "\"processingStatus\" : \"FAIL\",\n"
				<< "\"timeStamp\" : \"" << time(NULL) << "\",\n"
				<< "\"crewId\" : \"" << it->first << "\",\n"
				<< "\"failReason\":\"" << errorMsg << "\"\n"
				<< "}\n";
			continue;
		}
	}
	//outStream << "]";
	ruleEngine->PrintRuleStatistics();

	if (errCtx->errorCode != 0) {
		strncpy(errCtx->errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx->errorMsgBuf));
		strncat(errCtx->errorMsgBuf, " @write outpout json failed ", sizeof(errCtx->errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: {}, check crew cost {} ms", errCtx->errorMsgBuf, ((clock() - lapsed) * 1000) / CLOCKS_PER_SEC);
	}
	else {
		Logger::getRuleLogger()->info("\tsuccess, crew size={}, check crew cost {} ms", updatedCrews.size(), ((clock() - lapsed) * 1000) / CLOCKS_PER_SEC);
		Logger::getRuleConsoleLogger()->info("\tsuccess");
	}
	return errCtx->errorCode;
}

//确认crew与pairing是否匹配rank
//成功返回匹配rank，失败返回""
string findMatchRank(SharedPtr<CREW>& crew, Pairing* pairing) {
	map<string, int>::iterator it;
	for (it = pairing->getOpenComposition().begin(); it != pairing->getOpenComposition().end(); it++) {
		string pairingRank = it->first;
		for (std::size_t i = 0; i < crew->rankList.size(); i++) {
			if (crew->rankList[i]->rank == pairingRank)
				return pairingRank;
		}
	}
	return "";
}

//检查指定多个crew法规，并打印违规json到outStream
//依赖checkSingleCrewAndPrintJson
int tryPairingOnCrewsPrintJson(ErrorContext * errCtx, ofstream& outStream, SharedPtr<LegalityChecker> ruleEngine, SharedPtr<CrewDataContext>& dbData, long long pair_id, map<string, SharedPtr<CREW>>& updatedCrews, vector<long long>& temporaryDelRosterIds, string& actingRank) {
	int errCode = 0;
	//Logger::getRuleLogger()->info(">  tryPairingOnCrewsPrintJson\n");
	Pairing * pairing = dbData->pairingIdMap.find(pair_id) != dbData->pairingIdMap.end() ?
		dbData->pairingIdMap[pair_id] :
		NULL;
	
	if (pairing == NULL) {
		errCtx->errorCode = ERR_JSON;
		_snprintf(errCtx->errorMsgBuf, sizeof(errCtx->errorMsgBuf), "pairing %lld ont found", pair_id);
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
	}

	//OP#1520, find tmp del roster objs & del
	vector<SharedPtr<ROSTER>> temporaryDelRosters;
	for (long long rid : temporaryDelRosterIds) {
		SharedPtr<ROSTER> roster = dbData->findRoster(rid);
		if (roster)
			temporaryDelRosters.push_back(roster);
	}
	for (auto& roster : temporaryDelRosters) {
		dbData->delRoster(errCtx, roster);
	}
	Logger::getRuleLogger()->info("temporary delete {} rosters", temporaryDelRosters.size());

	outStream << "[";
	bool firstJsonItem = true;
	for (auto it = updatedCrews.begin(); it != updatedCrews.end(); it++) {
		//若没有匹配的rank，则略过
		SharedPtr<CREW>& crew = it->second;
		string matchRank = findMatchRank(crew, pairing);
		if (actingRank != "" && matchRank != actingRank) {
			matchRank = actingRank;
		}
		if (matchRank == "") {
			continue;
		}
		//20181120 ain, mantis#4466, 若pairing已经在crew身上, 则忽略
		bool pairingAlreadyOnCrew = false;
		for (auto& r : crew->rosterList) {
			if (r->pairId == pairing->getDbId()) {
				pairingAlreadyOnCrew = true;  break;
			}
		}
		if (pairingAlreadyOnCrew) {
			continue;
		}

		//json数组逗号分隔
		if (firstJsonItem) {
			firstJsonItem = false;
		}
		else {
			outStream << "," << "\n";
		}

		dbData->addRoster(errCtx, crew, pairing, matchRank, false, false);//20180305 ain, mantis#2886, ruleSrv不检查overlap
		if (errCtx->errorCode == ERR_OVERLAP) {
			//如果报错 overlap，不退出继续检查下一个
			//Logger::getRuleLogger()->info("ERROR: overlap, {}\n", errCtx->errorMsgBuf);
			errCtx->errorCode = 0;

			RULE_VIOLATION * rv = new RULE_VIOLATION();

			rv->crewId = crew->idCrew;
			rv->rosterId = 0;
			rv->pairingId = pairing->getDbId();
			rv->dutySequenceNumber = 0;
			rv->segmentId = 0;
			rv->startDTUtc = pairing->getStartTimeUtc();
			rv->endDTUtc = pairing->getEndTimeUtc();
			rv->violation_msg = errCtx->errorMsgBuf;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->idRule = 0;
			rv->ishard = true;

			vector<RULE_VIOLATION *> tmp(ruleEngine->getRuleViolations());
			tmp.push_back(rv); //临时添加 overlap违规
			formatToJson_CrewLegality(outStream, crew, tmp, dbData, false);//no need OUTPUT manday for tryPairingOnCrew
			
			tmp.clear();//清除临时添加的 overlap违规
			delete rv;
			continue;
		}
		else if (errCtx->errorCode != 0) {
			Logger::getRuleLogger()->error("ERROR: can not try addRoster for crew={} pairing={}", crew->idCrew.c_str(), pairing->getDbId());
			break;
		}

		//mantis#2893, tryPairingOnCrew不需要输出manday
		SharedPtr<SwapData> swapData;
		errCode = checkSingleCrewAndPrintJson(errCtx, outStream, ruleEngine, it->second, swapData, false); //不是swap操作，swapData=empty
		if (errCode != 0) {
			if (ERR_INVALID_CREW == errCode)
				Logger::getRuleLogger()->error("ERROR: check rule fail, crew={} {}", it->first.c_str(), checkReasonOfCrewNotMatchScenario(dbData, crew->idCrew).c_str());
			else
				Logger::getRuleLogger()->error("ERROR: check rule fail, err={}, msg={}", errCode, errCtx->errorMsgBuf);
			continue;
		}

		dbData->delRoster(errCtx, crew, pairing, matchRank);
		if (errCtx->errorCode != 0) {
			Logger::getRuleLogger()->error("ERROR: can not delRoster for crew={} pairing={}", crew->idCrew.c_str(), pairing->getDbId());
			break;
		}
	}
	outStream << "]";

	if (errCtx->errorCode != 0) {
		strncpy(errCtx->errorMsgBuf, readFile_getLastErrMsg(), sizeof(errCtx->errorMsgBuf));
		strncat(errCtx->errorMsgBuf, " failed ", sizeof(errCtx->errorMsgBuf));
		Logger::getRuleLogger()->error("ERROR: {}", errCtx->errorMsgBuf);
	}
	else {
		Logger::getRuleLogger()->info("success");
		Logger::getRuleConsoleLogger()->info("success");
	}

	//OP#1520, restore tmp del rosters
	for (auto& roster : temporaryDelRosters) {
		dbData->addRoster(errCtx, roster, false);//20180305 ain, mantis#2886, ruleSrv不检查overlap
	}


	//Logger::getRuleLogger()->info("<  tryPairingOnCrewsPrintJson\n");
	return errCtx->errorCode;
}

//获取crew不满足scenario的原因：rank/base/fleet/qual
string checkReasonOfCrewNotMatchScenario(SharedPtr<CrewDataContext>& dbData, string crewId) {

	if (dbData->crewIdMap.find(crewId) == dbData->crewIdMap.end()) {
		return "not match scenario, not found in crewIdMap";
	}
	else if (dbData->crewIdMap[crewId].get() == NULL) {
		return "not match scenario, empty item of crewIdMap";
	}
	else {
		SharedPtr<CREW> crew = dbData->crewIdMap[crewId];
		bool matchRank = false;
		for (string& scenarioRank : dbData->scenario.ranks) {
			for (auto& cr : crew->rankList) {
				if (cr->rank == scenarioRank && cr->effUtc < dbData->scenario.endDtUTC && cr->expUtc >= dbData->scenario.startDtUTC) {
					matchRank = true;
					break;
				}
			}
			if (matchRank) break;
		}
		bool matchBase = false;
		for (string& scenarioBase : dbData->scenario.bases) {
			for (auto& cb : crew->baseList) {
				if (cb->base == scenarioBase && cb->effUtc < dbData->scenario.endDtUTC && cb->expUtc >= dbData->scenario.startDtUTC) {
					matchBase = true;
					break;
				}
			}
			if (matchBase) break;
		}
		bool matchFleet = false;
		for (string& scenarioFleet : dbData->scenario.fleets) {
			for (auto& cb : crew->fleetList) {
				if (cb->fleet == scenarioFleet && cb->effUtc < dbData->scenario.endDtUTC && cb->expUtc >= dbData->scenario.startDtUTC) {
					matchFleet = true;
					break;
				}
			}
			if (matchFleet) break;
		}
		bool matchQual = false;
		for (string& scenarioQual : dbData->scenario.qualificationNames) {
			for (auto& cb : crew->qualificationList) {
				if (cb->qual == scenarioQual && cb->issuedUtc < dbData->scenario.endDtUTC && cb->expiryUtc >= dbData->scenario.startDtUTC) {
					matchQual = true;
					break;
				}
			}
			if (matchQual) break;
		}

		stringstream ss;
		if (!matchRank) ss << "crew_rank ";
		if (!matchBase) ss << "crew_base ";
		if (!matchFleet) ss << "crew_fleet ";
		if (!matchQual) ss << "crew_qual ";
		ss << "not match scenario";
		return ss.str();
	}
}

//根据opList/itemList数据构造 swapData对象: 收集所有crew, 对每一crew增加
SharedPtr<SwapData> makeSwapData(SharedPtr<CrewDataContext>& dbData, vector<string>& opList, vector<SharedPtr<Activity>>& itemList) {
	SharedPtr<SwapData> swapData(new SwapData);

	//遍历swap roster, 收集所有涉及的crew, 创建 swapCrew对象
	for (std::size_t i = 0; i < itemList.size(); i++) {
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			if (swapData->swapCrews.find(roster->idcrew) == swapData->swapCrews.end()) {
				SharedPtr<CREW> crew = dbData->crewIdMap[roster->idcrew];
				SharedPtr<SwapCrew> swapCrew(new SwapCrew(crew));
				swapData->swapCrews[roster->idcrew] = swapCrew;
			}
		}
	}
	//遍历swap roster, 根据op=ADD/DEL更新 swapCrew.addList/removeList
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = opList[i];
		SharedPtr<Activity> item = itemList[i];

		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			SharedPtr<SwapCrew> swapCrew = swapData->swapCrews[roster->idcrew];
			if (op == "ADD") {
				swapCrew->addedRosters.push_back(roster);
				swapCrew->afterRosters.push_back(roster);
			}
			else if (op == "DEL") {
				swapCrew->removedRosters.push_back(roster);
				auto removeItem = find_if(swapCrew->afterRosters.begin(), swapCrew->afterRosters.end(), [&roster](const SharedPtr<ROSTER>& obj) {return obj->rosterId == roster->rosterId; });
				if (swapCrew->afterRosters.end() == removeItem) {
					Logger::getRuleLogger()->error("init swap data fail, roster({}) not found in {}.afterRosters", roster->toReadableStr(), swapCrew->crewId);
				}
				else
					swapCrew->afterRosters.erase(removeItem);
			}
			else {
				// skip op=update
			}
		}
	}
	//SORT afterRoster/addedRosters/removedRosters
	for (auto& it : swapData->swapCrews) {
		SharedPtr<SwapCrew>& swapCrew = it.second;
		sortRosterByStrUtc(swapCrew->afterRosters);
		sortRosterByStrUtc(swapCrew->addedRosters);
		sortRosterByStrUtc(swapCrew->removedRosters);
	}
	return swapData;
}

int checkPairing_checkLegality(LegalityChecker* ruleEngine, vector<Pairing*>& pairingList, map<long long, vector<RULE_VIOLATION*>>& pairingViolations, bool calcPairingDutyTime) {
	vector<int> temp;	
	//20190223 ain, OP#2003, pairing.attribute
	auto dbData = ruleEngine->getDataContext();
	
	time_t currTimeUtc = Utility::GetInstancePtr()->getCurrentTimeInUTC(dbData);
	for (std::size_t i = 0; i < pairingList.size(); i++) {
		//20180914 ain, mantis#4043, ignore empty pairnig
		Pairing* p = pairingList[i];
		if (p->getNumDuties() == 0) {
			continue;
		}

		//计算Pairing当前所属phase
		dbData->calcuateRulePhases(p, currTimeUtc);

		p->resetNewPairingBySegments(dbData->baseList);
		// op#2163 去除五件套赋值逻辑
		//// 20181212 ain, mantis#4623, ruleSrv流程增加环节, 配合计算/检查分离
		if (calcPairingDutyTime) {
			ruleEngine->calculatePairingFdpRest(p);
			ruleEngine->calculatePairingLabel(p);
		}

		//检查法规前，清空上一次操作遗留的违规信息
		p->clearViolations();
		for (auto& duty : p->getDutyVec()) {
			duty->clearViolations();
			for (auto& seg : duty->getSegments()) {
				seg->clearViolations();
			}
		}
		bool isLegal = ruleEngine->checkPGRules(p, temp, PAIRING_EDITOR);
		p->setLegality(isLegal);
		for (auto& violation : ruleEngine->getRuleViolations()) {
			long long pairingId = violation->pairingId;
			if (pairingId == p->getDbId()) {
				if (pairingViolations.find(pairingId) == pairingViolations.end())
					pairingViolations.insert(make_pair(pairingId, vector<RULE_VIOLATION*>()));
				pairingViolations[pairingId].push_back(new RULE_VIOLATION(*violation)); //make copy & keep in pairingViolations
			}
		}
	}
	return 0;
}
int checkPairing_outputJson(string jsonName, string rootDirStr, vector<Pairing*>& pairingList, map<long long, vector<RULE_VIOLATION*>>& pairingViolations, CrewDataContext* dbData) {
	int ret = 0;
	//write output json
	string outDir = rootDirStr + "/outbox/";
	rule_mkdir(outDir.c_str());
	outDir = outDir + "roster/";
	rule_mkdir(outDir.c_str());
	string outpath = outDir + jsonName;
	ofstream outStream;
	outStream.open(outpath);
	if (!outStream) {
		ret = -1;
		Logger::getRuleLogger()->error("ERROR: write output json fail, {}", readFile_getLastErrMsg());
		return -1;
	}
	outStream << "[\n";
	ret = formatToJson_PairingList(outStream, pairingList, pairingViolations, dbData);
	outStream << "]";
	outStream.flush();
	outStream.close();
	return ret;
}

int checkDutyCode_outputJson(const string& jsonName, const string& rootDirStr, const map<Segment*, bool>& dutyCodeViolationMap) {
	int ret = 0;
	//write output json
	string outDir = rootDirStr + "/outbox/";
	rule_mkdir(outDir.c_str());
	outDir = outDir + "roster/";
	rule_mkdir(outDir.c_str());
	string outpath = outDir + jsonName;
	ofstream outStream;
	outStream.open(outpath);
	if (!outStream) {
		ret = -1;
		Logger::getRuleLogger()->error("ERROR: write output json fail, {}", readFile_getLastErrMsg());
		return -1;
	}
	outStream << "[\n";
	ret = formatToJson_dutyCodeViolations(outStream, dutyCodeViolationMap);
	outStream << "]";
	outStream.flush();
	outStream.close();
	return ret;
}

int getDutyCode_outputJson(const string& jsonName, const string& rootDirStr, const map<Segment*, DutyCode::DutyCode>& dutyCodeMap) {
	int ret = 0;
	//write output json
	string outDir = rootDirStr + "/outbox/";
	rule_mkdir(outDir.c_str());
	outDir = outDir + "roster/";
	rule_mkdir(outDir.c_str());
	string outpath = outDir + jsonName;
	ofstream outStream;
	outStream.open(outpath);
	if (!outStream) {
		ret = -1;
		Logger::getRuleLogger()->error("ERROR: write output json fail, {}", readFile_getLastErrMsg());
		return -1;
	}
	outStream << "[\n";
	ret = formatToJson_dutyCodes(outStream, dutyCodeMap);
	outStream << "]";
	outStream.flush();
	outStream.close();
	return ret;
}

//解析json输入流, 优先尝试解析 jsonText, 若text为空则按jsonName读取文件解析
//结果放入输出参数 document
int readJsonInput(const char* jsonText, const char* jsonName, string rootDirStr, rapidjson::Document& document) {
	int ret = 0;
	if (jsonText) {
		//parse json string
		document.Parse<0>(jsonText);
		if (document.HasParseError()) {
			Logger::getRuleLogger()->error("parse json fail, error-msg={} error-offset={}", document.GetParseError(), document.GetErrorOffset());
			return -1;
		}
	}
	else {
		//read file
		string inDir = rootDirStr + "/inbox/roster/";
		rule_mkdir(inDir.c_str());
		string inPath = inDir + jsonName;
		ifstream inStream;
		string targetCrew;
		inStream.open(inPath);
		if (!inStream) {
			Logger::getRuleLogger()->error("ERROR: read input json '{}' failed", inPath.c_str());
			return -1;
		}

		//读取 input json
		ret = readFile_UpdateList(inPath.c_str(), document);
		inStream.close();
		if (ret != 0) {
			Logger::getRuleLogger()->error("ERROR: readFile_UpdateList fail, {}", ret);
			return ret;
		}
	}
	return ret;
}

void replaceJsonRosterPairing(unordered_map<long long, Pairing*>& pairingIdMap, vector<SharedPtr<Activity>>& itemList) {
	//add by ain
	//若解析json构造了冗余pairing对象，则以dbData中pairing替换，将已存在pairing替换为dbData.pairingList中对象
	//mantis#1852  ruleSrv简化json 通过roster.pairingId 传参, 兼容旧版editor通过 roster.pairing传参
	for (std::size_t i = 0; i < itemList.size(); i++) {
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			Pairing * jsonPairing = roster->pairing;
			if (jsonPairing != NULL || roster->pairId != 0) {
				long long pair_id = roster->pairId;
				if (pairingIdMap.find(pair_id) != pairingIdMap.end()) {
					roster->pairing = pairingIdMap[pair_id];
					if (jsonPairing)
						delete jsonPairing;
					jsonPairing = NULL;
				}
				else {
					//mantis#2822, 增加警告, client gantt sync可能造成同步目标pairing/roster不符合本场景导致 null except
					Logger::getRuleLogger()->info("WARN: invalid data, pairing not found for addRoster (crew={}, pairing={}, {})",
						roster->idcrew.c_str(), pair_id, utcToUtcString(roster->strUtc).c_str());
				}
			}
		}
	}
}

int calculateCompositionForAddPairing(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData, LegalityChecker* ruleEngine) {
	if (dbData->scenario.airline == "BR") {
		return 0;
	}
	//
	vector<SharedPtr<Activity>> addedPairings;
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "Pairing" && op == "ADD") {
			addedPairings.push_back(item);
		}
	}
	//判断是否存在新增 pairing操作
	if (addedPairings.size() > 0) {
		PairingCompositionCalculator calculator(dbData->scenario.airline, dbData->scenario.division,
			dbData->ruleList, dbData->fleetList, dbData->compositionList, dbData->compositionRankMap, dbData->rankList,dbData->fltIdToAircraftMap, &(dbData->systemParamMap));
		
		//20190614 ain, mantis#5966, 精简重复计算, 索引 flt_id-> pairing_id, 只在init和add/del/upt pairing时计算
		//1 移除 checkPGRules( dutyVec)中调用, 避免每各 pg都重算一边全部pairingList
		//2 保留初始化 ruleEngine.setDataContext中刷新
		//3 保留 ruleSrv  update_list中 doUpdateActivity后刷新索引 flt_id->pairing_id
		//4 移除 ruleSrv update_list后 calculateCompositionForAddPairing中刷新索引 flt_id->pairing_id
		//ruleEngine->makeSegmentToPairingMap();
		for (auto& item : addedPairings) {
			//20190301 ain, mantis#5048, 计算配比需针对 dbData中对象，而非ruleSrv inbox/读入临时对象
			Pairing * itemP = (Pairing*)item.get();
			Pairing* p = dbData->pairingIdMap[itemP->getDbId()];
			bool isOk = true;
			for (auto s : p->getSegments()){
				if (dbData->isAssignmentInGroup(s->getAssignment(), "FLY")){
					vector<long long> pairingId = dbData->flightIdToPairing[s->getDBId()];
					for (auto pId : pairingId){
						if (pId == itemP->getDbId())continue;
						Pairing* pp = dbData->pairingIdMap[pId];
						for (auto ss : pp->getSegments()){
							if (ss->getDBId() == s->getDBId() && dbData->isAssignmentInGroup(ss->getAssignment(), "FLY")){
								isOk = false;
								break;
							}
						}
						if (!isOk)break;
					}
				}
				if (!isOk)break;
			}
			if (p&&isOk) {
				calculator.calculate(p);
			}
		}
	}
	return 0;
}

static inline void createFlightIdToPairingSegmentIndex(unordered_multimap<long long, Segment*>& flightIdToPairingSegment, const SharedPtr<CrewDataContext>& dbData) {
	for (auto& p : dbData->pairingList) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				long long fltId = s->getDBId();
				flightIdToPairingSegment.insert(std::make_pair(fltId, s));
			}
		}
	}
}

#define MAX_LOG_UPDATE_ITEM_LIMIT 20 //最多打印行数, 避免打印过多黑窗耗时
//do addRoster/delRoster/ addPairing/delPairing...
//out parameter: updatedCrews, gather affected crew by source crew of updateRoster 
int doUpdateActivity(ErrorContext * errCtx, vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, map<string, SharedPtr<CREW>>& updatedCrews) {
	//20190515 ain, mantis#5584, ruleSrv. updateFlight
	//flight
	unordered_multimap<long long, Segment*>  flightIdToPairingSegment;//Segment是Pairing Duty的Segment 不是航班
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		SharedPtr<Segment> flt = static_pointer_cast<Segment> (item);
		if (item->getClassName() == "Segment") {
			flt->setDomIntType(Utility::GetInstancePtr()->getSegType(&(dbData->airportList), flt->getDepStation(), flt->getArrStation()));
			if (op == "ADD") {
				if (i < MAX_LOG_UPDATE_ITEM_LIMIT) {
					Logger::getRuleLogger()->info("\t\t\t\tadd FLIGHT id={} {} {}",flt->getDBId(), flt->getFlightNumber(), utcToUtcDtString(flt->getStartTimeLocSch()));
				}
				auto iter = dbData->flightIdMap.find(flt->getDBId());
				if (iter == dbData->flightIdMap.end()) {
					dbData->flightList.push_back(flt);
					dbData->flightIdMap[flt->getDBId()] = flt;
				}
				else {
					Logger::getRuleLogger()->warn("\t\t\t\tadd FLIGHT exist id={} {} {}", flt->getDBId(), flt->getFlightNumber(), utcToUtcDtString(flt->getStartTimeLocSch()));
				}
			}
			else if (op == "UPDATE") {
				if (i < MAX_LOG_UPDATE_ITEM_LIMIT) {
					Logger::getRuleLogger()->info("\t\t\t\tupdate FLIGHT id={} {} {}", flt->getDBId(), flt->getFlightNumber(), utcToUtcDtString(flt->getStartTimeLocSch()));
				}
				if (flightIdToPairingSegment.empty()) {
					createFlightIdToPairingSegmentIndex(flightIdToPairingSegment, dbData);
				}
				dbData->updateFlight(errCtx, flt.get(), flightIdToPairingSegment);

				//7231 TASK_ONLY_OPERATED_FILTERED_CREW_FOR_PR 缓存更新
				ruleEngine->updateTaskOnlyBeOperatedByFilteredCrewCacheForPR(flt->getDBId());

			}
			else if (op == "DEL") {

			}
		}
	}

	//20190511 ain, mantis#5546, 先执行addPairing, 避免同批次 addRoster先执行找不到pairing
	//pairing add
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "Pairing") {
			Pairing * p = (Pairing*)item.get();
			if (op == "ADD") {
				//若pairing已存在，则更新
				if (dbData->pairingIdMap.find(p->getDbId()) == dbData->pairingIdMap.end() || !dbData->pairingIdMap[p->getDbId()]) {
					if (i < MAX_LOG_UPDATE_ITEM_LIMIT) {
						Logger::getRuleLogger()->info("\t\t\t\tadd PAIRING id={} {} {}", p->getDbId(), p->getLabel(), utcToUtcDtString(p->getStartTimeLocAct()));
					}
					dbData->addPairing(errCtx, p);
				}
				else {
					if (i < MAX_LOG_UPDATE_ITEM_LIMIT) {
						Logger::getRuleLogger()->info("\t\t\t\tadd PAIRING id={}, update for already exist", p->getDbId());
					}
					dbData->updatePairing(errCtx, p);
				}
				if (errCtx->errorCode != 0) {//20180213 ain, mantis#2853, 发生错误立即返回
					return errCtx->errorCode;
				}
			}
		}
	}
	
	//20190604 ain, mantis#5845, updatePairing同步更新 roster.pairing
	map<long long, vector<SharedPtr<ROSTER>>> pairingIdToRosterItems;
	for (size_t i = 0; i < opList.size(); i++) {
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			pairingIdToRosterItems[roster->pairId].push_back(roster);
		}
	}

	map<long long, int> ptnForResetSeqOrder;

	//pairing update
	set<long long> delParingIds;
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "Pairing") {
			Pairing * p = (Pairing*)item.get();
			ptnForResetSeqOrder[p->getDbId()] = 1;//20190910 ain, mantis#6633, 收集需要重算号位的ptn
			if (op == "UPDATE") {
				if (i < MAX_LOG_UPDATE_ITEM_LIMIT) {
					Logger::getRuleLogger()->info("\t\t\t\tupdate Pairing id={} {} {}", p->getDbId(), p->getLabel(), utcToUtcDtString(p->getStartTimeLocAct()));
				}
				dbData->updatePairing(errCtx, p);
				if (errCtx->errorCode != 0) {//20180213 ain, mantis#2853, 发生错误立即返回
					return errCtx->errorCode;
				}
				//20190604 ain, mantis#5845, updatePairing后同步更新 roster.pairing
				for (auto& rosterOfPtn : pairingIdToRosterItems[p->getDbId()]) {
					rosterOfPtn->pairing = dbData->pairingIdMap[rosterOfPtn->pairId];
				}
			}
			else if (op == "DEL") {
				delParingIds.insert(p->getDbId());
			}
		}
	}
	for (auto delParingId : delParingIds) {
		ptnForResetSeqOrder.erase(delParingId);
	}

	//roster add/del/update
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];

		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			//20180827 ain, mantis#3898, 针对客户端之间同步, 增加crew判断是否属于场景, 不属于则skip
			if (dbData->crewIdMap.find(roster->idcrew) == dbData->crewIdMap.end()) {
				continue;
			}
			//20191214 ain, mantis#7289, 号位打散重算流程不再纳入 addRoster.ptn
			//if (roster->pairId != 0 && dbData->pairingIdMap.find(roster->pairId) != dbData->pairingIdMap.end()) {
			//	ptnForResetSeqOrder[roster->pairId] = roster->pairId;//20190910 ain, mantis#6633, 收集需要重算号位的ptn
			//}
			if (op == "ADD") {
				if (i < MAX_LOG_UPDATE_ITEM_LIMIT) {
					Logger::getRuleLogger()->info("\t\t\t\tadd ROSTER id={} {} crew={} ptn={}  utc={}", roster->rosterId, roster->duty, roster->idcrew, roster->pairId, utcToUtcString(roster->strUtc));
				}
				//20190511 ain, mantis#5546, 按pairing_id 赋值dbData pairing对象
				if (roster->pairId != 0 && dbData->pairingIdMap.find(roster->pairId) != dbData->pairingIdMap.end()) {
					roster->pairing = dbData->pairingIdMap[roster->pairId];
				}
				dbData->addRoster(errCtx, roster, false);//20180305 ain, mantis#2886, ruleSrv不检查overlap
				if (errCtx->errorCode != 0) {//20180213 ain, mantis#2853, 发生错误立即返回
					return errCtx->errorCode;
				}
			}
			else if (op == "DEL") {
				if (i < MAX_LOG_UPDATE_ITEM_LIMIT) {
					Logger::getRuleLogger()->info("\t\t\t\tdel ROSTER id={} {} crew={} ptn={} utc={}", roster->rosterId, roster->duty, roster->idcrew, roster->pairId, utcToUtcString(roster->strUtc));
				}
				roster = dbData->delRoster(errCtx, roster);
				if (errCtx->errorCode != 0) {//20180213 ain, mantis#2853, 发生错误立即返回
					return errCtx->errorCode;
				}
			}
			else if (op == "UPDATE") {
				if (i < MAX_LOG_UPDATE_ITEM_LIMIT) {
					Logger::getRuleLogger()->info("\t\t\t\tupd ROSTER id={} {} crew={} ptn={} utc={}", roster->rosterId, roster->duty, roster->idcrew, roster->pairId, utcToUtcString(roster->strUtc));
				}

				//针对moveRoster操作，需要将源crew也加入法规检查crew列表，以便更新manday
				string crewOfNewRoster = roster->idcrew;
				auto crewOfOldRoster = dbData->findRoster(roster->idcrew, roster->rosterId);
				if (crewOfOldRoster && crewOfNewRoster != crewOfOldRoster->idcrew) {
					updatedCrews[crewOfOldRoster->idcrew] = dbData->crewIdMap[crewOfOldRoster->idcrew];//this is a move roster action
				}
				//重新设置Roster的Pairing对象（兼容针对同一个Pairing多次Add Pairing时会释放Old Pairing，导致内存异常问题）
				if (roster->pairId != 0 && dbData->pairingIdMap.find(roster->pairId) != dbData->pairingIdMap.end()) {
					roster->pairing = dbData->pairingIdMap[roster->pairId];
				}
				dbData->updateRoster(errCtx, roster);
				if (errCtx->errorCode != 0) {//20180213 ain, mantis#2853, 发生错误立即返回
					return errCtx->errorCode;
				}
			}
		}
	}
	//pairing del 
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "Pairing") {
			Pairing * p = (Pairing*)item.get();
			if (op == "DEL") {
				if (i < MAX_LOG_UPDATE_ITEM_LIMIT) {
					Logger::getRuleLogger()->info("\t\t\t\tdel Pairing id={} {} {}", p->getDbId(), p->getLabel(), utcToUtcDtString(p->getStartTimeLocAct()));
				}
				dbData->delPairing(errCtx, p->getDbId());
				if (errCtx->errorCode != 0) {//20180213 ain, mantis#2853, 发生错误立即返回 
					return errCtx->errorCode;
				}
			}
		}
	}
	if (opList.size() > MAX_LOG_UPDATE_ITEM_LIMIT) {
		Logger::getRuleLogger()->info("\t\t\t\topList size={}, .......", opList.size());
	}
		
	
	//20190910 ain, mantis#6633, 汇总发生变化的ptn, 一次性重算号位避免重复计算
	//20190923 ain, mantis#6727, 横切ruleSrv过程dbData.pairing替换为副本，改为收集pid后从pairingIdMap中获取避免null except
	//20200314 ain, mantis#7831, map[pid]导致map中出现空项，改为按 map.find() != map.end判断
	for (auto& it : ptnForResetSeqOrder) {
		long long pid = it.first;
		if (dbData->pairingIdMap.find(pid) != dbData->pairingIdMap.end()
			&& dbData->pairingIdMap[pid]) {
			Pairing* p = dbData->pairingIdMap[it.first];
			ruleEngine->recalculatePairingSeqOrder(p, dbData);
		}	
		else
			Logger::getRuleLogger()->warn("WARN: calc seqOrder fail, pairing={} not found", it.first);
	}

	///TEST
	//for (std::size_t i = 0; i < opList.size(); i++) {
	//	string op = strToUpper(opList[i]);
	//	SharedPtr<Activity> item = itemList[i];
	//	if (item->getClassName() == "Pairing") {
	//		Pairing * p = (Pairing*)item.get();
	//		p = dbData->pairingIdMap[p->getDbId()];
	//		if (p)
	//			test_log_pairing(op, p);
	//	}
	//}

	return 0;
}

int doUpdateRosterFlight(vector<string>& opList, vector<SharedPtr<RosterFlight>>& itemList, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews) {
	try {
		vector<SharedPtr<RosterFlight>> addList;
		vector<SharedPtr<RosterFlight>> delList;
		for (std::size_t i = 0; i < opList.size(); i++) {
			string op = strToUpper(opList[i]);
			if (op == "UPDATE_ID"){
				continue;
			}
			SharedPtr<RosterFlight> item = itemList[i];
			if (dbData->crewIdMap.find(item->crewId) == dbData->crewIdMap.end()) {
				Logger::getRuleLogger()->error("ERROR: invalid data, doUpdateRosterFlight, Crew Id {} don't exist.", item->crewId.c_str());
				continue;
			}
			updatedCrews.insert(make_pair(item->crewId, dbData->crewIdMap[item->crewId]));
			//rosterFlightMgr.add方法里是先删后增的，update也可以使用一样的方式处理
			if (op == "ADD" || op == "UPDATE") {
				dbData->rosterFlightMgr.add(item);
				if (dbData->crewOnFlt.find(item->fltId) == dbData->crewOnFlt.end()) {
					dbData->crewOnFlt[item->fltId] = vector<SharedPtr<CrewOnFlight>>();
				}
				if (dbData->pairingIdMap.find(item->pairingId) != dbData->pairingIdMap.end()) {
					auto pairing = dbData->pairingIdMap[item->pairingId];
					if (pairing == nullptr) {
						Logger::getRuleLogger()->error("[doUpdateRosterFlight] pairing {} don't exist, roster id={}.", item->pairingId, item->rosterId);
						continue;
					}
					for (size_t i = 0; i < pairing->getDutyVec().size(); i++) {
						auto duty = pairing->getDuty(i);
						duty->clearLimitation();
					}

				}
				//addRoster会添加dbData->crewOnFlt，这里做保护若存在则不在添加crewOnFlt
				auto& cofs = dbData->crewOnFlt[item->fltId];
				bool found = false;
				for (auto& cof : cofs) {
					if (cof->crewId == item->crewId && cof->pairingId == item->pairingId) {
						found = true;
						break;
					}
				}
				if (!found) {
					SharedPtr<CrewOnFlight> cof(new CrewOnFlight);
					cof->fltId = item->fltId;
					cof->crewId = item->crewId;
					cof->assignment = item->assignment;
					cof->actingRank = item->actingRank;
					cof->crew = dbData->crewIdMap[item->crewId];
					cof->pairingId = item->pairingId;
					cof->seqOrder = item->seqOrder;
					cof->source = item->source;
					cof->division = item->division;
					cofs.push_back(cof);
				}

			}
			else {
				dbData->rosterFlightMgr.remove(item->crewId, item->fltId, item->pairingId);
				if (dbData->crewOnFlt.find(item->fltId) == dbData->crewOnFlt.end())
					continue;
				auto& crewOnFlt = dbData->crewOnFlt[item->fltId];
				if (crewOnFlt.size() == 0) continue;
				for (auto iter = crewOnFlt.begin(); iter != crewOnFlt.end(); iter++) {
					if ((*iter)->fltId == item->fltId && (*iter)->crewId == item->crewId) {
						crewOnFlt.erase(iter);
						break;
					}
				}
				dbData->crewOnFlt[item->fltId] = crewOnFlt;

			}
			if (i < 20) {
				Logger::getRuleLogger()->info("\t\t\t\t{} RosterFlight crewId={} flt={} {} actingRank={} seq={} tsglag={}", op, item->crewId, item->fltId, item->fltDt, item->actingRank, item->seqOrder, item->tsFlag);
			}

			////同一航班的分配到其他crew也添加到updatedCrews
			//auto rfs = dbData->rosterFlightMgr.get(item->fltId);
			//for (auto& rf : rfs) {
			//	if (dbData->crewIdMap.find(rf->crewId) == dbData->crewIdMap.end()) {
			//		Logger::getRuleLogger()->debug("ERROR: invalid data, doUpdateRosterFlight, Crew Id {} don't exist.", rf->crewId.c_str());
			//		continue;
			//	}
			//	updatedCrews.insert(make_pair(rf->crewId, dbData->crewIdMap[rf->crewId]));
			//}
		}
		
	}
	catch (...) {
		Logger::getRuleLogger()->error("ERROR: add/del rosterFlight fail");
	}
	return 0;
}

int copyFltToSegment(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData) {
	try {
		for (auto& item : itemList) {
			if (item->getClassName() == "Pairing") {
				Pairing* p = (Pairing*)item.get();
				for (const auto& duty : p->getDutyVec()) {
					for (const auto& seg : duty->getSegments()) {
						auto iterFlt = dbData->flightIdMap.find(seg->getDBId());
						if (iterFlt == dbData->flightIdMap.end() || iterFlt->second == nullptr) {
							continue;
						}
                        auto& flt = iterFlt->second;
						if (seg->getSubFleet().empty()) {
							seg->setSubFleet(flt->getSubFleet());
						}
						if (seg->getFltType().empty()) {
							seg->setFltType(flt->getFltType());
						}
						if (seg->getServiceType().empty()) {
							seg->setServiceType(flt->getServiceType());
						}
						if (seg->getBlkTime() <= 0) {
							seg->setBlkTime(flt->getBlkMinutes() * 60);
						}
						if (seg->getFltSts().empty()) {
							seg->setFltSts(flt->getFltSts());
						}
					}
				}
			}

		}
	}
	catch (...) {
		Logger::getRuleLogger()->error("ERROR: update flight to segment fail");
	}
	return 0;
}

int doUpdateRosterFlightKpi(vector<string>& opList, vector<SharedPtr<CrewKpiAdjust>>& itemList, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews) {
	try {
		vector<SharedPtr<CrewKpiAdjust>> addList;
		vector<SharedPtr<CrewKpiAdjust>> delList;
		for (std::size_t i = 0; i < opList.size(); i++) {
			string op = strToUpper(opList[i]);
			if (op == "UPDATE_ID") {
				continue;
			}
			SharedPtr<CrewKpiAdjust> item = itemList[i];
			if (dbData->crewIdMap.find(item->idCrew) == dbData->crewIdMap.end()) {
				Logger::getRuleLogger()->error("ERROR: invalid data, doUpdateRosterFlightKpi, Crew Id {} don't exist.", item->idCrew.c_str());
				continue;
			}
			updatedCrews.insert(make_pair(item->idCrew, dbData->crewIdMap[item->idCrew]));
			//rosterFlightMgr.add方法里是先删后增的，update也可以使用一样的方式处理
			if (op == "ADD" || op == "UPDATE")
				addList.push_back(item);
			else
				delList.push_back(item);
			if (i < 20) {
				Logger::getRuleLogger()->info("\t\t\t\t{} CrewKpiAdjust idCrew={} flt={} rosterFlightId={} type={} adjustDate={} adjustment={}", op, item->idCrew, item->fltId, item->rosterFlightId, item->type, item->adjustDate, item->adjustment);
			}
		}

		//add or update CrewKpiAdjust
		for (auto& addOrUpdCrewKpiAdjust : addList) {
			auto iter = dbData->crewIdMap.find(addOrUpdCrewKpiAdjust->idCrew);
			if (iter != dbData->crewIdMap.end()) {
				bool exist = false;
				for (auto& crewKpiAdjust : iter->second->crewKpiAdjustList) {
					if (addOrUpdCrewKpiAdjust->id == crewKpiAdjust->id) {
						//修改
						*crewKpiAdjust = *addOrUpdCrewKpiAdjust;
						exist = true;
						break;
					}
				}
				if (!exist) {
					//新增
					iter->second->crewKpiAdjustList.emplace_back(std::make_shared<CrewKpiAdjust>(*addOrUpdCrewKpiAdjust));
				}
				iter->second->crewKpiAdjustTimeIndex = std::make_shared<CrewKpiAdjustTimeIndex>(iter->second->crewKpiAdjustList);
			}
		}

		//del CrewKpiAdjust
		for (auto& delCrewKpiAdjust : delList) {
			auto iter = dbData->crewIdMap.find(delCrewKpiAdjust->idCrew);
			if (iter != dbData->crewIdMap.end()) {
				auto& crewKpiAdjustList = iter->second->crewKpiAdjustList;
				long long delId = delCrewKpiAdjust->id;
				crewKpiAdjustList.erase(std::remove_if(crewKpiAdjustList.begin(), crewKpiAdjustList.end(),
					[delId](const auto& destCrewKpiAdjust) {return destCrewKpiAdjust->id == delId; })
					, crewKpiAdjustList.end());
				iter->second->crewKpiAdjustTimeIndex = std::make_shared<CrewKpiAdjustTimeIndex>(iter->second->crewKpiAdjustList);
			}
		}
		
		//if (!addList.empty() || !delList.empty()) {
		//	//重新构建 CrewKpiAdjust index
		//	makeIndexCrewKpiAdjust(dbData.get());
		//}
			
	}
	catch (...) {
		Logger::getRuleLogger()->error("ERROR: add/del rosterFlight fail");
	}
	return 0;
}

int doUpdateFatigueResult(vector<shared_ptr<FatigueResult>>& updateFatigueResults, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews) {
	for (auto& fatigueResult : updateFatigueResults) {
		dbData->fatigueMap[fatigueResult->rosterId][fatigueResult->dutyId] = fatigueResult;
		if (dbData->crewIdMap.find(fatigueResult->crewId) != dbData->crewIdMap.end()) {
			updatedCrews[fatigueResult->crewId] = dbData->crewIdMap[fatigueResult->crewId];
		}
	}
	return 0;
}

//7231 TASK_ONLY_OPERATED_FILTERED_CREW_FOR_PR 缓存更新
void doUpdateTaskOnlyBeOperate(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine) {
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];

		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			//20180827 ain, mantis#3898, 针对客户端之间同步, 增加crew判断是否属于场景, 不属于则skip
			if (dbData->crewIdMap.find(roster->idcrew) == dbData->crewIdMap.end()) {
				continue;
			}
			const auto& crew = dbData->crewIdMap[roster->idcrew];
			if (op == "ADD") {
				ruleEngine->updateTaskOnlyBeOperatedByFilteredCrewCacheForPR(crew, roster);
			}
			else if (op == "DEL") {
				ruleEngine->removeTaskOnlyBeOperatedByFilteredCrewCacheForPR(crew, roster, nullptr);
			}
			else if (op == "UPDATE") {
				ruleEngine->updateTaskOnlyBeOperatedByFilteredCrewCacheForPR(crew, roster);
			}
		}
	}
	
}

void doUpdateTaskRosterId(const SharedPtr<UpdateActivityIdItem>& updateActivityIdItem, SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine) {
	const string& type = updateActivityIdItem->type;
	const string& crewId = updateActivityIdItem->crewId;
	const long long oldId = updateActivityIdItem->oldId;
	const long long newId = updateActivityIdItem->newId;
	if (type == "ROSTER") {
		bool found = false;
		if (!crewId.empty()) {
			auto iterCrew = dbData->crewIdMap.find(crewId);
			if (iterCrew != dbData->crewIdMap.end()) {
				auto& crew = iterCrew->second;
				ruleEngine->updateTaskOnlyBeOperateRosterId(crew, oldId, newId);
			}
		}
	}
}

int doUpdateRosterTraining(vector<string>& opList, vector<SharedPtr<Entity>>& itemList, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews) {
	long long lapsed = clock();
	Logger::getRuleLogger()->debug("doUpdateRosterTraining opList size {}", opList.size());
	try {
		set<string> entityClassNames;
		vector<SharedPtr<Entity>> addList;
		vector<SharedPtr<Entity>> delList;
		for (std::size_t i = 0; i < opList.size(); i++) {
			string op = strToUpper(opList[i]);
			if (op == "UPDATE_ID") {
				continue;
			}
			SharedPtr<Entity>& item = itemList[i];
			if (typeid(*item) == typeid(TmProgramCourse)) {
				SharedPtr<TmProgramCourse> tmProgramCourse = std::static_pointer_cast<TmProgramCourse>(item);

				auto iterSeg = dbData->flightIdMap.find(tmProgramCourse->fltId);
				if (iterSeg != dbData->flightIdMap.end()) {
					auto& flight = iterSeg->second;
					tmProgramCourse->fleet = flight->getFleetCD();
					tmProgramCourse->depStation = flight->getDepStationRead();
					tmProgramCourse->arrStation = flight->getArrStationRead();
					tmProgramCourse->actStartTimeUtc = flight->getStartTimeUtcAct();
					tmProgramCourse->actEndTimeUtc = flight->getEndTimeUtcAct();
				}

				if (op == "ADD") {
					dbData->tmProgramCourseMap.insert(std::make_pair(tmProgramCourse->id, tmProgramCourse));
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseIndex->getById(tmProgramCourse->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourse;
					}
				}
				else if (op == "DEL") {
					dbData->tmProgramCourseMap.erase(tmProgramCourse->id);
				}
				entityClassNames.emplace("TmProgramCourse");
			}
			else if (typeid(*item) == typeid(TmProgramCourseRole)) {
				SharedPtr<TmProgramCourseRole> tmProgramCourseRole = std::static_pointer_cast<TmProgramCourseRole>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseRoleList.emplace_back(tmProgramCourseRole);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseRoleIndex->getById(tmProgramCourseRole->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseRole;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseRole->id;
					dbData->tmProgramCourseRoleList.erase(std::remove_if(dbData->tmProgramCourseRoleList.begin(), dbData->tmProgramCourseRoleList.end(),
						[delId](const auto& tmProgramCourseRole) {return tmProgramCourseRole->id == delId; })
						, dbData->tmProgramCourseRoleList.end());
				}
				entityClassNames.emplace("TmProgramCourseRole");
			}
			else if (typeid(*item) == typeid(TmProgramCourseRoleQual)) {
				SharedPtr<TmProgramCourseRoleQual> tmProgramCourseRoleQual = std::static_pointer_cast<TmProgramCourseRoleQual>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseRoleQualList.emplace_back(tmProgramCourseRoleQual);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseRoleQualIndex->getById(tmProgramCourseRoleQual->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseRoleQual;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseRoleQual->id;
					dbData->tmProgramCourseRoleQualList.erase(std::remove_if(dbData->tmProgramCourseRoleQualList.begin(), dbData->tmProgramCourseRoleQualList.end(),
						[delId](const auto& tmProgramCourseRoleQual) {return tmProgramCourseRoleQual->id == delId; })
						, dbData->tmProgramCourseRoleQualList.end());
				}
				entityClassNames.emplace("TmProgramCourseRoleQual");
			}
			else if (typeid(*item) == typeid(TmProgramCourseRoleLimitation)) {
				SharedPtr<TmProgramCourseRoleLimitation> tmProgramCourseRoleLimitation = std::static_pointer_cast<TmProgramCourseRoleLimitation>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseRoleLimitationList.emplace_back(tmProgramCourseRoleLimitation);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseRoleLimitationIndex->getById(tmProgramCourseRoleLimitation->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseRoleLimitation;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseRoleLimitation->id;
					dbData->tmProgramCourseRoleLimitationList.erase(std::remove_if(dbData->tmProgramCourseRoleLimitationList.begin(), dbData->tmProgramCourseRoleLimitationList.end(),
						[delId](const auto& tmProgramCourseRoleLimitation) {return tmProgramCourseRoleLimitation->id == delId; })
						, dbData->tmProgramCourseRoleLimitationList.end());
				}
				entityClassNames.emplace("TmProgramCourseRoleLimitation");
			}
			else if (typeid(*item) == typeid(TmProgramCourseIpRole)) {
				SharedPtr<TmProgramCourseIpRole> tmProgramCourseIpRole = std::static_pointer_cast<TmProgramCourseIpRole>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseIpRoleList.emplace_back(tmProgramCourseIpRole);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseIpRoleIndex->getById(tmProgramCourseIpRole->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseIpRole;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseIpRole->id;
					dbData->tmProgramCourseIpRoleList.erase(std::remove_if(dbData->tmProgramCourseIpRoleList.begin(), dbData->tmProgramCourseIpRoleList.end(),
						[delId](const auto& tmProgramCourseIpRole) {return tmProgramCourseIpRole->id == delId; })
						, dbData->tmProgramCourseIpRoleList.end());
				}
				entityClassNames.emplace("TmProgramCourseIpRole");
			}
			else if (typeid(*item) == typeid(TmProgramCourseIpRoleBase)) {
				SharedPtr<TmProgramCourseIpRoleBase> tmProgramCourseIpRoleBase = std::static_pointer_cast<TmProgramCourseIpRoleBase>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseIpRoleBaseList.emplace_back(tmProgramCourseIpRoleBase);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseIpRoleBaseIndex->getById(tmProgramCourseIpRoleBase->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseIpRoleBase;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseIpRoleBase->id;
					dbData->tmProgramCourseIpRoleBaseList.erase(std::remove_if(dbData->tmProgramCourseIpRoleBaseList.begin(), dbData->tmProgramCourseIpRoleBaseList.end(),
						[delId](const auto& tmProgramCourseIpRoleBase) {return tmProgramCourseIpRoleBase->id == delId; })
						, dbData->tmProgramCourseIpRoleBaseList.end());
				}
				entityClassNames.emplace("TmProgramCourseIpRoleBase");
			}
			else if (typeid(*item) == typeid(TmProgramCourseIpRoleQual)) {
				SharedPtr<TmProgramCourseIpRoleQual> tmProgramCourseIpRoleQual = std::static_pointer_cast<TmProgramCourseIpRoleQual>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseIpRoleQualList.emplace_back(tmProgramCourseIpRoleQual);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseIpRoleQualIndex->getById(tmProgramCourseIpRoleQual->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseIpRoleQual;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseIpRoleQual->id;
					dbData->tmProgramCourseIpRoleQualList.erase(std::remove_if(dbData->tmProgramCourseIpRoleQualList.begin(), dbData->tmProgramCourseIpRoleQualList.end(),
						[delId](const auto& tmProgramCourseIpRoleQual) {return tmProgramCourseIpRoleQual->id == delId; })
						, dbData->tmProgramCourseIpRoleQualList.end());
				}
				entityClassNames.emplace("TmProgramCourseIpRoleQual");
			}
			else if (typeid(*item) == typeid(TmProgramCourseIpck)) {
				SharedPtr<TmProgramCourseIpck> tmProgramCourseIpck = std::static_pointer_cast<TmProgramCourseIpck>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseIpckList.emplace_back(tmProgramCourseIpck);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseIpckIndex->getById(tmProgramCourseIpck->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseIpck;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseIpck->id;
					dbData->tmProgramCourseIpckList.erase(std::remove_if(dbData->tmProgramCourseIpckList.begin(), dbData->tmProgramCourseIpckList.end(),
						[delId](const auto& tmProgramCourseIpck) {return tmProgramCourseIpck->id == delId; })
						, dbData->tmProgramCourseIpckList.end());
				}
				entityClassNames.emplace("TmProgramCourseIpck");
			}
			else if (typeid(*item) == typeid(TmProgramCourseMore)) {
				SharedPtr<TmProgramCourseMore> tmProgramCourseMore = std::static_pointer_cast<TmProgramCourseMore>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseMoreList.emplace_back(tmProgramCourseMore);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseMoreIndex->getById(tmProgramCourseMore->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseMore;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseMore->id;
					dbData->tmProgramCourseMoreList.erase(std::remove_if(dbData->tmProgramCourseMoreList.begin(), dbData->tmProgramCourseMoreList.end(),
						[delId](const auto& tmProgramCourseMore) {return tmProgramCourseMore->id == delId; })
						, dbData->tmProgramCourseMoreList.end());
				}
				entityClassNames.emplace("TmProgramCourseMore");
			}
			else if (typeid(*item) == typeid(TmProgramCourseMoreLeg)) {
				SharedPtr<TmProgramCourseMoreLeg> tmProgramCourseMoreLeg = std::static_pointer_cast<TmProgramCourseMoreLeg>(item);
				
				if (op == "ADD") {
					tmProgramCourseMoreLeg->makeAllLegStations(dbData.get());
					dbData->tmProgramCourseMoreLegList.emplace_back(tmProgramCourseMoreLeg);
				}
				else if (op == "UPDATE") {
					tmProgramCourseMoreLeg->makeAllLegStations(dbData.get());
					const auto& tmpUpdated = dbData->tmProgramCourseMoreLegIndex->getById(tmProgramCourseMoreLeg->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseMoreLeg;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseMoreLeg->id;
					dbData->tmProgramCourseMoreLegList.erase(std::remove_if(dbData->tmProgramCourseMoreLegList.begin(), dbData->tmProgramCourseMoreLegList.end(),
						[delId](const auto& tmProgramCourseMoreLeg) {return tmProgramCourseMoreLeg->id == delId; })
						, dbData->tmProgramCourseMoreLegList.end());
				}
				entityClassNames.emplace("TmProgramCourseMoreLeg");
			}
			else if (typeid(*item) == typeid(TmProgramCoursePnr)) {
				SharedPtr<TmProgramCoursePnr> tmProgramCoursePnr = std::static_pointer_cast<TmProgramCoursePnr>(item);
				if (op == "ADD") {
					dbData->tmProgramCoursePnrList.emplace_back(tmProgramCoursePnr);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCoursePnrIndex->getById(tmProgramCoursePnr->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCoursePnr;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCoursePnr->id;
					dbData->tmProgramCoursePnrList.erase(std::remove_if(dbData->tmProgramCoursePnrList.begin(), dbData->tmProgramCoursePnrList.end(),
						[delId](const auto& tmProgramCoursePnr) {return tmProgramCoursePnr->id == delId; })
						, dbData->tmProgramCoursePnrList.end());
				}
				entityClassNames.emplace("TmProgramCoursePnr");
			}
			else if (typeid(*item) == typeid(TmProgramCourseLimitation)) {
				SharedPtr<TmProgramCourseLimitation> tmProgramCourseLimitation = std::static_pointer_cast<TmProgramCourseLimitation>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseLimitationList.emplace_back(tmProgramCourseLimitation);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseLimitationIndex->getById(tmProgramCourseLimitation->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseLimitation;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramCourseLimitation->id;
					dbData->tmProgramCourseLimitationList.erase(std::remove_if(dbData->tmProgramCourseLimitationList.begin(), dbData->tmProgramCourseLimitationList.end(),
						[delId](const auto& tmProgramCourseLimitation) {return tmProgramCourseLimitation->id == delId; })
						, dbData->tmProgramCourseLimitationList.end());
				}
				entityClassNames.emplace("TmProgramCourseLimitation");
			}
			else if (typeid(*item) == typeid(TmProgramCourseInstructor)) {
				SharedPtr<TmProgramCourseInstructor> tmProgramCourseInstructor = std::static_pointer_cast<TmProgramCourseInstructor>(item);
				if (op == "ADD") {
					dbData->tmProgramCourseInstructorMap.insert(std::make_pair(tmProgramCourseInstructor->id, tmProgramCourseInstructor));
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramCourseInstructorIndex->getById(tmProgramCourseInstructor->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramCourseInstructor;
					}
				}
				else if (op == "DEL") {
					dbData->tmProgramCourseInstructorMap.erase(tmProgramCourseInstructor->id);
				}
				entityClassNames.emplace("TmProgramCourseInstructor");
			}
			else if (typeid(*item) == typeid(TmProgram)) {
				SharedPtr<TmProgram> tmProgram = std::static_pointer_cast<TmProgram>(item);
				if (op == "ADD") {
					dbData->tmProgramList.emplace_back(tmProgram);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramIndex->getById(tmProgram->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgram;
					}

					if (dbData->crewIdMap.find(tmProgram->crewId) != dbData->crewIdMap.end()) {
						auto& crew = dbData->crewIdMap[tmProgram->crewId];
						if (tmProgram->firstDutyDate > 0 && (!crew->crewFirstDutyInfo || crew->crewFirstDutyInfo->lastFirstDutyDate != tmProgram->firstDutyDate)) {
							shared_ptr<CREW_FIRST_DUTY_INFO> firstDutyInfo(new CREW_FIRST_DUTY_INFO);
							firstDutyInfo->lastFirstDutyDate = tmProgram->firstDutyDate;
							crew->crewFirstDutyInfo = firstDutyInfo;
							updatedCrews.insert(make_pair(tmProgram->crewId, crew));
						}
						if (tmProgram->firstDutyDate <= 0) {
							crew->crewFirstDutyInfo = nullptr;
						}
					}
					
				}
				else if (op == "DEL") {
					long long delId = tmProgram->id;
					dbData->tmProgramList.erase(std::remove_if(dbData->tmProgramList.begin(), dbData->tmProgramList.end(),
						[delId](const auto& tmProgram) {return tmProgram->id == delId; })
						, dbData->tmProgramList.end());
				}
				entityClassNames.emplace("TmProgram");
			}
			else if (typeid(*item) == typeid(TmProgramPip)) {
				SharedPtr<TmProgramPip> tmProgramPip = std::static_pointer_cast<TmProgramPip>(item);
				if (op == "ADD") {
					dbData->tmProgramPipList.emplace_back(tmProgramPip);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramPipIndex->getById(tmProgramPip->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramPip;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramPip->id;
					dbData->tmProgramPipList.erase(std::remove_if(dbData->tmProgramPipList.begin(), dbData->tmProgramPipList.end(),
						[delId](const auto& tmProgramPip) {return tmProgramPip->id == delId; })
						, dbData->tmProgramPipList.end());
				}
				entityClassNames.emplace("TmProgramPip");
			}
			else if (typeid(*item) == typeid(TmProgramBuddy)) {
				SharedPtr<TmProgramBuddy> tmProgramBuddy = std::static_pointer_cast<TmProgramBuddy>(item);
				if (op == "ADD") {
					dbData->tmProgramBuddyList.emplace_back(tmProgramBuddy);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramBuddyIndex->getById(tmProgramBuddy->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramBuddy;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramBuddy->id;
					dbData->tmProgramBuddyList.erase(std::remove_if(dbData->tmProgramBuddyList.begin(), dbData->tmProgramBuddyList.end(),
						[delId](const auto& tmProgramBuddy) {return tmProgramBuddy->id == delId; })
						, dbData->tmProgramBuddyList.end());
				}
				entityClassNames.emplace("TmProgramBuddy");
			}
			else if (typeid(*item) == typeid(TmProgramBuddyCourse)) {
				SharedPtr<TmProgramBuddyCourse> tmProgramBuddyCourse = std::static_pointer_cast<TmProgramBuddyCourse>(item);
				if (op == "ADD") {
					dbData->tmProgramBuddyCourseList.emplace_back(tmProgramBuddyCourse);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramBuddyCourseIndex->getById(tmProgramBuddyCourse->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramBuddyCourse;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramBuddyCourse->id;
					dbData->tmProgramBuddyCourseList.erase(std::remove_if(dbData->tmProgramBuddyCourseList.begin(), dbData->tmProgramBuddyCourseList.end(),
						[delId](const auto& tmProgramBuddyCourse) {return tmProgramBuddyCourse->id == delId; })
						, dbData->tmProgramBuddyCourseList.end());
				}
				entityClassNames.emplace("TmProgramBuddyCourse");
			}
			else if (typeid(*item) == typeid(TmProgramBuddyTime)) {
				SharedPtr<TmProgramBuddyTime> tmProgramBuddyTime = std::static_pointer_cast<TmProgramBuddyTime>(item);
				if (op == "ADD") {
					dbData->tmProgramBuddyTimeList.emplace_back(tmProgramBuddyTime);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmProgramBuddyTimeIndex->getById(tmProgramBuddyTime->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmProgramBuddyTime;
					}
				}
				else if (op == "DEL") {
					long long delId = tmProgramBuddyTime->id;
					dbData->tmProgramBuddyTimeList.erase(std::remove_if(dbData->tmProgramBuddyTimeList.begin(), dbData->tmProgramBuddyTimeList.end(),
						[delId](const auto& tmProgramBuddyTime) {return tmProgramBuddyTime->id == delId; })
						, dbData->tmProgramBuddyTimeList.end());
				}
				entityClassNames.emplace("TmProgramBuddyTime");
			}
			else if (typeid(*item) == typeid(TmDeviceTime)) {
				SharedPtr<TmDeviceTime> tmDeviceTime = std::static_pointer_cast<TmDeviceTime>(item);
				if (op == "ADD") {
					dbData->tmDeviceTimeList.emplace_back(tmDeviceTime);
				}
				else if (op == "UPDATE") {
					const auto& tmpUpdated = dbData->tmDeviceTimeIndex->getById(tmDeviceTime->id);
					if (tmpUpdated != nullptr) {
						*tmpUpdated = *tmDeviceTime;
					}
				}
				else if (op == "DEL") {
					long long delId = tmDeviceTime->id;
					dbData->tmDeviceTimeList.erase(std::remove_if(dbData->tmDeviceTimeList.begin(), dbData->tmDeviceTimeList.end(),
						[delId](const auto& tmDeviceTime) {return tmDeviceTime->id == delId; })
						, dbData->tmDeviceTimeList.end());
				}
				entityClassNames.emplace("TmDeviceTime");
			}
		}

		//更新索引
		for (auto& entityClassName : entityClassNames) {
			if (entityClassName == "TmProgramCourse") {
				dbData->tmProgramCourseIndex = std::make_shared<TmProgramCourseIndex>(dbData->tmProgramCourseMap);
			}
			else if (entityClassName == "TmProgramCourseRole") {
				dbData->tmProgramCourseRoleIndex = std::make_shared<TmProgramCourseRoleIndex>(dbData->tmProgramCourseRoleList);
			}
			else if (entityClassName == "TmProgramCourseRoleQual") {
				dbData->tmProgramCourseRoleQualIndex = std::make_shared<TmProgramCourseRoleQualIndex>(dbData->tmProgramCourseRoleQualList);
			}
			else if (entityClassName == "TmProgramCourseRoleLimitation") {
				dbData->tmProgramCourseRoleLimitationIndex = std::make_shared<TmProgramCourseRoleLimitationIndex>(dbData->tmProgramCourseRoleLimitationList);
			}
			else if (entityClassName == "TmProgramCourseIpRole") {
				dbData->tmProgramCourseIpRoleIndex = std::make_shared<TmProgramCourseIpRoleIndex>(dbData->tmProgramCourseIpRoleList);
			}
			else if (entityClassName == "TmProgramCourseIpRoleBase") {
				dbData->tmProgramCourseIpRoleBaseIndex = std::make_shared<TmProgramCourseIpRoleBaseIndex>(dbData->tmProgramCourseIpRoleBaseList);
			}
			else if (entityClassName == "TmProgramCourseIpRoleQual") {
				dbData->tmProgramCourseIpRoleQualIndex = std::make_shared<TmProgramCourseIpRoleQualIndex>(dbData->tmProgramCourseIpRoleQualList);
			}
			else if (entityClassName == "TmProgramCourseIpck") {
				dbData->tmProgramCourseIpckIndex = std::make_shared<TmProgramCourseIpckIndex>(dbData->tmProgramCourseIpckList);
			}
			else if (entityClassName == "TmProgramCourseMore") {
				dbData->tmProgramCourseMoreIndex = std::make_shared<TmProgramCourseMoreIndex>(dbData->tmProgramCourseMoreList);
			}
			else if (entityClassName == "TmProgramCourseMoreLeg") {
				dbData->tmProgramCourseMoreLegIndex = std::make_shared<TmProgramCourseMoreLegIndex>(dbData->tmProgramCourseMoreLegList);
			}
			else if (entityClassName == "TmProgramCoursePnr") {
				dbData->tmProgramCoursePnrIndex = std::make_shared<TmProgramCoursePnrIndex>(dbData->tmProgramCoursePnrList);
			}
			else if (entityClassName == "TmProgramCourseLimitation") {
				dbData->tmProgramCourseLimitationIndex = std::make_shared<TmProgramCourseLimitationIndex>(dbData->tmProgramCourseLimitationList);
			}
			else if (entityClassName == "TmProgramCourseInstructor") {
				dbData->tmProgramCourseInstructorIndex = std::make_shared<TmProgramCourseInstructorIndex>(dbData->tmProgramCourseInstructorMap);
			}
			else if (entityClassName == "TmProgram") {
				dbData->tmProgramIndex = std::make_shared<TmProgramIndex>(dbData->tmProgramList);
			}
			else if (entityClassName == "TmProgramPip") {
				dbData->tmProgramPipIndex = std::make_shared<TmProgramPipIndex>(dbData->tmProgramPipList);
			}
			else if (entityClassName == "TmProgramBuddy") {
				dbData->tmProgramBuddyIndex = std::make_shared<TmProgramBuddyIndex>(dbData->tmProgramBuddyList);
			}
			else if (entityClassName == "TmProgramBuddyCourse") {
				dbData->tmProgramBuddyCourseIndex = std::make_shared<TmProgramBuddyCourseIndex>(dbData->tmProgramBuddyCourseList);
			}
			else if (entityClassName == "TmProgramBuddyTime") {
				dbData->tmProgramBuddyTimeIndex = std::make_shared<TmProgramBuddyTimeIndex>(dbData->tmProgramBuddyTimeList);
			}
			else if (entityClassName == "TmDeviceTime") {
				dbData->tmDeviceTimeIndex = std::make_shared<TmDeviceTimeIndex>(dbData->tmDeviceTimeList, dbData.get());
			}
		}
	}
	catch (...) {
		Logger::getRuleLogger()->error("ERROR: add/del TmProgramCourse/TmProgramCourseInstructor/TmProgram/TmDeviceTime fail");
	}
	Logger::getRuleLogger()->debug("doUpdateRosterTraining cost {} ms", ((clock() - lapsed) * 1000) / CLOCKS_PER_SEC);
	return 0;
}

int doUpdateCrewsForRosterTraining(const vector<string>& opList, const vector<SharedPtr<Entity>>& itemList, const SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews) {
	set<string> updateCrewIds;
	for (std::size_t i = 0; i < itemList.size(); i++) {
		const SharedPtr<Entity>& item = itemList[i];
		if (typeid(*item) == typeid(TmProgramCourse)) {
			SharedPtr<TmProgramCourse> tmProgramCourse = std::static_pointer_cast<TmProgramCourse>(item);
			if (!tmProgramCourse->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourse->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramCourseLimitation)) {
			SharedPtr<TmProgramCourseLimitation> tmProgramCourseLimitation = std::static_pointer_cast<TmProgramCourseLimitation>(item);
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getById(tmProgramCourseLimitation->programCourseId);
			if (tmProgramCourse != nullptr && !tmProgramCourse->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourse->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramCourseRole)) {
			SharedPtr<TmProgramCourseRole> tmProgramCourseRole = std::static_pointer_cast<TmProgramCourseRole>(item);
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getById(tmProgramCourseRole->programCourseId);
			if (tmProgramCourse != nullptr && !tmProgramCourse->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourse->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramCourseRoleQual)) {
			SharedPtr<TmProgramCourseRoleQual> tmProgramCourseRoleQual = std::static_pointer_cast<TmProgramCourseRoleQual>(item);
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getById(tmProgramCourseRoleQual->programCourseId);
			if (tmProgramCourse != nullptr && !tmProgramCourse->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourse->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramCourseRoleLimitation)) {
			SharedPtr<TmProgramCourseRoleLimitation> tmProgramCourseRoleLimitation = std::static_pointer_cast<TmProgramCourseRoleLimitation>(item);
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getById(tmProgramCourseRoleLimitation->programCourseId);
			if (tmProgramCourse != nullptr && !tmProgramCourse->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourse->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramCourseIpck)) {
			SharedPtr<TmProgramCourseIpck> tmProgramCourseIpck = std::static_pointer_cast<TmProgramCourseIpck>(item);
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getById(tmProgramCourseIpck->tmProgramCourseId);
			if (tmProgramCourse != nullptr && !tmProgramCourse->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourse->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramCoursePnr)) {
			SharedPtr<TmProgramCoursePnr> tmProgramCoursePnr = std::static_pointer_cast<TmProgramCoursePnr>(item);
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getById(tmProgramCoursePnr->tmProgramCourseId);
			if (tmProgramCourse != nullptr && !tmProgramCourse->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourse->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramCourseMore)) {
			SharedPtr<TmProgramCourseMore> tmProgramCourseMore = std::static_pointer_cast<TmProgramCourseMore>(item);
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getById(tmProgramCourseMore->tmProgramCourseId);
			if (tmProgramCourse != nullptr && !tmProgramCourse->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourse->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramCourseMoreLeg)) {
			SharedPtr<TmProgramCourseMoreLeg> tmProgramCourseMoreLeg = std::static_pointer_cast<TmProgramCourseMoreLeg>(item);
			auto tmProgramCourse = dbData->tmProgramCourseIndex->getById(tmProgramCourseMoreLeg->tmProgramCourseId);
			if (tmProgramCourse != nullptr && !tmProgramCourse->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourse->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramCourseInstructor)) {
			SharedPtr<TmProgramCourseInstructor> tmProgramCourseInstructor = std::static_pointer_cast<TmProgramCourseInstructor>(item);
			if (!tmProgramCourseInstructor->crewId.empty()) {
				updateCrewIds.emplace(tmProgramCourseInstructor->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgram)) {
			SharedPtr<TmProgram> tmProgram = std::static_pointer_cast<TmProgram>(item);
			if (!tmProgram->crewId.empty()) {
				updateCrewIds.emplace(tmProgram->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramPip)) {
			SharedPtr<TmProgramPip> tmProgramPip = std::static_pointer_cast<TmProgramPip>(item);
			auto tmProgram = dbData->tmProgramIndex->getById(tmProgramPip->programId);
			if (tmProgram != nullptr && !tmProgram->crewId.empty()) {
				updateCrewIds.emplace(tmProgram->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramBuddy)) {
			SharedPtr<TmProgramBuddy> tmProgramBuddy = std::static_pointer_cast<TmProgramBuddy>(item);
			if (!tmProgramBuddy->crewId.empty()) {
				updateCrewIds.emplace(tmProgramBuddy->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramBuddyCourse)) {
			SharedPtr<TmProgramBuddyCourse> tmProgramBuddyCourse = std::static_pointer_cast<TmProgramBuddyCourse>(item);
			auto tmProgramBuddy = dbData->tmProgramBuddyIndex->getById(tmProgramBuddyCourse->programBuddyId);
			if (tmProgramBuddy != nullptr && !tmProgramBuddy->crewId.empty()) {
				updateCrewIds.emplace(tmProgramBuddy->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmProgramBuddyTime)) {
			SharedPtr<TmProgramBuddyTime> tmProgramBuddyTime = std::static_pointer_cast<TmProgramBuddyTime>(item);
			auto tmProgramBuddy = dbData->tmProgramBuddyIndex->getById(tmProgramBuddyTime->tmProgramBuddyId);
			if (tmProgramBuddy != nullptr && !tmProgramBuddy->crewId.empty()) {
				updateCrewIds.emplace(tmProgramBuddy->crewId);
			}
		}
		else if (typeid(*item) == typeid(TmDeviceTime)) {
			SharedPtr<TmDeviceTime> tmDeviceTime = std::static_pointer_cast<TmDeviceTime>(item);
			auto tmDeviceTimeList = dbData->tmDeviceTimeIndex->getByResourceCode(tmDeviceTime->resourceCode);
			for (auto& tmDeviceTime : tmDeviceTimeList) {
				auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByDeviceTimeId(tmDeviceTime->id);
				for (auto& tmProgramCourse : tmProgramCourseList) {
					if (!tmProgramCourse->crewId.empty()) {
						updateCrewIds.emplace(tmProgramCourse->crewId);
					}
				}
			}
		}
	}

	for (auto& crewId : updateCrewIds) {
		if (dbData->crewIdMap.find(crewId) == dbData->crewIdMap.end()) {
			Logger::getRuleLogger()->error("ERROR: invalid data, doUpdateCrewsForRosterTraining, Crew Id {} don't exist.", crewId);
			continue;
		}
		updatedCrews.insert(make_pair(crewId, dbData->crewIdMap[crewId]));
	}
	return 0;
}

//20190422 ain, mantis#5333, ruleSrv执行 doUpdateActivity()后，若更新内容包含pairing则刷新索引 fltToPtn
void resetFlightToPairingIndex(vector<SharedPtr<Activity>>& itemList, SharedPtr<LegalityChecker>& ruleEngine) {
	bool isPairingChanged = false;
	for (auto& item : itemList) {
		if (item->getClassName() == "Pairing")
			isPairingChanged = true;
	}
	if (isPairingChanged) {
		ruleEngine->getDataContext()->makeSegmentToPairingMap();
	}
}


//pairing 更新涉及到的航班pic置为空
void resetFlightPIC(vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData) {
	bool isPairingChanged = false;
	for (auto& item : itemList) {
		if (item->getClassName() == "Pairing") {
			Pairing* p = (Pairing*)item.get();
			for (const auto& duty : p->getDutyVec()) {
				for (const auto& seg : duty->getSegments()) {
					if (dbData->flightPICMap.find(seg->getDBId()) != dbData->flightPICMap.end()) {
						dbData->flightPICMap[seg->getDBId()] = "";
					}
				}
			}
		}

		if (item->getClassName() == "ROSTER") {
			ROSTER* r = (ROSTER*)item.get();
			if (r->pairId != 0) {
				auto iter = dbData->pairingIdMap.find(r->pairId);
				if (iter != dbData->pairingIdMap.end()) {
					for (const auto& duty : iter->second->getDutyVec()) {
						for (const auto& seg : duty->getSegments()) {
							if (dbData->flightPICMap.find(seg->getDBId()) != dbData->flightPICMap.end()) {
								dbData->flightPICMap[seg->getDBId()] = "";
							}
						}
					}
				}
			}

		}


	}

	
}

//检查item中是否包含 add/update pairing, 若是则重算目标pairing.rankCombination
void reCalculationRankCombination(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<bool>& recalCompositionFlagList, SharedPtr<CrewDataContext>& dbData, string jsonName) {
	vector<Pairing*> pairingsNeedCalculationRankComb;
	map<long long, bool> changedPairingIds;
	set<long long> onlyRecalOptionPairingIds;
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = opList[i];
		auto& item = itemList[i];
		bool recalCompositionFlag = recalCompositionFlagList[i];
		if (item->getClassName() == "Pairing" && (op == "ADD" || op == "UPDATE" || op == "DEL")) {   //20201124 jx.jin 删除Roster时，也需要重算配比
			if (recalCompositionFlag) {
				pairingsNeedCalculationRankComb.push_back((Pairing*)item.get());
				changedPairingIds[((Pairing*)item.get())->getDbId()] = true;
			}
			else {
				onlyRecalOptionPairingIds.insert(((Pairing*)item.get())->getDbId());
			}
		}
	}
	if (!onlyRecalOptionPairingIds.empty()) {
		vector<Pairing*> onlyRecalOptionPairings;
		for (auto& p : dbData->pairingList) {
			if (onlyRecalOptionPairingIds.find(p->getDbId()) != onlyRecalOptionPairingIds.end())
				onlyRecalOptionPairings.push_back(p);
		}
		calculatePairingOptionByComposition(onlyRecalOptionPairings, dbData.get());
	}

	if (pairingsNeedCalculationRankComb.empty()) {
		return;
	}
	//20181117 ain, 按itemList从 dbData->pairingList中筛选, 避免每次检查全部pairing.rankComb打印过多警告
	vector<Pairing*> changedPairings;
	vector<Pairing*> morePairings;
	for (auto& p : dbData->pairingList) {
		if (changedPairingIds.find(p->getDbId()) != changedPairingIds.end())
			changedPairings.push_back(p);
	}
	for (auto p : changedPairings){
		vector<Segment*>segs =  p->getSegments();
		for (auto s : segs){
			if (dbData->flightIdToPairing.find(s->getDBId()) != dbData->flightIdToPairing.end()){
				for (auto pId : dbData->flightIdToPairing[s->getDBId()]){
					morePairings.push_back(dbData->pairingIdMap[pId]);
				}
			}
		}
	}
	for (auto p : morePairings){
		if (changedPairingIds.find(p->getDbId()) == changedPairingIds.end()){
			changedPairingIds[p->getDbId()] = true;
			changedPairings.push_back(p);
		}
	}
	if (jsonName.find("SPLITPAIRING") != string::npos)
		return;
	if (jsonName.find("ROSTER") == string::npos || jsonName.find("MERGEROSTER") != string::npos) {
		calculatePairingListRankCombination(changedPairings, dbData.get());
	}
	else {
		calculatePairingOptions(changedPairings, dbData.get());
	}
}

void gatherCrewByCofAndCop(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, SharedPtr<CrewDataContext>& dbData, map<string, SharedPtr<CREW>>& updatedCrews, unordered_map<long long, Pairing*>& pairingIdMap) {

	if (dbData->isServiceMode()) {
		//法规服务化模式，仅检查当前crew，不检查COF相关crew
		return;
	}

	//mantis#1162, 仅将本场crew加入检查列表，避免COF crew检查崩溃
	map<string, SharedPtr<CREW>> scenarioCrewIdMap;
	for (std::size_t i = 0; i < dbData->crewList.size(); i++) {
		SharedPtr<CREW> crew = dbData->crewList[i];
		scenarioCrewIdMap[crew->idCrew] = crew;
	}

	//mantis#1017, 将roster操作涉及的 COF crew也加入检查列表，以便正确反应操作对其他crew违规影响
	for (std::size_t i = 0; i < opList.size(); i++) {
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			long long pairingId = roster->pairId;
			//mantis#2952, 检查cop关联crew
			if (pairingId != 0) {
				for (auto& cop : dbData->crewOnPairing[pairingId]) {
					if (scenarioCrewIdMap.find(cop->crewId) != scenarioCrewIdMap.end())
						updatedCrews[cop->crewId] = scenarioCrewIdMap[cop->crewId];
				}
			}
			//20190923 ain, mantis#6727, 问题2, delPairing操作可能导致pairingID找不到目标对象，如竖切后undo
			//增加判断pairing是否还存在
			if (pairingId != 0 && pairingIdMap.find(pairingId) != pairingIdMap.end() && pairingIdMap[pairingId]) {
				Pairing * pairing = pairingIdMap[pairingId];
				for (std::size_t j = 0; j < pairing->getNumDuties(); j++) {
					Duty * d = pairing->getDuty(j);
					for (std::size_t k = 0; k < d->getNumSegments(); k++) {
						Segment * s = d->getSegment(k);
						//mantis#2952, 检查cof crew时忽略 flt_id=0部分
						long long fltId = s->getDBId();
						if (fltId != 0) {
							vector<SharedPtr<CrewOnFlight>>& cof = dbData->crewOnFlt[s->getDBId()];
							for (std::size_t m = 0; m < cof.size(); m++) {
								string crewId = cof[m]->crewId;
								//mantis#1162, 仅将本场crew加入检查列表，避免COF crew检查崩溃
								if (scenarioCrewIdMap.find(crewId) != scenarioCrewIdMap.end())
									updatedCrews[crewId] = scenarioCrewIdMap[crewId];
							}
						}
					}
				}
			}
		}
	}
	
	//获取 COP crew
	for (std::size_t i = 0; i < opList.size(); i++) {
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			long long pairingId = roster->pairId;
			if (pairingId != 0 && pairingIdMap.find(pairingId) != pairingIdMap.end()) {
				list<SharedPtr<CrewOnFlight>>& cop = dbData->crewOnPairing[pairingId];
				list<SharedPtr<CrewOnFlight>>::iterator it;
				for (it = cop.begin(); it != cop.end(); it++) {
					string crewId = (*it)->crewId;
					if (scenarioCrewIdMap.find(crewId) != scenarioCrewIdMap.end())
						updatedCrews[crewId] = scenarioCrewIdMap[crewId];
				}
			}
		}
	}
	
}

//mantis#4344, 复制 pairing.rankComb, 针对ruleSrv.checkPairing
void copyPairingSegmentRankCombination(vector<Pairing*>& targetPairingList, unordered_map<long long, Pairing*>& sourcePairingMap) {
	for (Pairing* p : targetPairingList) {
		//20190923 ain, mantis#6727, 问题2, delPairing操作可能导致pairingID找不到目标对象，如横切后undo
		if (sourcePairingMap.find(p->getDbId()) != sourcePairingMap.end() && sourcePairingMap[p->getDbId()]) {
			Pairing* pairingInDataCtx = sourcePairingMap[p->getDbId()];
			//if (pairingInDataCtx) {
			p->setRankCombCriteriaId(pairingInDataCtx->getRankCombCriteriaId());
			p->setComplements(pairingInDataCtx->getComplements());
			map<long long, long long> fltIdToRankComb;
			for (std::size_t i = 0; i < pairingInDataCtx->getNumDuties(); i++) {
				for (std::size_t j = 0; j < pairingInDataCtx->getDuty(i)->getNumSegments(); j++) {
					Segment* s = pairingInDataCtx->getDuty(i)->getSegment(j);
					fltIdToRankComb[s->getDBId()] = s->getRankCombCriteriaId();
				}
			}
			for (std::size_t i = 0; i < p->getNumDuties(); i++) {
				for (std::size_t j = 0; j < p->getDuty(i)->getNumSegments(); j++) {
					Segment* s = p->getDuty(i)->getSegment(j);
					s->setRankCombCriteriaId(fltIdToRankComb[s->getDBId()]);
				}
			}
		}
	}
}


//复制PairingSegment配比到Flight上
void updateFlightComposition(Pairing* pairing, SharedPtr<CrewDataContext>& dbData) {
	string& division = dbData->scenario.division;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		for (std::size_t j = 0; j < pairing->getDuty(i)->getNumSegments(); j++) {
			Segment* seg = pairing->getDuty(i)->getSegment(j);
			auto iterFlt = dbData->flightIdMap.find(seg->getDBId());
			if (iterFlt == dbData->flightIdMap.end()) {
				continue;
			}
			auto& flt = iterFlt->second;
			flt->setPlanComposition(seg->getPlanComposition());
			flt->setOpenComposition(seg->getOpenComposition());
			flt->setFillComposition(seg->getFillComposition());

			flt->setRankCombCriteriaId(seg->getRankCombCriteriaId());
			if (division == "P") {
				flt->setRankCombCP(seg->getRankCombCP());
				flt->setRankCombOP(seg->getRankCombOP());
			}
			else if (division == "C") {
				flt->setRankCombCC(seg->getRankCombCC());
				flt->setRankCombOC(seg->getRankCombOC());
			}
			else if (division == "A") {
				flt->setRankCombCA(seg->getRankCombCA());
				flt->setRankCombOA(seg->getRankCombOA());
			}
		}
	}
}

void findUpdatePairingToDutyForUpdate(Pairing*& p, SharedPtr<CrewDataContext>& dbData, vector<UpdatePairingDutyNode>& updatePairingDutyNodeList, vector<UpdatePairingToDuty>& updates){
	Pairing* oldp = dbData->pairingIdMap[p->getDbId()];
	for (std::size_t j = 0; j < p->getNumDuties(); j++){
		//bool isNewDuty = true;
		//bool isNewFirstSeg = false;
		//bool isNewEndSeg = false;
		////bool isOldDutyExist = false;
		//Duty* d = p->getDuty(j);
		//for (std::size_t k = 0; k < oldp->getNumDuties(); k++){
		//	Duty* oldd = oldp->getDuty(k);
		//	if (d->getDutyId() == oldd->getDutyId()){
		//		isNewDuty = false;
		//		//isOldDutyExist = true;
		//		if (d->getSegment(0)->getDBId() != oldd->getSegment(0)->getDBId())isNewFirstSeg = true;
		//		if (d->getSegment(d->getSegments().size() - 1)->getDBId() != oldd->getSegment(oldd->getSegments().size() - 1)->getDBId())isNewEndSeg = true;
		//		if (d->getSegments().size() != oldd->getSegments().size()){
		//			isNewDuty = true;
		//		}
		//		else{
		//			for (int l = 0; l < d->getSegments().size(); l++){
		//				Segment * s = d->getSegment(l);
		//				Segment * olds = oldd->getSegment(l);
		//				if (s->getDBId() != olds->getDBId()){
		//					isNewDuty = true;
		//					break;
		//				}
		//			}
		//			if (isNewDuty)break;
		//		}
		//	}
		//}
		////20200523 ain, mantis#8343, isNewDuty识别，按duty内 flt_id序列判断
		////为降低运算开销，先按原有 duty_id相等判断是否新duty，新duty才执行上述 flt_id复查流程
		//if (isNewDuty) {
		//	stringstream newDutyFltIds;
		//	stringstream oldDutyFltIds;
		//	for (std::size_t i = 0; i < d->getNumSegments(); i++) {
		//		long long fltId = d->getSegment(i)->getDBId();
		//		if (i > 0)
		//			newDutyFltIds << ",";
		//		newDutyFltIds << fltId;
		//		newDutyFltIds << d->getSegment(i)->getAssignment();
		//	}
		//	string newDutyFltIdsStr = newDutyFltIds.str();
		//	bool foundMatch = false;
		//	for (std::size_t k = 0; k < oldp->getNumDuties(); k++){
		//		oldDutyFltIds.str("");
		//		Duty* oldd = oldp->getDuty(k);
		//		for (std::size_t i = 0; i < oldd->getNumSegments(); i++) {
		//			long long fltId = oldd->getSegment(i)->getDBId();
		//			if (i > 0)
		//				oldDutyFltIds << ",";
		//			oldDutyFltIds << fltId;
		//			oldDutyFltIds << oldd->getSegment(i)->getAssignment();
		//		}
		//		if (oldDutyFltIds.str() == newDutyFltIdsStr) {
		//			foundMatch = true;
		//			break;
		//		}
		//	}
		//	if (foundMatch)
		//		isNewDuty = false;
		//}

		//if (isNewDuty){

			//UpdatePairingToDuty update;
			//update.pairingId = p->getDbId();
			//update.dutyId = d->getDutyId();
			
			//20190605 ain, mantis#5854, 若 duty对应 oldDuty不存在则彻底重算, 如addSegToPtn导致新增duty
			//if (!isOldDutyExist) {
			//	isNewFirstSeg = isNewEndSeg = true;
			//}

		//	if (isNewFirstSeg)update.type = "Start";
		//	if (isNewEndSeg)update.type = "End";
		//	if (isNewFirstSeg && isNewEndSeg)update.type = "All";
		//	if (!isNewFirstSeg && !isNewEndSeg)update.type = "All";
		//	if (dbData->scenario.airline == "BR")update.type = "All";
		//	updates.push_back(update);
		//}
		Duty* d = p->getDuty(j);
		if (!d->getIsManualModify() || d->getBriefNeedRuleReCalc() || d->getDebriefNeedRuleReCalc()){
			UpdatePairingToDuty update;
			update.pairingId = p->getDbId();
			update.dutyId = d->getDutyId();
			update.type = "All";
			update.recalDutyNodeFlag = UpdatePairingDutyNode::getRecalDutyNodeFlag(updatePairingDutyNodeList, update.pairingId, update.dutyId);
			updates.push_back(update);
		}
	}
}

//op#2163 更新五件套初始化逻辑
void findUpdatePairingToDuty(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<UpdatePairingDutyNode>& updatePairingDutyNodeList, SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, vector<UpdatePairingToDuty>& updates){
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "Pairing") {
			Pairing * p = (Pairing*)item.get();
			if (op == "ADD") {
				//若pairing已存在，则更新
				if (dbData->pairingIdMap.find(p->getDbId()) == dbData->pairingIdMap.end() || !dbData->pairingIdMap[p->getDbId()]) {
					//ruleEngine->calculatePairingFdpRest(p);
					//ruleEngine->calculatePairingBriefDebrief(p);
					UpdatePairingToDuty update;
					update.pairingId = p->getDbId();
					update.dutyId = -1;
					update.recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_ALL;
					updates.push_back(update);
				}
				else {
					findUpdatePairingToDutyForUpdate(p, dbData, updatePairingDutyNodeList, updates);
				}
			}
		}
	}
	//pairing update
	set<long long> delPairingIds;
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "Pairing") {
			Pairing * p = (Pairing*)item.get();
			if (op == "UPDATE") {
				if (delPairingIds.find(p->getDbId()) == delPairingIds.end()) {
					findUpdatePairingToDutyForUpdate(p, dbData, updatePairingDutyNodeList, updates);
				}
			}
			else if (op == "DEL") {
				long long delPairingId = p->getDbId();
				delPairingIds.insert(delPairingId);

				updates.erase(std::remove_if(updates.begin(), updates.end(),
					[delPairingId](const auto& updatePairingDuty) {return updatePairingDuty.pairingId == delPairingId; })
					, updates.end());
			}
		}
	}

}


#define PICKUP "PICKUP"
#define DROPOFF "DROPOFF"
#define BRIEF "BRIEF"
#define DEBRIEF "DEBRIEF"
//按duty创建/更新 dutyNode：
//若item为空则添加新dutyNode
//pick= STD-pickup-brief ~ STD-brief
//brief=STD-brief ~ *ATD*
shared_ptr<PairingDutyNode> SetPairingDutyNodeCreateOrUpdateItem(Duty* duty, string node, shared_ptr<PairingDutyNode>& item, const string& pairingBase, const Duty* beforeDuty, const Duty* nextDuty, const RecalDutyNodeFlag recalDutyNodeFlag, SharedPtr<LegalityChecker>& ruleEngine) {
	auto dbData = ruleEngine->getDataContext();
	if (!item) {
		item = shared_ptr<PairingDutyNode>(new PairingDutyNode());
		item->setId(-1);
		item->setSequence(0);
		item->setGroupId(0);
		item->setFromSegmentId(0);
		item->setToSegmentId(0);
		duty->pairingDutyNodes.push_back(item);
	}
	item->setPairingId(duty->getPairingId());
	item->setDutyId(duty->getDutyId());
	item->setType("DUTY");
	item->setNode(node);
	item->setAirport(node == PICKUP || node == BRIEF ?
		duty->getDepartureStation() : duty->getArrivalStation());
	ruleEngine->basicSetting(duty, pairingBase, false, beforeDuty, nextDuty);
	int briefMin = duty->getMinBrief();
	int debriefMin = duty->getMinDebrief();
	int pickupMin = duty->getMinPickup();
	int dropoffMin = duty->getMinDropoff();
	Segment* firstSeg = duty->getFirstSegment();
	Segment* lastSeg = duty->getLastSegment();
	if (firstSeg && lastSeg) {
		time_t STD = firstSeg->getStartTimeLocSch();
		time_t ATD = firstSeg->getStartTimeLocAct();
		time_t ATA = lastSeg->getEndTimeLocAct();
		time_t STD_UTC = firstSeg->getStartTimeUtcSch();
		time_t ATD_UTC = firstSeg->getStartTimeUtcAct();
		time_t ATA_UTC = lastSeg->getEndTimeUtcAct();
		if (node == PICKUP) {
			if (ruleEngine->getDataContext()->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" ||  item->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) {
				if (briefMin == 0) {
					item->setEndLoc(ATD);
					item->setEndUtc(ATD_UTC);
				}
				else {
					item->setEndLoc(getDutyBriefStartLocByRule(dbData, duty, recalDutyNodeFlag));
					item->setEndUtc(getDutyBriefStartUtcByRule(dbData, duty, recalDutyNodeFlag));
				}
			}
			if (ruleEngine->getDataContext()->systemParamMap["RE_CALC_PICKUP_WHILE_MANUAL_MODIFY"] == "Y" || item->getIsManualModify() == 0) {
				item->setStartLoc(item->getEndLoc() - pickupMin * 60);
				item->setStartUtc(item->getEndUtc() - pickupMin * 60);
			}
			else if (item->getStartUtc() > item->getEndUtc()) {
				item->setStartLoc(item->getEndLoc());
				item->setStartUtc(item->getEndUtc());
			}
		}
		else if (node == BRIEF) {
			item->setEndLoc(ATD);
			item->setEndUtc(ATD_UTC);
			if (ruleEngine->getDataContext()->systemParamMap["RE_CALC_BRIEF_WHILE_MANUAL_MODIFY"] == "Y" || item->getIsManualModify() == 0 || duty->getBriefNeedRuleReCalc()) {
				if (briefMin == 0) {
					//法规计算MinBrief为0，无论航班如何变动，都要保证Brief时长为0
					item->setStartLoc(item->getEndLoc());
					item->setStartUtc(item->getEndUtc());
				}
				else {
					item->setStartLoc(getDutyBriefStartLocByRule(dbData, duty, recalDutyNodeFlag));
					item->setStartUtc(getDutyBriefStartUtcByRule(dbData, duty, recalDutyNodeFlag));
				}
			}
			else if (item->getStartUtc() > item->getEndUtc()) {
				item->setStartLoc(item->getEndLoc());
				item->setStartUtc(item->getEndUtc());
			}
		}
		else if (node == DEBRIEF) {
			item->setStartLoc(ATA);
			item->setStartUtc(ATA_UTC);
			if (ruleEngine->getDataContext()->systemParamMap["RE_CALC_DEBRIEF_WHILE_MANUAL_MODIFY"] == "Y" || item->getIsManualModify() == 0 || duty->getDebriefNeedRuleReCalc()) {
				item->setEndUtc(ATA_UTC + debriefMin * 60);
				item->setEndLoc(ATA + debriefMin * 60);
			}
			else if (item->getEndUtc() < item->getStartUtc()) {
				item->setEndLoc(ATA);
				item->setEndUtc(ATA_UTC);
			}
		}
		else if (node == DROPOFF) {
			if (ruleEngine->getDataContext()->systemParamMap["RE_CALC_DROPOFF_WHILE_MANUAL_MODIFY"] == "Y" || item->getIsManualModify() == 0 || duty->getDebriefNeedRuleReCalc()) {
				item->setStartLoc(ATA + debriefMin * 60);
				item->setStartUtc(ATA_UTC + debriefMin * 60);
				item->setEndLoc(ATA + (debriefMin + dropoffMin) * 60);
				item->setEndUtc(ATA_UTC + (debriefMin + dropoffMin) * 60);
			}else if (item->getEndUtc() < item->getStartUtc()) {
				item->setEndLoc(item->getStartLoc());
				item->setEndUtc(item->getStartUtc());
			}
		}
	}
	return item;
}
//mantis#6741, 问题8, duty变更后按法规pick/brief/debrief/dropoff刷新dutyNode
static inline void SetPairingDutyNode(Duty* duty, const UpdatePairingToDuty& updateInfo, const string& pairingBase, const Duty* beforeDuty, const Duty* nextDuty, SharedPtr<LegalityChecker>& ruleEngine) {
	//若duty中不存在dutyNode[type=DUTY]，则创建
	shared_ptr<PairingDutyNode> pick = NULL, brief = NULL, debrief = NULL, drop = NULL;
	//sort
	std::sort(duty->pairingDutyNodes.begin(), duty->pairingDutyNodes.end(), [](shared_ptr<PairingDutyNode>& n1, shared_ptr<PairingDutyNode>& n2) {
		return n1->getStartLoc() < n2->getStartLoc();
	});

	for (auto& node : duty->pairingDutyNodes) {
		if (node->getType() == "DUTY") {
			if (node->getNode() == PICKUP) pick = node;
			if (node->getNode() == BRIEF) brief = node;
			if (node->getNode() == DEBRIEF) debrief = node;
			if (node->getNode() == DROPOFF) drop = node;
		}
	}

	//1. 若不存在则创建默认
	//2. 按STD/ATA计算dutyNode时间
	if (updateInfo.type == "" || updateInfo.type == "All" || updateInfo.type == "Start") {
		//Logger::getRuleLogger()->debug("**DBG reset pickup brief, updateInfo.type={}", updateInfo.type);
		SetPairingDutyNodeCreateOrUpdateItem(duty, PICKUP, pick, pairingBase, beforeDuty, nextDuty, updateInfo.recalDutyNodeFlag, ruleEngine);
		SetPairingDutyNodeCreateOrUpdateItem(duty, BRIEF, brief, pairingBase, beforeDuty, nextDuty, updateInfo.recalDutyNodeFlag, ruleEngine);
	}
	if (updateInfo.type == "" || updateInfo.type == "All" || updateInfo.type == "End") {
		//Logger::getRuleLogger()->debug("**DBG reset debrief dropoff, updateInfo.type={}", updateInfo.type);
		SetPairingDutyNodeCreateOrUpdateItem(duty, DEBRIEF, debrief, pairingBase, beforeDuty, nextDuty, updateInfo.recalDutyNodeFlag, ruleEngine);
		SetPairingDutyNodeCreateOrUpdateItem(duty, DROPOFF, drop, pairingBase, beforeDuty, nextDuty, updateInfo.recalDutyNodeFlag, ruleEngine);
	}
	duty->setActualPickupMin(static_cast<long>(pick->getEndUtc() - pick->getStartUtc()) / 60);
	duty->setActualBriefMin(static_cast<long>(brief->getEndUtc() - brief->getStartUtc()) / 60);
	duty->setActualDebriefMin(static_cast<long>(debrief->getEndUtc() - debrief->getStartUtc()) / 60);
	duty->setActualDropoffMin(static_cast<long>(drop->getEndUtc() - drop->getStartUtc()) / 60);

	///TEST
	//if (duty->getPairingId() == -429) {
	//	for (auto& node : duty->pairingDutyNodes) {
	//		cout << "**DBG node " << node->getNode()
	//			<< " " << utcToUtcString(node->getStartLoc())
	//			<< " " << utcToUtcString(node->getEndLoc())
	//			<< " " << (node->getEndLoc() - node->getStartLoc())
	//			<< endl;
	//	}
	//	cout << "";
	//}
}
//根据 doUpdateActivity前收集汇总的 newDuty记录和类型，执行计算五件套逻辑
void SetPairingDuty(SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, const vector<UpdatePairingToDuty>& updates){
	
	for (auto& update : updates){
		auto iter = dbData->pairingIdMap.find(update.pairingId);
		if (iter == dbData->pairingIdMap.end()) {
			Logger::getRuleLogger()->error("ERROR: calc pickup/brief fail, invalid data, pairing={} not found", update.pairingId);
			continue;
		}
		Pairing* p = iter->second;
		string pairingBase = p->getBase();
		p->resetNewPairingBySegments(dbData->baseList);
		if (ruleEngine->GetApplication() == PAIRING_OPTIMIZER && p->getFirstDuty() != nullptr) {
			pairingBase = p->getFirstDuty()->getDepStationRead(); // PO can't get pairing from either duty or segments
		}

		if (update.dutyId == -1){
			ruleEngine->calculatePairingBriefDebrief(p);
			//ruleEngine->calculatePairingFdpRest(p);		
		}
		else{
			Duty* d = NULL;
			Duty* beforeDuty = nullptr;
			Duty* nextDuty = nullptr;
			bool isFirstDuty = false;
			bool isEndDuty = false;
			for (std::size_t i = 0; i < p->getNumDuties(); i++){
				Duty* dd = p->getDuty(i);
				beforeDuty = (i == 0) ? nullptr : p->getDuty(i-1);
				nextDuty = ((i + 1) >= p->getNumDuties()) ? nullptr : p->getDuty(i + 1);
				if (dd->getDutyId() == update.dutyId){
					d = dd;
					if (i == 0){
						isFirstDuty = true;
					}
					if (i == p->getNumDuties() - 1){
						isEndDuty = true;
					}
				}
			}
			if (update.type == "All"){
				Segment * first = NULL;
				if (d) {
					first = d->getFirstSegment();
				}
				if (first && (first->getEtdChgTm() != 0 && first->getStartTimeUtcSch() - first->getEtdChgTm() >= 3 * 3600
					|| (first->getEtdChgTm() == 0 && first->getStartTimeUtcSch() - localToUtc(first->getLastModify()) >= 3 * 3600))) {
					ruleEngine->basicSetting(d, pairingBase, false, beforeDuty, nextDuty);
					
				}
				d->fixNodeMinutesByManualModify();
				d->setStartEndByBriefDebrief(update.recalDutyNodeFlag);
				//若发生duty开始时间和结束时间不同，则采用brief节点时间
				//d->fixingDutyBriefNode();
				p->setStartEndByPickupDropoff();
				if (isFirstDuty) {
					p->resetPairingFirstDutyTimes(update.recalDutyNodeFlag);
				}
				if (isEndDuty) {
					p->resetPairingEndDutyTimes(update.recalDutyNodeFlag);
				}
			}
			else if (update.type == "Start"){
				ruleEngine->basicSettingFirstSeg(d, pairingBase, beforeDuty, nextDuty);
				d->setStartByBrief(update.recalDutyNodeFlag);
				p->setStartEndByPickupDropoff();
				if (isFirstDuty){
					p->resetPairingFirstDutyTimes();
				}
			}
			else if (update.type == "End"){
				ruleEngine->basicSettingEndSeg(d, pairingBase, beforeDuty, nextDuty);
				d->setEndByDebrief();
				p->setStartEndByPickupDropoff();
				if (isEndDuty){
					p->resetPairingEndDutyTimes();
				}
			}
		}

		//20190924 ain, mantis#6741, 问题8, addSeg/delSeg流程增加按法规计算brief/debrief刷新/创建默认dutyNode
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			Duty* beforeDuty = (i == 0) ? nullptr : p->getDuty(i - 1);
			Duty* nextDuty = ((i + 1) >= p->getNumDuties()) ? nullptr : p->getDuty(i + 1);
			if (update.dutyId == -1 || update.dutyId == d->getDutyId()) {
				SetPairingDutyNode(d, update, pairingBase, beforeDuty, nextDuty, ruleEngine);
				d->setStartEndByBriefDebrief(update.recalDutyNodeFlag);
				if (update.dutyId == -1) {
					//若发生duty开始时间和结束时间不同，则采用brief节点时间
					d->fixingDutyBriefNode();
				}
				// ROSCRW-489 大过站时，法规需要赋值from_segment_id/to_segment_id
				if (update.recalDutyNodeFlag != RecalDutyNodeFlag::RECAL_NONE) {
					createPairingNodeOfSegByRuleParam(d, dbData.get(), p);
				}
				//20190924 ain, 创建/刷新 dutyNode后重算fdp/dp
				calculatePairingDutyTimes(d, dbData.get());//20190924 ain, 创建dutyNode后需重算fdp
			}
		}
		ruleEngine->calculatePairingFdpRest(p);
		ruleEngine->calculatePairingLabel(p);
		// 更新pairing，重刷AcclimationState
		//ruleEngine->setAcclimationState_QQ(p);
	

	}
}
//
//20190625 ain, mantis#6037, 按duty刷新pairing, 不改变duty
//针对界面五件套编辑时seg不变, 不会进入 SetPairingDuty()流程, 需按界面duty.start刷新pairing
void resetPairingByDuty(SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, vector<string>& opList, vector<SharedPtr<Activity>>& itemList) {
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "Pairing") {
			Pairing * inboxPtn = (Pairing*)item.get();
			long long pairingId = inboxPtn->getDbId();
			if (op == "ADD" || op == "UPDATE") {
				if (dbData->pairingIdMap.end() != dbData->pairingIdMap.find(pairingId)) {
					Pairing* ptn = dbData->pairingIdMap[pairingId];
					ptn->resetPairingTimes();
				}
			}
		}
	}
}

void resetRosterTimeByPairing(SharedPtr<CrewDataContext>& dbData, SharedPtr<LegalityChecker>& ruleEngine, vector<string>& opList, vector<SharedPtr<Activity>>& itemList, map<string, SharedPtr<CREW>>& updatedCrews) {
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "ROSTER") {
			ROSTER* inboxRoster = (ROSTER*)item.get();
			long long pairingId = inboxRoster->pairId;
			if (op == "ADD" || op == "UPDATE") {
				if (dbData->pairingIdMap.end() != dbData->pairingIdMap.find(pairingId)) {
					Pairing* ptn = dbData->pairingIdMap[pairingId];
					if (ptn == nullptr)
						continue;
					if (!updatedCrews.empty()) {
						for (auto iter = updatedCrews.begin(); iter != updatedCrews.end(); iter++) {
							if (dbData->crewIdMap.find(iter->first) != dbData->crewIdMap.end()) {
								auto rosterList = dbData->crewIdMap[iter->first]->rosterList;
								for (auto roster : rosterList) {
									if (roster->pairId == pairingId) {
										roster->strUtc = ptn->getStartTimeUtcSch();
										roster->strLoc = ptn->getStartTimeLocSch();
										roster->endUtc = ptn->getEndTimeIncludingRestUtcSch();
										roster->endLoc = ptn->getEndTimeIncludingRestLocSch();
										roster->restStrUtc = ptn->getEndTimeUtcSch();
										roster->restStrLoc = ptn->getEndTimeLocSch();
										roster->actStrUtc = ptn->getStartTimeUtcAct();
										roster->actStrLoc = ptn->getStartTimeLocAct();
										roster->actEndUtc = ptn->getEndTimeIncludingRestUtcAct();
										roster->actEndLoc = ptn->getEndTimeIncludingRestLocAct();
										roster->actRestStrUtc = ptn->getEndTimeUtcAct();
										roster->actRestStrLoc = ptn->getEndTimeLocAct();
									}
								}
							}
						}
					}
				}
			}
		}
		else if (item->getClassName() == "Pairing") {
			Pairing* ptn = (Pairing*)item.get();
			auto rfs = dbData->rosterFlightMgr.getByPairingId(ptn->getDbId());
			set<string> crewIds;
			for (auto& rf : rfs) {
				crewIds.insert(rf->crewId);
			}
			for(auto& crewId : crewIds) {
				auto roster = dbData->findRosterByPairing(crewId, ptn->getDbId());
				if (roster != nullptr) {
					roster->strUtc = ptn->getStartTimeUtcSch();
					roster->strLoc = ptn->getStartTimeLocSch();
					//roster->endUtc = ptn->getEndTimeIncludingRestUtcSch();
					//roster->endLoc = ptn->getEndTimeIncludingRestLocSch();
					roster->restStrUtc = ptn->getEndTimeUtcSch();
					roster->restStrLoc = ptn->getEndTimeLocSch();
					roster->actStrUtc = ptn->getStartTimeUtcAct();
					roster->actStrLoc = ptn->getStartTimeLocAct();
					//roster->actEndUtc = ptn->getEndTimeIncludingRestUtcAct();
					//roster->actEndLoc = ptn->getEndTimeIncludingRestLocAct();
					roster->actRestStrUtc = ptn->getEndTimeUtcAct();
					roster->actRestStrLoc = ptn->getEndTimeLocAct();
				}
			}
			
		}
	}
}

//static std::mutex requestMutex;
void prepareRequestRoster(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<string>& rosterFlightOps, vector<SharedPtr<RosterFlight>>& rosterFlightItems, SharedPtr<LegalityChecker>& ruleEngine, SharedPtr<CrewDataContext>& dbData) {
	if (!dbData->isRequestScope()) {
		return;
	}
	auto& requestRoster = dbData->getRequestRoster();
	requestRoster.addedRosters.clear();
	requestRoster.removedRosters.clear();
	requestRoster.changedCrewIds.clear();
	requestRoster.changedPairingIds.clear();
	
	set<string> requestCrewIds;
	set<long long> requestPairingIds;
	for (std::size_t i = 0; i < opList.size(); i++) {
		string op = strToUpper(opList[i]);
		SharedPtr<Activity> item = itemList[i];
		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			if (op == "ADD") {
				SharedPtr<ROSTER> newRoster = std::make_shared<ROSTER>();
				newRoster->copy(roster.get());
				requestRoster.addedRosters.push_back(newRoster);
				requestCrewIds.emplace(newRoster->idcrew);
			}
			else if (op == "DEL") {
				SharedPtr<ROSTER> newRoster = std::make_shared<ROSTER>();
				newRoster->copy(roster.get());
				requestRoster.removedRosters.push_back(newRoster);
				requestCrewIds.emplace(newRoster->idcrew);
			}
		}
		else if (item->getClassName() == "Pairing") {
			Pairing* pairing = (Pairing*)item.get();
			requestPairingIds.emplace(pairing->getDbId());
		}
	}
	for (std::size_t i = 0; i < rosterFlightOps.size(); i++) {
		string op = strToUpper(rosterFlightOps[i]);
		auto& rf = rosterFlightItems[i];
		requestPairingIds.emplace(rf->pairingId);
	}
	for (auto& requestCrewId : requestCrewIds) {
		auto iter = dbData->crewIdMap.find(requestCrewId);
		if (iter != dbData->crewIdMap.end()) {
			for (auto& roster : iter->second->rosterList) {
				if (roster->pairing != nullptr) {
					requestPairingIds.emplace(roster->pairing->getDbId());
				}
			}
		}
	}
	requestRoster.changedCrewIds = requestCrewIds;
	requestRoster.changedPairingIds = requestPairingIds;
	//std::lock_guard<std::mutex> lock(requestMutex);
	dbData->recreate(requestCrewIds, requestPairingIds);
}

//法规服务化执行Duty申请和交换时，预先检查，获得告警信息。
void prepareCheckCrew(vector<SharedPtr<Activity>>& itemList, SharedPtr<LegalityChecker>& ruleEngine, SharedPtr<CrewDataContext>& dbData) {
	if (!dbData->isRequestScope()) {
		return;
	}

	vector<RULE_LEGALITY*> checkList;
	for (auto& item : itemList) {
		if (item->getClassName() == "ROSTER") {
			SharedPtr<ROSTER> roster = static_pointer_cast<ROSTER> (item);
			int crewIndex = ruleEngine->getCrewIndex(roster->idcrew);
			if (crewIndex == -1) {
				continue;
			}
			RULE_LEGALITY* checkItem = new RULE_LEGALITY();
			checkItem->crewIndex = crewIndex;
			checkList.push_back(checkItem);
		}
	}
	//检查法规
	ruleEngine->checkRules(checkList);
	for (auto& ruleLegality : checkList) {
		delete ruleLegality;
	}
	//保存预检查的法规
	vector<SharedPtr<RULE_VIOLATION>>& prepareRuleViolations = dbData->getPrepareCheckRuleViolations();
	for (auto& ruleViolation : ruleEngine->getRuleViolations()) {
		prepareRuleViolations.push_back(std::make_shared<RULE_VIOLATION>(*ruleViolation));
	}
}

//返回4位告警function
inline static long long getRuleFunctionId(const long long ruleId) {
	return (ruleId / 1000);
}

inline static bool isSameViolationOperationResult(RULE_VIOLATION* orgViolation, RULE_VIOLATION* newViolation) {
	return orgViolation->operation_result == newViolation->operation_result;
}

inline static bool isSameViolationMessage(RULE_VIOLATION* orgViolation, RULE_VIOLATION* newViolation) {
	return orgViolation->violation_msg == newViolation->violation_msg;
}

//检查v1 和 v2 是否相同告警
inline static bool isSameViolation(RULE_VIOLATION* orgViolation, RULE_VIOLATION* newViolation) {
	bool isSame = false;
	int ruleFunction = getRuleFunctionId(orgViolation->idRule);
	
	if (ruleFunction == 8072 && orgViolation->segmentId == newViolation->segmentId 
		&& isSameViolationMessage(orgViolation, newViolation) && isSameViolationOperationResult(orgViolation, newViolation)) {
		//8072法规，只要同一航段的告警发生转移，认为是同一告警，过滤掉不展示
		//同一航班(Pairing、Duty)的相同告警(ruleParamId相同)发生迁移：在DutySwap时，从被删除排班人员 迁移 到 被新增排班人员，认为是同一告警，过滤掉不展示
		isSame = true;
	}
	else if (orgViolation->pairingId == newViolation->pairingId
		&& orgViolation->dutySequenceNumber == newViolation->dutySequenceNumber
		&& orgViolation->segmentId == newViolation->segmentId
		&& isSameViolationMessage(orgViolation, newViolation) && isSameViolationOperationResult(orgViolation, newViolation)) {
		//同一航班(Pairing、Duty)的相同告警(ruleParamId相同)发生迁移：在DutySwap时，从被删除排班人员 迁移 到 被新增排班人员，认为是同一告警，过滤掉不展示
		isSame = true;
	}
	return isSame;
}

vector<RULE_VIOLATION*> filterRuleViolationsWithPrepareCheckCrew(SharedPtr<LegalityChecker>& ruleEngine, SharedPtr<CrewDataContext>& dbData) {
	if (!dbData->isRequestScope()) {
		return ruleEngine->getRuleViolations();
	}
	std::set<long long> currRuleIds;
	auto& appRules = ruleEngine->getAppRules();
	for (auto& item : appRules) {
		currRuleIds.emplace(item.idRule);
	}

	RequestRoster& requestRoster = dbData->getRequestRoster();

	vector<SharedPtr<RULE_VIOLATION>>& prepareRuleViolations = dbData->getPrepareCheckRuleViolations();
    map<string, vector<RULE_VIOLATION*>> prepareCrewViolationsMap;//key:crewId|idRule, value: violation list
	map<string, vector<RULE_VIOLATION*>> lastCrewViolationsMap;

    //告警转移：在DutySwap时，同一告警从CrewA转移CrewB，认为是同一告警，过滤掉告警
	map<long long, vector<RULE_VIOLATION*>> prepareCrewViolationsMapOnTransferring;//key:ruleParamId, value: violation list。获得交换班被删除排班的人员，在交换班之前的告警信息
	map<long long, vector<RULE_VIOLATION*>> lastCrewViolationsMapOnTransferring;//key:ruleParamId, value: violation list。获得交换班被新增排班的人员，在交换班之后的告警信息
	set<long long> ruleFunctionsOnTransferring = {8072}; //DutySwap时，同一告警从CrewA转移CrewB，忽略该告警，仅适应8072法规

	set<string> crewIdsByRemovedRosters, crewIdsByAddRosters;
	for (auto& roster : requestRoster.removedRosters) {
		crewIdsByRemovedRosters.insert(roster->idcrew);
	}

	for (auto& roster : requestRoster.addedRosters) {
		crewIdsByAddRosters.insert(roster->idcrew);
	}

	//预处理存储到Map中
	for (auto& prepareRuleViolation : prepareRuleViolations) {
        if (currRuleIds.find(prepareRuleViolation->idRule) == currRuleIds.end()) {
			//告警的法规不在当前法规集中则忽略
			continue;
		}
		string key = prepareRuleViolation->crewId + "|" + std::to_string(prepareRuleViolation->idRule);
		auto iter = prepareCrewViolationsMap.find(key);
		if (iter == prepareCrewViolationsMap.end()) {
			vector<RULE_VIOLATION*> violations;
			violations.push_back(prepareRuleViolation.get());
			prepareCrewViolationsMap.insert(std::make_pair(key, violations));
		}
		else {
			iter->second.push_back(prepareRuleViolation.get());

		}

		//获得交换班被删除排班的人员，在交换班之前的告警信息
		if (crewIdsByRemovedRosters.find(prepareRuleViolation->crewId) != crewIdsByRemovedRosters.end()) {
			int ruleFunction = getRuleFunctionId(prepareRuleViolation->idRule);
			if (prepareRuleViolation->ruleParamId > 0 && ruleFunctionsOnTransferring.find(ruleFunction) != ruleFunctionsOnTransferring.end()) {
				prepareCrewViolationsMapOnTransferring[prepareRuleViolation->ruleParamId].emplace_back(prepareRuleViolation.get());
			}
		}
	}

	for (auto& ruleViolation : ruleEngine->getRuleViolations()) {
		if (currRuleIds.find(ruleViolation->idRule) == currRuleIds.end()) {
			//告警的法规不在当前法规集中则忽略
			continue;
		}
		string key = ruleViolation->crewId + "|" + std::to_string(ruleViolation->idRule);
		auto iter = lastCrewViolationsMap.find(key);
		if (iter == lastCrewViolationsMap.end()) {
			vector<RULE_VIOLATION*> violations;
			violations.push_back(ruleViolation);
			lastCrewViolationsMap.insert(std::make_pair(key, violations));
		}
		else {
			iter->second.push_back(ruleViolation);

		}

		//获得交换班被新增排班的人员，在交换班之后的告警信息
		if (crewIdsByAddRosters.find(ruleViolation->crewId) != crewIdsByAddRosters.end()) {
			int ruleFunction = getRuleFunctionId(ruleViolation->idRule);
			if (ruleViolation->ruleParamId > 0 && ruleFunctionsOnTransferring.find(ruleFunction) != ruleFunctionsOnTransferring.end()) {
				lastCrewViolationsMapOnTransferring[ruleViolation->ruleParamId].emplace_back(ruleViolation);
			}
		}
	}

	//实现过滤
	vector<RULE_VIOLATION*> rvs;
	for (auto& lastPair : lastCrewViolationsMap) {
		const string& key = lastPair.first;
		auto prepareIter = prepareCrewViolationsMap.find(key);
		
		string crewid = "";
		vector<string> keyStrs;
		split(key, '|', keyStrs);
		if (!keyStrs.empty() && keyStrs.size() == 2) {
			crewid = keyStrs[0];
		}

		if (prepareIter == prepareCrewViolationsMap.end()) {
			//新增告警
			auto& newViolations = lastPair.second;
			for (auto& newViolation : newViolations) {
				auto prepareIterOnTransferring = prepareCrewViolationsMapOnTransferring.find(newViolation->ruleParamId);
				if (prepareIterOnTransferring != prepareCrewViolationsMapOnTransferring.end()) {
                    //检查新增告警是否属于告警转移，若是告警转移则忽略该告警
					for (auto& prepareViolationOnTransferring : prepareIterOnTransferring->second) {
                        if (isSameViolation(prepareViolationOnTransferring, newViolation)) {
							//同一告警，过滤掉不展示
							continue;
						}
						else {
							rvs.emplace_back(newViolation);
						}
					}
				}
				else {
                    //非转移告警，直接展示
					rvs.emplace_back(newViolation);
				}
			}

		}
		else {
			//原告警，保留告警时间段与申请时间段重叠的告警
			for (auto& lastViolation : lastPair.second) {
				bool isNew = false;
				for (auto& roster : requestRoster.addedRosters) {
					if (roster->idcrew != crewid)
						continue;
					if ((roster->actStrUtc >= lastViolation->startDTUtc && roster->actStrUtc <= lastViolation->endDTUtc) ||
						(roster->actEndUtc >= lastViolation->startDTUtc && roster->actEndUtc <= lastViolation->endDTUtc) ||
						(roster->actStrUtc <= lastViolation->startDTUtc && roster->actEndUtc >= lastViolation->endDTUtc)) {
						rvs.push_back(lastViolation);
						isNew = true;
						break;
					}
				}

				if (isNew) continue;

				//判断是否相同告警
				bool isSame = false;
				for (auto& oldViolation : prepareIter->second) {
					if (isSameViolation(oldViolation, lastViolation)) {
						isSame = true;
					}
				}
				if (!isSame) {
					rvs.push_back(lastViolation);
				}
			}

		}
	}
	return rvs;
}

//移除Crew(COF)中Crew
map<string, SharedPtr<CREW>>& removeCrewOnFlight(map<string, SharedPtr<CREW>>& updatedCrews, SharedPtr<CrewDataContext>& dbData) {
	map<string, SharedPtr<CREW>> tmpUpdatedCrews;
	set<string> crewIds;//当前CrewIds（不包含Crew(COF))
	for (auto& crew : dbData->crewList) {
		crewIds.emplace(crew->idCrew);
	}
	for (auto iter = updatedCrews.cbegin(); iter != updatedCrews.cend(); ) {
		if (crewIds.find(iter->first) == crewIds.end()) {
			iter = updatedCrews.erase(iter);
		}
		else {
			++iter;
		}
	}
	return updatedCrews;
}

void removeDuplicate_UpdateList(vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<bool>& recalCompositionFlagList, SharedPtr<CrewDataContext>& dbData) {
	vector<string> newOpList;
	vector<SharedPtr<Activity>> newItemList;
	vector<bool> newRecalCompositionFlagList;
	
	vector<SharedPtr<ROSTER>> delRosters;
	for (size_t i = 0; i < opList.size(); i++) {

		if (opList[i] == "DEL") {
			SharedPtr<Activity> item = itemList[i];
			if (item->getClassName() == "ROSTER") {
				SharedPtr<ROSTER> delRoster = static_pointer_cast<ROSTER> (item);
				auto iterCrew = dbData->crewIdMap.find(delRoster->idcrew);
				if (iterCrew == dbData->crewIdMap.end()) {
					continue;
				}
				delRosters.emplace_back(delRoster);
			}
		}
	}	
		
	for (size_t i = 0; i < opList.size(); i++) {
		bool exist = false;
		if (opList[i] == "ADD") {
			SharedPtr<Activity> item = itemList[i];
			if (item->getClassName() == "ROSTER") {
				SharedPtr<ROSTER> newRoster = static_pointer_cast<ROSTER> (item);
				auto iterCrew = dbData->crewIdMap.find(newRoster->idcrew);
				if (iterCrew == dbData->crewIdMap.end()) {
					continue;
				}
				for (auto& orgRoster : iterCrew->second->rosterList) {
					// 2024.12.31 jiaxin.jin 增加非地面任务判断
					if (orgRoster->pairing && orgRoster->pairId == newRoster->pairId) {
						exist = true;
						Logger::getRuleLogger()->warn("[removeDuplicate_UpdateList] Duplication occurs when adding the roster. crewId={}, pairingId={}", newRoster->idcrew, newRoster->pairId);
						break;
					}
				}
				if (exist) {
					for(auto& delRoster : delRosters) {
						if (delRoster->pairId != 0 && delRoster->idcrew == newRoster->idcrew && delRoster->pairId == newRoster->pairId) {
							//若被删除，设置为不存在
							exist = false;
							break;
						}
					}
				}
			}
		}
		if (!exist) {
			newOpList.emplace_back(opList[i]);
			newItemList.emplace_back(itemList[i]);
			newRecalCompositionFlagList.emplace_back(recalCompositionFlagList[i]);
		}
	}

	opList.clear();
	itemList.clear();
	recalCompositionFlagList.clear();

	opList.swap(newOpList);
	itemList.swap(newItemList);
	recalCompositionFlagList.swap(newRecalCompositionFlagList);
}
