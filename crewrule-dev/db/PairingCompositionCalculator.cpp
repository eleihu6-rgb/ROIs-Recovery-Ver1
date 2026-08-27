//**************************
//说明：
//根据航班计算pairing.pairing_composition/comp_id/rank_map
//
//针对单个division rankValueMap计算可用配比 comp_id/multipler组合
//重构配比匹配，分使用单一多rank compositon匹配、使用多个单rank composition匹配两大类
//1 单一多rank composition匹配
//	1 对比目标 rankValue和各个 composition.rankValue
//	2 rank个数相同
//	3 各rank人数可整除
//	4 各rank人数比例一致
//	5 取比例最小者
//2 多个单rank composition匹配
//	1 遍历rank，
//	2 找到单rank composition
//3 举例
//  1 输入 3AM，已有 composition定义 {1AM},{3AM}，匹配{3AM}
//  2 输入 1CAP1FO，已有 composition定义 {1CAP1FO},{1CAP},{1FO}, 匹配{1CAP1FO}
//  3 输入 2CAP2FO, 又有 composition定义 {1CAP1FO},{2CAP,2FO}, 匹配{2CAP2FO} （按按比例最小 multiple=1)
//**************************
#include <stdio.h>
#include <vector>
#include <iostream>
#include <sstream>
#include <unordered_map>
#include <time.h>
#include <numeric>

#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "TestDBFunc.h"
#include "PairingCompositionCalculator.h"
#include "Log/Logger.h"

using namespace std;

#ifdef __unix
#define localtime_s localtime_r
#endif

// external functions

extern long long calculatePairingRankCombinationForSinglePairingFor3(Pairing* pairing, CalcRankCombinationCtx& ctx, string pComposition = "I", bool checkFleet = true);
extern vector<long long> calculatePairingRankCombinationForPo(Pairing* pairing, CalcRankCombinationCtx& ctx);
extern map<string, int> getOptionsRankValue(CalcRankCombinationCtx& ctx, RankCombinationCriteria* rankComb);

bool calculateForPO_v3(CalcRankCombinationCtx& ctx, string& division, Pairing* pairing);

static bool isDutyContainFly(Duty* d);
bool isAfterMidNight(time_t localTime);
void PairingCompositionCalculator::calculate(vector<Pairing*>& list) {
	//计算配比
	for (Pairing* pairing : list) {
		//for cacc filter KoreaAndJapanPairing 
		if (pairing->getComments() == "KoreaAndJapanPairing" || pairing->getComments() == "flightHasInPairing")
		{
			cout << "pairing "<<pairing->getId()<< " don't need to calculate composition" << endl;
			continue;
		}
		calculate(pairing);
	}
}

void PairingCompositionCalculator::calculate(Pairing* pairing) {
	//20190301 ain, MVP/ PSG无需计算配比
	if (pairing->getPrimeActivity() == "MVP" || pairing->getPrimeActivity() == "PSG") {
		return;
	}
	if (!this->isDataOK) {
		return; //skip if invalid data exists
	}

	if (ctx.dbData->version >= 3) {
		calculateForPO_v3(ctx, division, pairing);
		return;
	}

	if (division == "P") {
		if (isRuleExist(3007) && isRuleExist(3008))
			calculatePairingCompositionForPilotR5(pairing);
		else
			calculatePairingCompositionForPilot(pairing);
	}
	else
		calculatePairingCompositionForCcAm(pairing);
}

//init
PairingCompositionCalculator::PairingCompositionCalculator(CrewDataContext* _dbData)
	:PairingCompositionCalculator(_dbData->scenario.airline, _dbData->scenario.division, _dbData->ruleList, _dbData->fleetList, 
		_dbData->compositionList, _dbData->compositionRankMap, _dbData->rankList, _dbData->fltIdToAircraftMap, &(_dbData->systemParamMap))
{

	for (auto& iter : _dbData->compositionRankOptionMap) {
		for (auto& kv : iter.second) {
			auto optionID = kv.first;
			auto& rankinfo = kv.second;
			map<string, int> optionValue;
			for (int i = 0; i < rankinfo.rankCount; i++) {
				auto& rank = rankinfo.rankValue[i].rank;
				auto plan_value = rankinfo.rankValue[i].plan_value;
				if (plan_value <= 0)
					continue;
				optionValue[rank] = plan_value;
			}
			this->compositionRankOptionsVec.emplace_back(optionValue, iter.first, rankinfo.hierarchy);
		}
	}
	stable_sort(compositionRankOptionsVec.begin(), compositionRankOptionsVec.end(),
		[](const auto& l, const auto& r) { return std::get<2>(l) > std::get<2>(r); });

	setDbContext(_dbData);
}

void PairingCompositionCalculator::updateRankCombinationCriteriaID(Pairing* pairing) {
	for (Duty* d : pairing->getDutyVec()) {
		for (Segment* seg : d->getSegments()) {
			seg->setRankCombCriteriaId(pairing->getRankCombCriteriaId());
			seg->setRankCombCP(pairing->getRankCombCP());
			seg->setRankCombCC(pairing->getRankCombCC());
			seg->setRankCombCA(pairing->getRankCombCA());
		}
	}
}

bool calculateForPO_v3_deprecated(CalcRankCombinationCtx& ctx, string &division, Duty* d) {
	vector<Duty*> dutyList(1);
	dutyList[0] = d;
	Pairing pg(dutyList);	
	calculatePairingRankCombinationForSinglePairingFor3(&pg, ctx);
	if (division == "P") {
		d->setComplementMap(pg.getRankCombRankValueP());
	}
	else if (division == "C") {
		d->setComplementMap(pg.getRankCombRankValueC());
	}
	else if (division == "A") {
		d->setComplementMap(pg.getRankCombRankValueA());
	}
	return true;
}

string findCompositionNameByCriteria(CalcRankCombinationCtx& ctx, SharedPtr<RankCombinationCriteria>& rankCombCriteria) {
	string compositionName = "";

	//auto &rankCombCriteria = rankCombCriteriaIter->second;
	auto rankvalue = getOptionsRankValue(ctx, rankCombCriteria.get());

	for (auto& composition : ctx.dbData->compositionList) {
		auto compositionID = composition.getCompositionId();

		auto compositionRankOptionIter = ctx.dbData->compositionRankOptionMap.find(compositionID);
		if (compositionRankOptionIter == ctx.dbData->compositionRankOptionMap.end())
			continue;

		auto& optionsMap = compositionRankOptionIter->second;
		map<int, composition_rank> composition_rank_map(optionsMap.begin(), optionsMap.end());

		for (auto& cr : composition_rank_map) {
			decltype(rankvalue) compositionRankMap;
			auto& compositionRank = cr.second;
			for (int i = 0; i < compositionRank.rankCount; i++) {
				auto rankName = compositionRank.rankValue[i].rank;
				auto rankValue = compositionRank.rankValue[i].plan_value;
				if (rankValue <= 0)
					continue;
				compositionRankMap[rankName] = rankValue;
			}

			if (rankvalue == compositionRankMap) {
				compositionName = composition.getName();
				break;
			}
		}
		if (!compositionName.empty())
			break;
	}
	return compositionName;

}

// return all valid combination criteria ID and composition name 
pair<bool, vector<pair<long long, string>>> calculateForPO_v3(CalcRankCombinationCtx& ctx, string& division, Duty* d) {
	vector<Duty*> dutyList(1);
	dutyList[0] = d;
	Pairing pg(dutyList);
	auto routeIds = calculatePairingRankCombinationForPo(&pg, ctx);
	vector<SharedPtr<RankCombinationCriteria>> validRouteCriteria;

	for (auto id : routeIds) {
		auto rankCombCriteriaIter = ctx.dbData->rankCombinationCriteriaMap.find(id);
		if (rankCombCriteriaIter == ctx.dbData->rankCombinationCriteriaMap.end())
			continue;
		validRouteCriteria.push_back(rankCombCriteriaIter->second);
	}
	std::stable_sort(validRouteCriteria.begin(), validRouteCriteria.end(), [](const auto& r1, const auto& r2) {return r1->pri < r2->pri; });

	bool valid = false;
	vector<pair<long long, string>> validComps;

	//calculatePairingRankCombinationForSinglePairingFor3(&pg, ctx);
	for (auto& rankCombCriteria : validRouteCriteria) {
		//auto rankCombCriteriaIter = ctx.dbData->rankCombinationCriteriaMap.find(id);
		//if (rankCombCriteriaIter == ctx.dbData->rankCombinationCriteriaMap.end())
		//	continue;
		auto compositionName = findCompositionNameByCriteria(ctx, rankCombCriteria);
		if (compositionName.empty())
			continue;
		validComps.push_back({ rankCombCriteria->id, compositionName });
		valid = true;
	}
	return { valid, validComps };
}


//PO优化过程调用计算Duty配比接口
pair<bool, vector<pair<long long, string>>>  PairingCompositionCalculator::calculateForPO(Duty* d){
	bool isSuccess = false; 
	//20200222 zzm, 无fly duty无需计算配比
	if (d->getNumFlySegs() == 0) {
		map<string, int> rankValue;
		d->setComplementMap(rankValue);
		return { true, vector<pair<long long, string>>() }; //DHD Ferry Duty允许在DutyPool里出现
	}
	if (!this->isDataOK) {
		return {false, vector<pair<long long, string>>() }; //skip if invalid data exists
	}

	if (ctx.dbData->version >= 3) {
		auto ret = calculateForPO_v3(ctx, division, d);
		return ret;
	}


	// below code is for v2 and not used
	if (division == "P")
		isSuccess = setDutyCompositionbyRankForPilotR5(d);
	else
		isSuccess = setDutyCompositionbyRankForCcAmR5(d);

	return { isSuccess, vector<pair<long long, string>>() };
}

void PairingCompositionCalculator::setDbContext(CrewDataContext* db) {
	ctx.dbData = db;
	for (auto& f : db->flightList) {
		ctx.fltIdMap[f->getDBId()] = f.get();
	}
}

bool calculateForPO_v3(CalcRankCombinationCtx& ctx, string& division, Pairing* pairing) {

	calculatePairingRankCombinationForSinglePairingFor3(pairing, ctx);
	if (division == "P") {
		pairing->setComplements(pairing->getRankCombRankValueP());
	}
	else if (division == "C") {
		pairing->setComplements(pairing->getRankCombRankValueC());
	}
	else if (division == "A") {
		pairing->setComplements(pairing->getRankCombRankValueA());
	}
	return true;
}

