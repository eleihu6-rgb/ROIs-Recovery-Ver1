#include <iostream>
#include <string>
#include <sstream>
#include "Pairing.h"
#include "CrewDB.h"
#include "UtilFunc.h"
#include "CustomBizInternal.h"
#include "OrLog.h"
#include "Log/Logger.h"
#include "CustomBiz/CustomBiz.h"
#include <algorithm>
#include "Utility.h"

using namespace std;

#define MAX_ERROR_LOG_COUNT 5 //打印错误条数上限, 避免打印太多日志造成ruleSrv卡死拖慢界面

long long calculateSegmentRankCombination(Pairing* pairing,Duty* duty, Segment* segment, CalcRankCombinationCtx& ctx, string division, string assignment, long long rankCombId = 0);
long long calculatePairingRankCombinationForSinglePairing(Pairing* pairing, CalcRankCombinationCtx& ctx);
long long calculatePairingRankCombinationForSinglePairingFor3(Pairing* pairing, CalcRankCombinationCtx& ctx, string pCompositionSouce = "I", bool checkPosition = true);
vector<long long> calculatePairingRankCombinationForPo(Pairing* pairing, CalcRankCombinationCtx& ctx);
vector<long long> calculateSegmentRankCombinationAll(Pairing* pairing, Duty* duty, Segment* segment, CalcRankCombinationCtx& ctx, string division, string assignment, vector<long long> rankCombs);
void calculatePairingOptionsForSinglePairingFor3(Pairing* pairing, CalcRankCombinationCtx& ctx, string pCompositionSource, bool checkPosition);
void calculatiePairingRankCombationErrorLog(Pairing* pairing, CalcRankCombinationCtx& ctx);
vector<int> getSegmentOptions(long long rankCombID, vector<SharedPtr<RosterFlight>> rfs, CalcRankCombinationCtx& ctx, Segment* seg, string division, Pairing* p, string pCompositionSource, bool checkFleet = true);
string getPairingOptions(vector<Segment*> segments, string division);
int getOldSegmentOption(string division, Segment* seg);
string getFleetByFlt(SharedPtr<RosterFlight> rosterFlight, CalcRankCombinationCtx& ctx);
bool checkPositionForOption(vector<SharedPtr<RosterFlight>> rosterFlights, map<string, int> optionComp, vector<RankCombination*> Options, vector<string> ranks, CalcRankCombinationCtx& ctx);
RankCombinationCriteria* getCurrentRankCombinationCriteria(RankCombinationCriteria* rankComb, Pairing* pairing, Duty* duty, Segment* segment, Segment* selectSeg, CalcRankCombinationCtx& ctx, string division, string assignment, long long rankCombId = 0);
map<string, int> getOptionsRankValue(CalcRankCombinationCtx& ctx, RankCombinationCriteria* rankComb);
bool checkSegHasMoreThanTowPairing(Pairing* p, CalcRankCombinationCtx& ctx);

//用匈牙利算法分配号位
int SegOrders[105];//下标x x号位上放了y号人
int Answer[105];//下标y y号人放在了几号位上
bool Match[105][105];
bool Used[105];
bool IsWarn = false;
int Number;
bool Find(std::size_t x) {//第x个crew
	int j;
	for (j = 1; j <= Number; j++) {    //扫描每个crew对应的号位
		if (Match[x][j] == true && Used[j] == false)//如果 可以符合该号位 且未尝试过在该号位上派人
		{
			Used[j] = true;
			//j号位上没有人为-1
			if (SegOrders[j] == -1 || Find(SegOrders[j])) {
				SegOrders[j] = (int)x;
				Answer[x] = j;
				return true;
			}
		}
	}
	return false;
}

//pairingList: 重算搭配目标ptn，需要建立索引
//total: pairingList引用的flt可能已经存在旧有ptn
void makeSegmentToPairingMap(vector<Pairing*>& pairingList, vector<Pairing*>& total, map<long long, vector<Pairing*>>& result) {
	Logger::getRuleLogger()->info("makeSegmentToPairingMap start");
	//20200107 ain, mantis#7451, 问题3, 建立segToPtn索引过程对ptn排重，防止相同pg重复进入同一flt索引
	map<long long, Pairing* > pgMap;
	for (auto& pg : pairingList) {
		long long pid = pg->getDbId();
		if (!pgMap[pid]) {
			pgMap[pid] = pg;
		}
	}
	//汇总pairingList中 flt_id -> ptn
	for (auto& it : pgMap) {
		Pairing* p = it.second;
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				//20181109 ain, mantis#4408, rankComb计算过程忽略DHD
				//20190828 ain, mantis#6565, SBY|TRAINING执行 8091 搭配计算, 只忽略DHD|BUS|PSG
				if (s->getAssignment() == "DHD" || s->getAssignment() == "BUS" || s->getAssignment() == "PSG" || s->getAssignment() == "PSB") {
					continue;
				}
				long long fltId = s->getDBId();
				if (result.find(fltId) == result.end()) {
					result[fltId] = vector<Pairing*>();
				}
				result[fltId].push_back(p);
			}
		}
	}
	//20200105 ain, mantis#7451, flt_id->ptn索引增加旧有ptn部分
	for (Pairing* pg : total) {
		if (pgMap.find(pg->getDbId()) != pgMap.end()) {
			continue;//排重
		}
		for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
			Duty* d = pg->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				long long fltId = s->getDBId();
				if (fltId == 0) {
					continue;
				}
				if (result.find(fltId) == result.end()) {
					continue;
				}
				result[fltId].push_back(pg);
			}
		}
	}

	Logger::getRuleLogger()->info("makeSegmentToPairingMap end");
}


//for all pairings
void calculatePairingRankCombination_common(vector<Pairing*>& pairingList, CrewDataContext* dbData) {
	Logger::getRuleLogger()->debug("calc pairing.rank-combination start size={}", pairingList.size());

	CalcRankCombinationCtx ctx;
	
	ctx.dbData = dbData;
	makeSegmentToPairingMap(pairingList, dbData->pairingList, ctx.segToPairing);
	
	for (auto& f : dbData->flightList) {
		ctx.fltIdMap[f->getDBId()] = f.get();
	}

	string pCompositionSource = "I";
	bool checkFleet = true;
	vector<string> ignoreFlightAssignments{};
	auto& rules = dbData->getRuleFunctions(8091);
	string header, headeValue;
	for (auto & rule : rules) {
		for (auto iter = rule.params.begin(); iter != rule.params.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

			if (header == "COMPOSITION SOURCE") {
				pCompositionSource = headeValue;
				break;
			}
			if (header == "CHECK POSITION") {
				checkFleet = headeValue == "Y";
			}
		}
	}

	int  count = 0;
	for (auto& p : pairingList) {
		if (dbData->version == 2) {
			calculatePairingRankCombinationForSinglePairing(p, ctx);
			count++;
			if (count % 1000 == 0) {
				Logger::getRuleLogger()->info("calc ptn.rankComb count={}", count);
			}
		}
		else if (dbData->version == 3) {
			calculatePairingRankCombinationForSinglePairingFor3(p, ctx, pCompositionSource, checkFleet);
			count++;
			if (count % 1000 == 0) {
				Logger::getRuleLogger()->info("calc ptn.rankComb count={}", count);
			}
		}
		
	}
	if (dbData->version == 3) {
		fixSplitPairingRankCombinationId(pairingList, dbData);
	}
}

void fixSplitPairingRankCombinationId(vector<Pairing*>& pairingList, CrewDataContext* dbData) {
	// 横切任务环时，当横切的环删除一个航班，导致两个环的配比不同
	// 修正当一个航班处于多个任务环时，统计所有环上的配比，选择优先级低的，即pri大的	
	map<long long, Pairing* > pgMap;
	for (auto& pg : pairingList) {
		long long pid = pg->getDbId();
		if (!pgMap[pid]) {
			pgMap[pid] = pg;
		}
	}
	for (auto& p : pairingList) {
		long long combId = 0;
		string options;
		for (auto& division : dbData->scenario.divisionConstruction) {
			if (division == "P") {
				combId = p->getRankCombCP();
				options = p->getRankCombOP();
			}
			else if (division == "C") {
				combId = p->getRankCombCC();
				options = p->getRankCombOC();
			}
			else if (division == "A") {
				combId = p->getRankCombCA();
				options = p->getRankCombOA();
			}
			else
				continue;
			if (combId == 0)
				continue;

			for (auto& s : p->getSegments()) {
				// 只考虑处于多个环的情况
				if (dbData->flightIdToPairing.find(s->getDBId()) == dbData->flightIdToPairing.end() || dbData->flightIdToPairing[s->getDBId()].size() <= 1)
					continue;
				for (auto& pairingId : dbData->flightIdToPairing[s->getDBId()]) {
					if (pairingId == p->getDbId())
						continue;

					if (!dbData->pairingIdMap[pairingId])
						continue;

					auto & pairing = dbData->pairingIdMap[pairingId];
					if (pgMap.find(pairingId) != pgMap.end())
						pairing = pgMap[pairingId];

					long long otherCombId = 0;
					string otherOptions;
					if (division == "P") {
						otherCombId = pairing->getRankCombCP();
						otherOptions = pairing->getRankCombOP();
					}
					else if (division == "C") {
						otherCombId = pairing->getRankCombCC();
						otherOptions = pairing->getRankCombOC();
					}
					else if (division == "A") {
						otherCombId = pairing->getRankCombCA();
						otherOptions = pairing->getRankCombOA();
					}
					else
						continue;
					if (otherCombId == 0)
						continue;

					if (combId == 0 || dbData->rankCombinationCriteriaMap[combId]->pri < dbData->rankCombinationCriteriaMap[otherCombId]->pri) {
						combId = otherCombId;
						options = otherOptions;
					}
					
				}
			}

			if (combId != 0) {
				if (division == "P") {
					p->setRankCombCP(combId);
					p->setRankCombOP(options);
					for (auto& s : p->getSegments()) {
						s->setRankCombCP(combId);
						s->setRankCombOP(options);
					}
				}
				else if (division == "C") {
					p->setRankCombCC(combId);
					p->setRankCombOC(options);
					for (auto& s : p->getSegments()) {
						s->setRankCombCC(combId);
						s->setRankCombOC(options);
					}
				}
				else if (division == "A") {
					p->setRankCombCA(combId);
					p->setRankCombOA(options);
					for (auto& s : p->getSegments()) {
						s->setRankCombCA(combId);
						s->setRankCombOA(options);
					}
				}
			}
		}
	}
}

