#include <string>
#include <sstream>
#include <algorithm>

#include "JsonPairing.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

int parseJson_CrewPreferenceLists(rapidjson::Value &document, vector<SharedPtr<CREW_PREFERENCE>> &addList, vector<SharedPtr<CREW_PREFERENCE>> &updateList, vector<SharedPtr<CREW_PREFERENCE>> &delList);
int parseJson_CrewPreferenceList(rapidjson::Value &document, vector<SharedPtr<CREW_PREFERENCE>>& outputList);
SharedPtr<CREW_PREFERENCE> parseJson_CrewPreference(Value& jsonItem);


int readFile_CrewPreferenceList(const char * filepath, rapidjson::Document &document, vector<SharedPtr<CREW_PREFERENCE>> &addList, vector<SharedPtr<CREW_PREFERENCE>> &updateList, vector<SharedPtr<CREW_PREFERENCE>> &delList)
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
	ret = parseJson_CrewPreferenceLists(document, addList, updateList, delList);
	return ret;
}
int parseJson_CrewPreferenceLists(rapidjson::Value &document, vector<SharedPtr<CREW_PREFERENCE>> &addList, vector<SharedPtr<CREW_PREFERENCE>> &updateList, vector<SharedPtr<CREW_PREFERENCE>> &delList) {
	int ret = 0;
	if (document.HasMember("Add")) {
		ret = parseJson_CrewPreferenceList(document["Add"], addList);
	}
	if (document.HasMember("Delete")) {
		ret = parseJson_CrewPreferenceList(document["Delete"], delList);
	}
	if (document.HasMember("Update")) {
		ret = parseJson_CrewPreferenceList(document["Update"], updateList);
	}

	return ret;
}

int parseJson_CrewPreferenceList(rapidjson::Value &value, vector<SharedPtr<CREW_PREFERENCE>>& outputList) {
	if (!value.IsArray()) {
		Logger::getRuleLogger()->error("ERROR: invalid json, not a array");
		return ERR_JSON;
	}
	for (SizeType i = 0; i < value.Size(); i++) {
		Value &jsonItem = value[i];
		SharedPtr<CREW_PREFERENCE> item = parseJson_CrewPreference(jsonItem);
		if (item) {
			outputList.push_back(item);
		}
	}
	return 0;
}


time_t PARSE_JASON_TIME(Value& jsonItem) {
	if (jsonItem.IsString())
		return utcStrToUtc((char*)jsonItem.GetString());
	else
		return jsonItem.GetInt64();
}

bool PARSE_JASON_BOOL(Value& jsonItem) {
	if (jsonItem.IsString()) {
		string str = strToUpper(jsonItem.GetString());
		return str == "Y" || str == "TRUE" || str == "1";
	}		
	else
		return jsonItem.GetBool();
}

