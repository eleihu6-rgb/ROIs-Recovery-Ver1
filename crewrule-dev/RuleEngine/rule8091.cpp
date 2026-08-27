#pragma once

#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>
#include <string.h>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/StringUtils.h"
#include "Log/Logger.h"

/**
逻辑说明：
    遍历 options
        ranks=收集option涉及的rank
        rfs=收集ranks涉及的 rosterFlt
        遍历rfs
            在矩阵 match中为每一rf标记可能的 seqOrder
            position=按crewId获取 crew_rank.position
            遍历option下定义岗位
                判断 rfs.actingRank/position是否匹配，不匹配则忽略
                初始化match[m][Option[n]->seqOrder] = true ---> m为 rf索引，n为option下备选岗位索引
        初始化数组 seqOrder={-1}
        初始化数组 anwser={0}
        遍历rfs
            初始化数组 used={0}
            调用函数 find(j)，为每一rf分配可行号位，其中j为rfs索引
            预期 find()结果赋值在数组 anwser[]中，按rfs索引一一对应每一项seqOrder
        若分配结果与总rfs数量相同，则认为检查通过	
	若所有option都找不到可行解，则返回失败
*/
static bool isMatchScenarioActingRank(SharedPtr<CrewDataContext>& dbData, string& rank);


////用匈牙利算法分配号位
//int segOrders[105];//下标x x号位上放了y号人
//int answer[105];//下标y y号人放在了几号位上
//bool match[105][105];
//bool used[105];
//bool isWarn = false;
//int number;
//bool Find(std::size_t x) {//第x个crew
//	int j;
//	for (j = 1; j <= number; j++) {    //扫描每个crew对应的号位
//		if (match[x][j] == true && used[j] == false)//如果 可以符合该号位 且未尝试过在该号位上派人
//		{
//			used[j] = true;
//			//j号位上没有人为-1
//			if (segOrders[j] == -1 || Find(segOrders[j])) {
//				segOrders[j] = (int)x;
//				answer[x] = j;
//				return true;
//			}
//		}
//	}
//	return false;
//}


string LegalityChecker::getFleetByFlt(SharedPtr<RosterFlight> rosterFlight) {
	string fleetCD;
	auto iterFlt = this->_dbData->flightIdMap.find(rosterFlight->fltId);
	if (iterFlt == this->_dbData->flightIdMap.end()) {
		Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, flight do not exist. FlightId:{}, PairingId:{}, method=getFleetByFlt", rosterFlight->fltId, rosterFlight->pairingId);
		auto iterPair = this->_dbData->pairingIdMap.find(rosterFlight->pairingId);
		if (iterPair == this->_dbData->pairingIdMap.end()) {
			Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, pairing do not exist. PairingId:{}, method=getFleetByFlt", rosterFlight->pairingId);
			return "";
		}
		Pairing* pair = iterPair->second;
		for (auto s : pair->getSegments()) {
			if (s->getId() == rosterFlight->fltId) {
				fleetCD = s->getFleetCD();
				break;
			}
		}
	}
	else {
		fleetCD = iterFlt->second->getFleetCD();
	}
	return this->_dbData->fleetMap[fleetCD].acType;
}

map<string, int> LegalityChecker::getSeqOrderOptimization(vector<SharedPtr<RankCombination>>& rankCombs, vector<SharedPtr<RosterFlight>> rosterFlights, string pCompositionSource, string crewId){
	map<string, int> CrewIdMapToSeqOrder;
	map<int ,vector<RankCombination*>>  Options;
	time_t lCheckedStart = this->_dbData->scenario.startDtUTC;
	time_t lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	//拆分方案
	for (std::size_t i = 0; i < rankCombs.size(); i++){
		Options[rankCombs[i]->options].push_back(rankCombs[i].get());
	}

	//检查pairing对象，避免崩溃，同时打印日志
    //防止map自动创建
    auto pMapIt = this->_dbData->pairingIdMap.find(rosterFlights[0]->pairingId);
    if(pMapIt == this->_dbData->pairingIdMap.end()){
        return CrewIdMapToSeqOrder;
    }
    Pairing* pMap = pMapIt->second;
	if (!pMap)
	{
		//printf("ERROR(getSeqOrderOptimization): Pairing(%lld) not exist\n", rosterFlights[0]->pairingId);
		return CrewIdMapToSeqOrder;
	}

	map<string, int> pComp = pMap->getComplements();
	map<string, int> optionComp;
	number = 0;
	int i = 0;
	//对于每个方案先找到合法的crew集合
	vector<shared_ptr<RosterFlight>> rfs;
	for (i = 0; i < (int)Options.size(); i++){
		rfs.clear();
		optionComp.clear();
		//将方案中所有的rank存入ranks 筛选crew
		vector<string> ranks;
		for (std::size_t k = 0; k < Options[i].size(); k++){
			
			if (Options[i][k]->positions == "") continue;

			ranks.push_back(Options[i][k]->rank);
			if (optionComp[Options[i][k]->rank]) {
				optionComp[Options[i][k]->rank] = optionComp[Options[i][k]->rank] + 1;
			}
			else {
				optionComp[Options[i][k]->rank] = 1;
			}
		}
		if ("O" == pCompositionSource && optionComp != pComp) continue;
		
		for (std::size_t j = 0; j < rosterFlights.size(); j++){
			//20190912 ain, mantis#6687, assignment=MVO也需要计算
			if (rosterFlights[j]->assignment != "OPR" && rosterFlights[j]->assignment != "FLY" && rosterFlights[j]->assignment != "MVO" && rosterFlights[j]->assignment.find("SBY") == string::npos && rosterFlights[j]->assignment != "SIM" && rosterFlights[j]->assignment != "TRAINING")
				continue;

			// 根据rankCombCriteria中的assignment字段与rosterFlight中assignment比较 add by jx.jin 2021/1/22
			// 先尝试匹配 rankComb->assignment == seg.assignment
			// 若无匹配则按 rankComb->assignment当作 group再次尝试匹配
			if (!_dbData->isAssignmentIncludeOrInGroup(rosterFlights[j]->assignment, _dbData->rankCombinationCriteriaMap[rankCombs[0]->rankCombCriteriaId])) {
				continue;
			}

			if (find(ranks.begin(), ranks.end(), rosterFlights[j]->actingRank) == ranks.end())
				continue;
	
			rfs.push_back(rosterFlights[j]);
		}
		
		if (rfs.size() == 0)
			continue;

		//优化只分配FLY MVO SBY, 如果rfs数量小于rosterFlights数量。说明有的分配不合适，比如说rank不合适，一个
		//组员只具有CF资格，但任务环的配比组合里不需要CF资格。
		if (this->GetApplication() == ROSTER_OPTIMIZER && (int)rfs.size() > (int)ranks.size())
			continue;

		//crew筛选完 验证 RankCombination与crews的匹配关系
		//初始化匹配数组
		memset(match, 0, sizeof(match));
		for (std::size_t m = 0; m < rfs.size(); m++){
			SharedPtr<CREW> crew = this->_dbData->crewIdMap[rfs[m]->crewId];
			//(reverted)20190917 ain,mantis#6713, 按division获取crew,以兼容crew同时具有C/A资格
			//string actingRank = rfs.size() > 0 ? rfs[m]->activeRank : "";
			//SharedPtr<CREW_RANK>cofActiveRank = _dbData->getCrewRankByActingRank(rfs[m]->crewId, lCheckedStart, lCheckedEnd, actingRank);
			//20190919 ain, mantis#6713, 问题8, 按任务日期计算 crewRank, 若失败则默认按场景日期计算 crewRank
			time_t start = lCheckedStart;
			time_t end = lCheckedEnd;
			if (_dbData->pairingIdMap.find(rfs[m]->pairingId) != _dbData->pairingIdMap.end()) {
				start = _dbData->pairingIdMap[rfs[m]->pairingId]->getStartTimeUtcAct();
				end = _dbData->pairingIdMap[rfs[m]->pairingId]->getEndTimeUtcAct();
			}
			string fleet = getFleetByFlt(rfs[m]);
			SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(start, end, fleet);
			if (!cofActiveRank)
			{
				std::string msg = "No proper acting rank found for crew {0:crewId} on fleet {1:fleet}.";
				printf(msg.c_str());
				return CrewIdMapToSeqOrder;
			}

			string cofPostion = cofActiveRank->position;
			for (std::size_t n = 0; n < Options[i].size(); n++){
				vector<string> splitPositions;
				split(Options[i][n]->positions, '|', splitPositions);
				if (rfs[m]->actingRank != Options[i][n]->rank){
					continue;
				}
				if (std::find(splitPositions.begin(), splitPositions.end(), cofPostion) == splitPositions.end())
					continue;
				//20200914 ain, mantis#8572, 增加筛选，针对RO优化每轮只分配固定actingRank
				if (crewId != "" && rfs[m]->crewId == crewId) {
					if (!isMatchScenarioActingRank(_dbData, rfs[m]->actingRank))
						continue;
				}
				match[m][Options[i][n]->seqOrder] = true;
				number = max(number, Options[i][n]->seqOrder);
			}
		}
		//得到匹配数组 进行匹配
		std::size_t count = 0;
		memset(segOrders, -1, sizeof(segOrders));
		memset(answer, 0, sizeof(answer));
		for (std::size_t j = 0; j < rfs.size(); j++){
			memset(used, 0, sizeof(used));
			if (findFor8091(j)) count += 1;
		}
		if (count >= rfs.size()){
			for (std::size_t j = 0; j < rfs.size(); j++){
				CrewIdMapToSeqOrder.insert(make_pair(rfs[j]->crewId, answer[j]));
			}
			break;
		}
	}

	if (this->GetApplication() == ROSTER_OPTIMIZER) {
		if (Options.find(i) != Options.end()) {
			if (!Options.at(i).empty()) {
				CrewIdMapToSeqOrder.insert(make_pair("OptionId", i));
			}
		}
	}
	return CrewIdMapToSeqOrder;
}
//返回内容 
//1.号位信息 string ：crewId interesting：号位
//2.string  OptionId  int 具体行号 注 行号从1开始
//3.crewId: 为空表示不检查，非空表示所有flt上该crew都能匹配场景 crewId才认为匹配成功，默认为空(default="")
map<string, int> LegalityChecker::recalculateSegSeqOrderOptimization(Pairing * p, string crewId) {

	long long lapsed = clock();

	map<string, int> CrewIdMapToSeqOrder;
	if (!p->getSegments().size()) {
		return CrewIdMapToSeqOrder;
	}
	Segment* segment = p->getSegment(0);
	// 20200813 优化逻辑按环计算
	for (Segment* obj : p->getSegments()) {
		if (obj->getRankCombCriteriaId() == p->getRankCombCriteriaId()) {
			segment = obj;
			break;
		}
	}
	string pCompositionSource = "I";
	const vector<DBRule> rules = this->_dbData->getRuleFunctions(8091);
	map<string, string>::const_iterator iter;
	string header, headeValue;
	for (auto & rule : rules) {
		for (iter = rule.params.begin(); iter != rule.params.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

			if (header == "COMPOSITION SOURCE") {
				pCompositionSource = headeValue;
				break;
			}
		}
	}
	
	vector<SharedPtr<RosterFlight>> rfs = this->_dbData->rosterFlightMgr.get(segment->getDBId());
	map<long long, vector<SharedPtr<RankCombination>>>::iterator comb_it = this->_dbData->rankCombinationMap.find(segment->getRankCombCriteriaId());

	if (rfs.size() != 0 && comb_it != this->_dbData->rankCombinationMap.end())
	{
		vector<SharedPtr<RankCombination>>& rankCombs = (*comb_it).second;

		CrewIdMapToSeqOrder = getSeqOrderOptimization(rankCombs, rfs, pCompositionSource, crewId);
	}
	RuleStatistics::GetInstancePtr()->addRuleCallClock(RULES::RANK_POSITION_COMB, (clock_t)(clock() - lapsed));
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(RULES::RANK_POSITION_COMB, 1);
	return CrewIdMapToSeqOrder;

}

