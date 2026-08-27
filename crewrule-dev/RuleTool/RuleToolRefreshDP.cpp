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
#ifdef WIN32
#include <direct.h>
#endif
//#include <direct.h>
#include <algorithm>
#include <fstream>
#include "RuleTool.h"
#include "UtilFunc.h"
#include "CustomBiz/CustomBiz.h"
#include "RuleParams.h"
#include "PairingAttrCalculator.h"

static void resetRosterTimeByPairing(vector<Pairing*>& pairings, vector<SharedPtr<CREW>>& crews);
static void resetSegmentOrderByPairing(vector<Pairing*>& pairings);
static void resetRosterDP(vector<std::shared_ptr<ROSTER>> rosters, CrewDataContext* dbData);
static long calculateDP(Duty* duty, CrewDataContext* dbData);

int RuleTool::reRefreshDP(long long scenarioId, string startDt, string endDt, string division) {
	int ret = 0;
	int i = 0;
	time_t startLoc = 0;
	time_t endLoc = 0;

	//20180410 ain, mantis#3104, 添加cmdline startDt/endDt检查
	if (!checkDateTimeStr(startDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", startDt.c_str());
		return ret;
	}
	if (!checkDateTimeStr(endDt.c_str())) {
		printf("ERROR: invalid date '%s'\n", endDt.c_str());
		return ret;
	}

	startLoc = utcStrToUtc((char*)startDt.c_str());
	endLoc = utcStrToUtc((char*)endDt.c_str());
	//20180321 ain, mantis#2985, 数据源兼容 db/server 
	ret = dbData->loadData(scenarioId, startLoc, endLoc, 0, "", "", "", division); //不指定base/rank/fleet/ruleSet/division
	if (ret != 0) {
		printf("load data fail %d\n", ret);
		return ret;
	}

	reCalculateDP();

	return ret;
}

int RuleTool::reCalculateDP() {
	int ret = 0;
	vector<SharedPtr<CREW_MANDAY_CC_AM>> mandayCcList;
	vector<SharedPtr<CREW_MANDAY_FD>> mandayFdList;


	_legality->setDataContext(dbData);
	if (ret != 0) {
		goto CLEANUP;
	}
	//
	_legality->resetPairingDutySegTimeByFlight(dbData, dbData->flightList, dbData->pairingList);


	resetRosterTimeByPairing(dbData->pairingList, dbData->crewList);
	resetSegmentOrderByPairing(dbData->pairingList);//20190619 ain, mantis#6026, 按act_str排序duty.segments

	//calculate manday
	printf("%s reCalculateManday start\n", utcToUtcString(time(0)).c_str());
	for (std::size_t i = 0; i < dbData->crewList.size(); i++) {
		SharedPtr<CREW>& crew = dbData->crewList[i];
		string idcrew = crew->idCrew;
		if (crew->division == "P") {
			crew->mandayFdList = _legality->calculateMandayFD(dbData, crew, crew->rosterList);
			mandayFdList.insert(mandayFdList.end(), crew->mandayFdList.begin(), crew->mandayFdList.end());
		}
		else {
			crew->mandayCcAmList = _legality->calculateMandayCC(dbData, crew, crew->rosterList);
			mandayCcList.insert(mandayCcList.end(), crew->mandayCcAmList.begin(), crew->mandayCcAmList.end());
		}
	}
	printf("%s reCalculateManday end\n", utcToUtcString(time(0)).c_str());


	//通过duty brief时间修复duty的开始时间
	for (auto& pairing : dbData->pairingList) {
		for (size_t i = 0; i < pairing->getDutyVec().size(); i++) {
			Duty* duty = pairing->getDuty(i);
			duty->fixingDutyBriefNode();
		}
	}

	resetRosterDP(dbData->rosterList, dbData.get());

	//save 
	dbData->saveRosterDP();

CLEANUP:
	return ret;
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

//20190619 ain, mantis#6026, 按utc排序duty.segments
void resetSegmentOrderByPairing(vector<Pairing*>& pairings) {
	for (Pairing* p : pairings) {
		for (std::size_t i = 0; i < p->getNumDuties(); i++) {
			Duty* d = p->getDuty(i);
			d->sortSegments();
		}
	}
}

void resetRosterDP(vector<std::shared_ptr<ROSTER>> rosters, CrewDataContext* dbData) {
	CalculationManday DP = dbData->getCalculationManday("DP");
	CalculationManday ACT_DP = dbData->getCalculationManday("ACT DP");
	for (auto roster : rosters) {
		if (!roster->pairing) {
			calculateRosterDP(roster.get(), dbData);
			continue;
		}

		auto pairing = roster->pairing;
		string pairingAssignment = pairing ? pairing->getQualifier() : "FLY";
		map<string, SharedPtr<ASSIGNMENT>>::iterator dbPairingAssignment = dbData->assignmentNameMap.find(pairingAssignment);
		long totalDP = 0;
		for (auto duty : pairing->getDutyVec()) {
			const auto & sch_dpEnd = duty->getDPSchEndUtcTimes();
			const auto&  act_dpEnd = duty->getEndTimeUtc(ACT_DP.end);
			const auto&  dpEnd = duty->getEndTimeUtc(DP.end);
			const auto&  dpStart = duty->getStartTimeUtc(DP.str);
			const auto&  act_dpStart = duty->getStartTimeUtc(ACT_DP.str);
			const auto&  sch_dpStart = duty->getDPSchStartUtcTimes();

			//DP/ACT_DP
			double dpPct = (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->DP_PCT : 1;
			int dpGap = 0;
			int beforePctDpGap = (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->before_pct_dp_gap * 60 : 0;
			int afterPctDpGap = (dbPairingAssignment != dbData->assignmentNameMap.end()) ? dbPairingAssignment->second->after_pct_dp_gap * 60 : 0;
			int dpAdjust = calculateDP(duty, dbData);
			for (const auto& seg : duty->getSegmentsRead()) {
				const auto& dbSegAssignment = dbData->assignmentNameMap.find(seg->getAssignment());
				if (dbSegAssignment == dbData->assignmentNameMap.end())
					continue;

				if (Utility::GetInstancePtr()->checkCoverdDPGapTimeRange(seg->getStartTimeLocAct(), seg->getEndTimeLocAct(), dbData)) {
					dpGap += dbSegAssignment->second->DP_GAP;
				}
			}
			if (dpStart < dpEnd)
			{
				long dp = static_cast<long>((dpEnd - dpStart + beforePctDpGap) * dpPct) + dpGap * 60 + afterPctDpGap + dpAdjust;
				duty->setDPInSecs(dp);
			}

			if (act_dpStart < act_dpEnd)
			{
				long dp = static_cast<long>((act_dpEnd - act_dpStart + beforePctDpGap) * dpPct) + dpGap * 60 + afterPctDpGap + dpAdjust;
				duty->setActualDP(dp / 60);
				totalDP += dp;
			}

			if (sch_dpStart < sch_dpEnd)
			{
				long dp = static_cast<long>((sch_dpEnd - sch_dpStart + beforePctDpGap) * dpPct) + dpGap * 60 + afterPctDpGap + dpAdjust;
				duty->setScheduleDP(dp / 60);
			}
		}
		roster->dpMinutes = totalDP / 60;
	}
}

long calculateDP(Duty* duty, CrewDataContext* dbData) {
	long dp = 0;
	auto& dpDefinition = RuleParams::GetInstancePtr()->getDPDefinition();
	if (!dpDefinition.dpAssignments.empty()) {
		const auto& assignments = dpDefinition.dpAssignments;
		for (const auto& seg : duty->getSegmentsRead()) {
			if (dpDefinition.matchSegment(seg)) {
				dp += static_cast<long>(seg->getBlkMinutes() * 60 * dpDefinition.dpPct);
			}
		}
	}
	return dp;
}
