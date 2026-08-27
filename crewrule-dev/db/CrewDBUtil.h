#ifndef CREW_DB_UTIL_H
#define CREW_DB_UTIL_H

#include <unordered_map>
#include <map>
#include <sstream>
#include "FlightAttribute.h"
#include "TestDBFunc.h"
// #include "ErrorCodeDef.h"
#include "csv/csv_impl.h"

using namespace std;

#ifdef WIN32

#else
#include <memory.h>
#endif

#define   RULE_FUNC_Port_Qual  8011  //Port Qual Reqirement

#define   DEFAULT_LEGAL        "Y"
#define   DEFAULT_REASON       "PO"
#define   DEFAULT_IS_TRAINING  "N"
#define   DEFAULT_IS_LANGUAGE  "N"
#define   DEFAULT_LANGUAGE     ""
#define   DEFAULT_IS_SPLIT     ""
#define   DEFAULT_ATTRIBUTE    ""
#define   DEFAULT_COMMENT      ""


#define ATTR_ROUTE_ALLOW_EXPAT  11
#define ATTR_ROUTE_MUST_EXPAT   12
#define ATTR_ROUTE_ICAO         13

#define ATTR_ROUTE_1A      21
#define ATTR_ROUTE_1B      22
#define ATTR_ROUTE_2A      23
#define ATTR_ROUTE_2B      24

#define ATTR_EXPAT_ALLOW   101
#define ATTR_EXPAT_MUST    102
#define ATTR_ICAO          103
#define ATTR_SPECIAL_AIRPORT 104
#define ATTR_REGIONAL       105
#define ATTR_PATTERN_US    201


//-------------------- SIZE ------------------
#define   SIZE_DIVISION          3
#define   SIZE_BASE              4
#define   SIZE_Y_N               2
#define   SIZE_FLEET_GRP         5 //mantis#1326, fleet maxLen=4
#define   SIZE_LABEL             26
#define   SIZE_PRIME_ACTIVITY    4
#define   SIZE_REGION            2
#define   SIZE_REASON            21
#define   SIZE_LANGUAGE          4
#define   SIZE_ATTRIBUTE         11
#define   SIZE_COMMENT           121
#define   SIZE_IDUSER            31

//#define   SIZE_DUTY_TYPE         10
#define   SIZE_HOTEL             9

#define   SIZE_ASSIGN            11
#define   SIZE_FLT_NUM           7

#define   SIZE_COMP_SOURCE       51
#define   SIZE_AIRLINE           10

//ROSTER字段长度(包含结尾\0）
#define   SIZE_ROSTER_LABEL      51
#define   SIZE_ROSTER_ROLE       21
#define   SIZE_IDCREW            13
#define   SIZE_DUTY_TYPE         11
#define   SIZE_SOURCE            13
#define   SIZE_RANK              6
#define   SIZE_NOTIFIED_USER     31
#define   SIZE_LOCATION          9
#define   SIZE_APP_ID            5
#define   SIZE_ALLOC_CODE        21
#define   SIZE_DEALLOC_CODE      21
#define   SIZE_DEALLOC_USER      31
#define   SIZE_SWAP_STAFF        13
#define   SIZE_TTOT_IND          4
#define   SIZE_QUALIFIER         7
#define   SIZE_ROSTER_POSITION   (5+1)
#define   SIZE_ROSTER_ORIGIN     (2+1)


//#define CHECK_SUCCESS(msg) if (ctx->errorCode != DB_SUCCESS) { goto CLEANUP; }; printf("%s done mem=%dMB\n", msg, (getProcessCurrentMem() / (1024 * 1024)));
//#define CHECK_SUCCESS2(msg,size) if (ctx->errorCode != DB_SUCCESS) { goto CLEANUP; }; printf("%s done size=%d\n", msg, size);
//#define CHECK_SUCCESS3(err,msg) if (err != DB_SUCCESS) {printf("%s \n", msg);goto CLEANUP;}
//#define CHECK_SUCCESS4(msg) if (ctx->errorCode != DB_SUCCESS) { return ctx->errorCode; }; printf("%s done mem=%dMB\n", msg, (getProcessCurrentMem() / (1024 * 1024)));
//
//#define CHECK_ERROR(msg) if (ctx->errorCode != DB_SUCCESS) {printf("%s \n", msg);goto CLEANUP;} printf("%s done mem=%d\n", (getProcessCurrentMem() / (1024 * 1024)));

