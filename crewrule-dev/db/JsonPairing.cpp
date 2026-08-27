#include <string>
#include <sstream>
#include <algorithm>
#include <cmath>

#include "JsonPairing.h"
#include "UtilFunc.h"
#include "CrewDBUtil.h"
#include "RuleParams.h"
#include "RuleEngineDef.h"
#include "CrewDataValidation.h"
#include "Log/Logger.h"
#include "Utility.h"

using namespace std;

#if defined(__unix) || defined(__APPLE__)
    #define _snprintf snprintf
#endif

//错误处理：打印错误描述，并返回错误码 ERR_JSON
#define JSON_ERR_HANDLER(success,obj,field) \
	if (!success) {\
		Logger::getRuleLogger()->info("invalid json data, field '{}' of obj '{}' not found or invalid", field, obj);\
		return ERR_JSON;\
	}



//获取最后一次出错时保存的错误信息
static char _lastErrorMsgBuf[2048] = { 0 };
const char * readFile_getLastErrMsg() {
	return _lastErrorMsgBuf;
}

inline static bool compareMandayFd(SharedPtr<CREW_MANDAY_FD>& i, SharedPtr<CREW_MANDAY_FD>& j) { return (i->crewDateUtc < j->crewDateUtc); }
inline static bool compareMandayCc(SharedPtr<CREW_MANDAY_CC_AM>& i, SharedPtr<CREW_MANDAY_CC_AM>& j) { return (i->crewDateUtc < j->crewDateUtc); }

inline static std::string escape_json(const std::string& s) {
	std::string result;
	result.reserve(s.size()); // 预分配空间以提高性能

	for (auto c = s.cbegin(); c != s.cend(); ++c) {
		switch (*c) {
		case '"':
			result += "\\\"";
			break;
		case '\\':
			result += "\\\\";
			break;
		case '\b':
			result += "\\b";
			break;
		case '\f':
			result += "\\f";
			break;
		case '\n':
			result += "\\n";
			break;
		case '\r':
			result += "\\r";
			break;
		case '\t':
			result += "\\t";
			break;
		default:
			if ('\x00' <= *c && *c <= '\x1f') { // 控制字符
				result += "\\u";
				char buf[5];
				sprintf(buf, "%04x", static_cast<unsigned char>(*c));
				result += buf;
			}
			else {
				result += *c;
			}
			break;
		}
	}

	return result;
}


//只读取json到document, 不解析对象
int readFile_Document(const char * filepath, rapidjson::Document &document) {
	int ret = 0;
	int index = 0;
	//参数检查
	if (!filepath) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Param filepath is NULL ");
		return ERR_JSON_PARAM;
	}

	FILE * pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: not exist or open failed '%s'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	document.ParseStream<0>(is);
	fclose(pFile);
	return 0;
}

//***************************************************
//读取 JSON文件，解析 Pairing list
//***************************************************
int readFile_PairingList(const char * filepath, vector<Pairing*> &outputList, rapidjson::Document &document)
{
	int ret = 0;
	int index = 0;
	//参数检查
	if (!filepath) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Param filepath is NULL ");
		return ERR_JSON_PARAM;
	}

	FILE * pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: not exist or open failed '%s'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	//Document document;

	document.ParseStream<0>(is);
	fclose(pFile);

	if (!document.IsArray()) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}


	//数据检查：orders
	ret = checkJson_PairingList(document);
	if (ret != 0) {
		//错误信息_lastErrorMsgBuf在 readFile_checkJson( )内已填充
		Logger::getRuleLogger()->error("[ERROR] [readFile_PairingList] check json failed (PAIRING).");
		return ERR_JSON;
	}

	//读取Pairing
	ret = parseJson_PairingList(document, outputList);
	return ret;
}

//***************************************************
//读取 JSON文件，解析 Roster list
//***************************************************
int readFile_RosterList(const char * filepath, vector<SharedPtr<ROSTER>> &outputList, rapidjson::Document &document) {

	int ret = 0;
	int index = 0;
	//参数检查
	if (!filepath) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Param filepath is NULL ");
		return ERR_JSON_PARAM;
	}

	FILE * pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: not exist or open failed '%s'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	document.ParseStream<0>(is);
	fclose(pFile);

	if (!document.IsArray()) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}


	//数据检查：orders
	ret = checkJson_RosterList(document);
	if (ret != 0) {
		//错误信息_lastErrorMsgBuf在 readFile_checkJson( )内已填充
		Logger::getRuleLogger()->error("[ERROR] [readFile_RosterList] check json failed (ROSTER).");
		return ERR_JSON;
	}

	//读取Pairing
	ret = parseJson_RosterList(document, outputList);
	return ret;
}

int readFile_UpdateList(const char * filepath, rapidjson::Document &document) {

	int ret = 0;
	int index = 0;
	//参数检查
	if (!filepath) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Param filepath is NULL ");
		return ERR_JSON_PARAM;
	}

	FILE * pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: not exist or open failed '%s'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	//Document document;

	document.ParseStream<0>(is);
	fclose(pFile);

	return ret;
}

int readFile_CrewIdList(const char * filepath, vector<string>& crewIdList, rapidjson::Document &document) {

	int ret = 0;
	int index = 0;
	//参数检查
	if (!filepath) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Param filepath is NULL ");
		return ERR_JSON_PARAM;
	}

	FILE * pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: not exist or open failed '%s'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	document.ParseStream<0>(is);
	fclose(pFile);

	if (!document.IsArray()) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}

	for (SizeType i = 0; i < document.Size(); i++) {

		Value &doc = document[i];
		if (!doc.IsString()) {
			_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: item[%d] is not string", (int)i);
			return ERR_JSON;
		}
		crewIdList.push_back(doc.GetString());
	}
	return 0;
}


int readFile_TryPairingOnCrew(const char * filepath, long long& pair_id, vector<string>& crewIdList, vector<long long>& temporaryDelRosterIds, string& rank, rapidjson::Document &document) {
	
	int ret = 0;
	int index = 0;

	//参数检查
	if (!filepath) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Param filepath is NULL ");
		return ERR_JSON_PARAM;
	}

	FILE * pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: not exist or open failed '%s'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	document.ParseStream<0>(is);
	fclose(pFile);

	Value& value = document;

	//pair_id
	if (!value.HasMember("pair_id") ) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Field 'pair_id' not found in json");
		return ERR_JSON;
	}
	if (!value["pair_id"].IsInt64() ) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Field 'pair_id' not found in json");
		return ERR_JSON;
	}
	pair_id = value["pair_id"].GetInt64();

	//crewIdList
	if (!value.HasMember("idcrew")) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Field 'idcrew' not found in json");
		return ERR_JSON;
	}
	if (!value["idcrew"].IsArray()) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}
	
	for (SizeType i = 0; i < value["idcrew"].Size(); i++) {

		Value &doc = value["idcrew"][i];
		if (!doc.IsString()) {
			_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: item[%d] is not string", (int)i);
			return ERR_JSON;
		}
		crewIdList.push_back(doc.GetString());
	}

	//temp_del_rosters_id
	if (value.HasMember("temp_del_rosters_id")) {
		if (!value["temp_del_rosters_id"].IsArray()) {
			_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: content is NOT a json array");
			return ERR_JSON;
		}
	}
	for (SizeType i = 0; i < value["temp_del_rosters_id"].Size(); i++) {

		Value &doc = value["temp_del_rosters_id"][i];
		if (!doc.IsInt64()) {
			_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: item[%d] is not string", (int)i);
			return ERR_JSON;
		}
		temporaryDelRosterIds.push_back(doc.GetInt64());
	}

	if (value.HasMember("actingRank")) {
		rank = value["actingRank"].GetString();
	}
	return 0;
}


int readFile_PairingIdList(const char* filepath, vector<long long>& pairingIds, rapidjson::Document& document) {

	int ret = 0;
	int index = 0;
	//参数检查
	if (!filepath) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Param filepath is NULL ");
		return ERR_JSON_PARAM;
	}

	FILE* pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: not exist or open failed '%s'", filepath);
		return ERR_FILE_FAIL;
	}

	FileStream is(pFile);
	document.ParseStream<0>(is);
	fclose(pFile);

	if (!document.IsArray()) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}

	for (SizeType i = 0; i < document.Size(); i++) {

		Value& doc = document[i];
		if (!doc.IsInt64()) {
			_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: item[%d] is not long long", (int)i);
			return ERR_JSON;
		}
		pairingIds.push_back(doc.GetInt64());
	}
	return 0;
}

int parseJson_UpdateList(rapidjson::Document &document, vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<bool>& recalCompositionFlagList, vector<UpdatePairingDutyNode>& updatePairingDutyNodeList, vector<SharedPtr<UpdateActivityIdItem>>& updateIdList, vector<shared_ptr<FatigueResult>>& updateFatigueResult) {
	vector<long long> transactionIdList;
	int ret = parseJson_UpdateList(document, transactionIdList, opList, itemList, recalCompositionFlagList, updatePairingDutyNodeList, updateIdList, updateFatigueResult);
	return ret;
}

//opList:       更新操作类型(Add, Del, Update, Update_id)
//itemList:     与opList对应，更新数据内容
//updateIdList: 针对 UPDATE_ID操作，保存新旧id对应关系
int parseJson_UpdateList(rapidjson::Document &document, vector<long long>& transactionIdList, vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<bool>& recalCompositionFlagList, vector<UpdatePairingDutyNode>& updatePairingDutyNodeList, vector<SharedPtr<UpdateActivityIdItem>>& updateIdList, vector<shared_ptr<FatigueResult>>& updateFatigueResult) {
	int ret = 0;

	if (!document.IsArray()) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: content is NOT a json array");
		return ERR_JSON;
	}

	//数据检查
	ret = checkJson_UpdateList(document);
	if (ret != 0) {
		//错误信息_lastErrorMsgBuf在 readFile_checkJson( )内已填充
		return ERR_JSON;
	}

	//读取、解析、并填充 add/del/update/update_id列表
	for (SizeType i = 0; i < document.Size(); i++) {
		long long transactionId = -1;
		Value &doc = document[i];
		if (doc.HasMember("transactionId")) {
			transactionId = doc["transactionId"].GetInt64();
			transactionIdList.push_back(transactionId);
		}
		string activityType = doc["activityType"].GetString();
		string operation = doc["operation"].GetString();
		std::transform(activityType.begin(), activityType.end(), activityType.begin(), ::toupper);
		std::transform(operation.begin(), operation.end(), operation.begin(), ::toupper);


		if (operation == "UPDATE_ID") {
			if (activityType == "DUTY") {
				SharedPtr<UpdateActivityDutyIdItem> item = std::make_shared<UpdateActivityDutyIdItem>();
				item->type = activityType;
				item->oldId = doc["oldId"].GetInt64();
				item->newId = doc["newId"].GetInt64();
				item->oldPairingId = doc.HasMember("oldPairingId") ? doc["oldPairingId"].GetInt64() : 0;
				item->newPairingId = doc.HasMember("newPairingId") ? doc["newPairingId"].GetInt64() : 0;
				updateIdList.push_back(item);
			}
			else if (activityType == "ROSTER") {
				SharedPtr<UpdateActivityIdItem> item = std::make_shared<UpdateActivityIdItem>();
				item->type = activityType;
				item->crewId = doc.HasMember("crewId") ? doc["crewId"].GetString() : "";
				item->oldId = doc["oldId"].GetInt64();
				item->newId = doc["newId"].GetInt64();
				updateIdList.push_back(item);
			}
			else {
				SharedPtr<UpdateActivityIdItem> item = std::make_shared<UpdateActivityIdItem>();
				item->type = activityType;
				item->oldId = doc["oldId"].GetInt64();
				item->newId = doc["newId"].GetInt64();
				updateIdList.push_back(item);
			}
		}
		else if (operation == "UPDATECOMP") {
			Pairing* item = parseJson_Pairing(doc["activityItem"]);
			itemList.push_back(shared_ptr<Pairing>(item));
			opList.push_back(operation);
			recalCompositionFlagList.push_back(true);
		}
		else {
			if (activityType == "ROSTER") {
				SharedPtr<ROSTER> item = parseJson_Roster(doc["activityItem"]);
				itemList.push_back(item);
				opList.push_back(operation);
				recalCompositionFlagList.push_back(true);
			}
			else if (activityType == "PAIRING") {
				Pairing* item = parseJson_Pairing(doc["activityItem"], updatePairingDutyNodeList);
				bool recalCompositionFlag = parseJson_calcComposition(doc["activityItem"]);
				itemList.push_back(shared_ptr<Pairing>(item));
				opList.push_back(operation);
				recalCompositionFlagList.push_back(recalCompositionFlag);
			}
			else if (activityType == "FLIGHT") {
				Segment* item = parseJson_Segment(doc["activityItem"]);
				itemList.push_back(shared_ptr<Segment>(item));
				opList.push_back(operation);
				recalCompositionFlagList.push_back(true);
			}
			else if (activityType == "FATIGUERESULT") {
				shared_ptr<FatigueResult> item = parseJson_FatigueResult(doc["activityItem"]);
				updateFatigueResult.push_back(item);
			}
		}
	}
	return ret;

}

extern void addIntField(Value& obj, const char* fieldName, int value, Document::AllocatorType& alloc);

string formatStrArray(vector<string> arr)
{
	stringstream ss;
	ss << "[";
	for (vector<string>::iterator it = arr.begin(); it != arr.end(); it++) {
		if (it != arr.begin())
			ss << ",";
		ss << "\"" << (*it) << "\"";
	}
	ss << "]";
	return ss.str();

}

//将 map< 'FO':1, 'SO':2 >数据转解析为string
string formatStrIntMap(const map<string, int> &m) {
	stringstream ss;
	ss << "{";
	for (auto it = m.begin(); it != m.end(); it++) {
		if (it != m.begin())
			ss << ",";
		ss << "\"" << it->first << "\":" << it->second;
	}
	ss << "}";
	return ss.str();
}

static map<string, int> getCompositionRankValues(CrewDataContext* dbData, const MinimalLegalComplementRef& ref) {
	map<string, int> rankValues;
	if (dbData == nullptr || ref.compositionId == 0) {
		return rankValues;
	}
	auto optionMapIt = dbData->compositionRankOptionMap.find(ref.compositionId);
	if (optionMapIt != dbData->compositionRankOptionMap.end()) {
		auto optionIt = optionMapIt->second.find(ref.optionId);
		if (optionIt != optionMapIt->second.end()) {
			const composition_rank& compositionRank = optionIt->second;
			for (int i = 0; i < compositionRank.rankCount; ++i) {
				string rank = compositionRank.rankValue[i].rank;
				if (!rank.empty()) {
					rankValues[rank] = compositionRank.rankValue[i].plan_value;
				}
			}
			return rankValues;
		}
	}

	auto rankIt = dbData->compositionRankMap.find(ref.compositionId);
	if (rankIt != dbData->compositionRankMap.end()) {
		const composition_rank& compositionRank = rankIt->second;
		for (int i = 0; i < compositionRank.rankCount; ++i) {
			string rank = compositionRank.rankValue[i].rank;
			if (!rank.empty()) {
				rankValues[rank] = compositionRank.rankValue[i].plan_value;
			}
		}
	}
	return rankValues;
}

static string getCompositionName(CrewDataContext* dbData, long long compositionId) {
	if (dbData == nullptr || compositionId == 0) {
		return "";
	}
	for (auto& composition : dbData->compositionList) {
		if (composition.getCompositionId() == compositionId) {
			return composition.getName();
		}
	}
	return "";
}

static void formatMinimumLegalComplement(ostream& ss, const MinimalLegalComplementRef& ref, CrewDataContext* dbData, const string& lineStart) {
	ss << "{\n";
	ss << lineStart << "\t" << "\"compositionId\":" << ref.compositionId << ",\n";
	ss << lineStart << "\t" << "\"optionId\":" << ref.optionId << ",\n";
	ss << lineStart << "\t" << "\"compositionName\":\"" << getCompositionName(dbData, ref.compositionId) << "\",\n";
	ss << lineStart << "\t" << "\"from8091\":" << (ref.from8091 ? "true" : "false") << ",\n";
	ss << lineStart << "\t" << "\"rankValueMap\":" << formatStrIntMap(getCompositionRankValues(dbData, ref)) << "\n";
	ss << lineStart << "}";
}

