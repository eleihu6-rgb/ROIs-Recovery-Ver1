
#include <stdio.h>
#include <time.h>
#include <iostream>
#include <fstream>
#include <algorithm>
#include <iomanip>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "JsonPairing.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "OrLog.h"
#include "UtilFunc.h"

#if defined(__unix) || defined(__APPLE__)
    #define _snprintf snprintf
#endif

//需要debug内存时，把这里打开 - start
//#include <Psapi.h>
//#pragma comment(lib,"Psapi.lib")
//需要debug内存时，把这里打开 - end

void printSegment(Segment * p, ofstream& f);


unsigned long long getProcessPeakMem() {
	//PROCESS_MEMORY_COUNTERS pmc = { 0 };
	//pmc.cb = sizeof(pmc);
	//if (!GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc)))
	//{
	//	printf("GetProcessMemoryInfo Error: %d\n", GetLastError());
	//}

	//return pmc.PeakWorkingSetSize;
	return 0;
}

unsigned long long getProcessCurrentMem() {
	//1. 需要debug内存时，把这里打开
	/*PROCESS_MEMORY_COUNTERS pmc = { 0 };
	pmc.cb = sizeof(pmc);
	if (!GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc)))
	{
		printf("GetProcessMemoryInfo Error: %d\n", GetLastError());
	}
	return pmc.WorkingSetSize;*/
	
	//2. 不需要debug内存时，把这里打开，直接return 0
	return 0;
}

static unsigned long long increment = 1024;
static unsigned long long lastMemSize = 0;
static const char* lastMsg = NULL;

void printMemInfo(const char * msg) {
	unsigned long long current = getProcessCurrentMem();
	if (current != lastMemSize) {
		if (current - lastMemSize > increment)
			printf("%s currentMem=%llu (%llu k) increment=%llu\n", msg, current, (current / 1024), current - lastMemSize);
		lastMemSize = current;
	}
}

//
void printMemInfo(stringstream& ss, const char * msg) {
	try {
		unsigned long long current = getProcessCurrentMem();
		if (current - lastMemSize >= increment) {
			cout << ((lastMsg!=NULL)?lastMsg:"before first mem check ") << " currentMem=" << (lastMemSize / 1024) << " to " << (current / 1024) << endl;
		}

		lastMemSize = current;
		lastMsg = msg;
	}
	catch (std::string ex) {
		cout << "Exception printMemInfo fail, " << ex << endl;
	}
	catch (std::exception ex) {
		cout << "Exception printMemInfo fail, " << ex.what() << endl;
	}
	
	catch (...) {
		cout << "Exception printMemInfo general fail" << endl;
	}
}

void printMemInfoIncrement(const char * msg, long long increment) {

	unsigned long long current = getProcessCurrentMem();
	if (static_cast<long long>(current - lastMemSize) >= increment) {
		cout << ((lastMsg != NULL) ? lastMsg : "before first mem check ") << " to " << msg << ", currentMem=" << (lastMemSize / 1024) << " k to " << (current / 1024) << " k" << endl;
	}

	lastMemSize = current;
	lastMsg = msg;
}

//20180312 ain, mantis#2933, ro_input_tes
bool test_file_compareRoster(SharedPtr<ROSTER>& a, SharedPtr<ROSTER>& b) {
	if (a->idcrew == b->idcrew) {
		if (a->strUtc == b->strUtc)
			return a->endUtc < b->endUtc;
		else
			return a->strUtc < b->strUtc;
	}
	else {
		return a->idcrew.compare(b->idcrew) < 0;
	}
}

void test_file_roster(vector<SharedPtr<ROSTER>> &rosterList, char * filename) {
	char filenameBuf[512] = { 0 };
	_snprintf(filenameBuf, sizeof(filenameBuf) - 1, "%s", filename);
	FILE * fp = fopen(filenameBuf, "w");
	char strBuf[100] = { 0 };
	char restStrBuf[100] = { 0 };
	char endBuf[100] = { 0 };
	char actRestStrBuf[100] = { 0 };
	char pairingEndRestBuf[100] = { 0 };

	//20180312 ain, mantis#2933, 排序 crewId -> strUtc -> endUtc
	std::sort(rosterList.begin(), rosterList.end(), test_file_compareRoster);
	//printf(">> test_file_roster start\n"); fflush(stdout);
	//for (vector<Pairing*>::iterator it = pairingList.begin(); it != pairingList.end(); it++) {
	for (std::size_t i = 0; i < rosterList.size(); i++) {
		ROSTER * r = rosterList[i].get();
		const char * dutyType = r->duty.c_str();
		utcToUtcStr(r->strUtc, strBuf, sizeof(strBuf));
		utcToUtcStr(r->restStrUtc, restStrBuf, sizeof(restStrBuf));
		utcToUtcStr(r->endUtc, endBuf, sizeof(endBuf));
		utcToUtcStr(r->actRestStrUtc, actRestStrBuf, sizeof(actRestStrBuf));
		if (r->pairing != NULL)
			utcToUtcStr(r->pairing->getEndTimeIncludingRestUtcSch(), pairingEndRestBuf, sizeof(pairingEndRestBuf));
		else
			utcToUtcStr(r->endUtc, pairingEndRestBuf, sizeof(pairingEndRestBuf));

		// const char* 不能直接赋值到char*  2022/7/22  haoli.
		string str = r->isRequested ? "Y": "N";
		char * isReq = (char*)str.c_str();
		fprintf(fp, "roster   scenario:%lld  roster_id:%lld  crew:%s  pair_id:%llu   dutyType:%s  src:%s  utc:%s/%s/%s loc:%s/%s/%s pairing.endRest:%s  payTime:%d  label:%s isReq=%s  qualifier=%s role=%s needRule=%s\n", 
			r->idscenario, r->rosterId, r->idcrew.c_str(), r->pairId, r->duty.c_str(), r->source.c_str(), strBuf, restStrBuf, endBuf, 
			utcToUtcString(r->strLoc).c_str(), utcToUtcString(r->restStrLoc).c_str(), utcToUtcString(r->endLoc).c_str(),
			pairingEndRestBuf, r->totalPayTime, r->label.c_str(), isReq, r->qualifier.c_str(), r->role.c_str(), r->needRuleCheck ? "Y":"N");
	}
	fclose(fp);
	//printf("<< test_file_roster end\n"); fflush(stdout);
}

void test_file_pairing2(vector<Pairing*> &pairingList, char * filename) {
	ofstream f(filename);
	for (auto& p : pairingList) {
		//Pairing* p = it.second;
		f << "Pairing  "
			<< " id:" << p->getId()
			<< " dbId:" << p->getDbId()
			<< " loc:" << utcToUtcString(p->getStartTimeLocSch()) << " " << utcToUtcString(p->getEndTimeLocSch())
			<< " utc:" << utcToUtcString(p->getStartTimeUtcSch()) << " " << utcToUtcString(p->getEndTimeUtcSch())
			<< " restEnd:" << utcToUtcString(p->getEndTimeIncludingRestLocSch()) 
			<< " base:" << p->getBase()
			<< " fleet:" << p->getFltCode()
			<< " flyHour:" << p->getFlyingHours()
			<< " flyHourCoverage:" << p->getFlyHoursCoverage()
			<< " isBlkOverNormal:" << p->getIsBlkOverNormal()
			<< " pairingNum:" << (p->getDbId() == 0 ? "" : p->getPairingNum())
			<< " pgFDP:" << joinIntList(p->getPgFDP(), "|")
			<< " pgDP:" << joinIntList(p->getPgDP(), "|")
			<< " pgBLK:" << joinIntList(p->getPgBLK(), "|")
			<< " fdp:" << (p->getFDPInSec() / 60)
			//<< " dp:" << (p->getDPInSec() / 60)
			//<< " blk:" << (p->getBLKInSec() / 60)
			<< " avgBlk:" << p->getAverageBlk()
			<< " _numCrewDays:" << p->getNumCrewDays()
			<< " numDaysIncludeRest:" << p->getNumDaysIncludeRest()
			<< " complement:" << joinMapToStr(p->getComplements())
			<< " compId:" << p->getCompositionId()
			<< " acChangePoint:" << p->getAircraftChangePoints()
			<< " totalLandingPoint:" << p->getTotalLandingPoints()
			<< " totalDiffcultAirportPoint:" << p->getTotalDifficultAirportPoints()
			<< " blkPoint:" << p->getBlkPoints()
			<< " turnTimePoint:" << p->getTurnTimePoints()
			<< " earlyDepPoint:" << p->getEarlyDepPoints()
			<< " lateArrPoint:" << p->getLateArrPoints()
			<< " dutyBlkPoint:" << p->getDutyBlkPoints()
			<< " dutyFdpPoint:" << p->getDutyFdpPoints()
			<< " layoverStationChangePoint:" << p->getLayoverStationChangePoints()
			<< " _blankDayWithinPairingPoints:" << p->getBlankDayWithinPairingPoints()
			<< " totalFatiguePoint:" << p->getTotalFatiguePoints()
			<< " primeActivity:" << p->getPrimeActivity()
			<< " region:" << p->getRegion()
			<< " cost:" << p->getCost()
			<< " reduceCost:" << p->getReduceCost()
			<< " incentiveFlyAllowance:" << p->getIncentiveFlyAllowance()
			<< " mealAllowance:" << p->getMealAllowance()
			<< " overnightAllowance:" << p->getOvernightAllowance()
			<< " hotelCost:" << p->getHotelCost()
			<< " crewDayCost:" << p->getCrewDayCost()
			<< " longTransitCost:" << p->getLongTransitCost()
			<< " numBlankDays:" << p->getNumBlankDays()
			<< " picksInPostOptimize:" << p->getNumPicksInPostOptimizer()
			<< " isExpatAllow:" << p->getIsExpatAllow()
			<< " isExpatMust:" << p->getIsExpatMust()
			<< " coverageVal:" << p->getCoverageVal()
			<< " colPoolCost:" << p->getPgColPoolCost()
			<< " specialArpInPairing:" << joinStrList(p->getSpecialAirportsInPairing(), "|")
			<< " attr:" << p->getAttribute()
			<< " isPgWithExtraDhd:" << p->getIsPairingWithExtraDhd()
			<< " originColPoolId:" << p->getOriginalColPoolId()
			<< " isFerryConnectNeed:" << p->getIsFerryConnectNeed()
			<< " modelIndex:" << p->getModelIndex()
			//<< " isCopy:" << p->getiscopy
			<< " numDhdCount:" << p->getNumDhdsCount()
			//<< " numBusCount:" << p
			<< " totalFlagValue:" << p->getTotalFlagValue()
			<< " isBusInclude:" << p->getBusFlag()
			<< " isDhdInclude:" << p->getDhdFlag()
			<< " isBlankDayInclude:" << p->getBlankFlag()
			<< " attributes:" << p->getAttribute()
			<< " division:" << p->getDivision()
			<< " label:" << p->getLabel()
			<< " qualifier:" << p->getQualifier()
			<< " scenarioId:" << p->getScenarioId();
			//<< " specialAirportMap:" << p->getSpecialAirportsInPairing
		f << " stationList:";
		for (auto& it : p->getStationList()) {
			f << it.first << "=" << joinStrList(it.second, "|") << "_";
		}
		
		f << endl;
	}
	f.close();
}

