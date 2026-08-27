
#ifndef RULE_ENGINE_H
#define RULE_ENGINE_H

#include <stdio.h>
#include <vector>
#include <string>
#include <CrewDB.h>
#include "Utility.h"
#include <time.h>
#include <sstream>
#include <iostream>
#include <unordered_set>
#include "Rule3010Calculator.h"
#include "RuleStatistics.h"
#include "RuleEngineDef.h"
#include "legacyDefineHelper/legacyDefine.h"
#include <ErrorCodeDef.h>
#include <mutex>
#include "rule/EnumerationDayOffPatternHelper/EnumerationDayOffPatternHelperCache.h"
#include "rule/MinimumLegalComplementTypes.h"
#include "RuleParams.h"


using std::vector;
using std::string;
using OccupationStatus = Helper6001::OccupationStatus;


//mantis#1715, 重构参数解析
//检查rule param提取结果
#define CHECK_RULE_PARAM(ret,func,paramName) \
	if (ret == ERR_RULE_PARAM_NOT_FOUND) printf("ERROR: invalid rule_param, func=%d paramName=%s not found\n", func, paramName);\
		else if (ret == ERR_RULE_PARAM_EMPTY)     printf("ERROR: invalid rule_param, func=%d paramName=%s is empty\n", func, paramName);\
		else if (ret == ERR_RULE_PARAM_NUMBER) printf("ERROR: invalid rule_param, func=%d paramName=%s is not number\n", func, paramName);

class RuleFactory;

// This class is exported from the RuleEngine.dll
class LegalityChecker : public MandayForRosterCalculator {
	friend class RuleFactory;
private:

    std::unique_ptr<RuleFactory> _ruleFactory;
	long long _transactionId{ 0 };
	//key：RuleId, value: 存储Roster中Pairing的_dbId集合。
	map<unsigned int,set<long long>> _transactionRosterPairingDbIdMap;

	string _connStr ;
	string _username;
	string _passwordStr;

	vector<string> _violations;
	vector<RULE_VIOLATION*> _rule_violations;
	std::mutex _mutex_rule_violations;

	int callCount = 0;
	string _RuleSetID;
	vector<RULE_LEGALITY> _RuleResult;

	ErrorContext _ctx;
	PairingDBContext _dbCtx;
	vector<string> _crewCheckRange;
	//Scenario _scenario;
	long long _scenarioID = -1;

	time_t _window_start = -1;
	time_t _window_end = -1;

	//CustomLegality* custRules = NULL;

	vector<string> _restAssignments;

	Rule3010 rule3010Calculator;

	vector<DBRule> _appRules;

	string _filiale;//当前分公司，例如：5J、DG
	string _division;//当前部门，比如：P,C或A
	
	//vector<DBRule> _rules;

	//int _FDP_Include_CO;
	//int _FDP_Include_LASTDHD;
	map<string, int> _fleetNameMap;
	map<long long, string> _compositionNameMap;
	int _application = -1;
	//debug option
	bool _debug = false;
	string _debugCrewId;

	//8056 global variable
	map<string, pair<shared_ptr<roster_space>, shared_ptr<roster_space>>> g_rule8056_cache;//key=ruleId+tableNum+rowNum, value=pair<A,B>

	//7270 global variable
	map<string, pair<shared_ptr<roster_space>, shared_ptr<roster_space>>> g_rule7270_cache;//key=ruleId+tableNum+rowNum, value=pair<A,B>

	//8091 global variable
	//用匈牙利算法分配号位
	int segOrders[105]{ -1 };//下标x x号位上放了y号人
	int answer[105]{ -1 };//下标y y号人放在了几号位上
	bool match[105][105]{ false };
	bool used[105]{ false };
	bool isWarn = false;
	int number;
	bool findFor8091(const std::size_t x) {//第x个crew
		for (int j = 1; j <= number; j++) {    //扫描每个crew对应的号位
			if (match[x][j] == true && used[j] == false)//如果 可以符合该号位 且未尝试过在该号位上派人
			{
				used[j] = true;
				//j号位上没有人为-1
				if (segOrders[j] == -1 || findFor8091(segOrders[j])) {
					segOrders[j] = (int)x;
					answer[x] = j;
					return true;
				}
			}
		}
		return false;
	}

	//PairingCompositionCalculator* pairingCompositionCalculator = NULL;
	//检查法规的两个数据类，PG法规从_pgCheckList取数据，ROSTER法规从_dbData取数据
	//PO和RO需要把新生成的数据放入到下面两个数据类里
	vector<Pairing*> _pgCheckList;
	SharedPtr<CrewDataContext> _dbData;

	// 2112 Fleet Mix cache (built from table2 Allowable_Fleet_Mix rows).
	struct FleetMixCache {
		bool initialized = false;
		bool hasWildcard = false;
		std::vector<std::unordered_set<std::string>> allowedSets;
		std::unordered_set<std::string> listedFleets;
	};

	mutable std::mutex _fleetMixCacheMutex;
	mutable FleetMixCache _fleetMixDutyCache;
	mutable FleetMixCache _fleetMixPairingCache;

	const FleetMixCache& getFleetMixDutyCache(const vector<DBRule>& rules);
	const FleetMixCache& getFleetMixPairingCache(const vector<DBRule>& rules);
	static FleetMixCache buildFleetMixCache(const vector<DBRule>& rules);
	static bool isAllowedFleetMix(const std::unordered_set<std::string>& flightFleets, const FleetMixCache& allowedMix);

	string getMinCompositionForRest(Duty * duty);

	bool hasOptimizedNewRosterInRange(vector<SharedPtr<ROSTER>> rosters, time_t start, time_t end);

	bool checkBlockPerDutyByDuty(Duty * duty, SharedPtr<ROSTER> roster = NULL);
	//3007
	bool checkFDPPerDutyByDuty(Duty * duty, SharedPtr<ROSTER> roster = NULL);//设置MaxFDP + check
	void setFDPPerDutyByDuty(Duty* duty, SharedPtr<ROSTER> roster = NULL);//仅设置MaxFDP
	//3103
	bool checkFDPPerDutyByDuty_remind(Duty * duty, SharedPtr<ROSTER> roster = NULL);
	bool checkBlockPerDutyByDuty_remind(Duty * duty, SharedPtr<ROSTER> roster = NULL);
	//检查duty内所有segment是否包含fly/opr 包含为true 不包含为false
	bool checkDutyIsNoOperating(Duty * duty);
	void setDutyDiscretion_R5(Duty * duty);
	bool checkMaxGround(ROSTER * roster);
	//void setCheckInOut(Duty * duty, const DBRule* singleRule);
	void setMinResBy121(Duty * duty, const DBRule* singleRule);