//PO优化过程调用计算Duty配比接口
bool PairingCompositionCalculator::calculateForPO(Pairing* pairing) {
	if (ctx.dbData->version < 3)
		return calculateForPO_v2(pairing);

	if (pairing->getNumDuties() == 0)
		return false;

	if (pairing->getPrimeActivity() == "MVP" || pairing->getPrimeActivity() == "PSG")
		return false;

	if (!this->isDataOK)
		return false; //skip if invalid data exists

	string pairingCompName = "";
	int pairingComplementSum = -1; 
	Duty* maxComplementDuty = nullptr;
	// choose duty with max complement size
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty* d = pairing->getDuty(i);
		if (d->getNumFlySegs() <= 0)
			continue;

		auto& duty_comp = d->getComplementMap();
		auto duty_comp_sum = std::accumulate(duty_comp.begin(), duty_comp.end(), 0, [](int sum, const auto& map_pair) {return sum + map_pair.second; });
		if (pairingComplementSum < duty_comp_sum) {
			pairingComplementSum = duty_comp_sum;
			maxComplementDuty = d;
		}
	}

	if (maxComplementDuty == nullptr)
		return false;

	pairing->setComplements(maxComplementDuty->getComplementMap());	

	long long rankCombinationCriteriaID = maxComplementDuty->getRankCombinationCriteriaID();
	if (rankCombinationCriteriaID != -1) {
		if (division == "P") {
			pairing->setRankCombCP(rankCombinationCriteriaID);
		}
		else if (division == "C") {
			pairing->setRankCombCC(rankCombinationCriteriaID);
		}
		else if (division == "A") {
			pairing->setRankCombCA(rankCombinationCriteriaID);
		}
	}

	return true;
}
//PO优化过程调用计算Duty配比接口
bool PairingCompositionCalculator::calculateForPO_v2(Pairing* pairing){
	//PO暂时不会组出MVP
	if (pairing->getNumFlySegments() <=0 )
		return false;
	//20190301 ain, MVP/ PSG无需计算配比
	if (pairing->getPrimeActivity() == "MVP" || pairing->getPrimeActivity() == "PSG")
		return false;

	if (!this->isDataOK) 
		return false; //skip if invalid data exists

	// below code is for v2 and not used
	long long ptnCompId = getCompositionByComplements(pairing->getComplements());
	string pairingCompName = "";
	if (ptnCompId != -1)
		pairingCompName = compositionIdMap[ptnCompId].getName();

	long long rankCombinationCriteriaID = -1;

	//duty配比取最大，无需计算Duties配比，PO阶段合法Duty配比已算完
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		//DHD Ferry Duty跳过
		if (d->getNumFlySegs() <= 0)
			continue;
		long long dtCompId = getCompositionByComplements(d->getComplementMap());
		string dtCompName = "";
		if (dtCompId != -1)
			dtCompName = compositionIdMap[dtCompId].getName();
		else
			return false; //无配比的Duty错误

		if (isLowerHierarchy(pairingCompName, dtCompName)) {
			pairingCompName = dtCompName;
			rankCombinationCriteriaID = d->getRankCombinationCriteriaID();
		}
	}

	ptnCompId = this->findCompositionByName(pairingCompName);
	//rankValue
	if (rankCompositionMap.find(ptnCompId) != rankCompositionMap.end()) {
		map<string, int> rankValue;
		for (int j = 0; j < rankCompositionMap[ptnCompId].rankCount; j++) {
			string rank = rankCompositionMap[ptnCompId].rankValue[j].rank;
			int val = rankCompositionMap[ptnCompId].rankValue[j].plan_value;
			if (val > 0)
				rankValue[rank] = val;
		}
		pairing->setComplements(rankValue);
	}
	
	if (rankCombinationCriteriaID != -1) {
		if (division == "P") {
			pairing->setRankCombCP(rankCombinationCriteriaID);
		}
		else if (division == "C") {
			pairing->setRankCombCC(rankCombinationCriteriaID);
		}
		else if (division == "A") {
			pairing->setRankCombCA(rankCombinationCriteriaID);
		}
	}

	return true;
}

void PairingCompositionCalculator::setDutyCompositionWithRankCombination(Duty* d, long long compID) {
	auto rankCombCriteriaIter = ctx.dbData->rankCombinationCriteriaMap.find(compID);
	if (rankCombCriteriaIter == ctx.dbData->rankCombinationCriteriaMap.end())
		return;

	auto &rankCombCriteria = rankCombCriteriaIter->second;
	auto rankvalue = getOptionsRankValue(ctx, rankCombCriteria.get());
	d->setComplementMap(rankvalue);
	d->setRankCombinationCriteriaID(compID);
}
//init
PairingCompositionCalculator::PairingCompositionCalculator(string airline, string division, vector<DBRule>& ruleList, vector<FLEET> &fleetList, vector<Composition>& compositionList, unordered_map<long long, composition_rank>& rankCompositionMap, vector<RANK>& rankList, map<string, shared_ptr<DBAircraft>>&fltIdToAircraftMap, map<string, string>* systemParamMap) {
	this->airline = airline;
	this->division = division;
	this->rankCompositionMap = rankCompositionMap;
	this->systemParamMap = systemParamMap;

	Logger::getRuleLogger()->info(">> PairingCompositionCalculator >> airline={} division={} ruleList=%zd", airline.c_str(), division.c_str(), ruleList.size());
	//20181203 ain, mantis#4558, init ruleFuncToId
	for (auto& item : ruleList) {
		ruleFuncToId[item.function] = item.idRule;
	}
	//fleetNameMap
	for (auto& item : fleetList) {
		if (fleetNameMap.find(item.fleet) != fleetNameMap.end())
			Logger::getRuleLogger()->error("ERROR: invalid data, duplicate fleet {}", item.fleet.c_str());
		this->fleetNameMap[item.fleet] = item;
	}
	//compositionNameMap
	for (auto& item : compositionList) {
		if (fleetNameMap.find(item.getName()) != fleetNameMap.end())
			Logger::getRuleLogger()->error("ERROR: invalid data, duplicate composition {}", item.getName().c_str());
		this->compositionNameMap[item.getName()] = item;
		this->compositionIdMap[item.getCompositionId()] = item;
	}
	for (auto& item : fltIdToAircraftMap) {		
		this->fltIdToAircraftMap[item.first] = item.second;
	}
	//rule2030
	for (auto& rule : ruleList) {
		if (rule.function == 2030) {
			rule2030 item;
			for (auto& it : rule.params) {
				string name = it.first;
				string val = it.second;
				if (strToUpper(name) == "FLEETS") {
					vector<string> tmp;
					split(val.c_str(), '|', tmp);
					for (auto& str : tmp)
						item.fleets[str] = true;
				}
				else if (strToUpper(name) == "DIVISION") {
					item.division = val;   //OP#1963, 2030 ruleParm[division]
				}
				else if (strToUpper(name) == "COMPOSITION") {
					item.compositonName = val;
				}
				else if (strToUpper(name) == "MAX FDP") {
					item.maxFdp = atoi(val.c_str());
				}
			}
			this->rule2030List.push_back(item);
		}
	}

	//数据检查
	this->isDataOK = checkData(ruleList);

	//3013
	//弃用 deprecated, to remove
	for (DBRule& r : ruleList) {
		if (r.function == 3013) {
			//20180509 ain, mantis#3321, RO rule_param header大写
			long long compId = atoll(r.params["COMPOSITION ID"].c_str());
			string crewCount = r.params["COMPOSITION"];
			this->crewCountToCompositionIdMap[crewCount] = compId;
			this->ruleIdOfFunc3013 = r.idRule;
		}
	}

	//2007/2008, 要求先初始化3013一边计算 crewCount -> compositionId
	//弃用 deprecated, to remove
	for (DBRule& r : ruleList) {
		if (r.function == 2008) {
			//Composition,With_Bunk,Landing_Times_Lower,Landing_Times_Upper,AC Change,Max BLH
			if (r.tableNum == 1)
				continue;
			ruleBlhAndFdp item;
			item.crewCount = r.params[strToUpper("Composition")];
			item.crewCountNum = retriveIntFromStr(item.crewCount, 0);
			item.compositionId = this->crewCountToCompositionIdMap[item.crewCount];
			item.withBunk = r.params[strToUpper("With_Bunk")];
			item.minLandingInDuty = atoi(r.params[strToUpper("Landing_Times_Lower")].c_str());
			item.maxLandingInDuty = atoi(r.params[strToUpper("Landing_Times_Upper")].c_str());
			item.maxMinutes = hhmmStrToMinutes(r.params[strToUpper("Max BLH")]);
			this->ruleBlh2008.push_back(item);
		}
		else if (r.function == 2007) {
			//Composition,With_Bunk,Max FDP
			if (r.tableNum == 1)
				continue;
			ruleBlhAndFdp item;
			item.crewCount = r.params[strToUpper("Composition")];
			item.crewCountNum = retriveIntFromStr(item.crewCount, 0);
			item.compositionId = this->crewCountToCompositionIdMap[item.crewCount];
			item.withBunk = r.params[strToUpper("With_Bunk")];
			item.maxMinutes = hhmmStrToMinutes(r.params[strToUpper("Max FDP")]);
			this->ruleFdp2007.push_back(item);
		}
	}

	//R5: 3007/3008
	for (DBRule& r : ruleList) {
		if (r.function == 3007) {
			if (r.tableNum == 1) {
			}
			else {
				ruleFdp3007 item;
				item.compName = r.params[strToUpper("Composition")];
				item.rptRangeStart = hhmmToMinutes(r.params[strToUpper("Rpt Start")].c_str());
				item.rptRangeEnd = hhmmToMinutes(r.params[strToUpper("Rpt End")].c_str());
				item.landingLower = atoi(r.params[strToUpper("Landing Lower")].c_str());
				item.landingUpper = atoi(r.params[strToUpper("Landings Upper")].c_str());
				item.restFacility = r.params[strToUpper("Rest Facility")];
				item.maxFdp = hhmmToMinutes(r.params[strToUpper("Max FDP")].c_str());
				item.isAugment = r.params[strToUpper("isAugment")].c_str();
				this->rule3007List.push_back(item);
			}
		}
		else if (r.function == 3008) {
			if (r.tableNum == 1) {
			}
			else {
				ruleBlh3008 item;
				item.compName = r.params[strToUpper("Composition")];
				item.rptRangeStart = hhmmToMinutes(r.params[strToUpper("Rpt Start")].c_str());
				item.rptRangeEnd = hhmmToMinutes(r.params[strToUpper("Rpt End")].c_str());
				item.maxBlh = hhmmToMinutes(r.params[strToUpper("Max BLH")].c_str());
				this->rule3008List.push_back(item);
			}
		}
	}

	//OP#1963, rank->division map
	//for (auto& it : rankCompositionMap) {
	//	composition_rank& item = it.second;
	//	string division = item.division;
	//	for (int i = 0; i < item.rankCount; i++) {
	//		string rank = item.rankValue[i].rank;
	//		rankDivisionMap[rank] = division;
	//	}
	//}
	//20191023 ain, mantis#6940, 按rank初始化 rankDivisionMap, 避免跨division配比造成初始化异常
	for (auto& rank : rankList) {
		rankDivisionMap[rank.rank] = rank.division;
	}
}