void test_file_pairing(vector<Pairing*> &pairingList, char * filename) {
	char filenameBuf[512] = { 0 };
	_snprintf(filenameBuf, sizeof(filenameBuf) - 1, "%s", filename);
	FILE * fp = fopen(filenameBuf, "w");
	if (!fp) {
		return;
	}
	char strBuf[100] = { 0 };
	char endBuf[30] = { 0 };
	char strUtcBuf[30] = { 0 };
	char endUtcBuf[30] = { 0 };
	char endRestBuf[30] = { 0 };
	char actStrBuf[100] = { 0 };
	char actEndBuf[30] = { 0 };
	char actStrUtcBuf[30] = { 0 };
	char actEndUtcBuf[30] = { 0 };
	//for (vector<Pairing*>::iterator it = pairingList.begin(); it != pairingList.end(); it++) {
	
	//std::sort(pairingList.begin(), pairingList.end(), [](Pairing* a, Pairing* b) {
	//	return a->getDbId() < b->getDbId();
	//});

	for (std::size_t i = 0; i < pairingList.size(); i++) {
		Pairing* pairing = pairingList[i];
		string primeActStr = pairing->getPrimeActivity().c_str();
		const char * primeAct = primeActStr.c_str();
		utcToUtcStr(pairing->getStartTimeLocSch(), strBuf, sizeof(strBuf));
		utcToUtcStr(pairing->getEndTimeLocSch(), endBuf, sizeof(endBuf));
		utcToUtcStr(pairing->getStartTimeUtcSch(), strUtcBuf, sizeof(strUtcBuf));
		utcToUtcStr(pairing->getEndTimeUtcSch(), endUtcBuf, sizeof(endUtcBuf));
		utcToUtcStr(pairing->getEndTimeIncludingRestLocSch(), endRestBuf, sizeof(endRestBuf));
		utcToUtcStr(pairing->getStartTimeLocAct(), actStrBuf, sizeof(actStrBuf));
		utcToUtcStr(pairing->getEndTimeLocAct(), actEndBuf, sizeof(actEndBuf));
		utcToUtcStr(pairing->getStartTimeUtcAct(), actStrUtcBuf, sizeof(actStrUtcBuf));
		utcToUtcStr(pairing->getEndTimeUtcAct(), actEndUtcBuf, sizeof(actEndUtcBuf));
		if (pairing->getFDP().size() > 0)
			fprintf(fp, "pairing    pair_id: %lld  label:%s  attr:%s  act:%s fleGrp:%s base:%s  sch:{loc:%s~%s utc:%s~%s}  act:{loc:%s~%s utc:%s~%s}  endRestLoc: %s  dutyCnt:%zd  FDP=%d:%02d  BLK=%d:%02d  FTG=%.1f  qualifier=%s %lld\n",
			pairing->getDbId(), pairing->getLabel().c_str(), pairing->getAttribute().c_str(), primeAct, pairing->getFltCode().c_str(), pairing->getBase().c_str(), 
			strBuf, endBuf, strUtcBuf, endUtcBuf, actStrBuf, actEndBuf, actStrUtcBuf, actEndUtcBuf,
			endRestBuf, pairing->getDutyVec().size(),
			pairing->getFDP()[0], pairing->getFDP()[1], pairing->getBlk()[0], pairing->getBlk()[1], pairing->getTotalFatiguePoints(), pairing->getQualifier().c_str(), pairing->getScenarioId());
		else
			fprintf(fp, "pairing    pair_id: %lld  label:%s attr:%s  act:%s fleGrp:%s base:%s  sch:{loc:%s~%s utc:%s~%s}  act:{loc:%s~%s utc:%s~%s}  dutyCnt:%zd  FDP=0  BLK=0  qualifier=%s %lld\n", 
			pairing->getDbId(), pairing->getLabel().c_str(), pairing->getAttribute().c_str(), primeAct, pairing->getFltCode().c_str(), pairing->getBase().c_str(), 
			strBuf, endBuf, strUtcBuf, endUtcBuf, actStrBuf, actEndBuf, actStrUtcBuf, actEndUtcBuf,
			pairing->getDutyVec().size(), pairing->getQualifier().c_str(), pairing->getScenarioId());

		char complementStr[200] = { 0 };
		map<string, int> &complement = pairing->getComplements();//pairing plan composition
		complementToStr(complement, complementStr, sizeof(complementStr));
		fprintf(fp, "                  pairing-plan-composition:%s\n", complementStr);

		char openCompositionStr[200] = { 0 };
		map<string, int> &openComposition = pairing->getOpenComposition();//pairing open composition
		complementToStr(openComposition, openCompositionStr, sizeof(openCompositionStr));
		fprintf(fp, "                  pairing-open-composition:%s\n", openCompositionStr);

		vector<Duty*> dutyList = pairing->getDutyVec();
		for (std::size_t j = 0; j < dutyList.size(); j++) {
			Duty * d = dutyList[j];
			Duty* nextDuty = (j + 1) >= dutyList.size() ? nullptr : dutyList[j + 1];

			//vector<Segment*> segList = d->getSegments();
			int dutySeq = dutyList[j]->getDutySegNum();
			const char * type = dutyList[j]->getTypeStr();
			int actualRest = d->getActualRest();
			fprintf(fp, "            duty seq: %d   dutyType: %s  actRestMin: %d  creditedHour: %f   maxDp:%d\n", 
				dutySeq, type, actualRest, (d->getCreditInSec() / 3600.0),
				 d->getMaxDutyMin());

			for (std::size_t k = 0; k < d->getNumSegments(); k++) {
				Segment *s = d->getSegment(k);
				char * isOperating = "N";
				if (s->getIsOperating()) {
					isOperating = "Y";
				}

				utcToUtcStr(s->getStartTimeLocSch(), strBuf, sizeof(strBuf));
				utcToUtcStr(s->getEndTimeLocSch(), endBuf, sizeof(endBuf));
				utcToUtcStr(s->getStartTimeUtcSch(), strUtcBuf, sizeof(strUtcBuf));
				utcToUtcStr(s->getEndTimeUtcSch(), endUtcBuf, sizeof(endUtcBuf));
				utcToUtcStr(s->getStartTimeLocAct(), actStrBuf, sizeof(actStrBuf));
				utcToUtcStr(s->getEndTimeLocAct(), actEndBuf, sizeof(actEndBuf));
				utcToUtcStr(s->getStartTimeUtcAct(), actStrUtcBuf, sizeof(actStrUtcBuf));
				utcToUtcStr(s->getEndTimeUtcAct(), actEndUtcBuf, sizeof(actEndUtcBuf));

				fprintf(fp, "               segment:  flt_id: %lld %s   assign: %s   isOperating: %s   sch:{loc:%s~%s utc:%s~%s} act:{loc:%s~%s utc:%s~%s}\n",
					s->getDBId(), s->getFleetCD().c_str(), s->getAssignment().c_str(), isOperating,
					strBuf, endBuf, strUtcBuf, endUtcBuf,
					actStrBuf, actEndBuf, actStrUtcBuf, actEndUtcBuf);


				char segPlanCompStr[200] = { 0 };
				const map<string, int> &segPlanComp = s->getPlanComposition();//seg plan composition
				complementToStr(segPlanComp, segPlanCompStr, sizeof(segPlanCompStr));
				fprintf(fp, "                   seg-plan-composition:%s\n", segPlanCompStr);

				char segOpenCompStr[200] = { 0 };
				const map<string, int> &openComp = s->getOpenComposition();//seg open composition
				complementToStr(openComp, segOpenCompStr, sizeof(segOpenCompStr));
				fprintf(fp, "                   seg-open-composition:%s\n", segOpenCompStr);

				char segFillCompStr[200] = { 0 };
				const map<string, int> &fillComp = s->getFillComposition();//seg fill composition
				complementToStr(fillComp, segFillCompStr, sizeof(segFillCompStr));
				fprintf(fp, "                   seg-fill-composition:%s\n", segFillCompStr);
			}
		}
	}
	fclose(fp);
}


//--------------------------------------------------------------
void test_file_rule(vector<DBRule> &ruleList, char * filepath) {
	int i = 0;
	FILE * fp = fopen(filepath, "w");
	bool rule2007OK = true;
	long long rule2007Id = 0;
	for (vector<DBRule>::iterator ir = ruleList.begin(); ir != ruleList.end(); ir++) {
		fprintf(fp, "    ruleId:%lld\t override-bility:%s  source:%s func:%08d\t severity:%d phase:%d class:%s description:%s talbe%d row%d   \t\tparams: ", 
			ir->idRule, ir->overridebility.c_str(), ir->source.c_str(), ir->function, ir->severity, ir->phase, ir->classType, ir->description, ir->tableNum, ir->rowNum);
		for (map<string, string>::iterator param = ir->params.begin(); param != ir->params.end(); param++)
		{
			fprintf(fp, "%s=%s, ", param->first.c_str(), param->second.c_str());
		}

		if (ir->function == 2007) {
			rule2007Id = ir->idRule;
			string maxFDPStr = ir->params["Max FDP"];
			if (maxFDPStr.empty()) {
				//printf("\n***WARN! MaxFDP is null for idrule=%d  table=%s\n", ir->idRule, ir->table);
				rule2007OK = false;
			}
			if (!isHHmm(maxFDPStr.c_str())) {
				//printf("\n***WARN! MaxFDP is NOT 'HH:mm' format for idrule=%d  table=%s  value=%s\n", ir->idRule, ir->table, maxFDPStr.c_str());
				rule2007OK = false;
			}
		}
		fprintf(fp, "\n");
	}
	fclose(fp);
	if (!rule2007OK) {
		printf("Rule 2007 OK  idrule=%lld\n", rule2007Id);
	}
}
void test_file_cqf(vector<DBCqf> &cqfList, char* filepath) {
	FILE * fp = fopen(filepath, "w");
	for (vector<DBCqf>::iterator it = cqfList.begin(); it != cqfList.end(); it++) {
		fprintf(fp, "    cqfId:%lld\t func:%08d\t description:%s  names:%s values:", it->idCqf, it->function, it->description.c_str(), it->paramNames.c_str());
		for (std::size_t i = 0; i < it->paramValues.size(); i++) {
			fprintf(fp, "%s,", it->paramValues[i].c_str());
		}
		fprintf(fp, "\n");
	}
	fclose(fp);
}

