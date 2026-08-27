
#include <fstream>
#include <iostream>
#include "mongoose.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "OrLog.h"
#include "Log/Logger.h"
#include "CompressUtil.h"
#include "httpUtil.h"
#include "JsonPairing.h"

using namespace std;

#if defined(__unix) || defined(__APPLE__)
    #define _snprintf snprintf
#endif


//更新serverAuthToken为目标 userName，以便保存场景结果时按目标user
int CrewDataContext::loginAsUserFromHttpServer(string username) {

	int ret = 0;
	string url = this->configDataSourceUrl + "/api/changeEncKey";
	const char * contentType = "application/json";
	char outputbuf[1024] = { 0 };
	int outputLen = sizeof(outputbuf);
	string result;
	stringstream ss;
	string inputbuf;
	string enUsername;
	string deToken;
	
	/*if (!username.empty()) {
		Logger::getRuleLogger()->info("WARN: /api/switchUser not support");
		goto CLEANUP;
	}*/

	if (username.empty()) {
		goto CLEANUP;
	}
	Logger::getRuleLogger()->info("login: {}", username.c_str());

	//对username加密
	enUsername = encrypt(username);
	ss << enUsername;
	inputbuf = ss.str();
	ret = sendHttpReq2(url, this->httpAuthToken, contentType, (char*)inputbuf.c_str(), (int)inputbuf.length(), outputbuf, outputLen);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	if (outputLen < 20) {
		ret = -1;
		goto CLEANUP;
	}
	result = outputbuf;
	if (result.find("{\"timestamp\"") != string::npos) {
		ret = -1;
		goto CLEANUP;
	}
	//解密token
	decrypt(result, deToken);
	this->httpAuthToken = deToken;
	Logger::getRuleLogger()->info("token={}", deToken.c_str());
CLEANUP:
	if (ret == -1) {
		Logger::getRuleLogger()->error("ERROR: /api/switchUser fail, {}", deToken.c_str());
	}
	return ret;
}

