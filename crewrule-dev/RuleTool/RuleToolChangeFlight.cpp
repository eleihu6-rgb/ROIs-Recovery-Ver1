/*
RuleTool模块：自动测试
1、遍历输入dir下子目录
2、每一个目录作为一个 test case，读入其中input.txt
3、输入output.txt
4、与 expect_output.txt对比
*/
#include <sys/stat.h> 
#include <stdio.h>
#include <time.h>
#ifdef Win32
#include <direct.h>
#endif
//#include <direct.h>
#include <algorithm>
#include <limits>
#include <fstream>
#include <sstream>
#include <set>
#include "RuleTool.h"
#include "UtilFunc.h"
#include "CustomBiz/CustomBiz.h"
#include "RuleParams.h"
#include "PairingAttrCalculator.h"

static void resetFlightValues(SharedPtr<CrewDataContext>& dbData, vector<long long> flightIds);
static void resetDutyFdpDpRst(vector<Pairing*>& pairings, SharedPtr<LegalityChecker>& ruleEngine);
static void resetRosterPairingSegmentLabel(SharedPtr<CrewDataContext>& dbData, vector<long long>& flightIds);
static void filterDataForFlightChangeOutput(SharedPtr<CrewDataContext>& dbData, vector<long long>& flightIds);
static void resetRosterTimeByPairing(vector<Pairing*>& pairings, vector<SharedPtr<CREW>>& crews);
static void resetPairingDownrankActingRankBySeniority(vector<Pairing*>& pairings, SharedPtr<CrewDataContext>& dbData);
static void resetPairingSeqOrderByActingRankAndSeniority(vector<Pairing*>& pairings, SharedPtr<CrewDataContext>& dbData);

static void resetPairingCrewDay(vector<Pairing*>& pairings);
static void resetPairingFleet(vector<Pairing*>& pairings, SharedPtr<CrewDataContext>& dbData);
static void resetRosterPairingIsDelete(vector<SharedPtr<Segment>>& flights, vector<Pairing*>& pairings, vector<SharedPtr<CREW>>& crewList);
static void resetSegmentOrderByPairing(vector<Pairing*>& pairings);
static void testPrintPairing(string msg, vector<Pairing*>& list, vector<long long>& fltIds);
void testPrintFlt(string msg, vector<SharedPtr<Segment>>& list, vector<long long>& fltIds);