void calculatePairingOptions_common(vector<Pairing*>& pairingList, CrewDataContext* dbData) {
	CalcRankCombinationCtx ctx;

	ctx.dbData = dbData;
	makeSegmentToPairingMap(pairingList, dbData->pairingList, ctx.segToPairing);

	auto& rules = dbData->getRuleFunctions(8091);
	string pCompositionSource = "I";
	string header, headeValue;
	bool checkPosition = true;
	for (auto & rule : rules) {
		for (auto iter = rule.params.begin(); iter != rule.params.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

			if (header == "COMPOSITION SOURCE") {
				pCompositionSource = headeValue;
				break;
			}
			if (header == "CHECK POSITION") {
				checkPosition = headeValue == "Y";
			}
		}
	}

	for (auto& p : pairingList) {
		calculatePairingOptionsForSinglePairingFor3(p, ctx, pCompositionSource, checkPosition);
	}
}

void calculatePairingOptionByComposition_common(vector<Pairing*>& pairingList, CrewDataContext* dbData) {
	map<string, int> compMap;
	map<string, int> rankCombNums;
	map<int, vector<RankCombination*>>  Options;
	for (auto& p : pairingList) {
		compMap.clear();
		map<string, int>::iterator iter;
		map<string, int>::iterator comp;
		map<int, vector<RankCombination*>>::iterator op;

		map<string, int> map = p->getComplements();

		for (iter = map.begin(); iter != map.end(); iter++) {
			if (dbData->rankMap[iter->first].isMustCrewRank && iter->second > 0) {
				if (compMap[iter->first]) {
					compMap[iter->first] = compMap[iter->first] + iter->second;
				}
				else {
					compMap[iter->first] = iter->second;
				}
			}
		}
		long long combId = 0;
		for (const auto& division : dbData->scenario.divisionConstruction) {
			rankCombNums.clear();
			Options.clear();
			vector<int> fixOptions;
			if (division == "P")
				combId = p->getRankCombCP();
			else if (division == "C")
				combId = p->getRankCombCC();
			else if (division == "A")
				combId = p->getRankCombCA();

			if (combId == 0)
				continue;
			const auto& options = dbData->rankCombinationMap[combId];
			// 拆分方案
			
			for (std::size_t i = 0; i < options.size(); i++) {

				Options[options[i]->options].push_back(options[i].get());
			}
			
			for (op = Options.begin(); op != Options.end(); op++) {
				for (std::size_t i = 0; i < op->second.size(); i++) {
					if (op->second[i]->positions == "" || op->second[i]->positions.empty()) continue;
					if (rankCombNums[op->second[i]->rank]) {

						rankCombNums[op->second[i]->rank] = rankCombNums[op->second[i]->rank] + 1;
					}
					else {
						rankCombNums[op->second[i]->rank] = 1;
					}
				}
				bool fix = true;
				for (comp = compMap.begin(); comp != compMap.end(); comp++) {
					if (dbData->rankMap[comp->first].division == division && rankCombNums.find(comp->first) == rankCombNums.end()) {
						fix = false;
						break;
					}

					if (rankCombNums.find(comp->first) != rankCombNums.end()) {
						if (rankCombNums[comp->first] != comp->second) {
							fix = false;
							break;
						}
					}
				}
				if (fix) {
					fixOptions.push_back(op->first);
				}
			}
			if (fixOptions.size() > 0) {
				if (division == "P") p->setRankCombOP(joinIntList(fixOptions, ","));
				if (division == "C") p->setRankCombOC(joinIntList(fixOptions, ","));
				if (division == "A") p->setRankCombOA(joinIntList(fixOptions, ","));
			}
		}
	}

}

//计算pairing.rankCombID, 若未找到匹配则返回 0
long long calculatePairingRankCombination_common(Pairing* pairing, CrewDataContext* dbData) {
	//RankCombinationCriteria * pairingRankComb = NULL;
	CalcRankCombinationCtx ctx;
	ctx.dbData = dbData;

	vector<Pairing*> pairingList;

	for (auto& f : dbData->flightList) {
		ctx.fltIdMap[f->getDBId()] = f.get();
	}

	//make set -> pairing
	pairingList.push_back(pairing);
	makeSegmentToPairingMap(pairingList, dbData->pairingList, ctx.segToPairing);

	return calculatePairingRankCombinationForSinglePairing(pairing, ctx);
}


long long calculatePairingRankCombinationForSinglePairing(Pairing* pairing, CalcRankCombinationCtx& ctx) {

	RankCombinationCriteria * pairingRankComb = NULL;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* seg = d->getSegment(j);
			if (seg->getAssignment() == "PSG" || seg->getAssignment() == "PSB" || seg->getAssignment() == "DHD" || seg->getAssignment() == "BUS") {
				continue;//mantis#4408, rankComb忽略dhd
			}
			long long rankCombID = calculateSegmentRankCombination(pairing, d, seg, ctx, "*", d->getAssignment());
			if (rankCombID != 0) {
				auto& segmentRankComb = ctx.dbData->rankCombinationCriteriaMap[rankCombID];
				if (pairingRankComb == NULL || segmentRankComb->pri < pairingRankComb->pri)
					pairingRankComb = segmentRankComb.get();
			}
		}
	}
	if (pairingRankComb != NULL) {
		pairing->setRankCombCriteriaId(pairingRankComb->id);
		return pairingRankComb->id;
	}
	else {
		calculatiePairingRankCombationErrorLog(pairing, ctx);
		pairing->setRankCombCriteriaId(0);//mantis#4408, 找不到匹配则rankComb=0
		return 0; //找不到匹配则返回 rankComb=0
	}
}