//错误处理：出错时保存错误信息，并goto CLEANUP段
#define  handleOciError(ctx,success,MSG) \
	if (!success) {\
		ctx->errorCode = DB_ERR_BIND;\
		ctx->errorCodeOCI = OCI_GetLastError();\
		strncpy(ctx->errorMsgBuf, MSG, sizeof(ctx->errorMsgBuf));\
		goto CLEANUP;\
		}


struct FlightRankValue {
	long long fltId = 0;
	string rank;
	int value = 0;
};

struct ScenarioGroup {
	long long parentScenarioId = 0;
	long long scenarioId = 0;
	int sequence = 0;
};

struct Pairing_Result_Param {
	int        pairCount{};
	int        dutyCount{};
	int        segCount{};

	long long* pairIdList{nullptr};
	long long* dutyTidList{ nullptr };
	long long* segTidList{ nullptr };

	long long* dutyPairIdList{ nullptr };
	int* dutySeqList{ nullptr };

	long long        scenarioId{};
	char       division[SIZE_DIVISION]{0};
	char       fleet[SIZE_FLEET_GRP]{0};
	char       user[SIZE_IDUSER]{ 0 };
	char       airline[SIZE_AIRLINE]{ 0 };

	map<string, long long> rankNameIdMap;

	map<string, long long> dutyPairIdMap;
	map<string, long long> dutyTidMap;
	map<string, long long> segPairTidMap;
	map<string, long long> segDutyTidMap;
	map<string, long long> segTidMap;

	static string makeDutyKey(int pairIndex, int dutyIndex) {
		stringstream ss;
		ss << to_string(pairIndex) << "-";
		ss << to_string(dutyIndex);
		return ss.str();
	}
	static string makeSegKey(int pairIndex, int dutyIndex, int segIndex) {
		stringstream ss;
		ss << to_string(pairIndex) << "-";
		ss << to_string(dutyIndex) << "-";
		ss << to_string(segIndex);
		return ss.str();
	}
	Pairing_Result_Param() {
		pairCount = 0;
		dutyCount = 0;
		segCount = 0;
		pairIdList = 0;
		dutyPairIdList = 0;
		dutySeqList = 0;
		scenarioId = 0;
		memset(division, 0, SIZE_DIVISION);
		memset(fleet, 0, SIZE_FLEET_GRP);
		memset(user, 0, SIZE_IDUSER);
		memset(airline, 0, SIZE_AIRLINE);
	}
};

//-------------------- attribute ------------------
struct flight_attr {
	bool  expat_allow = false;
	bool  expat_must = false;
	bool  icao = false;
	bool  special_airport = false;
	bool  regional = false;
	bool  pattern_us = false;

	bool  route1A = false;
	bool  route1B = false;
	bool  route2A = false;
	bool  route2B = false;
	vector<string> fltAttrCodes;
};


struct activity_composition {
	long long activity_id = 0; //flt_id/ pairing_id
	long long comp_id = 0;
	int multiplier = 0;
	activity_composition(long long id, long long comp_id, int multiplier) {
		this->activity_id = id;
		this->comp_id = comp_id;
		this->multiplier = multiplier;
	}
};
//-------------------- Ferry Bus ------------------
struct FerryBus {
	long long  idFerry = 0;
	char  ferryType[21] = { 0 };
	time_t  effUtc = 0;
	time_t  disUtc = 0;
	long  dow = 0;
	char  ferryNum[11] = { 0 };
	char  depSta[4] = { 0 };
	char  arrSta[4] = { 0 };
	time_t  depTm = 0;
	time_t  arrTm = 0;
	long  durationMin = 0;
	char  user[31] = { 0 };
	time_t  tmst = 0;
};

