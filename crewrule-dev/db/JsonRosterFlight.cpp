#include <string>
#include <sstream>
#include <algorithm>

#include "JsonPairing.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

int parseJson_RosterFlightLists(rapidjson::Value &document, vector<SharedPtr<RosterFlight>> &addList, vector<SharedPtr<RosterFlight>> &updateList, vector<SharedPtr<RosterFlight>> &delList);
int parseJson_RosterFlightList(rapidjson::Value &document, vector<SharedPtr<RosterFlight>>& outputList);
SharedPtr<RosterFlight> parseJson_RosterFlight(Value& jsonItem);

int readFile_RosterFlightList(const char * filepath, rapidjson::Document &document, vector<SharedPtr<RosterFlight>> &addList, vector<SharedPtr<RosterFlight>> &updateList, vector<SharedPtr<RosterFlight>> &delList)
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
	ret = parseJson_RosterFlightLists(document, addList, updateList, delList);
	return ret;
}

int parseJson_RosterFlightLists(rapidjson::Value &document, vector<SharedPtr<RosterFlight>> &addList, vector<SharedPtr<RosterFlight>> &updateList, vector<SharedPtr<RosterFlight>> &delList) {
	int ret = 0;
	if (document.HasMember("Add")) {
		ret = parseJson_RosterFlightList(document["Add"], addList);
	}
	if (document.HasMember("Delete")) {
		ret = parseJson_RosterFlightList(document["Delete"], delList);
	}
	if (document.HasMember("Update")) {
		ret = parseJson_RosterFlightList(document["Update"], updateList);
	}

	return ret;
}

int parseJson_RosterFlightList(rapidjson::Value &value, vector<SharedPtr<RosterFlight>>& outputList) {
	if (!value.IsArray()) {
		Logger::getRuleLogger()->error("ERROR: invalid json, not a array");
		return ERR_JSON;
	}
	for (SizeType i = 0; i < value.Size(); i++) {
		Value &jsonItem = value[i];
		SharedPtr<RosterFlight> item = parseJson_RosterFlight(jsonItem);
		if (item) {
			outputList.push_back(item);
		}
	}
	return 0;
}

void parseFieldTime(time_t& field, Value& json, const char* fieldName) {

	if (json.HasMember(fieldName)) {
		if (json[fieldName].IsString())
			field = utcStrToUtc((char*)json[fieldName].GetString());
		else
			field = json[fieldName].GetInt64();
	}
}