long long calculatePairingRankCombinationForSinglePairingFor3(Pairing* pairing, CalcRankCombinationCtx& ctx, string pCompositionSouce, bool checkPosition) {
	
	RankCombinationCriteria * pairingRankCombP = NULL;
 	RankCombinationCriteria * pairingRankCombC = NULL;
	RankCombinationCriteria * pairingRankCombA = NULL;
	Segment * selectSeg = NULL;
	bool noFound = false;

	//场景1：整个Pairing是乘机任务PSG、PSB、MVP等特殊任务的配比计算
	if ((pairing->getPrimeActivity() == "PSG" || pairing->getPrimeActivity() == "PSB" || pairing->getPrimeActivity() == "MVP" || pairing->getPrimeActivity() == "TRAINING") && pairing->getComplements().size() == 0) {
		map<long long, SharedPtr<RankCombinationCriteria>> rankCombMap = ctx.dbData->rankCombinationCriteriaMap;
		map<long long, SharedPtr<RankCombinationCriteria>>::iterator iter;
		for (iter = rankCombMap.begin(); iter != rankCombMap.end(); iter++) {
			for (auto& division : ctx.dbData->scenario.divisionConstruction) {
				if (division == iter->second->division) {
					vector<string> assignments;
					split(iter->second->assignment, '|', assignments);
					if (assignments.end() != find(assignments.begin(), assignments.end(), pairing->getPrimeActivity())) {
						vector<SharedPtr<RankCombination>>& rankCombs = ctx.dbData->rankCombinationMap[iter->first];
						set<int> r;
						for (std::size_t i = 0; i < rankCombs.size(); i++) {
							r.insert(rankCombs[i]->options);
						}
						vector<int> rb{ r.begin(), r.end() };
						if (division == "P") {
							if (pairingRankCombP == NULL || pairingRankCombP->pri > iter->second->pri) {
								pairing->setRankCombCP(iter->first);
								pairing->setRankCombOP(joinIntList(rb, ","));
								pairingRankCombP = iter->second.get();
							}
							
						}
						if (division == "C") {
							if (pairingRankCombC == NULL || pairingRankCombC->pri > iter->second->pri) {
								pairing->setRankCombCC(iter->first);
								pairing->setRankCombOC(joinIntList(rb, ","));
								pairingRankCombC = iter->second.get();
							}
						}
						if (division == "A") {
							if (pairingRankCombA == NULL || pairingRankCombA->pri > iter->second->pri) {
								pairing->setRankCombCA(iter->first);
								pairing->setRankCombOA(joinIntList(rb, ","));
								pairingRankCombA = iter->second.get();
							}
						}
					}
				}
			}
		}
		return 0;
	}

	//场景2：一般情况下Pairing和Segment配比计算
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* seg = d->getSegment(j);
			if (seg->getDutyId() == 0) {
				seg->setDutyId(d->getDutyId());
			}

			//Pairing中segment若是乘机任务PSG、置位DHD等特殊任务，不计算配比
			if (seg->getAssignment() == "PSG" || seg->getAssignment() == "PSB" || seg->getAssignment() == "DHD" || seg->getAssignment() == "BUS" || seg->getAssignment() == "TRAIN" || seg->getAssignment() == "HSR") {
				continue;//mantis#4408, rankComb忽略dhd
			}

			//按部门division计算配比
			for (auto& division : ctx.dbData->scenario.divisionConstruction) {
				if (pairing->getDivision() != division)
					continue;
				long long rankCombID = calculateSegmentRankCombination(pairing, d, seg, ctx, division, d->getAssignment(),0);
				if (rankCombID != 0) {
					//通过Segment配比，来计算Pairing的配比（Pairing配比从segment配比中筛选出来，并能满足该Pairing下所有Segment配比要求）
					//auto& segmentRankComb = ctx.dbData->rankCombinationCriteriaMap[rankCombID];
					if (division == "P") {
						if (pairingRankCombP != NULL && ctx.dbData->rankCombinationCriteriaMap[rankCombID]->pri > pairingRankCombP->pri) {
							rankCombID = pairingRankCombP->id;
							//segmentRankComb = ctx.dbData->rankCombinationCriteriaMap[rankCombID];
						}
						RankCombinationCriteria * newPairingRankCombP = getCurrentRankCombinationCriteria(pairingRankCombP, pairing, d, seg, selectSeg, ctx, division, d->getAssignment(), rankCombID);
						if (newPairingRankCombP == NULL) {
							pairingRankCombP = NULL;
							noFound = true;
						}
						if (pairingRankCombP == NULL || (newPairingRankCombP != NULL && newPairingRankCombP->id != pairingRankCombP->id)) {
							selectSeg = seg;
							pairingRankCombP = newPairingRankCombP;
						}
					}
					if (division == "C") {
						/*pairingRankCombC = segmentRankComb.get();
						selectSeg = seg;*/
						if (pairingRankCombC != NULL && ctx.dbData->rankCombinationCriteriaMap[rankCombID]->pri > pairingRankCombC->pri) {
							rankCombID = pairingRankCombC->id;
							//segmentRankComb = ctx.dbData->rankCombinationCriteriaMap[rankCombID];
						}
						RankCombinationCriteria * newPairingRankCombC = getCurrentRankCombinationCriteria(pairingRankCombC, pairing, d, seg, selectSeg, ctx, division, d->getAssignment(), rankCombID);
						if (newPairingRankCombC == NULL) {
							noFound = true;
						}
						if (pairingRankCombC == NULL || (newPairingRankCombC != NULL && newPairingRankCombC->id != pairingRankCombC->id)) {
							selectSeg = seg;
							pairingRankCombC = newPairingRankCombC;
						}
						
						
						
					}
						
					if (division == "A") {
						if (pairingRankCombA != NULL && ctx.dbData->rankCombinationCriteriaMap[rankCombID]->pri > pairingRankCombA->pri) {
							rankCombID = pairingRankCombA->id;
							//segmentRankComb = ctx.dbData->rankCombinationCriteriaMap[rankCombID];
						}
						RankCombinationCriteria * newPairingRankCombA = getCurrentRankCombinationCriteria(pairingRankCombA, pairing, d, seg, selectSeg, ctx, division, d->getAssignment(), rankCombID);
						if (newPairingRankCombA == NULL) {
							noFound = true;
						}
						if (pairingRankCombA == NULL || (newPairingRankCombA != NULL && newPairingRankCombA->id != pairingRankCombA->id)) {
							selectSeg = seg;
							pairingRankCombA = newPairingRankCombA;
						}

						
					}
					vector<SharedPtr<RosterFlight>> rfs = ctx.dbData->rosterFlightMgr.get(seg->getDBId());
					
					vector<SharedPtr<RosterFlight>> filterRosterFlights;
					for (const auto & rf : rfs) {
						if (rf->division == division)
							filterRosterFlights.push_back(rf);
					}
					
					vector<int> segOptions = getSegmentOptions(rankCombID, filterRosterFlights, ctx, seg, division, pairing, pCompositionSouce, checkPosition);
					if (segOptions.size() == 0) { 
						calculatiePairingRankCombationErrorLog(pairing, ctx); 
						if (division == "P") pairingRankCombP = NULL;
						if (division == "C") pairingRankCombC = NULL;
						if (division == "A") pairingRankCombA = NULL;
					}
					if (division == "P") seg->setRankCombOP(joinIntList(segOptions, ","));
					if (division == "C") seg->setRankCombOC(joinIntList(segOptions, ","));
					if (division == "A") seg->setRankCombOA(joinIntList(segOptions, ","));
				}
			}
		}
	}
	
	if (!noFound && (pairingRankCombP != NULL || pairingRankCombC != NULL || pairingRankCombA != NULL)) {
		//Pairing匹配到配比，则设置搭配方案等字段
		vector<Segment*> segments = pairing->getSegments();
		for (auto& division : ctx.dbData->scenario.divisionConstruction)
		{
			if (division == "P") {
				pairing->setRankCombOP(getPairingOptions(segments, division));
				// for PO
				pairing->setRankCombRankValueP(getOptionsRankValue(ctx, pairingRankCombP));
				// 默认赋值搭配的第一个方案
				pairing->setComplements(getOptionsRankValue(ctx, pairingRankCombP));
			};
			if (division == "C") { 
				pairing->setRankCombOC(getPairingOptions(segments, division));
				pairing->setRankCombRankValueC(getOptionsRankValue(ctx, pairingRankCombC));
				pairing->setComplements(getOptionsRankValue(ctx, pairingRankCombC));
			};
			if (division == "A") {
				pairing->setRankCombOA(getPairingOptions(segments, division));
				pairing->setRankCombRankValueA(getOptionsRankValue(ctx, pairingRankCombA));
				pairing->setComplements(getOptionsRankValue(ctx, pairingRankCombA));
			}
		}
		pairing->setRankCombCP(pairingRankCombP == NULL ? 0 : pairing->getRankCombOP() == "" ? 0 : pairingRankCombP->id);
		pairing->setRankCombCC(pairingRankCombC == NULL ? 0 : pairing->getRankCombOC() == "" ? 0 : pairingRankCombC->id);
		pairing->setRankCombCA(pairingRankCombA == NULL ? 0 : pairing->getRankCombOA() == "" ? 0 : pairingRankCombA->id);
		for (auto& seg : pairing->getSegments()) {
			seg->setRankCombCP(pairing->getRankCombCP());
			seg->setRankCombCC(pairing->getRankCombCC());
			seg->setRankCombCA(pairing->getRankCombCA());
			seg->setRankCombOP(pairing->getRankCombOP());
			seg->setRankCombOC(pairing->getRankCombOC());
			seg->setRankCombOA(pairing->getRankCombOA());
		}
		return 0;
	}
	else if (pairing->getPrimeActivity() == "PSG" || pairing->getPrimeActivity() == "PSB" || pairing->getPrimeActivity() == "MVP") {
		//特殊场景：整个Pairing是乘机任务PSG、PSB、MVP等特殊任务，恢复默认Options
		for (auto& division : ctx.dbData->scenario.divisionConstruction) {
			if (pairing->getDivision() != division)
				continue;
			long long rankCombId = 0;
			if (division == "P") {
				rankCombId = pairing->getRankCombCP();
			}
			else if (division == "C") {
				rankCombId = pairing->getRankCombCC();
			}
			else if (division == "A") {
				rankCombId = pairing->getRankCombCA();
			}

			vector<SharedPtr<RankCombination>>& rankCombs = ctx.dbData->rankCombinationMap[rankCombId];
			set<int> r;
			for (std::size_t i = 0; i < rankCombs.size(); i++) {
				r.insert(rankCombs[i]->options);
			}
			vector<int> rb{ r.begin(), r.end() };

			if (division == "P") {
				pairing->setRankCombOP(joinIntList(rb, ","));
			}
			else if (division == "C") {
				pairing->setRankCombOC(joinIntList(rb, ","));
			}
			else if (division == "A") {
				pairing->setRankCombOA(joinIntList(rb, ","));
			}
		}
		return 0;
	}
	else {
		bool has = false;
		if (ctx.dbData->version == 3) {
			//has = checkSegHasMoreThanTowPairing(pairing, ctx);
		}
		if (!has) {
			calculatiePairingRankCombationErrorLog(pairing, ctx);
			pairing->setRankCombCP(0);//mantis#4408, 找不到匹配则rankComb=0
			pairing->setRankCombCC(0);//mantis#4408, 找不到匹配则rankComb=0
			pairing->setRankCombCA(0);//mantis#4408, 找不到匹配则rankComb=0
			pairing->setRankCombCriteriaId(0);//mantis#4408, 找不到匹配则rankComb=0
			for (auto& s : pairing->getSegments()) {
				for (auto& division : ctx.dbData->scenario.divisionConstruction) {
					if (division == "P") s->setRankCombCP(0);
					if (division == "C") s->setRankCombCC(0);
					if (division == "A") s->setRankCombCA(0);
				}
			}
			return 0; //找不到匹配则返回 rankComb=0
		}
		
	}
	return 0;
}