void test_file_duty(vector<Duty*>& dutyList, char* filename) {
	cout << ">> test_file_duty()" << endl;
	//FILE * fp = fopen(filename, "w");
	int dutySeq = 0;
	int currentPairId = 0;
	ofstream f(filename);
	for (std::size_t i = 0; i < dutyList.size(); i++) {
		Duty * d = dutyList[i];
		Duty* nextDuty = (i + 1) >= dutyList.size() ? nullptr : dutyList[i + 1];
		int actualRest = d->getActualRest();
		//char * type = parseDutyTypeToStr(d->getType());
		//cout <<"dutyPool.size(): " << dutyList.size() - 1 << endl;
		//cout << "i = " << i << endl;
		//cout << "Duty    "
		//	<< d->getId() << " "
		//	<< "type:" << d->getType() << "(" << d->getTypeStr() << ") "
		//	<< "dom:" << d->getDomIntType() << " "
		//	<< "depTm:" << utcToUtcString(d->getDepTime()) << " "
		//	<< "arvTm:" << utcToUtcString(d->getArrTime()) << " "
		//	<< "utc:[" << utcToUtcString(d->getUtcStartTime()) << ", " << utcToUtcString(d->getUtcEndTime()) << "] "
		//	<< "loc:[" << utcToUtcString(d->getStartTime()) << ", " << utcToUtcString(d->getEndTime()) << "] "
		//	<< d->getDepStation() << "->" << d->getArrStation() << " "
		//	<< "minRstInPg:" << 0 << " "// d->getMinRestWithinPg() << " "
		//	<< "minRstAfterPg:" << 0 << " " //  d->getMinRestAfterPg() << " "
		//	<< "maxRstInPg:" << 0 << " "
		//	<< "maxRstAfterPg:" << 0 << " "
		//	<< "fleet:" << d->getFltCD() << " "
		//	<< "dayInt:" << d->getDayInt() << " "
		//	<< "dutyType:" << d->getDutyType() << " "
		//	<< "acDutyCode:" << "" << " "
		//	<< "isSplit:" << 0 << " "
		//	<< "isSplitDay:" << 0 << " "
		//	<< "splitStation:" << 0 << " "
		//	<< "splitPos:" << 0 << " "
		//	<< "actFDP:" << 0 << " "
		//	<< "actDP:" << 0 << " "
		//	<< "actBLK:" << 0 << " " << endl;
		//cout	<< "actRst:" << d->getActualRest() << " "
		//	<< "dutyFDP:" << joinIntList(d->getDutyFDP(), ":") << " "
		//	<< "dutyDP:" << joinIntList(d->getDutyDP(), ":") << " "
		//	<< "dutyBLK:" << joinIntList(d->getDutyBLK(), ":") << " "
		//	//<< "dutyBLKhistory:" << joinIntList(d->getdutyblk, ":") << " "
		//	<< "crewDutyDayCount:" << d->getCrewDutyDay() << " "
		//	//<< "blkHourDhd:" << d->getblock
		//	<< "blkHourDom:" << d->getDutyBlkTimeInHourDom() << " "
		//	<< "blkHourInt:" << d->getDutyBlkTimeInHourInt() << " "
		//	//<< "blkHourDomHistory:" << d->getblock
		//	//<< "_blockTimeInHourIntHistory"
		//	<< "dutyStartDay:" << d->getDutyStartDay() << " "
		//	<< "flyHours:" << d->getFlyHours() << " "
		//	<< "flyHourHistory:" << d->getFlyHoursHistory() << " "
		//	<< "flyHourCoverage:" << d->getFlyHoursCoverage() << " "
		//	<< "complement:" << joinMapToStr(d->getComplementMap()) << " "
		//	<< "sameAircraftBouns:" << d->getSameAircraftBonus() << " "
		//	<< "isPureExpatAllow:" << d->getIsPureExpatAllow() << " "
		//	<< "isExpatMust:" << d->getIsExpatMust() << " "
		//	<< "isICAO:" << d->getIsICAO() << " "
		//	<< "isSpecialArp:" << d->getIsSpecialAirport() << " "
		//	<< "isBlkOverNormal:" << d->getIsBlkOverNormal() << " "
		//	<< "pairingNum:" << (d->getPairingId() == 0 ? "" : d->getPairingNum()) << " "
		//	<< "numLandings:" << d->getNumLandings() << " "
		//	<< "numFlySegs:" << d->getNumFlySegs() << " "
		//	<< "numNonFlySegs:" << d->getNumNonFlySegs() << " "
		//	<< "numAcChanges:" << d->getNumAircraftChanges() << " "
		//	<< "numDhds:" << d->getNumDhds() << " "
		//	<< "numFerry:" << d->getNumFerry() << " "
		//	<< "numLongTransit:" << d->getNumLongTransit() << " "
		//	<< "dutyComplemnt:" << joinMapToStr(d->getDutyComplements()) << " "
		//	<< "compositionId:" << d->getCompositionId() << " "
		//	//fatigue
		//	<< "acChangePoint:" << d->getAirportChangePoints() << " "
		//	<< "totalLandingPoint:" << d->getTotalLandingPoints() << " "
		//	<< "totalDifficultAirportPoint:" << d->getDifficultAirportPoints() << " "
		//	<< "blkPoint:" << d->getBlkPoints() << " "
		//	<< "turnTimePoint:" << d->getTightTurnTimePoints() << " "
		//	<< "earlyDepPoint:" << d->getEarlyDepPoints() << " "
		//	<< "lateArvPoint:" << d->getLateArrPoints() << " "
		//	<< "dutyBlkPoint:" << d->getDutyBlkPoints() << " "
		//	<< "dutyFdpPoint:" << d->getDutyFdpPoints() << " "
		//	<< "totalFatiguePoint:" << d->getTotalFatiguePoints() << " "
		//	<< "region:" << d->getRegion() << " "
		//	<< "brief:" << d->getMinBrief() << " "
		//	<< "debrief:" << d->getMinDebrief() << " "
		//	<< "pickup:" << d->getMinPickup() << " "
		//	<< "dropoff:" << d->getMinDropoff() << " "
		//	<< "creditHour:" << d->getCreditHours() << " "
		//	//<< "creditHourHistory:" << d->gethi
		//	<< "level:" << d->getDutyLevel() << " "
		//	<< "segCoverValue:" << d->getSegCoverValue() << " "
		//	<< "pairingId:" << d->getPairingId() << " "
		//	<< "dutyId:" << d->getDutyId() << " "
		//	<< "dutySeq:" << d->getDutySeq() << " "
		//	<< "checkin:" << 0 << " "
		//	<< "checkout:" << 0 << " "
		//	<< "isElimeted:" << d->getIsElimited() << " "
		//	<< "isDummyBus:" << d->getIsDummyBusFerry() << " "
		//	<< "isCountForCoverage:" << d->getIsCountForCoverage() << " "
		//	<< "isInternational:" << d->getIsInternational() << " "
		//	<< "layoverHotel:" << d->getLayoverHotel()
		//	<< "numLayoverNits:" << d->getNumLayoverNights() << " "
		//	<< "minRestAfterDuty:" << d->getMinRestAfterDuty() << " "
		//	<< "dpBlkRatio:" << d->getDpBlkRatio() << " "
		//	<< "attr:" << "" << " "
		//	<< "depSecsFromDayBegin:" << d->getDepSecondsFromDayBegin() << " "
		//	<< "numTimeRepeat:" << d->getNumTimesRepeated() << " "
		//	<< "isMarkForNumTimeRepeat:" << d->getIsMarkedForNumTimesRepeated() << " "
		//	<< "basesIncluded:" << joinStrList(d->getBasesIncluded(), "|") << " "
		//	<< "specialAirport:" << joinMapToStr(d->getSpecialAirportAttributeMap()) << " "
		//	<< endl;

		f << "Duty    "
			<< d->getId() << " "
			<< "type:" << d->getType() << "(" << d->getTypeStr() << ") "
			<< "dom:" << d->getDomIntType() << " "
			<< "depTm:" << utcToUtcString(d->getDepTime()) << " "
			<< "arvTm:" << utcToUtcString(d->getArrTime()) << " "
			<< "utc:[" << utcToUtcString(d->getUtcStartTime()) << ", " << utcToUtcString(d->getUtcEndTime()) << "] "
			<< "loc:[" << utcToUtcString(d->getStartTime()) << ", " << utcToUtcString(d->getEndTime()) << "] "
			<< d->getDepStation() << "->" << d->getArrStation() << " "
			<< "minRstInPg:" << 0 << " "// d->getMinRestWithinPg() << " "
			<< "minRstAfterPg:" << 0 << " " //  d->getMinRestAfterPg() << " "
			<< "maxRstInPg:" << 0 << " "
			<< "maxRstAfterPg:" << 0 << " "
			<< "fleet:" << d->getFltCD() << " "
			<< "dayInt:" << d->getDayInt() << " "
			<< "dutyType:" << d->getDutyType() << " "
			<< "acDutyCode:" << "" << " "
			<< "isSplit:" << 0 << " "
			<< "isSplitDay:" << 0 << " "
			<< "splitStation:" << 0 << " "
			<< "splitPos:" << 0 << " "
			<< "actFDP:" << 0 << " "
			<< "actDP:" << 0 << " "
			<< "actBLK:" << 0 << " "
			<< "actRst:" << actualRest << " "
			//<< "dutyBLKhistory:" << joinIntList(d->getdutyblk, ":") << " "
			<< "crewDutyDayCount:" << d->getCrewDutyDay() << " "
			//<< "blkHourDhd:" << d->getblock
			<< "blkHourDom:" << d->getDutyBlkTimeInHourDom() << " "
			<< "blkHourInt:" << d->getDutyBlkTimeInHourInt() << " "
			//<< "blkHourDomHistory:" << d->getblock
			//<< "_blockTimeInHourIntHistory"
			<< "dutyStartDay:" << d->getDutyStartDay() << " "
			<< "flyHours:" << d->getFlyHours() << " "
			<< "flyHourHistory:" << d->getFlyHoursHistory() << " "
			<< "flyHourCoverage:" << d->getFlyHoursCoverage() << " "
			<< "complement:" << joinMapToStr(d->getComplementMap()) << " "
			<< "sameAircraftBouns:" << d->getSameAircraftBonus() << " "
			<< "isPureExpatAllow:" << d->getIsPureExpatAllow() << " "
			<< "isExpatMust:" << d->getIsExpatMust() << " "
			<< "isICAO:" << d->getIsICAO() << " "
			<< "isSpecialArp:" << d->getIsSpecialAirport() << " "
			<< "isBlkOverNormal:" << d->getIsBlkOverNormal() << " "
			<< "pairingNum:" << (d->getPairingId() == 0 ? "" : d->getPairingNum()) << " "
			<< "numLandings:" << d->getNumLandings() << " "
			<< "numFlySegs:" << d->getNumFlySegs() << " "
			<< "numNonFlySegs:" << d->getNumNonFlySegs() << " "
			<< "numAcChanges:" << d->getNumAircraftChanges() << " "
			<< "numDhds:" << d->getNumDhds() << " "
			<< "numFerry:" << d->getNumFerry() << " "
			<< "numLongTransit:" << d->getNumLongTransit() << " "
			<< "dutyComplemnt:" << joinMapToStr(d->getComplementMap()) << " "
			<< "compositionId:" << d->getCompositionId() << " "
			//fatigue
			<< "acChangePoint:" << d->getAirportChangePoints() << " "
			<< "totalLandingPoint:" << d->getTotalLandingPoints() << " "
			<< "totalDifficultAirportPoint:" << d->getDifficultAirportPoints() << " "
			<< "blkPoint:" << d->getBlkPoints() << " "
			<< "turnTimePoint:" << d->getTightTurnTimePoints() << " "
			<< "earlyDepPoint:" << d->getEarlyDepPoints() << " "
			<< "lateArvPoint:" << d->getLateArrPoints() << " "
			<< "dutyBlkPoint:" << d->getDutyBlkPoints() << " "
			<< "dutyFdpPoint:" << d->getDutyFdpPoints() << " "
			<< "totalFatiguePoint:" << d->getTotalFatiguePoints() << " "
			<< "region:" << d->getRegion() << " "
			<< "brief:" << d->getMinBrief() << " "
			<< "debrief:" << d->getMinDebrief() << " "
			<< "pickup:" << d->getMinPickup() << " "
			<< "dropoff:" << d->getMinDropoff() << " "
			<< "creditHour:" << (d->getCreditInSec() / 3600.0) << " "
			//<< "creditHourHistory:" << d->gethi
			<< "level:" << d->getDutyLevel() << " "
			<< "segCoverValue:" << d->getSegCoverValue() << " "
			<< "pairingId:" << d->getPairingId() << " "
			<< "dutyId:" << d->getDutyId() << " "
			<< "dutySeq:" << d->getDutySeq() << " "
			<< "checkin:" << 0 << " "
			<< "checkout:" << 0 << " "
			<< "isElimeted:" << d->getIsElimited() << " "
			<< "isDummyBus:" << d->getIsDummyBusFerry() << " "
			<< "isCountForCoverage:" << d->getIsCountForCoverage() << " "
			<< "isInternational:" << d->getIsInternational() << " "
			<< "layoverHotel:" << d->getLayoverHotel()
			<< "minRestAfterDuty:" << d->getMinRestAfterDuty() << " "
			<< "dpBlkRatio:" << d->getDpBlkRatio() << " "
			<< "attr:" << "" << " "
			<< "depSecsFromDayBegin:" << d->getDepSecondsFromDayBegin() << " "
			<< "numTimeRepeat:" << d->getNumTimesRepeated() << " "
			<< "isMarkForNumTimeRepeat:" << d->getIsMarkedForNumTimesRepeated() << " "
			<< "basesIncluded:" << joinStrList(d->getBasesIncluded(), "|") << " "
			//<< "specialAirport:" << joinMapToStr(d->getSpecialAirportAttributeMap()) << " "
			<< endl;
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
		//	printSegment(d->getSegment(j), f);
		}
	}
	f.close();
	cout << "<< test_file_duty()" << endl;
}

void complementToStr(const map<string, int> &complement, char * strbuf, int bufsize) {
	int len = 0;
	if (!complement.empty()) {
		map<string, int>::const_iterator i;
		for (i = complement.begin(); i != complement.end(); i++) {
			len += _snprintf(strbuf + len, bufsize - len, "%s:%d ", i->first.c_str(), i->second);
		}
	}
}

