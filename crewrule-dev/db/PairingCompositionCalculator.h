#ifndef PAIRING_COMPOSITION_CALCULATOR_H
#define PAIRING_COMPOSITION_CALCULATOR_H

#include <string>
#include <unordered_map>
#include <vector>
#include "CrewDB.h"
//Debug
#include <fstream>
#include <iostream>
#include <istream>
#include <algorithm>

using std::vector;
using std::string;
using std::unordered_map;

class CrewDataContext;

//rule 2007/2008
struct ruleBlhAndFdp {
	//Composition,With_Bunk,Landing_Times_Lower,Landing_Times_Upper,AC Change,Max BLH
	string crewCount;
	int crewCountNum = 0;
	long long compositionId = 0;
	string withBunk;  //''/'Y'/'N',空表示无限制
	int minLandingInDuty = 0;
	int maxLandingInDuty = 0;
	int maxMinutes = 0; //BLH/FDP
};
//R5 fdp
struct ruleFdp3007 {
	string compName;
	string restFacility;
	int rptRangeStart = 0; //minutes from 00:00
	int rptRangeEnd = 0;   //minutes from 00:00
	int landingLower = 0;
	int landingUpper = 0;
	int maxFdp = 0;        //minutes
	string isAugment;
};
//R5 blh
struct ruleBlh3008 {
	string compName;
	int rptRangeStart = 0; //minutes from 00:00
	int rptRangeEnd = 0;   //minutes from 00:00
	int maxBlh = 0;        //minutes
};
//R4/R5 cc/am
struct rule2030 {
	map<string, bool> fleets;
	string division;       //OP#1963
	string compositonName;
	int maxFdp = 0;
};
struct duty_composition {
	long long compId = 0; // 同时set duty.compId
	map<string, int> compRankValue;
	bool is_augment = false;
};
//根据flight/segment计算duty composition，并汇总计算pairing
//构造函数：提取法规 2007/2008/3013, 收集composition数据
//calculate()：遍历duty，根据BLH/FDP/landing计算dutyCompId，汇总对比hierarchy计算 pairingCompId
class PairingCompositionCalculator {
public:
	PairingCompositionCalculator(CrewDataContext* dbdata);
	PairingCompositionCalculator(string airline, string division, vector<DBRule>& ruleList, vector<FLEET> &fleetList, vector<Composition>& compositionList, unordered_map<long long, composition_rank>& rankCompositionMap, vector<RANK>& rankList, map<string, shared_ptr<DBAircraft>>& fltIdToAircraftMap, map<string, string>* systemParamMap);
	
	void calculate(vector<Pairing*>& list);
	void calculate(Pairing* pairing);
	void updateRankCombinationCriteriaID(Pairing* pairing);
	void checkDataFleet(vector<Segment>& segments); //数据检查, loadData阶段可调用
	map<long long, int> computeCompIdAndMultiplierFromRankValue(map<string, int>& rankValue);
	//Debug start
	void printDutiesGenerated(Duty* tempduty);
	vector<string> calculatePairingCompositionForPilotR5_3007(Duty* d);
	string calculatePairingCompositionForPilotR5_3008(Duty* d);
	pair<long long, string> getDefaultComposition();
	string calculatePairingCompositionForPilotR4_2007(Duty* d);
	string calculatePairingCompositionForPilotR4_2008(Duty* d);
	long long getCompositionByComplements(const map<string, int>& complements);
	long long getCompositionByComplements_v2(const map<string, int>& complements);
	pair<bool, vector<pair<long long, string>>>  calculateForPO(Duty* d);//PO优化过程调用计算Duty配比接口, 返回是否违规，以及可用的配比composition name
	bool calculateForPO(Pairing* pairing);//PO优化过程调用计算Duty配比接口, 返回是否违规，以及可用的配比composition name
	bool calculateForPO_v2(Pairing* pairing);//PO优化过程调用计算Duty配比接口, 返回是否违规，以及可用的配比composition name
	void setDutyCompositionWithRankCombination(Duty* d, long long compID);
	duty_composition getQualifiedComposition(Duty* d);
	void setEnableDebugLog(bool value);
	void getPgMinAndExtraComplement(Pairing*pg, map<string, int>& minComplements, map<string, int>& rankValueMax, vector<map<string, int>>& extraComplements);
	void getPgMinAndMaxComplement(Pairing*pg, map<string, int>& minComplements, map<string, int>& rankValueMax, vector<map<string, int>>& extraComplements);
	void setDbContext(CrewDataContext* db);
private:
	long long findCompositionByName(string name);
	long long findCriteriaIdByCompositionName(const string& name);
	long long calculatePairingCompositionForPilot(Pairing* pairing);
	long long calculatePairingCompositionForPilotR5(Pairing* pairing);
	long long calculatePairingCompositionForCcAm(Pairing* pairing);
	long long calculateDutyComposition(Duty* duty);
	bool isRankInDivision(string rank, string division);
	bool isRuleExist(int function);
	bool isLowerHierarchy(string lowerName, string upperName);
	bool checkData(vector<DBRule>& ruleList);
	void printError(Pairing * pairing, long long compIdByFlights, int hierarchyByFlights, long long compIdByDuty, int hierarchyByDuty);
	void printErrorDutyInfo(Duty * duty);
	void printErrorRuleInfo(int func);
	long long calculatePairingCompositionForCcAmByDivision(Pairing* pairing, string division);
	void computeCompIdAndMultiplierFromRankValueForDivision(const map<string, int>& rankValue, map<long long, int>& compMultiplierMap, string division);
	long long computeCompIdromRankValueForDivision(map<string, int>& rankValue, string division);
	void appendCompositionToPairing(Pairing* pairing, long long compId);
	//PO需要计算Duty配比，故封装如下方法
	int calculateDutyCompositionForPilotR5(Duty* d, string& pairingCompName, bool isPrintLog = true); //PO优化过程中调用时不要打印Log
	void calculateDutyCompositionForCcAmR5(Duty* d, Composition ** pairingComposition,string division, bool isPrintLog = true); //PO优化过程中调用时不要打印Log

	bool setDutyCompositionbyRankForPilotR5(Duty* d);
	bool setDutyCompositionbyRankForCcAmR5(Duty* d);

	int getDutyRestfacility(const Duty* d);

	string airline;
	string division;
	map<string, FLEET> fleetNameMap;
	map<string, Composition> compositionNameMap;
	map<long long, Composition> compositionIdMap;
	map<string, string> rankDivisionMap;
	unordered_map<long long, composition_rank> rankCompositionMap;
	vector<tuple<map<string, int>, long long, int>> compositionRankOptionsVec; // tuple is complement map, composition id, hierachy
	map<string, shared_ptr<DBAircraft>>	fltIdToAircraftMap;
	map<string, long long> crewCountToCompositionIdMap; //eg. 2P->11, 3P->15, 4P->23,...
	vector<ruleBlhAndFdp> ruleFdp2007;
	vector<ruleBlhAndFdp> ruleBlh2008;
	vector<rule2030> rule2030List;
	vector<ruleFdp3007> rule3007List;
	vector<ruleBlh3008> rule3008List;
	long long ruleIdOfFunc3013 = -1;
	map<int, long long> ruleFuncToId;
	bool isDataOK = true;//创建时检查数据是否正确，若不正确则
	bool isEnableDebugLog = false;
	CalcRankCombinationCtx ctx;
	map<string, string>* systemParamMap = nullptr;
};
#endif//PAIRING_COMPOSITION_CALCULATOR_H