namespace {
struct PairingRosterRankItem {
	SharedPtr<CREW> crew;
	SharedPtr<ROSTER> roster;
	SharedPtr<CrewOnFlight> cop;
	string activeRank;
};

SharedPtr<ROSTER> findRosterByCrewAndPairing(const SharedPtr<CrewDataContext>& dbData, const string& crewId, const SharedPtr<CREW>& crew, const long long pairingId);
string getRosterActiveRank(const PairingRosterRankItem& item, const SharedPtr<CrewDataContext>& dbData);
bool shouldRefreshActingRankAndSeqOrder(const SharedPtr<CrewDataContext>& dbData);

std::vector<PairingRosterRankItem> collectPairingRosterRankItems(const SharedPtr<CrewDataContext>& dbData, Pairing* pairing) {
	std::vector<PairingRosterRankItem> result;
	if (dbData == nullptr || pairing == nullptr) {
		return result;
	}

	auto copIter = dbData->crewOnPairing.find(pairing->getDbId());
	if (copIter != dbData->crewOnPairing.end()) {
		for (const auto& cop : copIter->second) {
			if (cop == nullptr || cop->crew == nullptr) {
				continue;
			}

			PairingRosterRankItem item;
			item.cop = cop;
			item.crew = cop->crew;
			item.roster = findRosterByCrewAndPairing(dbData, cop->crewId, item.crew, pairing->getDbId());
			if (item.roster == nullptr) {
				Logger::getRuleLogger()->info("[change_flight] skip pairing={} crew={} because roster not found", pairing->getDbId(), cop->crewId);
				continue;
			}

			item.activeRank = getRosterActiveRank(item, dbData);
			if (!item.activeRank.empty()) {
				result.push_back(item);
			}
		}
		return result;
	}

	Logger::getRuleLogger()->info("[change_flight] pairing={} crewOnPairing missing, rebuild from rosterFlight", pairing->getDbId());
	std::set<string> handledCrewIds;
	for (const auto& rf : dbData->rosterFlightMgr.getByPairingId(pairing->getDbId())) {
		if (rf == nullptr || rf->crewId.empty() || handledCrewIds.find(rf->crewId) != handledCrewIds.end()) {
			continue;
		}

		auto crewIter = dbData->crewIdMap.find(rf->crewId);
		if (crewIter == dbData->crewIdMap.end() || crewIter->second == nullptr) {
			continue;
		}

		PairingRosterRankItem item;
		item.crew = crewIter->second;
		item.roster = findRosterByCrewAndPairing(dbData, rf->crewId, item.crew, pairing->getDbId());
		if (item.roster == nullptr) {
			Logger::getRuleLogger()->info("[change_flight] skip pairing={} crew={} because roster not found in fallback", pairing->getDbId(), rf->crewId);
			continue;
		}

		item.activeRank = !rf->activeRank.empty() ? rf->activeRank : getRosterActiveRank(item, dbData);
		if (item.activeRank.empty()) {
			continue;
		}

		handledCrewIds.insert(rf->crewId);
		result.push_back(item);
	}
	return result;
}

SharedPtr<ROSTER> findRosterByCrewAndPairing(const SharedPtr<CrewDataContext>& dbData, const string& crewId, const SharedPtr<CREW>& crew, const long long pairingId) {
	if (dbData != nullptr) {
		auto crewIter = dbData->crewIdMap.find(crewId);
		if (crewIter != dbData->crewIdMap.end() && crewIter->second != nullptr) {
			for (const auto& roster : crewIter->second->rosterList) {
				if (roster != nullptr && roster->pairId == pairingId) {
					return roster;
				}
			}
		}
	}
	if (crew != nullptr) {
		for (const auto& roster : crew->rosterList) {
			if (roster != nullptr && roster->pairId == pairingId) {
				return roster;
			}
		}
	}
	return nullptr;
}

long long getRankPriority(const SharedPtr<CrewDataContext>& dbData, const string& rank) {
	if (dbData == nullptr) {
		return std::numeric_limits<long long>::max();
	}
	auto iter = dbData->rankMap.find(rank);
	if (iter == dbData->rankMap.end()) {
		return std::numeric_limits<long long>::max();
	}
	return iter->second.rankId;
}

int getRankDisplayOrder(const SharedPtr<CrewDataContext>& dbData, const string& rank) {
	if (dbData == nullptr) {
		return std::numeric_limits<int>::max();
	}
	auto iter = dbData->rankMap.find(rank);
	if (iter == dbData->rankMap.end()) {
		return std::numeric_limits<int>::max();
	}
	return iter->second.displayOrder;
}

string getRosterActiveRank(const PairingRosterRankItem& item, const SharedPtr<CrewDataContext>& dbData) {
	if (item.cop != nullptr && !item.cop->activeRank.empty()) {
		return item.cop->activeRank;
	}
	if (item.roster != nullptr) {
		const auto rosterFlights = dbData->rosterFlightMgr.getByPairingId(item.roster->pairId);
		for (const auto& rosterFlight : rosterFlights) {
			if (rosterFlight != nullptr
				&& rosterFlight->crewId == item.roster->idcrew
				&& rosterFlight->rosterId == item.roster->rosterId
				&& !rosterFlight->activeRank.empty()) {
				return rosterFlight->activeRank;
			}
		}
		if (!item.roster->position.empty()) {
			return item.roster->position;
		}
		if (item.crew != nullptr && item.roster->pairing != nullptr) {
			const auto crewRank = item.crew->getActiveRankInTimes(item.roster->pairing->getStartTimeUtcAct(),
				item.roster->pairing->getEndTimeUtcAct(), "");
			if (crewRank != nullptr && !crewRank->rank.empty()) {
				return crewRank->rank;
			}
		}
	}
	return "";
}

bool shouldRefreshActingRankAndSeqOrder(const SharedPtr<CrewDataContext>& dbData) {
	if (dbData == nullptr) {
		return false;
	}

	const string division = dbData->scenario.division;
	if (division.empty()) {
		return false;
	}

	const string autoChangeActingRank = dbData->getSystemParamValue("AUTO_CHG_ACTING_RANK", "");
	if (autoChangeActingRank.empty()) {
		return false;
	}

	vector<string> divisions;
	split(autoChangeActingRank, '|', divisions);
	return find(divisions.begin(), divisions.end(), division) != divisions.end();
}

bool isDownRanked(const PairingRosterRankItem& item) {
	return item.roster != nullptr
		&& !item.activeRank.empty()
		&& item.activeRank != item.roster->actingRank;
}

void syncRosterActingRank(const SharedPtr<CrewDataContext>& dbData, const PairingRosterRankItem& item, const string& newActingRank) {
	if (dbData == nullptr || item.roster == nullptr) {
		return;
	}

	item.roster->actingRank = newActingRank;

	auto crewIter = dbData->crewIdMap.find(item.roster->idcrew);
	if (crewIter != dbData->crewIdMap.end() && crewIter->second != nullptr) {
		for (auto& roster : crewIter->second->rosterList) {
			if (roster != nullptr
				&& roster->pairId == item.roster->pairId
				&& roster->rosterId == item.roster->rosterId) {
				roster->actingRank = newActingRank;
			}
		}
	}

	if (item.cop != nullptr) {
		item.cop->actingRank = newActingRank;
	}

	auto copIter = dbData->crewOnPairing.find(item.roster->pairId);
	if (copIter != dbData->crewOnPairing.end()) {
		for (auto& cop : copIter->second) {
			if (cop != nullptr && cop->crewId == item.roster->idcrew) {
				cop->actingRank = newActingRank;
			}
		}
	}

	if (item.roster->pairing != nullptr) {
		for (const auto* duty : item.roster->pairing->getDutyVec()) {
			for (const auto* segment : duty->getSegments()) {
				auto cofIter = dbData->crewOnFlt.find(segment->getDBId());
				if (cofIter == dbData->crewOnFlt.end()) {
					continue;
				}
				for (auto& cof : cofIter->second) {
					if (cof != nullptr && cof->crewId == item.roster->idcrew && cof->pairingId == item.roster->pairId) {
						cof->actingRank = newActingRank;
					}
				}
			}
		}
	}

	auto rosterFlights = dbData->rosterFlightMgr.getByPairingId(item.roster->pairId);
	for (auto& rosterFlight : rosterFlights) {
		if (rosterFlight != nullptr
			&& rosterFlight->crewId == item.roster->idcrew
			&& rosterFlight->rosterId == item.roster->rosterId) {
			rosterFlight->actingRank = newActingRank;
		}
	}

	auto mergeRosterFlightIter = dbData->mergeRosterFlight.find(item.roster->rosterId);
	if (mergeRosterFlightIter != dbData->mergeRosterFlight.end()) {
		for (auto& rosterFlight : mergeRosterFlightIter->second) {
			if (rosterFlight != nullptr
				&& rosterFlight->crewId == item.roster->idcrew
				&& rosterFlight->pairingId == item.roster->pairId) {
				rosterFlight->actingRank = newActingRank;
			}
		}
	}
}
}