void printSegment(Segment * p, ofstream& f) {
	char strBuf[100] = { 0 };
	char endBuf[100] = { 0 };
	char strUtc[40] = { 0 };
	char endUtc[40] = { 0 };
	char * isOperating = "N";
	char * isICAO = "";
	char * isExpat = "";

	if (p->getIsOperating()) {
		isOperating = "Y";
	}

	utcToUtcStr(p->getStartTimeLocSch(), strBuf, sizeof(strBuf));
	utcToUtcStr(p->getEndTimeLocSch(), endBuf, sizeof(endBuf));
	utcToUtcStr(p->getStartTimeUtcSch(), strUtc, sizeof(strUtc));
	utcToUtcStr(p->getEndTimeUtcSch(), endUtc, sizeof(endUtc));

	// const char* 不能直接赋值到char* 2022/7/22 haoli.
	string str = p->getICAO() ? "Y" : "N";
	isICAO = (char*)str.c_str();
	if (p->getIsExpatMust())
		isExpat = "ExpatMust";
	else if (p->getIsExpatAllow())
		isExpat = "ExpatAllow";

	string attribtes = joinStrList(p->getAttributes(), "|"); //20180423 ain, mantis#3171, attribute按竖线分割
	f
		<< " segment "
		<< " id:" << p->getId()
		<< " flt_id:" << p->getDBId()
		<< " fleet:" << p->getFleetCD()
		<< " fltNum:" << p->getFlightNumber()
		<< "  assign:" << p->getAssignment()
		<< " isOperating:" << isOperating
		<< " " << p->getDepStation() << "->" << p->getArrStation()
		<< " utc:" << strUtc << " - " << endUtc
		<< " loc:" << strBuf << endBuf
		<< " ICAO:" << isICAO
		<< " _attr:" << attribtes
		<< " _depMinuteFromDayBegin:" << p->getDepMinutesFromDayBegin()
		<< " blk:" << p->getBlkTime()
		<< " his:" << p->getBlkMinHistory()
		<< " infoStr:" << p->getSegmentInfoStr()
		<< " PureDt:" << p->getPureDate()
		<< " _sofl_seq_nr1:" << p->getSegNumber()
		<< " _dom_int_type:" << p->getDomIntType()
		<< " _sch_id:" << ""
		<< " _nextLegNo:" << p->getNextLegNo()
		<< " _rel_arc_dy:" << p->getRelArcDy()
		<< " _date:" << p->getDate()
		<< " depMinute:" << p->getDepMinutesFromDayBegin()
		<< " arvMinute:" << p->getArrMinutesFromDayBegin()
		<< " dayInt:" << p->getDayInt()
		<< " compId:" << p->getCompositionId()
		<< " hierarchy:" << p->getCompositionHierarchy()
		<< " _turnTime:" << p->getTurnTime()
		<< " _tail:" << ""
		<< " _isMustStartDuty:" << (p->getIsMustStartDuty() ? "Y" : "N")
		<< " _isMustEndDuty:" << (p->getIsMustEndDuty() ? "Y" : "N")
		<< " _isStratigicLeg:" << (p->getIsStratigicLeg() ? "Y" : "N")
		<< " _isVIPLeg:" << (p->getIsVIPLeg() ? "Y" : "N")
		<< " _isOperating:" << (p->getIsOperating() ? "Y" : "N")
		<< " _isDeadhead:" << (p->getIsDeadhead() ? "Y" : "N")
		<< " _isCountForCoverage:" << (p->getIsCountForCoverage() ? "Y" : "N")
		<< " _isCovered:" << (p->getIsCovered() ? "Y" : "N")
		<< " _tailNum:" << p->getTailNum()
		<< " _pairingNum:" << p->getPairingNum()
		<< " _crewLinkNum:" << p->getCrewLinkNum()
		<< " _isDhdPicked:" << (p->getIsDhdPicked() ? "Y" : "N")
		<< " _numInDuty:" << p->getNumInDuty()
		<< " _isDummyBusFerry:" << (p->getIsDummyBusFerry() ? "Y" : "N")
		<< " _isFixLinkSeg:" << (p->getIsFixLinkSeg() ? "Y" : "N")
		<< " _isBonusForCoverage:" << (p->getIsBonusForCoverage() ? "Y" : "N")
		<< " _repeatCount:" << p->getRepeatCount()
		<< " _coverageIndex:" << p->getCoverageIndex()
		<< " _specialAirportAttributes:" << joinStrList(p->getIsSpecialAirportAttributes())
		<< " _expatAllow:" << (p->getIsExpatAllow() ? "Y" : "N")
		<< " _expatMust:" << (p->getIsExpatMust() ? "Y" : "N")
		<< " _specialAirport:" << (p->getIsSpecialAirport() ? "Y" : "N")
		<< " _isBusFerry:" << (p->getIsBusFerry() ? "Y" : "N")
		<< " _isTrainFerry:" << (p->getIsTrainFerry() ? "Y" : "N")
		<< " _is1A:" << (p->getIs1A() ? "Y" : "N")
		<< " _is1B:" << (p->getIs1B() ? "Y" : "N")
		<< " _is2A:" << (p->getIs2A() ? "Y" : "N")
		<< " _is2B:" << (p->getIs2B() ? "Y" : "N")
		<< "\n";
}
void printfSegment(Segment * p, FILE * fp) {
	char strBuf[100] = { 0 };
	char endBuf[100] = { 0 };
	char strUtc[40] = { 0 };
	char endUtc[40] = { 0 };
	char * isOperating = "N";
	char * isICAO = "";
	char * isExpat = "";

	if (p->getIsOperating()) {
		isOperating = "Y";
	}

	utcToUtcStr(p->getStartTimeLocSch(), strBuf, sizeof(strBuf));
	utcToUtcStr(p->getEndTimeLocSch(), endBuf, sizeof(endBuf));
	utcToUtcStr(p->getStartTimeUtcSch(), strUtc, sizeof(strUtc));
	utcToUtcStr(p->getEndTimeUtcSch(), endUtc, sizeof(endUtc));

	// const char* 不能直接赋值到char* 2022/7/22 haoli.
	string str = p->getICAO() ? "Y" :"N";
	isICAO = (char*)str.c_str();
	if (p->getIsExpatMust())
		isExpat = "ExpatMust";
	else if (p->getIsExpatAllow())
		isExpat = "ExpatAllow";

	string attribtes = joinStrList(p->getAttributes(), "|"); //20180423 ain, mantis#3171, attribute按竖线分割

	fprintf(fp, "               segment:  flt_id: %lld  fleet:%s  fltNum:%s  assign:%s isOperating: %s  %s->%s   utc: %s - %s  loc: %s - %s  ICAO:%s  _attr:%s  _depMinuteFromDayBegin:%d  blk:%d his:%d",
		p->getDBId(), p->getFleetCD().c_str(), p->getSoflNum().c_str(), p->getAssignment().c_str(), isOperating, p->getDepStation().c_str(), p->getArrStation().c_str(), strUtc, endUtc, strBuf, endBuf, isICAO,
		attribtes.c_str(), p->getDepMinutesFromDayBegin(), p->getBlkSeconds(), p->getBlkMinHistory());
	fprintf(fp, " infoStr:%s", p->getSegmentInfoStr().c_str());
	fprintf(fp, " PureDt:%s", p->getPureDate().c_str());
	fprintf(fp, " _sofl_seq_nr1:%s", p->getSegNumber().c_str());
	fprintf(fp, " _dom_int_type:%s", p->getDomIntType().c_str());
	fprintf(fp, " _sch_id:%s", "");
	fprintf(fp, " _nextLegNo:%s", p->getNextLegNo().c_str());
	fprintf(fp, " _rel_arc_dy:%d", p->getRelArcDy());
	fprintf(fp, " _date:%s", p->getDate().c_str());
	fprintf(fp, " depMinute:%d", p->getDepMinutesFromDayBegin());
	fprintf(fp, " arvMinute:%d", p->getArrMinutesFromDayBegin());
	fprintf(fp, " dayInt:%d", p->getDayInt());
	//fprintf(fp, " compId:%d", p->getCompositionId());
	fprintf(fp, " hierarchy:%d", p->getCompositionHierarchy());
	fprintf(fp, " _turnTime:%d", p->getTurnTime());
	fprintf(fp, " _tail:%s", "");
	fprintf(fp, " _isMustStartDuty:%s", p->getIsMustStartDuty() ? "Y" : "N");
	fprintf(fp, " _isMustEndDuty:%s", p->getIsMustEndDuty() ? "Y" : "N");
	fprintf(fp, " _isStratigicLeg:%s", p->getIsStratigicLeg() ? "Y" : "N");
	fprintf(fp, " _isVIPLeg:%s", p->getIsVIPLeg() ? "Y" : "N");
	fprintf(fp, " _isOperating:%s", p->getIsOperating() ? "Y" : "N");
	fprintf(fp, " _isDeadhead:%s", p->getIsDeadhead() ? "Y" : "N");
	fprintf(fp, " _isCountForCoverage:%s", p->getIsCountForCoverage() ? "Y" : "N");
	fprintf(fp, " _isCovered:%s", p->getIsCovered() ? "Y" : "N");
	fprintf(fp, " _tailNum:%s", p->getTailNum().c_str());
	fprintf(fp, " _pairingNum:%s", p->getPairingNum().c_str());
	fprintf(fp, " _crewLinkNum:%s", p->getCrewLinkNum().c_str());
	fprintf(fp, " _isDhdPicked:%s", p->getIsDhdPicked() ? "Y" : "N");
	fprintf(fp, " _numInDuty:%d", p->getNumInDuty());
	fprintf(fp, " _isDummyBusFerry:%s", p->getIsDummyBusFerry() ? "Y" : "N");
	fprintf(fp, " _isFixLinkSeg:%s", p->getIsFixLinkSeg() ? "Y" : "N");
	fprintf(fp, " _isBonusForCoverage:%s", p->getIsBonusForCoverage() ? "Y" : "N");
	fprintf(fp, " _repeatCount:%d", p->getRepeatCount());
	fprintf(fp, " _coverageIndex:%d", p->getCoverageIndex());
	fprintf(fp, " _specialAirportAttributes:%s", joinStrList(p->getIsSpecialAirportAttributes()).c_str());
	fprintf(fp, " _expatAllow:%s", p->getIsExpatAllow() ? "Y" : "N");
	fprintf(fp, " _expatMust:%s", p->getIsExpatMust() ? "Y" : "N");
	fprintf(fp, " _specialAirport:%s", p->getIsSpecialAirport() ? "Y" : "N");
	fprintf(fp, " _isBusFerry:%s", p->getIsBusFerry() ? "Y" : "N");
	fprintf(fp, " _isTrainFerry:%s", p->getIsTrainFerry() ? "Y" : "N");
	fprintf(fp, " _is1A:%s", p->getIs1A() ? "Y" : "N");
	fprintf(fp, " _is1B:%s", p->getIs1B() ? "Y" : "N");
	fprintf(fp, " _is2A:%s", p->getIs2A() ? "Y" : "N");
	fprintf(fp, " _is2B:%s", p->getIs2B() ? "Y" : "N");
	fprintf(fp, "\n");

	char segPlanCompStr[200] = { 0 };
	const map<string, int> &segPlanComp = p->getPlanComposition();//seg plan composition
	complementToStr(segPlanComp, segPlanCompStr, sizeof(segPlanCompStr));
	//fprintf(fp, "                   plan:%s\n", segPlanCompStr);

	char segOpenCompStr[200] = { 0 };
	const map<string, int> &openComp = p->getOpenComposition();//seg open composition
	complementToStr(openComp, segOpenCompStr, sizeof(segOpenCompStr));
	//fprintf(fp, "                   open:%s\n", segOpenCompStr);

	char segFillCompStr[200] = { 0 };
	const map<string, int> &fillComp = p->getFillComposition();//seg fill composition
	complementToStr(fillComp, segFillCompStr, sizeof(segFillCompStr));
	//fprintf(fp, "                   fill-composition:%s\n", segFillCompStr);
}

void test_file_flight(vector<Segment> &list, char * filepath){
	vector<Segment*> ptrList;
	for (Segment &s : list) {
		ptrList.push_back(&s);
	}
	//按 fltNum -> startTm排序
	std::stable_sort(ptrList.begin(), ptrList.end(),
		[](Segment * a, Segment * b) -> bool
	{
		int fltNumRet = a->getFlightNumber().compare(b->getFlightNumber());
		if (fltNumRet < 0)
			return true;
		else if (fltNumRet > 0)
			return false;
		else {
			long long delta = a->getStartTime() - b->getStartTime();
			return (delta < 0) ? true : false;
		}
	});

	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < ptrList.size(); i++) {
		Segment * p = ptrList[i];
		printfSegment(p, fp);
	}
	fclose(fp);
}
void test_file_flight(vector<shared_ptr<Segment>> &list, char * filepath){
	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		shared_ptr<Segment> p = list[i];
		printfSegment(p.get(), fp);
	}
	fclose(fp);
}
void test_file_flight(vector<Segment*> &list, char * filepath){

	vector<Segment*> ptrList;
	for (Segment *s : list) {
		ptrList.push_back(s);
	}

	std::stable_sort(ptrList.begin(), ptrList.end(),
		[](Segment * a, Segment * b) -> bool
	{
		return a->getDBId() < b->getDBId();
	});
	//按 fltNum -> startTm排序
	//std::sort(ptrList.begin(), ptrList.end(),
	//	[](Segment * a, Segment * b) -> bool
	//{
	//	int fltNumRet = a->getFlightNumber().compare(b->getFlightNumber());
	//	if (fltNumRet < 0)
	//		return true;
	//	else if (fltNumRet > 0)
	//		return false;
	//	else {
	//		long long delta = a->getStartTime() - b->getStartTime();
	//		return (delta < 0) ? true : false;
	//	}
	//});

	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < ptrList.size(); i++) {
		Segment * p = ptrList[i];
		printfSegment(p, fp);
	}
	fclose(fp);
}
void test_file_segment(Segment* segList, int segCount, char * filepath){
	char strBuf[100] = { 0 };
	char endBuf[100] = { 0 };
	FILE * fp = fopen(filepath, "w");
	for (int i = 0; i < segCount; i++) {
		Segment * p = &segList[i];
		printfSegment(p, fp);
	}
	fclose(fp);
}