//**************************************************************
//将单个Pairing对象转为json格式
//@param ss output, json结果输出stream
//@param p  input, pairing对象
//@param lineStart input, 行首空格，用于与其他json级联时格式化缩进
//**************************************************************
void formatToJson_Pairing(ostream &ss, Pairing* p, string lineStart, vector<RULE_VIOLATION*>& violations, CrewDataContext* dbData) {

	if (p == NULL) {
		return;
	}

	char tmp[100] = { 0 };
	ss << lineStart << "{" << "\n";
	ss << lineStart << "\t" << "\"type\":2,\n";
	ss << lineStart << "\t" << "\"id\":" << p->getDbId() << "," << "\n";
	ss << lineStart << "\t" << "\"scenarioId\":\"" << p->getScenarioId() << "\"," << "\n";          //str
	ss << lineStart << "\t" << "\"messageType\":\"" << "OUTBOND" << "\"," << "\n";          //str
	ss << lineStart << "\t" << "\"processingStatus\":\"" << "PROCESSED" << "\"," << "\n";          //str

	ss << lineStart << "\t" << "\"violations\":";
	formatToJson_violations(ss, violations, NULL);
	ss << lineStart << "\t" << ",\n";

	formatJson_printTime(ss, lineStart + "\t", p);

	ss << lineStart << "\t" << "\"endTimeIncludesRestInUTC\":" << p->getEndTimeIncludingRestUtcSch() << "," << "\n";        //int
	ss << lineStart << "\t" << "\"startTimeInUTCStr\":\"" << utcToUtcString(p->getStartTimeUtc()) << ":\"," << "\n";                      //int
	ss << lineStart << "\t" << "\"baseAirport\":\"" << p->getBase() << "\"," << "\n";               //str

	ss << lineStart << "\t" << "\"flightDutyPeriod\":" << p->getFDPInSec() / 60 << "," << "\n";                 //int
	ss << lineStart << "\t" << "\"dutyPeriod\":" << p->getDPInSec() / 60 << "," << "\n";                 //int
	ss << lineStart << "\t" << "\"block\":" << p->getBLKInSec() / 60 << "," << "\n";                 //int

	ss << lineStart << "\t" << "\"isLegal\":" << (p->getLegality() ? "true" : "false") << "," << "\n";    //bool

	ss << lineStart << "\t" << "\"pairingComplements\":" << formatStrIntMap(p->getComplements()) << "," << "\n"; //形如{ 'FO':1, 'SO':2 }

	ss << lineStart << "\t" << "\"fleetGroup\":\"" << p->getFltCode() << "\"," << "\n"; //string fleetGroup
	ss << lineStart << "\t" << "\"primeActivity\":\"" << p->getPrimeActivity() << "\"," << "\n"; //string primaryDuty

	ss << lineStart << "\t" << "\"blockMinsAdjustment\":\"" << p->getBlockMinsAdjustment() << "\"," << "\n"; //OP#1806

	ss << lineStart << "\t" << "\"perDiemMins\":" << Utility::round(p->getPerDiemInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"perDiemMinsAdjustment\":" << Utility::round(p->getPerDiemAdjustmentInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"lhPerDiemMins\":" << Utility::round(p->getLongPerDiemInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"fmPerDiemMins\":" << Utility::round(p->getFirstMonthPerDiemInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"fmLhPerDiemMins\":" << Utility::round(p->getFirstMonthLongPerDiemInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"schPerDiemMins\":" << Utility::round(p->getSchPerDiemInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"schLhPerDiemMins\":" << Utility::round(p->getSchLongPerDiemInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"schFmPerDiemMins\":" << Utility::round(p->getSchFirstMonthPerDiemInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"schFmLhPerDiemMins\":" << Utility::round(p->getSchFirstMonthLongPerDiemInSec() * 1.0 / 60, 2) << "," << "\n";

	ss << lineStart << "\t" << "\"wpMins\":" << Utility::round(p->getWorkPeriodInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"wpMinsAdjustment\":" << Utility::round(p->getWorkPeriodAdjustmentInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"schWpMins\":" << Utility::round(p->getSchWorkPeriodInSec() * 1.0 / 60, 2) << "," << "\n";

	ss << lineStart << "\t" << "\"creditedMinutes\":" << Utility::round(p->getCreditInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"fmCreditedMinutes\":" << Utility::round(p->getFirstMonthCreditInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"schCreditedMinutes\":" << Utility::round(p->getSchCreditInSec() * 1.0 / 60, 2) << "," << "\n";
	ss << lineStart << "\t" << "\"schFmCreditedMinutes\":" << Utility::round(p->getSchFirstMonthCreditInSec() * 1.0 / 60, 2) << "," << "\n";

	ss << lineStart << "\t" << "\"rankCombC9aP\":" << p->getRankCombCP() << "," << "\n";     //OP#2442
	ss << lineStart << "\t" << "\"rankCombC9aC\":" << p->getRankCombCC() << "," << "\n";     //OP#2442
	ss << lineStart << "\t" << "\"rankCombC9aA\":" << p->getRankCombCA() << "," << "\n";     //OP#2442
	ss << lineStart << "\t" << "\"rankCombO9aP\":\"" << p->getRankCombOP() << "\"," << "\n";     //OP#2442
	ss << lineStart << "\t" << "\"rankCombO9aC\":\"" << p->getRankCombOC() << "\"," << "\n";     //OP#2442
	ss << lineStart << "\t" << "\"rankCombO9aA\":\"" << p->getRankCombOA() << "\"," << "\n";     //OP#2442
	
	ss << lineStart << "\t" << "\"attribute\":\"" << p->getAttribute() << "\"," << "\n";     //OP#2003
	//ss << lineStart << "\t" << "\"tags\":\"" << p->getTags() << "\"," << "\n";     
	ss << lineStart << "\t" << "\"label\":\"" << p->getLabel() << "\"," << "\n";

	auto lastDuty = p->getLastDuty();
	if (lastDuty != nullptr) {
		ss << lineStart << "\t" << "\"minATDO\":" << lastDuty->getMinATDO() << "," << "\n";
		ss << lineStart << "\t" << "\"minEXDO\":" << lastDuty->getMinEXDO() << "," << "\n";
	}

	//-------------------------------------------------------                              //DUTY begin
	ss << lineStart << "\t" << "\"duties\":[" << "\n";
	for (std::size_t j = 0; j < p->getNumDuties(); j++) {
		Duty * d = p->getDuty(j);
		Duty* nextDuty = (j + 1) >= p->getNumDuties() ? nullptr : p->getDuty(j + 1);
		int actualRest = d->getActualRest();

		ss << lineStart << "\t{" << "\n";
		ss << lineStart << "\t\t" << "\"dutyType\":\"" << d->getTypeFullStr() << "\"," << "\n";          //str
		ss << lineStart << "\t\t" << "\"pairingId\":" << p->getDbId() << "," << "\n";            //int->str
		ss << lineStart << "\t\t" << "\"dutySeq\":" << (j + 1) << "," << "\n";                 //int
		formatJson_printTime(ss, lineStart + "\t\t", d);
		ss << lineStart << "\t\t" << "\"baseStation\":\"" << d->getBase() << "\"," << "\n";              //str
		ss << lineStart << "\t\t" << "\"actualPickUpInMinutes\":" << d->getActualPickupMin() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"actualDropOffInMinutes\":" << d->getActualDropoffMin() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"actualCheckOutInMinutes\":" << d->getActualDebriefMin() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"actualCheckInInMinutes\":" << d->getActualBriefMin() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"actualRestInMinutes\":" << actualRest << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"minimumBriefTimeInMinutes\":" << d->getMinBrief() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"minimumDeberiefTimeInMinutes\":" << d->getMinDebrief() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"minimumPickUpTimeInMinutes\":" << d->getMinPickup() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"minimumDropOffTimeInMinutes\":" << d->getMinDropoff() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"minimumRestTimeInMinutes\":" << d->getMinRest() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"minimumRestTimeInMinutesAtBaseStation\":" << d->getMinRestAtBase() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"checkinMinimumRestTimeInMinutes\":" << d->getCheckInMinRest() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"maximumDutyPeriodInMinutes\":" << d->getMaxDutyMin() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"splitDutyDropOffMin\":" << d->getSpiltDutyDropOffMin() << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"splitDutyPickUpMin\":" << d->getSpiltDutyPickUpMin() << "," << "\n";   //int
		//20190513 yuankai.cai mantis#5556 discretion 赋值
		ss << lineStart << "\t\t" << "\"fdpDiscretionMin\":" << d->getFdpDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"maxFdpMin\":" << (d->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP) + d->getExtendFdpMin()) << "," << "\n";
		ss << lineStart << "\t\t" << "\"maxDpMin\":" << d->getLimitationValue(RULE_LIMITATION_TYPE::MAX_DP) << "," << "\n";
		ss << lineStart << "\t\t" << "\"maxBlhMin\":" << d->getLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK) << "," << "\n";
		ss << lineStart << "\t\t" << "\"autoFdpDiscretion\":\"" << d->getDutyDelta().toString() << "\"," << "\n";

		ss << lineStart << "\t\t" << "\"extendFdpMin\":" << d->getExtendFdpMin() << "," << "\n";
		ss << lineStart << "\t\t" << "\"discretionType\":\"" << d->getOriginDiscretionType() << "\"," << "\n";
		ss << lineStart << "\t\t" << "\"manualFdpDiscretion\":" << d->getManualFdpDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"manualFtDiscretion\":" << d->getManualFtDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"manualRestDiscretion\":" << d->getManualRestDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"manualDpDiscretion\":" << d->getManualDpDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"manualSectorDiscretion\":" << d->getManualSectorDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"totalFdpDiscretion\":" << d->getTotalFdpDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"totalFtDiscretion\":" << d->getTotalFtDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"totalRestDiscretion\":" << d->getTotalRestDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"totalDpDiscretion\":" << d->getTotalDpDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"totalSectorDiscretion\":" << d->getTotalSectorDiscretion() << "," << "\n";
		ss << lineStart << "\t\t" << "\"trainingAddTime\":" << (d->isTrainingAddTime() ? 1 : 0) << "," << "\n";

		ss << lineStart << "\t\t" << "\"isManualMaxFdp\":" << (d->isManualMaxFdp() ? 1 : 0) << "," << "\n";

		/*
		//duty.AddMember("minimumRestTimeInMinutesAtBaseStation", (*duty_ite)->(), allocator);
		//duty.AddMember("maximumBlockTimeInMinutes", (*duty_ite)->(), allocator);
		//duty.AddMember("maximumDutyPeriodInMinutes", (*duty_ite)->(), allocator);
		//duty.AddMember("maximumFlightDutyPeriodInMinutes", (*duty_ite)->(), allocator);
		*/
		//20180509 ain, mantis#3296, ruleSrv输出FDP/DP
		ss << lineStart << "\t\t" << "\"planBlkMinutes\":" << (d->getBLKInMins()) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"planFdpMinutes\":" << (d->getFDPInSecs() / 60) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"planDutyMinutes\":" << (d->getDPInSecs() / 60) << "," << "\n";   //int
		//20180904 ain, mantis#3967, duty.actBlk/actDP
		ss << lineStart << "\t\t" << "\"actBlkMinutes\":" << (d->getActualBlockTime()) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"actFdpMinutes\":" << (d->getActualFDP()) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"actDutyMinutes\":" << (d->getActualDP()) << "," << "\n";   //int

		ss << lineStart << "\t\t" << "\"schBlkMinutes\":" << (d->getScheduleBlockTime()) << "," << "\n";   //int(EVA)
		ss << lineStart << "\t\t" << "\"schFdpMinutes\":" << (d->getScheduleFDP()) << "," << "\n";   //int(EVA)
		ss << lineStart << "\t\t" << "\"schDutyMinutes\":" << (d->getScheduleDP()) << "," << "\n";   //int(EVA)

		ss << lineStart << "\t\t" << "\"longTransitMins\":" << d->getLongTransitMins() << "," << "\n";
		ss << lineStart << "\t\t" << "\"assignment\":\"" << d->getAssignment() << "\"," << "\n";

		ss << lineStart << "\t\t" << "\"creditedMinutes\":" << Utility::round(d->getCreditInSec() * 1.0 / 60, 2) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"fmCreditedMinutes\":" << Utility::round(d->getFirstMonthCreditInSec() * 1.0 / 60, 2) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"schCreditedMinutes\":" << Utility::round(d->getSchCreditInSec() * 1.0 / 60, 2) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"schFmCreditedMinutes\":" << Utility::round(d->getSchFirstMonthCreditInSec() * 1.0 / 60, 2) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"plnWpMin\":" << Utility::round(d->getPlanWorkPeriodInSec() * 1.0 / 60, 2) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"actWpMin\":" << Utility::round(d->getActWorkPeriodInSec() * 1.0 / 60, 2) << "," << "\n";   //int
		ss << lineStart << "\t\t" << "\"wpAdjustment\":" << Utility::round(d->getWorkPeriodAdjustmentInSec() * 1.0 / 60, 2) << "," << "\n";   //int

		//20220620 EASA export
		ss << lineStart << "\t\t" << "\"acclimatisedState\":\"" << d->getAcclimatisedState() << "\"," << "\n"; //string
		ss << lineStart << "\t\t" << "\"acclimatisedStateForRestStart\":\"" << d->getAcclimatisedStateForRestStart() << "\"," << "\n"; //string
		ss << lineStart << "\t\t" << "\"ETRTZ\":" << d->getETRTZ() << "," << "\n";  //int
		ss << lineStart << "\t\t" << "\"refTimeZone\":" << d->getRefTimeZone() << "," << "\n";  //double
		ss << lineStart << "\t\t" << "\"tzDiffs\":" << d->getTzDiffs() << "," << "\n";  //double
		ss << lineStart << "\t\t" << "\"adaptionPeriod\":" << d->getAdaptionPeriod() << "," << "\n";  //int
		ss << lineStart << "\t\t" << "\"adaptionPeriodAdjustment\":" << d->getAdaptionPeriodAdjustment() << "," << "\n";  //int
		ss << lineStart << "\t\t" << "\"compositionName\":\"" << d->getCompositionName() << "\"," << "\n"; //string
		ss << lineStart << "\t\t" << "\"minimumLegalComplement\":";
		formatMinimumLegalComplement(ss, d->getMinimumLegalComplement(), dbData, lineStart + "\t\t");
		ss << "," << "\n";
		ss << lineStart << "\t\t" << "\"fdpExtensionMinutes\":\"" << d->getFdpExtensionMinutes() << "\"," << "\n"; //int 仅用于记录In Flight Rest扩展MAX FDP(7317法规)
		ss << lineStart << "\t\t" << "\"isLegal\":" << (d->getLegality() ? "true" : "false") << "," << "\n";    //bool
		ss << lineStart << "\t\t" << "\"violations\":" << formatStrArray(d->getViolationMessage()) << "," << "\n"; //string array
		ss << lineStart << "\t\t" << "\"attribute\":\"" << d->getAttributes() << "\"," << "\n"; //string
		//--------------------------------------------------                                //SEG begin
		ss << lineStart << "\t\t" << "\"editorSegments\":[" << "\n";
		for (std::size_t k = 0; k < d->getNumSegments(); k++) {
			Segment * s = d->getSegment(k);
			Segment* nextSeg = k+1 >= d->getNumSegments() ? nullptr : d->getSegment(k + 1);
			ss << lineStart << "\t\t{" << "\n";
			ss << lineStart << "\t\t\t" << "\"pairingId\":" << p->getDbId() << "," << "\n";       //int->str
			ss << lineStart << "\t\t\t" << "\"id\":" << s->getSegmentId() << "," << "\n";       //int->str
			ss << lineStart << "\t\t\t" << "\"dutySeq\":" << (j + 1) << "," << "\n";            //int
			ss << lineStart << "\t\t\t" << "\"segSeq\":" << (k + 1) << "," << "\n";        //int
			ss << lineStart << "\t\t\t" << "\"segType\":\"" << s->getDomIntType() << "" << "\",\n";        //str
			ss << lineStart << "\t\t\t" << "\"flightNumber\":\"" << s->getSegNumber() << "\"," << "\n";//str
			ss << lineStart << "\t\t\t" << "\"fleetCode\":\"" << s->getFleetCD() << "\"," << "\n";        //str
			ss << lineStart << "\t\t\t" << "\"departureStation\":\"" << s->getDepStation() << "\"," << "\n";  //str
			ss << lineStart << "\t\t\t" << "\"arrivalStation\":\"" << s->getArrStation() << "\"," << "\n";    //str
			ss << lineStart << "\t\t\t" << "\"splitDutyPickUpMin\":" << s->getSplitDutyPickUpMin() << "," << "\n";    //str
			ss << lineStart << "\t\t\t" << "\"splitDutyDropOffMin\":" << s->getSplitDutyDropOffMin() << "," << "\n";    //str
			//ss << lineStart << "\t\t\t" << "\"startTimeInUtc\":" << s->getStartTimeUtcSch() << "," << "\n";  //int
			//ss << lineStart << "\t\t\t" << "\"endTimeInUtc\":" << s->getEndTimeUtcSch() << "," << "\n";      //int
			//int blhMin = static_cast<int>(s->getEndTimeUtcAct() - s->getStartTimeUtcAct()) / 60;
			ss << lineStart << "\t\t\t" << "\"blhMin\":" << s->getBlkMinutes() << "," << "\n";    //int
			ss << lineStart << "\t\t\t" << "\"wpMins\":" << Utility::round(s->getWorkPeriodInSec() * 1.0 / 60, 2) << "," << "\n";    //int

			ss << lineStart << "\t\t\t" << "\"creditedMinutes\":" << Utility::round(s->getCreditInSec() * 1.0 / 60, 2) << "," << "\n";   //int
			ss << lineStart << "\t\t\t" << "\"fmCreditedMinutes\":" << Utility::round(s->getFirstMonthCreditInSec() * 1.0 / 60, 2) << "," << "\n";   //int
			ss << lineStart << "\t\t\t" << "\"schCreditedMinutes\":" << Utility::round(s->getSchCreditInSec() * 1.0 / 60, 2) << "," << "\n";   //int
			ss << lineStart << "\t\t\t" << "\"schFmCreditedMinutes\":" << Utility::round(s->getSchFirstMonthCreditInSec() * 1.0 / 60, 2) << "," << "\n";   //int

			//20190422 ain, mantis#5333, ruleSrv输出 pairing补齐 segment全部时间字段
			//formatJson_printTime(ss, lineStart + "\t", s);

			utcToUtcStr(s->getStartTimeUtcSch(), tmp, sizeof(tmp) - 1);
			ss << lineStart << "\t\t\t" << "\"startTimeInUtcStr\":\"" << tmp << "\"," << "\n";                    //str test
			ss << lineStart << "\t\t\t" << "\"nextFlightLegNumber\":\"" << s->getNextLegNo() << "\"," << "\n";    //str
			//ss << lineStart << "\t\t\t" << "\"assignmentType\":\"" << (s->getIsOperating() ? "FLY" : "DHD") << "\"," << "\n";    //str
			ss << lineStart << "\t\t\t" << "\"assignmentType\":\"" << s->getAssignment() << "\"," << "\n";    //str
			//20180324 ain, mantis#3002, segment层无需输出 composition
			//ss << lineStart << "\t\t\t" << "\"plancomplementsByRank\":" << formatStrIntMap(s->getPlanComposition()) << "," << "\n"; //形如{ 'FO':1, 'SO':2 }
			//ss << lineStart << "\t\t\t" << "\"fillcomplementsByRank\":" << formatStrIntMap(s->getFillComposition()) << "," << "\n"; //形如{ 'FO':1, 'SO':2 }
			ss << lineStart << "\t\t\t" << "\"baseStation\":\"" << s->getBase() << "\"," << "\n";                 //str
			if (s->getDBId()>0)
				ss << lineStart << "\t\t\t" << "\"fltId\":" << s->getDBId() << "," << "\n";      //int
			ss << lineStart << "\t\t\t" << "\"isLegal\":" << (s->getLegality() ? "true" : "false") << "," << "\n";    //bool
			//ss << lineStart << "\t\t\t" << "\"planComposition\":" << formatStrIntMap(s->getPlanComposition()) << "," << "\n";
			//ss << lineStart << "\t\t\t" << "\"fillComposition\":" << formatStrIntMap(s->getFillComposition()) << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"rankCombCriteriaId\":" << s->getRankCombCriteriaId() << "," << "\n";     //OP#1891
			ss << lineStart << "\t\t\t" << "\"rankCombC9aP\":" << s->getRankCombCP() << "," << "\n";     //OP#2442
			ss << lineStart << "\t\t\t" << "\"rankCombC9aC\":" << s->getRankCombCC() << "," << "\n";     //OP#2442
			ss << lineStart << "\t\t\t" << "\"rankCombC9aA\":" << s->getRankCombCA() << "," << "\n";     //OP#2442
			ss << lineStart << "\t\t\t" << "\"rankCombO9aP\":\"" << s->getRankCombOP() << "\"," << "\n";     //OP#2442
			ss << lineStart << "\t\t\t" << "\"rankCombO9aC\":\"" << s->getRankCombOC() << "\"," << "\n";     //OP#2442
			ss << lineStart << "\t\t\t" << "\"rankCombO9aA\":\"" << s->getRankCombOA() << "\"," << "\n";     //OP#2442
			string isTransit = "false";
			if (nextSeg && RuleParams::GetInstancePtr()->getLongTransit(s, nextSeg) != nullptr)
				isTransit = "true";
			ss << lineStart << "\t\t\t" << "\"isLongTransit\":" << isTransit << "," << "\n";    //bool
			ss << lineStart << "\t\t\t" << "\"violations\":" << formatStrArray(s->getViolationMessage()) << "\n"; //string array


			//--------------------------------------------------                            // SEG end
			if (k < d->getNumSegments() - 1) {
				ss << lineStart << "\t\t}," << "\n";
			}
			else {
				ss << lineStart << "\t\t}" << "\n";
			}
		}
		ss << lineStart << "\t\t]," << "\n";
		ss << lineStart << "\t\t" << "\"dutyNodes\":[" << "\n";
		for (std::size_t k = 0; k < d->pairingDutyNodes.size(); k++) {
			shared_ptr<PairingDutyNode> & pdn = d->pairingDutyNodes[k];
			time_t nodeStartUtc = pdn->getStartUtc();
			time_t nodeEndUtc = pdn->getEndUtc();
			time_t nodeStartLoc = pdn->getStartLoc();
			time_t nodeEndLoc = pdn->getEndLoc();
		
			auto [fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc] = getFixedDutyNodeTime(d, pdn);
			if (nodeStartUtc != fixedNodeStartUtc) {
				nodeStartUtc = fixedNodeStartUtc;
				Logger::getRuleLogger()->error("[DataCheck] invalid data, fix startUtc {} {} dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
					pdn->getType(), pdn->getNode(), d->getDutyId(), fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc);
			}
			if (nodeEndUtc != fixedNodeEndUtc) {
				nodeEndUtc = fixedNodeEndUtc;
				Logger::getRuleLogger()->error("[DataCheck] invalid data, fix endUtc {} {} dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
					pdn->getType(), pdn->getNode(), d->getDutyId(), fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc);
			}
			if (nodeStartLoc != fixedNodeStartLoc) {
				nodeStartLoc = fixedNodeStartLoc;
				Logger::getRuleLogger()->error("[DataCheck] invalid data, fix startLoc {} {} dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
					pdn->getType(), pdn->getNode(), d->getDutyId(), fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc);
			}
			if (nodeEndLoc != fixedNodeEndLoc) {
				nodeEndLoc = fixedNodeEndLoc;
				Logger::getRuleLogger()->error("[DataCheck] invalid data, fix endLoc {} {} dutyId={} startUtc={} endUtc={} startLoc={} endLoc={}.",
					pdn->getType(), pdn->getNode(), d->getDutyId(), fixedNodeStartUtc, fixedNodeEndUtc, fixedNodeStartLoc, fixedNodeEndLoc);
			}

			ss << lineStart << "\t\t{" << "\n";
			ss << lineStart << "\t\t\t" << "\"id\":" << pdn->getId() << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"pairingId\":" << pdn->getPairingId() << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"dutyId\":" << pdn->getDutyId() << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"sequence\":" << pdn->getSequence() << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"type\":\"" << pdn->getType() << "\"," << "\n";
			ss << lineStart << "\t\t\t" << "\"node\":\"" << pdn->getNode() << "\"," << "\n";
			ss << lineStart << "\t\t\t" << "\"startLoc\":" << nodeStartLoc << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"endLoc\":" << nodeEndLoc << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"groupId\":" << pdn->getGroupId() << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"airport\":\"" << pdn->getAirport() << "\"," << "\n";
			ss << lineStart << "\t\t\t" << "\"startUtc\":" << nodeStartUtc << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"endUtc\":" << nodeEndUtc << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"fromFltId\":" << pdn->getFromSegmentId() << "," << "\n";
			ss << lineStart << "\t\t\t" << "\"toFltId\":" << pdn->getToSegmentId() << "\n";
			//ss << lineStart << "\t\t\t" << "\"fromSegmentId\":" << pdn->getFromSegmentId() << "," << "\n";
			//ss << lineStart << "\t\t\t" << "\"toSegmentId\":" << pdn->getToSegmentId() << "\n";

			//--------------------------------------------------                            // pdn end
			if (k <  d->pairingDutyNodes.size() - 1) {
				ss << lineStart << "\t\t}," << "\n";
			}
			else {
				ss << lineStart << "\t\t}" << "\n";
			}
		}
		ss << lineStart << "\t\t]" << "\n";;

		//--------------------------------------------------
		if (j < p->getNumDuties() - 1) {
			ss << lineStart << "\t}," << "\n";
		}
		else {
			ss << lineStart << "\t}" << "\n";
		}
	}
	//--------------------------------------------------
	ss << lineStart << "\t]" << "\n";                                            //DUTY end	
	ss << lineStart << "}" << "\n";
}

//******************************************************
//将crew manday数据格式化成JSON，返回给EDITOR
//******************************************************
//int formatToJson_CrewManDay(ostream &ss, SharedPtr<CREW> crew)
//{
//	time_t timestamp = time(NULL);
//
//	ss << "{" << "\n";
//	ss << "\t" << "\"messageType\":\"" << "OUTBOND" << "\"," << "\n";           //str
//	ss << "\t" << "\"action\":\"" << "UPDATE MAYDAYS" << "\"," << "\n";           //str
//	ss << "\t" << "\"timeStamp\":\"" << timestamp << "\"," << "\n";					//str
//	ss << "\t" << "\"crewId\":\"" << crew->idCrew << "\"," << "\n";        //str
//	ss << "\t\"manDays\":" << "\n";
//	formatToJson_Manday(ss, crew, "\t");
//	ss << "}" << "\n";
//	return 0;
//
//}

//******************************************************
//将manday数据解析为json 数组
//******************************************************
int formatToJson_Manday(ostream &ss, SharedPtr<CREW> crew, string lineStart, SharedPtr<CrewDataContext>& dbData) {
	vector<SharedPtr<CREW_MANDAY_CC_AM>> man_cc = crew->mandayCcAmList;
	vector<SharedPtr<CREW_MANDAY_FD>>    man_fd = crew->mandayFdList;
	//20180430 ain, mantis#3103, 按场景时间重算manday, 兼容division=P/C/A
	bool isFd = crew->division == "P";
	string crewId = crew->idCrew;
	std::size_t size = isFd ? man_fd.size() : man_cc.size();

	//sort
	if (isFd)
		std::sort(man_fd.begin(), man_fd.end(), compareMandayFd);
	else
		std::sort(man_cc.begin(), man_cc.end(), compareMandayCc);
	//print
	ss << "\n";
	ss << lineStart << "[" << "\n";

	time_t outputStartTimeLoc = dbData->scenario.startDtLoc - 3 * 24 * 60 * 60;
	
	for (std::size_t i = 0; i < size; i++)
	{
		//string crewId = isFd ? man_fd[i]->idCrew : man_cc[i]->idCrew;

		//20180503 ain, mantis#3173, 按 sysParam['CREW_MANDAY_STORE_TIMEZONE']=CREW_BASE/TPE...计算 manday.loc
		//time_t mandayUtc = isFd ? man_fd[i]->crewDateUtc : man_cc[i]->crewDateUtc;
		//int crewBaseHourOffset = computeMandayTimeZoneHourOffset(dbData.get(), crew, mandayUtc);
		//time_t mandayLoc = mandayUtc + 3600 * crewBaseHourOffset;
		//20181010 ain, mantis#4168, 不再需要计算dateLoc, 直接利用manday.dateLoc
		time_t mandayLoc = isFd ? man_fd[i]->dateLoc : man_cc[i]->dateLoc;

		if (mandayLoc < outputStartTimeLoc) {
			continue;
		}

		ss << lineStart << "\t{";

		ss << "\"idcrew\":\"" << crew->idCrew << "\",";

		ss << "\"crewDate\":\"" << mandayLoc << "\",";        //str
		ss << "\"crewDateStr\":\"" << utcToUtcString(mandayLoc) << "\",";        ///TEST

		//ss << "\"crewDateUtcStr\":\"" << dateBuf << "\",";        //str

		if (!isFd) {
			//20180330 ain, mantis#3047, ruleSrv outbox normalWp/extendWp/custDp/perDiem
			ss << "\"wpNormal\":" << man_cc[i]->normal_wp << ",";        //str
			ss << "\"wpExtend\":" << man_cc[i]->extend_wp << ",";        //str
			ss << "\"custDp\":" << man_cc[i]->cust_dp << ",";        //str
		}
		/*if (isFd) 
			ss << "\"custDp\":" << man_fd[i]->cust_dp << ",";
		else
			ss << "\"custDp\":" << man_cc[i]->cust_dp << ",";*/

		if (isFd)
			ss << "\"perDiem\":" << Utility::round(man_fd[i]->PER_DIEM, 2) << ",";        //str
		else
			ss << "\"perDiem\":" << Utility::round(man_cc[i]->PER_DIEM, 2) << ",";        //str
		if (isFd)
			ss << "\"lhPerDiem\":" << Utility::round(man_fd[i]->LONG_PER_DIEM, 2) << ",";        //str
		else
			ss << "\"lhPerDiem\":" << Utility::round(man_cc[i]->LONG_PER_DIEM, 2) << ",";        //str
		if (isFd)
			ss << "\"schPerDiem\":" << Utility::round(man_fd[i]->SCH_PER_DIEM, 2) << ",";        //str
		else
			ss << "\"schPerDiem\":" << Utility::round(man_cc[i]->SCH_PER_DIEM, 2) << ",";        //str
		if (isFd)
			ss << "\"schLhPerDiem\":" << Utility::round(man_fd[i]->SCH_LONG_PER_DIEM, 2) << ",";        //str
		else
			ss << "\"schLhPerDiem\":" << Utility::round(man_cc[i]->SCH_LONG_PER_DIEM, 2) << ",";        //str

		if (isFd)
			ss << "\"workingHour\":" << Utility::round(man_fd[i]->workingHour, 2) << ",";        //str
		else
			ss << "\"workingHour\":" << Utility::round(man_cc[i]->workingHour, 2) << ",";        //str
		if (isFd)
			ss << "\"schWorkingHour\":" << Utility::round(man_fd[i]->schWorkingHour, 2) << ",";        //str
		else
			ss << "\"schWorkingHour\":" << Utility::round(man_cc[i]->schWorkingHour, 2) << ",";        //str

		if (isFd)
			ss << "\"blh\":" << (int)round(man_fd[i]->blh) << ",";        //str
		else
			ss << "\"blh\":" << (int)round(man_cc[i]->blh) << ",";        //str

		if (isFd)
			ss << "\"ft\":" << (int)round(man_fd[i]->ft) << ",";        //str
		else
			ss << "\"ft\":" << (int)round(man_cc[i]->ft) << ",";        //str

		if (isFd)
			ss << "\"dp\":" << (int)round(man_fd[i]->dp) << ",";        //str
		else
			ss << "\"dp\":" << (int)round(man_cc[i]->dp) << ",";        //str

		if (isFd)
			ss << "\"fdp\":" << (int)round(man_fd[i]->fdp) << ",";        //str
		else
			ss << "\"fdp\":" << (int)round(man_cc[i]->fdp) << ",";        //str

		if (isFd)
			ss << "\"standby\":" << man_fd[i]->STANDBY << ",";        //str
		else
			ss << "\"standby\":" << man_cc[i]->STANDBY << ",";        //str

		if (isFd)
			ss << "\"standbyDuration\":" << man_fd[i]->standbyDuration << ",";        //str
		else
			ss << "\"standbyDuration\":" << man_cc[i]->standbyDuration << ",";        //str

		if (isFd)
			ss << "\"leave\":" << man_fd[i]->LEAVE << ",";        //str
		else
			ss << "\"leave\":" << man_cc[i]->LEAVE << ",";        //str

		if (isFd)
			ss << "\"leaveDuration\":" << man_fd[i]->leaveDuration << ",";        //str
		else
			ss << "\"leaveDuration\":" << man_cc[i]->leaveDuration << ",";        //str

		if (isFd)
			ss << "\"dayOff\":" << (man_fd[i]->DAY_OFF == DAY_OFF_EXIST ? DAY_OFF_EXIST : DAY_OFF_NOT_EXIST) << ",";        //str
		else
			ss << "\"dayOff\":" << (man_cc[i]->DAY_OFF == DAY_OFF_EXIST ? DAY_OFF_EXIST : DAY_OFF_NOT_EXIST) << ",";        //str

		if (isFd)
			ss << "\"isDomesticDo\":" << (man_fd[i]->isDomesticDo == DAY_OFF_EXIST ? DAY_OFF_EXIST : DAY_OFF_NOT_EXIST) << ",";        //str
		else
			ss << "\"isDomesticDo\":" << (man_cc[i]->isDomesticDo == DAY_OFF_EXIST ? DAY_OFF_EXIST : DAY_OFF_NOT_EXIST) << ",";        //str

		if (isFd)
			ss << "\"isFirstRecySixOffsetDdo\":" << (man_fd[i]->isFirstRecy6Offsetddo ? 1 : 0) << ",";        //str
		else
			ss << "\"isFirstRecySixOffsetDdo\":" << (man_cc[i]->isFirstRecy6Offsetddo ? 1 : 0) << ",";  

		if (isFd)
			ss << "\"csb\":" << man_fd[i]->CSB << ",";        //int
		else
			ss << "\"csb\":" << man_cc[i]->CSB << ",";        //int

		if (isFd)
			ss << "\"hsb\":" << man_fd[i]->HSB << ",";        //int
		else
			ss << "\"hsb\":" << man_cc[i]->HSB << ",";        //int

		if (isFd)
			ss << "\"asb\":" << man_fd[i]->ASB << ",";        //int
		else
			ss << "\"asb\":" << man_cc[i]->ASB << ",";        //int

		if (isFd)
			ss << "\"isAl\":" << man_fd[i]->IS_AL << ",";        //str
		else
			ss << "\"isAl\":" << man_cc[i]->IS_AL << ",";        //str

		if (isFd)
			ss << "\"al\":" << man_fd[i]->al << ",";        //str
		else
			ss << "\"al\":" << man_cc[i]->al << ",";        //str

		if (isFd)
			ss << "\"quarantine\":" << man_fd[i]->QUARANTINE << ",";        //str
		else
			ss << "\"quarantine\":" << man_cc[i]->QUARANTINE << ",";        //str

		if (isFd)
			ss << "\"isPosition\":" << man_fd[i]->IS_POSITION << ",";        //str

		if (isFd)
			ss << "\"quarantineDuration\":" << man_fd[i]->quarantineDuration << ",";        //str
		else
			ss << "\"quarantineDuration\":" << man_cc[i]->quarantineDuration << ",";        //str

		if (isFd)
			ss << "\"custData1\":" << man_fd[i]->custData1 << ",";        //str
		else
			ss << "\"custData1\":" << man_cc[i]->custData1 << ",";        //str

		if (isFd)
			ss << "\"custData2\":" << man_fd[i]->custData2 << ",";        //str
		else
			ss << "\"custData2\":" << man_cc[i]->custData2 << ",";        //str

		if (isFd)
			ss << "\"ground\":" << man_fd[i]->GND << ",";        //str
		else
			ss << "\"ground\":" << man_cc[i]->GND << ",";        //str

		if (isFd)
			ss << "\"groundDuration\":" << man_fd[i]->groundDuration << ",";        //str
		else
			ss << "\"groundDuration\":" << man_cc[i]->groundDuration << ",";        //str

		if (isFd)
			ss << "\"highPlateau\":" << man_fd[i]->HIGH_PLATEAU << ",";      //str
		else
			ss << "\"highPlateau\":" << man_cc[i]->HIGH_PLATEAU << ",";        //str

		if (isFd)
			ss << "\"credit\":" << Utility::round(man_fd[i]->credit, 2) << ",";        //str
		else
			ss << "\"credit\":" << Utility::round(man_cc[i]->credit, 2) << ",";        //str

		if (isFd)
			ss << "\"schCredit\":" << Utility::round(man_fd[i]->sch_credit, 2) << ",";        //str
		else
			ss << "\"schCredit\":" << Utility::round(man_cc[i]->sch_credit, 2) << ",";        //str

		if (isFd)
			ss << "\"pncCredit\":" << Utility::round(man_fd[i]->credit_pnc, 2) << ",";        //str
		else
			ss << "\"pncCredit\":" << Utility::round(man_cc[i]->credit_pnc, 2) << ",";        //str

		if (isFd)
			ss << "\"simCredit\":" << Utility::round(man_fd[i]->credit_sim, 2) << ",";        //str
		else
			ss << "\"simCredit\":" << Utility::round(man_cc[i]->credit_sim, 2) << ",";        //str

		if (isFd)
			ss << "\"alCredit\":" << Utility::round(man_fd[i]->credit_al, 2) << ",";        //str
		else
			ss << "\"alCredit\":" << Utility::round(man_cc[i]->credit_al, 2) << ",";        //str

		if (isFd)
			ss << "\"olCredit\":" << Utility::round(man_fd[i]->credit_ol, 2) << ",";        //str
		else
			ss << "\"olCredit\":" << Utility::round(man_cc[i]->credit_ol, 2) << ",";        //str

		if (isFd)
			ss << "\"schPncCredit\":" << Utility::round(man_fd[i]->sch_credit_pnc, 2) << ",";        //str
		else
			ss << "\"schPncCredit\":" << Utility::round(man_cc[i]->sch_credit_pnc, 2) << ",";        //str

		if (isFd)
			ss << "\"schSimCredit\":" << Utility::round(man_fd[i]->sch_credit_sim, 2) << ",";        //str
		else
			ss << "\"schSimCredit\":" << Utility::round(man_cc[i]->sch_credit_sim, 2) << ",";        //str

		if (isFd)
			ss << "\"schAlCredit\":" << Utility::round(man_fd[i]->sch_credit_al, 2) << ",";        //str
		else
			ss << "\"schAlCredit\":" << Utility::round(man_cc[i]->sch_credit_al, 2) << ",";        //str

		if (isFd)
			ss << "\"schOlCredit\":" << Utility::round(man_fd[i]->sch_credit_ol, 2) << ",";        //str
		else
			ss << "\"schOlCredit\":" << Utility::round(man_cc[i]->sch_credit_ol, 2) << ",";        //str

		if (isFd)
			ss << "\"freighterCredit\":" << Utility::round(man_fd[i]->credit_freighter, 2) << ",";        //str
		else
			ss << "\"freighterCredit\":" << Utility::round(man_cc[i]->credit_freighter, 2) << ",";        //str

		if (isFd)
			ss << "\"schFreighterCredit\":" << Utility::round(man_fd[i]->sch_credit_freighter, 2) << ",";        //str
		else
			ss << "\"schFreighterCredit\":" << Utility::round(man_cc[i]->sch_credit_freighter, 2) << ",";        //str




		if (isFd)
			ss << "\"sbyDp\":" << (int)round(man_fd[i]->SBY_DP) << ",";        //str
		else
			ss << "\"sbyDp\":" << (int)round(man_cc[i]->SBY_DP) << ",";        //str

		if (isFd)
			ss << "\"dhdDp\":" << (int)round(man_fd[i]->DHD_DP) << ",";        //str
		else
			ss << "\"dhdDp\":" << (int)round(man_cc[i]->DHD_DP) << ",";        //str

		if (isFd)
			ss << "\"layoverDay\":" << man_fd[i]->layover_day << ",";        //str
		else
			ss << "\"layoverDay\":" << man_cc[i]->layover_day << ",";        //str

		if (isFd)
			ss << "\"fleetTakeoff\":\"" << joinMapToStr(man_fd[i]->fleetTakeoff, "|") << "\",";        //str

		if (isFd)
			ss << "\"fleetLanding\":\"" << joinMapToStr(man_fd[i]->fleetLanding, "|") << "\",";        //str

		if (isFd)
			ss << "\"nightTakeoff\":\"" << joinMapToStr(man_fd[i]->nightFleetTakeoff, "|") << "\",";        //str

		if (isFd)
			ss << "\"nightLanding\":\"" << joinMapToStr(man_fd[i]->nightFleetLanding, "|") << "\",";        //str

		if (isFd)
			ss << "\"operatingFleets\":\"" << joinMapToStr(man_fd[i]->operating_fleets, "|") << "\",";        //str
		else
			ss << "\"operatingFleets\":\"" << joinMapToStr(man_cc[i]->operating_fleets, "|") << "\",";        //str

		if (isFd)
			ss << "\"operatingAirports\":\"" << joinStrList(man_fd[i]->operating_airports, "|") << "\",";        //str
		else
			ss << "\"operatingAirports\":\"" << joinStrList(man_cc[i]->operating_airports, "|") << "\",";        //str
		

		if (isFd)
			ss << "\"attributes\":\"" << man_fd[i]->attributes << "\",";        //str
		else
			ss << "\"attributes\":\"" << man_cc[i]->attributes << "\",";        //str
		

		if (isFd)
			ss << "\"intBlh\":\"" << (int)round(man_fd[i]->intBlh) << "\",";        //str
		else
			ss << "\"intBlh\":\"" << (int)round(man_cc[i]->intBlh) << "\",";        //str
		
		if (isFd)
			ss << "\"augementBlh\":\"" << (int)round(man_fd[i]->augBlh) << "\",";

		if (isFd)
			ss << "\"fltNum\":\"" << man_fd[i]->fltNum << "\",";        //str
		else
			ss << "\"fltNum\":\"" << man_cc[i]->fltNum << "\",";        //str

		if (isFd)
			ss << "\"radiationDose\":\"" << man_fd[i]->radiationDose << "\",";        //str
		else
			ss << "\"radiationDose\":\"" << man_cc[i]->radiationDose << "\",";        //str

		if (isFd)
			ss << "\"layoverTimes\":" << man_fd[i]->layoverTimes << ",";        //str
		else
			ss << "\"layoverTimes\":" << man_cc[i]->layoverTimes << ",";        //str

		if (isFd)
			ss << "\"layoverDuration\":" << man_fd[i]->layoverDuration << ",";        //str
		else
			ss << "\"layoverDuration\":" << man_cc[i]->layoverDuration << ",";        //str

		if (isFd)
			ss << "\"crossTzDutyCount\":" << man_fd[i]->crossTzDutyCount << "";        //str
		else
			ss << "\"crossTzDutyCount\":" << man_cc[i]->crossTzDutyCount << "";        //str

		if (i < size - 1)
			ss << "}," << "\n";
		else
			ss << "}" << "\n";
	}

	ss << lineStart << "]" << "\n";
	

	return 0;
}


//******************************************************
//将RosterFlight数据输出为json 数组
//******************************************************
int formatToJson_RosterFlight(ostream& ss, SharedPtr<CREW> crew, string lineStart, SharedPtr<CrewDataContext>& dbData) {
	string crewId = crew->idCrew;
	auto rfs = dbData->rosterFlightMgr.get(crewId);
	//print
	ss << "\n";
	ss << lineStart << "[" << "\n";
	int size = (int)rfs.size();
	for (int i = 0; i < size; i++)
	{
		auto& rf = rfs[i];
		ss << lineStart << "\t{";

		ss << "\"idcrew\":\"" << crew->idCrew << "\",";
		ss << "\"rosterId\":\"" << rf->rosterId << "\",";
		ss << "\"fltId\":\"" << rf->fltId << "\",";

		ss << "\"accState\":\"" << rf->accState << "\",";
		ss << "\"accTimezone\":" << rf->accTimezone << ",";

		ss << "\"creditedMinutes\":" << Utility::round(rf->creditedInSec * 1.0 / 60, 2) << ",";
		ss << "\"fmCreditedMinutes\":" << Utility::round(rf->fmCreditedInSec * 1.0 / 60, 2) << ",";
		ss << "\"schCreditedMinutes\":" << Utility::round(rf->schCreditedInSec * 1.0 / 60, 2) << ",";
		ss << "\"schFmCreditedMinutes\":" << Utility::round(rf->schFmCreditedInSec * 1.0 / 60, 2) << ",";

		ss << "\"exceptionCode\":\"" << rf->exceptionCode << "\",";
		ss << "\"isAgreeWork\":" << (rf->isAgreeWork ? "1" : "0") << "";
		if (i < size - 1)
			ss << "}," << "\n";
		else
			ss << "}" << "\n";
	}
	ss << lineStart << "]" << "\n";
	return 0;
}

int formatToJson_violations(ostream& ss, vector<RULE_VIOLATION*>& rvs, CrewDataContext* dbData) {
	ss << "[" << "\n";
	for (std::size_t i = 0; i < rvs.size(); i++)
	{
		ss << "\t\t{";
		if (rvs[i]->crewId.size()>0)
			ss << "\"crewId\":\"" << rvs[i]->crewId << "\",";        //str
		else
			ss << "\"crewId\":" << "null" << ",";        //str

		//mantis#1750, 临时id < 0 也应打印到输出, -1表示violation无rosterId打印null
		if (rvs[i]->rosterId != -1)
			ss << "\"rosterId\":" << rvs[i]->rosterId << "," ;
		else
			ss << "\"rosterId\":" << "null" << "," ;

		if (rvs[i]->pairingId != -1)
			ss << "\"pairingId\":" << rvs[i]->pairingId << "," ;
		else
			ss << "\"pairingId\":" << "null" << "," ;

		if (rvs[i]->dutySequenceNumber >= 0)
			ss << "\"dutySequenceNumber\":" << rvs[i]->dutySequenceNumber << "," ;
		else
			ss << "\"dutySequenceNumber\":" << "null" << "," ;

		if (rvs[i]->segmentId >= 0)
			ss << "\"segmentId\":" << rvs[i]->segmentId << "," ;
		else
			ss << "\"segmentId\":" << "null" << "," ;
		if (rvs[i]->idRule)
			ss << "\"idRule\":" << rvs[i]->idRule << "," ;
		ss << "\"phaseId\":" << rvs[i]->phase << ",";
		ss << "\"ruleParamId\":" << rvs[i]->ruleParamId << ",";
		ss << "\"startDTUtc\":" << rvs[i]->startDTUtc << "," ;
		ss << "\"endDTUtc\":" << rvs[i]->endDTUtc << "," ;
		if (rvs[i]->description.size() > 0)
			ss << "\"description\":\"" << escape_json(rvs[i]->description) << "\"," ;        //str
		if (rvs[i]->reference.size() > 0)
			ss << "\"reference\":\"" << escape_json(rvs[i]->reference) << "\"," ;        //str
		ss << "\"message\":\"" << escape_json(rvs[i]->violation_msg) << "\"," ;        //str
		ss << "\"type\":" << rvs[i]->type << "," ;
		ss << "\"msgType\":" << rvs[i]->msg_type << ",";
		ss << "\"operationResult\":{"; 
		if (rvs[i]->operation_result.size() > 0){	
			map<string, string>::iterator iter;
			for (iter = rvs[i]->operation_result.begin(); iter != rvs[i]->operation_result.end(); iter++){
				if (iter != rvs[i]->operation_result.begin())ss << ",";
				ss << "\"" << iter->first << "\":\"" << iter->second << "\"";
			}		
		}
		ss << "},";
		int severity = 0;
		if (dbData != NULL) {
			for (std::size_t ruleIndex = 0; ruleIndex < dbData->ruleList.size(); ruleIndex++) {
				if (dbData->ruleList[ruleIndex].idRule == rvs[i]->idRule) {
					severity = dbData->ruleList[ruleIndex].severity;
				}
			}
		}
		ss << "\"severity\":" << severity << ",";
		ss << "\"overridability\":\"" << rvs[i]->overridebility << "\",";
		ss << "\"ishard\":" << (rvs[i]->ishard ? "true" : "false") ;

		if (i != rvs.size() - 1)
			ss << "}," << "\n";
		else
			ss << "}" << "\n";
	}
	ss << "\t]" << "\n";
	return 0;
}

//**************************************************************
//将Crew Legality信息列表转为json格式
//**************************************************************
int formatToJson_CrewLegality(ostream &ss, SharedPtr<CREW>& crewIndex, vector<RULE_VIOLATION*> rvs, SharedPtr<CrewDataContext>& dbData, bool needOutputManday)
{
	//char tmp[100] = { 0 };
	time_t timestamp = time(NULL);
	//struct tm* now = localtime(&t);
	//strftime(tmp, 90, "%Y-%m-%d %H:%M:%S", now);

	ss << "{" << "\n";
	ss << "\t" << "\"type\":1,\n";
	ss << "\t" << "\"messageType\":\"" << "OUTBOND" << "\"," << "\n";           //str
	ss << "\t" << "\"processingStatus\":\"" << "PROCESSED" << "\"," << "\n";    //str
	//ss << "\t" << "\"timeStamp\":\"" << timestamp << "\"," << "\n";					//str
	ss << "\t" << "\"crewId\":\"" << crewIndex->idCrew << "\"," << "\n";        //str

	//ss << "\t\"violations\":" << formatStrArray(crewIndex->_vilation_messages) << "," << "\n"; //string array
	ss << "\t\"violations\":";
	formatToJson_violations(ss, rvs, dbData.get());

	//20180315 ain, mantis#2952, 缩减 outbox/容量
	//ss << "\t" << "\"Rosters\":";
	//vector<SharedPtr<ROSTER>> rosters = crewIndex->rosterList;
	//formatToJson_RosterList(ss, rosters,"\t");
	//ss << "\t" << "," << "\n";

	//20180706 ain, op#1818, ruleSrv outbox/, roster.communt
	//为避免outox太大解析慢, 只输出 communt, 格式按 map<rosterId, communt>
	ss << "\t," << "\"rosterCommunts\":{";
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (i > 0)
			ss << ",";
		ss << "\""<< r->rosterId << "\":" << r->communt;
	}
	ss << "}" << "\n";

	//20181010 ain, op#1901, ruleSrv outbox/, roster.seqOrder
	//为避免outox太大解析慢, 只输出 seqOrder, 格式按 map<rosterId, seqOrder>
	ss << "\t," << "\"rosterSeqOrders\":{";
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (i > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << (r->seqOrder);
	}
	ss << "}" << "\n";


	//20190906 ain, mantis#6633, outbox, rosterFlt.seqOrder
	//if ("BR" != dbData->scenario.airline) {
	ss << "\t," << "\"rosterFltSeqOrder\":{";
	int rosterFltCount = 0;
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		auto iterPair = dbData->pairingIdMap.find(r->pairId);
		if (r->pairId == 0 || iterPair == dbData->pairingIdMap.end()) {
			continue;
		}
		Pairing* pg = iterPair->second;
		if (!pg) {
			continue;
		}
		for (std::size_t i1 = 0; i1 < pg->getNumDuties(); i1++) {
			Duty* d = pg->getDuty(i1);
			for (std::size_t i2 = 0; i2 < d->getNumSegments(); i2++) {
				Segment* s = d->getSegment(i2);
				if (s->getDBId() != 0 && (s->getAssignment() == "FLY" || s->getAssignment() == "SBY")) {
					SharedPtr<RosterFlight> rf = dbData->rosterFlightMgr.get(s->getDBId(), r->idcrew);
					if (!rf)
						continue;
					if (rosterFltCount > 0)
						ss << ",";
					rosterFltCount++;
					ss << "\"" << s->getDBId() << "\":" << rf->seqOrder;
				}
			}
		}
	}
	ss << "}" << "\n";
	//}
	//输出isMergeFdpWithNext
	{
		ss << "\t," << "\"isMergeFdpWithNext\":{";
		int outputCount = 0; //避免outbox/冗余地面任务输出roster.dutyMinRst
		for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
			auto& r = crewIndex->rosterList[i];
			if (outputCount > 0)
				ss << ",";
			ss << "\"" << r->rosterId << "\":" << (r->isMergeFdpWithNext ? "true" : "false");
			outputCount++;
		}
		ss << "}" << "\n";
	}
	//输出 dutyMinRest
	ss << "\t," << "\"dutyMinRst\":{";
	int indexOfRosterWithPairing = 0; //避免outbox/冗余地面任务输出roster.dutyMinRst
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)		//20191021 ain, mantis#6930, 增加 r->pairing空保护
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		if (r->pairId != 0) {
			std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
				Duty* currDuty = r->pairing->getDuty(j);
				Duty* nextDuty = (j + 1) >= r->pairing->getNumDuties() ? nullptr : r->pairing->getDuty(j + 1);
				int minRest = currDuty->getMinRest();
				if (minRest <= 0)
					minRest = currDuty->getActualRest();
				ss << (j > 0 ? "," : "") << minRest;
			}
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	//输出 dutyCheckInMinRest
	ss << "\t," << "\"dutyCheckInMinRest\":{";
	indexOfRosterWithPairing = 0;
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)		//20191021 ain, mantis#6930, 增加 r->pairing空保护
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		if (r->pairId != 0) {
			std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
				Duty* currDuty = r->pairing->getDuty(j);
				Duty* nextDuty = (j + 1) >= r->pairing->getNumDuties() ? nullptr : r->pairing->getDuty(j + 1);
				int minRest = currDuty->getCheckInMinRest();
				if (minRest <= 0)
					minRest = currDuty->getActualRest();
				ss << (j > 0 ? "," : "") << minRest;
			}
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	//输出 dutyMinBrief
	ss << "\t," << "\"dutyMinBrief\":{";
	indexOfRosterWithPairing = 0;
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)		//20191021 ain, mantis#6930, 增加 r->pairing空保护
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		if (r->pairId != 0) {
			std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
				Duty* currDuty = r->pairing->getDuty(j);
				ss << (j > 0 ? "," : "") << currDuty->getMinBrief();
			}
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	//输出 dutyMinDebrief
	ss << "\t," << "\"dutyMinDebrief\":{";
	indexOfRosterWithPairing = 0;
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)		//20191021 ain, mantis#6930, 增加 r->pairing空保护
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		if (r->pairId != 0) {
			std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
				Duty* currDuty = r->pairing->getDuty(j);
				ss << (j > 0 ? "," : "") << currDuty->getMinDebrief();
			}
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	//20190130 ain, mantis#4772, outbox/输出 roster.duty.fdp包含 callin SBY FDP
	ss << "\t," << "\"dutyFdp\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)		//20191021 ain, mantis#6930, 增加 r->pairing空保护
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		//20190430 ain, mantis#5365, 若roster.dutyValue.fdp[]全0才认为尚未赋值, 按pairing.duty.fdp输出, 否则按 roster.dutyValue输出. 针对SUR类 fdp=0符合预期情况
		bool isRosterDutyValueFdpInited = r->dutyValues.isCalculated("FDP");
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			//20190131 ain, mantis#4772, 
			//优先从 roster.dutyValue获取, 为 manday计算过程已包含 callinSbyFdp数值
			//再次从 pairing.duty.plnFdp获取, 需要单独添加 callinSbyFdp
			//20190528 ain, mantis#5584, ruleSrv outbox输出为 actFdp
			int fdp = r->dutyValues.getActFdp(j);
			fdp = isRosterDutyValueFdpInited ? fdp : (r->pairing->getDuty(j)->getPlanFDP() + r->callinSBY_FDPMins);
			ss << (j > 0 ? "," : "") << fdp;
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"dutyMaxFdp\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			auto duty = r->pairing->getDuty(j);
			ss << "\"" << duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP) + duty->getExtendFdpMin()
				<< ((j == r->pairing->getNumDuties() - 1) ? "\"" : "\",");
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"dutyExtendMaxFdp\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			auto duty = r->pairing->getDuty(j);
			ss << "\"" << duty->getExtendFdpMin()
				<< ((j == r->pairing->getNumDuties() - 1) ? "\"" : "\",");
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"dutyDeductionMaxFdp\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)		//20191021 ain, mantis#6930, 增加 r->pairing空保护
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		//20190430 ain, mantis#5365, 若roster.dutyValue.fdp[]全0才认为尚未赋值, 按pairing.duty.fdp输出, 否则按 roster.dutyValue输出. 针对SUR类 fdp=0符合预期情况
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			//20190131 ain, mantis#4772, 
			//优先从 roster.dutyValue获取, 为 manday计算过程已包含 callinSbyFdp数值
			//再次从 pairing.duty.plnFdp获取, 需要单独添加 callinSbyFdp
			//20190528 ain, mantis#5584, ruleSrv outbox输出为 actFdp
			int deductionMaxFdp = r->dutyValues.getDeductionMaxFdp(j);
			ss << (j > 0 ? "," : "") << deductionMaxFdp;
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"dutyFdpDiscretion\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			auto duty = r->pairing->getDuty(j);
			ss << duty->getDutyDelta().getFDPDiscretion()
			   << ((j == r->pairing->getNumDuties() - 1) ? "" : ",");
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"dutyRestDiscretion\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			auto duty = r->pairing->getDuty(j);
			ss << duty->getDutyDelta().getRestDiscretion()
			   << ((j == r->pairing->getNumDuties() - 1) ? "" : ",");
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"additionMinRest\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			auto duty = r->pairing->getDuty(j);
			ss << duty->getDutyDelta().getMinRestMinute()
				<< ((j == r->pairing->getNumDuties() - 1) ? "" : ",");
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	//输出适应状态
	ss << "\t," << "\"acclimatisedState\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			ss << "\"" << r->pairing->getDuty(j)->getAcclimatisedState()
			   << ((j == r->pairing->getNumDuties() - 1) ? "\"" : "\",");
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	//输出适应状态时区
	ss << "\t," << "\"refTimeZone\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			ss << "\"" << r->pairing->getDuty(j)->getRefTimeZone()
				<< ((j == r->pairing->getNumDuties() - 1) ? "\"" : "\",");
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"callinSBY_FDPMins\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		ss << r->callinSBY_FDPMins;
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	//20191003 ain, 合并FDP
	ss << "\t," << "\"dutyMergeFdp\":{";
	int outputCount = 0;
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		bool hasValue = r->dutyValues.isCalculated("MERGE FDP");
		if (!hasValue) {
			//continue;
		}
		if (outputCount > 0)
			ss << ",";

		ss << "\"" << r->rosterId << "\":" << "[";
		string mergeFdp = "";
		bool hasMerge = false;
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			if (r->dutyValues.getMergeFdp(j) > 0)
				hasMerge = true;
			mergeFdp += (j > 0 ? "," : "") + to_string(r->dutyValues.getMergeFdp(j));
			//ss << (j > 0 ? "," : "") << r->dutyValues.getMergeFdp(j);	
		}
		if (hasMerge)
			ss << mergeFdp;
		outputCount++;
		ss << "]";
	}
	ss << "}" << "\n";

	ss << "\t," << "\"dutyMergeDp\":{";
	outputCount = 0;
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		bool hasValue = r->dutyValues.isCalculated("MERGE DP");
		if (!hasValue) {
			//continue;
		}
		if (outputCount > 0)
			ss << ",";

		ss << "\"" << r->rosterId << "\":" << "[";
		string mergeDp = "";
		bool hasMerge = false;
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			if (r->dutyValues.getMergeDp(j) > 0)
				hasMerge = true;
			mergeDp += (j > 0 ? "," : "") + to_string(r->dutyValues.getMergeDp(j));
			//ss << (j > 0 ? "," : "") << r->dutyValues.getMergeFdp(j);	
		}
		if (hasMerge)
			ss << mergeDp;
		outputCount++;
		ss << "]";
	}
	ss << "}" << "\n";

	//20191003 ain, 合并FDP
	ss << "\t," << "\"dutyMergeBlh\":{";
	outputCount = 0;
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)		//20191021 ain, mantis#6930, 增加 r->pairing空保护
			continue;
		bool hasValue = r->dutyValues.isCalculated("MERGE BLH");
		if (!hasValue) {
			//continue;
		}
		if (outputCount > 0)
			ss << ",";

		ss << "\"" << r->rosterId << "\":" << "[";

	/*	std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			ss << (j > 0 ? "," : "") << r->dutyValues.getMergeBlh(j);
		}*/

		string mergeBlh = "";
		bool hasMerge = false;
		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			if (r->dutyValues.getMergeBlh(j) > 0)
				hasMerge = true;
			mergeBlh += (j > 0 ? "," : "") + to_string(r->dutyValues.getMergeBlh(j));
		}
		if (hasMerge)
			ss << mergeBlh;

		outputCount++;
		ss << "]";
	}
	ss << "}" << "\n";

	//20250911 jiaxin.jin 输出roster dp
	ss << "\t," << "\"RostersDP\":{";
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];

		if (i > 0)
			ss << ",";
		
		ss << "\"" << r->rosterId << "\":" << (r->dpMinutes);
	}
	ss << "}" << "\n";

	//20250911 jiaxin.jin 输出roster ground attribute
	ss << "\t," << "\"RosterGroundAttribute\":{";
	outputCount = 0;
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairing)
			continue;
		if (outputCount > 0)
			ss << ",";
		
		ss << "\"" << r->rosterId << "\":" << "\"" << r->attribute << "\"";
		outputCount++;
	}
	ss << "}" << "\n";

	//输出roster ground的min rest
	ss << "\t," << "\"gndMinRst\":{";
	outputCount = 0;
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairing != nullptr)
			continue;
		if (outputCount > 0)
			ss << ",";
        int minRest = static_cast<int>(r->actEndLoc - r->actRestStrLoc) / 60;//单位分钟
		ss << "\"" << r->rosterId << "\":"  << minRest;
		outputCount++;
	}
	ss << "}" << "\n";

	//20240521 jiaxin.jin 增加输出RERRP
	ss << "\t," << "\"RERRPs\":[" << "\n";
	for (std::size_t i = 0; i < crewIndex->rerrpList.size(); i++) {
		const auto & r = crewIndex->rerrpList[i];

		ss << "\t\t{" << "\"idcrew\":\"" << r->crewId << "\"," << "\"startTime\":\"" << utcToUtcString(r->startTimeLoc) << "\"," << "\"endTime\":\"" << utcToUtcString(r->endTimeLoc) << "\"";
		if (i < crewIndex->rerrpList.size() - 1)
			ss << "}," << "\n";
		else
			ss << "}" << "\n";
	}
	ss << "\t]" << "\n";

	//20190130 ain, mantis#4772, outbox/输出 roster.duty.dp
	ss << "\t," << "\"dutyDp\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)		//20191021 ain, mantis#6930, 增加 r->pairing空保护
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";

		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) { 
			//优先从 roster.dutyValue获取
			//若为空再次从 pairing.duty.plnFdp获取
			//20190528 ain, mantis#5584, ruleSrv outbox输出为 actDp
			int dp = r->dutyValues.getActDp(j);
			//dp = dp != 0 ? dp : (r->pairing->getDuty(j)->getPlanDP());
			ss << (j > 0 ? "," : "") << dp;
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"dutyAloftTime\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (r->pairId == 0 || !r->pairing)		//20191021 ain, mantis#6930, 增加 r->pairing空保护
			continue;
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";

		std::size_t dutyCount = r->pairing ? r->pairing->getNumDuties() : 1;
		for (std::size_t j = 0; j < dutyCount; j++) {
			//优先从 roster.dutyValue获取
			//若为空再次从 pairing.duty.plnFdp获取
			//20190528 ain, mantis#5584, ruleSrv outbox输出为 actDp
			int aloftTime = r->dutyValues.getAloftTime(j);
			//dp = dp != 0 ? dp : (r->pairing->getDuty(j)->getAloftTime());
			ss << (j > 0 ? "," : "") << aloftTime;
		}
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"creditedMinutes\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		ss << r->creditMinutes << ","; //Credit Hour(实际时间)。单位分钟，浮点保留二位小数
		ss << r->fmCreditMinutes;      //首月Credit Hour(实际时间)。单位分钟，浮点保留二位小数
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"schCreditedMinutes\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		ss << r->schCreditMinutes << ","; //Credit Hour(计划时间)。单位分钟，浮点保留二位小数
		ss << r->schFmCreditMinutes;      //首月Credit Hour(计划时间)。单位分钟，浮点保留二位小数
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"perDiemMins\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		ss << r->perDiemMins << ",";//PerDiem Hour(实际时间)。单位分钟，浮点保留二位小数
		ss << r->lhPerDiemMins << ",";//Long PerDiem Hour(长PH)(实际时间)。单位分钟，浮点保留二位小数
		ss << r->fmPerDiemMins << ",";//splited first Month PerDiem Hour(跨月第一个月PH分钟数)(实际时间)。单位分钟，浮点保留二位小数
		ss << r->fmLhPerDiemMins;//splited first Month Long PerDiem Hour(跨月第一个月LPH分钟数)(实际时间)。单位分钟，浮点保留二位小数
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"schPerDiemMins\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		ss << r->schPerDiemMins << ",";//PerDiem Hour(计划时间)。单位分钟，浮点保留二位小数
		ss << r->schLhPerDiemMins << ",";//Long PerDiem Hour(长PH)(计划时间)。单位分钟，浮点保留二位小数
		ss << r->schFmPerDiemMins << ",";//splited first Month PerDiem Hour(跨月第一个月PH分钟数)(计划时间)。单位分钟，浮点保留二位小数
		ss << r->schFmLhPerDiemMins;//splited first Month Long PerDiem Hour(跨月第一个月LPH分钟数)(计划时间)。单位分钟，浮点保留二位小数
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";


	ss << "\t," << "\"workingHour\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		ss << r->workingHour;//Working Hour(实际时间)。单位分钟，浮点保留二位小数
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	ss << "\t," << "\"schWorkingHour\":{";
	indexOfRosterWithPairing = 0; //清零, 重新计数
	for (std::size_t i = 0; i < crewIndex->rosterList.size(); i++) {
		auto& r = crewIndex->rosterList[i];
		if (indexOfRosterWithPairing > 0)
			ss << ",";
		ss << "\"" << r->rosterId << "\":" << "[";
		ss << r->schWorkingHour;//Working Hour(计划时间)。单位分钟，浮点保留二位小数
		ss << "]";
		indexOfRosterWithPairing++;
	}
	ss << "}" << "\n";

	if (needOutputManday) {
		//20180319 ain, mantis#2893, violations段末尾逗号按manday段是否存在确定是否输出
		ss << "\t," << "\"manday\":";
		formatToJson_Manday(ss, crewIndex, "\t", dbData);
	}
	ss << "\t," << "\"rosterFlight\":";
	formatToJson_RosterFlight(ss, crewIndex, "\t", dbData);

	if (crewIndex->crewFirstDutyInfo) {
		ss << "\t," << "\"inexperiencedStartDt\":\"" << utcToUtcString(crewIndex->crewFirstDutyInfo->lastFirstDutyDate) << "\"" << "\n";
		ss << "\t," << "\"inexperiencedEndDt\":\"" << (crewIndex->crewFirstDutyInfo->inexperiencedEndDate == 0 ? "" : utcToUtcString(crewIndex->crewFirstDutyInfo->inexperiencedEndDate)) << "\"" << "\n";
	}

	ss << "}" << endl;

	return 0;

}