	//2125: 逻辑同2124, 但只检查不赋值
	bool checkRest2125(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkRest2125MatchRuleParam(Duty* duty, const DBRule* singleRule);
	//void generateViolation2125(const DBRule* singleRule, int minRest, int actRest, string crewId, long long rosterId, long long pairingId, time_t startUtc, time_t endUtc);
	
	//3001
	bool checkMinConnBetwDIP(vector<Duty *>& duties, const vector<DBRule>& rules);
	bool checkMinConnBetwDIP(vector<Segment *>& segments, const vector<DBRule>& rules);

	//3003
	bool checkDepOrArrStationForPairing(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);

	int beforeNonConsWorkingRoster(vector<SharedPtr<ROSTER>> rosters, int startIndex, vector<string> workingRosterDuty);
	//LAYOVER_REST
	bool checkLayoverRest(vector<Duty *>& duties, const vector<DBRule>& rules);
	//8115
	bool checkMaxConsecutiveDuty_R6(vector<Duty *> duties);
	bool checkMaxConsecutiveDuty_R6(RULE_LEGALITY * pCrew);
	bool checkMaxAbroadDays(RULE_LEGALITY * pCrew);
	bool check8116(time_t start, time_t end, const DBRule & rule, shared_ptr<CREW>& crew, int offsetMinutes);
	bool check8115(vector<Duty*>& dutys, const DBRule& rule, int offsetMinutes, shared_ptr<CREW> crew = NULL);
	//bool check8115(vector<Duty*>& dutys, DBRule& rule, int offset);
	/*
	检查在某个时间范围内Roster里，是否存在iMinutesRest分钟休息时间
	*/
	bool checkXRestInRange(int iMinutesRest, vector<WORKDUTY_TIMES *> works, time_t startTime, time_t endTime);
	int  getMaxRestInRange(vector<WORKDUTY_TIMES *> works, time_t startTime, time_t endTime, bool& needRuleCheckInRange);
	//与getMaxRestInRange()算法相同，只是返回值不同。若休息时长超过iMinRest则直接返回，getMaxRestInRange()是获得最大MaxRest才返回
	vector<REST_TIME> getMaxRestTimeInRange(int& lastWorksIndex, const vector<WORKDUTY_TIMES*>& works, const time_t startTime, const time_t endTime, bool& needRuleCheckInRange);
	bool restHaveNites(vector<WORKDUTY_TIMES *> works, time_t startTime, time_t endTime, bool& needRuleCheckInRange, string localNiteStart, string localNiteEnd, string localNites, int iMinRest);
	time_t getRestStartInRange(int restMinutes, vector<WORKDUTY_TIMES *> works, time_t startTime, time_t endTime);

	//6115 QQ
	bool checkMaxConsecutiveDutyDay_QQ(RULE_LEGALITY * pCrew);

	//根据调用的Application和Phase决定需要检查的法规集合
	vector<DBRule> filterRules(const vector<DBRule>& rules, int application) const;

	vector<DBRule> filterRules(const long long ruleSetId, const vector<std::shared_ptr<RuleSet>>& ruleSetList, const vector<DBRule>& allRules, const int application) const;

	/*读取法规配比定义*/
	vector<RULE_COMPOSITION> _composition;
	void setCompositionDefinition();
	
	//bool basicSetting(Duty * duty);

	vector<RULE_COMPOSITION> calCompByBlock(Duty* duty);
	vector<RULE_COMPOSITION> calCompByFDP(Duty* duty);

	vector<RULE_COMPOSITION> calCompByBlock_R4(Duty* duty);
	vector<RULE_COMPOSITION> calCompByFDP_R4(Duty* duty);
	vector<RULE_COMPOSITION> getLegalCompositions(Duty* duty);

	//set brief/debrief/pickup/dropoff
	bool setDutyBuilderReq(Duty* duty);
	void setULR(Pairing* pairing);

	bool hasQualCombInCof(vector<SharedPtr<CrewOnFlight>> cof, string quals, time_t start, time_t end);

	//Local_Night_Definition getLocalNightDefinition();
	//long getRestByNumberOfLocalNights(time_t endUtcTm, int numberOfLocalNights, Local_Night_Definition locals, int offset);

	int getNumberOfProbationers(vector<SharedPtr<CrewOnFlight>>& crews, map<string, int>* probs, time_t nowDay);
	int getNumberOfProbationers(vector<SharedPtr<CrewOnFlight>>& crews, vector<string>& vActingRanks, vector<string>& probSettings, time_t nowDay);
	int getNumberOfProbationers(vector<SharedPtr<CrewOnFlight>>& crews, vector<string>& vActiveRanks, vector<string>& vActingRanks, vector<string>& probSettings, time_t nowDay, vector<string>& vAssignmentGroups, string rDateOfJoinRange = "*", bool bUtilizePrev = true);
	int getNumberOfProbationersByQual(vector<SharedPtr<CrewOnFlight>>& crews, vector<string>& vActiveRanks, vector<string>& vActingRanks, vector<string>& vFltAssignments, string fleet, vector<string>& probSettings, time_t nowDay, const DBRule* singleRule);
	//8141
	bool checkMax_X_Segs_In_Y_Days(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//according to cof, get the number of filled crews on the possitions (ranks)
	int getNumberOfFilledCrewPerRank(vector<SharedPtr<CrewOnFlight>> cof, vector<string> vRanks, time_t nowDay);
	int getNumberOfPlannedCrewPerRank(const map<string, int>& plans, vector<string> vRanks);
	void setLegalityMessage(RULE_LEGALITY * pcrew, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage);
	void setLegalityMessage(SharedPtr<CREW>& pCrew, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage);
	void setLegalityMessage(SharedPtr<ROSTER> pRoster, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage, long long ruleId = 0);
	void setLegalityMessage(Pairing * pPairing, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage);
	void setLegalityMessage(Duty * pDuty, RULE_LEGALITY* lc, const DBRule* singleRule, string strMessage,long long ruleId =0);
	void setLegalityMessage(Segment * pSegment, const DBRule* singleRule, string strMessage);
	void setLegalityMessage(Pairing * pPairing, const DBRule* singleRule, string strMessage);
	void addRuleViolations(RULE_VIOLATION* rv, const DBRule* singleRule);
	void addRuleViolations(SharedPtr<CREW> crew, SharedPtr<ROSTER> roster,Pairing* pairing,Duty * duty,Segment* segment, RULE_VIOLATION* rv, const DBRule* singleRule,string message);

	bool checkExtendRestBeforeDuty(vector<Duty*> duties, SharedPtr<CREW> crew);
	bool checkMinRestByType(vector<Duty*> duties, SharedPtr<CREW> crew);
	bool checkMinRestBeforeDutyByLength(vector<Duty*> duties, SharedPtr<CREW> crew);

	void addViolations(string msg);

	bool checkMinRest(Pairing * pPairing, SharedPtr<ROSTER> roster = NULL, SharedPtr<ROSTER> nextRoster = NULL, SharedPtr<ROSTER> nextNextRoster = NULL);
	bool checkMaxFdp(Pairing * pPairing, SharedPtr<ROSTER> roster = NULL);
	bool isAssignmentMrtOveride(string assign1, string assign2);
	void initialRules(vector<SharedPtr<ROSTER>>  rosters);

	//bool checkCustomizedRules(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	void sortRulesByNumOfVoliation();

	void checkPgLimitation(Pairing * pg);
	//void setMinRestByFDP(Pairing * pPairing, long callinSBY_FDPMins = 0);
	void setMinRestByFDP(Pairing * pPairing, SharedPtr<ROSTER> roster = NULL);

	bool checkLongTransit(vector<Segment*>& segments, const vector<DBRule>& rules, bool isPureSegmentCheck);
	bool checkLongTransit(vector<Duty*>& duties, const vector<DBRule>& rules);

	bool checkAirportRestrict(vector<Duty*>& duties);
	bool checkAirportRestrict(vector<Segment*>& segments);
	//将pairing里告警刷新到该对象里。
	void dumpViolations(Pairing * pairing, long long ruleId);
	void dumpViolations(Duty* duty, long long ruleId);
	void dumpViolations(vector<Duty *> duties, long long ruleId);
	bool checkFleetCombination(Duty * duty, const vector<DBRule>& rules, const SharedPtr<ROSTER> roster = nullptr);
	bool checkFleetCombination(vector<Segment*>& segs, const vector<DBRule>& rules, const SharedPtr<ROSTER> roster = nullptr);
	// only for optimizer 20200915
	// check fleet combination for vector<Duty*>
	bool checkFleetCombination(const vector<Duty*>& duties, const vector<DBRule>& rules, const SharedPtr<ROSTER> roster = nullptr);
	bool checkFleetCombination(RULE_LEGALITY* pCrew);
	void resetMinRestForOverlapRosters(SharedPtr<CREW> crew);
	bool isCallinStandby(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster);

	void setRestByLocalNights(vector<Duty *>& duties);
	bool isCheckEASAMinRestLNS(vector<Duty *>& duties);
	bool checkEASAMaxFDP(vector<Duty *> duties, const vector<DBRule>& rules);
	void setRestPeriods(Duty* duty);
	bool checkEASAMinRest(Pairing* pairing, SharedPtr<ROSTER> roster = NULL, SharedPtr<ROSTER> nextRoster = NULL, SharedPtr<ROSTER> nextNextRoster = NULL);
	bool checkEASAMinRestLN(Pairing* p, SharedPtr<ROSTER> roster = NULL, SharedPtr<ROSTER> nextRoster = NULL, SharedPtr<ROSTER> nextNextRoster = NULL);
	//EASA RULED End

	void setAcclimationState_QQ(RULE_LEGALITY * pCrew);
	void setAcclimationState_QQ(const vector<SharedPtr<ROSTER>>& rosters);

	void setAirportRestFacilty_QQ(Duty * duty);

    void  setPairingDutyTimesForDelayedFlight_QQ(Duty * duty); //航班延误调整Duty的FDP等时间
    void  setPairingDutyTimesForDelayedFlight_QQ(Pairing* pairing); //航班延误调整Duty的FDP等时间

	//6024
	void calculateMaxFdpForStand_QQ(RULE_LEGALITY * pCrew);
	void calculateMaxFdpForStand_QQ(const vector<SharedPtr<ROSTER>>& rosters);
		
	//6025 LIMIT_MAX_DP_QQ Duty任务采用计算Max DP，通过rule0000进行检查。地面任务直接进行check检查
	void calculateMaxDP_QQ(Duty* duty);
	void calculateMaxDP_QQ(Pairing* pairing);
	bool checkMaxDP_QQ(RULE_LEGALITY* pCrew);
	bool checkMaxDP_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMaxDP_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//6026 LIMIT_FLEET_FOR_STANDBY_QQ
	bool checkFleetForStandby_QQ(RULE_LEGALITY* pCrew);

	bool checkTransitAndLayover_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkTransitAndLayover_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	bool checkLongTransit_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkLongTransit_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	bool checkAircraftChange_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAircraftChange_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	bool checkRestrictMidDutyBaseTurn_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkRestrictMidDutyBaseTurn_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//6037
	bool checkFlightDHD_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkFlightDHD_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

		/**
	* 判断在roster中是否已经检查过Pairing，与addCheckPairingInRoster()配合使用
	* @param ruleFuncId：rule的function
	* @param pairingDbId:
	* @return：true表示该Pairing在Roster已经检查过了，否则false
	*/
	bool isCheckPairingInRoster(const unsigned int ruleFunc, const long long pairingDbId);

	//添加roster检查pairing的id
	void addCheckPairingInRoster(const unsigned int ruleFunc, const vector<SharedPtr<ROSTER>>& rosters);
	void addCheckPairingInRoster(const unsigned int ruleFunc, const long long pairingDbId);

	// 6001 multi-thread
	bool _helper6001MT = false;

	void initRule();

	//判断segment是否训练line training任务
	bool isTrainingFlight(const Duty* duty) const;

	bool isUsedStdOnFlightDelay(const Duty* duty);

public:

	inline const string& getFiliale() const {
		return _filiale;
	}
	inline void setFiliale(const string& filiale)  {
		_filiale = filiale;
	}

	inline const string& getDivision() const {
		return _division;
	}
	inline void setDivision(const string& division) {
		_division = division;
	}

	void removeCheckPairingInRoster(const unsigned int ruleFunc, const long long pairingDbId);

	void copyTransactionData(const LegalityChecker* srcChecker);

	//开始事务与结束事务成对调用，每次法规检查开启事务
	void startTransaction();
	//结束事务
	void endTransaction();

	void cleanViolations();

	/*
	RO接口：
	判断某些新分配Pairings，和Crew的现有Roser是否重叠
	*/
	bool isOverlap(SharedPtr<CREW> crew,vector<shared_ptr<Pairing>> pairings);

	void PrintRuleStatistics();
	/*
	国航独有逻辑，暂时Hardcode
	RTEW > RTEE > RTES > RTWW > RTWS > RTAW > RTAS
	PPL1 > PPL2 > PPL3 > PPL4 > PPL5
	*/
	std::unordered_map<string, int> _reportQuals, _airportQuals;

	//return the number of rule called
	map<long long, unsigned int> getRuleCalledStat();// { return RuleStatistics::GetInstancePtr()->getRuleCalledTimes(); };
	unordered_map<long long, int> getRuleViolatedStat();//{ return RuleStatistics::GetInstancePtr()->getRuleViolatedTimes(); };
	//return the clock of rule called
	map<long long, clock_t> getRuleTimeStat();//{ return RuleStatistics::GetInstancePtr()->getRuleCalledClock(); };
	void setDBConnectionString(string connection, string user, string password);
	SharedPtr<CrewDataContext> getDataContext();// { return _dbData; };
	//根据duty的block时间和fdp得到所有可用的配比
	map<string, map<string, vector<int>>> calculateComposition(Duty * duty);
	//PO接口：根据FDP/BLK和DUYT/SEGMENT本身COMPOSITION信息，返回给PO最经济并合规的配比名称，如2P/3P
	bool getMinQualifiedComposition(Duty* duty, int application=ROSTER_EDITOR);
	string getCompositionByRanks(Duty* duty);
	bool calculateMinimumLegalComplements(Pairing* pairing);
	MinimalLegalComplementRef calculateMinimumLegalComplementForDuty(Duty* duty, const vector<int>& configuredRules);
	MinimumLegalComplementRange calculateMinimumLegalComplementRange(Duty* duty, const std::vector<string>& checkCompositionNames);
	bool checkMinimumLegalComplementCandidate(Duty* duty, const vector<int>& configuredRules);

	//8099 MIN_REST_BEFORE_DUTY
	bool chekcMinRestBeforeDutyByDP(vector<Duty*> duties, SharedPtr<CREW> crew = NULL);
	//8100 DO_GAP
	bool checkDOGap(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//8103 MAX_LOCAL_NIGHTS
	bool checkMaxLocalNights(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//8096
	bool setMaxFDPByTimes(vector<Duty*> duties, SharedPtr<CREW> crew=NULL);
	bool setMaxFDPByExtension(vector<Duty*> duties, SharedPtr<CREW> crew=NULL);

	void calculatePairingFdpRest(Pairing* pg);
	void calculatePairingBriefDebrief(Pairing* pg);

	void calculatePairingMaxFdpRest(Pairing* pg);

	void calculatePairingLabel(Pairing* pg);//计算Pairing Label

	void calculatePairingFdpRest(RULE_LEGALITY* pCrew);

	//Pairing rules interface
	//bool checkPGRules(Duty * duty, int application);
	/*Editor Interface*/
	bool checkPGRules(Pairing * pg, vector<int> rules, int application=PAIRING_EDITOR);
	void createPGrulesViolation(const DBRule* singleRule = NULL, long long ruleId = 0, Pairing* p = NULL, Duty *d = NULL, Segment* s = NULL);
	/*PO Interface*/
	//all duties lies in one pairing
	bool checkPGRules(vector<Duty *>& duties, vector<int> rules);
	//all segments lies in one duty
	bool checkPGRules(vector<Segment *>& segments, vector<int> rules);
	void recordOptimizerRuleFailureById(long long ruleId);
	void recordOptimizerRuleFailureByFunction(unsigned int ruleFunction);

	bool checkLayoverStation(string stationName);
	bool checkLongTransitStation(string stationName);
	bool checkAircraftChangeStation(string stationName);
	//Pairing rules interface end

	vector<RULE_COMPOSITION>* getCompositionDefinition();//{ return &_composition; };
	//设置Rule Window Range
	void setRuleWindowRange(time_t start, time_t end);// { _window_start = start; _window_end = end; };
	int getCallCount();// { return callCount; };
	SharedPtr<CrewDataContext> getCrewContext();// { return _dbData; };
	//default disable debug option, default application : RO

	void setDebugMode(bool bMode) { _debug = bMode; };
	void resetPairingDutySegTimeByFlight(SharedPtr<CrewDataContext>& dbData, vector<SharedPtr<Segment>>& flights, vector<Pairing*>& pairings);
	void completePairingDutySegTimeByFlight(SharedPtr<CrewDataContext>& dbData, vector<Pairing*>& pairings);
	void completeRoster();
	void resetDutyNodeTime(SharedPtr<CrewDataContext>& dbData, Duty* duty, vector<long long>& changeSchStartFLtId, const string& pairingBase, const Duty* beforeDuty = nullptr, const Duty* nextDuty = nullptr);
	int GetApplication();// {return _application;};
	void setApplication(int iAppID);//{ _application = iAppID; };
	vector<string> getViolations();// { return _violations; };

	void addPgToCheckList();

	void initializeDB();
	void initializeDB(long long scenarioId);

	void releaseDB();
	void addPairingToCheckList(Pairing* _pg);
	//3021~3024
	void setDutyBrief(Duty* duty, const string& pairingBase = "");
	void setDutyDebrief(Duty* duty, const string& pairingBase = "");
	void setDutyPickup(Duty* duty, const string& pairingBase, const Duty* beforeDuty = nullptr, const Duty* nextDuty = nullptr);
	void setDutyDropoff(Duty* duty, const string& pairingBase, const Duty* beforeDuty = nullptr, const Duty* nextDuty = nullptr);
	int calculateDutyBrief(Duty* duty, const string& pairingBase = "", const string& briefField = RuleParams::DUTY_BRIEF_FIELD);
	void apply3021MaxFdpBriefDelta(Duty* duty, const string& pairingBase = "");
	int calculateDutyDebrief(Duty* duty, const string& pairingBase = "");
	int calculateDutyPickup(Duty* duty, const string& pairingBase, const Duty* beforeDuty = nullptr, const Duty* nextDuty = nullptr);
	int calculateDutyDropoff(Duty* duty, const string& pairingBase, const Duty* beforeDuty = nullptr, const Duty* nextDuty = nullptr);
	//2124
	bool checkMinRest(Duty * duty, const DBRule* singleRule, long callinSBY_FDPMins = 0, bool skipAttr = false);
	void setMinRest(Duty * duty, const DBRule* singleRule, long callinSBY_FDPMins = 0);
	void setMinRest(Pairing* pg, const DBRule* singleRule, long callinSBY_FDPMins = 0);
	void setMinRest(Duty * duty, const DBRule* singleRule, int size, SharedPtr<ROSTER> roster);
	void setMinRest(Pairing* pg, const DBRule* singleRule, int size, SharedPtr<ROSTER> roster);


	bool DebugMode() const;//{ return _debug; };
	void setDebugCrewId(string id) { _debugCrewId = id; };
	std::size_t getRuleSize();

	//check rules with crew and roster id list, result -> checkList
	bool checkRules (vector<RULE_LEGALITY *> checkList);
	bool checkRulesImpl(vector<RULE_LEGALITY *>& checkList);
	//bool checkSingleRule(vector<RULE_LEGALITY *> checkList, int ruleId,bool isForHard);
	bool checkRules(int crewIndex);
	bool getMan(string crewid, long long rosterid);

	bool checkMinRest(vector<Duty*> duties);

	//update crew,roster,pairing information with new assignments in rule engine from roster optimizer
	bool syncData(struct RULE_LEGALITY * dataList);

	void setRuleSet(string strRuleSetID);// { _RuleSetID = strRuleSetID; };

	string getRuleSet();//{ return _RuleSetID; };

	const vector<DBRule>& getAppRules() const { return _appRules; }

	//vector<RULE_LEGALITY> check_crew_legality(string *crewList, string strDT, string endDT);
	//如是下面两种模式：日期范围是DOPS WINDOW
	//vector<RULE_LEGALITY> check_pairing_legality(string *pairingList);
	//vector<RULE_LEGALITY> check_flight_legality(string *flightList);

	//0000 法规，通用检查
	bool checkGeneralRule(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkGeneralRule(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkGeneralRule(RULE_LEGALITY* pCrew);
	void calculateGeneralRule(Pairing* pairing);
	void calculateGeneralRule(vector<Duty*>& duties);
	void calculateGeneralRule(RULE_LEGALITY* pCrew);

	//2001 CALC_MANUAL_LIMIT
	void setManualLimit(Duty* duty);
	void setManualLimit(Pairing* pairing);
	void setManualLimit(SharedPtr<ROSTER>& roster);
	void setManualLimit(RULE_LEGALITY* pCrew);

	bool checkBlockPerDutyByDuty_R4(Duty * duty, const DBRule* singleRule);
	bool checkFDPPerDutyByDuty_R4(Duty * duty, SharedPtr<ROSTER> roster, const DBRule* singleRule);
	void setDutyDiscretion_R4(Duty * duty);

	bool checkMaxAttribute(RULE_LEGALITY * pCrew,const DBRule* singleRule);
	bool checkAttributeSpace(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkBlockPerDuty(RULE_LEGALITY * pPairing, const DBRule* singleRule);
	bool checkBlockPerDuty_Roster(RULE_LEGALITY * pPairing);
	bool checkBlockPerDuty_Roster_remind(RULE_LEGALITY * pPairing);
	bool checkFDPPerDuty(RULE_LEGALITY * pPairing, const DBRule* singleRule); 
	bool checkFDPPerDuty_Roster(RULE_LEGALITY * pPairing);
	bool checkFDPPerDuty_Roster_remind(RULE_LEGALITY * pPairing);
	bool checkMinRestIn7Days(RULE_LEGALITY * pPairing, const DBRule* singleRule);
	bool checkMaxFlightDutyPeriod_QQ(RULE_LEGALITY * pPairing);

  	//6008
  	bool checkFdpAndFtDiscretionForFd_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
  	bool checkFdpAndFtDiscretionForFd_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
  	void setFdpAndFtDiscretionForFd_QQ(Duty * duty);
  	void setFdpAndFtDiscretionForFd_QQ(Pairing* pairing);

	//6009
	bool checkFdpAndFtDiscretionForCC_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkFdpAndFtDiscretionForCC_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	void setFdpAndFtDiscretionForCC_QQ(Duty * duty);
	void setFdpAndFtDiscretionForCC_QQ(Pairing* pairing);

	bool checkMaxFlightTime_QQ(RULE_LEGALITY * pPairing);
	bool checkMaxFlightTimeSingleDuty_QQ_CC(Duty* duty);
	bool checkMaxFlightDutyPeriodSingleDuty_QQ(Duty* duty);
	void calculateMaxFlightDutyPeriod_QQ(Duty * duty, SharedPtr<ROSTER> roster = NULL);
	//for po
	void calculateMaxFlightDutyPeriod_QQ(Pairing * pairing);
	void calculateMaxFlighTime_QQ_CC(Pairing* pairing);
	void calculateMaxFlighTime_QQ_CC(Duty * duty);
	bool CheckMaxConsecutiveEarlyStart(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool CheckMaxConsecutiveWOCLDuty(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool CheckMaxEarlyDutyInAnyConsecutiveDay(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool CheckMaxConsecutiveNightsAwayFromBase(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool CheckWorkingDaysLimit(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//for QQ 6038
	bool checkAdaptionPeriod4MaxConsecutiveDuty(Pairing* pairing); // Added by Aspen on 2024.8.7 for Adaption Period calcuation about the maxConsecutiveDuty, the duty should be in Unknow status
	bool checkAdaptionPeriod4MaxConsecutiveDuty(RULE_LEGALITY* pCrew);

	//6039 CHECK_MIN_NUM_CREW_RANK
	bool checkMinNumOfCrewRank(RULE_LEGALITY* pCrew);

	//6041 CHECK_MAX_NUMBER_OF_DP_IN_RP_FOR_QQ
	bool checkMaxNumberOfDPInRPForQQ(RULE_LEGALITY* pCrew);

	//8101
	bool checkMinRestIn7Days_R5(RULE_LEGALITY * pPairing, const DBRule* singleRule);
	bool checkMinRestIn7Days_R5(Pairing* p);
	bool checkMinRestIn7Days_R5(vector<Duty*>& dutys);
	//8102
	bool checkGapBtwTwoDiscretions(RULE_LEGALITY * pPairing, const DBRule* singleRule);

	bool checkMaxCummulative(RULE_LEGALITY * pPairing, const DBRule* singleRule);
	bool checkMaxCummulative2(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//8125
	bool checkMaxCummulativeExtensiton(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//8126
	bool checkCOFQualCombination(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//6001
	//std::vector<OccupationStatus> howManyRDOInRange(vector<SharedPtr<ROSTER>>& rosters, long rangeStart, long rangeEnd, long leadIn, long leadOut, long minLength, long prevRPRosterEndTime, bool useDutyRest, bool isSplit);
//	vector<std::unique_ptr<RDO_Ranges>> LegalityChecker::checkRDOValid(map<int, vector<RDO_Ranges*>> map, const vector<int>& preferred);
	

	//EASA RULES Begin 7000(old)
	void setAcclimationState(vector<Duty *> duties);//7000(old)废弃
	void setSplitDuty(vector<Duty *> duties);
	void setAcclimationStateByLocalNights(vector<Duty *> duties);

	///EASA RULES 7000(new)
	void setAcclimationStateOfEASA(Pairing* pairing);
	void setAcclimationStateOfEASA(Duty* duty);
	void setAcclimationStateOfEASA(RULE_LEGALITY* pCrew);
	void setAcclimationStateOfEASA(const vector<SharedPtr<ROSTER>>& rosters);

	//6005
	void setAcclimationState_QQ(Pairing* pairing);
	void setAcclimationState_QQ(Duty* duty);

	void setAirportRestFacilty_QQ(Pairing * pairing);

	//8127
	bool checkCOFMultipleQuals(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//8105
	bool checkMaxCummuFatigue(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//8106
	bool checkPtnRequiredCrew(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkPtnRequiredCrewForPairing(SharedPtr<CREW> crew, Pairing* pairing, const DBRule* singleRule);
	bool checkTravelDocument(RULE_LEGALITY * pPairing, const DBRule* singleRule);
	bool checkTravelDocByPairing(SharedPtr<CREW> crew, Pairing* pairing,const DBRule* singleRule);
	bool checkPortRequirements(RULE_LEGALITY * pPairing, const DBRule* singleRule);
	bool checkPortReqByPairing(SharedPtr<CREW> crew, Pairing* pairing, string actingRank);
	bool checkBasicCompetency(RULE_LEGALITY * pPairing, const DBRule* singleRule);
	bool checkBasicCompetencyByPairing(SharedPtr<CREW> crew, Pairing* pairing, string actingRank, const DBRule* singleRule);
	bool checkAttributeByPairing(SharedPtr<CREW> crew, Pairing* pairing, string actingRank, const DBRule* singleRule);
	
	//8028
	bool checkDutyByCrewNationality(RULE_LEGALITY* pCrew, const DBRule* singleRule);

	bool checkPairingLimitation(RULE_LEGALITY * pPairing, const DBRule* singleRule);
	bool checkPairingLimitation(const vector<Duty *>& duties, const DBRule* singleRule);
	bool checkRosterSpace(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//8090
	bool checkRosterSpaceByWP(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	
	bool checkConsecutiveRosters(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkPairingLimitation(Pairing * pPairing, const DBRule* singleRule);
	bool checkPairingLimitation(Pairing * pPairing);
	bool checkPairingLimitationImplemenation(const vector<Duty *>& duties, const DBRule* singleRule, Pairing* pPairing = nullptr);
	bool checkDutyLimitation(RULE_LEGALITY * pPairing, const DBRule* singleRule);
	bool checkDutyLimitation(vector<Duty *> duties, const DBRule* singleRule,string base="");
	bool checkDutyLimitation(vector<Segment *> segments, const DBRule* singleRule, string base = "");
	int  getDutyLongTransitNumber(Duty* duty); //PO 调用
	int  getDutyAircraftChangeNumber(Duty* duty);//PO 调用
	int  getSegmentsLongTransitNumber(vector<Segment *>& segments); //PO 调用
	int  getSegmentsAircraftChangeNumber(vector<Segment *>& segments); //PO 调用
	int getSegmentsLongTransitTime(vector<Segment *>& segments);//PO 调用
	bool checkActingRank(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkQualCombination(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//8114
	bool checkCrewRankFleetSpecial(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//8092
	//bool checkExpatCrewCombinationRestriction(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkExpatCrewCombinationRestriction(Pairing * pg, const DBRule* singleRule, string crewAId);
	//8111
	bool checkMaxStudentInflight(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMaxStudentInflight_ro(SharedPtr<CREW>& crew, Pairing* p, string comments);
	//2030
	string getCompositionByDuty(Duty* duty, string division = "");
	string getCompositionByDutyFor3(Duty* duty, string division = "");
	string getCompositionByDutySegmentFor3(Duty* duty, string division = "");
	string getCompositionByPairing(Pairing* pairing);
	void setDutyDiscretion_2030(Duty * duty);
	//2130
	int getCrewNumsByDuty(Duty *duty, std::string division);
	//ROLE_CHECK
	bool checkNumberOfRoles(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	
	bool checkDutyGroupReqQual(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkGroupReqQualByPairing(SharedPtr<CREW> crew, Pairing* pairing, string actingRank, const DBRule* singleRule);

	bool checkLocationContinuity(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//8015
	bool checkULRRest(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkULRRestForPairing(const Pairing* pairing, const DBRule* singleRule);
	//7269 SCH_ULR_REST_CHECK_FOR_EVA_FD (8015的分身，按计划时间检查)
	bool checkSchULRRest_ForEvaFd(RULE_LEGALITY* pCrew, const DBRule* singleRule);

	//ACCLIMATIZED_REST 8018
	bool checkAcclimatizedRest(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//Probation Rules for EVA
	bool checkMaxProbationCrossRank(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMaxProbationPerRank(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMinProbationPerRank(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//PROBATION_CHECK_BY_RANK
	bool checkProbationbyRank(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkProbationbyRank(SharedPtr<CREW>& crew, Pairing* pg, string actingRank, const DBRule* singleRule);

	bool checkProbationbyQual(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	bool checkRecency(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	bool checkDaysOff(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMaxAssignmentGroup(RULE_LEGALITY * pCrew, const DBRule* singleRule);
    bool checkMaxRosterProperties(RULE_LEGALITY * pCrew, const DBRule* singleRule);
    bool isMaxRosterProperties(RULE_LEGALITY * pCrew, const std::string& label);
	bool checkDaysOffAfterAttribute(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkPilotAge(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkDutyOnCrewBirthday(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkTeamRoster(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMaxDaysAwayFromBase(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMaxDaysAwayFromBase2(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMinDOPerAL(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMinDOBeforeEarlyDuty(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMaxFTSBY(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//dumy ft check 8081
	bool checkMaxDummyFt(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//PAIRING_MIN_REST_IN_XHOURS  2032,
	bool checkPairingMinRest(Pairing * pPairing, const DBRule* singleRule);
	bool checkPairingMinRest(vector<Duty*> dutyVec, const DBRule* singleRule);
	//2027
	//MIN_REST_POST_DUTY_FOR_CABIN
	bool checkMinPostDutyForCabin(Duty* duty, Duty* nextDuty, const DBRule* singleRule);
	//2030
	//MAX_FLIGHT_DUTY_PERIOD_CABIN
	bool checkMaxFlightDutyPeriodCabin(Duty* duty, const vector<DBRule>& singleRules);
	bool checkMaxFlightDutyPeriodCabinNew(Duty* duty, const vector<DBRule>& singleRules);
	bool getIsAugment_2030(Duty* duty,string division);//PO 调用
	string getDutyAbbr(Duty* duty);
	//3008
	bool getIsAugment_3008(Duty * duty);//PO 调用
	//3007
	bool getIsAugment_3007(Duty * duty);//PO 调用
	//2008
	bool getIsAugment_2008(Duty * duty);//PO 调用
	//2007
	bool getIsAugment_2007(Duty * duty);//PO 调用
	//8091
	bool checkRankPositionComb(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkRankPositionCombFor3(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	map<string, int> recalculateSegSeqOrderOptimization(Pairing* p, string crewId="");
	map<string, int> getSeqOrderOptimization(vector<SharedPtr<RankCombination>>& rankCombs, vector<SharedPtr<RosterFlight>> rosterFlights, string pCompositionSource, string crewId="");
	map<string, int> getSeqOrderUi(vector<SharedPtr<RankCombination>>& rankCombs, vector<SharedPtr<RosterFlight>> rosterFlights, SharedPtr<ROSTER> roster, string pCompositionSource, const DBRule* singleRule = NULL);
	map<string, int> getSeqOrderUiAll(map<int, vector<RankCombination*>>& Options, vector<SharedPtr<RosterFlight>> rosterFlights, SharedPtr<ROSTER> roster, string pCompositionSource, const DBRule* singleRule = NULL);
	void recalculateSegSeqOrder(Segment* segment, SharedPtr<CrewDataContext>& dbData);
	void recalculatePairingSeqOrder(Pairing* pairing, SharedPtr<CrewDataContext>& dbData);
	vector<int> getSegmentOptions(long long rankCombID, vector<SharedPtr<RosterFlight>> rfs, Segment* seg, string division, Pairing* p, string pCompositionSource, bool checkPosition = true);
	bool checkPositionForOption(vector<SharedPtr<RosterFlight>> rosterFlights, map<string, int> optionComp, vector<RankCombination*> Options, vector<string> ranks);
	string getPairingOptions(vector<Segment*> segments, string division);
	bool checkSegHasMoreThanTowPairing(Pairing* p);
	bool checkRankCombination(Pairing* pairing, const DBRule* singleRule);
	map<string, int> calculateOpenCompositionOptimization(Pairing * p);
	string getFleetByFlt(SharedPtr<RosterFlight> rosterFlight);
	std::unordered_map<std::string, std::unordered_map<long long, std::vector<string>>> CrewToPairingToActingRanks(CREW * crew, Pairing * pairing);
	//8098
	//MIN_TAKEOFFS_IN_YDAYS
	bool checkMinTakeOffInYDays(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//reset rule set/calcualtion in the roster , it should be invoked before the roster list is changed.
	void resetRoseter(int rosterIndex, SharedPtr<CREW> crew);
	//update roster pairing
	void updatePairing(std::shared_ptr<CREW> crew, std::shared_ptr<ROSTER> roster, Pairing* oldPairing);
	void resetPairing(std::shared_ptr<CREW> crew, std::shared_ptr<ROSTER> roster, Pairing* newPairing);

	bool checkAdvisorInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	bool checkMinRestsAfterWorkingDuties(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//MAX_XFLY_IN_YDAYS
	bool checkXFLYInYDays(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//MAX_CONSECUTIVE_ROSTER_ATTRIBUTE
	bool checkMaxConsecutiveRosterWithAttr(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	
	//8080
	void resetMinRestInRoster(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MAX_CONSECUTIVE_EARLY_DUTY
	bool checkMaxConsecutiveEarlyDuty(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkMaxConsecutiveEarlyDutyForPairing(Pairing* pPairing, const DBRule* singleRule);

	//NEXT_ROSTER_AFTER_MOVEPATTERN
	bool checkNextRosterAfterMovingPattern(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MIN_CONSECUTIVE_DO = 8024
	bool checkMinConsecutiveDaysOff(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MIN_CONSECUTIVE_RDO = 6001
	bool checkMinConsecutiveRosterDaysOff(RULE_LEGALITY * pCrew);

	std::vector<std::vector<OccupationStatus>> GetAvailableOccupationStatus(RULE_LEGALITY * pCrew);

	bool CheckRDOLengthAndLeadOutLegality(const std::bitset<Helper6001::RosterPeriodLength>& status, const vector<SharedPtr<ROSTER>>& rosters, const RDOParamCache& cache, time_t rangeStart, time_t rangeEnd, RULE_LEGALITY* pCrew, const DBRule* singleRule = NULL, const bool isWarning = false);

	std::vector<std::vector<OccupationStatus>> howManyRDOInRange(const RDOParamCache& cache, SharedPtr<CrewDataContext>& dbData, RULE_LEGALITY* pCrew, vector<SharedPtr<ROSTER>>& rosters, time_t rangeStart, time_t rangeEnd, time_t prevRPRosterEndTime, const vector<string>& restAssignmentGroup, bool isSplit, bool& prevStartValid);

	bool checkMinConsecutiveRest(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	
	//COMMUTE
	bool checkCommute(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//ADDITIONAL_REST = 8035
	bool checkAdditionalRest(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MAX_EXPATCREW_ON_COF = 8042
	bool checkMaxExpatCrewOnFlight(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//EVA_MAX_EXPATCREW_ON_COF = 8075
	bool checkEVAMaxExpatCrewOnFlight(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//8076
	bool checkRosterLimitationOnOutstation(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	
	//8077
	bool checkMaxCrewOnPairing(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MAX_DOWNGRADE_ON_COF
	bool checkMaxDowngradeOnFlight(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MAX_DOWNGRADE
	bool checkMaxDowngrade(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MAX_DOWNGRADE_IN_SCENARIO
	bool checkMaxDowngradeInAScenario(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//EVA_CREW_PREFERENCES
	bool checkCrewPreference(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//CREW_FLEET_RECENCY
	bool checkCrewFleetRecency(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MIN_QAL_PER_FLEET_RANK
	bool checkMinQualByFleetAndRank(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//EVA_CREW_FLY_TOGETHER
	bool checkCrewFlyTogether(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//8056 ROSTER_SPACING
	bool checkRosterSpaceByLableAndAtt(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	bool checkRosterSpaceByLableAndAtt(SharedPtr<CREW> crew, Pairing* pairing, const DBRule* singleRule,bool isDebug);

	//7270 SCH_ROSTER_SPACING_FOR_EVA_FD 8056的分身，通过计划时间检查（EVA)
	bool checkSchRosterSpaceByLableAndAtt_ForEvaFd(RULE_LEGALITY* pCrew, const DBRule* singleRule);

	//ROSTERS_DIRECT_CONNECTION_LIMITATION
	bool checkRosterConnByLableAndAtt(RULE_LEGALITY * pCrew, const DBRule* singleRule);


	//MIN_CREW_AT_LO
	bool checkMinCrewAtLayoverByBase(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MIN_EXP_CREW_ON_COF
	bool checkPercentageOfExpCrew(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//ANNUAL_LEAVE
	bool checkAnnualLeave(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MIN_REST_BEFORE_ASSGN
	bool checkMinRestBeforeAssgngroup(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//HOME_STANDBY_LIMITATION
	bool checkHomeStandby(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//EVA_ADO
	bool checkADOinWeeks(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MIN_DO_AFTER_HOME_BASE
	bool checkMinDOAfterHome(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MAX_CONSECUTIVE_LATE_DUTY
	bool checkMaxLateDuties(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MIN_REST_AFTER_OUTOFBASE
	bool checkRestAfterLongAwayBase(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MIN_REST_AFTER_OUTOFBASE
	bool checkGeneralDOReq(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//对UTC [start,end]区间重新计算crew的manday数据
	bool reCalculateCrewManday(SharedPtr<CREW>& crew, time_t start, time_t end);

	//MIN_QAL_PER_FLEET_RANK
	bool checkGenMinQualByFleetAndRank(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//CA_CREW_COMBINED_QULS
	bool checkCOFCombinedQuals(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//CA_EXEMPT_FLIGHT_REST
	bool checkExemptFlightRest(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//CA_CHECK_QUARANTINE
	bool checkQuarantinePeriod(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//CA_QUARANTINE_DEFINITION
	void setQuarantineByDefinition(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	void setQuarantineByDefinition(RULE_LEGALITY * pCrew);
	//CA_ROSTER_BRING_LIMITATION
	bool checkRosterBringLimitation(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//8124 未定义func常量，未使用
	bool checkRosterBringLimitation2(RULE_LEGALITY * pCrew, const DBRule* singleRule);


	//GEN_CREW_FLY_TOGETHER
	bool checkGenCrewFlyTogether(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//GEN_CREW_PREFERENCE
	bool checkGenCrewPreference(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	

	//MAX_PTN_IN_SCENARIO
	bool checkMaxPatternInScenario(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MAX_PTN_BY_DATE
	bool checkMaxPatternByDate(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MAX_PTN_IN_SCENARIO_HARD_CONSTRAINT
	//bool checkHARDMaxPatternInScenario(RULE_LEGALITY * pCrew, const DBRule* singleRule, int slack);

	//INSTRUCTOR_STUDENT_BOUND (8074)
	bool checkInstructorStudentBound(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//CREW_APPLICABLE_PTN (8006)
	bool checkApplicablePTNForCrew(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//MONTHLY_ASSIGNMENTS=8079
	bool checkMonthlyAssignments(RULE_LEGALITY * pCrew, const DBRule* singleRule);

	//TIMES_CHECK_IN_SWAP=8081
	bool checkTimesInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//8082
	bool checkDaysOffInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//8086
	bool checkMaxALInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//8087
	bool checkMaxFTInSwap(RULE_LEGALITY * pCrew, const DBRule* singleRule);
	//check Segments attribute one Duty
	bool checkSegsInSameDuty(vector<Segment*>& segments);

	//iOperation=0,1,2 : add/delete/update
	//iOperation=2, prevRoster/currentRoster must be no NULL
	//bool updateCrewManday(SharedPtr<CREW>& crew, int iOperation, SharedPtr<ROSTER> prevRoster, SharedPtr<ROSTER> currentRoster);

	//临时需求 对于roster改变后 需检查法规
	bool checkCrewRosterChangeRules(RULE_LEGALITY* pCrew);

	//6100 CALCULATION_OF_OFF_DUTY_PERIOD
	void setDutyDiscretion2_QQ(Duty * duty);
	void setDutyDiscretion2_QQ(Pairing * pairing);

	//6120 CHECK_OFF_DUTY_PERIOD_FOR_QQ 6100的分身进行检查MinRest
	bool checkOffDutyPeriodForQQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkOffDutyPeriodForQQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkOffDutyPeriodForQQ(RULE_LEGALITY* pCrew);

	//6121 CHECK_ASSIGNMENT_OVERLAPPABLE
	bool checkAssignmentOverlap(RULE_LEGALITY* pCrew);

	//6101 REDUCE_ODP_AT_BASE_QQ
	void reduceMinRestAtBase_QQ(RULE_LEGALITY * pCrew);
	void reduceMinRestAtBase_QQ(Duty * duty);
	void reduceMinRestAtBase_QQ(Pairing * pairing);

	//6102 REDUCE_ODP_AWAY_FROM_BASE_QQ
	void reduceMinRestAwayFromBase_QQ(RULE_LEGALITY * pCrew);
	void reduceMinRestAwayFromBase_QQ(Duty * duty);
	void reduceMinRestAwayFromBase_QQ(Pairing * pairing);

	//6020 MAX_FLIGHT_DUTY_BY_SPLIT_DUTY
	void setMaxFlightDutyBySplitDuty_QQ(Duty * duty);
	int getDutyDPManday(Duty* duty);
	bool checkMaxFlightDutyBySplitDuty_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMaxFlightDutyBySplitDuty_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMaxFlightDutyBySplitDuty_QQ(RULE_LEGALITY* pCrew);

	//6103 ODP_CUMULATIVE_IN_7DAYS
	bool checkOffDutyPeriodsForCumulativeIn7Days_QQ(RULE_LEGALITY * pCrew);

	//6104 ODP_CUMULATIVE_IN_28DAYS(废弃)
	bool checkOffDutyPeriodsForCumulativeIn28Days_QQ(RULE_LEGALITY * pCrew);

	//6010 LIMIT_BEFORE_ANNUAL_LEAVE
	bool checkLimitBeforeAnnualLeave_QQ(RULE_LEGALITY * pCrew);

	//6011 CHECK_MIN_REST_BETWEEN_CONSECUTIVE_DAYS
	bool checkMinRestBetweenConsecutiveDays(RULE_LEGALITY* pCrew);

	//6109 MIN_OFF_DUTY_PERIOD_FOR_CC
	void setDutyDiscretion_QQ(Duty * duty);
	void setDutyDiscretion_QQ(Pairing* pairing);

	//6110 MIN_ODP_IN_PERIOD_FOR_CC
	bool checkMinODPInPeriodForCc_QQ(RULE_LEGALITY * pCrew);

	//6111 REST_DISCRETION_QQ
	bool checkRestDiscretion_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkRestDiscretion_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	void setRestDiscretion_QQ(Duty * duty);
	void setRestDiscretion_QQ(Pairing* pairing);

	//6105 MIN_REST_AT_BASE_OR_LAYOVER_STATION
	bool checkMinRestAtBaseOrLayover_QQ(RULE_LEGALITY * pCrew);

	//6105 MIN_REST_AT_BASE_OR_LAYOVER_STATION
	bool checkMinRestAtBaseOrLayover_QQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);

	//6105 MIN_REST_AT_BASE_OR_LAYOVER_STATION
	bool checkMinRestAtBaseOrLayover_QQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr );

	//6105 MIN_REST_AT_BASE_OR_LAYOVER_STATION
	void setMinRestAtBaseOrLayover_QQ(Duty * duty);
	void setMinRestAtBaseOrLayover_QQ(Pairing* pairing);

	//6105 MIN_REST_AT_BASE_OR_LAYOVER_STATION
	void setMinRestAtBaseOrLayover_QQ(SharedPtr<ROSTER> roster);

	//7006
	double CalculateMandayFTCustom_TG(Segment* segment);
	//7007
	bool CheckMinRestInRangeRule(RULE_LEGALITY * pCrew);
	//7008
	bool CheckConsecutiveDuty(RULE_LEGALITY * pCrew);
	//7009
	bool CheckSingleDutyPerDay(RULE_LEGALITY * pCrew);
	bool CheckSingleDutyPerDay(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	//7011
	bool CrewCountryLimitation(RULE_LEGALITY * pCrew);
	bool CheckCrewCountryLimitationForPairing(SharedPtr<CREW> crew, Pairing* pairing);
	//7013
	bool CheckCOFMultipleQualsTG(RULE_LEGALITY * pCrew);
	//7014
	bool RecurrentExtendedRecoveryRestPeriod(RULE_LEGALITY * pCrew);
	//7015
	bool CheckRestForLateArrivalOrEarlyStartRule_TG(RULE_LEGALITY * pCrew);
	//7016
	bool CheckCrewOperatingRecencyRule_TG(RULE_LEGALITY * pCrew);
	//7017
	void calculateMaxFDPExtension_TG_CC(Duty* duty);
	void calculateMaxFDPExtension_TG_CC(Pairing* pairing);
	//7018
	void calculateMaxFdpOnStandbyOfCc_TG(RULE_LEGALITY* pCrew);
	void calculateMaxFdpOnStandbyOfCc_TG(const vector<SharedPtr<ROSTER>>& rosters);

	//7019 LIMIT_ACTUAL_FDP_ON_STANDBY_OF_CC_TG
	bool checkActualFdpOnStandbyOfCc_TG(RULE_LEGALITY* pCrew);

	//7021 MIN_REST_BY_DP_FOR_TG
	void setMinRestByDP_TG(Duty* duty);
	void setMinRestByDP_TG(Pairing* pairing);
	void setMinRestByDP_TG(SharedPtr<ROSTER> roster);

	//7022 CALCULATE_REDUCE_REST_FOR_TG
	void setMinRestReduce_TG(vector<SharedPtr<ROSTER>> rosters);	// Crew维度：已分配Crew的Duty
	void setMinRestReduce_TG(Pairing* pairing);		// Pairing维度：未分配Crew的Duty
	bool checkMinRestReduceBetweenDO(RULE_LEGALITY* pCrew);

	//7023 CALC_MIN_REST_AT_LAYOVER_FOR_TG
	void setMinRestAtLayover_TG(Duty* duty);
	void setMinRestAtLayover_TG(Pairing* pairing);
	void setMinRestAtLayover_TG(SharedPtr<ROSTER> roster);

	//7024 CHECK_MIN_REST_AT_BASE_FOR_TG (Duty-level MinRest calculation)
	// Timing: BEFORE autoConfigDutyValues() - Duty values need to be copied to Roster
	bool checkMinRestAtBaseForTG(RULE_LEGALITY* pCrew);
	void setMinRestAtBaseForTG(Pairing* pairing);
	void setMinRestAtBaseForTG(SharedPtr<ROSTER> roster);
	void setMinRestAtBaseForTG(vector<SharedPtr<ROSTER>> rosters);

	//7024 CALCULATE_ACC_START_AT_BASE_FOR_RT (Roster-level accState setting)
	// Timing: AFTER autoConfigDutyValues() - Roster-level values must not be overwritten
	// Sets: accState="D", refTimeZone=baseOffset, ETRTZ=-1, tzDiffs=-1
	void setAccStartAtBaseForRT(SharedPtr<ROSTER> roster);
	void setAccStartAtBaseForRT(vector<SharedPtr<ROSTER>> rosters);

	//7028
	void calculateSplitDutyMaxFDPExtension_TG(Duty* duty);
	void calculateSplitDutyMaxFDPExtension_TG(Pairing* pairing);

	//7029
	void calculateFdpExtensionWithInFlightRestOfCcForTG(Duty* duty);
	void calculateFdpExtensionWithInFlightRestOfCcForTG(Pairing* pairing);
	void calculateFdpExtensionWithInFlightRestOfCcForTG(vector<SharedPtr<ROSTER>>& rosters);

	//7210
	bool checkConsecutiveWOCLRestForEva(RULE_LEGALITY * pCrew);
	//7268 CHECK_SCH_CONSECUTIVE_WOCL_FOR_EVA 7210的分身，通过计划时间进行检查（EVA)
	bool checkSchConsecutiveWOCLRestForEva(RULE_LEGALITY* pCrew);

	//7213
	bool CheckNightRestPeriodForEva(RULE_LEGALITY* pCrew);
	bool CheckNightRestPeriodForEva(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);

	//7100 MIN_REST_FOR_EVA_FD
	void setMinRest_EvaFd(Duty * duty);
	void setMinRest_EvaFd(Pairing* pairing);
	void setMinRest_EvaFd(SharedPtr<ROSTER> roster);

	//7115 CHECK_MAX_CONSECUTIVE_DAY_FOR_IT
	bool checkMaxConsecutiveDayForIt(RULE_LEGALITY* pCrew);

	//7200 CHECK_MIN_REST_FOR_EVA_FD 7100的分身进行检查和计算CheckIn对应的MinRest
	void setCheckInMinRest_EvaFd(Duty* duty);
	void setCheckInMinRest_EvaFd(Pairing* pairing);
	void setCheckInMinRest_EvaFd(SharedPtr<ROSTER> roster);
	bool checkMinRestForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMinRestForEvaFd(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMinRestForEvaFd(RULE_LEGALITY* pCrew);


	//7265 CHECK_SCH_MIN_REST_FOR_EVA_FD 7100(7200)的分身，通过计划时间进行检查（EVA)
	bool checkSchMinRestForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSchMinRestForEvaFd(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSchMinRestForEvaFd(RULE_LEGALITY* pCrew);


	//7202 CUMULATIVE_BLH_LIMIT_FOR_EVA_FD
	bool checkCumulativeFtLimitForEvaFd(RULE_LEGALITY * pCrew);

	//7203 CHECK_SEG_RESTRICT_FOR_EVA_FD
	bool checkSegmentRestrictionForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSegmentRestrictionForEvaFd(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSegmentRestrictionForEvaFd(RULE_LEGALITY* pCrew);

	//7204 CHECK_SEG_RESTRICT_WOCL_FOR_EVA_FD
	bool checkSegmentRestrictionWOCLForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSegmentRestrictionWOCLForEvaFd(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSegmentRestrictionWOCLForEvaFd(RULE_LEGALITY* pCrew);

	//7205 CHECK_MAX_BLH_IN_PERIOD_FOR_EVA_FD
	bool checkMaxBLHInPeriodForEvaFd(RULE_LEGALITY* pCrew);
	bool checkMaxBLHInPeriodForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);

	//7211 MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD
	void setMinRestAfterCumulativeFT_EvaFd(Pairing* pairing);
	void setMinRestAfterCumulativeFT_EvaFd(RULE_LEGALITY* pCrew);

	//7266 CHECK_SCH_MIN_REST_AFTER_CUMULATIVE_FT_FOR_EVA_FD 7211的分身，通过计划时间进行检查（EVA)
	bool checkSchMinRestAfterCumulativeFT_EvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSchMinRestAfterCumulativeFT_EvaFd(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSchMinRestAfterCumulativeFT_EvaFd(RULE_LEGALITY* pCrew);

	//7212 MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD
	bool checkMinWOCLAtLayoverStationForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMinWOCLAtLayoverStationForEvaFd(RULE_LEGALITY* pCrew);

	//7267 SCH_MIN_WOCL_AT_LAYOVER_STATION_FOR_EVA_FD 7212的分身，通过计划时间进行检查
	bool checkSchMinWOCLAtLayoverStationForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSchMinWOCLAtLayoverStationForEvaFd(RULE_LEGALITY* pCrew);

	//7214 LAYOVER_REST_LIMIT_BY_TIME_ZONE_FOR_EVA_FD
	bool checkLayoverRestLimitByTimeZoneForEvaFd(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkLayoverRestLimitByTimeZoneForEvaFd(RULE_LEGALITY* pCrew);

	//7215 ROSTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD
	//返回值：计算manday的Credit Hour, std::tuple<map<localDay,MandayCredit(分钟数)>, map<rosterId,Pairing Credit(分钟数)>, map<rosterId, map<segmentId,Segment Credit(分钟数)>>>
	std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> getCreditHoursMandayForEvaFd(vector<SharedPtr<ROSTER>>& rosterList);
	string getTimeTypeWithCreditHoursMandayForEvaFd(const SharedPtr<MandayActivity>& mandayActivity);

	//7224 ROSTER_FREIGHTER_CREDIT_HOURS_DEFINITION_FOR_EVA_FD
	//返回值：计算manday的Credit Hour, std::tuple<map<localDay,MandayCredit(分钟数)>, map<rosterId,Pairing Credit(分钟数)>, map<rosterId, map<segmentId,Segment Credit(分钟数)>>>
	std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> getFreighterCreditHoursMandayForEvaFd(vector<SharedPtr<ROSTER>>& rosterList);

	//7217 PAIRING_PER_DIEM_HOUR_DEFINITION_FOR_EVA_FD
	//返回值：PerDiem
	PerDiem getPairingPerDiemHourForEvaFd(Pairing* pairing);

	//7218 PER_DIEM_HOUR_DEFINITION_FOR_EVA_FD
	//计算manday的PerDiem, 返回值：map<localDay, MandayPerDiem>, map<rosterId, PerDiem>)
	std::tuple<map<time_t, MandayPerDiem>, map<long long, PerDiem>> getPerDiemHourForEvaFd(vector<SharedPtr<ROSTER>>& rosterList);

	//7219 WORKING_HOUR_DEFINITION_FOR_EVA_FD
	//计算manday的WorkingHour, 返回值：map<localDay,WorkingHour>, map<rosterId, WorkingHour>
	std::tuple<map<time_t, double>, map<long long, double>> getWorkingHourForEvaFd(vector<SharedPtr<ROSTER>>& rosterList);

	//7220 NUM_OF_CREW_ON_FLIGHT_FOR_EVA_FD
	bool checkNumberOfCrewOnFlightForEvaFd(RULE_LEGALITY* pCrew);
	

	//7221 DISALLOW_IMPLAUSIBLE_CONNECTIONS
	bool CheckImplausibleConnectionsForCrew(RULE_LEGALITY* pCrew);
	bool CheckImplausibleConnectionsForPairing(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);

	//7222 MAX_LAYOVERS_IN_TRIP
	bool CheckMaxLayoversInTripsForPairing(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);

	//7223 MAX_LAYOVER_IN_MONTH
	bool CheckMaxLayoversInTripsForMonth(RULE_LEGALITY* pCrew);
	

	//7225 CHECK_TRAINING_ROSTER_FOR_EVA_FD 已废弃
	bool checkTrainingRosterForEvaFd(RULE_LEGALITY* pCrew);

	//7226 CHECK_TRAINING_END_FOR_EVA_FD
	bool checkTrainingEndForEvaFd(RULE_LEGALITY* pCrew);

	//7227 CHECK_LAYOVER_RESTRICTION
	bool checkLayoverRestriction(RULE_LEGALITY* pCrew);
	bool checkLayoverRestriction(Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkLayoverRestrictionForDuty(vector<Segment*> segments, RULE_LEGALITY* ruleLegality = nullptr);
	
	//7228 TRAINING_BRIEF_AND_DEBRIEF
	void calculateTrainingBriefAndDebrief(RULE_LEGALITY* pCrew);
	void calculateTrainingBriefAndDebrief(SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew);//RuleTool changeFlight调用
	bool checkTrainingBriefAndDebrief(RULE_LEGALITY* pCrew);

	//7229 CHECK_PASSPORT_AND_VISA
	bool checkPassportAndVisaForEva(RULE_LEGALITY* pCrew);

	//7230 LIMIT_PROGRAM_COURSE_ROLE  已废弃
	bool checkTrainingProgramCourseRoleForEvaFd(RULE_LEGALITY* pCrew);

	//7231 CHECK_RENEW_CERT_IN_ADVANCE
	bool checkRenewCertInAdvanceForEvaFd(RULE_LEGALITY* pCrew);

	//7232 CHECK_MAX_CONSECUTIVE_ROSTER_FOR_IT
	bool CheckConsecutiveRosterForIt(RULE_LEGALITY* pCrew);

	//7233 LIMIT_COURSE_TIME_PERIOD_FOR_EVA_FD
	bool checkCourseTimePeriodForEvaFd(RULE_LEGALITY* pCrew);

	//7234 LIMIT_COURSE_ROLE_QUAL_FOR_EVA_FD  已废弃
	bool checkCourseRoleQualForEvaFd(RULE_LEGALITY* pCrew);

	//7235 LIMIT_COURSE_ROLE_NUMBERS_FOR_EVA_FD  已废弃
	bool checkCourseRoleNumbersForEvaFd(RULE_LEGALITY* pCrew);

	//7236 LIMIT_DAYS_BETWEEN_COURSES_FOR_EVA_FD
	bool checkDaysBetweenCoursesForEvaFd(RULE_LEGALITY* pCrew);

	//7237 LIMIT_DEPEND_BETWEEN_COURSES_FOR_EVA_FD
	bool checkDependBetweenCoursesForEvaFd(RULE_LEGALITY* pCrew);

	//7238 LIMIT_COURSE_START_TIME_FOR_EVA_FD
	bool checkCourseStartTimeForEvaFd(RULE_LEGALITY* pCrew);

	//7239 LIMIT_COURSE_DEVICE_TYPE_FOR_EVA_FD
	bool checkCourseDeviceTypeForEvaFd(RULE_LEGALITY* pCrew);

	//7240 CHECK_COURSE_DEVICE_AVAIL_FOR_EVA_FD
	bool checkCourseDeviceAvailForEvaFd(RULE_LEGALITY* pCrew);

	//7241 LIMIT_COURSE_PIP_NUMBERS_FOR_EVA_FD
	bool checkCoursePipNumbersForEvaFd(RULE_LEGALITY* pCrew);

	//7242 LIMIT_COURSE_DURATION_FOR_EVA_FD
	bool checkCourseDurationForEvaFd(RULE_LEGALITY* pCrew);

	//7243 LIMIT_SAME_ROLE_INSTRUCTOR_FOR_EVA_FD
	bool checkSameRoleInstructorForEvaFd(RULE_LEGALITY* pCrew);

	//7244 LIMIT_PROGRAM_COURSE_ON_FLIGHT_FOR_EVA_FD
	bool checkProgramCourseOnFlightForEvaFd(RULE_LEGALITY* pCrew);

	//7245 LIMIT_TRAINING_ROLE_IN_TEAM_FOR_EVA_FD
	bool checkTrainingRoleInTeamForEvaFd(RULE_LEGALITY* pCrew);

	//7246 LIMIT_SAME_DEVICE_IN_PROGRAM_FOR_EVA_FD
	bool checkSameDeviceInProgramForEvaFd(RULE_LEGALITY* pCrew);

	//7247 RESTRICT_INSTRUCTOR_HOLD_ROLE_FOR_EVA_FD
	bool checkInstructorHoldRoleForEvaFd(RULE_LEGALITY* pCrew);

	//7248 RESTRICT_TRAINEE_HOLD_ROLE_FOR_EVA_FD
	bool checkTraineeHoldAssignmentForEvaFd(RULE_LEGALITY* pCrew);

	//7249 REQUIRED_MIN_NUM_OF_COURSE_FOR_EVA_FD
	bool checkRequiredMinNumOfCourseForEvaFd(RULE_LEGALITY* pCrew);

	//7250 CHECK_UNASSIGNED_COURSE_FOR_EVA_FD
	bool checkUnassignedCourseForEvaFd(RULE_LEGALITY* pCrew);

	//7251 LIMIT_COURSE_ROLE_QUAL_NUMBERS_FOR_EVA_FD
	bool checkCourseRoleQualAndNumbersForEvaFd(RULE_LEGALITY* pCrew);

	//7252 CHECK_FAILED_COURSE_FOR_EVA_FD
	bool checkFailedCourseForEvaFd(RULE_LEGALITY* pCrew);

	//7253 LIMIT_LEG_AND_STATION_FOR_EVA_FD
	bool checkLegAndStationForEvaFd(RULE_LEGALITY* pCrew);

	//7254 BUDDIES_IN_SAME_COURSE_FOR_EVA_FD
	bool checkBuddiesInSameCourseForEvaFd(RULE_LEGALITY* pCrew);

	//7255 ONLY_SAME_COURSE_CODE_IN_DUTY_FOR_EVA_FD
	bool checkOnlySameCourseCodeInDutyForEvaFd(RULE_LEGALITY* pCrew);

	//7256 LIMIT_MAX_GAP_DAYS_BETWEEN_COURSES_FOR_EVA_FD
	bool checkMaxGapDaysBetweenCoursesForEvaFdRule(RULE_LEGALITY* pCrew);

	//7257 LIMIT_NUMBER_OF_TRAINEES_FOR_COURSES_ON_SAME_DAY_FOR_EVA_FD
	bool checkNumberOfTraineeForCoursesOnSameDayForEvaFdRule(RULE_LEGALITY* pCrew);

	//7258 LIMIT_SAME_ROLE_INSTRUCTOR_ON_EXTRA_COURSE_FOR_EVA_FD
	bool checkSameRoleInstructorOnExtraCourseForEvaFd(RULE_LEGALITY* pCrew);

	//7259 CHECK_COURSE_ONLY_ASSIGNED_TO_INSTRUCTOR
	bool checkCourseOnlyAssignInstructorForEvaFd(RULE_LEGALITY* pCrew);

	//7260 CALCULATE PIC FOR EVA
	void calculatePICForEva(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	void calculatePICForEva(const vector<SharedPtr<ROSTER>>& rosters);


	//7261 CHECK_ACCLIMATIZED_REST_FOR_EVA
	bool checkAcclimatizedRestForEva(RULE_LEGALITY* pCrew);
	//7271 CHECK_SCH_ACCLIMATIZED_REST_FOR_EVA 7261的分身，通过计划时间进行检查
	bool checkSchAcclimatizedRestForEva(RULE_LEGALITY* pCrew);
	
	//7262 LIMIT_INEXP_CREW_FOR_EVA_FD
	bool checkInexperiencedCrewForEvaFd(RULE_LEGALITY* pCrew);

	//7263 MAX_EARLY_START_OR_LATE_FINISH
	bool checkMaxEarlyStartOrLateFinishWithinPeriod(RULE_LEGALITY* pCrew);

	//7264 CHECK_SCH_TIME_ABNL_FOR_EVA_FD
	bool checkSchTimeAbnormality(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSchTimeAbnormality(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	
	//对单个roster值重新计算，并更新crew的manday数据，operation=true说明add roster,否则deassing roster
	bool  reCalculateSingleRosterManday(SharedPtr<CREW> crew, SharedPtr<ROSTER> roster, bool operation);
	bool recoverMandayFromRuleToolOnly(SharedPtr<CREW_MANDAY_FD>& newManday, map<time_t, SharedPtr<CREW_MANDAY_FD>>& oldMandayMap);

	//7272 CALCULATE_STANDBY_DP_TG
	long CalculateStandbyDP_TG(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster);
	void CalculateStandbyDP_TG(vector<SharedPtr<ROSTER>> rosters);
	void CalculatePairingStandbyDP_TG(Pairing* pairing);

	bool checkMinConnectInDutyRuleForEva(RULE_LEGALITY* pCrew);
	bool checkMinConnectInDutyRuleForEva(const vector<Duty*>& duties);
	bool checkMinConnectInDutyRuleForEva(const vector<Segment*>& segments);

	//7274 CHECK_IOE_PAHSE_FLIGHT_COMPOSITION
	bool checkIOEPhaseFlightComposition(RULE_LEGALITY* pCrew);

	//7275 CHECK_DAYS_OFF_FOR_TRADE
	bool checkDaysOffForTrade(RULE_LEGALITY* pCrew);

	//7276 CHECK_DISRUPTIVE_SCHEDULES_LOCAL_NIGHT_FOR_TG
	bool checkDisruptiveSchedulesLocalNightForTG(RULE_LEGALITY* pCrew);

	//7276 CHECK_DISRUPTIVE_SCHEDULES_RERRP_FOR_TG
	bool checkDisruptiveSchedulesRERRPForTG(RULE_LEGALITY* pCrew);

	//7278 CALCULATE_COURSE_FDP_FOR_TG
	long CalculateCourseDutyFDPForTG(Duty* duty, SharedPtr<ROSTER> roster);
	long CalculateCourseRosterGroundFDPForTG(SharedPtr<ROSTER> roster);

	//7279 CHECK_ULR_ON_TRAINING_FOR_EVAFD
	bool checkLimitULROnTrainingForEvaFD(RULE_LEGALITY* pCrew);
	
	//7300 CALC_MAX_DUTY_TIME_FOR_PR
	void setMaxDP_PR(Duty* duty);
	void setMaxDP_PR(Pairing* pairing);
	void setMaxDP_PR(SharedPtr<ROSTER> roster);

	//7302 CALC_MAX_FDP_BY_CALLOUT_STANDBY_FOR_PR
	void calculateMaxFDPByCalloutStandbyForPR(RULE_LEGALITY* pCrew);
	void calculateMaxFDPByCalloutStandbyForPR(const vector<SharedPtr<ROSTER>>& rosters);

	//7303 CALC_MAX_DUTY_TIME_FOR_PR
	void setMaxDPPerAvgBLHOfCBA_PR(Duty* duty);
	void setMaxDPPerAvgBLHOfCBA_PR(Pairing* pairing);
	void setMaxDPPerAvgBLHOfCBA_PR(SharedPtr<ROSTER> roster);

	//7305 LIMIT_MAX_CONSECUTIVE_DUTY_TIMES_FOR_PR
	bool checkMaxConsecutiveDutyTimesForPR(RULE_LEGALITY* pCrew);

	//7306 LIMIT_MIN_REST_LFES_FLIGHT_FOR_PR
	bool checkMinRestAfterLFESFlightForPR(RULE_LEGALITY* pCrew);

	//7307 MIN_REST_BASED_LOCAL_NIGHT_FOR_PR
	void setMinRestBasedLocalNightForPR(Duty* duty);
	void setMinRestBasedLocalNightForPR(Pairing* pairing);
	void setMinRestBasedLocalNightForPR(SharedPtr<ROSTER> roster);
	void setMinRestBasedLocalNightForPR(RULE_LEGALITY* pCrew);

	bool checkMinRestBasedLocalNightForPR(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMinRestBasedLocalNightForPR(RULE_LEGALITY* pCrew);

	//7308 CHECK_EARNED_DAYS_OFF_FOR_PR
	bool checkEarnedDaysOffForPR(RULE_LEGALITY* pCrew);

    //7412 CHECK_MINIMUM_REST_PERIOD_FOR_SQ
    bool checkMinimumRestPeriodForSQRule(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
    bool checkMinimumRestPeriodForSQRule(RULE_LEGALITY* pCrew);
    bool checkMinimumRestPeriodForSQRule(std::vector<Duty*>& duties, RULE_LEGALITY* ruleLegality = nullptr);

    void setMinimumRestPeriodForSQRule(Duty* duty);
    void setMinimumRestPeriodForSQRule(Pairing* pairing);
    void setMinimumRestPeriodForSQRule(SharedPtr<ROSTER> roster);

	//7309 LIMIT_MIN_REST_BETWEEN_ROSTERS_FOR_PR
	bool checkMinRestBetweenRostersForPR(RULE_LEGALITY* pCrew);

	//7310 CALC_DUTY_ALOFT_FOR_PR
	//返回值：计算manday的Duty Aloft(机组在飞机上时间), map<localDay,机组在飞机上时间(Duty Aloft)(分钟数)>
	map<time_t, int> getDutyAloftMandayForPR(vector<SharedPtr<ROSTER>>& rosterList);

	//7311 CACL_MIN_REST_BY_BLH_PR
	void setMinRestByBlockTime_PR(Duty* duty);
	void setMinRestByBlockTime_PR(Pairing* pairing);
	void setMinRestByBlockTime_PR(SharedPtr<ROSTER> roster);

	bool checkMinRestByBlockTime_PR(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMinRestByBlockTime_PR(RULE_LEGALITY* pCrew);
	
    //7312 ALLOW_MAX_FLIGHTS_IN_PERIOD_FOR_PR
	bool checkMaxFlightsInPeriodForPR(RULE_LEGALITY* pCrew);

	//7313
	void setMaxDPByComplement_PR(Duty* duty);
	void setMaxDPByComplement_PR(Pairing* pairing);
	void setMaxDPByComplement_PR(SharedPtr<ROSTER> roster);

	//7314 CHECK_GENDER_ON_FLIGHT_BY_COMPOSITION_FOR_PR
	bool checkGenderOnFlightByCompositionForPR(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkGenderOnFlightByCompositionForPR(RULE_LEGALITY* pCrew);

	//7315 RESTICT_CREW_OR_FLIGHT_FOR_PR
	bool checkCrewOrFlightForPR(RULE_LEGALITY* pCrew);

	//7320 CREW_ONLY_PERFORM_SPEC_TASK_FOR_PR
	bool checkCrewOnlyPerformSpecificTaskForPR(RULE_LEGALITY* pCrew);

	//7321 TASK_ONLY_OPERATED_FILTERED_CREW_FOR_PR
	bool checkTaskOnlyBeOperatedByFilteredCrewForPR(RULE_LEGALITY* pCrew);
	//7321 更新缓存
	void initTaskOnlyBeOperatedByFilteredCrewCacheForPR(const SharedPtr<CrewDataContext>& dbData);
	void updateTaskOnlyBeOperatedByFilteredCrewCacheForPR(const std::shared_ptr<CREW>& crew, const std::shared_ptr<ROSTER>& roster);
	void updateTaskOnlyBeOperatedByFilteredCrewCacheForPR(const long long fltId);
	void removeTaskOnlyBeOperatedByFilteredCrewCacheForPR(const std::shared_ptr<CREW>& crew, const std::shared_ptr<ROSTER>& roster, const Pairing* oldPairing);
	void updateTaskOnlyBeOperateRosterId(const std::shared_ptr<CREW>& crew, const long long oldId, const long long newId);

	//7322 CREW_CANNOT_OPERATE_SPEC_TASK_FOR_PR
	bool checkCrewCannotOperateSpecificTaskForPR(RULE_LEGALITY* pCrew);

	//7323 CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_PR
	bool checkMinSpaceBetweenDutyForPR(RULE_LEGALITY* pCrew);
	bool checkMinSpaceBetweenDutyForPR(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);

	//7324 CHECK_BIRTHDAY_DAYS_OFF_FOR_PR
	bool checkBirthdayDaysOffForPR(RULE_LEGALITY* pCrew);

	//7325 CHECK_DAYS_OFF_PATTERNS_FOR_PR
	bool checkMinNumberOfDaysOffForPR(RULE_LEGALITY* pCrew);
	std::vector<std::vector<EnumerationOccupationStatus>> GetAvailableEnumerationOccupationStatus(RULE_LEGALITY* pCrew);
	void preCalculateEnumerationDOPatternCache();

	//7326 CHECK_EARLIES_BRIEF_OR_LATEST_DEBRIEF_AFTER_ROSTER_FOR_PR
	bool checkEarliesBriefOrLatestDebriefAfterRosterForPR(RULE_LEGALITY* pCrew);

	//7327 CHECK_MIN_REST_AFTER_BASE_CHANGE_FOR_PR
	bool checkMinRestAfterBaseChangeForPR(RULE_LEGALITY* pCrew);

	//7328 CALC_CREDIT_HOURS_FOR_PR
	//返回值：计算manday的Credit Hour, std::tuple<map<localDay,MandayCredit(分钟数)>, map<rosterId,Pairing Credit(分钟数)>, map<rosterId, map<segmentId,Segment Credit(分钟数)>>>
	std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> getCreditHoursMandayForPR(vector<SharedPtr<ROSTER>>& rosterList);

	//7502 CALC_CREDIT_HOURS_FOR_CARS
	//返回值：计算manday的Credit Hour, std::tuple<map<localDay,MandayCredit(分钟数)>, map<rosterId,Pairing Credit(分钟数)>, map<rosterId, map<segmentId,Segment Credit(分钟数)>>>
	std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> getCreditHoursMandayForCARS(vector<SharedPtr<ROSTER>>& rosterList);

	//7356 LIMIT_ATTR_SPACING_BASED_MANDAY_FOR_PR
	bool checkAttributesSpacingBasedMandayForPR(RULE_LEGALITY* pCrew);

	//7357 LIMIT_MAX_ATTR_NUM_BASED_MANDAY_FOR_PR
	bool checkMaxAttributesNumberBasedMandayForPR(RULE_LEGALITY* pCrew);

	//7358 CHECK_MAX_FATIGUE_SCORE_FOR_5J
	bool checkMaxFatigueScoreFor5J(RULE_LEGALITY* pCrew);

	//7359 CHECL_STANDARD_FDP_EXTENSION_REST_REQUIREMENT_FOR_5J
	bool checkStandardFdpExtensionRestRequirementFor5J(RULE_LEGALITY* pCrew);

	//7360 CHECK_AIRCRAFT_CHANGE_ALERT_FOR_PR
	bool checkAircraftChangeAlertForPR(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAircraftChangeAlertForPR(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAircraftChangeAlertForPR(RULE_LEGALITY* pCrew);

	//7361 CHECK_MIN_DAYS_OFF_FOR_5J
	bool checkMinDaysOffFor5J(RULE_LEGALITY* pCrew);

	//7365 CHECK_LEGAL_DAYS_OFF_FOR_5J
	bool checkLegalDaysOffFor5J(RULE_LEGALITY* pCrew);

	//7366 CHECK_CONSECUTIVE_DAYS_OFF_REQUIREMENT_FOR_5J
	bool checkConsecutiveDaysOffRequirementFor5J(RULE_LEGALITY* pCrew);

	//7362 LIMIT_AREA_ENTRY_COUNT_FOR_PR
	bool checkAreaEntryCountForPR(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAreaEntryCountForPR(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAreaEntryCountForPR(RULE_LEGALITY* pCrew);

	//7363 CALCULATE_INEXPERIENCED_CREW_FOR_5J
	void calculateInexperiencedCrewFor5J(RULE_LEGALITY* pCrew);
	void calculateInexperiencedCrewFor5J(std::shared_ptr<CREW>& crew);


	//7364 CHECK_INEXPERIENCED_CREW_FOR_5J
	bool checkInexperiencedCrewFor5J(RULE_LEGALITY* pCrew);

	//7372 CALCULATE_GROUND_DP_TG
	long CalculateGroundDP_TG(SharedPtr<ROSTER> roster);
	void CalculateGroundDP_TG(vector<SharedPtr<ROSTER>> rosters);

	//7373 CALC_GROUND_ROSTER_MIN_REST_FOR_5J
	void calculateGroundRosterMinRestFor5J(SharedPtr<ROSTER> roster);
	void calculateGroundRosterMinRestFor5J(vector<SharedPtr<ROSTER>> rosters);

	//7374 CALC_MAX_FDP_BY_HSB_CALLOUT_FOR_5J
	void calculateMaxFDPByCalloutFor5J(const vector<SharedPtr<ROSTER>>& rosters);

	//7387 CHECK_STANDBY_CALLOUT_DURATION_FOR_5J
	bool checkStandbyCalloutDurationFor5J(RULE_LEGALITY* pCrew);

	//7388 LIMIT_COURSE_WEEKDAY_FOR_5J
	bool checkCourseWeekdayFor5J(RULE_LEGALITY* pCrew);

	//7389 LIMIT_TRAINING_CONSECUTIVE_DAYS_FOR_5J
	bool checkTrainingConsecutiveDaysFor5J(RULE_LEGALITY* pCrew);

	// Below are Singapore SQ rules 7400-7499
	// 7400 ANR (Singapore) acclimatisation calculation
	void setAcclimationStateOfANR(Pairing* pairing);
	void setAcclimationStateOfANR(Duty* duty);
	void setAcclimationStateOfANR(RULE_LEGALITY* pCrew);
	void setAcclimationStateOfANR(const vector<SharedPtr<ROSTER>>& rosters);

	//7317
	void calculateDutyFdpAndExtensionFor5J(Duty* duty);

	//7410 ANR FDP limits
	bool checkMaxFlightDutyPeriod_ANR(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMaxFlightDutyPeriodSingleDuty_ANR(Duty* duty);
	void calculateMaxFlightDutyPeriod_ANR(Duty* duty, SharedPtr<ROSTER> roster = NULL);
	void calculateMaxFlightDutyPeriod_ANR(Pairing* pairing);

	//7414 ANR consecutive special duty rest requirement
	bool checkAnrConsecutiveSpecialDuty_ANR(Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAnrConsecutiveSpecialDuty_ANR(RULE_LEGALITY* pCrew);

	//7415 ANR consecutive working day limit between days off
	bool checkAnrDayOffSpacing_ANR(Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAnrDayOffSpacing_ANR(RULE_LEGALITY* pCrew);

	//7416 ANR minimum days off in consecutive periods
	bool checkAnrMinDayOffInPeriod_ANR(Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAnrMinDayOffInPeriod_ANR(RULE_LEGALITY* pCrew);

	//7417 ANR reporting + debrief minimum requirements
	bool checkAnrReportingDebrief_ANR(Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAnrReportingDebrief_ANR(RULE_LEGALITY* pCrew);

	//7420 SQ CA ACOP FDP pattern (Table A)
	bool checkAcopFdpPatternTableA_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAcopFdpPatternTableA_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7421 SQ CA ACOP slip pattern (Template B)
	bool checkAcopSlipPatternTableB_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAcopSlipPatternTableB_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7422 SQ CA CAI/IST short slip ATDO on return to base
	void setAtdoAfterSlipForSQ(Pairing* pairing);
	void setAtdoAfterSlipForSQ(SharedPtr<ROSTER> roster);
	void setAtdoAfterSlipForSQ(RULE_LEGALITY* pCrew);
	//7424 SQ CA overnight arrival ATDO at base
	void setOvernightAtdoAtBaseForSQ(Pairing* pairing);
	void setOvernightAtdoAtBaseForSQ(SharedPtr<ROSTER> roster);
	void setOvernightAtdoAtBaseForSQ(RULE_LEGALITY* pCrew);
	void setPostUlrRestAtBaseForSQ(Pairing* pairing);
	void setPostUlrRestAtBaseForSQ(SharedPtr<ROSTER> roster);
	void setPostUlrRestAtBaseForSQ(RULE_LEGALITY* pCrew);

	//7434
	bool checkMaxDutyPeriod_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkMaxDutyPeriod_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7435
	bool checkUlrStandbyMinPairingDays_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);

	//7450
	bool checkFdpSectorLimit_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkFdpSectorLimit_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7451
	bool checkRestrictCoterminalDutyConnection_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkRestrictCoterminalDutyConnection_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7452
	bool checkUlrFdpClassificationMismatch_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkUlrFdpClassificationMismatch_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7453
	bool checkSameCityAroundUlrDuty_SQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSameCityAroundUlrDuty_SQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7461
	bool checkDhdAndPositionOnFreightForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkDhdAndPositionOnFreightForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkDhdAndPositionOnFreightForSQ(const vector<Duty*>& duties, RULE_LEGALITY* ruleLegality = nullptr);

	//7462
	bool checkAllowedMultiSectorDutyForFreighterForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkAllowedMultiSectorDutyForFreighterForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7463
	bool checkSwingbackForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkSwingbackForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7464
	bool checkTransportLengthForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkTransportLengthForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	//7465 CALC_MIN_SCHEDULE_DAYS_OFF_AT_BASE_FOR_SQ
	void setMinScheDaysOffAtBaseForSQ(Pairing* pairing);
	void setMinScheDaysOffAtBaseForSQ(SharedPtr<ROSTER> roster);
	void setMinScheDaysOffAtBaseForSQ(RULE_LEGALITY* pCrew);

	//7466 CALC_EXTRA_DAYS_OFF_AT_BASE_FOR_SQ
	void setExtraDaysOffAtBaseForSQ(Pairing* pairing);
	void setExtraDaysOffAtBaseForSQ(SharedPtr<ROSTER> roster);
	void setExtraDaysOffAtBaseForSQ(RULE_LEGALITY* pCrew);

	//7467
	bool checkRestTimeBetweenFlightsForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkRestTimeBetweenFlightsForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	//7468
	bool checkLimitPositioningInCopForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkLimitPositioningInCopForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);
	//7469
	bool checkForcedComplementByDutyRouteForSQ(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);
	bool checkForcedComplementByDutyRouteForSQ(const Duty* duty, RULE_LEGALITY* ruleLegality = nullptr);

	// End of Singapore SQ rules

	//start HX rules
	//7480 LIMIT_DUTY_DAYS_OFF_FOR_HX
	bool checkDutyDaysOffForHX(RULE_LEGALITY* pCrew);

	//7481 RED_EYE_DEFINITION_FOR_HX
	void setRedEyeDutyForHX(Pairing* pairing);
	void setRedEyeDutyForHX(Duty* duty);

	void setRedEyeDutyForHX(RULE_LEGALITY* pCrew);
	void setRedEyeDutyForHX(const vector<SharedPtr<ROSTER>>& rosters);

	//7482 ACCLIMATISATION_DEFINITION_FOR_HX
	void setAcclimationStateForHX(Pairing* pairing);
	void setAcclimationStateForHX(Duty* duty);

	void setAcclimationStateForHX(RULE_LEGALITY* pCrew);
	void setAcclimationStateForHX(const vector<SharedPtr<ROSTER>>& rosters);
    //检查任务是否在恢复期内
	bool checkTaskOnRecoveryPeriodForHX(RULE_LEGALITY* pCrew);

	//7484 CALCMAX_FLIGHT_DUTY_PERIOD_FOR_HX
	void calculateMaxFlightDutyPeriod_HX(Duty* duty, SharedPtr<ROSTER> roster = NULL);
	void calculateMaxFlightDutyPeriod_HX(RULE_LEGALITY* pCrew);
	void calculateMaxFlightDutyPeriod_HX(vector<SharedPtr<ROSTER>>& rosters);
	//for po
	void calculateMaxFlightDutyPeriod_HX(Pairing* pairing);

	//7485 CHECK_COMPOSITION_REQUIREMENT_FOR_HX
	bool checkCompositionRequirement_HX(RULE_LEGALITY* pPairing);
	bool checkCompositionRequirement_HX(const Duty* duty);

	//7486 LIMIT_RED_EYE_DUTY_FOR_HX
	bool checkRedEyeDutyForHX(RULE_LEGALITY* pCrew);

	//7487 CHECK_MAX_DURATION_FROM_STANDBY_TO_FLIGHT_DUTY_END_FOR_HX
	bool checkMaxDurationFromStandbyToFlightDutyEndForHX(RULE_LEGALITY* pCrew);

	//7488 CALCULATE_MIN_REST_FOR_HX
	void setMinRestForHX(Duty* duty);
	void setMinRestForHX(Pairing* pairing);
	void setMinRestForHX(SharedPtr<ROSTER> roster);
	void setMinRestForHX(RULE_LEGALITY* pCrew);

	//7489 LIMIT_CONSECUTIVE_DAY_MIN_REST_FOR_HX
	bool checkConsecutiveDayMinRestForHX(RULE_LEGALITY* pCrew);

	//7490 CALCULATE_MAX_FDP_EXTENSION_FOR_HX
	void setMaxFdpExtensionForHX(Duty* duty);
	void setMaxFdpExtensionForHX(Pairing* pairing);
	void setMaxFdpExtensionForHX(SharedPtr<ROSTER> roster);
	void setMaxFdpExtensionForHX(RULE_LEGALITY* pCrew);

	//7491 CALCULATE_MAX_FDP_EXTENSION_FOR_CC_FOR_HX
	void setMaxFdpExtensionForCcForHX(Duty* duty);
	void setMaxFdpExtensionForCcForHX(Pairing* pairing);
	void setMaxFdpExtensionForCcForHX(SharedPtr<ROSTER> roster);
	void setMaxFdpExtensionForCcForHX(RULE_LEGALITY* pCrew);

	//7492 CALCULATE_MAX_FDP_EXTENSION_FOR_SPLIT_DUTY_FOR_HX
	void setMaxFdpExtensionForSplitDutyForHX(Duty* duty);
	void setMaxFdpExtensionForSplitDutyForHX(Pairing* pairing);
	void setMaxFdpExtensionForSplitDutyForHX(SharedPtr<ROSTER> roster);

	//7493 LIMIT_CONSECUTIVE_DUTY_DAYS_OFF_FOR_HX
	bool checkConsecutiveDutyDaysOffForHX(RULE_LEGALITY* pCrew);

	//7494 LIMIT_FLEET_ASSIGNMENT_BY_QUALIFICATION_FOR_HX
	bool checkFleetSectorByQaulificationForHX(RULE_LEGALITY* pCrew);

	//7495 LIMIT_CONSECUTIVE_TASK_BEFORE_AFTER_DAYSOFF_FOR_HX
	bool checkConsecutiveTaskBeforeAfterDayOffForHX(RULE_LEGALITY* pCrew);

	//7496 LIMIT_MIN_WORK_DAYS_BETWEEN_ASSIGNMENTS_FOR_HX
	bool checkMinWorkDaysBetweenAssignmentsForHX(RULE_LEGALITY* pCrew);

	//end HX rules

	//start Flair(F8) rules
	//7500 ACCLIMATISATION_DEFINITION_FOR_CARS
	void setAcclimationStateForCARS(Pairing* pairing);
	void setAcclimationStateForCARS(Duty* duty);

	void setAcclimationStateForCARS(RULE_LEGALITY* pCrew);
	void setAcclimationStateForCARS(const vector<SharedPtr<ROSTER>>& rosters);


	//7501 LIMIT_SINGLE_DAY_FREE_FROM_DUTY_FOR_CARS
	bool checkSingleDayFreeFromDutyForCARS(RULE_LEGALITY* pCrew);

	//7503 LIMIT_CONSECUTIVE_WOCL
	bool checkConsecutiveWoclForCARS(RULE_LEGALITY* pCrew);

	//7504 CHECK_MIN_SPACE_BETWEEN_DUTY_FOR_F8
	bool checkMinSpaceBetweenDutyForF8(RULE_LEGALITY* pCrew);
	bool checkMinSpaceBetweenDutyForF8(const Pairing* pairing, RULE_LEGALITY* ruleLegality = nullptr);

	//7505 MINIMUM_DAYS_OFF_FOR_CARS (8023-equivalent logic)
	bool checkMinimumDaysOffForCARS(RULE_LEGALITY* pCrew);

	//7506 SINGLE_DAILY_CHECKIN_FOR_CARS (8048-equivalent logic)
	bool checkSingleDailyCheckinForCARS(RULE_LEGALITY* pCrew);

	//end Flair(F8) rules

	int  getCrewIndex(string strCrewId);

	vector<string> getViolationMessages();// { return this->_violations; };
	//setDataContext和initializeDB二选一
	void setDataContext(SharedPtr<CrewDataContext> data, const long long ruleSetId = -1, const bool isCalc =true);

	void setRuleSet(const long long ruleSetId);

	vector<SharedPtr<CREW_MANDAY_CC_AM>> calculateMandayCC(SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>> rosters, bool isDebug=false);
	vector<SharedPtr<CREW_MANDAY_FD>> calculateMandayFD(SharedPtr<CrewDataContext> data, SharedPtr<CREW>& crew, vector<SharedPtr<ROSTER>> rosters);

	vector<SharedPtr<CrewRecency>> getExpiringRecency(SharedPtr<CREW>& crew);
	bool isPairingRenewRecency(SharedPtr<CREW>& crew, Pairing* pg, SharedPtr<CrewRecency> recency);
    bool isCrewQualifyForPairing(SharedPtr<CREW>& crew, Pairing* pg, string actingRank);
	bool isCrewQualifyForPairingToProbationRule(SharedPtr<CREW>& crew, Pairing* pg, string actingRank);
	bool callSingleRuleCheck(SharedPtr<CREW>& crew, Pairing* pairing, string actingRank, unsigned ruleFunc);

	vector<RULE_VIOLATION*> getRuleViolations();

	///add by ain
	static long long getInstanceCount();
	LegalityChecker(int iApplication = ROSTER_EDITOR, bool bDebug = false);
	//LegalityChecker();
	~LegalityChecker();

	void outputRules();
    // onlyPlaceDutyNode only used in PO before assigning composition, preventing rule error when no composition presented
	bool basicSetting(Duty* duty, bool onlyPlaceDutyNode = false, const Duty* beforeDuty = nullptr, const Duty* nextDuty = nullptr);
	bool basicSetting(Duty * duty, const string& pairingBase, bool onlyPlaceDutyNode = false, const Duty* beforeDuty = nullptr, const Duty* nextDuty = nullptr);
	bool basicSettingFirstSeg(Duty * duty, const string& pairingBase, const Duty* beforeDuty = nullptr, const Duty* nextDuty = nullptr);
	bool basicSettingEndSeg(Duty * duty, const string& pairingBase, const Duty* beforeDuty = nullptr, const Duty* nextDuty = nullptr);
	static atomic<long long> instanceCount;

	inline void SetHelper6001MT(bool op) { _helper6001MT = op; }

	void CalRDOParamCache(RULE_LEGALITY* pCrew);
	void CalRDOParamCache(RULE_LEGALITY* pCrew, const time_t windowStartLoc, const time_t windowEndLoc);

	bool CheckMinConsecutiveRosterDaysOffByRosterPeriod(RULE_LEGALITY* pCrew, time_t checkStartLoc, time_t checkEndLoc, const bool isFullRP, const RDOParamCache cache);
};

//因需同时在 LegalityChecker和 basicCalculation中调用, 因此声明为全局函数
bool isRosterMatch8107(shared_ptr<ROSTER>& prevRoster, shared_ptr<ROSTER>& nextRoster, CrewDataContext* dbData);
rule8107 matchRoster8107RuleParam(shared_ptr<ROSTER>& prevRoster, shared_ptr<ROSTER>& nextRoster, string mergeType, CrewDataContext* dbData);

//因8119和8120法规也需要用到，因此声明为全局函数
bool cmpFD(SharedPtr<CREW_MANDAY_FD> m1, SharedPtr<CREW_MANDAY_FD> m2);
bool cmpCC(SharedPtr<CREW_MANDAY_CC_AM> m1, SharedPtr<CREW_MANDAY_CC_AM> m2);

#ifdef WIN32
__declspec(dllexport)
#endif

void printInstanceCount();

#endif //RULE_ENGINE_H