void printf_single_crew(FILE * fp, CREW* crew) {
	int rosterCount = 0;
	int pairingCount = 0;
	char effBuf[100] = { 0 };
	char expBuf[100] = { 0 };
	char birthdayBuf[100] = { 0 };
	string dbg = "";
	try {
		timeTmToStr(&crew->birthdayTm, birthdayBuf, sizeof(birthdayBuf));
		birthdayBuf[10] = 0;

		dbg = "crewInfo";
		fprintf(fp, "crew: %s %s %s %s \n", crew->idCrew.c_str(), crew->firstName.c_str(), crew->lastName.c_str(), birthdayBuf);

		fprintf(fp, "crew_base_timezone_index: ");
		for (auto& it : crew->crewBaseTimezoneOffsetIndex->getIndex()) {
			fprintf(fp, " %s=%d, ", utcToUtcString(it.first).c_str(), it.second);
		}
		fprintf(fp, "\n");

		dbg = "base";
		if (!crew->baseList.empty()) {
			fprintf(fp, "      base: ");
			vector<SharedPtr<CREW_BASE>> & baseList = crew->baseList;
			std::stable_sort(baseList.begin(), baseList.end(), [](const SharedPtr<CREW_BASE>& a, const SharedPtr<CREW_BASE>& b) { return a->effUtc < b->effUtc; });
			for (std::size_t j = 0; j < baseList.size(); j++) {
				fprintf(fp, "%s(%s~%s),", baseList[j]->base.c_str(), utcToUtcString(baseList[j]->effUtc).c_str(), utcToUtcString(baseList[j]->expUtc).c_str());
			}
			fprintf(fp, "\n");
		}
		dbg = "fleet";
		if (!crew->fleetList.empty()) {
			fprintf(fp, "      fleet:");
			vector<SharedPtr<CREW_FLEET>> & fleetList = crew->fleetList;
			std::stable_sort(fleetList.begin(), fleetList.end(), [](const SharedPtr<CREW_FLEET>& a, const SharedPtr<CREW_FLEET>& b) { return a->effUtc < b->effUtc; });
			for (std::size_t j = 0; j < fleetList.size(); j++) {
				fprintf(fp, "%s(%s~%s),", fleetList[j]->fleet.c_str(), utcToUtcString(fleetList[j]->effUtc).c_str(), utcToUtcString(fleetList[j]->expUtc).c_str());
			}
			fprintf(fp, "\n");
		}
		dbg = "rank";
		if (!crew->rankList.empty()) {
			fprintf(fp, "      rank: ");
			vector<SharedPtr<CREW_RANK>> & rankList = crew->rankList;
			std::stable_sort(rankList.begin(), rankList.end(), [](const SharedPtr<CREW_RANK>& a, const SharedPtr<CREW_RANK>& b) { return a->effUtc < b->effUtc; });
			for (std::size_t j = 0; j < rankList.size(); j++) {
				memset(effBuf, 0, sizeof(effBuf)); memset(expBuf, 0, sizeof(expBuf));
				utcToUtcStr(rankList[j]->effUtc, effBuf, sizeof(effBuf));
				utcToUtcStr(rankList[j]->expUtc, expBuf, sizeof(expBuf));
				fprintf(fp, "%s/expDays=%d (%s~%s),", rankList[j]->rank.c_str(), rankList[j]->preCumulatedExpDays, effBuf, expBuf);
			}
			fprintf(fp, "\n");
		}
		dbg = "qual";
		if (!crew->qualificationList.empty()) {
			fprintf(fp, "      qualification: ");
			vector<SharedPtr<CREW_QUALIFICATION>> & qualList = crew->qualificationList;
			std::stable_sort(qualList.begin(), qualList.end(), [](const SharedPtr<CREW_QUALIFICATION>& a, const SharedPtr<CREW_QUALIFICATION>& b) { return a->issuedUtc < b->issuedUtc; });
			for (std::size_t j = 0; j < qualList.size(); j++) {
				memset(effBuf, 0, sizeof(effBuf)); memset(expBuf, 0, sizeof(expBuf));
				utcToUtcStr(qualList[j]->issuedUtc, effBuf, sizeof(effBuf));
				utcToUtcStr(qualList[j]->expiryUtc, expBuf, sizeof(expBuf));
				fprintf(fp, "%s (%s~%s),", qualList[j]->qual.c_str(), effBuf, expBuf);
			}
			fprintf(fp, "\n");
		}
		dbg = "pref";
		if (!crew->preferenceList.empty()) {
			fprintf(fp, "      preference: ");
			vector<SharedPtr<CREW_PREFERENCE>> & prefList = crew->preferenceList;
			std::stable_sort(prefList.begin(), prefList.end(), [](const SharedPtr<CREW_PREFERENCE>& a, const SharedPtr<CREW_PREFERENCE>& b) { return a->strDtloc < b->strDtloc; });
			for (std::size_t j = 0; j < prefList.size(); j++) {
				memset(effBuf, 0, sizeof(effBuf)); memset(expBuf, 0, sizeof(expBuf));
				utcToUtcStr(prefList[j]->strDtloc, effBuf, sizeof(effBuf));
				utcToUtcStr(prefList[j]->endDtLoc, expBuf, sizeof(expBuf));
				fprintf(fp, "%s(%s~%s)(related=%s),", prefList[j]->pref.c_str(), effBuf, expBuf, joinStrList(prefList[j]->relatedCrewIds).c_str());
			}
			fprintf(fp, "\n");
		}
		dbg = "status";
		if (!crew->statusList.empty()) {
			fprintf(fp, "      status   : ");
			vector<SharedPtr<CREW_STATUS>> & statusList = crew->statusList;
			std::stable_sort(statusList.begin(), statusList.end(), [](const SharedPtr<CREW_STATUS>& a, const SharedPtr<CREW_STATUS>& b) { return a->effDt < b->effDt; });
			for (std::size_t j = 0; j < statusList.size(); j++) {
				memset(effBuf, 0, sizeof(effBuf)); memset(expBuf, 0, sizeof(expBuf));
				utcToUtcStr(statusList[j]->effDt, effBuf, sizeof(effBuf));
				utcToUtcStr(statusList[j]->expdt, expBuf, sizeof(expBuf));
				fprintf(fp, "%s (%s~%s),", statusList[j]->status.c_str(), effBuf, (statusList[j]->expdt == -1 ? "" : expBuf));
			}
			fprintf(fp, "\n");
		}
		dbg = "team";
		if (!crew->teamList.empty()) {
			fprintf(fp, "      team   : ");
			for (std::size_t j = 0; j < crew->teamList.size(); j++) {
				memset(effBuf, 0, sizeof(effBuf)); memset(expBuf, 0, sizeof(expBuf));
				utcToUtcStr(crew->teamList[j]->effDt, effBuf, sizeof(effBuf));
				utcToUtcStr(crew->teamList[j]->expDt, expBuf, sizeof(expBuf));
				fprintf(fp, "%lld.%s (%s~%s),", crew->teamList[j]->team_id, crew->teamList[j]->teamName.c_str(), effBuf, (crew->teamList[j]->expDt == -1 ? "" : expBuf));
			}
			fprintf(fp, "\n");
		}
		dbg = "entitlement";
		if (!crew->entitlements.empty()) {
			fprintf(fp, "      entitlement: ");
			for (std::size_t j = 0; j < crew->entitlements.size(); j++) {
				auto& item = crew->entitlements[j];
				fprintf(fp, "%d/%s/%f/%f", item->year, item->type.c_str(), item->entitlement, item->used);
			}
			fprintf(fp, "\n");
		}

		dbg = "roster";
		//只显示有roster记录的crew
		if (crew->rosterList.size() > 0) {

			//遍历crew下roster
			vector<SharedPtr<ROSTER>> rosterList = crew->rosterList;
			for (std::size_t j = 0; j < rosterList.size(); j++) {
				SharedPtr<ROSTER> roster = rosterList[j];

				// const char* 不能直接赋值到char*  2022/7/22  haoli.
				string str = (roster->sourceType == ROSTER_SOURCE_PRE_ASSIGN ? "pre-assign" : "or-result");
				char * sourceType = (char *)str.c_str();
				char   utcStr[100] = { 0 };
				utcToUtcStr(roster->strUtc, utcStr, sizeof(utcStr));
				fprintf(fp, "      roster[index:%d] id:%lld, dutyType:%s startDt:%s source:%s pair_id:%lld loc:%s/%s/%s\n",
					roster->indexInRosterListOfCrew, roster->rosterId, roster->duty.c_str(), utcStr, sourceType, roster->pairId,
					utcToUtcString(roster->strLoc).c_str(), utcToUtcString(roster->restStrLoc).c_str(), utcToUtcString(roster->endLoc).c_str());
				if (!roster->pairing) {
					fprintf(fp, "          pairing: empty\n");
				}
				else {
					fprintf(fp, "          pairing: %lld\n", roster->pairing->getDbId());
					vector<Duty*> dutyList = roster->pairing->getDutyVec();
					for (std::size_t k = 0; k < dutyList.size(); k++) {
						fprintf(fp, "              duty: type:%s from:[%s] to:[%s]\n", dutyList[k]->getTypeStr(), dutyList[k]->getDepStation().c_str(), dutyList[k]->getArrStation().c_str());
						vector<Segment*> segList = dutyList[k]->getSegments();
						for (std::size_t m = 0; m < segList.size(); m++) {
							fprintf(fp, "                  seg: %lld %s - %s  isOpera:%s \n", segList[m]->getDBId(), segList[m]->getDepStation().c_str(), segList[m]->getArrStation().c_str(), segList[m]->getIsOperating() ? "Y" : "N");
						}
					}
				}
				rosterCount++;
			}
		}
	}
	catch (char* e) {
		Logger::getRuleLogger()->error("exception: printf_single_crew crew={}, ex={} dbg={}", crew->idCrew, e, dbg);
	}
	catch (exception& e) {
		Logger::getRuleLogger()->error("exception: printf_single_crew crew={}, ex={} dbg={}", crew->idCrew, e.what(), dbg);
	}
	catch (...) {
		Logger::getRuleLogger()->error("exception: printf_single_crew fail crew={}, ex=unknown, dbg = {}", crew->idCrew, dbg);
	}
}


void test_file_crew(vector<SharedPtr<CREW>> &crewList, char * filepath) {
	//printf("test_file_crew start\n");
	FILE * fp = fopen(filepath, "w");
	test_print_crew(crewList, fp);
	fclose(fp);
	//printf("test_file_crew end\n");
}
void test_print_crew(vector<SharedPtr<CREW>> &list, FILE * fp) {
	int rosterCount = 0;
	int pairingCount = 0;
	char effBuf[100] = { 0 };
	char expBuf[100] = { 0 };
	map<string, CREW*> crewIdMap;

	vector<SharedPtr<CREW>> sortedList;

	if (!fp) {
		return;
	}

	//20180312 ain, ro_input_crew.txt增加 crewId整体排序
	for (auto& item : list) {
		sortedList.push_back(item);
	}
	std::sort(sortedList.begin(), sortedList.end(), [](SharedPtr<CREW>& a, SharedPtr<CREW>& b){ return a->idCrew.compare(b->idCrew) < 0; });

	for (vector<SharedPtr<CREW>>::iterator it = sortedList.begin(); it != sortedList.end(); it++) {
		string crewId = it->get()->idCrew;
		if (crewIdMap.find(crewId) != crewIdMap.end()) {
			fprintf(fp, "Duplicate crew : %s\n", crewId.c_str());
		}
		else {
			crewIdMap[crewId] = it->get();
		}
	}

	//遍历打印crew
	vector<SharedPtr<CREW>>::iterator crewIndex;
	for (crewIndex = sortedList.begin(); crewIndex != sortedList.end(); crewIndex++) {
		CREW * crew = crewIndex->get();
		printf_single_crew(fp, crew);
	}

}

void test_file_airport_timezone(unordered_map<string, int> &map) {
	unordered_map<string, int>::iterator it = map.begin();

	FILE * fp = fopen("AirportTimeZone.txt", "w");
	for (it = map.begin(); it != map.end(); it++) {
		fprintf(fp, "%s, %d\n", it->first.c_str(), it->second);
	}
	fclose(fp);
}


void test_file_port_dual_reqmnt(vector<DBPortQualReqmnts> &list) {
	FILE * fp = fopen("port_qual_reqmnt.txt", "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		fprintf(fp, "airline,%s,division,%s,group,%s,fltnum,%s,airport,%s", list[i].airline, list[i].division, list[i].crewGroup, list[i].fltNum, list[i].airport);
	}
	fclose(fp);
}

//--------------------------------------------------------------

void test_get_crew_fleet(PairingDBContext &ctx) {
	//vector<string> fleetList;
	//fleetList.push_back("P77");
	//fleetList.push_back("P78");
	//vector<SharedPtr<CREW_FLEET>> list = getCrewFleet(&ctx, "ZH", fleetList);
	//if (ctx.errorCode != DB_SUCCESS) {
	//	db_err_handler(ctx.errorCodeOCI);
	//	printf("ERROR-MSG: %s\n", ctx.errorMsgBuf);
	//}

	////打印结果
	//printf("\nCREW FLEET:\n");
	//for (std::size_t i = 0; i < list.size(); i++) {
	//	SharedPtr<CREW_FLEET> item = list[i];

	//	char localEffDtStr[20] = "NA";
	//	char localExpDtStr[20] = "NA";

	//	if (item->effUtc != -1)
	//		util_timeT_to_dateStr(item->effUtc, localEffDtStr, sizeof(localEffDtStr));

	//	if (item->expUtc != -1)
	//		util_timeT_to_dateStr(item->expUtc, localExpDtStr, sizeof(localExpDtStr));

	//	printf("%s %s %s - %s\n", item->idCrew.c_str(), item->fleet.c_str(), localEffDtStr, localExpDtStr);
	//}
	//printf("total crew fleet: %d, press enter to continue...\n", list.size());
	//getchar();
}


void test_get_crew_base(PairingDBContext &ctx) {
	//vector<string> baseList;
	//baseList.push_back("PEK");
	//baseList.push_back("CTU");
	//vector<SharedPtr<CREW_BASE>> list = getCrewBase(&ctx, "ZH", baseList);
	//if (ctx.errorCode != DB_SUCCESS) {
	//	db_err_handler(ctx.errorCodeOCI);
	//	printf("ERROR-MSG: %s\n", ctx.errorMsgBuf);
	//}

	////打印结果
	//printf("\nCREW BASE:\n");
	//for (std::size_t i = 0; i < list.size(); i++) {
	//	SharedPtr<CREW_BASE> item = list[i];

	//	char localEffDtStr[20] = "NA";
	//	char localExpDtStr[20] = "NA";
	//	char isPrimeBase[2] = "Y";

	//	if (item->effUtc != -1)
	//		util_timeT_to_dateStr(item->effUtc, localEffDtStr, sizeof(localEffDtStr));

	//	if (item->expUtc != -1)
	//		util_timeT_to_dateStr(item->expUtc, localExpDtStr, sizeof(localExpDtStr));

	//	if (!item->isPrime)
	//		isPrimeBase[0] = 'N';

	//	printf("%s %s %s - %s [%s]\n", item->idCrew.c_str(), item->base.c_str(), localEffDtStr, localExpDtStr, isPrimeBase);
	//}
	//printf("total crew base: %d, press enter to continue...\n", list.size());
	//getchar();
}

//
// getFlightSegments
//
void test_get_flight(PairingDBContext &ctx) {

}

void test_get_rule_cqf(PairingDBContext &ctx, Scenario scenario) {

	//vector<DBPortQualReqmnts> portQualReqmnts = getPortQualReqmnts(&ctx, scenario.airline);
	//if (ctx.errorCode != DB_SUCCESS) {
	//	printf("getPortQualReqmnts failed\n");
	//	db_err_handler(ctx.errorCodeOCI);
	//}
	//map<string, vector<DBPortQualReqmnts>> portQualReqmntsAirportMap = makePortQualReqmntsAirportMap(portQualReqmnts);

	//int ruleCount = 0;
	//FILE * fp1 = fopen("output_rule.txt", "w");
	//int scenarioId = 1743;
	//vector<DBRule> ruleList = getRule(&ctx, scenarioId, portQualReqmnts, RULE_PHASE_PLAN);
	//printf("size of rule list: %d\n", ruleList.size());
	//for (vector<DBRule>::iterator ir = ruleList.begin(); ir != ruleList.end(); ir++) {
	//	fprintf(fp1, "%3d ruleId:%lld\t func:%08d\t phase:%d description:%s talbe%d row%d   \t\tparams: ", ruleCount++, ir->idRule, ir->function, ir->phase, ir->description, ir->tableNum, ir->rowNum);
	//	for (map<string, string>::iterator param = ir->params.begin(); param != ir->params.end(); param++)
	//	{
	//		fprintf(fp1, "%s=%s, ", param->first.c_str(), param->second.c_str());
	//	}
	//	fprintf(fp1, "\n");
	//}
	//fclose(fp1);
	//system("notepad.exe output_rule.txt");

	//vector<DBCqf> cqfList = getCqf(&ctx, scenario.idCQSet);
	//for (std::size_t i = 0; i < cqfList.size(); i++) {
	//	DBCqf item = cqfList[i];
	//	printf("%d %s\n", item.idCqf, item.description);
	//}
}