//**************************************************************
//将Roster列表转为json格式
//**************************************************************
int formatToJson_Roster(ostream &ss, SharedPtr<ROSTER> &roster, string lineStart) {
	int i = 0, j = 0, k = 0;
	ss << lineStart<<  "{" << "\n";
		ss <<lineStart << "\t" << "\"scenarioId\":\"" << roster->idscenario << "\"," << "\n";
		ss << lineStart << "\t" << "\"id\":\"" << "" << "\"," << "\n";//Todo
		ss << lineStart << "\t" << "\"lastModified\":" << roster->tmst << "," << "\n";
		ss << lineStart << "\t" << "\"messageType\":\"" << "" << "\"," << "\n";//Todo
		ss << lineStart << "\t" << "\"processingStatus\":\"" << "" << "\"," << "\n";//Todo
		ss << lineStart << "\t" << "\"crewId\":\"" << roster->idcrew << "\"," << "\n";
		ss << lineStart << "\t" << "\"pairingNumber\":" << roster->pairId << "," << "\n";
		ss << lineStart << "\t" << "\"rosterId\":" << roster->rosterId << "," << "\n";
		ss << lineStart << "\t" << "\"startTimeInUTC\":" << roster->strUtc << "," << "\n";
		ss << lineStart << "\t" << "\"endTimeInUTC\":" << roster->endUtc << "," << "\n";
		ss << lineStart << "\t" << "\"restStartTimeInUTC\":" << roster->restStrUtc << "," << "\n";
		ss << lineStart << "\t" << "\"rosterType\":\"" << roster->duty << "\"," << "\n";
		ss << lineStart << "\t" << "\"actingRank\":\"" << roster->actingRank << "\"," << "\n";
		ss << lineStart << "\t" << "\"source\":\"" << roster->source << "\"," << "\n";
		ss << lineStart << "\t" << "\"idUser\":\"" << roster->idUser << "\"," << "\n";
		ss << lineStart << "\t" << "\"isLegal\":" << (roster->_isLegal ? "true" : "false") << "," << "\n";
		ss << lineStart << "\t" << "\"creditedMinutes\":" << (roster->creditMinutes) << "," << "\n";   //double

		ss << lineStart << "\t" << "\"fmCreditedMinutes\":" << (roster->fmCreditMinutes) << "," << "\n";   //double
		ss << lineStart << "\t" << "\"schCreditedMinutes\":" << (roster->schCreditMinutes) << "," << "\n";   //double
		ss << lineStart << "\t" << "\"schFmCreditedMinutes\":" << (roster->schFmCreditMinutes) << "," << "\n";   //double
		ss << lineStart << "\t" << "\"schPerDiemMins\":" << (roster->schPerDiemMins) << "," << "\n";   //double
		ss << lineStart << "\t" << "\"schLhPerDiemMins\":" << (roster->schLhPerDiemMins) << "," << "\n";   //double
		ss << lineStart << "\t" << "\"schFmPerDiemMins\":" << (roster->schFmPerDiemMins) << "," << "\n";   //double
		ss << lineStart << "\t" << "\"schFmLhPerDiemMins\":" << (roster->schFmLhPerDiemMins) << "," << "\n";   //double

		ss << lineStart << "\t" << "\"workingHour\":" << (roster->workingHour) << "," << "\n";   //double
		ss << lineStart << "\t" << "\"schWorkingHour\":" << (roster->schWorkingHour) << "," << "\n";   //double

		ss << lineStart << "\t" << "\"isAgreeWork\":" << (roster->isAgreeWork ? "1" : "0") << "," << "\n";
		ss << lineStart << "\t" << "\"exceptionCode\":\"" << roster->exceptionCode << "\"," << "\n";

		ss << lineStart << "\t" << "\"pairingId\":" << roster->pairId << "," << "\n";
		ss << lineStart << "\t" << "\"communt\":" << roster->communt << "\n"; //OP#1818, for ruleSrv & editor only, do not save to DB
		
		//mantis#1852 ruleSrv简化json 通过roster.pairingId 传参
		//ss  << lineStart << "\t" << "\"editorPairing\":";
		//if (roster->pairing)
		//	formatToJson_Pairing(ss, roster->pairing, lineStart + "\t");
		//else
		//	ss << "null"<<"\n";
		ss << lineStart<< "}" << "\n";
	
	return 0;
}

