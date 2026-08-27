#include <string>
#include <sstream>
#include <algorithm>

#include "JsonPairing.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

struct stJsonCrewEntitlement {
	string op;
	SharedPtr<CREW_ENTITLEMENT> item;
};

int parseJson_CrewEntitlementLists(rapidjson::Value &document, vector<SharedPtr<CREW_ENTITLEMENT>> &addList, vector<SharedPtr<CREW_ENTITLEMENT>> &updateList, vector<SharedPtr<CREW_ENTITLEMENT>> &delList);
int parseJson_CrewEntitlementList(rapidjson::Value &document, vector<SharedPtr<CREW_ENTITLEMENT>>& outputList);
SharedPtr<CREW_ENTITLEMENT> parseJson_CrewEntitlement(Value& jsonItem);

int readFile_CrewEntitlementList(const char * filepath, rapidjson::Document &document, vector<SharedPtr<CREW_ENTITLEMENT>> &addList, vector<SharedPtr<CREW_ENTITLEMENT>> &updateList, vector<SharedPtr<CREW_ENTITLEMENT>> &delList)
{
	int ret = 0;
	int index = 0;
	//参数检查
	if (!filepath) {
		Logger::getRuleLogger()->error("ERROR: read json fail, filepath is NULL");
		return ERR_JSON_PARAM;
	}

	FILE * pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		Logger::getRuleLogger()->error("ERROR: read json fail, Input file invalid: not exist or open failed '{}'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	//Document document;

	document.ParseStream<0>(is);
	fclose(pFile);

	//读取Pairing
	ret = parseJson_CrewEntitlementLists(document, addList, updateList, delList);
	return ret;
}

int parseJson_CrewEntitlementLists(rapidjson::Value &document, vector<SharedPtr<CREW_ENTITLEMENT>> &addList, vector<SharedPtr<CREW_ENTITLEMENT>> &updateList, vector<SharedPtr<CREW_ENTITLEMENT>> &delList) {
	int ret = 0;
	if (document.HasMember("Add")) {
		ret = parseJson_CrewEntitlementList(document["Add"], addList);
	}
	if (document.HasMember("Delete")) {
		ret = parseJson_CrewEntitlementList(document["Delete"], delList);
	}
	if (document.HasMember("Update")) {
		ret = parseJson_CrewEntitlementList(document["Update"], updateList);
	}

	return ret;
}

int parseJson_CrewEntitlementList(rapidjson::Value &value, vector<SharedPtr<CREW_ENTITLEMENT>>& outputList) {
	if (!value.IsArray()) {
		Logger::getRuleLogger()->error("ERROR: invalid json, not a array");
		return ERR_JSON;
	}
	for (SizeType i = 0; i < value.Size(); i++) {
		Value &jsonItem = value[i];
		SharedPtr<CREW_ENTITLEMENT> item = parseJson_CrewEntitlement(jsonItem);
		if (item) {
			outputList.push_back(item);
		}
	}
	return 0;
}

#define PARSE_JASON_INT(value) value.IsString() ? atoi(value.GetString()) : value.GetInt()
#define PARSE_JASON_DOUBLE(value) value.IsString() ? atof(value.GetString()) : value.GetDouble()
SharedPtr<CREW_ENTITLEMENT> parseJson_CrewEntitlement(Value& jsonItem) {
	SharedPtr<CREW_ENTITLEMENT> item(new CREW_ENTITLEMENT());

	if (jsonItem.HasMember("crewId")) item->crewId = string(jsonItem["crewId"].GetString());
	if (jsonItem.HasMember("airline")) item->airline = string(jsonItem["airline"].GetString());
	if (jsonItem.HasMember("entitlementType")) item->type = string(jsonItem["entitlementType"].GetString());
	if (jsonItem.HasMember("entitlementYear")) item->year = PARSE_JASON_INT(jsonItem["entitlementYear"]);
	if (jsonItem.HasMember("entitlement")) item->entitlement = PARSE_JASON_DOUBLE(jsonItem["entitlement"]);
	if (jsonItem.HasMember("used")) item->used = PARSE_JASON_DOUBLE(jsonItem["used"]);

	//自适应 timestamp/ yyyy-MM-dd
	if (jsonItem.HasMember("effDt")) {
		if (jsonItem["effDt"].IsString())
			item->effDt = utcStrToUtc((char*)jsonItem["effDt"].GetString());
		else
			item->effDt = jsonItem["effDt"].GetInt64();
	}
	if (jsonItem.HasMember("expDt")) {
		if (jsonItem["expDt"].IsString())
			item->expDt = utcStrToUtc((char*)jsonItem["expDt"].GetString());
		else
			item->expDt = jsonItem["expDt"].GetInt64();
	}
	return item;
}