int RuleTool::reCalculateByFlight(vector<long long>& flightIds) {
	int ret = 0;
	vector<SharedPtr<CREW_MANDAY_CC_AM>> mandayCcList;
	vector<SharedPtr<CREW_MANDAY_FD>> mandayFdList;
	//20190601 ain, mantis#5831, reset flt.act_blk_min
	resetFlightValues(dbData, flightIds);

	testPrintFlt("CHANGED", dbData->flightList, flightIds);
	testPrintPairing("init", dbData->pairingList, flightIds);///TEST

	_legality->setDataContext(dbData);
	if (ret != 0) {
		goto CLEANUP;
	}
	testPrintPairing("after setDataCtx", dbData->pairingList, flightIds);///TEST
	//
	_legality->resetPairingDutySegTimeByFlight(dbData, dbData->flightList, dbData->pairingList);
	testPrintPairing("after resetPtn", dbData->pairingList, flightIds);///TEST
	resetPairingCrewDay(dbData->pairingList);
	resetPairingFleet(dbData->pairingList, dbData);

	//reset isDelete
	//若航班被取消, 则赋值isDelete=true, 对应 roster/pairing/duty/segment
	resetRosterPairingIsDelete(dbData->flightList, dbData->pairingList, dbData->crewList);
	testPrintPairing("after isDelete ", dbData->pairingList, flightIds);///TEST

	resetRosterTimeByPairing(dbData->pairingList, dbData->crewList);
	if (shouldRefreshActingRankAndSeqOrder(dbData)) {
		resetPairingDownrankActingRankBySeniority(dbData->pairingList, dbData);
		resetPairingSeqOrderByActingRankAndSeniority(dbData->pairingList, dbData);
	}
	
	resetSegmentOrderByPairing(dbData->pairingList);//20190619 ain, mantis#6026, 按act_str排序duty.segments

	//mantis#5422, 航班返航/备降, 需重算roster/pairing.label=更新后航站序列
	resetRosterPairingSegmentLabel(dbData, flightIds);

	//calculate manday
	printf("%s reCalculateManday start\n", utcToUtcString(time(0)).c_str());
	for (std::size_t i = 0; i < dbData->crewList.size(); i++) {
		SharedPtr<CREW>& crew = dbData->crewList[i];
		string idcrew = crew->idCrew;
		_legality->calculateTrainingBriefAndDebrief(dbData, crew);
		if (crew->division == "P") {
			crew->mandayFdList = _legality->calculateMandayFD(dbData, crew, crew->rosterList);
			mandayFdList.insert(mandayFdList.end(), crew->mandayFdList.begin(), crew->mandayFdList.end());
		}
		else {
			crew->mandayCcAmList = _legality->calculateMandayCC(dbData, crew, crew->rosterList);
			mandayCcList.insert(mandayCcList.end(), crew->mandayCcAmList.begin(), crew->mandayCcAmList.end());
		}
	}
	// 计算起落数
	reCalculateMandayFD_updowns_expBlh();
	printf("%s reCalculateManday end\n", utcToUtcString(time(0)).c_str());

	//20190524 ain, mantis#5665, 缩小change_flight输出范围, 避免server冗余广播
	filterDataForFlightChangeOutput(dbData, flightIds);
	testPrintPairing("after manday", dbData->pairingList, flightIds);///TEST

	{
		PairingAttributeCalculator pairingAttrCalculator(dbData->scenario.airline, dbData->flightList, dbData->routeList, dbData->attributeIdMap, dbData->airportCodeMap, dbData->assignmentNameGroupMap, dbData->rankMap, dbData->tagCategoryList, dbData->tagFlightGroupMap, dbData->tagDutyGroupMap,
			dbData->tagPairingGroupMap, dbData->tagGroupTableMap, dbData->tagGroupMap, dbData->tagFlightCompositionGroupMap);
		if (dbData->version == 2 || dbData->scenario.airline == "JG") {
			pairingAttrCalculator.calculateAndSetPairingAttr(dbData->pairingList);
		} else{
			pairingAttrCalculator.calculateAndSetPairingTag(dbData->pairingList);
		}
	}

	//通过duty brief时间修复duty的开始时间
	for (auto& pairing : dbData->pairingList) {
		for (size_t i = 0; i < pairing->getDutyVec().size(); i++) {
			Duty* duty = pairing->getDuty(i);
			duty->fixingDutyBriefNode();
		}
	}

	//20190601 ain, 按duty.start/brief变更重算 fdp/dp/rst
	//因eva逻辑可能清空 planFDP, 因此末尾重算
	resetDutyFdpDpRst(dbData->pairingList, this->_legality);
	testPrintPairing("after Fdp/Dp/Rst ", dbData->pairingList, flightIds);///TEST
	
	//save 
	
	dbData->saveFlightChange(flightIds);

	testPrintPairing("after save", dbData->pairingList, flightIds);///TEST
CLEANUP:
	return ret;
}