//按输入条件拼接scenario对象，按start/end/base/rank/fleet筛选加载场景数据
int CrewDataContext::loadDataFromHttpServer(long long scenarioId, time_t startDtLoc, time_t endDtLoc, long long ruleSet, string baseIds, string rankIds, string fleetIds, string division) {

	int ret = 0;
	//char postBuf[1024] = { 0 };
	//int postLen = 0;
	string url = this->configDataSourceUrl + "/api/orengine/ro/partial/comptxt";
	const char * gzFile = "ro_input.gz";
	const char * txtFile = "ro_input.txt";
	const char * contentType = "application/json";
	stringstream ss;
	string scenarioJson;

	Logger::getRuleLogger()->info(">> loadDataFromHttpServer >>\n"); fflush(stdout);
	ss << "{\"worksetId\":" << scenarioId;
	//201802225 ain, mantis#2869, 若 start/ end数值为0则按json中不指定 start/end
	if (startDtLoc != 0) {
		ss << ", \"strDtLoc\":\"" << utcToUtcDtString(startDtLoc) << "\"";
	}
	if (startDtLoc != 0) {
		ss << ", \"endDtLoc\":\"" << utcToUtcDtString(endDtLoc) << "\"";
	}
	if (ruleSet != 0) {
		ss << ", \"ruleSetId\":" << ruleSet << "";
	}
	if (!baseIds.empty()) {
		ss << ", \"pairingBaseIds\":\"" << baseIds << "\"";
		ss << ", \"crewBaseIds\":\"" << baseIds << "\"";
	}
	if (!rankIds.empty()) {
		ss << ", \"rankIds\":\"" << rankIds << "\"";
	}
	if (!fleetIds.empty()) {
		ss << ", \"fleetIds\":\"" << fleetIds << "\"";
	}
	if (!division.empty()) {
		ss << ", \"division\":\"" << division << "\"";
	}
	ss << "}";
	scenarioJson = ss.str();

	///TEST
	cout << "query json: " << scenarioJson << endl;

	//http
	Logger::getRuleLogger()->info("sendHttpReq\n"); fflush(stdout);
	ret = sendHttpReq(url, this->httpAuthToken, contentType, (char*)scenarioJson.c_str(), (int)scenarioJson.length(), gzFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//解压缩
	Logger::getRuleLogger()->info("decompressFile\n"); fflush(stdout);
	ret = decompressFile(gzFile, txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	Logger::getRuleLogger()->info("loadDataCsv\n"); fflush(stdout);
	ret = this->loadDataCsv((char*)txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
CLEANUP:
	Logger::getRuleLogger()->info("<< loadDataFromHttpServer <<\n"); fflush(stdout);
	return ret;
}

//从server读取 gz压缩数据到本地 .gz文件并解压缩
int CrewDataContext::loadDataFromHttpServer(long long scenarioId, string loginUser) {
	int ret = 0;
	if (!loginUser.empty())
	{
		Logger::getRuleLogger()->info("{} ", loginUser.c_str());
		ret = loginAsUserFromHttpServer(loginUser);

		if (ret != SUCCESS) {
			Logger::getRuleLogger()->warn("WARN: loginAsUser '{}' faild", username.c_str());
		}
	}

	char postBuf[1024] = { 0 };
	int postLen = 0;
	string url = this->configDataSourceUrl + "/api/orengine/ro/comptxt";
	const char * gzFile = "ro_input.gz";
	const char * txtFile = "ro_input.txt";
	const char * contentType = "application/json";

	postLen = snprintf(postBuf, sizeof(postBuf), "%lld", scenarioId);
	//http
	ret = sendHttpReq(url, this->httpAuthToken, contentType, postBuf, postLen, gzFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//解压缩
	ret = decompressFile(gzFile, txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	// don't output debug log when load data from server
	this->configInputLog = false;
	ret = this->loadDataCsv((char*)txtFile);
	if (std::remove(txtFile) != 0) {
		Logger::getRuleLogger()->warn("WARN: Failed to remove temporary file: {}", txtFile);
	}
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
CLEANUP:
	return ret;
}

int CrewDataContext::loadDataFromHttpServerTO(long long scenarioId, std::string loginUser) {
	int ret = 0;
	if (!loginUser.empty())
	{
		Logger::getRuleLogger()->info("{} ", loginUser.c_str());
		ret = loginAsUserFromHttpServer(loginUser);

		if (ret != SUCCESS) {
			Logger::getRuleLogger()->warn("WARN: loginAsUser '{}' faild", username.c_str());
		}
	}

	char postBuf[1024] = { 0 };
	int postLen = 0;
	string url = this->configDataSourceUrl + "/api/orengine/to/comptxt";
	const char * gzFile = "to_input.gz";
	const char * txtFile = "to_input.txt";
	const char * contentType = "application/json";

	postLen = snprintf(postBuf, sizeof(postBuf), "%lld", scenarioId);
	//http
	ret = sendHttpReq(url, this->httpAuthToken, contentType, postBuf, postLen, gzFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//解压缩
	ret = decompressFile(gzFile, txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	// don't output debug log when load data from server
	this->configInputLog = false;
	ret = this->loadDataCsv((char*)txtFile);
	if (std::remove(txtFile) != 0) {
		Logger::getRuleLogger()->warn("WARN: Failed to remove temporary file: {}", txtFile);
	}
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	CLEANUP:
	return ret;
}

//按pairingIds筛选场景数据，用于pairing增量变化时刷新计算 manday
//API: /api/orengine/ro/byPairing/comptxt
int CrewDataContext::loadDataByPairingFromHttpServer(long long scenarioId, vector<long long>& pairingIds) {
	int ret = 0;
	char postBuf[1024] = { 0 };
	int postLen = 0;
	string url = this->configDataSourceUrl + "/api/orengine/byPairing/comptxt";
	const char * gzFile = "ro_input.gz";
	const char * txtFile = "ro_input.txt";
	const char * contentType = "application/json";
	stringstream ss;
	string requestJsno;

	Logger::getRuleLogger()->info(">> loadDataFromHttpServer >>"); fflush(stdout);
	ss << "{\"worksetId\":" << scenarioId;
	ss << ",\n\"pairingIds\":[";
	for (std::size_t i = 0; i < pairingIds.size(); i++) {
		if (i > 0) ss << ",";
		ss << pairingIds[i];
	}
	ss << "]}";
	requestJsno = ss.str();

	///TEST
	cout << "query json: " << requestJsno << endl;

	//http
	Logger::getRuleLogger()->info("sendHttpReq"); fflush(stdout);
	ret = sendHttpReq(url, this->httpAuthToken, contentType, (char*)requestJsno.c_str(), (int)requestJsno.length(), gzFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//解压缩
	Logger::getRuleLogger()->info("decompressFile"); fflush(stdout);
	ret = decompressFile(gzFile, txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	Logger::getRuleLogger()->info("loadDataCsv"); fflush(stdout);
	ret = this->loadDataCsv((char*)txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
CLEANUP:
	Logger::getRuleLogger()->info("<< loadDataFromHttpServer <<"); fflush(stdout);
	return ret;
}

int CrewDataContext::loadDataByFlightFromHttpServer(long long scenarioId, vector<long long>& fltIds, string filiale, string division) {
	int ret = 0;
	char postBuf[1024] = { 0 };
	int postLen = 0;
	string url = this->configDataSourceUrl + "/api/orengine/byFlight/comptxt";
	const char * gzFile = "ro_input.gz";
	const char * txtFile = "ro_input.txt";
	const char * contentType = "application/json";
	stringstream ss;
	string requestJsno;

	Logger::getRuleLogger()->info(">> loadDataFromHttpServer >>"); fflush(stdout);
	ss << "{\"worksetId\":" << scenarioId;
	ss << ",\n\"filiale\":\"" << filiale << "\"";
	ss << ",\n\"division\":\"" << division << "\"";
	ss << ",\n\"flightIds\":[";
	for (std::size_t i = 0; i < fltIds.size(); i++) {
		if (i > 0) ss << ",";
		ss << fltIds[i];
	}
	ss << "]}";
	requestJsno = ss.str();

	///TEST
	cout << "query json: " << requestJsno << endl;

	//http
	Logger::getRuleLogger()->info("sendHttpReq"); fflush(stdout);
	ret = sendHttpReq(url, this->httpAuthToken, contentType, (char*)requestJsno.c_str(), (int)requestJsno.length(), gzFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//解压缩
	Logger::getRuleLogger()->info("decompressFile"); fflush(stdout);
	ret = decompressFile(gzFile, txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	Logger::getRuleLogger()->info("loadDataCsv"); fflush(stdout);
	ret = this->loadDataCsv((char*)txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
CLEANUP:
	Logger::getRuleLogger()->info("<< loadDataFromHttpServer <<"); fflush(stdout);
	return ret;
}

//按pairingIds筛选场景数据，用于pairing增量变化时刷新计算 manday
//API: /api/orengine/ro/byPairing/comptxt
int CrewDataContext::loadDataByCrewFromHttpServer(long long scenarioId, vector<string>& crewIds, time_t start, time_t end, string division) {
	int ret = 0;
	char postBuf[1024] = { 0 };
	int postLen = 0;
	string url = this->configDataSourceUrl + "/api/orengine/byCrew/comptxt";
	const char * gzFile = "ro_input.gz";
	const char * txtFile = "ro_input.txt";
	const char * contentType = "application/json";
	stringstream ss;
	string requestJson;

	Logger::getRuleLogger()->info(">> loadDataFromHttpServer >>"); fflush(stdout);
	ss << "{\"worksetId\":" << scenarioId;
	ss << ",\n\"start\":\"" << utcToUtcDtString(start) << "\"";
	ss << ",\n\"end\":\"" << utcToUtcDtString(end) << "\"";
	ss << ",\n\"division\":\"" << division << "\"";
	ss << ",\n\"crewIds\":[";
	for (std::size_t i = 0; i < crewIds.size(); i++) {
		if (i > 0) ss << ",";
		ss << "\"" << crewIds[i] << "\"";
	}
	ss << "]}";
	requestJson = ss.str();

	///TEST
	cout << "query json: " << requestJson << endl;

	//http
	Logger::getRuleLogger()->info("sendHttpReq"); fflush(stdout);
	ret = sendHttpReq(url, this->httpAuthToken, contentType, (char*)requestJson.c_str(), (int)requestJson.length(), gzFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//解压缩
	Logger::getRuleLogger()->info("decompressFile"); fflush(stdout);
	ret = decompressFile(gzFile, txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	Logger::getRuleLogger()->info("loadDataCsv"); fflush(stdout);
	ret = this->loadDataCsv((char*)txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
CLEANUP:
	Logger::getRuleLogger()->info("<< loadDataFromHttpServer <<"); fflush(stdout);
	return ret;
}


//从server读取 gz压缩数据到本地 .gz文件并解压缩
int CrewDataContext::loadScenOfGrpFromHttpServer(long long scenarioId, vector<long long>& result) {
	int ret = 0;
	stringstream ss;
	int postLen = 0;
	string url = this->configDataSourceUrl + "/api/group/scenarioId";
	char gzFile[100] = { 0 }; //"ro_input.gz";
	char txtFile[100] = { 0 };// "ro_input.txt";
	const char * contentType = "application/json";
	string buf;
	ifstream in;
	string line;

	_snprintf(gzFile, sizeof(gzFile) - 1, "csv_scen_grp.gz");
	_snprintf(txtFile, sizeof(txtFile) - 1, "csv_scen_grp.txt");

	ss << scenarioId ;

	//http
	buf = ss.str();
	ret = sendHttpReq(url, this->httpAuthToken, contentType, (char*)buf.c_str(), (int)buf.length(), txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//parse result
	in.open(txtFile);
	in >> line;
	if (line.length() < 2) {
		cout << "ERROR: invalid response of loadScenOfGrpFromHttpServer , line=" << line << endl;
		goto CLEANUP;
	}
	line = line.substr(1, line.length() - 2);
	split(line.c_str(), ',', result);
CLEANUP:
	in.close();
	return ret;
}

//从server读取 gz压缩数据到本地 .gz文件并解压缩
int CrewDataContext::loadRosterFromHttpServer(vector<long long>& scenarioIds, time_t startUtc, time_t endUtc, vector<string>& crewIds, bool needPreAssign, vector<shared_ptr<ROSTER>>& result) {
	int ret = 0;
	stringstream ss;
	int postLen = 0;
	string url = this->configDataSourceUrl + "/api/scenario/roster/csv/comp";
	char gzFile[100] = { 0 }; //"ro_input.gz";
	char txtFile[100] = { 0 };// "ro_input.txt";
	const char * contentType = "application/json";
	string buf;

	if (scenarioIds.empty()) {
		Logger::getRuleLogger()->error("invalid param loadRosterFromHttpServer, scenarioIds is empty");
		return -1;
	}

	_snprintf(gzFile, sizeof(gzFile) - 1, "csv_load_roster.%lld.gz", scenarioIds[0]);
	_snprintf(txtFile, sizeof(txtFile) - 1, "csv_load_roster.%lld.txt", scenarioIds[0]);

	ss << "{\"scenarioIds\":[";
	for (std::size_t i = 0; i < scenarioIds.size(); i++) {
		if (i > 0)
			ss << ",";
		ss << scenarioIds[i];
	}
	ss << "], \"startUtc\":\"" << utcToUtcTzString(startUtc) << "\",";
	ss << "\"endUtc\":\"" << utcToUtcTzString(endUtc) << "\",";
	ss << "\"crewIds\":[\"";
	for (std::size_t i = 0; i < crewIds.size(); i++) {
		if (i > 0)
			ss << "\",\"";
		ss << crewIds[i];
	}
	ss << "\"],";
	ss << "\"needPreAssign\":" << (needPreAssign ? "true" : "false") << "}";
	
	cout << "loadRosterFromHttpServer: " << ss.str() << endl;

	//http
	buf = ss.str();
	ret = sendHttpReq(url, this->httpAuthToken, contentType, (char*)buf.c_str(), (int)buf.length(), gzFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//解压缩
	ret = decompressFile(gzFile, txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	ret = this->loadRosterCsv((char*)txtFile, result);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
CLEANUP:
	return ret;
}

int CrewDataContext::saveDataToHttpServer(const char * filepath, string restfulApi) {

	int ret = 0;
	int postLen = 0;
	char msg[1024] = { 0 };
	char * postBuf = NULL;
	string url = this->configDataSourceUrl + restfulApi; //defaul "/api/orengine/ro/solution";
	string username = ""; 
	const char * gzFile = "ro_output.gz";
	const char * resFile = "ro_output_response.txt";// "ro_input.txt";
	const char * contentType = "application/octet-stream";
	Logger::getRuleLogger()->info("saveDataToHttpServer\n");
	//压缩 gz
	ret = compressFile(filepath, gzFile, 6);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//读取 gz文件
	ret = readFileWithAlloc(gzFile, &postBuf, &postLen);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}

	//username = (!this->username.empty()) ? this->username : this->scenario.idUser;
	//ret = loginAsUserFromHttpServer(username);
	//if (ret != SUCCESS) {
	//	Logger::getRuleLogger()->warn("WARN: loginAsUser '{}' faild", username.c_str());
	//}

	//http请求
	ret = sendHttpReq(url, this->httpAuthToken, contentType, postBuf, postLen, resFile);

CLEANUP:
	if (postBuf) free(postBuf); postBuf = NULL;
	return ret;
}


int CrewDataContext::saveToDataToHttpServer(const char *filepath, string restfulApi) {
	int ret = 0;
	int postLen = 0;
	char msg[1024] = { 0 };
	char * postBuf = NULL;
	string url = this->configDataSourceUrl + restfulApi; //defaul "/api/orengine/ro/solution";
	string username = "";
	const char * gzFile = "to_output.gz";
	const char * resFile = "to_output_response.txt";// "ro_input.txt";
	const char * contentType = "application/octet-stream";
	Logger::getRuleLogger()->info("saveToDataToHttpServer\n");
	//压缩 gz
	ret = compressFile(filepath, gzFile, 6);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//读取 gz文件
	ret = readFileWithAlloc(gzFile, &postBuf, &postLen);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}

	//username = (!this->username.empty()) ? this->username : this->scenario.idUser;
	//ret = loginAsUserFromHttpServer(username);
	//if (ret != SUCCESS) {
	//	Logger::getRuleLogger()->warn("WARN: loginAsUser '{}' faild", username.c_str());
	//}

	//http请求
	ret = sendHttpReq(url, this->httpAuthToken, contentType, postBuf, postLen, resFile);

	CLEANUP:
	if (postBuf) free(postBuf); postBuf = NULL;
	return ret;
}

int CrewDataContext::updateScenStatusByHttp(long long scenarioId, string status) {

	int ret = 0;
	int postLen = 0;
	stringstream ss;
	string url = configDataSourceUrl + "/api/scenario/status/update";
	const char * gzFile = "ro_output.gz";
	const char * resFile = "ro_output_updateScenStatus.txt";// "ro_input.txt";
	const char * contentType = "application/json";
	char outputbuf[1024] = { 0 };
	int outputLen = sizeof(outputbuf);
	
	ss << "{\"scenarioId\":" << scenarioId;
	ss << ",\"status\":\"" << status << "\"}";
	postLen = (int)ss.str().length();
	cout << "PARAM: " << ss.str() << endl;
	//http请求
	ret = sendHttpReq2(url, this->httpAuthToken, contentType, (char*)ss.str().c_str(), postLen, outputbuf, outputLen);
	if (ret != 0) {
		Logger::getRuleLogger()->info("updateScenarioStatus, fail {}", ret);
		goto CLEANUP;
	}
	else if (outputLen != 0) {
		Logger::getRuleLogger()->info("updateScenarioStatus, fail {}", outputbuf);
		goto CLEANUP;
	}
	else {
		Logger::getRuleLogger()->info("SUCCESS");
	}
CLEANUP:
	return ret;
}

int CrewDataContext::loadScenarioCategory(long long scenarioId, char* categoryBuf) {
	int ret = 0;
	int postLen = 0;
	rapidjson::Document document;
	stringstream ss;
	string url = configDataSourceUrl + "/api/workset/get";
	const char * contentType = "application/json";
	char outputbuf[1024] = { 0 };
	int outputLen = sizeof(outputbuf);

	ss << "" << scenarioId << "";
	postLen = (int)ss.str().length();
	std::cout << "PARAM: " << ss.str() << endl;
	//http请求
	ret = sendHttpReq2(url, this->httpAuthToken, contentType, (char*)ss.str().c_str(), postLen, outputbuf, outputLen);
	if (ret != 0) {
		Logger::getRuleLogger()->info("loadScenarioItem, fail {}", ret);
		goto CLEANUP;
	}
	else {
		Logger::getRuleLogger()->info("SUCCESS");
	}
	document.Parse<0>(outputbuf);
	if (document.HasMember("category")) 
		strncpy(categoryBuf, document["category"].GetString(), 2);
	else {
		Logger::getRuleLogger()->error("ERROR: invalid json, field 'category' not found, /api/workset/get, {}", outputbuf);
		ret = ERR_JSON;
		goto CLEANUP;
	}
CLEANUP:
	return ret;
}