// 3.0 po 计算所有符合的搭配定义ID
vector<long long> calculatePairingRankCombinationForPo(Pairing* pairing, CalcRankCombinationCtx& ctx) {
	vector<long long> result;
	for (auto& it : ctx.dbData->rankCombinationCriteriaMap) {
		auto& rankComb = it.second;
		result.push_back(rankComb->id);
	}

	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* seg = d->getSegment(j);
			if (seg->getDutyId() == 0) {
				seg->setDutyId(d->getDutyId());
			}
			if (seg->getAssignment() == "PSG" || seg->getAssignment() == "PSB" || seg->getAssignment() == "DHD"
				|| seg->getAssignment() == "BUS" || seg->getAssignment() == "TRAIN") {
				continue;//mantis#4408, rankComb忽略dhd
			}
			for (auto& division : ctx.dbData->scenario.divisionConstruction) {
				result = calculateSegmentRankCombinationAll(pairing, d, seg, ctx, division, d->getAssignment(), result);
				
			}
		}
	}
	return result;
}

void calculatePairingOptionsForSinglePairingFor3(Pairing* pairing, CalcRankCombinationCtx& ctx, string pCompositionSource, bool checkPosition) {
	if (pairing->getPrimeActivity() == "PSG" || pairing->getPrimeActivity() == "PSB" || pairing->getPrimeActivity() == "MVP" || pairing->getPrimeActivity() == "TRAINING") {
		return;
	}
	for (auto& division : ctx.dbData->scenario.divisionConstruction) {
		if (pairing->getDivision() != division)
			continue;
		long long rankCombID = 0;
		if (division == "P") rankCombID = pairing->getRankCombCP();
		if (division == "C") rankCombID = pairing->getRankCombCC();
		if (division == "A") rankCombID = pairing->getRankCombCA();
		if (rankCombID == 0) continue;
		RankCombinationCriteria* rankCombination = nullptr;
		if (ctx.dbData->rankCombinationCriteriaMap.find(rankCombID) != ctx.dbData->rankCombinationCriteriaMap.end()) {
			rankCombination = ctx.dbData->rankCombinationCriteriaMap[rankCombID].get();
		}
		
		for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
			Duty * d = pairing->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* seg = d->getSegment(j);
				if (seg->getAssignment() == "PSG" || seg->getAssignment() == "PSB" || seg->getAssignment() == "DHD" || seg->getAssignment() == "BUS" || seg->getAssignment() == "TVL" || seg->getAssignment() == "TRAIN" || seg->getAssignment() == "HSR") {
					continue;//mantis#4408, rankComb忽略dhd
				}

				vector<SharedPtr<RosterFlight>> rfs = ctx.dbData->rosterFlightMgr.get(seg->getDBId());
				//vector<string> rfRanks;
				//for (auto rf : rfs) {
				//	// 过滤乘机任务
				//	if (rf->assignment == "PSG" || rf->assignment == "DHD" || rf->assignment == "BUG" || rf->assignment == "TVL") continue;
				//	string rank = rf->actingRank;
				//	// 增加非必须成员岗位过滤
				//	if (ctx.dbData->rankMap[rank].isMustCrewRank) {
				//		rfRanks.push_back(rf->actingRank);
				//	}
				//}


				vector<int> segOptions = getSegmentOptions(rankCombID, rfs, ctx, seg, division, pairing, pCompositionSource, checkPosition);
				if (segOptions.size() == 0) {
					if (division == "P") seg->setRankCombCP(0);
					if (division == "C") seg->setRankCombCC(0);
					if (division == "A") seg->setRankCombCA(0);
				}
				if (division == "P") seg->setRankCombOP(joinIntList(segOptions, ","));
				if (division == "C") seg->setRankCombOC(joinIntList(segOptions, ","));
				if (division == "A") seg->setRankCombOA(joinIntList(segOptions, ","));

			}
		}
		vector<Segment*> segments = pairing->getSegments();
		string options = "";
		if (division == "P") {
			options = getPairingOptions(segments, division);
			pairing->setRankCombOP(options);
			if (options == "") pairing->setRankCombCP(0);
			// for PO
			if (pairing->getComplements().empty())
				pairing->setRankCombRankValueP(getOptionsRankValue(ctx, rankCombination));
		};
		if (division == "C") {
			options = getPairingOptions(segments, division);
			pairing->setRankCombOC(options);
			if (options == "") pairing->setRankCombCC(0);
			if (pairing->getComplements().empty())
				pairing->setRankCombRankValueC(getOptionsRankValue(ctx, rankCombination));
		};
		if (division == "A") {
			options = getPairingOptions(segments, division);
			pairing->setRankCombOA(options);
			if (options == "") pairing->setRankCombCA(0);
			if (pairing->getComplements().empty())
				pairing->setRankCombRankValueA(getOptionsRankValue(ctx, rankCombination));
		}
	}

}

bool checkSegHasMoreThanTowPairing(Pairing* p, CalcRankCombinationCtx& ctx) {
	bool has = false;
	for (auto& seg : p->getSegments()) {
		if (ctx.segToPairing[seg->getDBId()].size() > 1) {
			for (auto& other : ctx.segToPairing[seg->getDBId()]) {
				if (other->getDbId() != p->getDbId()) {
					// 如果两个pairing的segment完全一样 则不赋值
					if (other->getSegments().size() == p->getSegments().size()) {
						vector<long long> segIds;
						vector<long long> otherIds;
						for (auto& seg : p->getSegments()) segIds.push_back(seg->getDBId());
						for (auto& seg : other->getSegments()) otherIds.push_back(seg->getDBId());
						if (segIds == otherIds) return has;
					}
					for (auto division : ctx.dbData->scenario.divisionConstruction) {
						if (division == "P" && other->getRankCombCP() != 0) {
							if (other->getRankCombCP() == p->getRankCombCP()) {
								continue;
							}
							p->setRankCombCP(other->getRankCombCP());
							p->setRankCombOP(other->getFirstSegment()->getRankCombOP());
							has = true;
						}
						if (division == "C" && other->getRankCombCC() != 0) {
							if (other->getRankCombCC() == p->getRankCombCC()) {
								continue;
							}
							p->setRankCombCC(other->getRankCombCC());
							p->setRankCombOC(other->getFirstSegment()->getRankCombOC());
							has = true;
						}
						if (division == "A" && other->getRankCombCA() != 0) {
							if (other->getRankCombCA() == p->getRankCombCA()) {
								continue;
							}
							p->setRankCombCA(other->getRankCombCA());
							p->setRankCombOA(other->getFirstSegment()->getRankCombOA());
							has = true;
						}
					}
				}
			}
		}
	}
	return has;
}

map<string, int> getOptionsRankValue(CalcRankCombinationCtx& ctx, RankCombinationCriteria* rankComb) {
	map<string, int> rankValue;
	if (rankComb == NULL) {
		return rankValue;
	}
	vector<SharedPtr<RankCombination>>& rankCombs = ctx.dbData->rankCombinationMap[rankComb->id];
	for (std::size_t i = 0; i < rankCombs.size(); i++) {
		if (rankCombs[i]->options == 1 && rankCombs[i]->positions != "") {
			if (rankValue[rankCombs[i]->rank]) {
				rankValue[rankCombs[i]->rank]++;
			}
			else {
				rankValue[rankCombs[i]->rank] = 1;
			}
		}
	}
	return rankValue;
	
}

RankCombinationCriteria* getCurrentRankCombinationCriteria(RankCombinationCriteria* rankComb, Pairing* pairing, Duty* duty, Segment* segment, Segment* selectSeg, CalcRankCombinationCtx& ctx, string division, string assignment, long long rankCombId) {
	auto& segmentRankComb = ctx.dbData->rankCombinationCriteriaMap[rankCombId];
	if (rankComb) {
		vector<string> fleets;
		split(rankComb->fleets, '|', fleets);
		if (fleets.end() == find(fleets.begin(), fleets.end(), segment->getFleetCD()) && fleets.end() == find(fleets.begin(), fleets.end(), "*")) {
			while (rankCombId != 0 && rankComb->crewNum != ctx.dbData->rankCombinationCriteriaMap[rankCombId]->crewNum) {

				if (rankComb->crewNum < ctx.dbData->rankCombinationCriteriaMap[rankCombId]->crewNum) {
					long long newRankCombId = calculateSegmentRankCombination(pairing, duty, selectSeg, ctx, division, assignment, rankComb->id);
					if (newRankCombId == 0) {
						rankCombId = 0;
						break;
					};
					rankComb = ctx.dbData->rankCombinationCriteriaMap[newRankCombId].get();
				}
				else {
					rankCombId = calculateSegmentRankCombination(pairing, duty, segment, ctx, division, assignment, rankCombId);
				}
			}
			if (rankCombId == 0) {
				return NULL;
			}
			if (rankCombId != 0 && rankComb->pri > ctx.dbData->rankCombinationCriteriaMap[rankCombId]->pri) {
				rankComb = ctx.dbData->rankCombinationCriteriaMap[rankCombId].get();
			}

		}
		else if (segmentRankComb->pri < rankComb->pri) {
			rankComb = segmentRankComb.get();
			selectSeg = segment;
		}
	}
	else {
		rankComb = segmentRankComb.get();
	}
	return rankComb;
}