void  LegalityChecker::recalculateSegSeqOrder(Segment* segment, SharedPtr<CrewDataContext>& dbData){
	time_t lCheckedStart = dbData->scenario.startDtUTC;
	time_t lCheckedEnd = dbData->scenario.endDtUTC + 24 * 3600;
	vector<SharedPtr<RosterFlight>> rfs = dbData->rosterFlightMgr.get(segment->getDBId());
	map<long long, vector<SharedPtr<RankCombination>>>::iterator comb_it = dbData->rankCombinationMap.find(segment->getRankCombCriteriaId());
	if (rfs.size() != 0 && comb_it != dbData->rankCombinationMap.end())
	{
		vector<SharedPtr<RankCombination>>& rankCombs = (*comb_it).second;

		map<string, int> CrewIdMapToSeqOrder = getSeqOrderOptimization(rankCombs, rfs, "I");
		if (CrewIdMapToSeqOrder.size() == 0){
			for (auto rf : rfs){
				rf->seqOrder = -2;
			}
		}
		else{
			for (auto rf : rfs){
				rf->seqOrder = CrewIdMapToSeqOrder[rf->crewId];
			}
		}

	}

};
void  LegalityChecker::recalculatePairingSeqOrder(Pairing* pairing, SharedPtr<CrewDataContext>& dbData){
	vector<Segment*>segs = pairing->getSegments();
	for (auto s : segs){
		recalculateSegSeqOrder(s, dbData);
	}
}