string PairingCompositionCalculator::calculatePairingCompositionForPilotR5_3008(Duty* d) {

	int blh = d->getPlanBlockTime();
	int rptTime = (d->getStartTimeLocAct() % (24 * 3600)) / 60;
	string compName3008 = "";
	for (auto& item : this->rule3008List) {
		//20191119 yuankai.cai mantis#7116 法规新增匹配* 不需要匹配为* 
		if (item.compName == "*")continue;
		if (blh <= item.maxBlh
			&& item.rptRangeStart <= rptTime && rptTime <= item.rptRangeEnd) {
			if (compName3008 == "")
				compName3008 = item.compName;
			else if (isLowerHierarchy(item.compName, compName3008))
				compName3008 = item.compName;
		}
	}
	return compName3008;
}
vector<string>  PairingCompositionCalculator::calculatePairingCompositionForPilotR5_3007(Duty* d) {
	int fdp = d->getPlanFDP();
	int blh = d->getPlanBlockTime();
	int rptTime = (d->getStartTimeLocAct() % (24 * 3600)) / 60;
	int landing = 0;
	for (std::size_t j = 0; j < d->getNumSegments(); j++) {
		Segment* s = d->getSegment(j);
		if (s->getIsOperating() || s->isDeadhead())
			landing++;
	}
	int restfacility = getDutyRestfacility(d);
	//int restfacility = 9999;
	//for (auto& segment : d->getSegments())
	//{
	//	string tailNumber = segment->getTailNum();
	//	int ii = 0;
	//	if (this->fltIdToAircraftMap.find(tailNumber) != this->fltIdToAircraftMap.end()){
	//		DBAircraft* aircraft = this->fltIdToAircraftMap[tailNumber].get();
	//		if (aircraft->isExistRest){
	//			ii = aircraft->restFacility;
	//		}
	//	}
	//	else if (this->fleetNameMap.find(segment->getFleetCD()) != this->fleetNameMap.end()){
	//		FLEET fleet = this->fleetNameMap[segment->getFleetCD()];
	//		if (fleet.restfacility > ii){
	//			ii = fleet.restfacility;
	//		}
	//	}
	//	if (ii < restfacility)restfacility = ii;
	//}
	
	//3007, 以hierarchy较小的为准
	vector<string> result;
	for (auto& item : this->rule3007List) {
		//20191119 yuankai.cai mantis#7116 法规新增匹配* 不需要匹配为* 
		if (item.compName == "*")continue;
		if (item.landingLower <= landing &&  landing <= item.landingUpper
			&& fdp <= item.maxFdp
			&& item.rptRangeStart <= rptTime && rptTime <= item.rptRangeEnd
			&& (item.restFacility == "*" || item.restFacility == "" || restfacility == stoi(item.restFacility))) {
			if (result.size() == 0) {
				result.push_back(item.compName);
				result.push_back(item.isAugment);
			}
			else if (isLowerHierarchy(item.compName, result[0])) {
				result[0] = item.compName;
				result[1] = item.isAugment;
			}
		}
	}
	
	if (isEnableDebugLog) {
		cout << "**DBG PtnCompositionCalc 3007 result=" << (result.empty() ? "empty" : result[0])
			<< " fdp=" << fdp << " blh=" << blh << " restFacility=" << restfacility << " rptTime=" << rptTime
			<< endl;
	}

	return result;
}
pair<long long, string> PairingCompositionCalculator::getDefaultComposition() {
	// return the min priority of rank combination criteria
	auto min_pri = std::min_element(begin(ctx.dbData->rankCombinationCriteriaMap), end(ctx.dbData->rankCombinationCriteriaMap),
		[](auto& c1, auto& c2) {
		return c1.second->pri < c2.second->pri;
	});	
	return make_pair(min_pri->second->id, findCompositionNameByCriteria(ctx, min_pri->second));
}

string PairingCompositionCalculator::calculatePairingCompositionForPilotR4_2007(Duty* d) {
	int fdpMinutes = d->getFDPInSecs() / 60;
	//2007 FDP
	//寻找满足duty.fdp的最小 crew数量
	int compIdFdp = 0;
	int crewCountFdp = 999;//初始化999以寻找最小匹配
	string compName2007 = "";
	for (ruleBlhAndFdp& item : ruleFdp2007) {
		if (fdpMinutes <= item.maxMinutes) {//max FDP
			if (compName2007 == "")
				compName2007 = item.crewCount;
			else if (isLowerHierarchy(item.crewCount, compName2007))
				compName2007 = item.crewCount;
		}
	}
	return compName2007;
}

string PairingCompositionCalculator::calculatePairingCompositionForPilotR4_2008(Duty* d) {

	int blhMinutes = d->getBLKInMins();

	int flySegCount = 0;
	for (std::size_t i = 0; i < d->getNumSegments(); i++) {
		Segment * seg = d->getSegment(i);
		if (seg->getIsOperating())
			flySegCount++;
	}

	//2008 BLH 
	//寻找满足duty.blh/landings的最小 crew数量
	int compIdBlh = 0;
	int crewCountBlh = 999;//初始化999以寻找最小匹配
	string compName2008 = "";
	for (ruleBlhAndFdp& item : ruleBlh2008) {
		if (blhMinutes <= item.maxMinutes //max BLH
			&& (flySegCount >= item.minLandingInDuty && flySegCount <= item.maxLandingInDuty)) { //landing_times
			if (compName2008 == "")
				compName2008 = item.crewCount;
			else if (isLowerHierarchy(item.crewCount, compName2008))
				compName2008 = item.crewCount;
		}
	}
	return compName2008;
}
//rule 2030计算过程：
//1 按seg.fleet + duty.FDP确定 duty.comp
//2 按duty.comp.hierarchy汇总确定 pairing.comp
long long PairingCompositionCalculator::calculatePairingCompositionForCcAm(Pairing* pairing) {
	//20190117 ain, OP#1963, 2030支持同时计算cc/am配比
	long long compCC = calculatePairingCompositionForCcAmByDivision(pairing, "C");
	long long compAM = calculatePairingCompositionForCcAmByDivision(pairing, "A");

	//reset to 0, add CC/AM comp
	if (compCC != 0 || compAM != 0) {
		pairing->setComplements(map<string, int>());
		appendCompositionToPairing(pairing, compAM);
		appendCompositionToPairing(pairing, compCC);
	}
	if (division == "C" && compCC != 0)
		pairing->setCompositionId(compCC);
	if (division == "A" && compAM != 0)
		pairing->setCompositionId(compAM);
	return compCC == 0 ? compCC : compAM;
}



//计算pairing所需R4配比
//1 计算每一duty符合的2007/2008，取hierarchy较小者
//2 汇总pairing配比，从duty符合3007/3008的配比取hierarchy较大者
long long PairingCompositionCalculator::calculatePairingCompositionForPilot(Pairing* pairing) {	
	long long ptnCompId = getCompositionByComplements(pairing->getComplements());
	string pairingCompName = "";
	if (ptnCompId != -1){
		pairingCompName = compositionIdMap[ptnCompId].getName();
	}
	//1 对每一duty，分别求满足 2007/2008的最小配比，并对照法规参数取 hierarchy较小者
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);

		bool hasFLY = isDutyContainFly(d);
		//对于每个Segment获取到最适合配比  hierarchy较大者
		for (std::size_t j = 0; j < d->getSegments().size(); j++){
			Segment* s = d->getSegment(j);
			long long sCompId = getCompositionByComplements(s->getComplementMap());
			string compNameS = "";
			if (sCompId != -1){
				compNameS = compositionIdMap[ptnCompId].getName();
			}
			pairingCompName = isLowerHierarchy(pairingCompName, compNameS) ? compNameS : pairingCompName;
		}
		//2007, 以hierarchy较小的为准
		string compName2007 = calculatePairingCompositionForPilotR4_2007(d);
		if (compName2007 == "" && hasFLY) {
			cout << "ERROR: compute pairing composition fail, no rule2007 match duty[fdp=" << d->getPlanFDP() << "]: \n";
			printErrorDutyInfo(d);
			printErrorRuleInfo(2007);
			//Logger::getRuleLogger()->error("compute pairing composition fail");
			return -1;
		}
		//2008, 以hierarchy较小的为准
		string compName2008 = calculatePairingCompositionForPilotR4_2008(d);
		if (compName2008 == "") {
			cout << "ERROR: compute pairing composition fail, no rule2008 match duty[blh=" << d->getPlanBlockTime() / 60 << ":" << d->getPlanBlockTime() % 60 << "]: \n";
			printErrorDutyInfo(d);
			printErrorRuleInfo(3008);
			//Logger::getRuleLogger()->error("compute pairing composition fail");
			//20190312 ain, mantis#5109, 找不到匹配BLH的3008条目时退出不计算，不再抛出except，避免中断界面操作
			return -1;
		}
		//汇总: 以hierarchy较大的为准
		pairingCompName = isLowerHierarchy(pairingCompName, compName2007) ? compName2007 : pairingCompName;
		pairingCompName = isLowerHierarchy(pairingCompName, compName2008) ? compName2008 : pairingCompName;
	}
	ptnCompId = this->findCompositionByName(pairingCompName);
	//rankValue

	if (rankCompositionMap.find(ptnCompId) != rankCompositionMap.end()) {
		map<string, int> rankValue;
		for (int j = 0; j < rankCompositionMap[ptnCompId].rankCount; j++) {
			string rank = rankCompositionMap[ptnCompId].rankValue[j].rank;
			int val = rankCompositionMap[ptnCompId].rankValue[j].plan_value;
			rankValue[rank] = val;
		}
		pairing->setComplements(rankValue);
	}
	return ptnCompId;
}