void test_file_airport(std::vector<DBAirport> &list, char* filename) {
	int ruleCount = 0;
	FILE * fp = fopen(filename, "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		DBAirport &item = list[i];
		fprintf(fp, "airport,%s,city,%s,utcOffset,%d,country,%s,dstGrp,%s\n",
			item.airport, item.city, item.utcOffsetMinutes, item.country, item.dstGrp);
	}
	fclose(fp);
}


void test_file_pairing_duty_seg(Segment * buf, int count, char* filename) {
	int i = 0;
	FILE * fp = fopen(filename, "w");
	for (i = 0; i < count; i++) {
		Segment * it = &buf[i];
		fprintf(fp, "flt_id,%lld,pair_id,%lld,blk_history,%d\n", it->getDBId(), it->getPairingId(), it->getBlkMinHistory());
	}
	fclose(fp);
}


void test_file_port_dual_reqmnt_map(map<string, vector<DBPortQualReqmnts>> &m) {
	FILE * fp = fopen("port_qual_reqmnts_map(airport).txt", "w");
	for (map<string, vector<DBPortQualReqmnts>>::iterator it = m.begin(); it != m.end(); it++) {
		fprintf(fp, "airport %s\n", it->first.c_str());
		for (std::size_t i = 0; i < it->second.size(); i++) {
			DBPortQualReqmnts &item = it->second[i];
			fprintf(fp, "        airline,%s, division,%s fleet,%s, rank,%s, qual,%s\n", item.airline, item.division, item.fleet, item.rank, item.qual);
		}
	}
	fclose(fp);
}

void test_file_cross_rank_rule(vector<SharedPtr<DBRule_CrossRank>> &list, const char * filepath) {
	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		fprintf(fp, "id,%lld, airline,%s, division,%s, group,%s, cof,%d, dep,%s, arv,%s, qual_list,%s\n",
			list[i]->criteria_id, list[i]->airline.c_str(),
			list[i]->division.c_str(),
			list[i]->crew_group.c_str(),
			list[i]->cof,
			list[i]->dep_arp.c_str(),
			list[i]->arv_arp.c_str(),
			list[i]->qual_list.c_str()
		);
	}
	fclose(fp);
}

void test_file_rule_8014(vector<SharedPtr<DBRule_8014>> &list, const char * filepath) {
	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		fprintf(fp, "airline,%s, assignmentGroup,%s, assignemnt,%s, name,%s, roIndicator,%s, \n",
			list[i]->airline.c_str(),
			list[i]->assignmentGroup.c_str(),
			list[i]->assignemnt.c_str(),
			list[i]->name.c_str(),
			list[i]->roIndicator.c_str()
		);
	}
	fclose(fp);
}


void test_utc() {
	char * dt0 = "2015-02-05 00:28:00";
	time_t   t0 = utcStrToUtc(dt0);

	time_t t1 = time(NULL);

	printf("from now                 : %d\n", t1);
	printf("from %s   %d\n", dt0, t0);
	printf("t0 - t1                  : %d\n", t0 - t1);
	printf("                         : %f\n", (t0 - t1) / 3600.0);
}



void test_file_crew_on_flight(unordered_map<long long, vector<CREW*>>& cofMap, const char *filepath) {
	//int i = 0;
	//unordered_map<long long, vector<CREW*>>::iterator it;
	//FILE * fp = fopen(filepath, "w");
	//for (it = cofMap.begin(); it != cofMap.end(); it++) {
	//	fprintf(fp, "flt_id:%lld, ", it->first);
	//	//printf("flt_id: %d\n", it->first);
	//	for (i = 0; i < it->second.size(); i++) {
	//		fprintf(fp, " %s,", it->second[i]->idCrew.c_str());
	//	}
	//	fprintf(fp, "\n");
	//}

	//fclose(fp);
}

void test_file_crew_on_flight2(unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& cofMap, const char *filepath) {
	map<string, bool> tmp;
	stringstream ss;
	map<string, int> duplicateCofCount;

	//按 flt_id排序打印
	map<long long, bool> fltIdSortMap;
	for (auto& entry : cofMap) {
		long long fltId = entry.first;
		fltIdSortMap[fltId] = true;
	}

	FILE * fp = fopen(filepath, "w");
	for (auto& entry : fltIdSortMap) {
		long long fltId = entry.first;
		fprintf(fp, "flt_id:%lld, ", fltId);
		//printf("flt_id: %d\n", it->first);
		auto& cofOfFlt = cofMap[fltId];
		std::stable_sort(cofOfFlt.begin(), cofOfFlt.end(), [](const SharedPtr<CrewOnFlight> & a, const SharedPtr<CrewOnFlight> & b) { return a->crewId.compare(b->crewId) < 0; });

		for (std::size_t i = 0; i < cofOfFlt.size(); i++) {
			fprintf(fp, " %s(%s/%s),", cofOfFlt[i]->crewId.c_str(), cofOfFlt[i]->actingRank.c_str(), cofOfFlt[i]->assignment.c_str());

			ss.str("");
			ss << fltId << "::" << cofOfFlt[i]->crewId;
			string key = ss.str();
			if (tmp.find(key) == tmp.end())
				tmp[key] = true;
			else
				if (duplicateCofCount.find(key) == duplicateCofCount.end())
					duplicateCofCount[key] = 2;
				else
					duplicateCofCount[key]++;
		}
		fprintf(fp, "\n");
	}

	fclose(fp);


	if (duplicateCofCount.size() > 0) {
		cout << "ERROR: found " << duplicateCofCount.size() << " duplicate COF, ckeck file 'ro_input_duplicate_COF.txt', one possible reason is 'dupblicate roster/segment' \n";

		ofstream o("ro_input_duplicate_COF.txt");
		int count = 0;
		for (auto& it : duplicateCofCount) {
			if (it.second == 1)
				continue;

			count++;
			if (count % 4 == 0)
				o << "\n";
			o << "  " << it.first << "=" << it.second;
		}
		o << endl;
	}
}

void test_file_crew_on_pairing(map<long long, list<SharedPtr<CrewOnFlight>>>& cofMap, const char *filepath) {
	int i = 0;
	map<string, bool> tmp;
	stringstream ss;
	map<long long, list<SharedPtr<CrewOnFlight>>>::iterator it;
	FILE * fp = fopen(filepath, "w");
	for (it = cofMap.begin(); it != cofMap.end(); it++) {

		it->second.sort([](const SharedPtr<CrewOnFlight> & a, const SharedPtr<CrewOnFlight> & b) { return a->crewId.compare(b->crewId) < 0; });

		fprintf(fp, "pairing_id:%lld, ", it->first);
		//printf("flt_id: %d\n", it->first);
		list<SharedPtr<CrewOnFlight>>::iterator it2;
		for (it2 = it->second.begin(); it2 != it->second.end(); it2++) {
			fprintf(fp, " %s(%s/%s),", (*it2)->crewId.c_str(), (*it2)->actingRank.c_str(), (*it2)->assignment.c_str());

			ss.str("");
			ss << it->first << "::" << (*it2)->crewId;
			string key = ss.str();
			if (tmp.find(key) == tmp.end())
				tmp[key] = true;
			else
				printf("ERROR: duplicate COP %s\n", key.c_str());
		}
		fprintf(fp, "\n");
	}

	fclose(fp);
}

void test_file_rank_acting(vector<DBRankActing> &list, const char* filepath) {
	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		DBRankActing item = list[i];
		fprintf(fp, "tid=%lld  airline=%s  activeRank=%s  actingRank=%s  qual=%s\n", item.tid, item.airline.c_str(), item.activeRank.c_str(), item.actingRank.c_str(), item.qual.c_str());
	}

	fclose(fp);
}

void test_file_crew_rank(vector<SharedPtr<CREW_RANK>> &list, const char* filepath) {
	char effBuf[100] = { 0 };
	char expBuf[100] = { 0 };
	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		SharedPtr<CREW_RANK> item = list[i];
		utcToUtcStr(item->effUtc, effBuf, sizeof(effBuf));
		utcToUtcStr(item->expUtc, expBuf, sizeof(expBuf));
		fprintf(fp, "crew=%s  rank=%s  effDt=%s (%lld)  expDt=%s (%lld)\n", item->idCrew.c_str(), item->rank.c_str(), effBuf, item->effUtc, expBuf, item->expUtc);
	}
	fclose(fp);
}
void test_file_crew_base(vector<SharedPtr<CREW_BASE>> &list, const char* filepath) {
	char effBuf[100] = { 0 };
	char expBuf[100] = { 0 };
	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		SharedPtr<CREW_BASE> item = list[i];
		utcToUtcStr(item->effUtc, effBuf, sizeof(effBuf));
		utcToUtcStr(item->expUtc, expBuf, sizeof(expBuf));
		fprintf(fp, "crew=%s  rank=%s  effDt=%s (%lld)  expDt=%s (%lld)\n", item->idCrew.c_str(), item->base.c_str(), effBuf, item->effUtc, expBuf, item->expUtc);
	}
	fclose(fp);
}
void test_file_crew_fleet(vector<SharedPtr<CREW_FLEET>> &list, const char* filepath) {
	char effBuf[100] = { 0 };
	char expBuf[100] = { 0 };
	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		SharedPtr<CREW_FLEET> item = list[i];
		utcToUtcStr(item->effUtc, effBuf, sizeof(effBuf));
		utcToUtcStr(item->expUtc, expBuf, sizeof(expBuf));
		fprintf(fp, "crew=%s  rank=%s  effDt=%s (%lld)  expDt=%s (%lld)\n", item->idCrew.c_str(), item->fleet.c_str(), effBuf, item->effUtc, expBuf, item->expUtc);
	}
	fclose(fp);
}
void test_file_crew_qual(vector<SharedPtr<CREW_QUALIFICATION>> &list, const char* filepath) {
	char issueBuf[100] = { 0 };
	char renewBuf[100] = { 0 };
	char expBuf[100] = { 0 };
	char cancelBuf[100] = { 0 };
	FILE * fp = fopen(filepath, "w");
	for (std::size_t i = 0; i < list.size(); i++) {
		SharedPtr<CREW_QUALIFICATION> item = list[i];
		utcToUtcStr(item->issuedUtc, issueBuf, sizeof(issueBuf));
		utcToUtcStr(item->renewedUtc, renewBuf, sizeof(renewBuf));
		utcToUtcStr(item->expiryUtc, expBuf, sizeof(expBuf));
		utcToUtcStr(item->cancelUtc, cancelBuf, sizeof(cancelBuf));
		fprintf(fp, "crew=%s  qual=%s  issuedUtc=%s (%lld)  renewedUtc=%s (%lld)  expiryUtc=%s (%lld)  cancelUtc=%s (%lld)\n", item->idCrew.c_str(), item->qual.c_str(), issueBuf, item->issuedUtc, renewBuf, item->renewedUtc, expBuf, item->expiryUtc, cancelBuf, item->cancelUtc);
	}
	fclose(fp);
}

void test_file_crew_roster(vector<SharedPtr<CREW>>& crewList, char * filepath) {
	FILE * fp = fopen(filepath, "w");
	char buf[100] = { 0 };
	for (auto& crew : crewList) {
		fprintf(fp, "crew: %s   name: %s\n", crew->idCrew.c_str(), crew->lastName.c_str());
		for (std::size_t i = 0; i < crew->rosterList.size(); i++) {
			char * sourceTypeStr = 0;
			if (crew->rosterList[i]->sourceType == ROSTER_SOURCE_PRE_ASSIGN) {
				sourceTypeStr = "ROSTER_SOURCE_PRE_ASSIGN";
			}
			else {
				sourceTypeStr = "ROSTER_SOURCE_OR";
			}
			fprintf(fp, "               pairingId,%lld, start, %s, scenarioId,%lld, sourceType,%s, totalPayTime,%d\n", crew->rosterList[i]->pairId, utcToUtcString(crew->rosterList[i]->strUtc).c_str(), crew->rosterList[i]->idscenario, sourceTypeStr, crew->rosterList[i]->totalPayTime);
		}
		if (crew->division == "P") {
			for (std::size_t j = 0; j < crew->mandayFdList.size(); j++) {
				SharedPtr<CREW_MANDAY_FD> manday = crew->mandayFdList[j];
				utcToUtcStr(manday->crewDateUtc, buf, sizeof(buf));
				fprintf(fp, "               manday %s blh=%d\n", buf, (int)manday->blh);
			}
		}
		else {
			for (std::size_t j = 0; j < crew->mandayCcAmList.size(); j++) {
				SharedPtr<CREW_MANDAY_CC_AM> manday = crew->mandayCcAmList[j];
				utcToUtcStr(manday->crewDateUtc, buf, sizeof(buf));
				fprintf(fp, "               manday %s blh=%d\n", buf, (int)manday->blh);
			}
		}
	}
	fclose(fp);
}

void test_file_crew_id_map(map<string, SharedPtr<CREW>>& m, char* filepath) {
	map<string, SharedPtr<CREW>>::iterator it;
	FILE * fp = fopen(filepath, "w");
	for (it = m.begin(); it != m.end(); it++) {
		fprintf(fp, "[%s]\n", it->first.c_str());
		printf_single_crew(fp, it->second.get());
	}
	fclose(fp);
}