#define PARSE_JASON_INT(value) value.IsString() ? atoi(value.GetString()) : value.GetInt()
#define PARSE_JASON_DOUBLE(value) value.IsString() ? atof(value.GetString()) : value.GetDouble()
SharedPtr<RosterFlight> parseJson_RosterFlight(Value& jsonItem) {
	SharedPtr<RosterFlight> item(new RosterFlight());

	if (jsonItem.HasMember("fltId")) item->fltId = jsonItem["fltId"].GetInt64();
	if (jsonItem.HasMember("crewId")) item->crewId = string(jsonItem["crewId"].GetString());
	if (jsonItem.HasMember("seqOrder")) item->seqOrder = jsonItem["seqOrder"].GetInt();
	if (jsonItem.HasMember("fltDt")) item->fltDt = string(jsonItem["fltDt"].GetString());
	if (jsonItem.HasMember("division")) item->division = string(jsonItem["division"].GetString());
	if (jsonItem.HasMember("actingRank")) item->actingRank = string(jsonItem["actingRank"].GetString());
	if (jsonItem.HasMember("activeRank")) item->activeRank = string(jsonItem["activeRank"].GetString());
	if (jsonItem.HasMember("checkType")) item->checkType = string(jsonItem["checkType"].GetString());
	if (jsonItem.HasMember("tsFlag")) {
		item->tsFlag = string(jsonItem["tsFlag"].GetString());
		split(item->tsFlag.c_str(), '|', item->tsFlags);
	}
	if (jsonItem.HasMember("source")) item->source = string(jsonItem["source"].GetString());
	if (jsonItem.HasMember("assignment")) item->assignment = string(jsonItem["assignment"].GetString());
	
	if (jsonItem.HasMember("rosterId")) item->rosterId = jsonItem["rosterId"].GetInt64();
	if (jsonItem.HasMember("pairingId")) item->pairingId = jsonItem["pairingId"].GetInt64();
	if (jsonItem.HasMember("dutyId")) item->dutyId = jsonItem["dutyId"].GetInt64();

	if (jsonItem.HasMember("groupId")) item->tmGroupId = string(jsonItem["groupId"].GetString());
	if (jsonItem.HasMember("tmProgramCourseId")) item->tmProgramCourseId = jsonItem["tmProgramCourseId"].GetInt64();
	if (jsonItem.HasMember("resourceCode")) item->tmResourceCode = string(jsonItem["resourceCode"].GetString());
	if (jsonItem.HasMember("role")) item->tmRole = string(jsonItem["role"].GetString());
	if (jsonItem.HasMember("subRole")) item->tmSubRole = string(jsonItem["subRole"].GetString());
	if (jsonItem.HasMember("isExtraCourse")) item->isExtraCourse = (jsonItem["isExtraCourse"].GetInt() == 1);
	if (jsonItem.HasMember("accState")) item->accState = string(jsonItem["accState"].GetString());
	if (jsonItem.HasMember("accTimezone")) item->accTimezone = jsonItem["accTimezone"].GetInt();

	if (jsonItem.HasMember("isAgreeWork")) item->isAgreeWork = jsonItem["isAgreeWork"].GetBool();
	if (jsonItem.HasMember("exceptionCode")) {
		item->exceptionCode = jsonItem["exceptionCode"].GetString();
		if (!item->exceptionCode.empty()) {
			split(item->exceptionCode.c_str(), '|', item->exceptionCodes);
		}
	}

	if (jsonItem.HasMember("schId")) item->scenarioId = (jsonItem["schId"].GetInt64());
	if (jsonItem.HasMember("scenarioId")) item->scenarioId = (jsonItem["scenarioId"].GetInt64());
	if (jsonItem.HasMember("parentTmProgramCourseId")) item->parentTmProgramCourseId = (jsonItem["parentTmProgramCourseId"].GetInt64());
	if (jsonItem.HasMember("position")) item->position = string(jsonItem["position"].GetString());
	if (jsonItem.HasMember("sendFlag")) {}
	if (jsonItem.HasMember("tagSet")) item->tagSet = string(jsonItem["tagSet"].GetString());
	if (jsonItem.HasMember("seqOrderSource")) item->seqOrderSource = string(jsonItem["seqOrderSource"].GetString());
	if (jsonItem.HasMember("courseCode")) item->courseCode = string(jsonItem["courseCode"].GetString());
	if (jsonItem.HasMember("subTmProgramCourseId")) item->subTmProgramCourseId = (jsonItem["subTmProgramCourseId"].GetInt64());
	if (jsonItem.HasMember("subCourseCode")) item->subCourseCode = string(jsonItem["subCourseCode"].GetString());
	if (jsonItem.HasMember("subParentTmProgramCourseId")) item->subParentTmProgramCourseId = (jsonItem["subParentTmProgramCourseId"].GetInt64());
	if (jsonItem.HasMember("actionDtUtc")) {}

	if (jsonItem.HasMember("creditedMinutes")) {
		item->creditedInSec = (int)(jsonItem["creditedMinutes"].GetDouble() * 60);//Credit Hour(实际时间)
	}
	if (jsonItem.HasMember("fmCreditedMinutes")) {
		item->fmCreditedInSec = (int)(jsonItem["fmCreditedMinutes"].GetDouble() * 60);//首月Credit Hour(实际时间)
	}
	if (jsonItem.HasMember("schCreditedMinutes")) {
		item->schCreditedInSec = (int)(jsonItem["schCreditedMinutes"].GetDouble() * 60);//Credit Hour(计划时间)
	}
	if (jsonItem.HasMember("schFmCreditedMinutes")) {
		item->schFmCreditedInSec = (int)(jsonItem["schFmCreditedMinutes"].GetDouble() * 60);//首月Credit Hour(计划时间)
	}

	//自适应 timestamp/ yyyy-MM-dd
	parseFieldTime(item->pickupDtLoc, jsonItem, "pickupDtLoc");
	parseFieldTime(item->firstBriefDtLoc, jsonItem, "firstBriefDtLoc");
	parseFieldTime(item->secondBriefDtLoc, jsonItem, "secondBriefDtLoc");
	parseFieldTime(item->debriefDtLoc, jsonItem, "debriefDtLoc");
	parseFieldTime(item->dropoffDtLoc, jsonItem, "dropoffDtLoc");
	parseFieldTime(item->pairingStartUtc, jsonItem, "pairingStartUtc");
	return item;
}
 