#define PARSE_JASON_INT(value) value.IsString() ? atoi(value.GetString()) : value.GetInt()
#define PARSE_JASON_BIGINT(value) value.IsString() ? atoll(value.GetString()) : value.GetInt64()
#define PARSE_JASON_DOUBLE(value) value.IsString() ? atof(value.GetString()) : value.GetDouble()
SharedPtr<CREW_PREFERENCE> parseJson_CrewPreference(Value& jsonItem) {
	SharedPtr<CREW_PREFERENCE> item(new CREW_PREFERENCE());

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("crewId")) item->idCrew = string(jsonItem["crewId"].GetString());
	if (jsonItem.HasMember("prefType")) item->prefType = string(jsonItem["prefType"].GetString());
	if (jsonItem.HasMember("pref")) item->pref = string(jsonItem["pref"].GetString());
	if (jsonItem.HasMember("point")) item->point = PARSE_JASON_INT(jsonItem["point"]);
	if (jsonItem.HasMember("assignment")) item->assignment = string(jsonItem["assignment"].GetString());
	if (jsonItem.HasMember("strDtLoc")) item->strDtloc = PARSE_JASON_TIME(jsonItem["strDtLoc"]);
	if (jsonItem.HasMember("endDtLoc")) item->endDtLoc = PARSE_JASON_TIME(jsonItem["endDtLoc"]);
	if (jsonItem.HasMember("rosterId")) item->rosterId = PARSE_JASON_BIGINT(jsonItem["rosterId"]);
	if (jsonItem.HasMember("rosterTradeId")) item->rosterIdTrade = PARSE_JASON_BIGINT(jsonItem["rosterTradeId"]);
	if (jsonItem.HasMember("pairingId")) item->pairingId = PARSE_JASON_BIGINT(jsonItem["pairingId"]);
	if (jsonItem.HasMember("label")) item->label = string(jsonItem["label"].GetString());
	if (jsonItem.HasMember("attribute")) item->attribute = string(jsonItem["attribute"].GetString());
	if (jsonItem.HasMember("priority")) item->priority = PARSE_JASON_INT(jsonItem["priority"]);
	if (jsonItem.HasMember("status")) item->status = string(jsonItem["status"].GetString());
	if (jsonItem.HasMember("denialReason")) item->denialReason = string(jsonItem["denialReason"].GetString());
	if (jsonItem.HasMember("denialComments")) item->denialComment = string(jsonItem["denialComments"].GetString());
	if (jsonItem.HasMember("expDt")) item->expiryDt = PARSE_JASON_TIME(jsonItem["expDt"]);
	if (jsonItem.HasMember("lastReviewDt")) item->lastReviewDt = PARSE_JASON_TIME(jsonItem["lastReviewDt"]);
	if (jsonItem.HasMember("remark")) item->remark = string(jsonItem["remark"].GetString());
	if (jsonItem.HasMember("createdBy")) item->createBy = string(jsonItem["createdBy"].GetString());
	if (jsonItem.HasMember("creationDt")) item->createDt = PARSE_JASON_TIME(jsonItem["creationDt"]);
	if (jsonItem.HasMember("transactionId")) item->transactionId = PARSE_JASON_BIGINT(jsonItem["transactionId"]);
	if (jsonItem.HasMember("reason")) item->reason = string(jsonItem["reason"].GetString());
	//if (jsonItem.HasMember("leaveOrAbsenceCode")) item->leaveOrAbsenceCode = string(jsonItem["leaveOrAbsenceCode"].GetString());
	if (jsonItem.HasMember("outstanding")) item->outstanding = PARSE_JASON_INT(jsonItem["outstanding"]);
	if (jsonItem.HasMember("leavedays")) item->leavedays = PARSE_JASON_INT(jsonItem["leavedays"]);
	if (jsonItem.HasMember("granted")) item->granted = PARSE_JASON_INT(jsonItem["granted"]);
	if (jsonItem.HasMember("workdays")) item->workdays = PARSE_JASON_INT(jsonItem["workdays"]);

	//20190902 ain,mantis#6580, crewPreference.replaceOverlap解析按 bool
	if (jsonItem.HasMember("ver")) item->ver = PARSE_JASON_INT(jsonItem["ver"]);
	if (jsonItem.HasMember("qualifier")) item->qualifier = string(jsonItem["qualifier"].GetString());
	if (jsonItem.HasMember("replaceOverlap")) item->replaceOverlap = PARSE_JASON_BOOL(jsonItem["replaceOverlap"]);
	if (jsonItem.HasMember("isPublished")) item->isPublished = PARSE_JASON_BOOL(jsonItem["isPublished"]);
	if (jsonItem.HasMember("publishedDt")) item->publishedDt = PARSE_JASON_TIME(jsonItem["publishedDt"]);
	if (jsonItem.HasMember("changeStatus")) item->changeStatus = PARSE_JASON_INT(jsonItem["changeStatus"]);
	if (jsonItem.HasMember("sort")) item->sort = PARSE_JASON_INT(jsonItem["sort"]);
	if (jsonItem.HasMember("actingRank")) item->actingRank = string(jsonItem["actingRank"].GetString());


	if (jsonItem.HasMember("relatedCrewIds")) split(jsonItem["relatedCrewIds"].GetString(), ',', item->relatedCrewIds);
	return item;
}