void test_file_manday(vector<SharedPtr<CREW>>& list, char * filepath, bool isPublishedMandday) {
	FILE * fp = fopen(filepath, "w");
	for (std::size_t j = 0; j < list.size(); j++) {
		SharedPtr<CREW>& crew = list[j];
		if (crew->division == "P") {

			vector<SharedPtr<CREW_MANDAY_FD>> mandayFDList = crew->mandayFdList;
			for (vector<SharedPtr<CREW_MANDAY_FD>>::iterator it = mandayFDList.begin(); it != mandayFDList.end(); it++) {
				char dtBuf[100] = { 0 };
				utcToUtcStr((*it)->crewDateUtc, dtBuf, sizeof(dtBuf) - 1);
				fprintf(fp, "crew: %s  FD  date: %s   FT: %d   BLH: %d   FDP: %d   DP: %d  CUST_DP:%d\n", (*it)->idCrew.c_str(),
					dtBuf, (int)(*it)->ft, (int)(*it)->blh, (int)(*it)->fdp, (int)(*it)->dp, (int)(*it)->cust_dp);
			}
		}
		else {
			vector<SharedPtr<CREW_MANDAY_CC_AM>> mandayCCList = isPublishedMandday ? crew->publishedMandayCcAmList : crew->mandayCcAmList;
			for (vector<SharedPtr<CREW_MANDAY_CC_AM>>::iterator it = mandayCCList.begin(); it != mandayCCList.end(); it++) {
				char dtBuf[100] = { 0 };
				utcToUtcStr((*it)->crewDateUtc, dtBuf, sizeof(dtBuf) - 1);
				//fprintf(fp, "crew: %s  CC/AM  date: %s   BLH: %d   FDP: %d   DP: %d\n", (*it)->idCrew.c_str(),
				//	dtBuf, (*it)->blh, (*it)->fdp, (*it)->dp);

				fprintf(fp, "crew=%s  CC/AM  dtUtc=%s  ft=%d  blh=%d  fdp=%d  dp=%d  nightDP=%d  cust_dp=%d  travel=%d  "
					"credit=%d  fatigue=%d  leave=%d  dayOff=%d  standBy=%d  perDiem=%d  CSB=%d HSB=%d ASB=%d"
					//"pubBlh=%d  pubFdp=%d  pubDp=%d  pubNightDp=%d  pubTravel=%d  "
					//"pubCredit=%d  pubFatigue=%d  pubLeave=%d  pubDayOff=%d  pubStandBy=%d  "
					"idUser=%s\n",
					(*it)->idCrew.c_str(), dtBuf, (int)(*it)->ft, (int)(*it)->blh, (int)(*it)->fdp, (int)(*it)->dp, (*it)->NIGHT_DP, (int)(*it)->cust_dp, (*it)->TRAVEL,
					(int)(*it)->credit, (*it)->FATIGUE, (*it)->LEAVE, (*it)->DAY_OFF, (*it)->STANDBY, (int)(*it)->PER_DIEM, (*it)->CSB, (*it)->HSB, (*it)->ASB,
					//(*it)->PUB_BLH, (*it)->PUB_FDP, (*it)->PUB_DP, (*it)->PUB_NIGHT_DP, (*it)->PUB_TRAVEL,
					//(*it)->PUB_CREDIT, (*it)->PUB_FATIGUE, (*it)->PUB_LEAVE, (*it)->PUB_DAY_OFF, (*it)->PUB_STANDBY,
					(*it)->idUser.c_str()
					);
			}
		}
	}
	fclose(fp);
}

void test_file_manday_cc(vector<SharedPtr<CREW_MANDAY_CC_AM>>& list, char * filepath) {
	int i = 0;
	//printf(">> test_file_manday_cc start\n"); fflush(stdout);
	FILE * fp = fopen(filepath, "w");

	for (vector<SharedPtr<CREW_MANDAY_CC_AM>>::iterator it = list.begin(); it != list.end(); it++) {
		char dtBuf[100] = { 0 };
		utcToUtcStr((*it)->crewDateUtc, dtBuf, sizeof(dtBuf) - 1);
		//fprintf(fp, "crew: %s  CC/AM  date: %s   BLH: %d   FDP: %d   DP: %d\n", (*it)->idCrew.c_str(),
		//	dtBuf, (*it)->blh, (*it)->fdp, (*it)->dp);

		fprintf(fp, "crew=%s  CC/AM  dtUtc=%s  ft=%d,blh=%d  fdp=%d  dp=%d  nightDP=%d  cust_dp=%d  travel=%d  "
			"credit=%d  fatigue=%d  leave=%d  dayOff=%d  standBy=%d  CSB=%d HSB=%d ASB=%d "
			//"pubBlh=%d  pubFdp=%d  pubDp=%d  pubNightDp=%d  pubTravel=%d  "
			//"pubCredit=%d  pubFatigue=%d  pubLeave=%d  pubDayOff=%d  pubStandBy=%d  "
			"idUser=%s  perDiem=%d\n",
			(*it)->idCrew.c_str(), dtBuf, (int)(*it)->ft, (int)(*it)->blh, (int)(*it)->fdp, (int)(*it)->dp, (*it)->NIGHT_DP, (int)(*it)->cust_dp, (*it)->TRAVEL,
			(int)(*it)->credit, (*it)->FATIGUE, (*it)->LEAVE, (*it)->DAY_OFF, (*it)->STANDBY, (*it)->CSB, (*it)->HSB, (*it)->ASB,
			//(*it)->PUB_BLH, (*it)->PUB_FDP, (*it)->PUB_DP, (*it)->PUB_NIGHT_DP, (*it)->PUB_TRAVEL,
			//(*it)->PUB_CREDIT, (*it)->PUB_FATIGUE, (*it)->PUB_LEAVE, (*it)->PUB_DAY_OFF, (*it)->PUB_STANDBY,
			(*it)->idUser.c_str(), (int)(*it)->PER_DIEM
			);
	}
	fclose(fp);
	//printf("<< test_file_manday_cc end\n"); fflush(stdout);
}
void test_file_manday_fd(vector<SharedPtr<CREW_MANDAY_FD>>& list, char * filepath) {
	int i = 0;
	FILE * fp = fopen(filepath, "w");
	for (vector<SharedPtr<CREW_MANDAY_FD>>::iterator it = list.begin(); it != list.end(); it++) {
		char dtBuf[100] = { 0 };
		utcToUtcStr((*it)->crewDateUtc, dtBuf, sizeof(dtBuf) - 1);
		fprintf(fp, "crew: %s   date: %s   BLH: %d   FDP: %d   DP: %d  cust_dp:%d\n", (*it)->idCrew.c_str(),
			dtBuf, (int)(*it)->blh, (int)(*it)->fdp, (int)(*it)->dp, (int)(*it)->cust_dp);
	}
	fclose(fp);
}

void test_file_map(map<string, string>& m, char * filepath) {
	int i = 0;
	FILE * fp = fopen(filepath, "w");
	for (map<string, string>::iterator it = m.begin(); it != m.end(); it++) {
		fprintf(fp, "%s=%s\n", it->first.c_str(), it->second.c_str());
	}
	fclose(fp);
}

void test_file_map2(map<string, bool>& m, char * filepath) {
	int i = 0;
	FILE * fp = fopen(filepath, "w");
	for (auto it = m.begin(); it != m.end(); it++) {
		fprintf(fp, "%s=%d\n", it->first.c_str(), it->second);
	}
	fclose(fp);
}

void test_file_assignment_grp_val(unordered_map<string, unordered_set<string>>& m, char * filepath) {
	int i = 0;
	FILE * fp = fopen(filepath, "w");
	for (auto& grp : m) {
		for (auto& item : grp.second) {
			fprintf(fp, "%s=%s\n", grp.first.c_str(), item.c_str());
		}
	}
	fclose(fp);
}

void test_file_multimap(multimap<string, string>& m, char * filepath) {
	int i = 0;
	FILE * fp = fopen(filepath, "w");
	multimap<string, string>::iterator it = m.begin();
	while (it != m.end()) {
		fprintf(fp, "%s=%s\n", it->first.c_str(), it->second.c_str());
		it++;
	}
	fclose(fp);
}

void test_file_crew_recency(RecencyMgr& recencyMgr, char * filepath) {
	
	ofstream o(filepath);
	for (auto& recencyOfCrew : recencyMgr.getRecencyMap()) {
		for (auto& recencyOfDepArvFleetRoleRank : recencyOfCrew.second) {
			for (auto& it : recencyOfDepArvFleetRoleRank.second) {
				
				o << "scenario:" << it->scenarioId << " ";
				o << "crew:" << it->idcrew << " ";
				o << "date:" << utcToUtcString(it->crewDateUtc) << " ";
				o << "dep:" << it->depAirport << " ";
				o << "arv:" << it->arvAirport << " ";
				o << "opr:" << it->operate << " ";
				o << "status:" << it->status << " ";
				o << "approach:" << it->approach << " ";
				o << "unit:" << it->unit << " ";
				o << "times:" << it->times << " ";
				o << "fleet:" << it->fleet << " ";
				o << "actRank:" << it->actingRank << " ";

				o << "role:" << it->role << " ";
				o << "roster:" << it->rosterId << " ";
				o << "training:" << it->trainingId << " ";
				o << "remark:" << it->remark << " ";
				o << "user:" << it->iduser << " ";
				o << "tmst:" << utcToUtcString(it->tmst) << " ";
				o << endl;
			}
		}
	}
	o.close();
}

void test_file_holiday(vector<SharedPtr<Holiday>>& list, char* filepath) {

	char dtBuf[100] = { 0 };
	char tmstBuf[100] = { 0 };
	ofstream o(filepath);
	for (std::size_t i = 0; i < list.size(); i++) {
		o << list[i]->airline << " "
			<< list[i]->country << " "
			<< list[i]->city << " "
			<< utcToUtcString(list[i]->strDt) << " "
			<< utcToUtcString(list[i]->endDt) << " "
			<< list[i]->holiday << " "
			<< list[i]->mark << " "
			<< list[i]->doType << " "
			<< "\n";
	}
	o.close();
}

void test_file_assignment(map<long long, SharedPtr<ASSIGNMENT>>& totalAssign, char * filepath) {
	map<long long, SharedPtr<ASSIGNMENT>>::iterator it;
	//FILE * fp = fopen(filepath, "w");
	ofstream o;
	o.open(filepath);

	for (it = totalAssign.begin(); it != totalAssign.end(); it++) {
		SharedPtr<ASSIGNMENT> item = it->second;
		o << "AIRLINE:" << item->AIRLINE << "  ";
		o << "ASSIGNMENT_ID:" << item->ASSIGNMENT_ID << "  ";
		o << "ASSIGNMENT:" << item->assignment << "  ";
		o << "DESCRIPTION;:" << item->DESCRIPTION << "  ";
		o << "TYPE:" << item->TYPE << "  ";
		o << "COLOR_HEX:" << item->COLOR_HEX << "  ";
		o << "PATTERN_CODE:" << item->PATTERN_CODE << "  ";
		o << "STANDALONE:" << item->STANDALONE << "  ";
		o << "FIXED_STR_TM:" << item->FIXED_STR_TM << "  ";
		o << "FIXED_END_TM:" << item->FIXED_END_TM << "  ";
		o << "BT_PCT:" << item->BT_PCT << "  ";
		o << "CREDIT_PCT:" << item->CREDIT_PCT << "  ";
		o << "FDP_PCT:" << item->FDP_PCT << "  ";
		o << "DP_PCT:" << item->DP_PCT << "  ";
		o << "WP_PCT:" << item->WP_PCT << "  ";
		o << "REST_TIME:" << item->REST_TIME << "  ";
		o << "IS_RECENCY:" << (item->REST_TIME ? "Y" : "N") << "  ";
		o << endl;
	}
	o.close();
}

void test_file_crew_team(map<string, vector<SharedPtr<CREW_TEAM>>>& m, char* filepath) {
	FILE * fp = fopen(filepath, "w");
	for (map<string, vector<SharedPtr<CREW_TEAM>>>::iterator it = m.begin(); it != m.end(); it++) {
		fprintf(fp, "[%s]\n", it->first.c_str());
		for (std::size_t i = 0; i < it->second.size(); i++) {
			SharedPtr<CREW_TEAM>& item = it->second[i];
			fprintf(fp, "        team=%lld   role=%s   minHour=%d\n", item->team_id, item->role.c_str(), item->minInstructingHour);
		}
	}
	fclose(fp);
}

void test_file_resource_ctrl(map<long long, map<string, int>>& resMap, const char* filepath) {
	ofstream f(filepath);
	for (map<long long, map<string, int>>::iterator it = resMap.begin(); it != resMap.end(); it++) {
		long long idCqf = it->first;
		f << "[idCqf=" << idCqf << "]" << endl;
		for (map<string, int>::iterator it2 = it->second.begin(); it2 != it->second.end(); it2++) {
			f << "  " << it2->first << "=" << it2->second << endl;
		}
	}
	f.close();
}