//**************************************************************
//将Pairing列表转为json格式
//**************************************************************
int formatToJson_PairingList(ostream &ss, vector<Pairing*> &list, map<long long, vector<RULE_VIOLATION*>>& pairingViolations, CrewDataContext* dbData) {
	//ss << "[" << "\n";
	for (std::size_t i = 0; i < list.size(); i++) {
		if (i > 0)
			ss << "," << "\n";
		ostringstream oss;
		formatToJson_Pairing(oss, list[i], "", pairingViolations[list[i]->getDbId()], dbData);
		ss << oss.str();
	}
	//ss << "]" << "\n";
	return 0;
}


int formatToJson_RosterList(ostream &ss, vector<SharedPtr<ROSTER>> &list, string lineStart) {
	ss << "[" << "\n";
	for (std::size_t i = 0; i < list.size(); i++) {
		if (i > 0)
			ss << lineStart  << "," << "\n";
		formatToJson_Roster(ss, list[i], lineStart);
	}
	ss << lineStart << "]" << "\n";
	return 0;
}

int formatToJson_RosterList(ostream &ss, vector<SharedPtr<ROSTER>> &list) {
	ss << "[" << "\n";
	for (std::size_t i = 0; i < list.size(); i++) {
		if (i > 0)
			ss << "," << "\n";
		formatToJson_Roster(ss, list[i], "");
	}
	ss << "]" << "\n";
	return 0;
}

