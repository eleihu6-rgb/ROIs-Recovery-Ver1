
#include "mongoose.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "OrLog.h"
#include "Log/Logger.h"
#include "CompressUtil.h"
#include "httpUtil.h"

int CrewDataContext::loadDataPoFromHttpServer(long long scenarioId) {
	return loadDataPoFromHttpServer(scenarioId, "po_input.txt");
}

int CrewDataContext::loadDataPoFromHttpServer(long long scenarioId, const char * txtFilepath) {
	int ret = 0;
	char postBuf[1024] = { 0 };
	string url = this->configDataSourceUrl + "/api/orengine/po/comptxt";
	const char * contentType = "application/json";
	const char * txtFile = (txtFilepath != NULL && txtFilepath[0] != '\0') ? txtFilepath : "po_input.txt";
	string gzFile = string(txtFile) + ".gz";
	int postLen = 0;

	postLen = snprintf(postBuf, sizeof(postBuf), "%lld", scenarioId);
	//http
	ret = sendHttpReq(url, this->httpAuthToken, contentType, postBuf, postLen, gzFile.c_str());
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	//解压缩
	ret = decompressFile(gzFile.c_str(), txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
	ret = this->loadDataPoCsv((char*)txtFile);
	if (ret != SUCCESS) {
		goto CLEANUP;
	}
CLEANUP:
	return ret;
}


int CrewDataContext::saveDataPoToHttpServer(char * filepath) {

	int ret = 0;
	int postLen = 0;
	char * postBuf = NULL;
	string url = this->configDataSourceUrl + "/api/orengine/po/solution";
	const char * gzFile = "po_output.gz";
	const char * resFile = "po_output_server_response.txt";// "ro_input.txt";
	const char * contentType = "application/octet-stream";

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
	//20180703 ain, mantis#3111, save前切换username
	//username = (!this->username.empty()) ? this->username : this->scenario.idUser;
	//Logger::getRuleLogger()->info("login: {}", username.c_str());
	//ret = loginAsUserFromHttpServer(username);
	//if (ret != SUCCESS) {
	//	Logger::getRuleLogger()->warn("WARN: loginAsUser '{}' faild", username.c_str());
	//}

	//http请求
	ret = sendHttpReq(url, this->httpAuthToken, contentType, postBuf, postLen, resFile);
CLEANUP:
	if (0 != ret) {
		Logger::getRuleLogger()->error("ERROR: saveToHttpServer fail {}", ret);
	}
	if (postBuf) free(postBuf); postBuf = NULL;
	return ret;
}