map<string, int> LegalityChecker::getSeqOrderUi(vector<SharedPtr<RankCombination>>& rankCombs, vector<SharedPtr<RosterFlight>> rosterFlights, SharedPtr<ROSTER> roster, string pCompositionSource, const DBRule* singleRule){
	map<string, int> CrewIdMapToSeqOrder;
	map<int ,vector<RankCombination*>>  Options;
	//拆分方案
	for (std::size_t i = 0; i < rankCombs.size(); i++){
		Options[rankCombs[i]->options].push_back(rankCombs[i].get());
	}
	vector<SharedPtr<RosterFlight>> rfs;
	map<string, int> pComp = roster->pairing->getComplements();
	map<string, int> optionComp;
	std::size_t fixSourceOption = 0;
	std::size_t matchFailOptionCount = 0;
	std::size_t matchFailSourceOptionCount = 0;
	std::size_t noOverCrewCount = 0;
	number = 0;
	

	for (int i = 1; i <= (int)Options.size(); i++){
		int checkCount = 0;
		int checkOkCount = 0;
		memset(used, 0, sizeof(used));
		rfs.clear();
		optionComp.clear();
		//将方案中所有的rank存入ranks 筛选crew
		vector<string> ranks;
		for (std::size_t k = 0; k < Options[i].size(); k++){
			ranks.push_back(Options[i][k]->rank);
			if (Options[i][k]->positions == "") continue;
			if (optionComp[Options[i][k]->rank]) {
				optionComp[Options[i][k]->rank] = optionComp[Options[i][k]->rank] + 1;
			}
			else {
				optionComp[Options[i][k]->rank] = 1;
			}
			
		}
		if (pComp == optionComp) {
			fixSourceOption++;
		}
		for (std::size_t j = 0; j < rosterFlights.size(); j++){
			if (rosterFlights[j]->assignment != "OPR" && rosterFlights[j]->assignment != "FLY" && rosterFlights[j]->assignment != "MVO" && rosterFlights[j]->assignment.find("SBY") == string::npos && rosterFlights[j]->assignment != "MC") //增加SBY zzm 20210207
				continue;

			// 根据rankCombCriteria中的assignment字段与rosterFlight中assignment比较 add by jx.jin 2021/1/22
			// 先尝试匹配 rankComb->assignment == seg.assignment
			// 若无匹配则按 rankComb->assignment当作 group再次尝试匹配
			if (!_dbData->isAssignmentIncludeOrInGroup(rosterFlights[j]->assignment, _dbData->rankCombinationCriteriaMap[rankCombs[0]->rankCombCriteriaId])) {
				continue;
			}

			// 忽略非必需成员岗位
			string rank = rosterFlights[j]->actingRank;
			if (!_dbData->rankMap[rank].isMustCrewRank && this->_dbData->rankMap[rank].isActingRank) {
				continue;
			}

			if (find(ranks.begin(), ranks.end(), rosterFlights[j]->actingRank) == ranks.end()) {
				matchFailOptionCount = 0;
				matchFailSourceOptionCount = 0;
				noOverCrewCount = 0;
				break;
			}
			if (rosterFlights[j] && rosterFlights[j]->seqOrder > 0){
				SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosterFlights[j]->crewId];
				//(reverted)20190917 ain,mantis#6713, 按division获取crew,以兼容crew同时具有C/A资格
				string actingRank = rosterFlights[j]->activeRank;
				string fleet = getFleetByFlt(rosterFlights[j]);
				SharedPtr<CREW_RANK>cofActiveRank = _dbData->getCrewRankByActingRank(rosterFlights[j]->crewId, roster->actStrUtc, roster->actRestStrUtc, actingRank, fleet);
				//SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(roster->actStrUtc, roster->actRestStrUtc, fleet);
				//SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(roster->actStrUtc, roster->actRestStrUtc);
				if (!cofActiveRank)
				{
					string msg = "No proper acting rank found for crew {0:crewId} on fleet {1:fleet}.";
					msg = StringUtils::Format(msg, crew->idCrew, fleet);

					// 没有对应的机型rank时 抛出异常
					auto iterFlt = _dbData->flightIdMap.find(rosterFlights[j]->fltId);
					std::shared_ptr<Segment> flt = (iterFlt == _dbData->flightIdMap.end()) ? nullptr : iterFlt->second;
					stringstream ss;
					ss << msg;
					string errorMsg = ss.str();
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = roster->idcrew;
					rv->rosterId = roster->rosterId;
					rv->pairingId = roster->pairId;
					rv->startDTUtc = roster->getStartTimeUtcAct();
					rv->endDTUtc = roster->getEndTimeUtcAct();
					rv->violation_msg = errorMsg;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
					rv->operation_result.insert(pair<string, string>("fltNumber", flt == nullptr ? "" : flt->getFlightNumber()));
					rv->operation_result.insert(pair<string, string>("startStation", flt == nullptr ? "" : this->_dbData->airportCodeMap[flt->getDepStation()]->airportABBR));
					rv->operation_result.insert(pair<string, string>("endStation", flt == nullptr ? "" : this->_dbData->airportCodeMap[flt->getArrStation()]->airportABBR));
					if (this->_dbData)
						this->addRuleViolations(rv, singleRule);
					return CrewIdMapToSeqOrder;
				}
				string cofPostion = cofActiveRank->position;
				for (std::size_t k = 0; k < Options[i].size(); k++){
					if (Options[i][k]->seqOrder == rosterFlights[j]->seqOrder){
						checkCount++;
						if (used[Options[i][k]->seqOrder])continue;
						used[Options[i][k]->seqOrder] = true;
						vector<string> splitPositions;
						split(Options[i][k]->positions, '|', splitPositions);
						if (Options[i][k]->rank != rosterFlights[j]->actingRank)
							continue;
						if (std::find(splitPositions.begin(), splitPositions.end(), cofPostion) == splitPositions.end())
							continue;
						checkOkCount++;
						break;
					}
				}
			}
			else{
				rfs.push_back(rosterFlights[j]);
			}
		}
		
		//已经违规 无需匹配 该方案已经违规
		if (checkCount > checkOkCount){
			matchFailOptionCount++;

			if (pComp == optionComp) matchFailSourceOptionCount++;
			continue;
		}
		if (rfs.size() == 0){
			noOverCrewCount++;
			continue; 
		}
		//crew筛选完 验证 RankCombination与crews的匹配关系
		//初始化匹配数组
		memset(match, 0, sizeof(match));
		for (std::size_t m = 0; m < rfs.size(); m++){
			SharedPtr<CREW> crew = this->_dbData->crewIdMap[rfs[m]->crewId];
			//(reverted)20190917 ain,mantis#6713, 按division获取crew,以兼容crew同时具有C/A资格
			string fleet = getFleetByFlt(rfs[m]);
			string actingRank = rfs.size() > 0 ? rfs[m]->activeRank : roster->actingRank;
			SharedPtr<CREW_RANK>cofActiveRank = _dbData->getCrewRankByActingRank(rfs[m]->crewId, roster->actStrUtc, roster->actRestStrUtc, actingRank, fleet);
			
			//SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(roster->actStrUtc, roster->actRestStrUtc, fleet);
			if (!cofActiveRank)
			{
				std::string msg = "No proper acting rank found for crew {0:crewId} on fleet {1:fleet}.";
				msg = StringUtils::Format(msg, rfs[m]->crewId, fleet);

				// 没有对应的机型rank时 抛出异常
				auto iterFlt = _dbData->flightIdMap.find(rfs[m]->fltId);
				std::shared_ptr<Segment> flt = (iterFlt == _dbData->flightIdMap.end()) ? nullptr : iterFlt->second;
				stringstream ss;
				ss << msg;
				string errorMsg = ss.str();
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = roster->idcrew;
				rv->rosterId = roster->rosterId;
				rv->pairingId = roster->pairId;
				rv->startDTUtc = roster->getStartTimeUtcAct();
				rv->endDTUtc = roster->getEndTimeUtcAct();
				rv->violation_msg = errorMsg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
				rv->operation_result.insert(pair<string, string>("fltNumber", flt == nullptr ? "" : flt->getFlightNumber()));
				rv->operation_result.insert(pair<string, string>("startStation", flt == nullptr ? "" : this->_dbData->airportCodeMap[flt->getDepStation()]->airportABBR));
				rv->operation_result.insert(pair<string, string>("endStation", flt == nullptr ? "" : this->_dbData->airportCodeMap[flt->getArrStation()]->airportABBR));
				if (this->_dbData)
					this->addRuleViolations(rv, singleRule);
				return CrewIdMapToSeqOrder;
			}
			string cofPostion = cofActiveRank->position;
			for (std::size_t n = 0; n < Options[i].size(); n++){
				if (used[Options[i][n]->seqOrder])continue;
				vector<string> splitPositions;
				string s = Options[i][n]->positions;
				split(Options[i][n]->positions, '|', splitPositions);
				if (Options[i][n]->rank != rfs[m]->actingRank
					||std::find(splitPositions.begin(), splitPositions.end(), cofPostion) == splitPositions.end())
					continue;
				match[m][Options[i][n]->seqOrder] = true;
				number = max(number, Options[i][n]->seqOrder);
			}
		}
		//得到匹配数组 进行匹配
		std::size_t count = 0;
		memset(segOrders, -1, sizeof(segOrders));
		memset(answer, 0, sizeof(answer));
		for (std::size_t j = 0; j < rfs.size(); j++){
			memset(used, 0, sizeof(used));
			if (findFor8091(j)) count += 1;
		}
		if (count >= rfs.size() && rfs.size() > 0){
			for (std::size_t j = 0; j < rfs.size(); j++){
				CrewIdMapToSeqOrder.insert(make_pair(rfs[j]->crewId, answer[j]));
			}
			if ("O" == pCompositionSource && pComp != optionComp) continue;
			break;
		}
	}
	Segment* segment = NULL;

	for (auto s : roster->pairing->getSegments()){
		if (s->getDBId() == rosterFlights[0]->fltId){
			segment = s;
			break;
		}
	}

	if (matchFailOptionCount >= Options.size()){
		//iswarn为N时 只要组员符合搭配方案 即使号位错误也可以不告警
		if (!isWarn){
			return getSeqOrderUiAll(Options, rosterFlights, roster, pCompositionSource, singleRule);
		}
		string errorMsg = "The assigned sequence order is illegal.";
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = roster->idcrew;
		rv->rosterId = roster->rosterId;
		rv->pairingId = roster->pairId;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
		rv->violation_msg = errorMsg;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		rv->operation_result.insert(pair<string, string>("ruleId", "8091.1"));
		if (segment != NULL){
			rv->operation_result.insert(pair<string, string>("fltNumber", segment->getFlightNumber()));
			rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[segment->getDepStation()]->airportABBR));
			rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));
			rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->llToa(rankCombs[0]->id)));
		}
		this->addRuleViolations(rv, singleRule);
	}
	else if ("O" == pCompositionSource && matchFailSourceOptionCount >= fixSourceOption) {
		//iswarn为N时 只要组员符合搭配方案 即使号位错误也可以不告警
		if (!isWarn) {
			return getSeqOrderUiAll(Options, rosterFlights, roster, pCompositionSource, singleRule);
		}
		stringstream ss;
		ss << "Cannot find the complement/option of the rank combination criteria.";
		string errorMsg = ss.str();
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = roster->idcrew;
		rv->rosterId = roster->rosterId;
		rv->pairingId = roster->pairId;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
		rv->violation_msg = errorMsg;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		rv->operation_result.insert(pair<string, string>("ruleId", "8091.1"));
		if (segment != NULL) {
			rv->operation_result.insert(pair<string, string>("fltNumber", segment->getFlightNumber()));
			rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[segment->getDepStation()]->airportABBR));
			rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));
			rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->llToa(rankCombs[0]->id)));
		}
		this->addRuleViolations(rv, singleRule);
	}
	else if (CrewIdMapToSeqOrder.size() == 0 && noOverCrewCount == 0){
		stringstream ss;
		ss << "Cannot find the complement/option of the rank combination criteria.";
		string errorMsg = ss.str();
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = roster->idcrew;
		rv->rosterId = roster->rosterId;
		rv->pairingId = roster->pairId;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
		rv->violation_msg = errorMsg;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
		if (segment != NULL){
			rv->operation_result.insert(pair<string, string>("fltNumber", segment->getFlightNumber()));
			rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[segment->getDepStation()]->airportABBR));
			rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));
			rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->llToa(rankCombs[0]->rankCombCriteriaId)));
		}
		this->addRuleViolations(rv, singleRule);
	}
	else if (CrewIdMapToSeqOrder.size() == 0){
		CrewIdMapToSeqOrder.insert(make_pair("isOk", 1));
	}
	return CrewIdMapToSeqOrder;
}
map<string, int> LegalityChecker::getSeqOrderUiAll(map<int, vector<RankCombination*>>& Options, vector<SharedPtr<RosterFlight>> rosterFlights, SharedPtr<ROSTER> roster, string pCompositionSource, const DBRule* singleRule){
	map<string, int> CrewIdMapToSeqOrder;
	vector<SharedPtr<RosterFlight>> rfs;
	map<string, int> pComp = roster->pairing->getComplements();
	map<string, int> optionComp;
	int matchFailOptionCount = 0;
	int noOverCrewCount = 0;
	number = 0;
	for (int i = 1; i <= (int)Options.size(); i++){
		memset(used, 0, sizeof(used));
		rfs.clear();
		//将方案中所有的rank存入ranks 筛选crew
		vector<string> ranks;
		for (std::size_t k = 0; k < Options[i].size(); k++){
			ranks.push_back(Options[i][k]->rank);
			if (Options[i][k]->positions == "") continue;
			if (optionComp[Options[i][k]->rank]) {
				optionComp[Options[i][k]->rank] = optionComp[Options[i][k]->rank] + 1;
			}
			else {
				optionComp[Options[i][k]->rank] = 1;
			}
		}
		for (std::size_t j = 0; j < rosterFlights.size(); j++){
			if (rosterFlights[j]->assignment != "OPR" && rosterFlights[j]->assignment != "FLY" && rosterFlights[j]->assignment != "MVO" && rosterFlights[j]->assignment.find("SBY") == string::npos) //增加SBY zzm 20210207
				continue;

			if (find(ranks.begin(), ranks.end(), rosterFlights[j]->actingRank) == ranks.end())
				continue;		
				rfs.push_back(rosterFlights[j]);
		}

		if (rfs.size() == 0){
			noOverCrewCount++;
			continue;
		}
		//crew筛选完 验证 RankCombination与crews的匹配关系
		//初始化匹配数组
		memset(match, 0, sizeof(match));
		for (std::size_t m = 0; m < rfs.size(); m++){
			SharedPtr<CREW> crew = this->_dbData->crewIdMap[rfs[m]->crewId];
			//(reverted)20190917 ain,mantis#6713, 按division获取crew,以兼容crew同时具有C/A资格
			string fleet = getFleetByFlt(rfs[m]);
			string actingRank = rfs[m]->activeRank;
			SharedPtr<CREW_RANK>cofActiveRank = _dbData->getCrewRankByActingRank(rfs[m]->crewId, roster->actStrUtc, roster->actRestStrUtc, actingRank, fleet);
			
			//SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(roster->actStrUtc, roster->actRestStrUtc, fleet);
			if (!cofActiveRank)
			{
				string msg = "Rule-8091: Crew" + rfs[m]->crewId + " no " + fleet + " active rank while checking crew" + rfs[m]->crewId + ".\n";
				printf(msg.c_str());
				return CrewIdMapToSeqOrder;
			}
			string cofPostion = cofActiveRank->position;
			for (std::size_t n = 0; n < Options[i].size(); n++){
				if (used[Options[i][n]->seqOrder])continue;
				vector<string> splitPositions;
				string s = Options[i][n]->positions;
				split(Options[i][n]->positions, '|', splitPositions);
				if (Options[i][n]->rank != rfs[m]->actingRank
					|| std::find(splitPositions.begin(), splitPositions.end(), cofPostion) == splitPositions.end())
					continue;
				match[m][Options[i][n]->seqOrder] = true;
				number = max(number, Options[i][n]->seqOrder);
			}
		}
		//得到匹配数组 进行匹配
		std::size_t count = 0;
		memset(segOrders, -1, sizeof(segOrders));
		memset(answer, 0, sizeof(answer));
		for (std::size_t j = 0; j < rfs.size(); j++){
			memset(used, 0, sizeof(used));
			if (findFor8091(j)) count += 1;
		}
		if (count >= rfs.size() && rfs.size() > 0){
			for (std::size_t j = 0; j < rfs.size(); j++){
				CrewIdMapToSeqOrder.insert(make_pair(rfs[j]->crewId, answer[j]));
			}
			if ("O" == pCompositionSource && optionComp != pComp) {
				continue;
			}
			break;
		}
	}
	Segment* segment = NULL;

	for (auto s : roster->pairing->getSegments()){
		if (s->getDBId() == rosterFlights[0]->fltId){
			segment = s;
			break;
		}
	}

	if (CrewIdMapToSeqOrder.size() == 0 && noOverCrewCount == 0){
		stringstream ss;
		ss << "Cannot find the complement/option of the rank combination criteria.";
		string errorMsg = ss.str();
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = roster->idcrew;
		rv->rosterId = roster->rosterId;
		rv->pairingId = roster->pairId;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getEndTimeUtcAct();
		rv->violation_msg = errorMsg;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
		if (segment != NULL){
			rv->operation_result.insert(pair<string, string>("fltNumber", segment->getFlightNumber()));
			rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[segment->getDepStation()]->airportABBR));
			rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));
			rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->llToa(Options[1][0]->rankCombCriteriaId)));
		}
		this->addRuleViolations(rv, singleRule);
	}
	return CrewIdMapToSeqOrder;
}
/*
如果返回seqOder >0, 说明法规能够找到合规的seqOrder
*/
int getLegalSeqOrder(vector<SharedPtr<RankCombination>>& rankCombs, vector<SharedPtr<CrewOnFlight>>& crews, SharedPtr<CREW> crew, SharedPtr<ROSTER> roster)
{
	//假设当前crew of flight里crew最多只有一个CREW的SeqOrder <=0,也就是可能所有CREW都有SeqOrder (>0)
	//当前CRWE，要么有SEQODER,要么=0.其他CREW的seqoder都>0
	//if (crew->idCrew == "001812")
	//	printf("");
	int seqOrder = 0;
	string position, activeRank;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;

	SharedPtr<CREW_RANK> rank = crew->getActiveRankInTimes(roster->actStrUtc, roster->actRestStrUtc);

	if (!rank)
		return 0;

	/*得到有几个option方案*/
	/*根据SEQODDER，得到已经ASSIGNED CREW的options方案集合*/
	vector<int> legalOptions;
	int firstCrew = 0;

	for (std::size_t i = 0; i < rankCombs.size(); ++i)
	{
		rankCombs[i]->isUsed = false;
		rankCombs[i]->qualifiedCrews.clear();
	}

	for (std::size_t k = 0; k < crews.size(); k++)
	{
		crews[k]->seqOrder = -1;
		//if (crews[k]->crewId == "001339" || crews[k]->crewId == "004640" || crews[k]->crewId == "000309")
		//	printf("");
		if (crews[k]->assignment != "OPR" && crews[k]->assignment != "FLY")
			continue;
		firstCrew++;
		//int cofOder = singleCrew->seqOrder;
		string cofActingRank = crews[k]->actingRank;
		SharedPtr<CREW_RANK> cofActiveRank = crews[k]->crew->getActiveRankInTimes(roster->actStrUtc, roster->actRestStrUtc);
		if (!cofActiveRank)
		{
			string msg = "Rule-8091: Crew" + crews[k]->crew->idCrew + " no active rank while checking crew" + crew->idCrew + ".\n";
			printf(msg.c_str());
			return 0;
		}

		string cofPostion = cofActiveRank->position;
		vector<int> thisCrewLegalOptions;
		for (std::size_t j = 0; j < rankCombs.size(); j++)
		{
			if (rankCombs[j]->rank != cofActingRank)
				continue;
			//if (rankCombs[j]->seqOrder != cofOder && cofOder > 0)
			//	continue;
			vector<string> splitPositions;
			split(rankCombs[j]->positions, '|', splitPositions);

			if (std::find(splitPositions.begin(), splitPositions.end(), cofPostion) == splitPositions.end())
				continue;
			rankCombs[j]->qualifiedCrews.push_back(crews[k]->crewId);
			//if (comb->isUsed)
			//	continue;

			if (find(thisCrewLegalOptions.begin(), thisCrewLegalOptions.end(), rankCombs[j]->options) == thisCrewLegalOptions.end())
			{
				thisCrewLegalOptions.push_back(rankCombs[j]->options);
			}
		}

		//找不到合规的COMBINATION
		if (thisCrewLegalOptions.size() == 0)
		{
			return 0;
		}
		else
		{
			if (legalOptions.size() == 0)
			{
				for (auto& oneOption : thisCrewLegalOptions)
				{
					legalOptions.push_back(oneOption);
				}
			}
			else
			{
				//合规option的并集
				vector<int> result;
				std::stable_sort(thisCrewLegalOptions.begin(), thisCrewLegalOptions.end());
				std::stable_sort(legalOptions.begin(), legalOptions.end());
				set_intersection(thisCrewLegalOptions.begin(), thisCrewLegalOptions.end(), legalOptions.begin(), legalOptions.end(), std::back_inserter(result));
				if (result.size() == 0)
				{
					return 0;
				}
				else
				{
					legalOptions.clear();
					for (auto& oneOption : result)
					{
						legalOptions.push_back(oneOption);
					}
				}
			}
		}
	}

	/*检查是否在所有option找不到一个合规的组合,保存违规option*/
	vector<int> illegalOption, legalRankCombIndex;
	for (auto& opt : legalOptions)
	{
		/*
		运行此处说明每个CREW都能找到合规号位，下面需要找到seqOrder和检查是否符合组合规则(1个号位只能一个CREW占用)
		需要特殊考虑的是：
		1) 同个RANK的多个CREW如何安排号位，比如两个FO,第一个符合3/4号位，第二个仅仅符合3号位。
		这种情况实际上是合规的，第一个占用4号为，第二个占用3号位。
		2) 比如两个FO,都只符合4号位，也属于违规的
		*/
		for (std::size_t c = 0; c < crews.size(); c++)
		{
			if (crews[c]->assignment != "OPR" && crews[c]->assignment != "FLY")
				continue;
			//找到最小qualified
			int iMinQualifedCrewsCount = (int)crews.size();
			int index = -1;

			for (std::size_t i = 0; i < rankCombs.size(); i++)
			{
				if (rankCombs[i]->options != opt)
					continue;
				if (std::find(rankCombs[i]->qualifiedCrews.begin(), rankCombs[i]->qualifiedCrews.end(), crews[c]->crewId) == rankCombs[i]->qualifiedCrews.end())
					continue;
				if (rankCombs[i]->isUsed)
					continue;

				if ((int)rankCombs[i]->qualifiedCrews.size() <= iMinQualifedCrewsCount)
				{
					if (rankCombs[i]->qualifiedCrews.size() == iMinQualifedCrewsCount && index >= 0)
					{
						if (rankCombs[i]->positions.size() > rankCombs[index]->positions.size())
							continue;
					}
					iMinQualifedCrewsCount = (int)rankCombs[i]->qualifiedCrews.size();
					index = (int)i;
				}
			}
			//违规组合
			if (index < 0)
			{
				if (std::find(illegalOption.begin(), illegalOption.end(), opt) == illegalOption.end())
					illegalOption.push_back(opt);
				break;
			}
			else
			{
				rankCombs[index]->isUsed = true;
			}
		}
	}
	/*集合减操作*/
	for (auto& illegal : illegalOption)
	{
		legalOptions.erase(std::remove(std::begin(legalOptions), std::end(legalOptions), illegal), std::end(legalOptions));
	}

	if (legalOptions.size() == 0)
		return 0;

	for (std::size_t i = 0; i < rankCombs.size(); ++i)
	{
		rankCombs[i]->isUsed = false;
	}
	//剔除违规组合后，计算seqOrder
	for (auto legal : legalOptions)
	{
		for (std::size_t c = 0; c < crews.size(); c++)
		{
			if (crews[c]->assignment != "OPR" && crews[c]->assignment != "FLY")
				continue;
			//找到最小qualified
			std::size_t iMinQualifedCrewsCount = crews.size();
			int index = -1;
			for (std::size_t i = 0; i < rankCombs.size(); i++)
			{
				if (rankCombs[i]->options != legal)
					continue;
				if (rankCombs[i]->isUsed)
					continue;
				if (std::find(rankCombs[i]->qualifiedCrews.begin(), rankCombs[i]->qualifiedCrews.end(), crews[c]->crewId) == rankCombs[i]->qualifiedCrews.end())
					continue;

				if (rankCombs[i]->qualifiedCrews.size() <= iMinQualifedCrewsCount)
				{
					if (rankCombs[i]->qualifiedCrews.size() == iMinQualifedCrewsCount && index >= 0)
					{
						if (rankCombs[i]->positions.size() > rankCombs[index]->positions.size())
							continue;
					}
					iMinQualifedCrewsCount = rankCombs[i]->qualifiedCrews.size();
					index = (int)i;
					break;
				}
			}
			if (index >= 0)
			{
				crews[c]->seqOrder = rankCombs[index]->seqOrder;
				rankCombs[index]->isUsed = true;
				if (crews[c]->crewId == crew->idCrew)
				{
					legalRankCombIndex.push_back(index);
					roster->seqOrder = crews[c]->seqOrder;
				}
				else
				{
					for (std::size_t r = 0; r < crews[c]->crew->rosterList.size(); r++)
					{
						if (crews[c]->crew->rosterList[r]->pairId == crews[c]->pairingId)
						{
							crews[c]->crew->rosterList[r]->seqOrder = crews[c]->seqOrder;
							break;
						}
					}
				}
			}
		}

		for (auto opt : legalRankCombIndex)
		{
			if (rankCombs[opt]->options != legal)
				continue;
			seqOrder = rankCombs[opt]->seqOrder;
			return seqOrder;
		}
	}

	return seqOrder;
}