//计算pairing所需R5配比
//1 计算每一duty符合的3007/3008，取hierarchy较小者
//2 汇总pairing配比，从duty符合3007/3008的配比取hierarchy较大者
long long PairingCompositionCalculator::calculatePairingCompositionForPilotR5(Pairing* pairing) {
	long long ptnCompId = getCompositionByComplements(pairing->getComplements());
	string pairingCompName = "";
	if (ptnCompId != -1){
		pairingCompName = compositionIdMap[ptnCompId].getName();
	}
	//1 对每一duty，分别求满足 3007/3008的最小配比，并对照3013取 hierarchy较小者
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		//计算Duty配比逻辑封装，return -1 failed, 0 successed  zzm 20200222
		int returnId = calculateDutyCompositionForPilotR5(d, pairingCompName);
		if (returnId == -1)
			return -1;
	}
	ptnCompId = this->findCompositionByName(pairingCompName);
	//rankValue

	if (rankCompositionMap.find(ptnCompId) != rankCompositionMap.end()) {
		map<string, int> rankValue;
		for (int j = 0; j < rankCompositionMap[ptnCompId].rankCount; j++) {
			string rank = rankCompositionMap[ptnCompId].rankValue[j].rank;
			int val = rankCompositionMap[ptnCompId].rankValue[j].plan_value;
			rankValue[rank] = val;
		}
		pairing->setComplements(rankValue);
	}
	return ptnCompId;
}

//计算飞行duty所需R5配比
//1. 计算duty符合的3007 / 3008，取hierarchy较小者
int PairingCompositionCalculator::calculateDutyCompositionForPilotR5(Duty* d, string& pairingCompName, bool isPrintLog){
	//20191111 ain, 纯DHD/Train未能计算配比可忽略，不抛出异常而是继续尝试下一duty
	bool hasFLY = isDutyContainFly(d);
	//对于每个Segment获取到最适合配比  hierarchy较大者
	for (std::size_t j = 0; j < d->getSegments().size(); j++){
		Segment* s = d->getSegment(j);
		if (s->getAssignment() == "DHD") {
			continue;//20210722 ain, mantis#9396, DHD seg不参与计算配比
		}
		long long sCompId = getCompositionByComplements(s->getComplementMap());
		string compNameS = "";
		if (sCompId != -1){
			compNameS = compositionIdMap[sCompId].getName();
		}
		pairingCompName = isLowerHierarchy(pairingCompName, compNameS) ? compNameS : pairingCompName;
	}
	if (isEnableDebugLog) {
		cout << "**DBG PtnCompositionCalc pid=" << d->getPairingId()
			<< " duty=" << d->getDutySegNum()
			<< " duty.vec=" << d->getNumSegments() << " [";

		for (auto& s : d->getSegments()) {
			cout << s->getDBId() << ",";
		}
		cout << "] flt  result=" << pairingCompName << endl;
	}

	//3007, 以hierarchy较小的为准
	vector<string> comp3007 = calculatePairingCompositionForPilotR5_3007(d);
	if (comp3007.empty()) {
		return -1;
	}
	string compName3007 = comp3007[0];
	if (compName3007 == "" && hasFLY) { //纯DHD/Train未能计算配比可忽略，不抛出异常继续尝试下一duty
		if (isPrintLog){
			cout << "ERROR: compute pairing composition fail, no rule3007 match duty[fdp=" << d->getPlanFDP() << "]: \n";
			printErrorDutyInfo(d);
			printErrorRuleInfo(3007);
			//Logger::getRuleLogger()->error("compute pairing composition fail");
		}
		return -1;
	}
	//3008, 以hierarchy较小的为准
	string compName3008 = calculatePairingCompositionForPilotR5_3008(d);
	if (isEnableDebugLog) {
		cout << "**DBG PtnCompositionCalc pid=" << d->getPairingId()
			<< " duty=" << d->getDutySegNum()
			<< " 3008 result=" << compName3008
			<< endl;
	}
	if (compName3008 == "" && hasFLY) { //纯DHD/Train未能计算配比可忽略，不抛出异常继续尝试下一duty
		if (isPrintLog){
			cout << "ERROR: compute pairing composition fail, no rule3008 match duty[blh=" << d->getPlanBlockTime() / 60 << ":" << d->getPlanBlockTime() % 60 << "]: \n";
			printErrorDutyInfo(d);
			printErrorRuleInfo(3008);
			//Logger::getRuleLogger()->error("compute pairing composition fail");
		}
		//20190312 ain, mantis#5109, 找不到匹配BLH的3008条目时退出不计算，不再抛出except，避免中断界面操作
		return -1;
	}
	//汇总: 以hierarchy较大的为准
	pairingCompName = isLowerHierarchy(pairingCompName, compName3007) ? compName3007 : pairingCompName;
	pairingCompName = isLowerHierarchy(pairingCompName, compName3008) ? compName3008 : pairingCompName;

	return 0;
}
bool PairingCompositionCalculator::setDutyCompositionbyRankForPilotR5(Duty* d){
	//duty优化都是新创建的，无配比
	string dutyCompName = "";
	long long ptnCompId = -1;
	/*int ptnCompId = getCompositionByComplements(d->getComplementMap());
	if (ptnCompId != -1)
		dutyCompName = compositionIdMap[ptnCompId].getName();*/

	//计算Duty配比逻辑封装，return -1 failed, 0 successed  zzm 20200222
	int returnId = calculateDutyCompositionForPilotR5(d, dutyCompName, false);
	if (returnId == -1)
		return false;
	ptnCompId = this->findCompositionByName(dutyCompName);
	//rankValue
	if (rankCompositionMap.find(ptnCompId) != rankCompositionMap.end()) {
		map<string, int> rankValue;
		for (int j = 0; j < rankCompositionMap[ptnCompId].rankCount; j++) {
			string rank = rankCompositionMap[ptnCompId].rankValue[j].rank;
			int val = rankCompositionMap[ptnCompId].rankValue[j].plan_value;
			rankValue[rank] = val;
		}
		d->setComplementMap(rankValue);
	}
	return true;
}
//计算duty所需配比
//弃用 deprecated
long long PairingCompositionCalculator::calculateDutyComposition(Duty* duty) {
	//if (division != "P") {
	//	Logger::getRuleLogger()->error("ERROR: calculate composition fail, call for pilot but division={}", division.c_str());
	//	Logger::getRuleLogger()->error("invalid param");
	//}

	int blhMinutes = duty->getBLKInMins();
	int fdpMinutes = duty->getFDPInSecs() / 60;
	bool afterMidNit = isAfterMidNight((time_t)duty->getEndTime());
	int flySegCount = 0;
	for (std::size_t i = 0; i < duty->getNumSegments(); i++) {
		Segment * seg = duty->getSegment(i);
		if (seg->getIsOperating())
			flySegCount++;
	}

	//2007 FDP
	//寻找满足duty.fdp的最小 crew数量
	long long compIdFdp = 0;
	int crewCountFdp = 999;//初始化999以寻找最小匹配
	for (ruleBlhAndFdp& item : ruleFdp2007) {
		if (fdpMinutes <= item.maxMinutes) {//max FDP
			if (rankCompositionMap.find(item.compositionId) == rankCompositionMap.end()) {
				Logger::getRuleLogger()->error("ERROR: rule 2007 composition={} not found in 3013, dutyId={}", item.crewCount.c_str(), duty->getDutyId());
				//mantis#2207, 添加3013<-->2007不匹配compostion定义错误信息
				std::ostringstream oss;
				for (auto& it : crewCountToCompositionIdMap) {
					oss<<it.first.c_str() << ",";
				}
				Logger::getRuleLogger()->error("invalid data, rule 3013 composition={}, dutyId={}", oss.str(), duty->getDutyId());
				continue;
			}
			composition_rank& comp = this->rankCompositionMap[item.compositionId];
			if (item.crewCountNum < crewCountFdp) {
				compIdFdp = item.compositionId;
				crewCountFdp = item.crewCountNum;
			}
		}
	}

	//2008 BLH
	//寻找满足duty.blh/landings的最小 crew数量
	long long compIdBlh = 0;
	int crewCountBlh = 999;//初始化999以寻找最小匹配
	for (ruleBlhAndFdp& item : ruleBlh2008) {
		if (blhMinutes <= item.maxMinutes //max BLH
			&& (flySegCount >= item.minLandingInDuty && flySegCount <= item.maxLandingInDuty)) { //landing_times
			if (rankCompositionMap.find(item.compositionId) == rankCompositionMap.end()) {
				Logger::getRuleLogger()->error("ERROR: rule 2008 composition={} not found in 3013", item.crewCount.c_str());
				//mantis#2207, 添加3013<-->2008不匹配compostion定义错误信息
				std::ostringstream oss;
				for (auto& it : crewCountToCompositionIdMap) {
					oss << it.first.c_str() << "/ ";
				}
				Logger::getRuleLogger()->error("invalid data, rule 3013 composition={}, dutyId={}", oss.str(), duty->getDutyId());
				continue;
			}
			composition_rank& comp = this->rankCompositionMap[item.compositionId];
			if (item.crewCountNum < crewCountBlh) {
				compIdBlh = item.compositionId;
				crewCountBlh = item.crewCountNum;
			}
		}
	}

	//汇总 fdp/blh匹配结果
	long long compId = 0;
	if (compIdBlh != 0 && compIdFdp != 0) {
		compId = (crewCountBlh > crewCountFdp) ? compIdBlh : compIdFdp;;
		//cout << "composition of pair_id=" << duty->getPairingId() << " duty BLH=" << blhMinutes << " FDP=" << fdpMinutes << " segs=" << flySegCount << " compId=" << compId << " " << rankCompositionMap[compId].rankCount << "P\n";
	}
	else {
		stringstream ss;
		ss << "ERROR: no rule 2007 or 2008 match duty BLH=" << blhMinutes << " FDP=" << fdpMinutes << " segmentList.size=" << flySegCount << endl;
		//Debug start
		printDutiesGenerated(duty);
		//Debug end
		if (compIdFdp == 0) {
			ss << "ERROR MSG: RULE 2007 not match duty\n";
			for (ruleBlhAndFdp& item : ruleFdp2007) {
				ss << "  " << item.compositionId << " " << item.crewCount << " bunk=" << item.withBunk << " landing=" << item.minLandingInDuty << "," << item.maxLandingInDuty << " maxFdp=" << item.maxMinutes << "\n";
			}
			ss << "\n";
		}
		if (compIdBlh == 0) {
			ss << "ERROR MSG: RULE 2008 not match duty\n";
			for (ruleBlhAndFdp& item : ruleBlh2008) {
				ss << "  " << item.compositionId << " " << item.crewCount << " bunk=" << item.withBunk << " landing=" << item.minLandingInDuty << "," << item.maxLandingInDuty << " maxFdp=" << item.maxMinutes << "\n";
			}
			ss << "\n";
		}
		ss << "ERROR MSG: RULE 3013 \n";
		for (auto& it : crewCountToCompositionIdMap) {
			ss << "  " << it.first << " " << it.second << "\n";
		}
		ss << endl;
		ss << "ERROR MSG: Compositions\n";
		for (auto& it : this->rankCompositionMap) {
			if (it.second.airline == this->airline) {
				ss << "  comp=" << it.first << " hierarchy=" << it.second.hierarchy << " ";
				for (int i = 0; i < it.second.rankCount; i++)
					ss << it.second.rankValue[i].rank << ":" << it.second.rankValue[i].plan_value << " ";
				ss << "\n";
			}
			ss << endl;
		}
		Logger::getRuleLogger()->error("compute pairing_composition fail. dutyId={}, message:{}", duty->getDutyId(), ss.str());
	}
	return compId;
}

