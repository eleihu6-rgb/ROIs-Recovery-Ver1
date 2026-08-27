#include <string>
#include <sstream>
#include <algorithm>

#include "JsonPairing.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

struct stJsonRouteActualRest {
	string op;
	SharedPtr<RouteActualRest> item;
};

int parseJson_RouteActualRestLists(rapidjson::Value &document, vector<SharedPtr<RouteActualRest>> &addList, vector<SharedPtr<RouteActualRest>> &updateList, vector<SharedPtr<RouteActualRest>> &delList);
int parseJson_RouteActualRestList(rapidjson::Value &document, vector<SharedPtr<RouteActualRest>>& outputList);
SharedPtr<RouteActualRest> parseJson_RouteActualRest(Value& jsonItem);

int readFile_RouteActualRestList(const char * filepath, rapidjson::Document &document, vector<SharedPtr<RouteActualRest>> &addList, vector<SharedPtr<RouteActualRest>> &updateList, vector<SharedPtr<RouteActualRest>> &delList)
{
	int ret = 0;
	int index = 0;
	//参数检查
	if (!filepath) {
		Logger::getRuleLogger()->error( "ERROR: read json fail, filepath is NULL");
		return ERR_JSON_PARAM;
	}

	FILE * pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		Logger::getRuleLogger()->error( "ERROR: read json fail, Input file invalid: not exist or open failed '{}'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	//Document document;

	document.ParseStream<0>(is);
	fclose(pFile);

	//读取Pairing
	ret = parseJson_RouteActualRestLists(document, addList, updateList,delList);
	return ret;
}

int parseJson_RouteActualRestLists(rapidjson::Value &document, vector<SharedPtr<RouteActualRest>> &addList, vector<SharedPtr<RouteActualRest>> &updateList, vector<SharedPtr<RouteActualRest>> &delList) {
	int ret = 0;
	if (document.HasMember("Add")) {
		ret = parseJson_RouteActualRestList(document["Add"], addList);
	}
	if (document.HasMember("Delete")) {
		ret = parseJson_RouteActualRestList(document["Delete"], delList);
	}
	if (document.HasMember("Update")) {
		ret = parseJson_RouteActualRestList(document["Update"], updateList);
	}

	return ret;
}

int parseJson_RouteActualRestList(rapidjson::Value &value, vector<SharedPtr<RouteActualRest>>& outputList) {
	if (!value.IsArray()) {
		Logger::getRuleLogger()->error("ERROR: invalid json, not a array");
		return ERR_JSON;
	}
	for (SizeType i = 0; i < value.Size(); i++) {
		Value &jsonItem = value[i];
		SharedPtr<RouteActualRest> item = parseJson_RouteActualRest(jsonItem);
		if (item) {
			outputList.push_back(item);
		}
	}
	return 0;
}

SharedPtr<RouteActualRest> parseJson_RouteActualRest(Value& jsonItem) {
	SharedPtr<RouteActualRest> item(new RouteActualRest());

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("airline")) item->airline = string(jsonItem["airline"].GetString());
	if (jsonItem.HasMember("fltNum")) item->fltNum = string(jsonItem["fltNum"].GetString());
	if (jsonItem.HasMember("depArp")) item->depArp = string(jsonItem["depArp"].GetString());
	if (jsonItem.HasMember("arvArp")) item->arvArp = string(jsonItem["arvArp"].GetString());
	if (jsonItem.HasMember("crewId")) item->crewId = string(jsonItem["crewId"].GetString());
	if (jsonItem.HasMember("restTime")) item->restTime = jsonItem["restTime"].GetInt();
	if (jsonItem.HasMember("schDepDtLoc")) {
		if (jsonItem["schDepDtLoc"].IsString())
			item->schDepDtLoc = utcStrToUtc((char*)jsonItem["schDepDtLoc"].GetString());
		else
			item->schDepDtLoc = jsonItem["schDepDtLoc"].GetInt64();
	}
	if (jsonItem.HasMember("schArvDtLoc")) {
		if (jsonItem["schArvDtLoc"].IsString())
			item->schArvDtLoc = utcStrToUtc((char*)jsonItem["schArvDtLoc"].GetString());
		else
			item->schArvDtLoc = jsonItem["schArvDtLoc"].GetInt64();
	}
	return item;
}