//8091-RANK_POSITION_COMB
bool LegalityChecker::checkRankPositionComb(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	if (pCrew->crewIndex < 0 || pCrew->crewIndex >= (int)_dbData->crewList.size())
		return true;
	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	
	if (rosters.size() == 0)
		return true;

	map<long long, vector<SharedPtr<RankCombination>>>& combs = this->_dbData->rankCombinationMap;
	string actingRank;
	long long fltId = 0;
	long long combId = 0;
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;
	bool reset = true;
	string pDuties = "FLY|OPR|SBY|MVO", pBase = "*", pRank = "*", pFleet = "*";
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")			 pBase = headeValue;
		if (header == "RANKS")			 pRank = headeValue;
		if (header == "FLEETS")			 pFleet = headeValue;
		//设置检查法规的ROSTER DUTIES
		if (header == "ROSTER DUTIES")	 pDuties = headeValue;
		if (header == "CALCULATESEQORDER TYPE")		headeValue == "RESET" ? reset = true : reset = false;
		if (header == "IS WARN")headeValue == "Y" ? isWarn = true : isWarn = false;
	}
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBase, pRank, pFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;
	vector<string> strAssignGoups;
	split(pDuties, '|', strAssignGoups);

	for (auto& roster : rosters)
	{
		if (!roster->pairing)
			continue;
		if (this->_application == ROSTER_OPTIMIZER) {
			if (roster->source != "CR" || roster->pairing->getStartTime() < this->_dbData->scenario.startDtUTC || roster->pairId != this->_dbData->pairingList[pCrew->PairingIndex]->getDbId())
				continue;

			/*if (this->_dbData->pairingList[pCrew->PairingIndex]->getPairingNum() != roster->pairing->getPairingNum())
				continue;*/
		}

		if (pDuties != "*")
		{
			if (std::find(strAssignGoups.begin(), strAssignGoups.end(), roster->duty) == strAssignGoups.end())
				continue;
		}
		
		vector<Duty *> duties = roster->pairing->getDutyVec();
		vector<long long> combIdChecked; //针对优化使用。如果segment具有同样的combId，只检查一次就好
		for (auto& duty : duties)
		{
			vector<Segment*> segments = duty->getSegments();
			for (auto& segment : segments)
			{
				//if ((crew->idCrew == "0000985" || crew->idCrew == "002781") && roster->pairId == 27401983)
				//	printf("");
				fltId = segment->getDBId();
				combId = segment->getRankCombCriteriaId();
				
				//针对优化使用。如果segment具有同样的combId，只检查一次就好
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					if (combIdChecked.empty() || find(combIdChecked.begin(), combIdChecked.end(), combId) == combIdChecked.end())
						combIdChecked.push_back(combId);
					else
						continue;
				}
				
				map<long long, vector<SharedPtr<RankCombination>>>::iterator comb_it = combs.find(combId);		
				vector<SharedPtr<RosterFlight>> rfs = this->_dbData->rosterFlightMgr.get(fltId);
				//检查8091配比时，忽略DHD的rosterFlight
				vector<SharedPtr<RosterFlight>>::iterator rfs_itr = rfs.begin();
				while (rfs_itr != rfs.end()) {
					if ((*rfs_itr)->assignment == "DHD")
						rfs_itr = rfs.erase(rfs_itr);
					else
						++rfs_itr;
				}
				
				if (comb_it != combs.end() && rfs.size() != 0)
				{
					vector<SharedPtr<RankCombination>>& rankCombs = (*comb_it).second;
					map<string, int> CrewIdMapToSeqOrder;
					
					//判断是否已经违规 违规既不用判断
					if (this->GetApplication() == ROSTER_OPTIMIZER || _dbData->Is8091AlwaysResetSeqOrder()){
						CrewIdMapToSeqOrder = getSeqOrderOptimization(rankCombs, rfs, "I");
					}
					else{
						CrewIdMapToSeqOrder = getSeqOrderUi(rankCombs, rfs, roster, "I", singleRule);
					}
					
					if (CrewIdMapToSeqOrder.size() == 0) {
						//如果号位表里为空 则观察原成员均有号位
						for (auto rf : rfs){
							if (rf->seqOrder <= 0){
								bReturn = false;

								//针对优化使用。如果违规，直接return false
								if (this->GetApplication() == ROSTER_OPTIMIZER)
									return false;
							}
						}
						//如果为updatelist流程 则告警
						if (!bReturn && _dbData->Is8091AlwaysResetSeqOrder()){
							stringstream ss;
							ss << "Cannot find the complement/option of the rank combination criteria.";
							string errorMsg = ss.str();
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->crewId = roster->idcrew;
							rv->rosterId = roster->rosterId;
							rv->pairingId = roster->pairId;
							rv->startDTUtc = roster->getStartTimeUtcAct();
							rv->endDTUtc = roster->getEndTimeUtcAct();
							rv->violation_msg = errorMsg;
							rv->type = VIOLATION_TYPE::CREW_VIOLATION;
							rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
							rv->operation_result.insert(pair<string, string>("fltNumber", segment->getFlightNumber()));
							rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[segment->getDepStation()]->airportABBR));
							rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));
							rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->llToa(combId)));
							if (this->_dbData)
							this->addRuleViolations(rv, singleRule);
							continue;
						}
					}
					else if (CrewIdMapToSeqOrder.find("isOk") != CrewIdMapToSeqOrder.end()){
					}
					else{
						//20191214 ain, mantis#7289, 问题3, 仅更新getSeqOrderUi()结果中包含的crew号位，避免flt上其他crew号位清0
						/*if (CrewIdMapToSeqOrder.find(roster->idcrew) != CrewIdMapToSeqOrder.end()) {
							roster->seqOrder = CrewIdMapToSeqOrder[roster->idcrew];
						}*/
						vector<string> rfRanks;
						bool f = true;
						for (auto rf : rfs) {
							rfRanks.push_back(rf->actingRank);
							
							if (this->GetApplication() == ROSTER_OPTIMIZER || reset) {
								if (CrewIdMapToSeqOrder.find(rf->crewId) == CrewIdMapToSeqOrder.end()) {
									f = false;
									bReturn = false;
								}
							}
							else {
								if (rf->seqOrder > 0 && CrewIdMapToSeqOrder.find(rf->crewId) != CrewIdMapToSeqOrder.end()
									&& rf->seqOrder != CrewIdMapToSeqOrder[rf->crewId]) {
									f = false;
								}
							}
						}
						if (f||reset)
						for (auto rf : rfs) {
							if (CrewIdMapToSeqOrder.find(rf->crewId) != CrewIdMapToSeqOrder.end())
								if (this->GetApplication() == ROSTER_OPTIMIZER || reset){
									rf->seqOrder = CrewIdMapToSeqOrder[rf->crewId];
								}
								else if (rf->seqOrder <= 0){
									rf->seqOrder = CrewIdMapToSeqOrder[rf->crewId];
								}
						}
						
					}
					//int getOder = getLegalSeqOrder(rankCombs, crews, crew, roster);
					//if (getOder <= 0)
					//{
					//	//if (crew->idCrew != "000080" && crews[0]->crewId != "000080")
					//	//	printf("");
					//	bReturn = false;
					//	stringstream ss;
					//	ss << "Cannot find the legal rank combination in this roster with acting rank(" << roster->actingRank
					//		<< ") on flight(" << segment->getAirlineCode() << segment->getFlightNumber()
					//		<< "/" << segment->getDate() << ").";
					//	string errorMsg = ss.str();
					//	setLegalityMessage(crew, pCrew, singleRule, errorMsg);
					//	pCrew->isLegal = false;
					//	RULE_VIOLATION* rv = new RULE_VIOLATION();
					//	rv->crewId = crew->idCrew;
					//	rv->rosterId = roster->rosterId;
					//	rv->pairingId = roster->pairId;
					//	rv->segmentId = segment->getDBId();
					//	rv->startDTUtc = segment->getStartTimeUtcAct();
					//	rv->endDTUtc = segment->getEndTimeUtcAct();
					//	rv->violation_msg = errorMsg;
					//	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					//	rv->operation_result.insert(pair<string, string>("Acting Rank", roster->actingRank));
					//	rv->operation_result.insert(pair<string, string>("RankCombCriteriaId", Utility::GetInstancePtr()->llToa(roster->pairing->getRankCombCriteriaId())));
					//	rv->operation_result.insert(pair<string, string>("AirlineCode", segment->getAirlineCode()));
					//	rv->operation_result.insert(pair<string, string>("FlightNumber", segment->getFlightNumber()));
					//	rv->operation_result.insert(pair<string, string>("Date", segment->getDate()));
					//	this->addRuleViolations(rv, singleRule);
					//}
					//else
					//{
					//	/*
					//	roster->seqOrder = getOder;
					//	for (auto& single : crews)
					//	{
					//	if (single->crewId == crew->idCrew)
					//	{
					//	single->seqOrder = getOder;
					//	break;
					//	}
					//	}
					//	*/
					//}
				}
			}
		}
	}
	//vector<SharedPtr<ROSTER>>& rs = _dbData->crewList[32]->rosterList;

	return bReturn;
}