//---------------- char* to string -----------------
string parseCharArrayToString(const char* str);
void copyStrToBuf(const char* str, char* buf, int len);

//-------------------- UTIL funcs ------------------
long long* createLongLongArray    (int count);
int*   createIntArray             (int count);
long long* createInt64Array       (int count);
float* createFloatArray           (int count);
char*  createCharArray            (int count, int rowSize);
int    getCountOfAllDuty          (vector<Pairing*> *pairingList) ;
int    getCountOfAllSegment       (vector<Pairing*> *pairingList) ;
void   getDutyPairIdAndSeq        (vector<Pairing*> *pairingList, Pairing_Result_Param * param);
char*  parseDutyTypeToStr         (Duty::DUTY_TYPE t) ;
long long    getCompositionIdByCompMap  (map<string, int> &map);

long long    getCompositionIdByCompMap  (unordered_map<long long, composition_rank> &rankCompositionList, map<string, int> &compMap);

//-------------------- segments ------------------
struct airport_info {
	char  airport[8] = { 0 };
	int   utc_std_offset = 0;
};
struct daylight_range {	
	time_t  daylight_start = 0; //time_t
	time_t  daylight_end = 0;   //time_t
	int   change_min = 0;     //minutes
};
struct daylight_saving {
	char  airport[8] = { 0 };
	vector<daylight_range> list;
};
void   makeFltToPairingMapIndex   (vector<Pairing*>& pairings, unordered_map<long long, vector<long long>>& result);

//pairing label index
void   makePairingLabelMapIndex   (Pairing* p, map<string, vector<Pairing*>>& result);
void   makePairingLabelMapIndex   (vector<Pairing*>& pairings, map<string, vector<Pairing*>>& result);
void   removePairingLabelMapIndex (vector<Pairing*>& pairings, map<string, vector<Pairing*>>& result);
void   removePairingLabelMapIndex (Pairing* p, map<string, vector<Pairing*>>& result);
void   removePairingLabelMapIndex (const string& pairingLabel, const long long pairingId, map<string, vector<Pairing*>>& result);

bool   calculatePairingFields     (Pairing* pairing);
int    createPairingNodeOfDuty    (Pairing* pg, CrewDataContext *dbData);//20191120 ain, mantis#7105
void   createPairingNodeOfSeg     (Pairing* pg, CrewDataContext *dbData);//20191120 ain, mantis#7105
int   createPairingNodeOfDuty	  (Duty * duty, CrewDataContext *dbData, Pairing* pg = nullptr);//20210201 zzm
void   refreshPairingNodeOfDutyThreadLocalTime	(Duty * duty, CrewDataContext *dbData);//20210201 zzm
int   createPairingNodeOfSeg	  (Duty * duty, CrewDataContext *dbData, Pairing* pg = nullptr);//20210201 zzm
int   createPairingNodeOfSeg      (Duty* duty, Segment* fromSegment, Segment* toSegment, const int briefMinutes, const int debriefMinutes, CrewDataContext* dbData);
int createPairingNodeOfSegByRuleParam(Duty* d, CrewDataContext *dbData, Pairing* pg = nullptr);//20230619 jiaxin.jin