int RuleTool::reCalculateByFlight(vector<long long>& flightIds, const vector<string>& filiales, const string& division) {
	int ret = 0;
	vector<SharedPtr<CREW_MANDAY_CC_AM>> mandayCcList;
	vector<SharedPtr<CREW_MANDAY_FD>> mandayFdList;
	//20190601 ain, mantis#5831, reset flt.act_blk_min
	resetFlightValues(dbData, flightIds);

	testPrintFlt("CHANGED", dbData->flightList, flightIds);

	// Save original pairingList and crewList
	vector<Pairing*> originalPairingList = dbData->pairingList;
	vector<SharedPtr<CREW>> originalCrewList = dbData->crewList;

	testPrintPairing("init", dbData->pairingList, flightIds);///TEST
	for (auto& filiale : filiales) {
		// Filter pairingList and crewList by current (filiale, division) combination
		// Always filter from original full list to avoid cross-contamination
		dbData->pairingList = dbData->getPairingList(filiale, division);
		dbData->crewList = dbData->getCrewList(filiale, division);

		long long ruleSetId = dbData->getRuleSetIdByLiveConfig(filiale, division, "TRACKING");

		_legality->setFiliale(filiale);
		_legality->setDivision(division);

		_legality->setDataContext(dbData, ruleSetId);
		testPrintPairing("after setDataCtx", dbData->pairingList, flightIds);///TEST
		//
		_legality->resetPairingDutySegTimeByFlight(dbData, dbData->flightList, dbData->pairingList);
		testPrintPairing("after resetPtn", dbData->pairingList, flightIds);///TEST
		resetPairingCrewDay(dbData->pairingList);
		resetPairingFleet(dbData->pairingList, dbData);

		//reset isDelete
		//若航班被取消, 则赋值isDelete=true, 对应 roster/pairing/duty/segment
		resetRosterPairingIsDelete(dbData->flightList, dbData->pairingList, dbData->crewList);
		testPrintPairing("after isDelete ", dbData->pairingList, flightIds);///TEST

		resetRosterTimeByPairing(dbData->pairingList, dbData->crewList);
		if (shouldRefreshActingRankAndSeqOrder(dbData)) {
			resetPairingDownrankActingRankBySeniority(dbData->pairingList, dbData);
			resetPairingSeqOrderByActingRankAndSeniority(dbData->pairingList, dbData);
		}

		resetSegmentOrderByPairing(dbData->pairingList);//20190619 ain, mantis#6026, 按act_str排序duty.segments

		//mantis#5422, 航班返航/备降, 需重算roster/pairing.label=更新后航站序列
		resetRosterPairingSegmentLabel(dbData, flightIds);

		//calculate manday
		printf("%s reCalculateManday start\n", utcToUtcString(time(0)).c_str());
		for (std::size_t i = 0; i < dbData->crewList.size(); i++) {
			SharedPtr<CREW>& crew = dbData->crewList[i];
			string idcrew = crew->idCrew;
			_legality->calculateTrainingBriefAndDebrief(dbData, crew);
			if (crew->division == "P") {
				crew->mandayFdList = _legality->calculateMandayFD(dbData, crew, crew->rosterList);
				mandayFdList.insert(mandayFdList.end(), crew->mandayFdList.begin(), crew->mandayFdList.end());
			}
			else {
				crew->mandayCcAmList = _legality->calculateMandayCC(dbData, crew, crew->rosterList);
				mandayCcList.insert(mandayCcList.end(), crew->mandayCcAmList.begin(), crew->mandayCcAmList.end());
			}
		}
		// 计算起落数
		reCalculateMandayFD_updowns_expBlh();
		printf("%s reCalculateManday end\n", utcToUtcString(time(0)).c_str());

		{
			PairingAttributeCalculator pairingAttrCalculator(dbData->scenario.airline, dbData->flightList, dbData->routeList, dbData->attributeIdMap, dbData->airportCodeMap, dbData->assignmentNameGroupMap, dbData->rankMap, dbData->tagCategoryList, dbData->tagFlightGroupMap, dbData->tagDutyGroupMap,
				dbData->tagPairingGroupMap, dbData->tagGroupTableMap, dbData->tagGroupMap, dbData->tagFlightCompositionGroupMap);
			if (dbData->version == 2 || dbData->scenario.airline == "JG") {
				pairingAttrCalculator.calculateAndSetPairingAttr(dbData->pairingList);
			}
			else {
				pairingAttrCalculator.calculateAndSetPairingTag(dbData->pairingList);
			}
		}

		//通过duty brief时间修复duty的开始时间
		for (auto& pairing : dbData->pairingList) {
			for (size_t i = 0; i < pairing->getDutyVec().size(); i++) {
				Duty* duty = pairing->getDuty(i);
				duty->fixingDutyBriefNode();
			}
		}

		//20190601 ain, 按duty.start/brief变更重算 fdp/dp/rst
		//因eva逻辑可能清空 planFDP, 因此末尾重算
		resetDutyFdpDpRst(dbData->pairingList, this->_legality);
		testPrintPairing("after Fdp/Dp/Rst ", dbData->pairingList, flightIds);///TEST

		// Restore original pairingList and crewList for final filter and save
		dbData->pairingList = originalPairingList;
		dbData->crewList = originalCrewList;
	}

	//20190524 ain, mantis#5665, 缩小change_flight输出范围, 避免server冗余广播
	filterDataForFlightChangeOutput(dbData, flightIds);
	testPrintPairing("after filter", dbData->pairingList, flightIds);///TEST

	//save 
	
	dbData->saveFlightChange(flightIds);

	testPrintPairing("after save", dbData->pairingList, flightIds);///TEST
CLEANUP:
	return ret;
}

int RuleTool::reCalculateByFlight(long long scenarioId, string& flightIdStr, string filiale, string division) {

	int ret = 0;

	vector<long long> flightIds;
	vector<string> flightIdStrs;
	cout << "reCalculateByFlight(" << scenarioId << ", " << flightIdStr << ")" << endl;


	// input fltIds 
	split(flightIdStr.c_str(), ',', flightIdStrs);
	for (string str : flightIdStrs) {
		if (!str.empty())
			flightIds.push_back(atoll(str.c_str()));
	}
	vector<string> filiales;
	split(filiale.c_str(), '|', filiales);
	// load scenario by flt 
	ret = dbData->loadDataByFlight(scenarioId, flightIds, filiale, division);

	if (filiales.size() <= 1) {
		reCalculateByFlight(flightIds);
	}
	else {
		reCalculateByFlight(flightIds, filiales, division);
	}

	if (ret != 0) {
		printf("ERROR: %d\n", ret);
	}
	return ret;
}