string getPairingOptions(vector<Segment*> segments, string division) {
	if (segments.size() > 1) {
		vector<long long> result;
		vector<vector<string>> rankCombOptions;
		for (auto& segment : segments) {
			if (segment->getAssignment() == "PSG" || segment->getAssignment() == "PSB" || segment->getAssignment() == "DHD" || segment->getAssignment() == "BUS"
				|| segment->getAssignment() == "TRAIN" || segment->getAssignment() == "TVL" || segment->getAssignment() == "HSR") {
				continue;
			}
			vector<string> rco;
			if (division == "P") {
				split(segment->getRankCombOP(), ',', rco);
			}
			else if (division == "C") {
				split(segment->getRankCombOC(), ',', rco);
			}
			else if (division == "A") {
				split(segment->getRankCombOA(), ',', rco);
			}
			if (rco.size() == 1 && rco[0] == "") {
				return "";
			}
			rankCombOptions.push_back(rco);
		}
		vector<string> id_instersection;
		if (rankCombOptions.size() > 1) {
			id_instersection = rankCombOptions[0];
			for (std::size_t i = 1; i < rankCombOptions.size(); i++) {
				if (id_instersection.size() == 0) {
					break;
				}
				vector<string> opt;
				vector<string> seg = rankCombOptions[i];
				std::stable_sort(id_instersection.begin(), id_instersection.end());
				std::stable_sort(seg.begin(), seg.end());
				std::set_union(id_instersection.begin(), id_instersection.end(), seg.begin(), seg.end(), back_inserter(opt));
				id_instersection = opt;
			}
		}
		else if (rankCombOptions.size() == 1) {
			id_instersection = rankCombOptions[0];
		}
		for (auto id : id_instersection) {
			result.push_back(atoll(id.c_str()));
		}
		sort(result.begin(), result.end());
		return joinIntList(result, ",");
	}
	else if (segments.size() == 1) {
		if (division == "P") return segments[0]->getRankCombOP();
		if (division == "C") return segments[0]->getRankCombOC();
		if (division == "A") return segments[0]->getRankCombOA();
	}
	return "";
}

// 寻找适合的方案，并返回option id集
vector<int> getSegmentOptions(long long rankCombID, vector<SharedPtr<RosterFlight>> rfs, CalcRankCombinationCtx& ctx, Segment* seg, string division, Pairing* p, string pCompositionSource, bool checkFleet) {
	
	vector<SharedPtr<RankCombination>>& rankCombs = ctx.dbData->rankCombinationMap[rankCombID];
	vector<int> fixOptions;
	map<string, int> rfRankNums;
	vector<SharedPtr<RosterFlight>> rosterFlights;
	// 获取rosterFlight的所有级别以及数量
	for (auto rf : rfs) {
		// 过滤乘机任务
		if (rf->assignment == "PSG" || rf->assignment == "PSB" || rf->assignment == "DHD" || rf->assignment == "BUG" || rf->assignment == "TRAIN" || rf->assignment == "HSR") continue;
		string rank = rf->actingRank;
		// 增加非必须成员岗位过滤
		if (ctx.dbData->rankMap[rank].isMustCrewRank && ctx.dbData->rankMap[rank].division == division) {
			rosterFlights.push_back(rf);
			if (rfRankNums[rank]) {
				rfRankNums[rank] = rfRankNums[rank] + 1;
			}
			else {
				rfRankNums[rank] = 1;
			}
		}
	}
	vector<Pairing*> pairings = ctx.segToPairing[seg->getDBId()];
	vector<Segment*> segment;
	map<string, int> segCompMap;
	for (auto& ptn : pairings) {
		if (ptn->getDbId() != p->getDbId()) {
			vector<Segment*> segments;
			for (auto& s : ptn->getSegments()) {
				if (s->getAssignment() != "PSG" && s->getAssignment() != "PSB" && s->getAssignment() != "DHD" && s->getAssignment() != "BUG" && s->getAssignment() != "HSR"
					&& s->getDBId() == seg->getDBId()) {
					segments.push_back(s);
					segment.push_back(s);
				}
			}
			// 同个航班在另一个环中是加机组或乘机时，不考虑
			if (segments.size() > 0) {
				map<string, int>::iterator iter;


				map<string, int> map = ptn->getOpenComposition().size() == 0 ? ptn->getComplements() : ptn->getOpenComposition();
				for (iter = map.begin(); iter != map.end(); iter++) {
					if (ctx.dbData->rankMap[iter->first].isMustCrewRank && iter->second > 0) {
						if (segCompMap[iter->first]) {
							segCompMap[iter->first] = segCompMap[iter->first] + iter->second;
						}
						else {
							segCompMap[iter->first] = iter->second;
						}
					}
				}
			}
			
		}
	}

	
	map<string, int> compositionMap;
	
	if (segment.size() > 0) {
		//map<string, int> pairCompMap = p->getComplements();
		/*if ((division == "P" && segment[0]->getRankCombCP() == rankCombID)
			|| (division == "C" && segment[0]->getRankCombCC() == rankCombID)
			|| (division == "A" && segment[0]->getRankCombCA() == rankCombID))*/
			compositionMap = segment[0]->getPlanComposition();
		
		/*map<string, int>::iterator pairIter;
		for (pairIter = pairCompMap.begin(); pairIter != pairCompMap.end(); pairIter++) {
			if (compositionMap[pairIter->first]) {
				compositionMap[pairIter->first] = compositionMap[pairIter->first] - pairIter->second;
			}
		}*/
	}


	// 一个flt处于多个ptn时，记录原有所处ptn的plan配比
	map<string, int> pairCompMap = p->getComplements();

	// splitPairing， 单独切一个非必须成员岗位导致找不到配比
	map<string, int>::iterator pairIter;
	bool isNoMustRank = false;
	for (pairIter = pairCompMap.begin(); pairIter != pairCompMap.end(); pairIter++) {
		if (!ctx.dbData->rankMap[pairIter->first].isMustCrewRank) {
			isNoMustRank = true;
			break;
		}
	}


	// 拆分方案
	map<int, vector<RankCombination*>>  Options;
	for (std::size_t i = 0; i < rankCombs.size(); i++) {

		Options[rankCombs[i]->options].push_back(rankCombs[i].get());
	}
	// 比较级别数量
	map<int, vector<RankCombination*>>::iterator op;
	for (op = Options.begin(); op != Options.end(); op++) {
		vector<string> ranks;
		map<string, int> rankCombNums;
		for (std::size_t i = 0; i < op->second.size(); i++) {
			if (op->second[i]->positions == "" || op->second[i]->positions.empty()) continue;
			ranks.push_back(op->second[i]->rank);
			if (rankCombNums[op->second[i]->rank]) {
			
				rankCombNums[op->second[i]->rank] = rankCombNums[op->second[i]->rank] + 1;
			}
			else {
				rankCombNums[op->second[i]->rank] = 1;
			}
		}
		map<string, int>::iterator rfRank;
		bool fix = true;
		/*if (rfRanks.size() == 0) {
			for (auto& rankComb : rankCombs) {
				fixOptions.push_back(rankComb->options);
			}
		}*/
		if (pCompositionSource == "O" && rankCombNums != pairCompMap) {
			continue;
		}

		// 航班处于多个pairing中时，如果option和其他pairing的composition相同，直接跳过
		if (rankCombNums == segCompMap && !isNoMustRank) continue;
		
		for (rfRank = rfRankNums.begin(); rfRank != rfRankNums.end(); rfRank++) {
			if (rankCombNums.find(rfRank->first) == rankCombNums.end() || rankCombNums[rfRank->first] < rfRank->second) {
				fix = false;
				break;
			}
		}

		// 20210914 jx.jin 新建任务环 配比 1CAP 1RCAP ，分配给FO后无配比
		// 先建搭机，然后新增seg，未警告
		// 比较当前任务环的搭配
		//if (!pairCompMap.empty()) {
		//	map<string, int>::iterator pairingIter;
		//	for (pairingIter = pairCompMap.begin(); pairingIter != pairCompMap.end(); pairingIter++) {
		//		// 过滤非必须成员岗位
		//		if (ctx.dbData->rankMap[pairingIter->first].isMustCrewRank) {
		//			if (rankCombNums.find(pairingIter->first) == rankCombNums.end() || rankCombNums[pairingIter->first] < pairingIter->second) {
		//				fix = false;
		//				break;
		//			}
		//		}
		//	}
		//}

		if (fix && segment.size() > 0) {
			if ((division == "P" && rankCombID == seg->getRankCombCP()) || division == "C" && rankCombID == seg->getRankCombCC()
				|| division == "A" && rankCombID == seg->getRankCombCA()) {
				map<string, int>::iterator comp;
				bool num = true;
				/*if ((division == "P" && p->getRankCombCP() == 0) || (division == "C" && p->getRankCombCC() == 0) || (division == "A" && p->getRankCombCA() == 0)) {
					num = false;
				}*/
				map<string, int>::iterator segIter;
				for (comp = compositionMap.begin(); comp != compositionMap.end(); comp++) {
					if (!ctx.dbData->rankMap[comp->first].isMustCrewRank)
						continue;
					if (ctx.dbData->rankMap[comp->first].division == division && rankCombNums.find(comp->first) == rankCombNums.end()) {
						fix = false;
						break;
					}
					/*if (segCompMap.find(comp->first) == segCompMap.end() || segCompMap[comp->first] < comp->second) {
						fix = true;
						break;
					}*/
					if (rankCombNums.find(comp->first) != rankCombNums.end()) {
						if (rankCombNums[comp->first] < comp->second) {
							num = false;
							break;
						}
						if (pairCompMap.find(comp->first) != pairCompMap.end() && segCompMap.find(comp->first) != segCompMap.end()
							&& rankCombNums[comp->first] - pairCompMap[comp->first] < segCompMap[comp->first]) {
							num = false;
							break;
						}
						
						if (rankCombNums[comp->first] > comp->second) {
							num = true;
						}
					}
				}

				if (!num) {
					fix = false;
				}
			}
		}
		if (fix && checkFleet) {
			fix = checkPositionForOption(rosterFlights, rankCombNums, op->second, ranks, ctx);
		}
		if (fix) {
			fixOptions.push_back(op->first);
		}
	}

	/*set<int> s(fixOptions.begin(), fixOptions.end());
	fixOptions.assign(s.begin(), s.end());*/

	stable_sort(fixOptions.begin(), fixOptions.end());
	int a = static_cast<int>(unique(fixOptions.begin(), fixOptions.end()) - fixOptions.begin());
	vector<int> res(fixOptions.begin(), fixOptions.begin() + a);
	sort(res.begin(), res.end());
	return res;

	//// 排序，去重
	//sort(fixOptions.begin(), fixOptions.end());
	//// vector<int>::iterator uniqueOptions = unique(fixOptions.begin(), fixOptions.end());
	//fixOptions.erase(unique(fixOptions.begin(), fixOptions.end()), fixOptions.end());
	// return fixOptions;
}