bool isAfterMidNight(time_t localTime) {
	tm m = { 0 };
#ifdef WIN32
	localtime_s(&m, &localTime);
#elif defined(__unix)
	localtime_s(&localTime, &m);
#elif defined(__APPLE__)
    localtime_r(&localTime, &m);
#endif
	if (m.tm_hour > 0 && m.tm_hour < 5)
		return true;
	else
		return false;
}



//计算pairing_composition/comp_id/rank_map
void computePairingRankValueMap(vector<Pairing*>& list, unordered_map<long long, composition_rank>   &rankCompositionMap, string division, CrewDataContext * dataCtx) {
	PairingCompositionCalculator calculator(dataCtx->scenario.airline, division, dataCtx->ruleList, dataCtx->fleetList, dataCtx->compositionList, rankCompositionMap, dataCtx->rankList,dataCtx->fltIdToAircraftMap, &(dataCtx->systemParamMap));
	calculator.calculate(list);

	for (Pairing * pairing : list) {
		map<string, int> rankValue;
		for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
			Duty * d = pairing->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment * seg = d->getSegment(j);
				for (auto& item : seg->getPlanComposition()) {
					string rank = item.first;
					int value = item.second;
					if (rankValue.find(rank) == rankValue.end())
						rankValue.insert(make_pair(rank, value));
					else if (rankValue[rank] < value)  //mantis#2082, 寻找pairing下单航班最大rankValue值
						rankValue[rank] = value;
				}
			}
		}
		pairing->setComplements(rankValue);
		pairing->setCompositionId(getCompositionIdByCompMap(rankCompositionMap, rankValue));
	}
}


void PairingCompositionCalculator::printError(Pairing * pairing, long long compIdByFlights, int hierarchyByFlights, long long compIdByDuty, int hierarchyByDuty) {

	cout << "ERROR: compute pairing.composition.rank_value fail,"
		<< " compIdByFlights=" << compIdByFlights << " hierarchyByFlights=" << hierarchyByFlights
		<< " compIdByDuty=" << compIdByDuty << " hierarchyByDuty=" << hierarchyByDuty
		<< " pairing =" << pairing->getBase() << "" << utcToUtcDtString(pairing->getStartTime()) << endl;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment * s = d->getSegment(j);
			cout << "       segment flt_id=" << s->getDBId() << " " << s->getDepStation() << "-" << s->getArrStation() << " ";
			for (auto& it : s->getPlanComposition()) {
				cout << it.first << ":" << it.second << " ";
			}
			cout << endl;
		}
	}
}

void PairingCompositionCalculator::printErrorDutyInfo(Duty * duty) {
	for (std::size_t i = 0; i < duty->getNumSegments(); i++) {
		Segment* s = duty->getSegment(i);
		cout << "       Seg " << s->getFlightNumber()
			<< " " << s->getAssignment()
			<< " " << s->getDepStation() << "->" << s->getArrStation()
			<< " " << utcToUtcString(s->getStartTimeLocAct())
			<< " " << utcToUtcString(s->getEndTimeLocAct())
			<< endl;
	}
}

void PairingCompositionCalculator::printErrorRuleInfo(int func) {
	cout << "       RULE " << func << "\n";
	if (func == 3007) {
		for (auto& item : this->rule3007List)
			cout << "             " << item.compName
			<< " RPT (" << (item.rptRangeStart / 60) << ":" << (item.rptRangeStart % 60)
			<< ", " << (item.rptRangeStart / 60) << ":" << (item.rptRangeStart % 60) << ")"
			<< " landing (" << item.landingLower << ", " << item.landingUpper << ")"
			<< " restFacility=" << item.restFacility
			<< " maxFDP=" << (item.maxFdp / 60) << ":" << (item.maxFdp % 60)
			<< endl;
	}
	if (func == 3008) {
		for (auto& item : this->rule3008List)
			cout << "             " << item.compName
			<< " RPT (" << (item.rptRangeStart / 60) << ":" << (item.rptRangeStart % 60)
			<< ", " << (item.rptRangeStart / 60) << ":" << (item.rptRangeStart % 60) << ")"
			<< " maxBlh=" << (item.maxBlh / 60) << ":" << (item.maxBlh % 60)
			<< endl;
	}

}

//从rank-value-map计算 composition-multiplier组合
//如 CA:2,FO:3 --> composition 1x2, 2x3
map<long long, int> PairingCompositionCalculator::computeCompIdAndMultiplierFromRankValue(map<string, int>& rankValue) {
	map<long long, int> compMultiplierMap;

	//20190118 ain, OP#1963, 根据rankValue计算 comp_id/multipler逻辑支持division=C+A, 分别统计 comp_id组合
	map<string, int> rankValueFD;
	map<string, int> rankValueCC;
	map<string, int> rankValueAM;
	for (auto& it : rankValue) {
		string rank = it.first;
		if (rankDivisionMap.find(rank) == rankDivisionMap.end())
			continue;
		if (rankDivisionMap[rank] == "P")
			rankValueFD[rank] = it.second;
		if (rankDivisionMap[rank] == "C")
			rankValueCC[rank] = it.second;
		if (rankDivisionMap[rank] == "A")
			rankValueAM[rank] = it.second;
	}

	computeCompIdAndMultiplierFromRankValueForDivision(rankValueFD, compMultiplierMap, "P");
	computeCompIdAndMultiplierFromRankValueForDivision(rankValueCC, compMultiplierMap, "C");
	computeCompIdAndMultiplierFromRankValueForDivision(rankValueAM, compMultiplierMap, "A");

	return compMultiplierMap;
}

//确认rank是否属于目标 division, 用于根据 rankValue生成 composition-multiplier对应关系
bool PairingCompositionCalculator::isRankInDivision(string rank, string division) {
	for (auto& it : this->rankCompositionMap) {
		for (int i = 0; i < it.second.rankCount; i++) {
			string compRank = it.second.rankValue[i].rank;
			if (compRank == rank) {
				string compDivision = it.second.division;
				return compDivision == division;
			}
		}
	}
	return false;
}
void PairingCompositionCalculator::printDutiesGenerated(Duty* tempduty)
{
	cout << " Duty " << tempduty->getId() << ": " << tempduty->getDepStation() << " -> " << tempduty->getArrStation() << " AC change:" << tempduty->getNumAircraftChanges()
		<< " start(" << utcToUtcString(tempduty->getStartTime()) << ")"
		<< " end(" << utcToUtcString(tempduty->getEndTime()) << ")"
		<< " pickup(" << tempduty->getMinPickup() << ")"
		<< " brief(" << tempduty->getMinBrief() << ")"
		<< " debrief(" << tempduty->getMinDebrief() << ")"
		<< " dropoff(" << tempduty->getMinDropoff() << ")"
		<< " FDP(" << (tempduty->getFDPInSecs() / 60) << ")"
		<< " DP(" << (tempduty->getDPInSecs() / 60) << ")"
		<< " numSegs(" << tempduty->getNumSegments() << ")"
		<< endl;
	vector<Segment*> segs111 = tempduty->getSegments();
	int nSegs111 = (int)segs111.size();
	for (int u = 0; u<nSegs111; u++){
		Segment * tempseg = segs111[u];
		cout << "      Segment " << tempseg->getDBId() << " " << utcToUtcString(tempseg->getStartTimeLocSch()) << " " << utcToUtcString(tempseg->getEndTimeLocSch()) << " " << tempseg->getBlkSeconds() / 60 << " " << tempseg->getBlkMinHistory() << " " << tempseg->getFltCode() << ", " << tempseg->getDepSta() << " -> " << tempseg->getArrSta()
			<< "  " << tempseg->getSegNumber() << " Next leg " << tempseg->getNextLegNo() << endl;
		//Debug start
		if (tempseg->getIsDeadhead()){
			cout << "      Segment " << tempseg->getDBId() << " is DHD" << endl;
			cout << " " << endl;
		}
		if (tempseg->getIsOperating()){
			cout << "      Segment " << tempseg->getDBId() << " is FLY" << endl;
			cout << " " << endl;
		}
		//Debug end

	}
}

//数据检查
//1) 2030中fleet是否覆盖全部可能flight
void PairingCompositionCalculator::checkDataFleet(vector<Segment>& segments) {
	if (!this->isRuleExist(2030)) {
		return;
	}
	long long ruleId2030 = ruleFuncToId[2030];
	map<string, bool> allFleets;
	for (auto& item : this->rule2030List) {
		for (auto& it : item.fleets) {
			allFleets[it.first] = true;
		}
	}
	bool invalidDataFound = false;
	map<string, Segment*> missingFleets;
	for (Segment& seg : segments) {
		Segment*s = &seg;
		if (allFleets.find(s->getFleetCD()) == allFleets.end()) {
			invalidDataFound = true;
			missingFleets[s->getFleetCD()] = s;
		}
	}
	stringstream ss;
	for (auto& it : missingFleets) {
		Segment* s = it.second;
		ss << "ERROR: invalid data, rule=" << ruleId2030
			<< " missing fleet definition in rule 2030, flight "
			<< " segId=" << s->getDBId()
			<< " fltNum=" << s->getFlightNumber()
			<< " fleet=" << s->getFleetCD()
			<< " dep=" << s->getDepStation()
			<< " arv=" << s->getArrStation()
			<< " " << utcToUtcDtString(s->getStartTimeLocSch())
			<< endl;
	}
	if (invalidDataFound)
		Logger::getRuleLogger()->error("[checkDataFleet] invalid data, message:{}", ss.str());
}