int RuleTool::reCalculateByFlightDate(long long scenarioId, string startDt, string endDt, string filiale, string division, long long ruleSetId) {
	int ret = 0;
	int i = 0;
	time_t startLoc = 0;
	time_t endLoc = 0;
	vector<long long> flightIds;
	vector<string> filiales;
	//20180410 ain, mantis#3104, 添加cmdline startDt/endDt检查
	if (!checkDateTimeStr(startDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", startDt.c_str());
		goto CLEANUP;
	}
	if (!checkDateTimeStr(endDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", endDt.c_str());
		goto CLEANUP;
	}

	startLoc = utcStrToUtc((char*)startDt.c_str());
	endLoc = utcStrToUtc((char*)endDt.c_str());
	//20180321 ain, mantis#2985, 数据源兼容 db/server 
	ret = dbData->loadData(scenarioId, startLoc, endLoc, ruleSetId, "", "", "", division); //不指定base/rank/fleet/ruleSet/division
	if (ret != 0) {
		printf("load data fail %d\n", ret);
		goto CLEANUP;
	}
	//收集flt_id
	for (auto& f : dbData->flightList) {
		flightIds.push_back(f->getDBId());
	}

	split(filiale.c_str(), '|', filiales);
	//计算
	if (filiales.size() <= 1) {
		ret = reCalculateByFlight(flightIds);
	}
	else {
		ret = reCalculateByFlight(flightIds, filiales, division);
	}

CLEANUP:
	if (ret != 0) {
		printf("ERROR: %d\n", ret);
	}
	return ret;
}

void testPrintPairing(string msg, vector<Pairing*>& list, vector<long long>& fltIds) {
	map<long long, bool> pairingOfFlt;
	for (auto& p : list) {
		for (auto& d : p->getDutyVec()) {
			for (auto& s : d->getSegments()) {
				if (find(fltIds.begin(), fltIds.end(), s->getDBId()) != fltIds.end())
					pairingOfFlt[p->getDbId()] = true;
			}
		}
	}
	for (auto& p : list)
		if (pairingOfFlt.find(p->getDbid()) != pairingOfFlt.end())
			test_log_pairing(msg, p);
}

void testPrintFlt(string msg, vector<SharedPtr<Segment>>& list, vector<long long>& fltIds) {
	for (auto& f : list) {
		if (find(fltIds.begin(), fltIds.end(), f->getDBId()) != fltIds.end()) {
			cout << msg << " FLIGHT"
				<< " " << f->getFlightNumber()
				<< " " << f->getDepSta() << "-" << f->getArrSta()
				<< " sts='" << f->getFltSts() << "'"
				<< " " << utcToUtcDtString(f->getStartTimeLocSch())
				<< " ACT=" << utcToUtcHHMM(f->getStartTimeLocAct()) << "-" << utcToUtcHHMM(f->getEndTimeLocAct())
				<< " SCH=" << utcToUtcHHMM(f->getStartTimeLocSch()) << "-" << utcToUtcHHMM(f->getEndTimeLocSch())
				<< endl;
		}
	}
}

void resetFlightValues(SharedPtr<CrewDataContext>& dbData, vector<long long> flightIds) {
	map<long long, bool> fltIdMap;
	for (auto& fid : flightIds) {
		fltIdMap[fid] = true;
	}
	//20190601 ain, mantis#5831, 重算 act_blk_min
	/*for (auto& f : dbData->flightList) {
		if (fltIdMap.find(f->getDBId()) != fltIdMap.end())
			f->setBlkSeconds(static_cast<long>(f->getEndTimeUtcAct() - f->getStartTimeUtcAct()));
	}*/
}

void resetDutyFdpDpRst(vector<Pairing*>& pairings, SharedPtr<LegalityChecker>& ruleEngine) {
	for (Pairing* p : pairings) {
		/*
		 * Without clearing limits cached on duty, wrong limitation (without pairing info) may be used in pairing check
		 */
		for (auto duty : p->getDutyVec()) {
			duty->setMinRest(0, true);
			duty->clearLimitation();
			for (auto seg : duty->getSegments()) {
				seg->clearArrStationRestFacilty();
			}
		}
		ruleEngine->calculatePairingFdpRest(p);

		ruleEngine->calculatePairingMaxFdpRest(p);

		ruleEngine->calculatePairingLabel(p);

		//修复Pairing最后一个Duty的actRest值
		auto duty = p->getLastDuty();
		if (duty != nullptr && duty->getActualRest() <= 0) {
			duty->setActualRest(duty->getMinRest());
		}
	}

	//暂时屏蔽
	//auto dbData = ruleEngine->getDataContext();
	//for (std::size_t index = 0; index < dbData->crewList.size(); index++)
	//{
	//	shared_ptr<RULE_LEGALITY> singleCrew = std::make_shared<RULE_LEGALITY>();
	//	singleCrew->crewIndex = (int)index;
	//	ruleEngine->calculatePairingFdpRest(singleCrew.get());
	//}
	
}

void resetRosterTimeByPairing(vector<Pairing*>& pairings, vector<SharedPtr<CREW>>& crews) {
	int i = 0;
	map<long long, Pairing*> pairingIdMap;
	for (Pairing* p : pairings) {
		pairingIdMap[p->getDbId()] = p;
	}

	for (auto& c : crews) {
		for (auto& roster : c->rosterList) {
			if (pairingIdMap.find(roster->pairId) != pairingIdMap.end()) {
				Pairing* p = pairingIdMap[roster->pairId];
				int rosterRest = static_cast<int>(roster->getEndTimeUtcAct() - roster->getRestStartUtcAct());

				roster->setStartTimeUtcSch(p->getStartTimeUtcSch());
				roster->setStartTimeLocSch(p->getStartTimeLocSch());
				roster->setRestStartUtcSch(p->getEndTimeUtcSch());
				roster->setRestStartLocSch(p->getEndTimeLocSch());
				roster->setStartTimeUtcAct(p->getStartTimeUtcAct());
				roster->setStartTimeLocAct(p->getStartTimeLocAct());
				roster->setRestStartUtcAct(p->getEndTimeUtcAct());
				roster->setRestStartLocAct(p->getEndTimeLocAct());

				roster->setEndTimeUtcSch(p->getEndTimeUtcSch() + rosterRest);
				roster->setEndTimeLocSch(p->getEndTimeLocSch() + rosterRest);
				roster->setEndTimeUtcAct(p->getEndTimeUtcAct() + rosterRest);
				roster->setEndTimeLocAct(p->getEndTimeLocAct() + rosterRest);
			}
		}
	}
}

void resetPairingDownrankActingRankBySeniority(vector<Pairing*>& pairings, SharedPtr<CrewDataContext>& dbData) {
	if (dbData == nullptr) {
		return;
	}

	for (Pairing* pairing : pairings) {
		if (pairing == nullptr) {
			continue;
		}

		auto crewItems = collectPairingRosterRankItems(dbData, pairing);
		if (crewItems.size() < 2) {
			continue;
		}

		std::map<string, std::vector<PairingRosterRankItem>> sameActiveRankGroups;
		for (const auto& item : crewItems) {
			sameActiveRankGroups[item.activeRank].push_back(item);
		}

		for (auto& groupEntry : sameActiveRankGroups) {
			auto& crewItems = groupEntry.second;
			if (crewItems.size() < 2) {
				continue;
			}

			bool hasDownrankedCrew = false;
			for (const auto& item : crewItems) {
				if (isDownRanked(item)) {
					hasDownrankedCrew = true;
					break;
				}
			}
			if (!hasDownrankedCrew) {
				continue;
			}

			std::stable_sort(crewItems.begin(), crewItems.end(),
				[](const PairingRosterRankItem& left, const PairingRosterRankItem& right) {
					if (left.crew->seniorityNum != right.crew->seniorityNum) {
						return left.crew->seniorityNum < right.crew->seniorityNum;
					}
					return left.crew->idCrew < right.crew->idCrew;
				});

			std::vector<string> sortedActingRanks;
			sortedActingRanks.reserve(crewItems.size());
			for (const auto& item : crewItems) {
				sortedActingRanks.push_back(item.roster->actingRank);
			}
			std::stable_sort(sortedActingRanks.begin(), sortedActingRanks.end(),
				[&dbData](const string& left, const string& right) {
					const long long leftPriority = getRankPriority(dbData, left);
					const long long rightPriority = getRankPriority(dbData, right);
					if (leftPriority != rightPriority) {
						return leftPriority < rightPriority;
					}
					return left < right;
				});

			{
				std::stringstream beforeAssign;
				std::stringstream afterAssign;
				for (std::size_t i = 0; i < crewItems.size(); ++i) {
					if (i > 0) {
						beforeAssign << ", ";
						afterAssign << ", ";
					}
					beforeAssign << crewItems[i].roster->idcrew << ":" << crewItems[i].roster->actingRank
						<< "(sen=" << crewItems[i].crew->seniority << ")";
					afterAssign << crewItems[i].roster->idcrew << ":" << sortedActingRanks[i]
						<< "(sen=" << crewItems[i].crew->seniority << ")";
				}
				Logger::getRuleLogger()->info("[change_flight] pairing={} activeRank={} before=[{}] after=[{}]",
					pairing->getDbId(), groupEntry.first, beforeAssign.str(), afterAssign.str());
			}

			for (std::size_t i = 0; i < crewItems.size(); ++i) {
				syncRosterActingRank(dbData, crewItems[i], sortedActingRanks[i]);
			}
		}
	}
}

//20190619 ain, mantis#6026, 按utc排序duty.segments
void resetPairingSeqOrderByActingRankAndSeniority(vector<Pairing*>& pairings, SharedPtr<CrewDataContext>& dbData) {
	if (dbData == nullptr) {
		return;
	}

	auto syncCrewOnFlightSeqOrder = [&dbData](const long long fltId, const string& crewId, const int seqOrder) {
		auto cofIter = dbData->crewOnFlt.find(fltId);
		if (cofIter == dbData->crewOnFlt.end()) {
			return;
		}
		for (auto& cof : cofIter->second) {
			if (cof != nullptr && cof->crewId == crewId) {
				cof->seqOrder = seqOrder;
			}
		}
	};

	std::set<long long> targetFlightIds;
	for (Pairing* pairing : pairings) {
		if (pairing == nullptr) {
			continue;
		}
		for (Segment* segment : pairing->getSegments()) {
			if (segment != nullptr) {
				targetFlightIds.insert(segment->getDBId());
			}
		}
	}

	struct FlightCrewSeqItem {
		shared_ptr<RosterFlight> rosterFlight;
		SharedPtr<CREW> crew;
	};

	for (const auto fltId : targetFlightIds) {
		auto rosterFlights = dbData->rosterFlightMgr.get(fltId);
		if (rosterFlights.empty()) {
			continue;
		}

		vector<FlightCrewSeqItem> flyCrewItems;
		std::set<string> flightCrewIds;
		for (auto& rosterFlight : rosterFlights) {
			if (rosterFlight == nullptr) {
				continue;
			}
			if (flightCrewIds.find(rosterFlight->crewId) != flightCrewIds.end()) {
				continue;
			}
			flightCrewIds.insert(rosterFlight->crewId);

			if (rosterFlight->assignment != "FLY") {
				rosterFlight->seqOrder = 0;
				dbData->rosterFlightMgr.updateSeqOrder(rosterFlight->crewId, fltId, rosterFlight->pairingId, 0);
				syncCrewOnFlightSeqOrder(fltId, rosterFlight->crewId, 0);
				continue;
			}

			auto crewIter = dbData->crewIdMap.find(rosterFlight->crewId);
			if (crewIter == dbData->crewIdMap.end() || crewIter->second == nullptr) {
				Logger::getRuleLogger()->warn("[change_flight] skip seqOrder flt={} crew={} pairing={} because crew not found",
					fltId, rosterFlight->crewId, rosterFlight->pairingId);
				continue;
			}

			flyCrewItems.push_back({ rosterFlight, crewIter->second });
		}

		std::stable_sort(flyCrewItems.begin(), flyCrewItems.end(),
			[&dbData](const FlightCrewSeqItem& left, const FlightCrewSeqItem& right) {
				const int leftDisplayOrder = getRankDisplayOrder(dbData, left.rosterFlight->actingRank);
				const int rightDisplayOrder = getRankDisplayOrder(dbData, right.rosterFlight->actingRank);
				if (leftDisplayOrder != rightDisplayOrder) {
					return leftDisplayOrder < rightDisplayOrder;
				}
				if (left.crew->seniority != right.crew->seniority) {
					return left.crew->seniority < right.crew->seniority;
				}
				if (left.crew->seniorityNum != right.crew->seniorityNum) {
					return left.crew->seniorityNum < right.crew->seniorityNum;
				}
				return left.rosterFlight->crewId < right.rosterFlight->crewId;
			});

		for (std::size_t i = 0; i < flyCrewItems.size(); ++i) {
			const int seqOrder = static_cast<int>(i) + 1;
			auto& item = flyCrewItems[i];
			item.rosterFlight->seqOrder = seqOrder;
			dbData->rosterFlightMgr.updateSeqOrder(item.rosterFlight->crewId, fltId, item.rosterFlight->pairingId, seqOrder);
			syncCrewOnFlightSeqOrder(fltId, item.rosterFlight->crewId, seqOrder);
		}
	}

	for (Pairing* pairing : pairings) {
		if (pairing == nullptr) {
			continue;
		}

		std::map<string, int> pairingCrewSeqOrder;
		std::set<string> pairingCrewIds;

		for (Segment* segment : pairing->getSegments()) {
			if (segment == nullptr) {
				continue;
			}

			auto rosterFlights = dbData->rosterFlightMgr.get(segment->getDBId());
			for (auto& rosterFlight : rosterFlights) {
				if (rosterFlight == nullptr || rosterFlight->pairingId != pairing->getDbId()) {
					continue;
				}

				pairingCrewIds.insert(rosterFlight->crewId);

				if (rosterFlight->assignment != "FLY") {
					if (pairingCrewSeqOrder.find(rosterFlight->crewId) == pairingCrewSeqOrder.end()) {
						pairingCrewSeqOrder[rosterFlight->crewId] = 0;
					}
					continue;
				}

				auto pairingSeqIter = pairingCrewSeqOrder.find(rosterFlight->crewId);
				if (pairingSeqIter == pairingCrewSeqOrder.end()
					|| pairingSeqIter->second == 0
					|| rosterFlight->seqOrder < pairingSeqIter->second) {
					pairingCrewSeqOrder[rosterFlight->crewId] = rosterFlight->seqOrder;
				}
			}
		}

		auto copIter = dbData->crewOnPairing.find(pairing->getDbId());
		for (const auto& crewId : pairingCrewIds) {
			const int seqOrder = pairingCrewSeqOrder.find(crewId) == pairingCrewSeqOrder.end() ? 0 : pairingCrewSeqOrder[crewId];

			auto crewIter = dbData->crewIdMap.find(crewId);
			if (crewIter != dbData->crewIdMap.end() && crewIter->second != nullptr) {
				for (auto& roster : crewIter->second->rosterList) {
					if (roster != nullptr && roster->pairId == pairing->getDbId()) {
						roster->seqOrder = seqOrder;
					}
				}
			}

			if (copIter != dbData->crewOnPairing.end()) {
				for (auto& cop : copIter->second) {
					if (cop != nullptr && cop->crewId == crewId) {
						cop->seqOrder = seqOrder;
					}
				}
			}
		}
	}
}

void resetSegmentOrderByPairing(vector<Pairing*>& pairings) {
	for (Pairing* p : pairings) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			d->sortSegments();
		}
	}
}