void test_file_resource_ctrl_base_blh(vector<ResourceCtrlBaseBlh>& list, const char*filepath) {
	ofstream f(filepath);
	for (std::size_t i = 0; i < list.size(); i++) {
		ResourceCtrlBaseBlh item = list[i];
		f << "base=" << item.base
			<< " fleet=" << item.fleet
			<< "  blhHour=" << item.blhHour
			<< " blhMin=" << item.blhHourMin
			<< " blhMax=" << item.blhHourMax << endl;
	}
	f.close();
}
void test_file_leadin_info(vector<string>& list, const char* filepath) {
	ofstream f(filepath);
	for (std::size_t i = 0; i < list.size(); i++) {
		f << list[i] << endl;
	}
	f.close();
}

void test_file_leadin_occupy(map<string, map<string, double>>& leadinOccupy, const char * filepath) {
	ofstream f(filepath);
	for (map<string, map<string, double>>::iterator it = leadinOccupy.begin(); it != leadinOccupy.end(); it++) {
		map<string, double> comp = it->second;
		f << it->first << ",";
		for (map<string, double>::iterator i2 = comp.begin(); i2 != comp.end(); i2++) {
			f << i2->first << "=" << i2->second << " ";
		}
		f << endl;
	}
	f.close();
}

void test_file_flight_distribute(vector<Segment>  &list, char * filepath) {
	FILE * fp = 0;
	map<string, int>::iterator it;
	map<string, int> fltDepAirportMap;
	map<string, int> fltArvAirportMap;
	for (std::size_t i = 0; i < list.size(); i++) {
		Segment * p = &list[i];
		string dep = p->getDepSta();
		string arr = p->getArrSta();

		if (fltDepAirportMap.find(dep) == fltDepAirportMap.end())
			fltDepAirportMap[dep] = 1;
		else
			fltDepAirportMap[dep] = fltDepAirportMap[dep] + 1;

		if (fltArvAirportMap.find(arr) == fltArvAirportMap.end())
			fltArvAirportMap[arr] = 1;
		else
			fltArvAirportMap[arr] = fltArvAirportMap[arr] + 1;

	}
	fp = fopen(filepath, "w");
	fprintf(fp, "dep airport distribute:\r\n");
	for (it = fltDepAirportMap.begin(); it != fltDepAirportMap.end(); it++) {
		fprintf(fp, "[%s]=%d \r\n", it->first.c_str(), it->second);
	}
	fprintf(fp, "arr airport distribute:\r\n");
	for (it = fltArvAirportMap.begin(); it != fltArvAirportMap.end(); it++) {
		fprintf(fp, "[%s]=%d \r\n", it->first.c_str(), it->second);
	}

	fclose(fp);
}


//--------------------------------------------------------------
void test_file_rule_po(vector<DBRule> &ruleList, char * filepath) {
	int i = 0;
	bool rule2007OK = true;
	long long rule2007Id = 0;
	FILE * fp = fopen(filepath, "w");

	std::sort(ruleList.begin(), ruleList.end(), [](DBRule& o1, DBRule& o2) -> bool {
		if (o1.idRule != o2.idRule) {
			return o1.idRule < o2.idRule;
		}
		else {
			return o1.rowNum < o2.rowNum;
		}
	});

	for (vector<DBRule>::iterator ir = ruleList.begin(); ir != ruleList.end(); ir++) {
		fprintf(fp, "    ruleId:%lld\t func:%08d\t phase:%d class:%s description:%s talbeRow:TABLE%dROW%d   \t\tparams: ", ir->idRule, ir->function, ir->phase, ir->classType, ir->description, ir->tableNum, ir->rowNum);
		for (map<string, string>::iterator param = ir->params.begin(); param != ir->params.end(); param++)
		{
			fprintf(fp, "%s=%s, ", param->first.c_str(), param->second.c_str());
		}

		if (ir->function == 2007) {
			rule2007Id = ir->idRule;
			if (ir->params.find("Max FDP") != ir->params.end()) {
				string maxFDPStr = ir->params["Max FDP"];
				if (maxFDPStr.empty()) {
					printf("\n***WARN! MaxFDP is null for idrule=%d  table=%d\n", ir->idRule, ir->tableNum);
					rule2007OK = false;
				}
				if (!isHHmm(maxFDPStr.c_str())) {
					printf("\n***WARN! MaxFDP is NOT 'HH:mm' format for idrule=%d  table=%d  value=%s\n", ir->idRule, ir->tableNum, maxFDPStr.c_str());
					rule2007OK = false;
				}
			}
		}
		fprintf(fp, "\n");
	}
	fclose(fp);
	if (!rule2007OK) {
		printf("Rule 2007 OK  idrule=%d\n", rule2007Id);
	}
}
void test_file_cqf_po(vector<DBCqf> &cqfList, char * filepath) {
	FILE * fp = fopen(filepath, "w");
	for (vector<DBCqf>::iterator it = cqfList.begin(); it != cqfList.end(); it++) {
		for (std::size_t i = 0; i < it->paramValues.size(); i++) {
			fprintf(fp, "    cqfId:%lld\t func:%08d\t description:%s  names:%s values:%s\n", it->idCqf, it->function, it->description.c_str(), it->paramNames.c_str(), it->paramValues[i].c_str());
		}
		fprintf(fp, "\n");
	}
	fclose(fp);

}

//按时间段打印，若min/max=0表示不限制
void test_log_roster(string msg, vector<shared_ptr<ROSTER>>& list, time_t minStartUtc, time_t maxStartUtc) {
	for (auto& r : list) {
		if (minStartUtc != 0 && r->getStartTimeUtcAct() < minStartUtc)
			continue;
		if (maxStartUtc != 0 && r->getStartTimeUtcAct() > maxStartUtc)
			continue;
		cout << "**DBG " << msg
			<< " ROSTER"
			<< " " << r->idcrew
			<< " " << r->location
			<< " " << r->duty
			<< " str=" << utcToUtcString(r->getStartTimeLocAct())
			<< " rst=" << utcToUtcString(r->getRestStartLocAct())
			<< " end=" << utcToUtcString(r->getEndTimeLocAct())
			<< endl;
	}
}
void test_log_pairing(string msg, Pairing* p) {
	cout << msg
		<< " PAIRING " << p->getDbId() << " " << p->getBase() << "-" << p->getEndArp()
		<< " LOC:" << utcToUtcString(p->getStartTimeLocAct())
		<< " - " << utcToUtcString(p->getEndTimeLocAct())
		<< " UTC:" << utcToUtcString(p->getStartTimeUtcAct())
		<< " - " << utcToUtcString(p->getEndTimeUtcAct())
		//<< " " << p->getLabel()
		<< " comp=" << joinMapToStr(p->getComplements())
		<< endl;
	for (std::size_t i = 0; i < p->getNumDuties(); i++) {

		Duty * d = p->getDuty(i);
		Duty* nextDuty = (i + 1) >= p->getNumDuties() ? nullptr : p->getDuty(i + 1);
		int actualRest = d->getActualRest();

		cout << "   Duty " << d->getDepartureStation() << "-" << d->getArrivalStation()
			<< " " << utcToUtcDtString(d->getStartTimeLocAct())
			<< "  ACT:" << utcToUtcHHMM(d->getStartTimeLocAct()) << "-" << utcToUtcHHMM(d->getEndTimeLocAct()) << "(" << ((d->getEndTimeLocAct() - d->getStartTimeLocAct()) / 60) << ")"
			<< "  SCH:" << utcToUtcHHMM(d->getStartTimeLocSch()) << "-" << utcToUtcHHMM(d->getEndTimeLocSch()) << "(" << ((d->getEndTimeLocSch() - d->getStartTimeLocSch()) / 60) << ")"
			<< "  ACT-UTC:" << utcToUtcHHMM(d->getStartTimeUtcAct()) << "-" << utcToUtcHHMM(d->getEndTimeUtcAct())
			<< "  Brief:" << d->getMinBrief() << "/" << d->getActualBriefMin()
			<< " Debrief:" << d->getMinDebrief() << "/" << d->getActualDebriefMin()
			<< " pick:" << d->getMinPickup() << "/" << d->getActualPickupMin()
			<< " drop:" << d->getMinDropoff() << "/" << d->getActualDropoffMin()
			<< " plnFDP:" << d->getPlanFDP()
			<< " plnDP:" << d->getPlanDP()
			<< " actFDP:" << d->getActualFDP()
			<< " actDP:" << d->getActualDP()
			<< " actRst:" << actualRest
			<< " hisFlt:" << d->getFlyHoursHistory()
			<< endl;
		for (Segment* s : d->getSegments()) {
			cout << "    SEG " << s->getFlightNumber()
				<< " " << s->getDepSta() << "-" << s->getArrSta()
				<< " UTC=" << utcToUtcHHMM(s->getStartTimeUtcAct()) << "-" << utcToUtcHHMM(s->getEndTimeUtcAct())
				<< " ACT=" << utcToUtcHHMM(s->getStartTimeLocAct()) << "-" << utcToUtcHHMM(s->getEndTimeLocAct())
				<< " SCH=" << utcToUtcHHMM(s->getStartTimeLocSch()) << "-" << utcToUtcHHMM(s->getEndTimeLocSch())
				<< endl;
		}
		for (auto& node : d->pairingDutyNodes) {
			cout << "    NODE " << node->getNode() << " " << node->getType() << " " << utcToUtcString(node->getStartLoc()) << "  " << utcToUtcString(node->getEndLoc()) << endl;
		}
	}
}

//按时间顺序打印 dutynode和 seg
void test_log_segs_and_nodes(string msg, Pairing* p) {
	for (Duty* d : p->getDutyVec()) {

		vector<Activity*> segsAndNodes;
		for (auto& seg : d->getSegments()) {
			segsAndNodes.push_back(seg);
		}
		for (auto& node : d->pairingDutyNodes) {
			segsAndNodes.push_back(node.get());
		}

		//按时间排序
		stable_sort(segsAndNodes.begin(), segsAndNodes.end(), [](Activity*a, Activity*b) {
			return a->getStartTimeUtcAct() < b->getStartTimeUtcAct();
		});

		//打印
		cout << "DUTY" << endl;
		for (Activity* item : segsAndNodes) {
			if (item->getClassName() == "Segment") {
				Segment* seg = (Segment*)item;
				cout << std::setw(10) << seg->getAssignment()
					<< " \t" << utcToUtcString(seg->getStartTimeLocAct())
					<< "  " << utcToUtcString(seg->getEndTimeLocAct())
					<< " \t" << seg->getDepSta()
					<< " " << seg->getArrSta()
					<< endl;
			}
			else {
				PairingDutyNode* node = (PairingDutyNode*)item;
				cout << setw(10) << node->getNode()
					<< " \t" << utcToUtcString(node->getStartTimeLocAct())
					<< " " << utcToUtcString(node->getEndTimeLocAct())
					<< endl;
			}
		}
	}
}

//检查号位重复flt
void checkSeqOrderDuplicate(SharedPtr<CrewDataContext>& dbData) {
	for (auto& flt : dbData->flightList) {
		long long fltId = flt->getDBId();

		auto list = dbData->rosterFlightMgr.get(fltId);
		if (list.empty()) {
			continue;
		}
		for (int i = 0; i < (int)list.size() - 1; i++) {
			auto& rf1 = list[i];
			if (rf1->seqOrder == 0)
				continue;
			//cout << "**DBG rosterFlt " << rf1->fltId << "  crew=" << rf1->crewId << endl;
			if (rf1->fltId == 54607085L && rf1->crewId == "000728") {
				cout << endl;
			}
			for (int j = i + 1; j < (int)list.size(); j++) {
				auto& rf2 = list[j];
				if (rf1->seqOrder == rf2->seqOrder) {
					shared_ptr<ROSTER> r1, r2;
					for (auto& r : dbData->crewIdMap[rf1->crewId]->rosterList) {
						if (r->rosterId == rf1->rosterId)
							r1 = r;
					}
					for (auto& r : dbData->crewIdMap[rf2->crewId]->rosterList) {
						if (r->rosterId == rf2->rosterId)
							r2 = r;
					}
					cout << "**DBG duplicate seqOrder flt=" << fltId << " " << rf1->fltDt
						<< " crewA=" << rf1->crewId << " " << rf1->actingRank << " rosterA=" << rf1->rosterId << "(" << (r1 ? utcToUtcString(r1->tmst) : "null") << ")" << " ptnA=" << rf1->pairingId
						<< " crewB=" << rf2->crewId << " " << rf2->actingRank << " rosterB=" << rf2->rosterId << "(" << (r2 ? utcToUtcString(r2->tmst) : "null") << ")" << " ptnB=" << rf2->pairingId
						<< " seqOrder=" << rf1->seqOrder
						<< endl;
				}
			}
		}
	}
}




void test_helper(CrewDataContext* dbData, string msg) {
	auto& crew = dbData->crewIdMap["A0004"];
	for (auto& r : crew->rosterList) {
		std::cout << "**DBG " << msg
			<< " " << r->idcrew
			<< " " << r->duty
			<< " " << r->location
			<< " " << utcToUtcString(r->actStrLoc)
			<< " " << utcToUtcString(r->actRestStrLoc)
			<< " " << utcToUtcString(r->actEndLoc)
			<< " pg=" << r->pairId
			<< endl;
	}
	auto& pg = dbData->pairingIdMap[4240012];
	if (pg) {
		for (auto& d : pg->getDutyVec()) {
			cout << "**DBG " << msg
				<< "  duty type=" << d->getType()
				<< endl;
			for (auto& s : d->getSegments()) {
				cout << "**DBG " << msg
					<< "    seg " << s->getAssignment()
					<< " " << s->getDepSta()
					<< " " << s->getArrSta()
					<< " " << utcToUtcString(s->getStartTimeLocSch())
					<< endl;
			}
		}
	}
}