//数据检查
//1) cc/am是否包含 2030
//2) fd是否包含 2007/2008 或 3007/3008, 优先3007/3008
bool PairingCompositionCalculator::checkData(vector<DBRule>& ruleList) {
	//ROSCRW - 2307【QQ】3007、3008法规，需要和PO解绑
	// 不检查 2030/2007/2008 或 3007/3008是否存在
	//if (this->division == "C" || this->division == "A") {
	//	if (!isRuleExist(2030)) {
	//		Logger::getRuleLogger()->error("ERROR: invalid data, scenario division={}, but rule 2030 not found", division.c_str());
	//		return false;
	//	}
	//}
	//if (this->division == "C" || this->division == "A") {
	//	for (auto& item : this->rule2030List) {
	//		string name = item.compositonName;
	//		if (compositionNameMap.find(name) == compositionNameMap.end()) {
	//			Logger::getRuleLogger()->error("ERROR: invalid data, 2030 compotion={} is not exist in table composition", name.c_str());
	//		}
	//	}
	//}

	//if (division == "C" || division == "A") {
	//	if (!isRuleExist(2030)){
	//		Logger::getRuleLogger()->error("ERROR: calculate pairing_composition fail, no rule 2007 found");
	//		return false;
	//	}
	//}
	//else {
	//	if (!isRuleExist(2007) && !isRuleExist(2008) && !isRuleExist(3007) && !isRuleExist(3008)) {
	//		Logger::getRuleLogger()->error("ERROR: calculate pairing_composition fail, no rule 2007/2008 or 3007/3008 found");
	//		return false;
	//	}
	//	else if (isRuleExist(3007) && !isRuleExist(3008)) {
	//		Logger::getRuleLogger()->error("ERROR: calculate pairing_composition fail, no rule 3008 found");
	//		return false;
	//	}
	//	else if (!isRuleExist(3007) && isRuleExist(3008)) {
	//		Logger::getRuleLogger()->error("ERROR: calculate pairing_composition fail, no rule 3007 found");
	//		return false;
	//	}
	//	else if (!isRuleExist(3007) && !isRuleExist(3008)) {
	//		if (!isRuleExist(2007) && isRuleExist(2008)) {
	//			Logger::getRuleLogger()->error("ERROR: calculate pairing_composition fail, no rule 2007 found");
	//			return false;
	//		}
	//		else if (isRuleExist(2007) && !isRuleExist(2008)) {
	//			Logger::getRuleLogger()->info("ERROR: calculate pairing_composition fail, no rule 2008 found");
	//			return false;
	//		}
	//	}
	//}
	
	
	return true;
	// 下面这段代码实际上没有修改compNameToId，没有任何效果，此处提前返回
	map<string, long long> compNameToId;
	for (DBRule& r : ruleList) {
		if (r.function == 3013) {
			string name = r.params["COMPOSITION"];
			if (compNameToId.find(name) != compNameToId.end()) {
				Logger::getRuleLogger()->error("ERROR: duplicate {} in rule_param {}", name.c_str(), r.idRule);
				for (DBRule& r1 : ruleList) {
					if (r1.function == r.function) {
						cout << "  RULE " << r1.idRule << " ";
						for (auto& it : r1.params)
							cout << it.first << ":" << it.second << ",";
						cout << endl;
					}
				}
				return false;
			}
		}
	}
	//check 2007/2008 compName in 3013
	for (auto& item : this->ruleFdp2007) {
		if (compNameToId.find(item.crewCount) == compNameToId.end()) {
			Logger::getRuleLogger()->error("ERROR: invalid data, rule[{}] comp='{}' not define in rule[{}]",
				ruleFuncToId[2007], item.crewCount.c_str(), ruleFuncToId[3013]);
			return false;
		}
	}
	for (auto& item : this->ruleBlh2008) {
		if (compNameToId.find(item.crewCount) == compNameToId.end()) {
			Logger::getRuleLogger()->error("ERROR: invalid data, rule[{}] comp='{}' not define in rule[{}]",
				ruleFuncToId[2008], item.crewCount.c_str(), ruleFuncToId[3013]);
			return false;
		}
	}

	//check 3007/3008 compName in 3013
	for (auto& item : this->rule3007List) {
		if (compNameToId.find(item.compName) == compNameToId.end()) {
			Logger::getRuleLogger()->error("ERROR: invalid data, rule[{}] comp='{}' not define in rule[{}]",
				ruleFuncToId[3007], item.compName.c_str(), ruleFuncToId[3013]);
			return false;
		}
	}
	for (auto& item : this->rule3008List) {
		if (compNameToId.find(item.compName) == compNameToId.end()) {
			Logger::getRuleLogger()->error("ERROR: invalid data, rule[{}] comp='{}' not define in rule[{}]",
				ruleFuncToId[3008], item.compName.c_str(), ruleFuncToId[3013]);
			return false;
		}
	}
	return true; //OK
}
bool PairingCompositionCalculator::isRuleExist(int function) {
	return ruleFuncToId.find(function) != ruleFuncToId.end();
}

bool PairingCompositionCalculator::isLowerHierarchy(string lowerName, string upperName) {
	if (lowerName == "")
		return true;
	if (upperName == "")
		return false;
	long long id1 = findCompositionByName(lowerName);
	long long id2 = findCompositionByName(upperName);
	if (this->compositionIdMap[id1].getHierarchy() < this->compositionIdMap[id2].getHierarchy())
		return true;
	else
		return false;
}

//从name寻找 comp_id
//1 优先按 composition.name查找
//2 若未找到，则通过 rule 3013 composition间接寻找
long long PairingCompositionCalculator::findCompositionByName(string name) {
	if (compositionNameMap.find(name) != compositionNameMap.end()) {
		long long compId = (std::numeric_limits<int>::max)();
		for (auto& comp : compositionIdMap){
			if (comp.second.getName() == name && comp.first < compId){
				compId = comp.first;
			}
		}
		return compId;
	}
	else if (crewCountToCompositionIdMap.find(name) != crewCountToCompositionIdMap.end()) {
		long long compId = crewCountToCompositionIdMap[name];
		if (compositionIdMap.find(compId) == compositionIdMap.end()) {
			Logger::getRuleLogger()->error("ERROR: invalid rule 3013 data, comp_id={} not found in COMPOSITION", compId);
			return -1;
		}
		return compId;
	}
	else {
		Logger::getRuleLogger()->error("ERROR: invalid data, composition.name={} rule_param not found in COMPOSITION OR rule3013", name);
		return -1;
	}
}

long long PairingCompositionCalculator::findCriteriaIdByCompositionName(const string& name) {
	auto compositionID = findCompositionByName(name);

	auto compositionRankOptionIter = ctx.dbData->compositionRankOptionMap.find(compositionID);
	if (compositionRankOptionIter == ctx.dbData->compositionRankOptionMap.end())
		return 0;

	auto& optionsMap = compositionRankOptionIter->second;
	map<int, composition_rank> composition_rank_map(optionsMap.begin(), optionsMap.end());

	for (auto& cr : composition_rank_map) {
		map<string, int> compositionRankMap;
		auto& compositionRank = cr.second;
		for (int i = 0; i < compositionRank.rankCount; i++) {
			auto rankName = compositionRank.rankValue[i].rank;
			auto rankValue = compositionRank.rankValue[i].plan_value;
			compositionRankMap[rankName] = rankValue;
		}
		for (auto& rankCombCriteriaIter : ctx.dbData->rankCombinationCriteriaMap) {
			auto& routeid = rankCombCriteriaIter.first;
			auto& rankCombCriteria = rankCombCriteriaIter.second;
			auto rankvalue = getOptionsRankValue(ctx, rankCombCriteria.get());


			if (rankvalue == compositionRankMap) {
				return routeid;
			}
		}
	}

	return 0;
}
long long PairingCompositionCalculator::calculatePairingCompositionForCcAmByDivision(Pairing* pairing, string division) {
	Composition* pairingComposition=NULL;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty* d = pairing->getDuty(i);
		//计算Duty配比逻辑封装, 2030同时计算division=C/A zzm 20200222
		calculateDutyCompositionForCcAmR5(d, &pairingComposition, division);
	}
	if (pairingComposition == NULL) {
		//场景division=C时, 可不打印division=A错误
		if (division == this->division) {
			cout << "ERROR: calculate pairing composition(CC/AM) fail, division=" << division << ", pairing segments:" << endl;
			cout << "       pairing = " << pairing->getDbId() << " " << utcToUtcDtString(pairing->getStartTimeLocSch()) << "\n";
			for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
				Duty* d = pairing->getDuty(i);
				cout << "      duty " << "fdp=" << d->getPlanFDP() << endl;
				for (std::size_t j = 0; j < d->getNumSegments(); j++) {
					Segment* s = d->getSegment(j);
					cout << "       seg "
						<< " " << s->getAssignment()
						<< " " << s->getFleetCD()
						<< " " << utcToUtcDtString(s->getStartTimeLocSch())
						<< " " << s->getFlightNumber()
						<< " " << s->getDepSta() << "->" << s->getArrSta()
						<< endl;
				}
			}
		}
		return 0;
	}
	//pairing->setCompositionId(pairingComposition->getCompositionId());
	return pairingComposition->getCompositionId();
}