void resetPairingCrewDay(vector<Pairing*>& pairings) {
	for (Pairing* p : pairings) {
		p->updatePairingTime();
		/*if (p->getNumDuties() == 1)
			p->setNumCrewDays(p->getDuty(0)->getEndTimeLocAct() / 86400 - p->getDuty(0)->getStartTimeLocAct() / 86400 + 1);
		else {
			Duty* firstDuty = p->getDuty(0);
			Duty* lastDuty = p->getDuty(p->getNumDuties() - 1);
			p->setNumCrewDays(lastDuty->getEndTimeLocAct() / 86400 - firstDuty->getStartTimeLocAct() / 86400 + 1);
		}
		int _blk = 0;
		double flyhours = 0.0;
		for (const auto& d : p->getDutyVec()) {
			_blk += d->getBLKInMins();
			flyhours += d->getFlyHours();
		}
		p->setBlk(_blk);
		p->setAverageBlk((double)(_blk / p->getNumCrewDays()));
		p->setFlyingHours(flyhours);*/
	}
}

//按flt.isDelete更新roster/pairing/segment
void resetRosterPairingIsDelete(vector<SharedPtr<Segment>>& flights, vector<Pairing*>& pairings, vector<SharedPtr<CREW>>& crewList) {
	map<long long, bool> deletedFlts;
	for (auto& f : flights) {
		if (f->getFltSts() == "CNL") {
			deletedFlts[f->getDBId()] = true;
		}
	}


	map<long long, bool> deletedPairings;
	for (auto& p : pairings) {
		bool pairingHasDeleteFlt = false;
		for (Duty* d : p->getDutyVec()) {
			bool dutyHasDeleteFlt = false;
			for (Segment* s : d->getSegments()) {
				long long fltId = s->getDBId();
				if (deletedFlts.find(fltId) != deletedFlts.end()) {
					s->setIsDeleted(true);
					d->setIsDeleted(true);
					p->setIsDeleted(true);
					deletedPairings[p->getDbId()] = true;
					dutyHasDeleteFlt = true;
					pairingHasDeleteFlt = true;
				}
				else {
					s->setIsDeleted(false);    //20190422 ain, 完善逻辑分支 isDelete= true/false
				}
			}
			d->setIsDeleted(dutyHasDeleteFlt); //20190422 ain, 完善逻辑分支 isDelete= true/false
		}
		p->setIsDeleted(pairingHasDeleteFlt);  //20190422 ain, 完善逻辑分支 isDelete= true/false
	}

	for (auto& c : crewList) {
		for (auto& r : c->rosterList) {
			if (deletedPairings[r->pairId]) {
				r->isDelete = "Y";
			}
			else {
				r->isDelete = "N";
			}
		}
	}
}