bool checkPositionForOption(vector<SharedPtr<RosterFlight>> rosterFlights, map<string, int> optionComp, vector<RankCombination*> Options, vector<string> ranks, CalcRankCombinationCtx& ctx) {
	if (rosterFlights.empty()) {
		return true;
	}
	map<string, int> CrewIdMapToSeqOrder;
	int fixSourceOption = 0;
	int matchFailOptionCount = 0;
	int matchFailSourceOptionCount = 0;
	int noOverCrewCount = 0;
	Number = 0;
	int checkCount = 0;
	int checkOkCount = 0;
	memset(Used, 0, sizeof(Used));
	vector<SharedPtr<RosterFlight>> rfs;
	vector<RankCombination*> option;
	for (const auto & op : Options) {
		if (!op->positions.empty()) {
			option.push_back(op);
		}
	}

	for (std::size_t i = 0; i < rosterFlights.size(); i++) {
		string rank = rosterFlights[i]->actingRank;
		if (!ctx.dbData->rankMap[rank].isMustCrewRank && ctx.dbData->rankMap[rank].isActingRank) {
			continue;
		}

		if (find(ranks.begin(), ranks.end(), rank) == ranks.end()) {
			return false;
		}
		rfs.push_back(rosterFlights[i]);
	}
		//初始化匹配数组
	memset(Match, 0, sizeof(Match));
	for (std::size_t m = 0; m < rfs.size(); m++) {
		if (ctx.dbData->pairingIdMap.find(rfs[m]->pairingId) == ctx.dbData->pairingIdMap.end()) {
			continue;
		}

		SharedPtr<CREW> crew = ctx.dbData->crewIdMap[rfs[m]->crewId];
		//(reverted)20190917 ain,mantis#6713, 按division获取crew,以兼容crew同时具有C/A资格
		string fleet = getFleetByFlt(rfs[m], ctx);
		const auto & roster = ctx.dbData->findRoster(rfs[m]->rosterId);
		//if (roster == NULL) continue;
		// 长龙有备份任务，没有对应的rosterId, 使用rf中的pairing的开始结束时间
		string actingRank = rfs.size() > 0 ? (rfs[m]->activeRank.empty() ? rfs[m]->actingRank : rfs[m]->activeRank) : roster->actingRank;
		time_t rosterStart = 0;
		time_t rosterEnd = 0;
		if (roster == NULL) {
			rosterStart = ctx.dbData->pairingIdMap[rfs[m]->pairingId]->getStartTimeUtcAct();
			rosterEnd = ctx.dbData->pairingIdMap[rfs[m]->pairingId]->getEndTimeUtcAct();
		}
		else {
			rosterStart = roster->actStrUtc;
			rosterEnd = roster->actEndUtc;
		}
		SharedPtr<CREW_RANK>cofActiveRank = ctx.dbData->getCrewRankByActingRank(rfs[m]->crewId, rosterStart, rosterEnd, actingRank, fleet);

		//SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(roster->actStrUtc, roster->actRestStrUtc, fleet);
		if (!cofActiveRank)
		{
			return false;
		}
		string cofPostion = cofActiveRank->position;
		for (std::size_t n = 0; n < option.size(); n++) {
			if (Used[option[n]->seqOrder])continue;
			vector<string> splitPositions;
			string s = option[n]->positions;
			split(option[n]->positions, '|', splitPositions);
			if (option[n]->rank != rfs[m]->actingRank
				|| std::find(splitPositions.begin(), splitPositions.end(), cofPostion) == splitPositions.end())
				continue;
			Match[m][option[n]->seqOrder] = true;
			Number = max(Number, option[n]->seqOrder);
		}
	}
	//得到匹配数组 进行匹配
	std::size_t count = 0;
	memset(SegOrders, -1, sizeof(SegOrders));
	memset(Answer, 0, sizeof(Answer));
	for (std::size_t j = 0; j < rfs.size(); j++) {
		memset(Used, 0, sizeof(Used));
		if (Find(j)) count += 1;
	}
	if (count >= rfs.size() && rfs.size() > 0) {
		for (std::size_t j = 0; j < rfs.size(); j++) {
			CrewIdMapToSeqOrder.insert(make_pair(rfs[j]->crewId, Answer[j]));
		}
		return true;
	}

	if (CrewIdMapToSeqOrder.size() != rfs.size()) {
		return false;
	}
	return false;
}

string getFleetByFlt(SharedPtr<RosterFlight> rosterFlight, CalcRankCombinationCtx& ctx) {
	string fleetCD;
	auto iter = ctx.dbData->flightIdMap.find(rosterFlight->fltId);
	if (iter == ctx.dbData->flightIdMap.end()) {
		string msg = "[DataCheck] ERROR: invalid data, Rule-8091: FlightId " + Utility::GetInstancePtr()->llToa(rosterFlight->fltId) + " no flight find while checking flight " + Utility::GetInstancePtr()->llToa(rosterFlight->fltId);
		Logger::getRuleLogger()->error(msg.c_str());
		Pairing* pair = ctx.dbData->pairingIdMap[rosterFlight->pairingId];
		for (auto s : pair->getSegments()) {
			if (s->getId() == rosterFlight->fltId) {
				fleetCD = s->getFleetCD();
				break;
			}
		}
	}
	else {
		fleetCD = iter->second->getFleetCD();
	}
	return ctx.dbData->fleetMap[fleetCD].acType;
}

int getOldSegmentOption(string division, Segment* seg) {
	int res = 0;
	string option = "";
	if (division == "P") option = seg->getRankCombOP();
	if (division == "C") option = seg->getRankCombOC();
	if (division == "A") option = seg->getRankCombOA();

	if (option.find(",") != string::npos) {
		vector<string> options;
		split(option, ',', options);
		if (options.size() > 0 && options[0] != "") {
			res = std::stoi(options[0]);
		}
	}
	else {
		res = std::stoi(option);
	}
	return res;
}