//计算乘务空保duty所需R5配比
void PairingCompositionCalculator::calculateDutyCompositionForCcAmR5(Duty* d, Composition ** pairingComposition, string division, bool isPrintLog){
	//fleet
	string dutyFleet = "";
	for (std::size_t j = 0; j < d->getNumSegments(); j++) {
		Segment* s = d->getSegment(j);
		if (s->getAssignment() == "DHD" || s->getAssignment() == "BUS" || s->getAssignment() == "PSG" || !s->getIsOperating()) {
			continue;//skip dhd/bus/train
		}
		string fleet = s->getFleetCD();
		if (this->fleetNameMap.find(fleet) == fleetNameMap.end()) {
			if (isPrintLog){
				Logger::getRuleLogger()->error("ERROR: calculate pairing composition(CC/AM) fail, invalid data, fleet={} on flt={} not exists", fleet.c_str(), s->getDBId());
			}
			continue;
		}
		if (dutyFleet == "")
			dutyFleet = fleet;
		else if (fleetNameMap[dutyFleet].displayOrder > fleetNameMap[fleet].displayOrder)
			dutyFleet = fleet;
	}
	//fdp
	//0P#1886 修改读取PlanFDP要除以60.0 PlanFDP是分钟
	double fdp = d->getPlanFDP() / 60.0;
	///TEST
	if (division == "A") {
		printf("");
	}
	//find compName
	string compByDutyFdp = "";
	for (auto& ruleItem : this->rule2030List) {
		string firstFleet = (ruleItem.fleets.size() > 0) ? ruleItem.fleets.begin()->first : ""; //兼容通配符fleet="*"
		if (ruleItem.division == division //OP#1963, 2030同时计算division=C/A
			&& (firstFleet == "*" || firstFleet == "" || ruleItem.fleets.find(dutyFleet) != ruleItem.fleets.end())
			&& fdp <= ruleItem.maxFdp) {
			compByDutyFdp = ruleItem.compositonName;
			break;
		}
	}
	//20181211 ain, mantis#4607, 配比计算增加flt.planComp
	Composition* maxFltComp = NULL;
	for (std::size_t j = 0; j < d->getNumSegments(); j++) {
		Segment * s = d->getSegment(j);
		//long long compId = s->getCompositionId();
		//if (compositionIdMap.find(compId) == compositionIdMap.end())
		//	continue;
		//if (compositionIdMap[compId].getDivision() != division)
		//	continue;
		if (s->getAssignment() == "DHD") {
			continue;//20210722 ain, mantis#9396, DHD seg不参与计算配比
		}
		map<long long, int> compMultiplierMap;
		computeCompIdAndMultiplierFromRankValueForDivision(s->getPlanComposition(), compMultiplierMap, division);
		if (compMultiplierMap.size() != 1) {
			continue; //按FDP匹配过程，只能接受单一 comp_id配比组合，不接受多 comp_id组合
		}
		long long compId = compMultiplierMap.begin()->first;
		if (compMultiplierMap[compId] != 1) {
			continue; //按FDP匹配过程，只能接受单一 comp_id配比直接匹配，不接受按比例放大(multiple > 1)
		}
		if (maxFltComp == NULL || compositionIdMap[compId].getHierarchy() > maxFltComp->getHierarchy())
			maxFltComp = &compositionIdMap[compId];
	}
	//compare pairingComp
	if (this->compositionNameMap.find(compByDutyFdp) != this->compositionNameMap.end()) {
		if ((*pairingComposition) == NULL){
			long long compId = (std::numeric_limits<int>::max)();
			for (auto comp : compositionIdMap){
				if (comp.second.getName() == compByDutyFdp && comp.first < compId){
					compId = comp.first;
					(*pairingComposition) = &compositionNameMap[compByDutyFdp];
				}
			}

		}
		else{
			for (auto comp : compositionIdMap){
				if (comp.second.getName() == compByDutyFdp && (*pairingComposition)->getHierarchy() < comp.second.getHierarchy()){
					(*pairingComposition) = &compositionNameMap[compByDutyFdp];
				}
			}
		}
		//else if (pairingComposition->getHierarchy() < compositionNameMap[compByDutyFdp].getHierarchy())
		//	pairingComposition = &compositionNameMap[compByDutyFdp];
	}
	if (maxFltComp != NULL) {
		if ((*pairingComposition) == NULL || (*pairingComposition)->getHierarchy() < maxFltComp->getHierarchy())
			(*pairingComposition) = maxFltComp;
	}
}

bool PairingCompositionCalculator::setDutyCompositionbyRankForCcAmR5(Duty* d){
	Composition* pairingComposition_C = NULL;
	Composition* pairingComposition_A = NULL;
	calculateDutyCompositionForCcAmR5(d, &pairingComposition_C, "C", false);
	calculateDutyCompositionForCcAmR5(d, &pairingComposition_A,"A", false);
	//pairing->setCompositionId(pairingComposition->getCompositionId());
	//TODO：不太明确配比计算失败后返回值
	if (pairingComposition_C == NULL && pairingComposition_A == NULL)
		return false;

	long long ptnCompId_C = -1;
	long long ptnCompId_A = -1;

	if (pairingComposition_C != NULL)
		ptnCompId_C = pairingComposition_C->getCompositionId();
	if (pairingComposition_A != NULL)
		ptnCompId_A = pairingComposition_A->getCompositionId();

	map<string, int> rankValue;
	//rankValue
	//C
	if (pairingComposition_C != NULL && rankCompositionMap.find(ptnCompId_C) != rankCompositionMap.end()) {
		for (int j = 0; j < rankCompositionMap[ptnCompId_C].rankCount; j++) {
			string rank = rankCompositionMap[ptnCompId_C].rankValue[j].rank;
			int val = rankCompositionMap[ptnCompId_C].rankValue[j].plan_value;
			rankValue[rank] = val;
		}
	}
	//A
	if (pairingComposition_A != NULL && rankCompositionMap.find(ptnCompId_A) != rankCompositionMap.end()) {
		for (int j = 0; j < rankCompositionMap[ptnCompId_A].rankCount; j++) {
			string rank = rankCompositionMap[ptnCompId_A].rankValue[j].rank;
			int val = rankCompositionMap[ptnCompId_A].rankValue[j].plan_value;
			rankValue[rank] = val;
		}
	}
	d->setComplementMap(rankValue);
	return true;
}

int PairingCompositionCalculator::getDutyRestfacility(const Duty* d) {
	bool separateRestFacility = false;//是否按CC或者FD拆分休息设施，true：拆分，false：不拆分
	if (this->systemParamMap != nullptr) {
		auto iterParam = this->systemParamMap->find("SEPARATE_CC_REST_FACILITY");
		if (iterParam != this->systemParamMap->end()) {
			separateRestFacility = (strToUpper(iterParam->second) == "Y");
		}
	}

	int restfacility = 9999;
	for (auto& segment : d->getSegments())
	{
		string tailNumber = segment->getTailNum();
		int ii = 0;
		if (this->fltIdToAircraftMap.find(tailNumber) != this->fltIdToAircraftMap.end()) {
			DBAircraft* aircraft = this->fltIdToAircraftMap[tailNumber].get();
			if (aircraft->isExistRest) {
				if (separateRestFacility && this->division == "C") {
					ii = aircraft->ccRestFacility;
				}
				else {
					ii = aircraft->restFacility;
				}

			}
		}
		else if (this->fleetNameMap.find(segment->getFleetCD()) != this->fleetNameMap.end()) {
			FLEET fleet = this->fleetNameMap[segment->getFleetCD()];
			if (separateRestFacility && this->division == "C") {
				if (fleet.ccRestfacility > ii) {
					ii = fleet.ccRestfacility;
				}
			}
			else {
				if (fleet.restfacility > ii) {
					ii = fleet.restfacility;
				}
			}
		}
		if (ii < restfacility) restfacility = ii;
	}
	return restfacility;
}

void PairingCompositionCalculator::appendCompositionToPairing(Pairing* pairing, long long compId) {

	if (compId != 0) {
		map<string, int> rankValue;
		composition_rank &cr = this->rankCompositionMap[compId];
		for (int i = 0; i < cr.rankCount; i++) {
			string rank = cr.rankValue[i].rank;
			int val = cr.rankValue[i].plan_value;
			pairing->addComplement(rank, val);
		}
	}
}

//从指定配比 rank->value组合识别 compId，eg. <CF=1,PS=2,FA=1,AM=3>, division=A -> compID=19 (3AM)
//未找到则返回0
long long PairingCompositionCalculator::computeCompIdromRankValueForDivision(map<string, int>& rankValue, string division) {
	map<long long, int> compMultiplierMap;
	computeCompIdAndMultiplierFromRankValueForDivision(rankValue, compMultiplierMap, division);

	long long result = 0;
	for (auto& it : compMultiplierMap) {
		long long compId = it.first;
		if (compositionIdMap.find(compId) == compositionIdMap.end()) {
			continue;
		}
		if (compositionIdMap[compId].getDivision() != division) {
			continue;
		}
		result = compId;
		continue;
	}
	return result;//not found
}

//针对单个division rankValueMap计算可用配比 comp_id/multipler组合
//重构配比匹配，分使用单一多rank compositon匹配、使用多个单rank composition匹配两大类
//1 单一多rank composition匹配
//	1 对比目标 rankValue和各个 composition.rankValue
//	2 rank个数相同
//	3 各rank人数可整除
//	4 各rank人数比例一致
//	5 取比例最小者
//2 多个单rank composition匹配
//	1 遍历rank，
//	2 找到单rank composition
//3 举例
//  1 输入 3AM，已有 composition定义 {1AM},{3AM}，匹配{3AM}
//  2 输入 1CAP1FO，已有 composition定义 {1CAP1FO},{1CAP},{1FO}, 匹配{1CAP1FO}
//  3 输入 2CAP2FO, 又有 composition定义 {1CAP1FO},{2CAP,2FO}, 匹配{2CAP2FO} （按按比例最小 multiple=1)
void PairingCompositionCalculator::computeCompIdAndMultiplierFromRankValueForDivision(const map<string, int>& rankValue, map<long long, int>& compMultiplierMap, string division) {
	map<string, int> rankValueOfDivision;
	for (auto& it : rankValue) {
		if (rankDivisionMap[it.first] == division)
			rankValueOfDivision[it.first] = it.second;
	}
	//尝试单comp直接匹配, 按 multiple最小的可能性匹配
	bool foundSingleCompMatch = false;
	long long singleCompId = 0;
	int minMultiple = 0;
	for (auto& it : this->rankCompositionMap) {
		long long compId = it.first;
		composition_rank& comp = it.second;
		if (rankValueOfDivision.size() != comp.rankCount) {
			continue;
		}
		if (comp.division != division) {
			continue;
		}
		int multiple = 0;
		bool match = true;
		for (int i = 0; i < comp.rankCount; i++) {
			string rank = comp.rankValue[i].rank;
			int val = comp.rankValue[i].plan_value;
			//20191012 ain, 增加val==0判断，以适应CA配比定义中可能存在0，形如 comp_id=20 CFx1 PSx0 FAx1 SSx0
			if (val == 0 && rankValueOfDivision[rank] > 0)
			{
				match = false;
				break;
			}
			if (rankValueOfDivision.find(rank) == rankValueOfDivision.end()) {
				match = false; //rank不匹配
				break;
			}
			if (val != 0 && rankValueOfDivision[rank] % val != 0) {
				match = false; //rank数量不能整除
				break;
			}
			if (val != 0 && multiple == 0) {
				multiple = rankValueOfDivision[rank] / val;
			}
			//20180727 ain, manti#3703, 修正错误对比逻辑 rankValue[rank] != rankValue[rank]
			//20190401 ain, rank在两侧都存在，且比例固定
			if (val != 0 && (rankValueOfDivision.find(rank) == rankValueOfDivision.end() || multiple != rankValueOfDivision[rank] / val)) {
				match = false; //rank比例不一致
				break;
			}
		}
		if (match && multiple > 0) {
			//compMultiplierMap[compId] = 1;
			if (singleCompId == 0 || multiple < minMultiple) {
				singleCompId = compId;
				minMultiple = multiple;
			}
			foundSingleCompMatch = true;
		}
	}
	if (foundSingleCompMatch) {
		compMultiplierMap[singleCompId] = minMultiple;
		return;
	}
	//尝试多comp组合
	//CF 1 ， PS 5
	map<string, int> copy = rankValueOfDivision;
	for (auto& it : this->rankCompositionMap) {
		long long compId = it.first;
		composition_rank& comp = it.second;
		string compDivision = comp.division;
		if (division != compDivision) {
			continue;
		}
		if (comp.rankCount == 1 && copy.find(comp.rankValue[0].rank) != copy.end()) {
			string rank = comp.rankValue[0].rank;
			compMultiplierMap[compId] = copy[rank] / comp.rankValue[0].plan_value;
			copy.erase(rank);
		}
	}
}