//创建Duty的Brief节点
shared_ptr<PairingDutyNode> createBriefNodeOfDuty(Duty * duty, CrewDataContext *dbData, Pairing* pg, string schOrActType);
// refresh thread local time for brief node of a duty
void refreshBriefNodeOfDutyThreadLocalTime(Duty * duty, CrewDataContext *dbData, const std::string& schOrActType, std::shared_ptr<PairingDutyNode> briefNode = nullptr);
//创建Duty的Pickup节点
shared_ptr<PairingDutyNode> createPickupNodeOfDuty(Duty * duty, shared_ptr<PairingDutyNode>& brief, CrewDataContext *dbData, Pairing* pg);
// refresh thread local time for pickup node of a duty
void refreshPickupNodeOfDutyThreadLocalTime(Duty * duty, shared_ptr<PairingDutyNode> brief, CrewDataContext *dbData, std::shared_ptr<PairingDutyNode> pickupNode = nullptr);
//创建Duty的Debrief节点
shared_ptr<PairingDutyNode> createDebriefNodeOfDuty(Duty * duty, CrewDataContext *dbData, Pairing* pg, string schOrActType);
// refresh thread local time for debrief node of a duty
void refreshDebriefNodeOfDutyThreadLocalTime(Duty * duty, const std::string& schOrActType, std::shared_ptr<PairingDutyNode> debriefNode = nullptr);
//创建Duty的Dropoff节点
shared_ptr<PairingDutyNode> createDropoffNodeOfDuty(Duty * duty, shared_ptr<PairingDutyNode> &debrief, CrewDataContext *dbData, Pairing* pg);
// refresh thread local time for pickup node of a duty
void refreshDropoffNodeOfDutyThreadLocalTime(Duty * duty, shared_ptr<PairingDutyNode> debrief, std::shared_ptr<PairingDutyNode> dropoffNode = nullptr);

time_t getDutyBriefStartLocByRule(SharedPtr<CrewDataContext>& dbData, Duty* duty, const RecalDutyNodeFlag recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_UNKNOWN);
time_t getDutyBriefStartUtcByRule(SharedPtr<CrewDataContext>& dbData, Duty* duty, const RecalDutyNodeFlag recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_UNKNOWN);
//void   setPairingNodeUtc          (shared_ptr<PairingDutyNode>& n, CrewDataContext *dbData);
void   computeAndSetDutyRegion(Duty * duty, map<string, DBAirport*>& airportMap);
string maxRegion(string region1, string region2);
string getRegion(Pairing * pairing);
string getRegion(Duty * duty);
//-------------------- airport --------------------
time_t   utcToAirportLoc(string& airport, time_t utc, unordered_map<string, int> &airportUtcOffsetMap, unordered_map<string, daylight_saving> &daylightSavingMap);


//-------------------- pairing ----------------------
void   makeSqlWhereStrForPairingAttr         (char * buf, int size, vector<string>& attributes);
void   makeSqlWhereStrForRank                (char * buf, int size, vector<string>& ranks);
char * makeSqlWhereStrForPairingBaseFleetRank(char* where, int whereSize, time_t startDt, time_t endDt, vector<string> & baseList, vector<string> & fleetList, vector<string> & rankList, vector<string> & assignGrp);   //直接按 pairing.fleet/base筛选
char * makeSqlWhereStrForCrewBaseFleetRank   (char* where, int whereSize, vector<string> & baseList, vector<string> & fleetList, vector<string> & rankList);      //从crew间接筛选pairing，crew按fleet/base/rank筛选


void            computeBaseDutyPerDayLimit           (time_t scenarioStartDtUtc, time_t scenarioEndDtUtc, vector<Pairing*>& leadinPairings, vector<DBRule>& ruleList, vector<string>& bases, vector<string>& fleets, map<string, vector<int>>& result);
string makeLeadinInfo(long long pair_id, long long comp_id, long long flt_id, unordered_map<long long, composition_rank>& rankCompositionMap);

//-------------------- make pairing index ---------------------

bool   compareRosterByIdcrew      (SharedPtr<ROSTER> i, SharedPtr<ROSTER> j);
bool   compareRosterByStartDT     (SharedPtr<ROSTER> i, SharedPtr<ROSTER> j);
bool   compareRosterByPairId      (SharedPtr<ROSTER> i, SharedPtr<ROSTER> j);

void   sortRosterByStrUtc         (vector<SharedPtr<ROSTER>>& list);

bool   comparePairingById         (Pairing* i, Pairing* j);

//bool   compareCrewById            (CREW & i, CREW & j);
bool   compareCrewRefById         (SharedPtr<CREW> & i, SharedPtr<CREW> & j);