//**************************************************************
//将dutyCodeViolation列表转为json格式
//**************************************************************
int formatToJson_dutyCodeViolations(ostream& ss, const map<Segment*, bool>& dutyCodeViolationMap) {
	string lineStart = "\t";
	bool first = true;
	for (auto& dutyCodeViolation : dutyCodeViolationMap) {
		auto segment = dutyCodeViolation.first;
		auto violation = dutyCodeViolation.second;
		if (first)
			ss << lineStart << " { ";
		else
			ss << lineStart << ",{ ";
			
		ss << "\"type\":3, ";
		ss << "\"pairingId\":" << segment->getPairingId() << ", ";
		ss << "\"dutySeq\":" << segment->getDutySeq() << ", ";
		ss << "\"fltId\":" << segment->getDBId() << ", ";
		ss << "\"violation\":" << (violation ? "true" : "false");
		ss << " }" << "\n";
		if (first) first = false;
	}
	return 0;
}

//**************************************************************
//将dutyCode列表转为json格式
//**************************************************************
int formatToJson_dutyCodes(ostream& ss, const map<Segment*, DutyCode::DutyCode>& dutyCodeMap) {
	string lineStart = "\t";
	bool first = true;
	for (auto& pair : dutyCodeMap) {
		auto segment = pair.first;
		auto& dutyCode = pair.second;
		if (first)
			ss << lineStart << " { ";
		else
			ss << lineStart << ",{ ";
			
		ss << "\"type\":3, ";
		ss << "\"pairingId\":" << segment->getPairingId() << ", ";
		ss << "\"dutySeq\":" << segment->getDutySeq() << ", ";
		ss << "\"fltId\":" << segment->getDBId() << ", ";
		ss << "\"dutyCodeType\":\"" << dutyTypeToString(dutyCode.GetDutyType()) << "\", ";
		ss << "\"dutyCode\":\"" << dutyCode.GetDutyCode() << "\"";
		ss << " }" << "\n";
		if (first) first = false;
	}
	return 0;
}