long long PairingCompositionCalculator::getCompositionByComplements(const map<string, int>& complements) {
	if (ctx.dbData->version < 3) {
		return getCompositionByComplements_v2(complements);
	}

	for (auto& iter : compositionRankOptionsVec) {		
		auto& optionValue = std::get<0>(iter);
		auto compID = std::get<1>(iter);
		//auto optionHierachy = std::get<2>(iter);
		if (complements == optionValue) {
			return compID;
		}		
	}
	return -1;
}

//通过现有的Complements 得到最合适的配比
//1.通过当前rank 找到rank 数量相同的配比 如 1CAP1FO 只能找到 1CAP2FO 或者1CAP1SO 筛选掉1CAP1FO1SO/1CAP
//2.若均匹配上则进入hierarchy找到最适合的配比
long long PairingCompositionCalculator::getCompositionByComplements_v2(const map<string, int>& complements){
	long long compID = -1;
	int hierarchy = 0;
	for (auto& iter : rankCompositionMap){
		if (complements.size() != iter.second.rankCount){
			continue;
		}
		int i;
		for (i = 0; i < iter.second.rankCount; i++){
			if (complements.find(iter.second.rankValue[i].rank) == complements.end()){
				break;
			}
			auto& targetKey = iter.second.rankValue[i].rank;
			auto targetIter = complements.find(targetKey);			
			if (targetIter != complements.end() && iter.second.rankValue[i].plan_value > targetIter->second){
				break;
			}
		}
		if (i >= iter.second.rankCount){
			if (compID == -1){
				compID = iter.first;
				hierarchy = iter.second.hierarchy;
			}
			else if (hierarchy < iter.second.hierarchy){
				compID = iter.first;
				hierarchy = iter.second.hierarchy;
			}
		}
	}
	return compID;
};

static bool isDutyContainFly(Duty* d) {
	if (!d) {
		return false;
	}
	for (std::size_t i = 0; i < d->getNumSegments(); i++){
		if (d->getSegment(i)->getAssignment() == "FLY") {
			return true;
		}
	}
	return false;
}


//从rankCompositionList中找到符合map定义的compositionId
//若未找到，返回-1
long long getCompositionIdByCompMap(unordered_map<long long, composition_rank> &rankCompositionMap, map<string, int> &compMap) {
	long long compId = 0;
	int i = 0;
	int j = 0;
	int m = 0;
	int found = 0;//false;
	std::map<string, int>::iterator it;
	unordered_map<long long, composition_rank>::iterator mapIt;
	long long currentCompId = -1;
	//	int listSize = rankCompositionList.size();

	j = -1;
	//while (i < listSize) {
	for (mapIt = rankCompositionMap.begin(); mapIt != rankCompositionMap.end(); mapIt++) {

		j++;
		i = j;
		//currentCompId = rankCompositionList[i].comp_id;
		compId = mapIt->first;

		//match ?
		//1 是否总rank级别个数相同
		//2 是否rank在对composition中都存在
		//3 是否对应rank级别plan_value值相同
		if (compMap.size() != mapIt->second.rankCount) { //总数相等
			continue;
		}

		int matchCount = 0;                               //计数：对应rank一致，且rankValue相等
		//for (m = i; m < j; m++) {
		int rankCount = mapIt->second.rankCount;
		for (int n = 0; n < rankCount; n++) {
			char * rank = mapIt->second.rankValue[n].rank;//对应rank一致，且rankValue相等
			int    rankValue = mapIt->second.rankValue[n].plan_value;
			it = compMap.find(rank);
			if (it != compMap.end() && it->second == rankValue) {
				matchCount++;
			}
		}

		if (matchCount == rankCount) {                    //检查计数：对应rank一致，且rankValue相等
			found = 1;     //true
			break;
		}
		else  {
			continue;
		}
	}

	if (found)
		return compId;
	else
		return -1;
}

//matis#8869: PO优化需增加法规接口：输入duty返回满足的配比
duty_composition PairingCompositionCalculator::getQualifiedComposition(Duty * d)
{
	duty_composition result;
	long long compId;

	if (division == "P") {
		vector<string> comp3007 = calculatePairingCompositionForPilotR5_3007(d);

		if (comp3007.empty()) {
			return result;
		}
		string compName3007 = comp3007[0];
		string isAugment = comp3007[1];

		string compName3008 = calculatePairingCompositionForPilotR5_3008(d);

		string compName = isLowerHierarchy(compName3007, compName3008) ? compName3007 : compName3008;

		compId = findCompositionByName(compName);
		result.is_augment = isAugment == "Y";

	}
	else {
		Composition* pairingComposition = NULL;
		calculateDutyCompositionForCcAmR5(d, &pairingComposition, division);

		compId = pairingComposition->getCompositionId();
	}
	
	Composition & composition = this->compositionIdMap[compId];

	map<string, int> rankValue;
	for (int j = 0; j < rankCompositionMap[compId].rankCount; j++) {
		string rank = rankCompositionMap[compId].rankValue[j].rank;
		int val = rankCompositionMap[compId].rankValue[j].plan_value;
		rankValue[rank] = val;
	}
	result.compRankValue = rankValue;
	result.compId = compId;

	return result;
}

void PairingCompositionCalculator::setEnableDebugLog(bool value) {
	this->isEnableDebugLog = value; 
}

void PairingCompositionCalculator::getPgMinAndExtraComplement(Pairing*pairing, map<string, int>& rankValueMin, map<string, int>& rankValueMax, vector<map<string, int>>& extraDutyRankValue)
{
	//PO暂时不会组出MVP
	if (pairing->getNumFlySegments() <= 0)
		return ;
	//20190301 ain, MVP/ PSG无需计算配比
	if (pairing->getPrimeActivity() == "MVP" || pairing->getPrimeActivity() == "PSG")
		return ;

	//vector<Pairing*> pgs;
	long long ptnMaxCompId = getCompositionByComplements(pairing->getComplements());
	string pairingMaxCompName = ""; 
	if (ptnMaxCompId != -1)
		pairingMaxCompName = compositionIdMap[ptnMaxCompId].getName();

	long long ptnMinCompId = -1;
	string pairingMinCompName = "";
	//use duty min complment
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		//DHD Ferry Duty跳过
		if (d->getNumFlySegs() <= 0)
			continue;
		long long dtCompId = getCompositionByComplements(d->getComplementMap());
		string dtCompName = "";
		if (dtCompId != -1)
			dtCompName = compositionIdMap[dtCompId].getName();
		else
			return; //无配比的Duty错误

		if (!pairingMinCompName.empty())
			pairingMinCompName = isLowerHierarchy(pairingMinCompName, dtCompName) ? pairingMinCompName : dtCompName;
		else
			pairingMinCompName = dtCompName;
		if (!pairingMaxCompName.empty())
			pairingMaxCompName = isLowerHierarchy(pairingMaxCompName, dtCompName) ? dtCompName : pairingMaxCompName;
		else
			pairingMaxCompName = dtCompName;
	}

	ptnMinCompId = this->findCompositionByName(pairingMinCompName);
	ptnMaxCompId = this->findCompositionByName(pairingMaxCompName);


	//rankValue

	//map<string, int> rankValueMin;
	//map<string, int> rankValueMax;
	if (rankCompositionMap.find(ptnMinCompId) != rankCompositionMap.end()) {

		for (int j = 0; j < rankCompositionMap[ptnMinCompId].rankCount; j++) {
			string rank = rankCompositionMap[ptnMinCompId].rankValue[j].rank;
			int val = rankCompositionMap[ptnMinCompId].rankValue[j].plan_value;
			rankValueMin[rank] = val;
		}
		//pairing->setComplements(rankValueMin);
		//pgs.push_back(pairing);
	}
	if (rankCompositionMap.find(ptnMaxCompId) != rankCompositionMap.end()) {

		for (int j = 0; j < rankCompositionMap[ptnMaxCompId].rankCount; j++) {
			string rank = rankCompositionMap[ptnMaxCompId].rankValue[j].rank;
			int val = rankCompositionMap[ptnMaxCompId].rankValue[j].plan_value;
			rankValueMax[rank] = val;
		}
	}

	vector < map<string, int>> dutyRankValues;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		//DHD Ferry Duty
		if (d->getNumFlySegs() <= 0) {
			dutyRankValues.push_back(rankValueMin);
			continue;
		}
		long long dtCompId = getCompositionByComplements(d->getComplementMap());
		map<string, int> rankValue;
		for (int j = 0; j < rankCompositionMap[dtCompId].rankCount; j++) {
			string rank = rankCompositionMap[dtCompId].rankValue[j].rank;
			int val = rankCompositionMap[dtCompId].rankValue[j].plan_value;
			rankValue[rank] = val;
		}
		dutyRankValues.push_back(rankValue);
	}

	//vector < map<string, int>> extraDutyRankValue;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		auto & dutyRank = dutyRankValues.at(i);
		map<string, int> extraRank;
		for (auto minR : rankValueMin) {
			auto rank = minR.first;
			auto value = minR.second;
			auto rit = dutyRank.find(rank);
			if (rit != dutyRank.end()) {
				int extra = rit->second - value;
				extraRank[rank] = extra;
			}
			else {
				int extra = value;
				extraRank[rank] = extra;
			}
		}
		extraDutyRankValue.push_back(extraRank);
	}
	
}