bool LegalityChecker::checkRankPositionCombFor3(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	if (pCrew->crewIndex < 0 || pCrew->crewIndex >= (int)_dbData->crewList.size())
		return true;
	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;
	if (this->_application == ROSTER_OPTIMIZER) {
		if (!crew->rosterList[pCrew->RosterIndex]->pairing)
			return true;
	}
    map<long long, SharedPtr<RankCombinationCriteria>>& rankCombinationCriteriaMap = this->_dbData->rankCombinationCriteriaMap;
	map<long long, vector<SharedPtr<RankCombination>>>& combs = this->_dbData->rankCombinationMap;
	string actingRank;
	long long fltId = 0;
	long long combId = 0;
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;
	bool reset = true;
	string pDuties = "FLY|OPR|SBY|MVO|GND|SIM|TRAINING", pBase = "*", pRank = "*", pFleet = "*", pCompositionSource = "I";
	bool checkPosition = true;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")			 pBase = headeValue;
		if (header == "RANKS")			 pRank = headeValue;
		if (header == "FLEETS")			 pFleet = headeValue;
		//设置检查法规的ROSTER DUTIES
		if (header == "ROSTER DUTIES")	 pDuties = headeValue;
		if (header == "CALCULATESEQORDER TYPE")		headeValue == "RESET" ? reset = true : reset = false;
		if (header == "IS WARN")headeValue == "Y" ? isWarn = true : isWarn = false;
		if (header == "COMPOSITION SOURCE")			pCompositionSource = headeValue;
		if (header == "CHECK POSITION")			checkPosition = headeValue == "Y";
	}
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBase, pRank, pFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;
	vector<string> strAssignGoups;
	split(pDuties, '|', strAssignGoups);

	for (auto& roster : rosters)
	{
		if (!roster->pairing)
			continue;
	/*	if (roster->pairId == 60816542) {
			printf("");
		}*/
		if (this->_application == ROSTER_OPTIMIZER) {
			//1. 预占任务不用检查
			//2. 发生在本scenario开始之前的pairing不用检查
			//3. 只坚持本次新分配的任务，已分配的不用检查
			if (roster->source != "CR" || roster->pairing->getStartTime() < this->_dbData->scenario.startDtUTC || roster->pairId != this->_dbData->pairingList[pCrew->PairingIndex]->getDbId())
				continue;
		}

		if (pDuties != "*")
		{
			if (std::find(strAssignGoups.begin(), strAssignGoups.end(), roster->duty) == strAssignGoups.end())
				continue;
		}
		vector<Duty *> duties = roster->pairing->getDutyVec();
		vector<long long> combIdChecked; //针对优化使用。如果segment具有同样的combId，只检查一次就好
		for (auto& duty : duties)
		{
			vector<Segment*> segments = duty->getSegments();
			for (auto& segment : segments)
			{
				//if ((crew->idCrew == "0000985" || crew->idCrew == "002781") && roster->pairId == 27401983)
				//	printf("");
				
				//针对优化，如果不是operating类的segment，就忽略检查
				if (this->GetApplication() == ROSTER_OPTIMIZER && segment->getAssignment() != "OPR" && segment->getAssignment() != "FLY" && segment->getAssignment() != "MVO" && segment->getAssignment().find("SBY") == string::npos && segment->getAssignment() != "SIM" && segment->getAssignment() != "TRAINING")
					continue;
				if (segment->getAssignment() == "PSG" || segment->getAssignment() == "PSB" || segment->getAssignment() == "DHD" || segment->getAssignment() == "BUG" || segment->getAssignment() == "TVL" || segment->getAssignment() == "TRAINING" || segment->getAssignment() == "HSR")
					continue;
				fltId = segment->getDBId();
				for (auto& division : this->_dbData->scenario.divisionConstruction) 
				{
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						combId = segment->getRankCombCriteriaId();
						//Pairing上的rankCombCriteriaId为duty中的最大值，目前逻辑：只考虑检查这个值
						if (combId != roster->pairing->getRankCombCriteriaId())
							continue;
					}
					else if (division == "P") {
						combId = segment->getRankCombCP();
					}
					else if (division == "C") {
						combId = segment->getRankCombCC();
					}
					else if (division == "A") {
						combId = segment->getRankCombCA();
					}

					//特殊情况，QQ有extra standbys的任务环(为了填补空白天)，不需要检查8091
					if (rankCombinationCriteriaMap.find(combId) != rankCombinationCriteriaMap.end() &&  rankCombinationCriteriaMap[combId]->assignment == "EXSBY")
						continue;

					//针对优化使用。如果segment具有同样的combId，只检查一次就好
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						if (combIdChecked.empty() || find(combIdChecked.begin(), combIdChecked.end(), combId) == combIdChecked.end())
							combIdChecked.push_back(combId);
						else
							continue;
					}

					map<long long, vector<SharedPtr<RankCombination>>>::iterator comb_it = combs.find(combId);
									
					vector<SharedPtr<RosterFlight>> rfs = this->_dbData->rosterFlightMgr.get(fltId);
					if (this->GetApplication() == ROSTER_OPTIMIZER && segment->getAssignment().find("SBY") != string::npos && fltId == 0) {
						vector<SharedPtr<RosterFlight>> rfs_tmp;
						rfs_tmp.swap(rfs);
						rfs.clear();
						for (auto& rf : rfs_tmp) {
							if (rf->pairingId != roster->pairing->getDbId())
								continue;

							rfs.push_back(rf);
						}
					}
					//处理多部门人员数据同时存在rosterFlight上，刨除跟本场景不相关的人员。比如说跑飞行员场景，rosterOnFlight的乘务刨除
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						auto& combIdToRankToNum = this->_dbData->rankCombIdToActingRankToNum;
						std::vector<SharedPtr<RosterFlight>>::iterator it = rfs.begin();
						auto& combIdToRank = combIdToRankToNum[combId];
						while (it != rfs.end()) {
							if (combIdToRankToNum[combId].find((*it)->actingRank) == combIdToRankToNum[combId].end())
								it = rfs.erase(it);
							else
								it++;
						}
					}

					if (comb_it == combs.end()) {
						if(this->GetApplication() == ROSTER_OPTIMIZER) return false;
						stringstream ss;
						ss << "Cannot find the complement/option of the rank combination criteria.";
						string errorMsg = ss.str();
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = roster->idcrew;
						rv->rosterId = roster->rosterId;
						rv->pairingId = roster->pairId;
						rv->startDTUtc = roster->getStartTimeUtcAct();
						rv->endDTUtc = roster->getEndTimeUtcAct();
						rv->violation_msg = errorMsg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
						rv->operation_result.insert(pair<string, string>("fltNumber", segment->getFlightNumber()));
						rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[segment->getDepStation()]->airportABBR));
						rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));
						rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->llToa(combId)));
						if (this->_dbData)
							this->addRuleViolations(rv, singleRule);
						continue;
					}

					//检查8091配比时，忽略DHD的rosterFlight
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						vector<SharedPtr<RosterFlight>>::iterator rfs_itr = rfs.begin();
						while (rfs_itr != rfs.end()) {
							if ((*rfs_itr)->assignment != "OPR" && (*rfs_itr)->assignment != "FLY" && (*rfs_itr)->assignment != "MVO" && (*rfs_itr)->assignment.find("SBY") == string::npos && (*rfs_itr)->assignment != "SIM" && (*rfs_itr)->assignment != "TRAINING")
								rfs_itr = rfs.erase(rfs_itr);
							else
								++rfs_itr;
						}
					}

                    //QQ SrvB时特殊处理，Training单独成环，一个training的人有一个环及其对应的roster.
                    if(this->GetApplication() == ROSTER_OPTIMIZER && this->_dbData->scenario.airline == "QQ"){
                        const auto& pairingComp = this->_dbData->pairingList[pCrew->PairingIndex]->getComplements();
                        auto itComp = pairingComp.find("FA");
                        if(itComp != pairingComp.end() && itComp->second == 2){
                            vector<SharedPtr<RosterFlight>>::iterator rfs_itr = rfs.begin();
                            while (rfs_itr != rfs.end()) {
                                if((*rfs_itr)->pairingId != this->_dbData->pairingList[pCrew->PairingIndex]->getDbId())
                                    rfs_itr = rfs.erase(rfs_itr);
                                else
                                    ++rfs_itr;
                            }
                        }
                    }

					// ROSCRW-376 改造8091，先加个判断，如果是JG的情况下，赋值seqOrder，否则不用计算
					if (comb_it != combs.end() && rfs.size() != 0)
					{
						vector<SharedPtr<RankCombination>>& rankCombs = (*comb_it).second;
						
						//20191214 ain, mantis#7289, 问题3, 仅更新getSeqOrderUi()结果中包含的crew号位，避免flt上其他crew号位清0
						/*if (CrewIdMapToSeqOrder.find(roster->idcrew) != CrewIdMapToSeqOrder.end()) {
							roster->seqOrder = CrewIdMapToSeqOrder[roster->idcrew];
						}*/
						vector<string> rfRanks;
						//bool f = true;
						//for (auto rf : rfs) {
						//	// 增加非必须成员岗位过滤
						//	// 过滤乘机任务 2022.08.15 jiaxin.jin
						//	if (this->_dbData->version != 3 || (this->_dbData->rankMap[rf->actingRank].isMustCrewRank && !(rf->assignment == "PSG" || rf->assignment == "PSB" || rf->assignment == "DHD" || rf->assignment == "BUG" || rf->assignment == "TVL"))) {
						//		rfRanks.push_back(rf->actingRank);
						//	}


						//}

						vector<SharedPtr<RosterFlight>> filterRosterFlights;
						for (const auto& rf : rfs) {
							if (rf->division == division)
								filterRosterFlights.push_back(rf);
						}
					
							
						vector<int> segOptions = getSegmentOptions(combId, filterRosterFlights, segment, division, roster->pairing, pCompositionSource, checkPosition);
						bool has = checkSegHasMoreThanTowPairing(roster->pairing);
						if (segOptions.size() == 0 && !has) {
							if(this->GetApplication() == ROSTER_OPTIMIZER) return false;
							stringstream ss;
							ss << "Cannot find the complement/option of the rank combination criteria.";
							string errorMsg = ss.str();
							this->setLegalityMessage(roster->pairing, singleRule, errorMsg);
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->crewId = roster->idcrew;
							rv->rosterId = roster->rosterId;
							rv->pairingId = roster->pairId;
							rv->startDTUtc = roster->getStartTimeUtcAct();
							rv->endDTUtc = roster->getEndTimeUtcAct();
							rv->violation_msg = errorMsg;
							rv->type = VIOLATION_TYPE::CREW_VIOLATION;
							rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
							rv->operation_result.insert(pair<string, string>("fltNumber", segment->getFlightNumber()));
							rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[segment->getDepStation()]->airportABBR));
							rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));
							rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->llToa(combId)));
							if (this->_dbData)
								this->addRuleViolations(rv, singleRule);
							continue;
						}
						if (division == "P" && !has) segment->setRankCombOP(joinIntList(segOptions, ","));
						if (division == "C" && !has) segment->setRankCombOC(joinIntList(segOptions, ","));
						if (division == "A" && !has) segment->setRankCombOA(joinIntList(segOptions, ","));
						
					}
				}
				
			}
		}
		vector<Segment*> segments = roster->pairing->getSegments();
		for (auto& division : this->_dbData->scenario.divisionConstruction)
		{
			if (division == "P") roster->pairing->setRankCombOP(getPairingOptions(segments, division));
			if (division == "C") roster->pairing->setRankCombOC(getPairingOptions(segments, division));
			if (division == "A") roster->pairing->setRankCombOA(getPairingOptions(segments, division));
		}
	}

	return bReturn;
}

