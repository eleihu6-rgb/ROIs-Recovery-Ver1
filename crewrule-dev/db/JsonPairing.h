#ifndef _JSON_PAIRING_H_
#define _JSON_PAIRING_H_

#include <iostream>
#include <vector>
#include "Pairing.h"
#include "CrewDB.h"
#include "rapidjson/document.h"		// rapidjson's DOM-style API
#include "rapidjson/prettywriter.h"	// for stringify JSON
#include "rapidjson/filestream.h"	// wrapper of C stream for prettywriter as output
#include "rapidjson/stringbuffer.h"
//#include "../RuleEngine/RuleEngine.h"

using namespace std;
using namespace rapidjson;

using namespace std;

struct RULE_VIOLATION;

#define      ERR_SUCCESS                0
#define      ERR_JSON_PARAM                  2   //参数错误
#define      ERR_FILE_FAIL           1001   //文件操作失败，可能为文件不存在
#define      ERR_JSON                1002   //json格式错误
#define      ERR_MORE_BUFF           1003   //需要更多缓冲
#define      ERR_UNKNOWN               -1

struct UpdateActivityIdItem {
	string type;
	string crewId;
	long long oldId = 0;
	long long newId = 0;
};

struct UpdateActivityDutyIdItem : public UpdateActivityIdItem {
	long long oldPairingId = 0;
	long long newPairingId = 0;
};

struct UpdatePairingDutyNode {
	long long pairingId = 0;
	long long dutyId = 0;
	RecalDutyNodeFlag recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_ALL;


	static RecalDutyNodeFlag getRecalDutyNodeFlag(const vector<UpdatePairingDutyNode>& updatePairingDutyNodeList, const long long pairingId, const long long dutyId) {
		RecalDutyNodeFlag tmpRecalDutyNodeFlag = RecalDutyNodeFlag::RECAL_ALL;
		for (auto& updateDutyNode : updatePairingDutyNodeList) {
			if (updateDutyNode.pairingId == pairingId && updateDutyNode.dutyId == dutyId) {
				tmpRecalDutyNodeFlag = updateDutyNode.recalDutyNodeFlag;
			}
		}
		return tmpRecalDutyNodeFlag;
	}
};


int readFile_Document(const char * filepath, rapidjson::Document &document);
int readFile_PairingList(const char * filepath, std::vector<Pairing*> &outputList, rapidjson::Document &document);
int readFile_RosterList(const char * filepath, vector<SharedPtr<ROSTER>> &outputList, rapidjson::Document &document);

int readFile_UpdatePairingList(const char * filepath, rapidjson::Document &document, vector<Pairing*>& addList, vector<Pairing*>& delList, vector<Pairing*>& updateList);

//int parseJson_UpdateListRoster(rapidjson::Document &document, vector<SharedPtr<ROSTER>>& addList, vector<SharedPtr<ROSTER>>& delList, vector<SharedPtr<ROSTER>>& updateList);

int readFile_UpdateList(const char * filepath, rapidjson::Document &document);

int readFile_CrewIdList(const char * filepath, vector<string>& crewIdList, rapidjson::Document &document);

int readFile_TryPairingOnCrew(const char * filepath, long long& pair_id, vector<string>& crewIdList, vector<long long>& temporaryDelRosterIds, string& rank, rapidjson::Document &document);

int readFile_PairingIdList(const char* filepath, vector<long long>& pairingIds, rapidjson::Document& document);

//int parseJson_UpdateList(rapidjson::Document &document, vector<SharedPtr<Activity>>& addList, vector<SharedPtr<Activity>>& delList, vector<SharedPtr<Activity>>& updateList);
int parseJson_UpdateList(rapidjson::Document &document, vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<bool>& recalCompositionFlagList, vector<UpdatePairingDutyNode>& updatePairingDutyNodeList, vector<SharedPtr<UpdateActivityIdItem>>& updateIdList, vector<shared_ptr<FatigueResult>>& updateFatigueResult);
int parseJson_UpdateList(rapidjson::Document &document, vector<long long>& transactionIdList, vector<string>& opList, vector<SharedPtr<Activity>>& itemList, vector<bool>& recalCompositionFlagList, vector<UpdatePairingDutyNode>& updatePairingDutyNodeList, vector<SharedPtr<UpdateActivityIdItem>>& updateIdList, vector<shared_ptr<FatigueResult>>& updateFatigueResult);

int parseJson_UpdateRosterFlights(rapidjson::Document &document, vector<string>& opList, vector<SharedPtr<RosterFlight>>& itemList);
int parseJson_UpdateRosterFlightKpi(rapidjson::Document& document, vector<string>& opList, vector<SharedPtr<CrewKpiAdjust>>& itemList);
int parseJson_UpdateRosterTraining(rapidjson::Document& document, vector<string>& opList, vector<SharedPtr<Entity>>& itemList);