int parseJson_UpdateRosterFlights(rapidjson::Document &document, vector<string>& opList, vector<SharedPtr<RosterFlight>>& itemList) {
	if (!document.IsArray()) {
		Logger::getRuleLogger()->error("ERROR: Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}
	for (SizeType i = 0; i < document.Size(); i++) {
		Value &doc = document[i];
		//20190614 ain, mantis#5985, 解析rosterFlight增加 type==RosterFlight判断
		string activityType = doc.HasMember("activityType") ? string(doc["activityType"].GetString()) : "";
		if (activityType == "RosterFlight") {
			string op = "";
			if (doc.HasMember("operation")) {
				op = string(doc["operation"].GetString());
			}
			//20190821 ain, mantis#6500, rosterFlight解析补齐JSON层级activityItem
			if (doc.HasMember("activityItem")) {
				doc = doc["activityItem"];
			}
			if (op == "" && doc.HasMember("operation")) {
				op = string(doc["operation"].GetString());
			}
			SharedPtr<RosterFlight> item = parseJson_RosterFlight(doc);
			opList.push_back(op);
			itemList.push_back(item);
		}
	}
	return 0;
}

SharedPtr<CrewKpiAdjust> parseJson_RosterFlightKpi(Value& jsonItem) {
	SharedPtr<CrewKpiAdjust> item(new CrewKpiAdjust());

	if (jsonItem.HasMember("id")) item->id = jsonItem["id"].GetInt64();
	if (jsonItem.HasMember("crewId")) item->idCrew = string(jsonItem["crewId"].GetString());
	if (jsonItem.HasMember("rosterFlightId")) item->rosterFlightId = jsonItem["rosterFlightId"].GetInt64();
	if (jsonItem.HasMember("fltId")) item->fltId = jsonItem["fltId"].GetInt64();
	if (jsonItem.HasMember("type")) item->type = jsonItem["type"].GetInt();
	if (jsonItem.HasMember("adjustment")) item->adjustment = jsonItem["adjustment"].GetInt();

	//自适应 timestamp/ yyyy-MM-dd
	parseFieldTime(item->adjustDate, jsonItem, "adjustDate");
	return item;
}

int parseJson_UpdateRosterFlightKpi(rapidjson::Document& document, vector<string>& opList, vector<SharedPtr<CrewKpiAdjust>>& itemList) {
	if (!document.IsArray()) {
		Logger::getRuleLogger()->error("ERROR: Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}
	for (SizeType i = 0; i < document.Size(); i++) {
		Value& doc = document[i];
		string activityType = doc.HasMember("activityType") ? string(doc["activityType"].GetString()) : "";
		if (activityType == "RosterFlightKpi") {
			string op = "";
			if (doc.HasMember("operation")) {
				op = string(doc["operation"].GetString());
			}
			if (doc.HasMember("activityItem")) {
				doc = doc["activityItem"];
			}
			if (op == "" && doc.HasMember("operation")) {
				op = string(doc["operation"].GetString());
			}
			SharedPtr<CrewKpiAdjust> item = parseJson_RosterFlightKpi(doc);
			opList.push_back(op);
			itemList.push_back(item);
		}
	}
	return 0;
}