bool LegalityChecker::checkSegHasMoreThanTowPairing(Pairing* p) {
	bool has = false;
	for (auto& seg : p->getSegments()) {
		if (this->_dbData->flightIdToPairing[seg->getDBId()].size() > 1) {
			for (auto& id : this->_dbData->flightIdToPairing[seg->getDBId()]) {
				if (id != p->getDbId()) {
					auto other = this->_dbData->pairingIdMap[id];
					for (auto division : this->_dbData->scenario.divisionConstruction) {
						if (division == "P" && other->getRankCombCP() != 0) {
							has = true;
						}
						if (division == "C" && other->getRankCombCC() != 0) {
							has = true;
						}
						if (division == "A" && other->getRankCombCA() != 0) {
							has = true;
						}
					}
				}
			}
		}
	}
	return has;
}

// 汇总segment的options， 取交集
string LegalityChecker::getPairingOptions(vector<Segment*> segments, string division) {
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
				rankCombOptions.push_back(rco);
			}
			else if (division == "C") {
				split(segment->getRankCombOC(), ',', rco);
				rankCombOptions.push_back(rco);
			}
			else if (division == "A") {
				split(segment->getRankCombOA(), ',', rco);
				rankCombOptions.push_back(rco);
			}
		}
		vector<string> id_instersection;
		if (rankCombOptions.size() > 1) {
			id_instersection = rankCombOptions[0];
			for (std::size_t i = 1; i < rankCombOptions.size(); i++) {
				//解决set_intersection奔溃问题 20220623
				vector<string>  tempInst;

				vector<string> seg = rankCombOptions[i];
				std::stable_sort(id_instersection.begin(), id_instersection.end());
				std::stable_sort(seg.begin(), seg.end());
				std::set_union(id_instersection.begin(), id_instersection.end(), seg.begin(), seg.end(), std::back_inserter(tempInst));

				id_instersection.swap(tempInst);
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
vector<int> LegalityChecker::getSegmentOptions(long long rankCombID, vector<SharedPtr<RosterFlight>> rfs, Segment* seg, string division, Pairing* p, string pCompositionSource, bool checkPosition) {
	vector<SharedPtr<RankCombination>>& rankCombs = this->_dbData->rankCombinationMap[rankCombID];
	vector<int> fixOptions;
	map<string, int> rfRankNums;
	vector<SharedPtr<RosterFlight>> rosterFlights;
	// 获取rosterFlight的所有级别以及数量
	for (auto rf : rfs) {
		// 过滤乘机任务
		if (rf->assignment == "PSG" || rf->assignment == "PSB" || rf->assignment == "DHD" || rf->assignment == "BUG" || rf->assignment == "TRAIN" || rf->assignment == "HSR") continue;
		string rank = rf->actingRank;
		// 增加非必须成员岗位过滤
		if (_dbData->rankMap[rank].isMustCrewRank && _dbData->rankMap[rank].division == division) {
			rosterFlights.push_back(rf);
			if (rfRankNums[rank]) {
				rfRankNums[rank] = rfRankNums[rank] + 1;
			}
			else {
				rfRankNums[rank] = 1;
			}
		}
	}

	vector<long long> pairingIds = this->_dbData->flightIdToPairing[seg->getDBId()];
	vector<Segment*> segment;
	map<string, int> segCompMap;
	for (auto& ptnId : pairingIds) {
		if (ptnId != p->getDbId()) {
			Pairing* p = this->_dbData->pairingIdMap[ptnId];

			for (auto& s : p->getSegments()) {
				if (s->getAssignment() != "PSG" && s->getAssignment() != "PSB" && s->getAssignment() != "DHD" && s->getAssignment() != "BUG" && s->getAssignment() != "TVL" && s->getAssignment() != "HSR"
					&& s->getDBId() == seg->getDBId()) {
					segment.push_back(s);
				}
			}
			if (segment.size() > 0) {
				map<string, int>::iterator iter;


				map<string, int> map = p->getComplements();
				for (iter = map.begin(); iter != map.end(); iter++) {
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

	// 获取flt上的composition
	map<string, int> compositionMap;
	if (segment.size() > 0) {
		compositionMap = segment[0]->getPlanComposition();
	}

	// 一个flt处于多个ptn时，记录原有所处ptn的plan配比
	map<string, int> pairCompMap = p->getComplements();

	// splitPairing， 单独切一个非必须成员岗位导致找不到配比
	map<string, int>::iterator pairIter;
	bool isNoMustRank = false;
	for (pairIter = pairCompMap.begin(); pairIter != pairCompMap.end(); pairIter++) {
		if (!_dbData->rankMap[pairIter->first].isMustCrewRank) {
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
		map<string, int> rankCombNums;
		vector<string> ranks;
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
		// 适配外部来源的配比
		// compositionSource == "O" 是外部来源
		// 只判断配比是否符合option，不在动态计算
		if (pCompositionSource == "O" && rankCombNums != pairCompMap) {
			continue;
		}

		// 航班处于多个pairing中时，如果option和其他pairing的composition相同，直接跳过
		if (rankCombNums == segCompMap && !isNoMustRank) continue;
		map<string, int>::iterator rfRank;
		bool fix = true;
		if (rosterFlights.size() == 0) {
			for (auto& rankComb : rankCombs) {
				fixOptions.push_back(rankComb->options);
			}
		}
		for (rfRank = rfRankNums.begin(); rfRank != rfRankNums.end(); rfRank++) {
			if (rankCombNums.find(rfRank->first) == rankCombNums.end() || rankCombNums[rfRank->first] < rfRank->second) {
				fix = false;
				break;
			}
		}
		if (fix && seg != NULL) {
			if ((division == "P" && rankCombID == seg->getRankCombCP()) || division == "C" && rankCombID == seg->getRankCombCC()
				|| division == "A" && rankCombID == seg->getRankCombCA()) {
				map<string, int>::iterator comp;
				bool num = true;
				if ((division == "P" && p->getRankCombCP() == 0) || (division == "C" && p->getRankCombCC() == 0) || (division == "A" && p->getRankCombCA() == 0)) {
					num = false;
				}
				map<string, int>::iterator segIter;
				for (comp = compositionMap.begin(); comp != compositionMap.end(); comp++) {
					if (this->_dbData->rankMap[comp->first].division == division && rankCombNums.find(comp->first) == rankCombNums.end()) {
						fix = false;
						break;
					}
					if (segCompMap.find(comp->first) == segCompMap.end() || segCompMap[comp->first] < comp->second) {
						fix = true;
						break;
					}
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
		if (fix && checkPosition) {
			fix = checkPositionForOption(rosterFlights, rankCombNums, op->second, ranks);
		}
		if (fix) {
			fixOptions.push_back(op->first);
		}
	}

	stable_sort(fixOptions.begin(), fixOptions.end());
	int a = static_cast<int>(unique(fixOptions.begin(), fixOptions.end()) - fixOptions.begin());
	vector<int> res(fixOptions.begin(), fixOptions.begin() + a);
	sort(res.begin(), res.end());
	return res;
}


bool LegalityChecker::checkPositionForOption(vector<SharedPtr<RosterFlight>> rosterFlights, map<string, int> optionComp, vector<RankCombination*> Options, vector<string> ranks) {
	if (rosterFlights.empty()) {
		return true;
	}
	map<string, int> CrewIdMapToSeqOrder;
	int fixSourceOption = 0;
	int matchFailOptionCount = 0;
	int matchFailSourceOptionCount = 0;
	int noOverCrewCount = 0;
	number = 0;
	int checkCount = 0;
	int checkOkCount = 0;
	memset(used, 0, sizeof(used));
	vector<SharedPtr<RosterFlight>> rfs;
	vector<RankCombination*> option;
	for (const auto& op : Options) {
		if (!op->positions.empty()) {
			option.push_back(op);
		}
	}

	for (std::size_t i = 0; i < rosterFlights.size(); i++) {
		string rank = rosterFlights[i]->actingRank;
		if (!_dbData->rankMap[rank].isMustCrewRank && _dbData->rankMap[rank].isActingRank) {
			continue;
		}

		if (find(ranks.begin(), ranks.end(), rank) == ranks.end()) {
			return false;
		}
		rfs.push_back(rosterFlights[i]);
	}
	//初始化匹配数组
	memset(match, 0, sizeof(match));
	for (std::size_t m = 0; m < rfs.size(); m++) {
		if (_dbData->pairingIdMap.find(rfs[m]->pairingId) == _dbData->pairingIdMap.end()) {
			continue;
		}

		SharedPtr<CREW> crew = _dbData->crewIdMap[rfs[m]->crewId];
		//(reverted)20190917 ain,mantis#6713, 按division获取crew,以兼容crew同时具有C/A资格
		string fleet = getFleetByFlt(rfs[m]);
		const auto& roster = _dbData->findRoster(rfs[m]->crewId, rfs[m]->rosterId);
		//if (roster == NULL) continue;
		// 长龙有备份任务，没有对应的rosterId, 使用rf中的pairing的开始结束时间
		string actingRank = rfs.size() > 0 ? (rfs[m]->activeRank.empty() ? rfs[m]->actingRank :rfs[m]->activeRank) : roster->actingRank;
		time_t rosterStart = 0;
		time_t rosterEnd = 0;
		if (roster == NULL) {
			rosterStart = _dbData->pairingIdMap[rfs[m]->pairingId]->getStartTimeUtcAct();
			rosterEnd = _dbData->pairingIdMap[rfs[m]->pairingId]->getEndTimeUtcAct();
		}
		else {
			rosterStart = roster->actStrUtc;
			rosterEnd = roster->actEndUtc;
		}
		SharedPtr<CREW_RANK>cofActiveRank = _dbData->getCrewRankByActingRank(rfs[m]->crewId, rosterStart, rosterEnd, actingRank, fleet);

		//SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(roster->actStrUtc, roster->actRestStrUtc, fleet);
		if (!cofActiveRank)
		{
			return false;
		}
		string cofPostion = cofActiveRank->position;
		for (std::size_t n = 0; n < option.size(); n++) {
			if (used[option[n]->seqOrder])continue;
			vector<string> splitPositions;
			string s = option[n]->positions;
			split(option[n]->positions, '|', splitPositions);
			if (option[n]->rank != rfs[m]->actingRank
				|| std::find(splitPositions.begin(), splitPositions.end(), cofPostion) == splitPositions.end())
				continue;
			match[m][option[n]->seqOrder] = true;
			number = max(number, option[n]->seqOrder);
		}
	}
	//得到匹配数组 进行匹配
	std::size_t count = 0;
	memset(segOrders, -1, sizeof(segOrders));
	memset(answer, 0, sizeof(answer));
	for (std::size_t j = 0; j < rfs.size(); j++) {
		memset(used, 0, sizeof(used));
		if (findFor8091(j)) count += 1;
	}
	if (count >= rfs.size() && rfs.size() > 0) {
		for (std::size_t j = 0; j < rfs.size(); j++) {
			CrewIdMapToSeqOrder.insert(make_pair(rfs[j]->crewId, answer[j]));
		}
		return true;
	}

	if (CrewIdMapToSeqOrder.size() != rfs.size()) {
		return false;
	}
	return false;
}

static bool isMatchScenarioActingRank(SharedPtr<CrewDataContext>& dbData, string& rank) {
	auto& ranks = dbData->scenario.actingRanks;
	return find(ranks.begin(), ranks.end(), rank) != ranks.end();
}

bool LegalityChecker::checkRankCombination(Pairing* pairing, const DBRule* singleRule) {
	bool rReturn = true;
	if (pairing) {
		for (auto& division : this->_dbData->scenario.divisionConstruction) {
			if ((division == "P" && pairing->getRankCombCP() == 0) || (division == "C" && pairing->getRankCombCC() == 0)
				|| (division == "A" && pairing->getRankCombCA() == 0)) {
				rReturn = false;
			}
		}

		if (!rReturn) {
            if (this->_application == PAIRING_OPTIMIZER) {
                return false;
            }
			stringstream ss;
			ss << "Cannot find the complement/option of the rank combination criteria.";
			string errorMsg = ss.str();
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = pairing->getDbId();
			rv->startDTUtc = pairing->getStartTimeUtcAct();
			rv->endDTUtc = pairing->getEndTimeUtcAct();
			rv->violation_msg = errorMsg;
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
			rv->operation_result.insert(pair<string, string>("combPId", Utility::GetInstancePtr()->llToa(pairing->getRankCombCP())));
			rv->operation_result.insert(pair<string, string>("combCId", Utility::GetInstancePtr()->llToa(pairing->getRankCombCC())));
			rv->operation_result.insert(pair<string, string>("combAId", Utility::GetInstancePtr()->llToa(pairing->getRankCombCA())));
			if (this->_dbData)
				this->addRuleViolations(rv, singleRule);
		}
		
		//for (auto& division : this->_dbData->divisionConstruction[this->_dbData->loginDivision]) {
		//	if (division == "P") {
		//		long long rankComb = pairing->getRankCombCP();
		//		if (rankComb == 0) {
		//			stringstream ss;
		//			ss << "Cannot find the complement/option of the rank combination criteria.";
		//			string errorMsg = ss.str();
		//			RULE_VIOLATION* rv = new RULE_VIOLATION();
		//			rv->pairingId = pairing->getDbId();
		//			rv->startDTUtc = pairing->getStartTimeUtcAct();
		//			rv->endDTUtc = pairing->getEndTimeUtcAct();
		//			rv->violation_msg = errorMsg;
		//			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
		//			rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
		//			rv->operation_result.insert(pair<string, string>("division", division));
		//			/*rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[pairing->get]->airportABBR));
		//			rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));*/
		//			rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->iToa(rankComb)));
		//			if (this->_dbData)
		//				this->addRuleViolations(rv, singleRule);
		//			continue;
		//		}
		//	}else if (division == "C") {
		//		long long rankComb = pairing->getRankCombCC();
		//		if (rankComb == 0) {
		//			stringstream ss;
		//			ss << "Cannot find the complement/option of the rank combination criteria.";
		//			string errorMsg = ss.str();
		//			RULE_VIOLATION* rv = new RULE_VIOLATION();
		//			rv->pairingId = pairing->getDbId();
		//			rv->startDTUtc = pairing->getStartTimeUtcAct();
		//			rv->endDTUtc = pairing->getEndTimeUtcAct();
		//			rv->violation_msg = errorMsg;
		//			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
		//			rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
		//			rv->operation_result.insert(pair<string, string>("division", division));
		//			/*rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[pairing->get]->airportABBR));
		//			rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));*/
		//			rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->iToa(rankComb)));
		//			if (this->_dbData)
		//				this->addRuleViolations(rv, singleRule);
		//			continue;
		//		}
		//	}else if (division == "A") {
		//		long long rankComb = pairing->getRankCombCA();
		//		if (rankComb == 0) {
		//			stringstream ss;
		//			ss << "Cannot find the complement/option of the rank combination criteria.";
		//			string errorMsg = ss.str();
		//			RULE_VIOLATION* rv = new RULE_VIOLATION();
		//			rv->pairingId = pairing->getDbId();
		//			rv->startDTUtc = pairing->getStartTimeUtcAct();
		//			rv->endDTUtc = pairing->getEndTimeUtcAct();
		//			rv->violation_msg = errorMsg;
		//			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
		//			rv->operation_result.insert(pair<string, string>("ruleId", "8091.2"));
		//			rv->operation_result.insert(pair<string, string>("division", division));
		//			/*rv->operation_result.insert(pair<string, string>("startStation", this->_dbData->airportCodeMap[pairing->get]->airportABBR));
		//			rv->operation_result.insert(pair<string, string>("endStation", this->_dbData->airportCodeMap[segment->getArrStation()]->airportABBR));*/
		//			rv->operation_result.insert(pair<string, string>("combId", Utility::GetInstancePtr()->iToa(rankComb)));
		//			if (this->_dbData)
		//				this->addRuleViolations(rv, singleRule);
		//			continue;
		//		}
		//	}
		//}
		
	}
	return rReturn;
}

//优化专用
map<string, int> LegalityChecker::calculateOpenCompositionOptimization(Pairing * p) {
	map<string, int> actingRankToNumOpenComposition;
	map<string, int> CrewIdMapToSeqOrder;
	map<int, map<string, int>> OptionToCrewIdToSeqOrderMap;
	map<int, map<string, vector<int>>> OptionToActingRankToNumOpenComposition;

	map<int, vector<RankCombination*>>  Options;
	time_t lCheckedStart = this->_dbData->scenario.startDtUTC;
	time_t lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	vector<SharedPtr<RankCombination>> rankCombs;
	const vector<DBRule> dbRules = this->_dbData->getRuleFunctions(8091);
	string pCompositionSource = "I";
	map<string, string>::const_iterator iter;
	string header, headeValue;
	for (auto & rule : dbRules) {
		for (iter = rule.params.begin(); iter != rule.params.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

			if (header == "COMPOSITION SOURCE") {
				pCompositionSource = headeValue;
				break;
			}
		}
	}

	Segment* segment = p->getSegment(0);
	// 20200813 优化逻辑按环计算
	for (Segment* obj : p->getSegments()) {
		if(obj->getAssignment() != "OPR" && obj->getAssignment() != "FLY" && obj->getAssignment() != "MVO" && obj->getAssignment().find("SBY") == string::npos)
			continue;

		if (obj->getRankCombCriteriaId() == p->getRankCombCriteriaId()) {
			segment = obj;
			break;
		}
	}
	
	map<long long, vector<SharedPtr<RankCombination>>>::iterator comb_it = this->_dbData->rankCombinationMap.find(segment->getRankCombCriteriaId());
	if (comb_it == _dbData->rankCombinationMap.end())
		return CrewIdMapToSeqOrder;

	rankCombs = (*comb_it).second;

	vector<SharedPtr<RosterFlight>> rosterFlights = this->_dbData->rosterFlightMgr.get(segment->getDBId());
	if (this->GetApplication() == ROSTER_OPTIMIZER && segment->getAssignment().find("SBY") != string::npos && segment->getDBId() == 0) {
		vector<SharedPtr<RosterFlight>> rosterFlights_tmp;
		rosterFlights_tmp.swap(rosterFlights);
		rosterFlights.clear();
		for (auto& rf : rosterFlights_tmp) {
			if (rf->pairingId != p->getDbId())
				continue;

			rosterFlights.push_back(rf);
		}
	}
	map<string, int> pairCompMap = p->getComplements();

	if (rosterFlights.empty())
	{
		map<int, map<string, int>> optionToRankCombNums;
		for (std::size_t i = 0; i < rankCombs.size(); i++) {
			Options[rankCombs[i]->options].push_back(rankCombs[i].get());

			if (rankCombs[i]->positions != "") {
				OptionToActingRankToNumOpenComposition[rankCombs[i]->options][rankCombs[i]->rank].push_back(rankCombs[i]->seqOrder);

				if (optionToRankCombNums[rankCombs[i]->options][rankCombs[i]->rank]) {
					optionToRankCombNums[rankCombs[i]->options][rankCombs[i]->rank] = optionToRankCombNums[rankCombs[i]->options][rankCombs[i]->rank] + 1;
				}
				else {
					optionToRankCombNums[rankCombs[i]->options][rankCombs[i]->rank] = 1;
				}
			}
		}

		for (auto& oToAToOpen : OptionToActingRankToNumOpenComposition) {
			// 适配外部来源的配比
			// compositionSource == "O" 是外部来源
			// 只判断配比是否符合option，不在动态计算
			if (pCompositionSource == "O" && optionToRankCombNums.find(oToAToOpen.first) != optionToRankCombNums.end() && optionToRankCombNums[oToAToOpen.first] != pairCompMap) {
				continue;
			}
			for (auto& aToOpen : oToAToOpen.second) {
				if (actingRankToNumOpenComposition.find(aToOpen.first) == actingRankToNumOpenComposition.end())
					actingRankToNumOpenComposition.insert(make_pair(aToOpen.first, (int)aToOpen.second.size()));
				else {
					int numOpen = max((int)(aToOpen.second.size()), actingRankToNumOpenComposition[aToOpen.first]);
					actingRankToNumOpenComposition.erase(aToOpen.first);
					actingRankToNumOpenComposition.insert(make_pair(aToOpen.first, numOpen));
				}
			}
			
		}

		return actingRankToNumOpenComposition;
	}

	//例如，一个配比为2的环，被拆成2个配比为1的环。这2个环有共同的航段。检查是否有open，不能从航段检查，只能走任务环。但新上的任务，是否符合
	//配比搭配，则还需走航段检查
	/*
	if (this->_dbData->scenario.airline == "QQ") {
		map<string, int> actingRankToFixedComplements;
		
		int numRosterFlightForThePairing = 0;
		for (auto& rf : rosterFlights) {
			if (rf->pairingId == p->getDbId()) {
				if (actingRankToFixedComplements.find(rf->actingRank) != actingRankToFixedComplements.end())
					actingRankToFixedComplements[rf->actingRank]++;
				else
					actingRankToFixedComplements[rf->actingRank] = 1;
			}
		}

		for (auto& tmpItr : actingRankToFixedComplements) {
			if (!p->getIsContainCompositionRank(tmpItr.first)) continue;
			if (tmpItr.second >= p->getComplementByRank(tmpItr.first))
				actingRankToNumOpenComposition.insert(make_pair(tmpItr.first, 0));
			else
				actingRankToNumOpenComposition.insert(make_pair(tmpItr.first, p->getComplementByRank(tmpItr.first) - tmpItr.second));
		}
		//actingRankToFixedComplements为空，读取pairing的所有配比
		if (actingRankToFixedComplements.empty()) {
			auto& complementsMap = p->getComplements();
			for (auto& item: complementsMap) {
				actingRankToNumOpenComposition.insert(make_pair(item.first, item.second));
			}
		}

		return actingRankToNumOpenComposition;
	}
	*/
	
	//拆分方案
	for (std::size_t i = 0; i < rankCombs.size(); i++) {
		Options[rankCombs[i]->options].push_back(rankCombs[i].get());

		if(rankCombs[i]->positions != "")
			OptionToActingRankToNumOpenComposition[rankCombs[i]->options][rankCombs[i]->rank].push_back(rankCombs[i]->seqOrder);

		if (actingRankToNumOpenComposition.find(rankCombs[i]->rank) == actingRankToNumOpenComposition.end())
			actingRankToNumOpenComposition.insert(make_pair(rankCombs[i]->rank, 0));
	}
	number = 0;
	//对于每个方案先找到合法的crew集合
	vector<shared_ptr<RosterFlight>> rfs;
	map<string, int> optionComp;
	map<string, int> pComp = p->getComplements();
	int i;
	for (i = 1; i <= (int)Options.size(); i++) {
		rfs.clear();
		optionComp.clear();
		//将方案中所有的rank存入ranks 筛选crew
		vector<string> ranks;
		for (std::size_t k = 0; k < Options[i].size(); k++) {
			ranks.push_back(Options[i][k]->rank);
			if (Options[i][k]->positions == "")
				continue;
			if (optionComp[Options[i][k]->rank]) {
				optionComp[Options[i][k]->rank] = optionComp[Options[i][k]->rank] + 1;
			}
			else {
				optionComp[Options[i][k]->rank] = 1;
			}
		}
		if ("O" == pCompositionSource && pComp != optionComp) continue;
		for (std::size_t j = 0; j < rosterFlights.size(); j++) {
			//20190912 ain, mantis#6687, assignment=MVO也需要计算
			if (rosterFlights[j]->assignment != "OPR" && rosterFlights[j]->assignment != "FLY" && rosterFlights[j]->assignment != "MVO" && rosterFlights[j]->assignment.find("SBY") == string::npos) //增加SBY zzm 20210207
				continue;

            //QQ SrvB时特殊处理，Training单独成环，一个training的人有一个环及其对应的roster.
            auto pairingComp = p->getComplements();
            auto itComp = pairingComp.find("FA");
            if(this->_dbData->scenario.airline == "QQ" && itComp != pairingComp.end() && itComp->second == 2){
                if(rosterFlights[j]->pairingId != p->getDbId())
                    continue;
            }

			// 根据rankCombCriteria中的assignment字段与rosterFlight中assignment比较 add by jx.jin 2021/1/22
			// 先尝试匹配 rankComb->assignment == seg.assignment
			// 若无匹配则按 rankComb->assignment当作 group再次尝试匹配
			if (!_dbData->isAssignmentIncludeOrInGroup(rosterFlights[j]->assignment, _dbData->rankCombinationCriteriaMap[rankCombs[0]->rankCombCriteriaId])) {
				continue;
			}

			if (find(ranks.begin(), ranks.end(), rosterFlights[j]->actingRank) == ranks.end())
				continue;
			rfs.push_back(rosterFlights[j]);
		}
		//if (rfs.size() == 0)continue;
		//crew筛选完 验证 RankCombination与crews的匹配关系
		//初始化匹配数组
		memset(match, 0, sizeof(match));
		for (std::size_t m = 0; m < rfs.size(); m++) {
			SharedPtr<CREW> crew = this->_dbData->crewIdMap[rfs[m]->crewId];
			//(reverted)20190917 ain,mantis#6713, 按division获取crew,以兼容crew同时具有C/A资格
			//string actingRank = rfs.size() > 0 ? rfs[m]->activeRank : "";
			//SharedPtr<CREW_RANK>cofActiveRank = _dbData->getCrewRankByActingRank(rfs[m]->crewId, lCheckedStart, lCheckedEnd, actingRank);
			//20190919 ain, mantis#6713, 问题8, 按任务日期计算 crewRank, 若失败则默认按场景日期计算 crewRank
			time_t start = lCheckedStart;
			time_t end = lCheckedEnd;
			if (_dbData->pairingIdMap.find(rfs[m]->pairingId) != _dbData->pairingIdMap.end()) {
				start = _dbData->pairingIdMap[rfs[m]->pairingId]->getStartTimeUtcAct();
				end = _dbData->pairingIdMap[rfs[m]->pairingId]->getEndTimeUtcAct();
			}
			/*Segment* flt = _dbData->flightIdMap[rfs[m]->fltId];
			if (!flt) {
				string msg = "Rule-8091: FlightId" + Utility::GetInstancePtr()->llToa(rfs[m]->fltId) + " no flight find while checking flight" + Utility::GetInstancePtr()->llToa(rfs[m]->fltId) + ".\n";
				printf(msg.c_str());
				return CrewIdMapToSeqOrder;
			}
			string fleetCD = flt->getFleetCD();
			string fleet = _dbData->fleetMap[fleetCD].acType;*/
			string fleet = getFleetByFlt(rfs[m]);
			SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(start, end, fleet);
			if (!cofActiveRank)
			{
				string msg = "Rule-8091: Crew" + crew->idCrew + " no active rank while checking crew" + crew->idCrew + ".\n";
				printf(msg.c_str());
				return CrewIdMapToSeqOrder;
			}

			string cofPostion = cofActiveRank->position;
			for (std::size_t n = 0; n < Options[i].size(); n++) {
				vector<string> splitPositions;
				split(Options[i][n]->positions, '|', splitPositions);
				if (rfs[m]->actingRank != Options[i][n]->rank) {
					continue;
				}
				if (std::find(splitPositions.begin(), splitPositions.end(), cofPostion) == splitPositions.end())
					continue;
				//20200914 ain, mantis#8572, 增加筛选，针对RO优化每轮只分配固定actingRank
				/*if (crewId != "" && rfs[m]->crewId == crewId) {
					if (!isMatchScenarioActingRank(_dbData, rfs[m]->actingRank))
						continue;
				}*/
				match[m][Options[i][n]->seqOrder] = true;
				number = max(number, Options[i][n]->seqOrder);
			}
		}
		//得到匹配数组 进行匹配
		std::size_t count = 0;
		memset(segOrders, -1, sizeof(segOrders));
		memset(answer, 0, sizeof(answer));
		for (std::size_t j = 0; j < rfs.size(); j++) {
			memset(used, 0, sizeof(used));
			if (findFor8091(j)) count += 1;
		}
		if (count >= rfs.size()) {
			CrewIdMapToSeqOrder.clear();
			for (std::size_t j = 0; j < rfs.size(); j++) {
				CrewIdMapToSeqOrder.insert(make_pair(rfs[j]->crewId, answer[j]));
			}

			if (Options.find(i) != Options.end()) {
				if (!Options.at(i).empty()) {
					OptionToCrewIdToSeqOrderMap.insert(make_pair(i, CrewIdMapToSeqOrder));
				}
			}
		}
	}

	//移除掉没有匹配上的options
	map<int, map<string, vector<int>>> tmpOptionToActingRankToNumOpenComposition;
	for (auto& obj1 : OptionToCrewIdToSeqOrderMap) {
		tmpOptionToActingRankToNumOpenComposition[obj1.first] = OptionToActingRankToNumOpenComposition[obj1.first];
	}
	OptionToActingRankToNumOpenComposition.clear();
	OptionToActingRankToNumOpenComposition = tmpOptionToActingRankToNumOpenComposition;
	
	for (auto& obj1 : OptionToCrewIdToSeqOrderMap) {
		for (auto& obj2 : obj1.second) {
			int seqOrder = obj2.second;
			for (auto& obj3 : OptionToActingRankToNumOpenComposition[obj1.first]) {
				vector<int>::iterator iter = std::find(obj3.second.begin(), obj3.second.end(), seqOrder);
				if (iter != obj3.second.end()) {
					obj3.second.erase(iter);
					break;
				}
			}
		}
	}

	for (auto& obj1 : OptionToActingRankToNumOpenComposition) {
		for (auto& obj2 : obj1.second) {
			map<string, int>::iterator iter = actingRankToNumOpenComposition.find(obj2.first);
			if (iter->second < (int)obj2.second.size())
				iter->second = (int)obj2.second.size();
		}
	}

	return actingRankToNumOpenComposition;
}

//优化专用
std::unordered_map<std::string, std::unordered_map<long long, std::vector<string>>> LegalityChecker::CrewToPairingToActingRanks(CREW * crew, Pairing * pairing) {

	long long lapsed = clock();

	std::unordered_map<std::string, std::unordered_map<long long, std::vector<string>>> crewToPairingToActingRanks;
	time_t lCheckedStart = this->_dbData->scenario.startDtUTC;
	time_t lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	
	std::vector<string> actingRanks;

	map<long long, vector<SharedPtr<RankCombination>>>::iterator comb_it = this->_dbData->rankCombinationMap.find(pairing->getRankCombCriteriaId());
	if (comb_it == _dbData->rankCombinationMap.end()) {
		crewToPairingToActingRanks[crew->idCrew].insert(make_pair(pairing->getDbId(), actingRanks));

		RuleStatistics::GetInstancePtr()->addRuleCallClock(RULES::RANK_POSITION_COMB, (clock_t)(clock() - lapsed));
		RuleStatistics::GetInstancePtr()->addRuleCallTimes(RULES::RANK_POSITION_COMB, 1);

		return crewToPairingToActingRanks;
	}
	std::set<std::string> fleets;
	for (auto& seg : pairing->getSegments()) {
		fleets.emplace(seg->getFleetCD());
	}
	for (auto& fleetCD : fleets) {
		//string fleetCD = pairing->getFltCode();
		vector<SharedPtr<RankCombination>> rankCombs = (*comb_it).second;
		string fleet = _dbData->fleetMap[fleetCD].acType;
		SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(lCheckedStart, lCheckedEnd, fleet);
		if (cofActiveRank != NULL) {
			for (auto& rankComb : rankCombs) {
				if (rankComb->positions.find(cofActiveRank->position) != string::npos) {
					if (find(actingRanks.begin(), actingRanks.end(), rankComb->rank) == actingRanks.end())
						actingRanks.push_back(rankComb->rank);
				}
			}

			crewToPairingToActingRanks[crew->idCrew].insert(make_pair(pairing->getDbId(), actingRanks));
		}
	}

	RuleStatistics::GetInstancePtr()->addRuleCallClock(RULES::RANK_POSITION_COMB, (clock_t)(clock() - lapsed));
	RuleStatistics::GetInstancePtr()->addRuleCallTimes(RULES::RANK_POSITION_COMB, 1);

	return crewToPairingToActingRanks;
}