int    makePairingRosterIndex     (vector<SharedPtr<ROSTER>> &rosterList, vector<Pairing*> &pairingList);      //将pairing与roster关联，要求roster按pairingId排序
void   makeRosterCrewIndex        (vector<SharedPtr<CREW>> &crewList, vector<SharedPtr<ROSTER>> rosterList);

void   makePairingSegmentOpenComposition (vector<Pairing *> &pairingList);

vector<SharedPtr<ROSTER>>          mergeRosterListOrderByPairId (vector<SharedPtr<ROSTER>> &list1, vector<SharedPtr<ROSTER>> &list2);
vector<SharedPtr<ROSTER>>          filterRosterByPreAssign      (vector<SharedPtr<ROSTER>> &input, bool isPreAssign);

int                                mergeSegFlightBuf(Segment * outputBuf, Segment * buf0, int count0, Segment * buf1, int count1);


//-------------------- make crew index ---------------------
void   makeIndexCrewQualification (vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_QUALIFICATION>> &crewQuals);
void   makeIndexCrewFleet         (vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_FLEET>> &crewFleets);
void   makeIndexCrewRank          (vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_RANK>> &crewRanks);
void   makeIndexCrewBase          (vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_BASE>> &crewBases);
void   makeIndexCrewMandayFd      (vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_MANDAY_FD>> &crewMandayFd);
void   makeIndexCrewMandayCcAm    (vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_MANDAY_CC_AM>> &mandayList);

void   makeIndexCrewPreference    (vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_PREFERENCE>> &datas);
void   makeIndexCrewStatus        (vector<SharedPtr<CREW>> &crews, vector<SharedPtr<CREW_STATUS>> &datas);

void   makeCrewBaseMap            (vector<SharedPtr<CREW>>& crewList, map<string, string>& crewBaseMap);
void   makeCrewTimeZoneMap        (map<string, string>& crewBaseMap, unordered_map<string, int> &airportUtcOffsetMap, unordered_map<string, int> &crewTimeZoneOffsetMinute);
int    computeMandayTimeZoneOffsetMinutes(CrewDataContext* dataCtx, SharedPtr<CREW>& crew, time_t utc);

void   makePairingFLightIndex     (PairingDBContext * ctx, string filterType, long long scenarioId, time_t startUtc, time_t endUtc, vector<string> & baseList, vector<string> & fleetList, vector<string> & rankList, vector<string> & assignGrp, vector<string>& pairingAttribute, vector<Pairing*> &pairingList, Segment ** segBuf, int segCount);

void   pairingBufToList           (vector<Pairing*> &list, Pairing** buf, int count) ;

DBRule*findRuleByFunction         (vector<DBRule> &ruleList, int function);

void   makeIndexCrewBaseRankFleet(CrewDataContext* dbData, const set<string> updatedCrewIds = set<string>());
void   makeIndexCrewKpiAdjust(CrewDataContext* dbData, const set<string> updatedCrewIds = set<string>());
void   resetCrewMandayDateToUtc(CrewDataContext* dbData);
void   mergeCrewRank              (vector<SharedPtr<CREW_RANK>>& list);
void   mergeCrewCompanyRank(vector<SharedPtr<CREW_COMPANY_RANK>>& list);
void   mergeCrewQualification(vector < SharedPtr<CREW_QUALIFICATION>>& list);
void   mergeCrewStatus(vector < SharedPtr<CREW_STATUS>>& list);
vector<SharedPtr<CREW_QUALIFICATION>> getCrewQualificationMergeByRuleParam(const vector<SharedPtr<CREW_QUALIFICATION>>& list, const vector<string>& ruleParamQualifications);
//-------------------- for CQF & Rule --------------------------
bool isTableHeader(const char* names);                                          //return true/false
//void getTableFromNameStr(const char * names, char * buf, int bufsize);
//void getRowFromNameStr(const char * names, char * buf, int bufsize);
int getTableNumFromNameStr(const char * names);   // table1Row2 --> return 1           
int getRowNumFromNameStr(const char * names);     // table1Row2 --> return 2
void getTableNumFromNameStr(const char * names, char * buf, int bufsize);
void getRowNumFromNameStr(const char * names, char * buf, int bufsize);