//计算 crewNum
int calculateSegmentRankCombinationCrewNum(Pairing* pairing, Segment* seg, map<long long, vector<Pairing*>>& segToPairing, map<string, bool>& crewNumRanks, CrewDataContext* dbData) {
	if (!seg || !pairing) {
		return 0;
	}
	//20200817 ain, mantis#8575, 当flt_id=0时只计算本ptn配比作为crewNum
	//20190330 ain, mantis#5222, rankComb支持SBY类任务, crewNum按 pairing配比求和
	int crewNum = 0;
	long long fltId = seg->getDBId();
	if (fltId == 0 ||
		dbData->isAssignmentInGroup(seg->getAssignment(), "SBY")) {
		for (auto& it : pairing->getComplements()) {
			crewNum += it.second;
		}
	}
	else {
		long long fltId = seg->getDBId();
		if (segToPairing.find(fltId) != segToPairing.end()) {
			for (Pairing* p : segToPairing[fltId]) {
				if (p->getPrimeActivity() == "PSG" || p->getPrimeActivity() == "PSB" || p->getPrimeActivity() == "MVP") {
					continue;
				}
				for (auto& it : p->getComplements()) {
					//20181113 ain, 只对rankCombCriteria.crewNumRanks中指定的rank计数
					string rank = it.first;
					if (crewNumRanks.empty() || crewNumRanks.find(rank) != crewNumRanks.end()) {
						crewNum += it.second;
					}
				}
			}
		}
	}
	return crewNum;
}


//计算seg.rankCombID, 若未找到匹配则返回 0
//1 按 seg匹配所有可能 route_ID
//2 按 pairing.compID、seg.fleet、seg route_id集合，匹配priority最小(优先高)的rankCombID
long long calculateSegmentRankCombination(Pairing* pairing, Duty* duty, Segment* segment, CalcRankCombinationCtx& ctx, string division, string assignment, long long rankCombId) {
	//1 按 seg匹配所有可能 route_ID
	vector<long long> matchRouteIds;
	for (auto& route : ctx.dbData->routeList) {
		if (route->arvArp != "" && route->arvArp != segment->getArrStation())
			continue;
		if (route->depArp != "" && route->depArp != segment->getDepStation())
			continue;
		if (route->fltNum != "" && route->fltNum != segment->getFlightNumber())
			continue;
		//20190324 ain, OP#2022
		//20190418 ain, mantis#5353, segType=D/I/R只存在于flight, 按seg找到flt在获取segType执行匹配计算
		Segment* flt = ctx.fltIdMap[segment->getDBId()];
		if (!flt)
			flt = segment;
		if ((route->flt_dt_start != -1 && route->flt_dt_start > flt->getStartTimeLocAct()) || (route->flt_dt_end != -1 &&  route->flt_dt_end < flt->getEndTimeLocAct())) {
			continue;
		}
		if (route->segType != "" && route->segType != "*" && route->segType != flt->getDomIntType() && (route->flt_dt_start > flt->getStartTimeLocAct() || route->flt_dt_end < flt->getEndTimeLocAct()))
			continue;
		matchRouteIds.push_back(route->routeId);
	}

	//2 按 pairing.compID、seg.fleet、seg route_id集合，匹配priority最小(优先高)的rankCombID
	RankCombinationCriteria * result = NULL;
	for (auto& it : ctx.dbData->rankCombinationCriteriaMap) {
		auto& rankComb = it.second;
		if ((rankComb->effDt > 0 && pairing->getStartTimeLocAct() < rankComb->effDt )  || (rankComb->expDt > 0 && pairing->getStartTimeLocAct() > rankComb->expDt + 24 * 3600 - 1)) {
			continue;
		}
		//crewNumRanks
		int crewNum = calculateSegmentRankCombinationCrewNum(pairing, segment, ctx.segToPairing, rankComb->crewNumRanksMap, ctx.dbData);
		//20181108 ain, mantis#4408, 筛选division
		//if (rankComb->division != ctx.dbData->scenario.division) {
		//20190615 ain, mantis#5992, rankComb.division匹配按 pairing.division代替 scenario/workset.division
		//if (rankComb->division != pairing->getDivision()) {
		//20190625 ain, mantis#6075, 退回 mantis#4408，按 rankComb.division = scenario / workset.division处理, 由外部数据流保证 scenario.division-
		if (ctx.dbData->version == 2 && rankComb->division != ctx.dbData->scenario.division) {
			continue;
		}
		//route, routeId=0时为通配不参与筛选
		if (rankComb->routeId != 0) {
			if (matchRouteIds.end() == find(matchRouteIds.begin(), matchRouteIds.end(), rankComb->routeId))
				continue;
		}
		//fleet, fleet=*时为通配不参与筛选
		if (rankComb->fleets != "*") {
			//mantis#5242. SBY类 seg.fleet为空则以pairing.fleet为准
			string fleetCD = segment->getFleetCD() != "" ? segment->getFleetCD() : pairing->getFltCode();
			vector<string> fleets;
			split(rankComb->fleets, '|', fleets);
			if (fleets.end() == find(fleets.begin(), fleets.end(), fleetCD)) {
				continue;
			}
		}
		//crewNum
		//20181109 ain, mantis#4408, crewNum=0不再视为通配
		//if (rankComb->crewNum != 0 && rankComb->crewNum != crewNum) {
		//20201022 人员数量需区分数据版本，3.0中，人员数量不再进行筛选
		if (ctx.dbData->version == 2 && rankComb->crewNum != crewNum) {
			continue;
		}
		//20190330 ain, mantis#5222, rankComb匹配逻辑增加 assignmentGroup
		//先尝试匹配 rankComb->assignment == seg.assignment
		//若无匹配则按 rankComb->assignment当作 group再次尝试匹配
		if (rankComb->assignment != "" && rankComb->assignment != "*") {
			/*bool match = false;
			if (rankComb->assignmentVec.end() != std::find(rankComb->assignmentVec.begin(), rankComb->assignmentVec.end(), segment->getAssignment())) {
				match = true;
			}
			if (!match) {
				for (auto& group : rankComb->assignmentVec) {
					if (ctx.dbData->isAssignmentInGroup(segment->getAssignment(), group)) {
						match = true;
						break;
					}
				}
			}
			if (!match) {
				continue;
			}*/
			if (!ctx.dbData->isAssignmentIncludeOrInGroup(assignment, rankComb)) {
				continue;
			}
		}

		if (!pairing->GetCourseType().empty() && !rankComb->courseTypes.empty() && rankComb->courseTypeStr != "*") {
			if (find(rankComb->courseTypes.begin(), rankComb->courseTypes.end(), pairing->GetCourseType()) == rankComb->courseTypes.end())
				continue;
		}

		if (!pairing->GetCourseCode().empty() && !rankComb->courseCodeStr.empty() && rankComb->courseCodeStr != "*") {
			if (find(rankComb->courseCodes.begin(), rankComb->courseCodes.end(), pairing->GetCourseCode()) == rankComb->courseCodes.end())
				continue;
		}

		if (ctx.dbData->version == 3) {
			if (rankComb->division != division) {
				continue;
			}
			//3.0新增航段數限制,比如1~99
			if (rankComb->landingLow > (int)duty->getSegments().size() || (rankComb->landingUpper > 0 && rankComb->landingUpper < (int)duty->getSegments().size())) {
				continue;
			}
			//3.0新增報到時間限制
			//如果dutyBrief时间不在rptStart~rptEnd 之间，则过滤
			/*Duty* duty = NULL;
			for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
				if (pairing->getDuty(i)->getDutyId() == segment->getDutyId()) {
					duty = pairing->getDuty(i);
					break;
				}
				
			}*/
			if (!duty) {
				continue;
			}

			if (rankComb->rptStart >= 0 && rankComb->rptEnd >= 0) {
				const auto& brief = duty->getFirstBreif();
				const auto& dutyRptInSecond = brief->getStartTimeLocAct() - getStartTimeOfDay(brief->getStartTimeLocAct());

				if (rankComb->rptEnd > rankComb->rptStart) {
					if (rankComb->rptStart > dutyRptInSecond || dutyRptInSecond > rankComb->rptEnd)
						continue;
				}
				else if (rankComb->rptStart > rankComb->rptEnd) {
					if (rankComb->rptEnd < dutyRptInSecond && rankComb->rptStart > dutyRptInSecond)
						continue;
				}
			}
			/*if ((rankComb->rptStart != 0 && rankComb->rptStart - (duty->getStartTime() - getStartTimeOfDay(duty->getStartTime())) > 0)
				|| (rankComb->rptEnd != 0 && (duty->getStartTime() - getStartTimeOfDay(duty->getStartTime())) - rankComb->rptEnd > 0)) {
				continue;
			}*/

			//3.0新增飛行小時限制，blh
			long blh = (duty->getActualBlockTime() <= 0 ? duty->getBLKInMins() : duty->getActualBlockTime()) * 60;
			if ((rankComb->blhLow > 0 && rankComb->blhLow > blh) || (rankComb->blhUpper > 0 && rankComb->blhUpper < blh)) {
				continue;
			}

			if (duty->getFDPInSecs() == 0) {
				calculatePairingDutyTimes(duty, ctx.dbData);
				//if (duty->getNumFlySegs() == 0) {
				//	duty->calculateDutyValues();
				//}
				//duty->calculateFDP();
			}
			long fdp = duty->getFDPInSecs();

			//3.0新增执行期小时限制，fdp
			if ((rankComb->fdpLow > 0 && rankComb->fdpLow > fdp) || (rankComb->fdpUpper > 0 && rankComb->fdpUpper < fdp)) {
				continue;
			}
		}
		if (rankCombId != 0 && rankComb->crewNum <= ctx.dbData->rankCombinationCriteriaMap[rankCombId]->crewNum) {
			continue;
		}

		//
		if (result == NULL || rankComb->pri < result->pri) {
			result = rankComb.get();
		}
	}
	if (result != NULL) {
		if (division == "*") {
			segment->setRankCombCriteriaId(result->id);
		}
		else if (division == "P") {
			segment->setRankCombCP(result->id);
		}
		else if (division == "C") {
			segment->setRankCombCC(result->id);
		}
		else if (division == "A") {
			segment->setRankCombCA(result->id);
		}
		return result->id;
	}
	else {
		segment->setRankCombCriteriaId(0);
		segment->setRankCombCP(0);
		segment->setRankCombCC(0);
		segment->setRankCombCA(0);
		return 0;
	}
}