//----------------------------------------------------------------------------------------------

//检查指定doc对象是否int
extern bool isInt64Field(Value &v, const char * itemName, const char * fieldName);

//检查指定doc对象是否int
extern bool isIntField(Value &v, const char * itemName, const char * fieldName);

//检查指定doc对象是否int
extern bool isStringField(Value &v, const char * itemName, const char * fieldName);
//检查指定doc对象是否bool
extern bool isBooleanField(Value &v, const char * itemName, const char * fieldName);

//检查指定doc对象是否int
extern bool isArrayField(Value &v, const char * itemName, const char * fieldName);

//util: c_str to std::string
string parseCStyleStrToString(const char* str) {
	string result = "";
	if (str != NULL)
		result = str;
	return result;
}

//------------------------------------------- Check Json ---------------------------------------------------

//检查单个pairing
int checkJson_Pairing(Value &pairing) {

	if (!isInt64Field(pairing, "Pairing", "startTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(pairing, "Pairing", "endTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(pairing, "Pairing", "startTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(pairing, "Pairing", "endTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(pairing, "Pairing", "actStartTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(pairing, "Pairing", "actEndTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(pairing, "Pairing", "actStartTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(pairing, "Pairing", "actEndTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(pairing, "Pairing", "endTimeIncludesRestInUTC")) {
		return ERR_JSON;
	}

	if (!isIntField(pairing, "Pairing", "flightDutyPeriod")) {
		return ERR_JSON;
	}
	if (!isIntField(pairing, "Pairing", "dutyPeriod")) {
		return ERR_JSON;
	}
	if (!isIntField(pairing, "Pairing", "block")) {
		return ERR_JSON;
	}
	if (!isStringField(pairing, "Pairing", "fleetGroup")) {
		return ERR_JSON;
	}
	if (!isStringField(pairing, "Pairing", "primeActivity")
		&& !isStringField(pairing, "Pairing", "primaryDuty")) {
		return ERR_JSON;
	}

	if (!isBooleanField(pairing, "Pairing", "isLegal")) {
		return ERR_JSON;
	}

	//检查：遍历pairnig下duty
	if (!isArrayField(pairing, "Pairing", "duties")) {
		return ERR_JSON;
	}
	Value &duties = pairing["duties"];


	for (SizeType j = 0; j < duties.Size(); j++) {
		Value &duty = duties[j];

		if (!isInt64Field(duty, "Duty", "startTimeInUTC")) {
			return ERR_JSON;
		}
		if (!isInt64Field(duty, "Duty", "endTimeInUTC")) {
			return ERR_JSON;
		}
		//if (!isStringField(duty, "Duty", "depArp")) {
		//	return ERR_JSON;
		//}
		//if (!isStringField(duty, "Duty", "arrArp")) {
		//	return ERR_JSON;
		//}
		if (!isIntField(duty, "Duty", "dutySeq") && !isIntField(duty, "Duty", "dutySegmentNumber")) {
			return ERR_JSON;
		}
		if (!isIntField(duty, "Duty", "minimumBriefTimeInMinutes")) {
			return ERR_JSON;
		}
		if (!isIntField(duty, "Duty", "minimumDeberiefTimeInMinutes")) {
			return ERR_JSON;
		}
		if (!isIntField(duty, "Duty", "minimumPickUpTimeInMinutes")) {
			return ERR_JSON;
		}

		if (!isIntField(duty, "Duty", "minimumDropOffTimeInMinutes")) {
			return ERR_JSON;
		}
		if (!isIntField(duty, "Duty", "minimumRestTimeInMinutes")) {
			return ERR_JSON;
		}
		if (!isIntField(duty, "Duty", "minimumRestTimeInMinutesAtBaseStation")) {
			return ERR_JSON;
		}
		if (!isIntField(duty, "Duty", "maximumBlockTimeInMinutes")) {
			return ERR_JSON;
		}
		if (!isIntField(duty, "Duty", "maximumDutyPeriodInMinutes")) {
			return ERR_JSON;
		}
		if (!isIntField(duty, "Duty", "maximumFlightDutyPeriodInMinutes")) {
			return ERR_JSON;
		}

		//if (!isBooleanField(duty, "Duty", "isLegal")) {
		//	return ERR_JSON;
		//}


		//检查：遍历duty下segment
		if (!isArrayField(duty, "Duty", "editorSegments")) {
			return ERR_JSON;
		}
		Value &segments = duty["editorSegments"];

		for (SizeType k = 0; k < segments.Size(); k++) {
			Value &seg = segments[k];

			if (!isIntField(seg, "Segment", "dutySeq")) {
				return ERR_JSON;
			}
			if (!isStringField(seg, "Segment", "flightNumber")) {
				return ERR_JSON;
			}
			//if (!isStringField(seg, "Segment", "fleetCode")) {
			//	return ERR_JSON;
			//}
			if (!isStringField(seg, "Segment", "departureStation")) {
				return ERR_JSON;
			}
			if (!isStringField(seg, "Segment", "arrivalStation")) {
				return ERR_JSON;
			}
			//if (!isStringField(seg, "Segment", "nextFlightLegNumber")) {
			//	return ERR_JSON;
			//}
			if (!isIntField(seg, "Segment", "segSeq")) {
				return ERR_JSON;
			}
			//if (!isBooleanField(seg, "Segment", "isLegal")) {
			//	return ERR_JSON;
			//}
		}
	}
	return 0;
}

//检查单个roster
int checkJson_Roster(Value &roster) {

	if (!isStringField(roster, "Roster", "scenarioId")) {
		return ERR_JSON;
	}
	if (!isStringField(roster, "Roster", "id")) {
		return ERR_JSON;
	}
	if (!isStringField(roster, "Roster", "crewId")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "startTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "endTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "restStartTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "actStartTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "actEndTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "actRestStartTimeInUTC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "startTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "endTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "restStartTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "actStartTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "actEndTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isInt64Field(roster, "Roster", "actRestStartTimeInLOC")) {
		return ERR_JSON;
	}
	if (!isStringField(roster, "Roster", "rosterType")) {
		return ERR_JSON;
	}
	//if (!isStringField(roster, "Roster", "actingRank")) {
	//	return ERR_JSON;
	//}
	if (!isStringField(roster, "Roster", "source")) {
		return ERR_JSON;
	}
	if (!isStringField(roster, "Roster", "idUser")) {
		return ERR_JSON;
	}
	if (!isBooleanField(roster, "Roster", "isLegal")) {
		return ERR_JSON;
	}
	
	if (roster["editorPairing"].IsNull())
		return 0;
	int ret = checkJson_Pairing(roster["editorPairing"]);
	if (ret != 0) {
		Logger::getRuleLogger()->error("[ERROR] [checkJson_Roster] check json failed (PAIRING).");
		return ret;
	}
	return 0;//success
}

//检查json dom对象 pairing array是否合法
int checkJson_PairingList(Value &pairingArray) {

	//检查：遍历pairing
	for (SizeType i = 0; i < pairingArray.Size(); i++) {
		Value &pairing = pairingArray[i];
		int ret = checkJson_Pairing(pairing);
		if (ret != 0) {
			Logger::getRuleLogger()->error("[ERROR] [checkJson_PairingList] check json failed (PAIRING), index={}.", i);
			return ret;
		}
	}
	return 0;
}

//检查json dom对象 roster array是否合法
int checkJson_RosterList(Value &rosterArray) {

	//检查：遍历pairing
	for (SizeType i = 0; i < rosterArray.Size(); i++) {
		Value &item = rosterArray[i];
		int ret = checkJson_Roster(item);
		if (ret != 0) {
			Logger::getRuleLogger()->error("[ERROR] [checkJson_RosterList] check json failed (ROSTER).");
			return ret;
		}
	}
	return 0;
}


//检查json dom中 roster对象
//根据array中每一元素 .activityType字段判断是否roster，若是
int checkJson_UpdateListRoster(Value &rosterArray) {

	//检查：遍历pairing
	for (SizeType i = 0; i < rosterArray.Size(); i++) {
		Value &doc = rosterArray[i];
		isStringField(doc, "updateItem", "activityType");
		isStringField(doc, "updateItem", "operation");

		string activityType = doc["activityType"].GetString();
		std::transform(activityType.begin(), activityType.end(), activityType.begin(), ::toupper);
		if (activityType == "ROSTER") {
			int ret = checkJson_Roster(doc["activityItem"]);
			if (ret != 0) {
				Logger::getRuleLogger()->error("[ERROR] [checkJson_UpdateListRoster] check json failed (ROSTER).");
				return ret;
			}
		}
	}
	return 0;
}


//检查json dom中 roster对象
//根据array中每一元素 .activityType字段判断是否roster，若是
int checkJson_UpdateList(Value &activityArray) {
	int ret = 0;
	bool success = false;

	//检查：遍历pairing
	for (SizeType i = 0; i < activityArray.Size(); i++) {
		Value &doc = activityArray[i];
		success = isStringField(doc, "updateItem", "activityType");
		JSON_ERR_HANDLER(success, "updateItem", "activityType");
		
		success = isStringField(doc, "updateItem", "operation");
		JSON_ERR_HANDLER(success, "updateItem", "operation");

		string activityType = doc["activityType"].GetString();
		string operation = doc["operation"].GetString();
		std::transform(activityType.begin(), activityType.end(), activityType.begin(), ::toupper);
		std::transform(operation.begin(), operation.end(), operation.begin(), ::toupper);

		if (operation == "UPDATE_ID") {
			success = isInt64Field(doc, "updateItem", "oldId");
			JSON_ERR_HANDLER(success, "updateItem", "oldId");
			success = isInt64Field(doc, "updateItem", "newId");
			JSON_ERR_HANDLER(success, "updateItem", "newId");
		}
		else {
			if (activityType == "ROSTER") {
				int ret = checkJson_Roster(doc["activityItem"]);
				if (ret != 0) {
					Logger::getRuleLogger()->error("[ERROR] [checkJson_UpdateList] check json failed (ROSTER).");
					return ret;
				}
			}
			else if (activityType == "PAIRING") {
				int ret = checkJson_Pairing(doc["activityItem"]);
				if (ret != 0) {
					Logger::getRuleLogger()->error("[ERROR] [checkJson_UpdateList] check json failed (PAIRING).");
					return ret;
				}
			}
		}
	}
	return 0;
}
//------------------------------------------ Parse Json ----------------------------------------------------

int parseJson_FlightList(Value &json, vector<Segment*> &outputList) {

	for (SizeType i = 0; i < json.Size(); i++) {

		Value &item = json[i];
		Segment * s = parseJson_Segment(item);
		if (s != NULL) {
			outputList.push_back(s);
		}
	}
	return 0;
}

//检查json dom对象 pairingArray是否合法
//同时检查pairing下各个 duty\ segment是否合法
//成功返回0，出错返回错误码，详细错误信息可getLastErrMsg()获取
int parseJson_PairingList(Value &pairingArray, vector<Pairing*> &outputList) {

	for (SizeType i = 0; i < pairingArray.Size(); i++) {

		Value &docPairing = pairingArray[i];
		Pairing * p = parseJson_Pairing(docPairing);
		if (p != NULL) {
			outputList.push_back(p);
		}
	}
	return 0;
}

//检查json dom对象 pairingArray是否合法
//同时检查pairing下各个 duty\ segment是否合法
//成功返回0，出错返回错误码，详细错误信息可getLastErrMsg()获取
int parseJson_RosterList(Value &jsonArray, vector<SharedPtr<ROSTER>> &outputList) {

	for (SizeType i = 0; i < jsonArray.Size(); i++) {

		Value &doc = jsonArray[i];
		SharedPtr<ROSTER> item = parseJson_Roster(doc);
		if (item != NULL && item.get() != NULL) {
			outputList.push_back(item);
		}
	}
	return 0;
}

void formatJson_printTime(ostream& ss, string intend, Activity * activity) {

	ss << intend << "\"startTimeInUTC\":" << activity->getStartTimeUtcSch() << "," << "\n";        //int
	ss << intend << "\"endTimeInUTC\":" << activity->getEndTimeUtcSch() << "," << "\n";        //int
	ss << intend << "\"startTimeInLOC\":" << activity->getStartTimeLocSch() << "," << "\n";        //int
	ss << intend << "\"endTimeInLOC\":" << activity->getEndTimeLocSch() << "," << "\n";        //int
	ss << intend << "\"actStartTimeInUTC\":" << activity->getStartTimeUtcAct() << "," << "\n";        //int
	ss << intend << "\"actEndTimeInUTC\":" << activity->getEndTimeUtcAct() << "," << "\n";        //int
	ss << intend << "\"actStartTimeInLOC\":" << activity->getStartTimeLocAct() << "," << "\n";        //int
	ss << intend << "\"actEndTimeInLOC\":" << activity->getEndTimeLocAct() << "," << "\n";        //int
}

void parseJson_setTime(Value& value, Activity* activity) {

	time_t schStartUtc = value.HasMember("startTimeInUTC") ? value["startTimeInUTC"].GetInt64() : value["startTimeInUtc"].GetInt64();
	time_t schEndUtc = value.HasMember("endTimeInUTC") ? value["endTimeInUTC"].GetInt64() : value["endTimeInUtc"].GetInt64();

	activity->setStartTimeUtcSch(value["startTimeInUTC"].GetInt64());
	activity->setEndTimeUtcSch(value["endTimeInUTC"].GetInt64());
	activity->setStartTimeLocSch(value["startTimeInLOC"].GetInt64());
	activity->setEndTimeLocSch(value["endTimeInLOC"].GetInt64());
	activity->setStartTimeUtcAct(value["actStartTimeInUTC"].GetInt64());
	activity->setEndTimeUtcAct(value["actEndTimeInUTC"].GetInt64());
	activity->setStartTimeLocAct(value["actStartTimeInLOC"].GetInt64());
	activity->setEndTimeLocAct(value["actEndTimeInLOC"].GetInt64());
}
PairingDutyNode* parseJson_PairingDutyNode(Value &doc){
	PairingDutyNode* pDN = new PairingDutyNode();
	if (doc.HasMember("id")) pDN->setId(doc["id"].GetInt64());
	if (doc.HasMember("pairingId")) pDN->setPairingId(doc["pairingId"].GetInt64());
	if (doc.HasMember("dutyId")) pDN->setDutyId(doc["dutyId"].GetInt64());
	if (doc.HasMember("fromFltId")) pDN->setFromSegmentId(doc["fromFltId"].GetInt64());//废弃
	if (doc.HasMember("toFltId")) pDN->setToSegmentId(doc["toFltId"].GetInt64());	//废弃
	if (doc.HasMember("fromSegmentId")) pDN->setFromSegmentId(doc["fromSegmentId"].GetInt64());
	if (doc.HasMember("toSegmentId")) pDN->setToSegmentId(doc["toSegmentId"].GetInt64());
	if (doc.HasMember("sequence")) pDN->setSequence(doc["sequence"].GetInt());
	if (doc.HasMember("type")) pDN->setType(doc["type"].GetString());
	if (doc.HasMember("node")) pDN->setNode(doc["node"].GetString());
	if (doc.HasMember("startLoc")) pDN->setStartLoc(doc["startLoc"].GetInt64());
	if (doc.HasMember("endLoc")) pDN->setEndLoc(doc["endLoc"].GetInt64());
	//20200522 ain, 补齐dutyNode utc赋值
	if (doc.HasMember("startUtc")) pDN->setStartUtc(doc["startUtc"].GetInt64());
	if (doc.HasMember("endUtc")) pDN->setEndUtc(doc["endUtc"].GetInt64());

	if (doc.HasMember("groupId")) pDN->setGroupId(doc["groupId"].GetInt64());
	if (doc.HasMember("airport")) pDN->setAirport(doc["airport"].GetString());//mantis#6761, 问题3, 补齐airport字段
	if (doc.HasMember("isManualModify")) pDN->setIsManualModify(doc["isManualModify"].GetBool());//mantis#6761, 问题3, 补齐airport字段
	return pDN;
}

//从doc对象创建Duty，返回Duty*为函数内new得到
Duty * parseJson_Duty(Value &value) {
	vector<Segment*> segList;
	Value &segments = value["editorSegments"];

	for (SizeType i = 0; i < segments.Size(); i++) {
		Segment * seg = parseJson_Segment(segments[i]);
		segList.push_back(seg);
	}
	vector<PairingDutyNode*> pairingDutyNodeList;
	//20190926 ain, mantis#6765, 自适应dutyNode数据
	if (value.HasMember("dutyNodes")) {
		Value &pairingDutyNodes = value["dutyNodes"];

		for (SizeType i = 0; i < pairingDutyNodes.Size(); i++) {
			PairingDutyNode * pairingDutyNode = parseJson_PairingDutyNode(pairingDutyNodes[i]);
			pairingDutyNodeList.push_back(pairingDutyNode);
		}
	}

	Duty * d = NULL;
	if (segList.empty())
		d = new Duty();
	else
		d = new Duty(segList);
	for (auto pdn : pairingDutyNodeList){
		d->pairingDutyNodes.push_back(shared_ptr<PairingDutyNode>(pdn));
	}
	parseJson_setTime(value, d);

	if (value.HasMember("id")) d->setDutyId(value["id"].GetInt64());//20190526 ain, duty.id供ruleSrv判断是否新增duty

	d->setPairingId(value["pairingId"].GetInt64()); //20180429 ain, mantis#3241, 补齐json pairingId
	d->setDutySeq(value["dutySeq"].GetInt());

	d->setMinBrief(value["minimumBriefTimeInMinutes"].GetInt());
	d->setMinDebrief(value["minimumDeberiefTimeInMinutes"].GetInt());
	d->setMinPickup(value["minimumPickUpTimeInMinutes"].GetInt());
	d->setMinDropoff(value["minimumDropOffTimeInMinutes"].GetInt());
	d->setMinRest(value["minimumRestTimeInMinutes"].GetInt());
	d->setMinRestAtBase(value["minimumRestTimeInMinutesAtBaseStation"].GetInt());

	d->setActualBriefMin(value["actualCheckInInMinutes"].GetInt());
	d->setActualDebriefMin(value["actualCheckOutInMinutes"].GetInt());
	d->setActualPickupMin(value["actualPickUpInMinutes"].GetInt());
	d->setActualDropoffMin(value["actualDropOffInMinutes"].GetInt());
	d->setActualRest(value["actualRestInMinutes"].GetInt());
	d->setDisplayedActualRest(value["actualRestInMinutes"].GetInt());

	if (value.HasMember("depArp")) d->setDepStation(value["depArp"].GetString());
	if (value.HasMember("arrArp")) d->setArrStation(value["arrArp"].GetString());

	if (value.HasMember("isManualModify")) d->setIsManualModify(value["isManualModify"].GetBool());
	if (value.HasMember("briefNeedRuleReCalc")) d->setBriefNeedRuleReCalc(value["briefNeedRuleReCalc"].GetBool());
	if (value.HasMember("debriefNeedRuleReCalc")) d->setDebriefNeedRuleReCalc(value["debriefNeedRuleReCalc"].GetBool());
	//mantis#3253, 从inbox读入 plan blk/fdp/dp
	if (value.HasMember("planBlkMinutes")) d->setBLKInMins(value["planBlkMinutes"].GetInt());
	if (value.HasMember("planFdpMinutes")) d->setFDPInSecs(value["planFdpMinutes"].GetInt() * 60);
	if (value.HasMember("planDutyMinutes")) d->setDPInSecs(value["planDutyMinutes"].GetInt() * 60);
	//20180904 ain, mantis#3967, duty.actBlk/actDP
	if (value.HasMember("actBlkMinutes")) d->setActualBlockTime(value["actBlkMinutes"].GetInt());
	if (value.HasMember("actFdpMinutes")) d->setActualFDP(value["actFdpMinutes"].GetInt());
	if (value.HasMember("actDutyMinutes")) d->setActualDP(value["actDutyMinutes"].GetInt());
	if (value.HasMember("layoverNights")) d->setNumLayoverNights(value["layoverNights"].GetInt());
	if (value.HasMember("checkinMinimumRestTimeInMinutes")) { /*d->setCheckInMinRest(value["checkinMinimumRestTimeInMinutes"].GetInt());*/ }

	//20200504 ain, mantis#8265, duty.assignment
	if (value.HasMember("assignment")) d->setAssignment(value["assignment"].GetString());

	//d->setPairingNum(value["pairingNumber"].GetString());

	if (value.HasMember("longTransitMins")) d->setLongTransitMins(value["longTransitMins"].GetInt());

	if (value.HasMember("discretionType")) {
		d->setOriginDiscretionType(value["discretionType"].GetString());

		std::vector<std::string> discretionTypeExs;
		split(value["discretionType"].GetString(), ',', discretionTypeExs);

		vector<std::string> discretionTypes;
		for (auto& discretionTypeEx : discretionTypeExs) {
			vector<string> splitstrs;
			split(discretionTypeEx, '-', splitstrs);
			if (splitstrs.size() >= 2) {
				discretionTypes.emplace_back(splitstrs[0]);
				d->setManualDiscretion(splitstrs[0], atoi(splitstrs[1].c_str()));
			}
			else {
				discretionTypes.emplace_back(discretionTypeEx);
			}
		}

		d->setDiscretionTypes(discretionTypes);
	}
	if (value.HasMember("manualFdpDiscretion")) { /*d->setManualFdpDiscretion(value["manualFdpDiscretion"].GetInt());*/ }
	if (value.HasMember("manualFtDiscretion")) { /*d->setManualFtDiscretion(value["manualFtDiscretion"].GetInt());*/ }
	if (value.HasMember("manualRestDiscretion")) { /*d->setManualRestDiscretion(value["manualRestDiscretion"].GetInt());*/ }
	if (value.HasMember("manualDpDiscretion")) { /*d->setManualDpDiscretion(value["manualDpDiscretion"].GetInt());*/ }
	if (value.HasMember("manualSectorDiscretion")) { /*d->setManualSectorDiscretion(value["manualSectorDiscretion"].GetInt());*/ }
	if (value.HasMember("trainingAddTime")) d->setTrainingAddTime(value["trainingAddTime"].GetInt() == 1);

	if (value.HasMember("isManualMaxFdp")) d->setIsManualMaxFdp(value["isManualMaxFdp"].GetInt() == 1);
	if (value.HasMember("maxFdpMin")) d->setManualMaxFdp(value["maxFdpMin"].GetInt());

	if (value.HasMember("creditedMinutes")) d->setCreditInSec((int)(value["creditedMinutes"].GetDouble() * 60));//Credit Hour(实际时间)
	if (value.HasMember("fmCreditedMinutes")) d->setFirstMonthCreditInSec((int)(value["fmCreditedMinutes"].GetDouble() * 60));//首月Credit Hour(实际时间)
	if (value.HasMember("schCreditedMinutes")) d->setSchCreditInSec((int)(value["schCreditedMinutes"].GetDouble() * 60));//Credit Hour(计划时间)
	if (value.HasMember("schFmCreditedMinutes")) d->setSchFirstMonthCreditInSec((int)(value["schFmCreditedMinutes"].GetDouble() * 60));//首月Credit Hour(计划时间)
	if (value.HasMember("plnWpMin")) d->setPlanWorkPeriodInSec((int)(value["plnWpMin"].GetDouble() * 60));
	if (value.HasMember("actWpMin")) d->setActWorkPeriodInSec((int)(value["actWpMin"].GetDouble() * 60));
	if (value.HasMember("wpAdjustment")) d->setWorkPeriodAdjustmentInSec((int)(value["wpAdjustment"].GetDouble() * 60));
	if (value.HasMember("fdpDiscretionMin")) d->setFdpDiscretion(value["fdpDiscretionMin"].GetInt());
	if (value.HasMember("attribute")) d->setAttributes(value["attribute"].GetString());

	int BLK = value["maximumBlockTimeInMinutes"].GetInt();
	int DP = value["maximumDutyPeriodInMinutes"].GetInt();
	int FDP = value["maximumFlightDutyPeriodInMinutes"].GetInt();
	
	d->setMaxDutyMin(DP);
	//mantis#5837, updatePairing, 避免每次重算 duty.start = seg.start - brief
	//d->calculateDutyValues();
	d->calculateDutyBlockTime();

	//20211011 ain, mantis#9462, 按下属是否包含 FLY/DHD赋值 duty.duty_type
	d->resetTypeBySegments();

	return d;
}

//从doc对象创建 Segment，返回 Segment*为函数内new得到
Segment * parseJson_Segment(Value &doc) {

	Segment * s = new Segment();

	parseJson_setTime(doc, s);
	if (doc.HasMember("id")) s->setSegmentId(doc["id"].GetInt64());//20190526 ain, duty.id供ruleSrv判断是否新增duty
	if (doc.HasMember("pairingId")) s->setPairingId(doc["pairingId"].GetInt64()); //20180429 ain, mantis#3241, 补齐json pairingId
	if (doc.HasMember("dutySeq")) s->setDutySeq(doc["dutySeq"].GetInt());
	if (doc.HasMember("segSeq")) s->setSegSeq(doc["segSeq"].GetInt());
	if (doc.HasMember("flightNumber")) s->setSegNumber(doc["flightNumber"].GetString());
	if (doc.HasMember("airlineCode")) s->setAirline(doc["airlineCode"].GetString());
	if (doc.HasMember("flightNumber")) s->setFlightNumber(doc["flightNumber"].GetString());

	if (doc.HasMember("fltDt")) {
		auto& fltDtNode = doc["fltDt"];
		if (fltDtNode.IsInt64()) {
			s->setDate(utcToUtcDtString(fltDtNode.GetInt64()));
		}
		else if (fltDtNode.IsString()) {
			s->setDate(fltDtNode.GetString());
        }
	}

	if (isStringField(doc, "Segment", "fleetCode")) {
		s->setFleetCD(doc["fleetCode"].GetString());
	}
	if (doc.HasMember("subFleet")) {
		s->setSubFleet(doc["subFleet"].GetString());
	}
	if (doc.HasMember("estDepDtLoc")){
		s->setEstDepDtLoc(doc["estDepDtLoc"].GetInt64());
	}
	else {
		s->setEstDepDtLoc(s->getStartTimeLocAct());
	}
	if (doc.HasMember("estDepDtUtc")){
		s->setEstDepDtUtc(doc["estDepDtUtc"].GetInt64());
	}
	else {
		s->setEstDepDtUtc(s->getStartTimeUtcAct());
	}
	if (doc.HasMember("estArvDtLoc")){
		s->setEstArvDtLoc(doc["estArvDtLoc"].GetInt64());
	}
	else {
		s->setEstArvDtLoc(s->getEndTimeLocAct());
	}
	if (doc.HasMember("estArvDtUtc")){
		s->setEstArvDtUtc(doc["estArvDtUtc"].GetInt64());
	}
	else {
		s->setEstArvDtUtc(s->getEndTimeUtcAct());
	}
	if (doc.HasMember("etdChgTm")){
		s->setEtdChgTm(doc["etdChgTm"].GetInt64());
	}
	if (doc.HasMember("estDepDtLoc")){
		s->setEstDepDtLoc(doc["estDepDtLoc"].GetInt64());
	}
	if (doc.HasMember("fltDelayNotifyUtc")) {
		s->setFltDelayNotifyUtc(doc["fltDelayNotifyUtc"].GetInt64());
	}
	if (doc.HasMember("fltLastDelayEtdUtc")) {
		s->setFltLastDelayEtdUtc(doc["fltLastDelayEtdUtc"].GetInt64());
	}

	s->setDepStation(doc["departureStation"].GetString());
	s->setArrStation(doc["arrivalStation"].GetString());
	//s->setLegality(doc["isLegal"].GetBool());
	string assignment = doc.HasMember("assignmentType") ? doc["assignmentType"].GetString() : "";
	s->setAssignment(assignment); //mantis#3073
	if (0 == assignment.compare("FLY") || 0 == assignment.compare("OPR"))
	{
		s->setIsOperating(true);
		s->setIsBusFerry(false);
	}
	else
		s->setIsOperating(false);

	if (doc.HasMember("nextFlightLegNumber"))
		s->setNextLegNo(doc["nextFlightLegNumber"].GetString());
	//ROISs->setBase(doc["baseStation"].GetString());
	if (doc.HasMember("fltId"))
		s->setDBId(doc["fltId"].GetInt64());
	if (doc.HasMember("register")) {
		s->setRegister(doc["register"].GetString());
		s->setTailNum(doc["register"].GetString());
	}
	
	//20180710 ain, mantis#3613, checkPairing inbox/ 补齐 segment.plan/fill
	if (doc.HasMember("planComposition")) {
		Value &fillComp = doc["planComposition"];
		for (Value::MemberIterator itr = fillComp.MemberBegin(); itr != fillComp.MemberEnd(); ++itr){
			string getStr = (string)itr->name.GetString();
			s->addPlanComposition(getStr, itr->value.GetInt());
		}
	}
	if (doc.HasMember("fillComposition")) {
		Value &fillComp = doc["fillComposition"];
		for (Value::MemberIterator itr = fillComp.MemberBegin(); itr != fillComp.MemberEnd(); ++itr){
			string getStr = (string)itr->name.GetString();
			s->fillCompositionRank(getStr, itr->value.GetInt());
		}
	}
	//20181010 ain, mantis#4207, ruleSrv inbox segment.tailNum
	if (doc.HasMember("tailNumber")) {
		string tailNumber = doc["tailNumber"].GetString();
		s->setTailNum(tailNumber);
	}
	if (doc.HasMember("segType")) {
		string segType = doc["segType"].GetString();
		s->setDomIntType(segType);
	}
	if (doc.HasMember("fltType")) {
		string fltType = doc["fltType"].GetString();
		s->setFltType(fltType);
	}
	if (doc.HasMember("rankCombC9aP")) {
		long long rankCombC9aP = doc["rankCombC9aP"].GetInt64();
		s->setRankCombCP(rankCombC9aP);
	}
	if (doc.HasMember("rankCombC9aC")) {
		long long rankCombC9aC = doc["rankCombC9aC"].GetInt64();
		s->setRankCombCC(rankCombC9aC);
	}
	if (doc.HasMember("rankCombC9aA")) {
		long long rankCombC9aA = doc["rankCombC9aA"].GetInt64();
		s->setRankCombCA(rankCombC9aA);
	}
	if (doc.HasMember("rankCombO9aP")) {
		string rankCombOP = doc["rankCombO9aP"].GetString();
		s->setRankCombOP(rankCombOP);
	}
	if (doc.HasMember("rankCombO9aC")) {
		string rankCombOC = doc["rankCombO9aC"].GetString();
		s->setRankCombOC(rankCombOC);
	}
	if (doc.HasMember("rankCombO9aA")) {
		string rankCombOA = doc["rankCombO9aA"].GetString();
		s->setRankCombOA(rankCombOA);
	}

	if (doc.HasMember("lastModify")) {
		s->setLastModify(doc["lastModify"].GetInt64());
	}
	if (doc.HasMember("actBrief")) {
		s->setActBrief(doc["actBrief"].GetBool());
	}
	if (doc.HasMember("blkMin")) {
		s->setBlkSeconds(doc["blkMin"].GetInt() * 60);
		s->setBlkMinHistory(doc["blkMin"].GetInt());
		if (s->getBlkMinHistory() > 0)
			s->setHistoricalBlhFlag(true);
	}
	if (doc.HasMember("wpMins")) {
		s->setWorkPeriodInSec((int)(doc["wpMins"].GetDouble()* 60));
	}

	if (doc.HasMember("creditedMinutes")) {
		s->setCreditInSec((int)(doc["creditedMinutes"].GetDouble() * 60));//Credit Hour(实际时间)
	}
	if (doc.HasMember("fmCreditedMinutes")) {
		s->setFirstMonthCreditInSec((int)(doc["fmCreditedMinutes"].GetDouble() * 60));//首月Credit Hour(实际时间)
	}
	if (doc.HasMember("schCreditedMinutes")) {
		s->setSchCreditInSec((int)(doc["schCreditedMinutes"].GetDouble() * 60));//Credit Hour(计划时间)
	}
	if (doc.HasMember("schFmCreditedMinutes")) {
		s->setSchFirstMonthCreditInSec((int)(doc["schFmCreditedMinutes"].GetDouble() * 60));//首月Credit Hour(计划时间)
	}

	if (doc.HasMember("dutyCodeType")) {
		string dutyCodeType = doc["dutyCodeType"].GetString();
		s->setDutyCodeType(dutyCodeType);
	}

	if (doc.HasMember("newDutyCode")) {
		string newDutyCode = doc["newDutyCode"].GetString();
		s->setDutyCode(newDutyCode);
	}
	return s;
}

Pairing* parseJson_Pairing(Value& docPairing) {
	vector<UpdatePairingDutyNode> updatePairingDutyNodes;
	return parseJson_Pairing(docPairing, updatePairingDutyNodes);
}

//从JSON解析单个Pairing，返回值 Pairing*为函数内new得到
Pairing * parseJson_Pairing(Value &docPairing, vector<UpdatePairingDutyNode>& updatePairingDutyNodes) {

	//check the message status & type
	string msgType = docPairing["messageType"].GetString();
	string procStatus = docPairing["processingStatus"].GetString();
	if (msgType.compare("INCOMING") != 0 && procStatus.compare("NEW") != 0)
		return NULL;

	//Duty
	vector<Duty*> dutyList;
	Value &duties = docPairing["duties"];
	for (SizeType j = 0; j < duties.Size(); j++) {
		Duty * d = parseJson_Duty(duties[j]);
		dutyList.push_back(d);

		RecalDutyNodeFlag calcDutyNodeFlag = parseJson_calcPairingDutyNode(duties[j]);
		UpdatePairingDutyNode updateDutyNode;
		updateDutyNode.pairingId = d->getPairingId();
		updateDutyNode.dutyId = d->getDutyId();
		updateDutyNode.recalDutyNodeFlag = calcDutyNodeFlag;
		updatePairingDutyNodes.push_back(updateDutyNode);
	}

	//new Pairing
	Pairing * p = NULL;
	if (dutyList.empty())
		p = new Pairing();
	else
		p = new Pairing(dutyList);

	parseJson_setTime(docPairing, p);

	int BLK = docPairing["block"].GetInt();
	p->setBLK(BLK / 60, BLK % 60);

	int DP = docPairing["dutyPeriod"].GetInt();
	p->setDP(DP / 60, DP % 60);

	int FDP = docPairing["flightDutyPeriod"].GetInt();
	p->setFDP(FDP / 60, FDP % 60);
	
	//p->setLegality(docPairing["isLegal"].GetBool());

	//pair_id
	long long pair_id = 0;
	if (docPairing["id"].IsString()) {
		const char * pairingNumStr = docPairing["id"].GetString();
		pair_id = atoll(pairingNumStr);
	}
	else {
		pair_id = docPairing["id"].GetInt64();
	}	p->setDbId(pair_id);

	long long scenarioId = 0;
	if (docPairing.HasMember("scenarioId")) {
		if (docPairing["scenarioId"].IsString()) {
			scenarioId = atoll(docPairing["scenarioId"].GetString());
		}
		else {
			scenarioId = docPairing["scenarioId"].GetInt64();
		}
	}
	p->setScenarioId(scenarioId);

	long long rankCombP = 0;
	if (docPairing["rankCombC9aP"].IsString()) {
		rankCombP = atoll(docPairing["rankCombC9aP"].GetString());
	}
	else if (docPairing["rankCombC9aP"].IsInt64()) {
		rankCombP = docPairing["rankCombC9aP"].GetInt64();
	}
	else
	{
		rapidjson::Type rtType = docPairing["rankCombC9aP"].GetType();

		//Logger::getRuleLogger()->info("rankCombC9aP type={}", rtType);
	}
	p->setRankCombCP(rankCombP);

	long long rankCombC = 0;
	if (docPairing["rankCombC9aC"].IsString()) {
		rankCombC = atoll(docPairing["rankCombC9aC"].GetString());
	}
	else  if (docPairing["rankCombC9aC"].IsInt64()){
		rankCombC = docPairing["rankCombC9aC"].GetInt64();
	}
	else
	{
		rapidjson::Type rtType=docPairing["rankCombC9aC"].GetType();
		
		//Logger::getRuleLogger()->info("rankCombC9aC type={}",rtType);
	}
	p->setRankCombCC(rankCombC);

	long long rankCombA = 0;
	if (docPairing["rankCombC9aA"].IsString()) {
		rankCombA = atoll(docPairing["rankCombC9aA"].GetString());
	}
	else  if (docPairing["rankCombC9aA"].IsInt64()) {
		rankCombA = docPairing["rankCombC9aA"].GetInt64();
	}
	else {
		rapidjson::Type rtType = docPairing["rankCombC9aA"].GetType();

		//Logger::getRuleLogger()->info("rankCombC9aA type={}", rtType);
	}
	p->setRankCombCA(rankCombA);

	//other field
	char * primeActivity = (char*) ( docPairing.HasMember("primeActivity") ? docPairing["primeActivity"].GetString() : docPairing["primaryDuty"].GetString());
	string base = parseCStyleStrToString(docPairing["baseAirport"].GetString());
	string endArp = docPairing.HasMember("endAirport") ? parseCStyleStrToString(docPairing["endAirport"].GetString()) : base;//20181117 ain, mantis#4430, ruleSrv inbox, pairing.endArp
	string primeAct = parseCStyleStrToString(primeActivity);
	string fleet = parseCStyleStrToString(docPairing["fleetGroup"].GetString());
	string qualifer = parseCStyleStrToString((docPairing.HasMember("qualifer") ? docPairing["qualifer"].GetString() : ""));
	p->setBase(base);
	p->setEndArp(endArp);
	p->setPrimeActivity(primeAct);
	p->setQualifier(qualifer);

	Value &pairingComp = docPairing["pairingComplements"];

	for (Value::MemberIterator ite = pairingComp.MemberBegin(); ite != pairingComp.MemberEnd(); ++ite){
		p->addComplement((string)ite->name.GetString(), ite->value.GetInt());
	}

	p->setFltCode(fleet);

	//20180703 ain, OP#1806, ruleSrv解析pairing.blockMinsAdjust/ perDiemMinsAdjust
	if (docPairing.HasMember("blockMinsAdjustment")) p->setBlockMinsAdjustment((int)docPairing["blockMinsAdjustment"].GetDouble());
	if (docPairing.HasMember("attribute")) p->setAttribute(parseCStyleStrToString(docPairing["attribute"].GetString()));//20190224 ain, OP#2003
	if (docPairing.HasMember("label")) p->setLabel(parseCStyleStrToString(docPairing["label"].GetString()));

	if (docPairing.HasMember("division")) p->setDivision(parseCStyleStrToString(docPairing["division"].GetString()));//20190615 ain, mantis#5992

	if (docPairing.HasMember("perDiemMins")) {
		p->setPerDiemInSec((int)(docPairing["perDiemMins"].GetDouble() * 60)); //PerDiem(实际时间)
	}
	if (docPairing.HasMember("perDiemMinsAdjustment")) {
		p->setPerDiemAdjustmentInSec((int)(docPairing["perDiemMinsAdjustment"].GetDouble() * 60)); //PerDiem调整值(实际时间)
	}
	///
	if (docPairing.HasMember("lhPerDiemMins")) {
		p->setPerDiemInSec((int)(docPairing["lhPerDiemMins"].GetDouble() * 60)); //Long PerDiem(实际时间)
	}
	if (docPairing.HasMember("fmPerDiemMins")) {
		p->setPerDiemInSec((int)(docPairing["fmPerDiemMins"].GetDouble() * 60)); //PerDiem首月(实际时间)
	}
	if (docPairing.HasMember("fmLhPerDiemMins")) {
		p->setPerDiemInSec((int)(docPairing["fmLhPerDiemMins"].GetDouble() * 60)); //Long PerDiem首月(实际时间)
	}

	if (docPairing.HasMember("schPerDiemMins")) {
		p->setSchPerDiemInSec((int)(docPairing["schPerDiemMins"].GetDouble() * 60)); //PerDiem(计划时间)
	}
	if (docPairing.HasMember("schLhPerDiemMins")) {
		p->setSchPerDiemInSec((int)(docPairing["schLhPerDiemMins"].GetDouble() * 60)); //Long PerDiem(计划时间)
	}
	if (docPairing.HasMember("schFmPerDiemMins")) {
		p->setSchPerDiemInSec((int)(docPairing["schFmPerDiemMins"].GetDouble() * 60)); //PerDiem首月(计划时间)
	}
	if (docPairing.HasMember("schFmLhPerDiemMins")) {
		p->setSchPerDiemInSec((int)(docPairing["schFmLhPerDiemMins"].GetDouble() * 60)); //Long PerDiem首月(计划时间)
	}

	if (docPairing.HasMember("wpMins")) {
		p->setWorkPeriodInSec((int)(docPairing["wpMins"].GetDouble() * 60)); //Work Hour(实际时间)
	}
	if (docPairing.HasMember("wpMinsAdjustment")) {
		p->setWorkPeriodAdjustmentInSec((int)(docPairing["wpMinsAdjustment"].GetDouble() * 60)); //Work Hour调整值(实际时间)
	}
	if (docPairing.HasMember("schWpMins")) {
		p->setSchWorkPeriodInSec((int)(docPairing["schWpMins"].GetDouble() * 60)); //Work Hour(计划时间)
	}
	if (docPairing.HasMember("courseCode")) {
		p->SetCourseCode(docPairing["courseCode"].GetString());
	}
	if (docPairing.HasMember("courseType")) {
		p->SetCourseType(docPairing["courseType"].GetString());
	}
	if (docPairing.HasMember("airlineCode")) {
		p->setFiliale(docPairing["airlineCode"].GetString());
	}
	if (docPairing.HasMember("filiale")) {
		p->setFiliale(docPairing["filiale"].GetString());
	}

	fixPairingDuty(p); //修复Pairing、Duty和PairingDutyNode可能数据错误

    //初始化计算Pairing的assignedDutyCode
	p->initAssignedDutyCode();

	return p;
}

//从JSON解析单个ROSTER，返回值为函数内创建
SharedPtr<ROSTER> parseJson_Roster(Value &docRoster) {

	SharedPtr<ROSTER> roster(new ROSTER);

	string scenarioId = parseCStyleStrToString(docRoster["scenarioId"].GetString());
	roster->idscenario = atoll(scenarioId.c_str());
	if (isStringField(docRoster, "roster", "rosterId")) {
		roster->rosterId = atoll(docRoster["rosterId"].GetString());
	}
	string id = parseCStyleStrToString(docRoster["id"].GetString());//TODO:
	roster->idcrew = parseCStyleStrToString(docRoster["crewId"].GetString());
	roster->strUtc = docRoster["startTimeInUTC"].GetInt64();
	roster->endUtc = docRoster["endTimeInUTC"].GetInt64();
	roster->restStrUtc = docRoster["restStartTimeInUTC"].GetInt64();
	roster->actStrUtc = docRoster["actStartTimeInUTC"].GetInt64();
	roster->actEndUtc = docRoster["actEndTimeInUTC"].GetInt64();
	roster->actRestStrUtc = docRoster["actRestStartTimeInUTC"].GetInt64();

	//mantis#2556, 补齐 ruleSrv input, loc时间, role, subRole, position, origin
	roster->strLoc = docRoster["startTimeInLOC"].GetInt64();
	roster->endLoc = docRoster["endTimeInLOC"].GetInt64();
	roster->restStrLoc = docRoster["restStartTimeInLOC"].GetInt64();
	roster->actStrLoc = docRoster["actStartTimeInLOC"].GetInt64();
	roster->actEndLoc = docRoster["actEndTimeInLOC"].GetInt64();
	roster->actRestStrLoc = docRoster["actRestStartTimeInLOC"].GetInt64();
	if (docRoster.HasMember("role")) roster->role = parseCStyleStrToString(docRoster["role"].GetString());
	if (docRoster.HasMember("subRole")) roster->subRole = parseCStyleStrToString(docRoster["subRole"].GetString());
	if (docRoster.HasMember("position")) roster->position = parseCStyleStrToString(docRoster["position"].GetString());
	if (docRoster.HasMember("origin")) roster->origin = parseCStyleStrToString(docRoster["origin"].GetString());
	//if (docRoster.HasMember("preference")) roster->preference = parseCStyleStrToString(docRoster["preference"].GetString());
	if (docRoster.HasMember("isRequested")) roster->isRequested = docRoster["isRequested"].GetBool();
	if (docRoster.HasMember("isSwap")) roster->isSwapped = docRoster["isSwap"].GetBool();
	if (docRoster.HasMember("isPublished")) roster->isPublished = docRoster["isPublished"].GetBool();
	if (docRoster.HasMember("seqOrder")) roster->seqOrder = docRoster["seqOrder"].GetInt();
	//2023.1.17 add assignment
	if (docRoster.HasMember("assignment")) roster->duty = parseCStyleStrToString(docRoster["assignment"].GetString());

	roster->duty = parseCStyleStrToString(docRoster["rosterType"].GetString());
	if (docRoster.HasMember("actingRank"))	roster->actingRank = parseCStyleStrToString(docRoster["actingRank"].GetString());
	roster->source = parseCStyleStrToString(docRoster["source"].GetString());
	roster->idUser = parseCStyleStrToString(docRoster["idUser"].GetString());
	if (docRoster.HasMember("label"))
		roster->label = parseCStyleStrToString(docRoster["label"].GetString());
	if (docRoster.HasMember("qualifier"))
		roster->qualifier = parseCStyleStrToString(docRoster["qualifier"].GetString());
	roster->_isLegal = docRoster["isLegal"].GetBool();

	if (isStringField(docRoster, "roster", "location")) {
		roster->location = parseCStyleStrToString(docRoster["location"].GetString());
	}

	if (docRoster.HasMember("creditedMinutes")) roster->fmCreditMinutes = docRoster["creditedMinutes"].GetDouble();//Credit Hour(实际时间)
	if (docRoster.HasMember("fmCreditedMinutes")) roster->fmCreditMinutes = docRoster["fmCreditedMinutes"].GetDouble();//首月Credit Hour(实际时间)
	if (docRoster.HasMember("schCreditedMinutes")) roster->schCreditMinutes = docRoster["schCreditedMinutes"].GetDouble();//Credit Hour(计划时间)
	if (docRoster.HasMember("schFmCreditedMinutes")) roster->schFmCreditMinutes = docRoster["schFmCreditedMinutes"].GetDouble();//首月Credit Hour(计划时间)

	if (docRoster.HasMember("schPerDiemMins")) roster->schPerDiemMins = docRoster["schPerDiemMins"].GetDouble();//PerDiem(实际时间)
	if (docRoster.HasMember("schLhPerDiemMins")) roster->schLhPerDiemMins = docRoster["schLhPerDiemMins"].GetDouble();//首月PerDiem(实际时间)
	if (docRoster.HasMember("schFmPerDiemMins")) roster->schFmPerDiemMins = docRoster["schFmPerDiemMins"].GetDouble();//PerDiem(计划时间)
	if (docRoster.HasMember("schFmLhPerDiemMins")) roster->schFmLhPerDiemMins = docRoster["schFmLhPerDiemMins"].GetDouble();//首月PerDiem(计划时间)

	if (docRoster.HasMember("workingHour")) roster->workingHour = docRoster["workingHour"].GetDouble();//WorkingHour(实际时间)
	if (docRoster.HasMember("schWorkingHour")) roster->schWorkingHour = docRoster["schWorkingHour"].GetDouble();//WorkingHour(计划时间)

	if (docRoster.HasMember("isAgreeWork")) roster->isAgreeWork = docRoster["isAgreeWork"].GetBool();
	else if (docRoster.HasMember("isAgreeToWork")) roster->isAgreeWork = docRoster["isAgreeToWork"].GetBool();

	if (docRoster.HasMember("exceptionCode")) {
		roster->exceptionCode = docRoster["exceptionCode"].GetString();
		if (!roster->exceptionCode.empty()) {
			split(roster->exceptionCode.c_str(), '|', roster->exceptionCodes);
		}
	}

	//mantis#1852 ruleSrv简化json 通过roster.pairingId 传参
	if (isInt64Field(docRoster, "roster", "pairingId")) {
		roster->pairId = docRoster["pairingId"].GetInt64();
	}
	else {
		//兼容旧方式 json包含 roster.pairing对象
		if (!docRoster["editorPairing"].IsNull())
		{
			roster->pairing = parseJson_Pairing(docRoster["editorPairing"]);
			if (roster->pairing != NULL) {
				roster->pairId = roster->pairing->getDbId();
			}
		}
	}
	if (docRoster.HasMember("callOutDtUtc")) roster->calloutUtc = docRoster["callOutDtUtc"].GetInt64();
	if (docRoster.HasMember("callOutRosterId")) roster->callOutRosterId = docRoster["callOutRosterId"].GetInt64();
	if (docRoster.HasMember("notificationTime")) roster->notificationTime = docRoster["notificationTime"].GetInt64();
	if (docRoster.HasMember("attribute")) roster->attribute = docRoster["attribute"].GetString();
	return roster;
}

bool parseJson_calcComposition(Value& doc) {
	bool calcComposition = true;
	if (doc.HasMember("calcComposition")) calcComposition = doc["calcComposition"].GetBool();
	return calcComposition;
}

RecalDutyNodeFlag parseJson_calcPairingDutyNode(Value& doc) {
	RecalDutyNodeFlag calPairingDutyFlag = RecalDutyNodeFlag::RECAL_ALL;
	if (doc.HasMember("calcDutyNodeFlag")) {
		calPairingDutyFlag = static_cast<RecalDutyNodeFlag>(doc["calcDutyNodeFlag"].GetInt());
	}
	return calPairingDutyFlag;
}

shared_ptr<FatigueResult> parseJson_FatigueResult(Value& doc) {
	shared_ptr<FatigueResult> fatigueResult(new FatigueResult);
	if (doc.HasMember("rosterId")) fatigueResult->rosterId = doc["rosterId"].GetInt64();
	if (doc.HasMember("dutyId")) fatigueResult->dutyId = doc["dutyId"].GetInt64();
	if (doc.HasMember("dutyStart")) fatigueResult->dutyStart = doc["dutyStart"].GetInt64();
	if (doc.HasMember("dutyEnd")) fatigueResult->dutyEnd = doc["dutyEnd"].GetInt64();
	if (doc.HasMember("fatigueIndex")) fatigueResult->fatigueIndex = doc["fatigueIndex"].GetString();
	if (doc.HasMember("maxSp")) fatigueResult->maxSp = doc["maxSp"].GetString();
	if (doc.HasMember("maxTod")) fatigueResult->maxTod = doc["maxTod"].GetString();
	if (doc.HasMember("crewId")) fatigueResult->crewId = doc["crewId"].GetString();
	return fatigueResult;
}