int getRollingDaysFromRuleList(vector<DBRule>& ruleList);
map<string, int>            createResourceCtrlMap(vector<DBRule> &cqfList, int funcId, time_t startUtc, time_t endUtc);
//vector<ResourceCtrlBaseBlh> parseResourceCtrlBaseBlh(PairingDBContext * ctx, vector<DBRule> &cqfList, Scenario& scenario, long startUtc, long endUtc);
void                        parseResourceCtrlBaseBlh(vector<ResourceCtrlBaseBlh>& result, double totalBLH, vector<DBRule> &cqfList, Scenario& scenario, time_t startUtc, time_t endUtc);


//从totalList中筛选出指定id对应的rank/fleet/base名称
vector<string> getBaseListFromId     (vector<long long> &idList, vector<BASE> &totalBaseList);
vector<string> getRankListFromId     (vector<long long> &idList, vector<RANK> &totalRankList);
vector<string> getFleetListFromId    (vector<long long> &idList, vector<FLEET> &totalFleetList);
vector<string> getAssignGrpListFromId(vector<long long> &idList, vector<ASSIGNMENT_GROUP> &totalList);

//按 qual id获取 qual name
void getQualificationById(PairingDBContext *ctx, vector<long long>& qualIdList, vector<string>& qualNameList);

int            getCrewIdListFromCof   (unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, vector<string>& result);
int            setCrewOnCof           (unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, vector<SharedPtr<CREW>>& crewList);

//void utcToLocalDtStr(time_t utc, char * buf, int bufsize);



void                                  fixDhdLimitByLeadin  (vector<DBRule>& cqList, int dhdInLeadin, time_t scenarioStartTime, time_t scenarioEndTime);
void                                  parseRuleParams      (vector<DBRule>& list, vector<SharedPtr<DBRule_8014>>& assignAndGrps);
bool                                  checkCompositionByRules(unordered_map<long long, composition_rank>& compositionRankMap, vector<DBRule>& ruleList);


void                                  sortCrewData         (vector<SharedPtr<CREW>>& crews);