void resetPairingFleet(vector<Pairing*>& pairings, SharedPtr<CrewDataContext>& dbData) {
	//增加pairing fleet赋值 mantis-0012269
	for (auto& p : pairings) {
		string fleet = "";
		for (const auto& seg : p->getSegments()) {
			if (seg->getIsOperating()) {
				fleet = seg->getFleetCD();
				break;
			}
			if (fleet.empty()) {
				fleet = seg->getFleetCD();
			}
			else {
				auto beforeFleet = dbData->fleetMap.find(fleet);
				auto currFleet = dbData->fleetMap.find(seg->getFleetCD());
				if (currFleet == dbData->fleetMap.end())
					continue;
				if (beforeFleet == dbData->fleetMap.end() || beforeFleet->second.displayOrder > currFleet->second.displayOrder)
					fleet = currFleet->second.fleet;
			}
		}
		if (!fleet.empty())
			p->setFltCode(fleet);
	}
}

//20190524 ain, mantis#5665, 针对change_flight 缩小数据范围, 避免server广播冗余数据
void filterDataForFlightChangeOutput(SharedPtr<CrewDataContext>& dbData, vector<long long>& flightIds) {
	map<long long, bool> fltIdMap;
	for (auto& fid : flightIds) {
		fltIdMap[fid] = true;
	}
	//
	//dbData->pairingList
	vector<Pairing*> pairingsOfFlt;
	for (auto& p : dbData->pairingList) {
		bool matchFlt = false;
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				long long fltId = s->getDBId();
				if (fltIdMap.find(fltId) != fltIdMap.end()) {
					matchFlt = true;
					break;
				}
			}
			if (matchFlt)
				break;
		}
		if (matchFlt)
			pairingsOfFlt.push_back(p);
	}
	dbData->pairingList = pairingsOfFlt;
	//
	//dbData->pairingIdMap
	dbData->pairingIdMap.clear();
	for (auto& p : pairingsOfFlt) {
		dbData->pairingIdMap[p->getDbId()] = p;
	}
	//
	//dbData->crewList
	vector<SharedPtr<CREW>> crewOfFlt;
	for (auto& c : dbData->crewList) {
		for (auto& r : c->rosterList) {
			long long pairingId = r->pairId;
			if (dbData->pairingIdMap.find(pairingId) != dbData->pairingIdMap.end()) {
				crewOfFlt.push_back(c);
				break;//to next crew
			}
		}
	}
	dbData->crewList = crewOfFlt;
	//
	//crew->roster
	for (auto& c : dbData->crewList) {
		vector<SharedPtr<ROSTER>> rosterOfFlt;
		for (auto& r : c->rosterList) {
			long long pairingId = r->pairId;
			if (dbData->pairingIdMap.find(pairingId) != dbData->pairingIdMap.end()) {
				rosterOfFlt.push_back(r);
			}
		}
		c->rosterList = rosterOfFlt;
	}
}