//1 按 seg匹配所有可能 route_ID
//2 按 seg.fleet、seg route_id集合，匹配所有的rankCombID
vector<long long> calculateSegmentRankCombinationAll(Pairing* pairing, Duty* duty, Segment* segment, CalcRankCombinationCtx& ctx, string division, string assignment, vector<long long> rankCombIds) {
	//1 按 seg匹配所有可能 route_ID
	vector<long long> matchRouteIds;
	for (auto& route : ctx.dbData->routeList) {
		if (route->arvArp != "" && route->arvArp != segment->getArrStation())
			continue;
		if (route->depArp != "" && route->depArp != segment->getDepStation())
			continue;
		if (route->fltNum != "" && route->fltNum != segment->getFlightNumber())
			continue;
		//20190324 ain, OP#2022
		//20190418 ain, mantis#5353, segType=D/I/R只存在于flight, 按seg找到flt在获取segType执行匹配计算
		Segment* flt = ctx.fltIdMap[segment->getDBId()];
		if (!flt)
			flt = segment;
		if ((route->flt_dt_start != -1 && route->flt_dt_start > flt->getStartTimeLocAct()) || (route->flt_dt_end != -1 && route->flt_dt_end < flt->getEndTimeLocAct())) {
			continue;
		}
		if (route->segType != "" && route->segType != "*" && route->segType != flt->getDomIntType() && (route->flt_dt_start > flt->getStartTimeLocAct() || route->flt_dt_end < flt->getEndTimeLocAct()))
			continue;
		matchRouteIds.push_back(route->routeId);
	}

	//2 按 pairing.compID、seg.fleet、seg route_id集合，匹配priority最小(优先高)的rankCombID
	vector<long long> result;
	for (auto& it : ctx.dbData->rankCombinationCriteriaMap) {
		auto& rankComb = it.second;
		//crewNumRanks
		int crewNum = calculateSegmentRankCombinationCrewNum(pairing, segment, ctx.segToPairing, rankComb->crewNumRanksMap, ctx.dbData);
		//20181108 ain, mantis#4408, 筛选division
		//if (rankComb->division != ctx.dbData->scenario.division) {
		//20190615 ain, mantis#5992, rankComb.division匹配按 pairing.division代替 scenario/workset.division
		//if (rankComb->division != pairing->getDivision()) {
		//20190625 ain, mantis#6075, 退回 mantis#4408，按 rankComb.division = scenario / workset.division处理, 由外部数据流保证 scenario.division-
		if (ctx.dbData->version == 2 && rankComb->division != ctx.dbData->scenario.division) {
			continue;
		}
		//route, routeId=0时为通配不参与筛选
		if (rankComb->routeId != 0) {
			if (matchRouteIds.end() == find(matchRouteIds.begin(), matchRouteIds.end(), rankComb->routeId))
				continue;
		}
		//fleet, fleet=*时为通配不参与筛选
		if (rankComb->fleets != "*") {
			//mantis#5242. SBY类 seg.fleet为空则以pairing.fleet为准
			string fleetCD = segment->getFleetCD() != "" ? segment->getFleetCD() : pairing->getFltCode();
			vector<string> fleets;
			split(rankComb->fleets, '|', fleets);
			if (fleets.end() == find(fleets.begin(), fleets.end(), fleetCD)) {
				continue;
			}
		}
		//crewNum
		//20181109 ain, mantis#4408, crewNum=0不再视为通配
		//if (rankComb->crewNum != 0 && rankComb->crewNum != crewNum) {
		//20201022 人员数量需区分数据版本，3.0中，人员数量不再进行筛选
		if (ctx.dbData->version == 2 && rankComb->crewNum != crewNum) {
			continue;
		}
		//20190330 ain, mantis#5222, rankComb匹配逻辑增加 assignmentGroup
		//先尝试匹配 rankComb->assignment == seg.assignment
		//若无匹配则按 rankComb->assignment当作 group再次尝试匹配
		if (rankComb->assignment != "" && rankComb->assignment != "*") {
			/*bool match = false;
			if (rankComb->assignmentVec.end() != std::find(rankComb->assignmentVec.begin(), rankComb->assignmentVec.end(), segment->getAssignment())) {
				match = true;
			}
			if (!match) {
				for (auto& group : rankComb->assignmentVec) {
					if (ctx.dbData->isAssignmentInGroup(segment->getAssignment(), group)) {
						match = true;
						break;
					}
				}
			}
			if (!match) {
				continue;
			}*/
			if (!ctx.dbData->isAssignmentIncludeOrInGroup(assignment, rankComb)) {
				continue;
			}
		}
		if (ctx.dbData->version == 3) {
			if (rankComb->division != division) {
				continue;
			}
			//3.0新增航段數限制,比如1~99
			if (rankComb->landingLow > (int)duty->getSegments().size() || rankComb->landingUpper < (int)duty->getSegments().size()) {
				continue;
			}
			//3.0新增報到時間限制
			//如果dutyBrief时间不在rptStart~rptEnd 之间，则过滤
			/*Duty* duty = NULL;
			for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
				if (pairing->getDuty(i)->getDutyId() == segment->getDutyId()) {
					duty = pairing->getDuty(i);
					break;
				}

			}*/
			if (!duty) {
				continue;
			}
			// rank combination criteria rpt time cross midnight
			const auto dutyTimeOfDay = duty->getStartTime() - getStartTimeOfDay(duty->getStartTime());
			if (rankComb->rptEnd < rankComb->rptStart) {
				if ((rankComb->rptStart < dutyTimeOfDay && rankComb->rptEnd > dutyTimeOfDay)) {
					continue;
				}
			} else if ((rankComb->rptStart - dutyTimeOfDay) > 0 || (dutyTimeOfDay - rankComb->rptEnd > 0)) {
				continue;
			}

			//3.0新增飛行小時限制，blh
			long blh = (duty->getActualBlockTime() <= 0 ? duty->getBLKInMins() : duty->getActualBlockTime()) * 60;
			if (rankComb->blhLow > blh || rankComb->blhUpper < blh) {
				continue;
			}

			if (duty->getFDPInSecs() == 0) {
				calculatePairingDutyTimes(duty, ctx.dbData);
				//if (duty->getNumFlySegs() == 0) {
				//	duty->calculateDutyValues();
				//}
				//duty->calculateFDP();
			}
			long fdp = duty->getFDPInSecs();

			//3.0新增执行期小时限制，fdp
			if (rankComb->fdpLow > fdp || rankComb->fdpUpper < fdp) {
				continue;
			}
		}
		if (find(rankCombIds.begin(), rankCombIds.end(), rankComb->id) != rankCombIds.end()) {
			result.push_back(rankComb->id);
		}
	}
	return result;
	
}

//error log for rankCombination
void calculatiePairingRankCombationErrorLog(Pairing* pairing, CalcRankCombinationCtx& ctx) {
	if (!pairing) {
		return;
	}
	//20190613 ain, mantis#5976, 8091错误日志上限, 避免影响启动速度, 广播处理速度
	ctx.errorCount++;
	if (ctx.errorCount == MAX_ERROR_LOG_COUNT + 1) {
		std::cout << "..." << std::endl;
	}
	if (ctx.errorCount > MAX_ERROR_LOG_COUNT) {
		return;
	}

	stringstream ss;
	int pairingPlanCrewCount = 0;
	for (auto& rankValue : pairing->getComplements()) {
		pairingPlanCrewCount += rankValue.second;
		ss << " " << rankValue.first << ":" << rankValue.second;
	}
	Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, no RankCombinationCriteria match pairing={} {} {}  pairing.comp={}", 
		pairing->getDbId(), utcToUtcDtString(pairing->getStartTimeLocSch()), pairing->getFltCode(), ss.str());

	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty* d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			if (s->getRankCombCriteriaId() > 0) {
				continue;
			}
			int segTotalNum = 0;
			cout << "         no rankComb match seg " << s->getFlightNumber() << " " << s->getDBId() << " " << s->getFleetCD() << " " << s->getAssignment() << " ptn.crewNums:" ;
			if (s->getDBId() != 0) {
				for (Pairing* pairingOfSeg : ctx.segToPairing[s->getDBId()]) {
					int crewNum = 0;
					cout << pairingOfSeg->getDbId() << "=";
					for (auto& it : pairingOfSeg->getComplements()) {
						crewNum += it.second;
						cout << it.first << ":" << it.second << "|";
					}
					segTotalNum += crewNum;
				}
				cout << "total=" << segTotalNum << endl;
			}
		}
	}
}