void                                  resetCrewBaseByBaseAndTimezone(SharedPtr<CREW_BASE>& crewbase, string crewId, string base, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void                                  resetCrewRankByCrewBaseAndTimezone(SharedPtr<CREW_RANK>& crewrank, string crewId, string rank, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void                                  resetCrewRankByCrewBaseAndTimezone(SharedPtr<CREW_RANK>& crewrank, string crewId, string rank, time_t effDtStartLoc, time_t expDtStartLoc, SharedPtr<CrewDataContext> dataCtx);
void                                  resetCrewCompanyRankByCrewBaseAndTimezone(SharedPtr<CREW_COMPANY_RANK>& crewcompanyRank, string crewId, string rank, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void                                  resetCrewFleetByCrewBaseAndTimezone(SharedPtr<CREW_FLEET>& crewfleet, string crewId, string fleet, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void                                  resetCrewQualTimeByCrewBaseAndTimezone(SharedPtr<CREW_QUALIFICATION>& crewqual, string crewId, time_t issuedDtStartLoc, time_t renewDtStartLoc, time_t cancelDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx, time_t earliestDtStartLoc = 0, time_t latestDtStartLoc = 0, time_t baseMonthStartLoc = 0);
void                                  resetCrewTeamByCrewBaseAndTimezone(SharedPtr<CREW_TEAM>& item, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void								  resetCrewGuaranteeHourByCrewBaseAndTimezone(SharedPtr<CREW_GUARANTEE_HOUR>& crewGuaranteeHour, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void								  resetCrewStatusByCrewBaseAndTimezone(SharedPtr<CREW_STATUS>& crewStatus, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void								  resetCrewFlyTogetherByCrewBaseAndTimezone(SharedPtr<CREW_FLY_TOGETHER>& crewFlyTogether, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void								  resetCrewFlyPreferencByCrewBaseAndTimezone(SharedPtr<CREW_FLY_PREFERENCE>& crewFlyPreference, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void								  resetCrewPreferenceByCrewBaseAndTimezone(SharedPtr<CREW_PREFERENCE>& crewPreference, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void								  resetCrewEntitlementByCrewBaseAndTimezone(SharedPtr<CREW_ENTITLEMENT>& crewEntitlement, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void								  resetCrewProfileByCrewBaseAndTimezone(SharedPtr<CREW_PROFILE>& crewProfile, time_t effDtStartLoc, time_t expDtStartLoc, CrewDataContext* dataCtx);
void                                  resetCrewRankFleetQualLocalTimeToUtc(CrewDataContext* dataCtx);
void                                  resetCrewRankFleetQualLocalTimeToUtc(SharedPtr<CrewDataContext> dataCtx, const vector<string>& crewIdList);

void                                  resetHolidayLocalTimeToUtc(CrewDataContext* dataCtx);

void                                  filterCrewDataByPeriod(CrewDataContext* dataCtx, map<string, SharedPtr<CREW>>& crews);


string                                makeSqlCrewIdByBaseRankFleetQualAirline(string airline, time_t startLoc, time_t endLoc, vector<string> & baseList, vector<string> & fleetList, vector<string> & rankList, vector<string>& qualList);

//

int                                   removeCrewOnFlight   (string& crewId, long long fltId, long long pairingId, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt);
int                                   removeCrewOnFlight   (SharedPtr<ROSTER>& roster, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt);
int                                   addCrewOnFlight      (SharedPtr<ROSTER>& roster, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, map<string, SharedPtr<CREW>>& crewIdMap);
int                                   addCrewOnFlight      (SharedPtr<CREW>& crew, long long pairing_id, long long flt_id, string& rank, string& assignment, string& role, string& subRole, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, int seqOrder = 0);

int                                   addCrewOnPairingToMap(long long pairingId, SharedPtr<CREW> crew, SharedPtr<CrewOnFlight>& cop, map<long long, list<SharedPtr<CrewOnFlight>>>& crewOnPairing);
int                                   addCrewOnFlightToMap (long long flightId, SharedPtr<CREW> crew, SharedPtr<CrewOnFlight>& cof, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt);
int                                   addCrewOnPairing     (long long pairingId, SharedPtr<CREW> crew, SharedPtr<ROSTER>& roster, map<long long, list<SharedPtr<CrewOnFlight>>>& crewOnPairing);
int                                   removeCrewOnPairing  (long long pairingId, SharedPtr<CREW> crew, map<long long, list<SharedPtr<CrewOnFlight>>>& crewOnPairing);
void								  removeCrewKpiAdjustByRoster(SharedPtr<CREW>& crew, const long long rosterId, RosterFlightMgr& rosterFlightMgr);

void                                  resetCrewOnFltForPairingUpdate(Pairing* oldPairing, Pairing* newPairing, map<string, SharedPtr<CREW>>& pairingCrews, map<string, SharedPtr<ROSTER>>& pairingRosters, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt);


void                                  logCrewOnFlight      (const char * msg, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt);
void                                  logCrewOnFlight      (const char * msg, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, vector<long long>& targetFltId);
void                                  logCrewOnFlight      (const char * msg, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, Pairing * pairing);


int                                   getHistoryMonthCountFromCqf (vector<DBRule>& cqfList);
//------------------ pairing ------------------

//通过crew筛选pairing，按base/fleet/rank筛选crew

char *                                makeSqlScenarioPairingId(char * sqlPairIdBuf,	int bufsize, long long scenarioId, time_t startUtc, time_t endUtc, vector<string> & baseList, vector<string> & fleetList, vector<string> & rankList, vector<string> & assignGrp, vector<string> & pairingAttribute);
char *                                makeSqlPairingIdByRoster(char * sqlPairIdBuf,	int bufsize);
void                                  mergePairingAndDuty                    (unordered_map<long long, Pairing*>& pairingIdMap, vector<Duty*>& dutyList);
void                                  mergeDutyAndSegment                    (unordered_map<long long, Duty*>& dutyIdMap, vector<Segment*>& segmentList);

//------------------ duty ------------------

void                                  makeIndexDutyToPairing(vector<Pairing*> &pairingList, Duty ** dutyList, int dutyCount);

//------------------ save --------------------
//将计算结果存入数据库(savePairingResult for PO, saveRosterResult for RO)
map<string, vector<DBPortQualReqmnts>> makePortQualReqmntsAirportMap(vector<DBPortQualReqmnts> &list);

unordered_map<long long, std::vector<std::shared_ptr<DutyCodeLogic>>> makeDutyCodeLogicMap(const std::vector<std::shared_ptr<DutyCodeLogic>>& dutyCodeLogicList);

//----------------- recency -----------------
int                                   computeCrewRecency            (CrewDataContext* dataCtx, long long scenarioId, string modifyUser);
int                                   computeSingleCrewRecency		(CrewDataContext* dataCtx, SharedPtr<CREW>& crew, long long scenarioId, string modifyUser);
void                                  computeSingleRosterRecency    (SharedPtr<ROSTER>& roster, CrewDataContext* dataCtx, long long scenarioId, string modifyUser);
int                                   filterLatestRecency(long long scenarioId, time_t startUtc, time_t endUtc, RecencyMgr& mgr, vector<SharedPtr<CrewRecency>>& result);
//---------------- composition ----------------
void                                  addFlightPlanComposition     (Segment * seg, unordered_map<long long, composition_rank> &fltCompMap, long long compId, int multipler);
void                                  resetSegmentPlanCompByFlt    (vector<Pairing*>& pairings, unordered_map<long long, SharedPtr<Segment>>& flightIdMap);

//---------------- other ----------------

int calculatePairingPayTimeSecs(Pairing * pairing);
bool isOverlapBetweenTwoRoster(ErrorContext * errCtx, map<string, bool>& overlapableAssignmentMap, SharedPtr<ROSTER>& roster1, SharedPtr<ROSTER>& roster2);
bool isRosterOverlap(vector<SharedPtr<ROSTER>>& rosterList, SharedPtr<ROSTER>& roster, int &overlapIndexInRosterList);
bool checkCofExist(Pairing * pairing, SharedPtr<CREW>& crew, unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt);
void test_log_cof(unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewOnFlt, long long fltId, const char* msg);

void checkOverlapForRosterOnCrew(ErrorContext * errCtx, map<string, bool>& overlapableAssignmentMap, SharedPtr<ROSTER>& roster, SharedPtr<CREW>& crew);

//按editor输入数据更新pairnig
void updatePairingByEditor(Pairing* target, Pairing* input);

string encrypt(string input);
void decrypt(string& input, string& output);

//check
void checkAssignment(CrewDataContext* dataCtx);
void checkSystemParameterDefaultTimezone(CrewDataContext* dataCtx);
void checkRoster(CrewDataContext* dataCtx);

//JSON
void saveSegmentToJson(vector<Segment>& segList, const char * filepath);
void saveSegmentToJson(vector<Segment*>& segList, const char * filepath);
void saveRuleToJson(vector<DBRule>& ruleList, const char * filepath);
void saveCqfToJson(vector<DBCqf>& cqfList, const char * filepath);

bool loadSegmentFromJson(vector<Segment>& segList, const char * filepath);
bool loadSegmentFromJson(vector<Segment*>& segList, const char * filepath);
bool loadRuleFromJson(vector<DBRule>& ruleList, const char * filepath);
bool loadCqfFromJson(vector<DBCqf>& cqfList, const char * filepath);

void loadCsvFlightCommute(CrewDataContext* dbData, crewCsvReader& reader);

void getOptimizationNecessity(PairingDBContext *ctx, string airline, vector<SharedPtr<Optimization_necessity>>& result);
#endif//CREW_DB_UTIL_H