//20190524 ain, mantis#5422, 返航备降后重算 pairing.label
void resetRosterPairingSegmentLabel(SharedPtr<CrewDataContext>& dbData, vector<long long>& flightIds) {
	map<long long, bool> fltIds;
	for (auto& fid : flightIds) {
		fltIds[fid] = true;
	}
	map<long long, Segment*> fltIdMap;
	for (auto& flt : dbData->flightList) {
		if (fltIds.find(flt->getDBId()) != fltIds.end()) {
			fltIdMap[flt->getDBId()] = flt.get();
		}
	}
	//reset dep/arv
	map<long long, Pairing*> changedPairings;
	for (auto& p : dbData->pairingList) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			for (std::size_t j = 0; j < d->getNumSegments(); j++) {
				Segment* s = d->getSegment(j);
				long long fltId = s->getDBId();
				if (fltIdMap.find(fltId) != fltIdMap.end()) {
					Segment* flt = fltIdMap[fltId];
					s->setDepStation(flt->getDepStation());
					s->setArrStation(flt->getArrStation());
					changedPairings[p->getDbid()] = p;
				}
			}
		}
	}
	//reset pairing.label
	for (auto& it : changedPairings) {
		Pairing* p = it.second;
		if (!p->getInterfaceId().empty()) continue;
		p->setLabel(makePairingLabel(p, dbData.get()));
	}
	//reset roster.label
	for (auto& c : dbData->crewList) {
		for (auto& r : c->rosterList) {
			if (changedPairings.find(r->pairId) != changedPairings.end()) {
				Pairing* p = changedPairings[r->pairId];
				if (!p->getInterfaceId().empty()) continue;
				r->label = p->getLabel();
				r->ver += 1;//mantis#5831
			}
		}
	}
}