int formatToJson_violations(ostream& ss, vector<RULE_VIOLATION*>& rvs, CrewDataContext* dbData);

int formatToJson_PairingList(ostream &ss, vector<Pairing*> &list, map<long long, vector<RULE_VIOLATION*>>& pairingViolations, CrewDataContext* dbData = nullptr);
int formatToJson_RosterList(ostream &ss, vector<SharedPtr<ROSTER>> &list);
int formatToJson_RosterList(ostream &ss, vector<SharedPtr<ROSTER>> &list, string lineStart);
int formatToJson_CrewLegality(ostream &ss, SharedPtr<CREW>& crewIndex, vector<RULE_VIOLATION*> rvs, SharedPtr<CrewDataContext>& dbData, bool needOutputManday=true);
//int formatToJson_CrewManDay(ostream &ss, SharedPtr<CREW> crew);
int formatToJson_Manday(ostream &ss, SharedPtr<CREW> crew, string lineStart, SharedPtr<CrewDataContext>& dbData);
int formatToJson_RosterFlight(ostream& ss, SharedPtr<CREW> crew, string lineStart, SharedPtr<CrewDataContext>& dbData);

int formatToJson_dutyCodeViolations(ostream& ss, const map<Segment*, bool>& dutyCodeViolationMap);
int formatToJson_dutyCodes(ostream& ss, const map<Segment*, DutyCode::DutyCode>& dutyCodeMap);

//**************************************************************************
//获取上一次错误的额外信息
//**************************************************************************
const char * readFile_getLastErrMsg();

//从Json解析单个对象：Pairing/Roster
Duty *    parseJson_Duty(Value &value);
Segment * parseJson_Segment(Value &doc);
Pairing * parseJson_Pairing(Value& docPairing);
Pairing * parseJson_Pairing(Value &docPairing, vector<UpdatePairingDutyNode>& updatePairingDutyNodeList);
bool parseJson_calcComposition(Value& doc);
RecalDutyNodeFlag parseJson_calcPairingDutyNode(Value& doc);
PairingDutyNode* parseJson_PairingDutyNode(Value &doc);
SharedPtr<ROSTER> parseJson_Roster(Value &docRoster);
shared_ptr<FatigueResult> parseJson_FatigueResult(Value& doc);

int parseJson_PairingList(Value &pairingArray, vector<Pairing*> &outputList);
int parseJson_RosterList(Value &jsonArray, vector<SharedPtr<ROSTER>> &outputList);

//检查Json格式：Pairing/Roster
int checkJson_Pairing(Value &pairing);
int checkJson_PairingList(Value &arrayList);
int checkJson_Roster(Value &roster);
int checkJson_RosterList(Value &arrayList);
int checkJson_UpdateListRoster(Value &rosterArray);
int checkJson_UpdateList(Value &rosterArray);

void formatJson_printTime(ostream& ss, string intend, Activity * activity);
void formatToJson_Pairing(ostream &ss, Pairing* p, string lineStart, vector<RULE_VIOLATION*>& violations, CrewDataContext* dbData = nullptr);
int formatToJson_Roster(ostream &ss, SharedPtr<ROSTER> &list, string lineStart);



//**************************************************************************
//RouteActualRest/ CrewEntitlement/ CrewPreference/ CrewManday
//**************************************************************************
int readFile_RouteActualRestList(const char * filepath, rapidjson::Document &document, vector<SharedPtr<RouteActualRest>> &addList, vector<SharedPtr<RouteActualRest>> &updateList, vector<SharedPtr<RouteActualRest>> &delList);
int parseJson_RouteActualRestLists(rapidjson::Value &document, vector<SharedPtr<RouteActualRest>> &addList, vector<SharedPtr<RouteActualRest>> &updateList, vector<SharedPtr<RouteActualRest>> &delList);
int parseJson_CrewEntitlementLists(rapidjson::Value &document, vector<SharedPtr<CREW_ENTITLEMENT>> &addList, vector<SharedPtr<CREW_ENTITLEMENT>> &updateList, vector<SharedPtr<CREW_ENTITLEMENT>> &delList);
int parseJson_CrewMandayLists(rapidjson::Value &document, map<string, map<time_t, SharedPtr<CREW_MANDAY_BASIC>>> &addOrUpdateMap, map<string, map<time_t, SharedPtr<CREW_MANDAY_BASIC>>> &delMap);
int parseJson_CrewPreferenceLists(rapidjson::Value &document, vector<SharedPtr<CREW_PREFERENCE>> &addList, vector<SharedPtr<CREW_PREFERENCE>> &updateList, vector<SharedPtr<CREW_PREFERENCE>> &delList);
#endif//_JSON_PAIRING_H_
