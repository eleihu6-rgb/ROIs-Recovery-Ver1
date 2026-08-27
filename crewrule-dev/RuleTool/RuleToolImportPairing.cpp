/*
1、读取场景，读取文件解析为pairing，存入DB
2、根据rule 2002计算 DP
3、根据rule 2005计算 duty.rest
4、根据flight blk history计算 segment.history
*/
#include <iostream>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <iomanip>
#include "RuleTool.h"
#include "CrewDB.h"
#include "UtilFunc.h"
#include "OrLog.h"
#include "CrewDBUtil.h"
#include "Rule3010Calculator.h"

using namespace std;

//#define DEFAULT_LOCAL_TIME_OFFSET 8

struct ferry {
	long long scheduleId;
	string ferryType;
	time_t effDt;
	time_t disDt;
	string dow;
	string ferryNum;
	string dep;
	string arv;
	int depUtcTm; //HHmm
	int arvUtcTm; //HHmm
	int duration;
};

struct RuleForImport {
	int paramMaxTurnTimeHours = 0;             //2002
	int paramMinRestAfterDuty = 0;             //2005
	int paramMinRestAfterCrossMidNightDuty = 0;//2005
	int paramMidNightHHmm = 0;                 //2005
};

struct ImportPairingData {
	time_t minStartUtc = 0;
	time_t maxEndUtc = 0;
	map<string, ferry*> ferryMap; // dep::arv::startTm --> ferry
	vector<Segment*> flightList;
	map<string, Segment*> flightMap; // startUtc::fltNum --> flight
	vector<ferry> ferryList;
	RuleForImport ruleParams;
	map<string, int> flightHistoryBlk;
	CrewDataContext * dbData;
	Rule3010 * rule3010;
	~ImportPairingData() { if (rule3010) delete rule3010; }
};

string getRegion(Duty * duty);
void getTimeWindowFromLinesZH(ImportPairingData& dataCtx, vector<string>& lines);
int prepareImportPairingDatas(ImportPairingData& dataCtx, PairingDBContext * ctx, vector<string>& lines, int scenarioId, string utcOrLoc);

time_t parseTimeZH(string yyyyMMdd, string hhmm);

//读取 flight_history, 结果 key=fleet::dep::arv, value=blk
int loadFlightHistory(PairingDBContext * ctx, string airline, map<string, int>& result) {
	
	return 0;
}

int loadFerrySchedule(PairingDBContext * ctx, string& tttId, vector<ferry>& result);

//检查fltNum是否代表DHD
bool isFltNumDhd(string& fltNum) {
	int len = (int)fltNum.length();
	if ('D' != fltNum.at(len - 1))
		return false;
	if (len < 3)
		return false;
	return true;
}

//读取pairing文件，结果放入lines
int readPairingFileToLines(string filename, vector<string>& lines) {
	int ret = 0;
	ifstream in;
	char line[1024] = { 0 };

	in.open(filename);
	if (!in.is_open()) {
		printf("read file fail");
		ret = ERR_FILE_OPEN_FAIL;
		goto CLEANUP;
	}

	while (true) {
		in.getline(line, sizeof(line) - 1);
		if (strnlen(line, sizeof(line)) == 0)
			break;
		lines.push_back(line);
	}

CLEANUP:
	if (in.is_open())
		in.close();
	return ret;
}

//根据duty/segment重算pairing字段
void reComputePairingFieldByDutyAndSegment(Pairing * pairing, RuleForImport& ruleParam, map<string, int>& flightHistoryBlk, CrewDataContext* dbData, ImportPairingData& importParams) {
	stringstream ss;
	//assignment
	string primeActivity = "FLY";
	pairing->setPrimeActivity(primeActivity);
	for (Duty * d : pairing->getDutyVec()) {
		bool hasFly = false;
		for (Segment * s : d->getSegments()) {
			if (s->getAssignment() == "FLY") {
				hasFly = true;
				break;
			}
		}
		if (hasFly)
			d->setType(BaseDuty::DUTY_TYPE::DUTY_PURE_OPR);//dutyType=O
		else
			d->setType(BaseDuty::DUTY_TYPE::DUTY_POS_OWN);//dutyType=P
	}
	
	//start/end
	Duty * firstDuty = pairing->getDuty(0);
	Duty * lastDuty = pairing->getDuty(pairing->getNumDuties() - 1);

	//pairing.composition
	//遍历segment，查找最大 hierarchy对应composition作为目标
	long long compositionId = 0;
	int maxHierarchy = 0;
	map<string, int> pairingVankValue;
	for (Duty * d : pairing->getDutyVec()) {
		for (Segment * s : d->getSegments()) {
			if (s->getCompositionHierarchy() > maxHierarchy) {
				//id
				maxHierarchy = s->getCompositionHierarchy();
				compositionId = s->getCompositionId();
				const auto & plan = s->getPlanComposition();
				//rank-value map
				for (auto& rv : s->getPlanComposition()) {
					string rank = rv.first;
					int value = rv.second;
					if (pairingVankValue.find(rank) == pairingVankValue.end())
						pairingVankValue[rank] = value;
					else if (pairingVankValue[rank] < value)
						pairingVankValue[rank] = value;
				}
			}
		}
	}
	pairing->setCompositionId(compositionId);
	pairing->setComplements(pairingVankValue);

	//duty.base/airport/brief/debrief
	//DP/FDP/REST
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);

		//base/airport
		Segment * firstSeg = d->getSegment(0);
		Segment * lastSeg = d->getSegment(d->getNumSegments() - 1);
		d->setDepStation(firstSeg->getDepStation());
		d->setArrStation(lastSeg->getArrStation());

		string region = getRegion(d); //mantis#2251, 若region为空则按segment重新计算
		d->setRegion(region);

		string firstSegmentType = strToUpper(firstSeg->getAssignment());
		string lastSegmentType = strToUpper(lastSeg->getAssignment());
		if (firstSeg->isDeadhead()) {
			firstSegmentType = "DHD";
		}
		else if (firstSeg->isBusFerry()) {
			firstSegmentType = "BUS";
		}
		else
			firstSegmentType = "FLY";

		if (lastSeg->isDeadhead()) {
			lastSegmentType = "DHD";
		}
		else if (lastSeg->isBusFerry()) {
			lastSegmentType = "BUS";
		}
		else
			lastSegmentType = "FLY";

		//20180308 ain, mantis#2914, 补充 brief/pickup计算
		//brief/debrief
		Rule3010Result result = importParams.rule3010->findMatch(d->getSegment(0)->getFlightNumber(), d->getDepStation(), d->getArrStation(), firstSeg->getStartTimeLocSch(), region, firstSegmentType, lastSegmentType);
		d->setMinBrief(result.briefMinutes);
		d->setMinDebrief(result.debriefMinutes);
		d->setMinPickup(result.pickupMinutes);
		d->setMinDropoff(result.dropMinutes);
		d->setStartTimeUtcSch(firstSeg->getStartTimeUtcSch() - result.briefMinutes * 60);
		d->setStartTimeLocSch(firstSeg->getStartTimeLocSch() - result.briefMinutes * 60);
		d->setEndTimeUtcSch(lastSeg->getEndTimeUtcSch() + result.debriefMinutes * 60);
		d->setEndTimeLocSch(lastSeg->getEndTimeLocSch() + result.debriefMinutes * 60);

		//DP/FDP/FT
		int dp_sec = static_cast<int>(d->getEndTimeUtcSch() - d->getStartTimeUtcSch()) ;
		//int fdp = 0;
		int blh = 0;
		//int restMinuteBetweenDuty = 0; //20180309 ain, 因 import-pairing-zh, 暂时移除逻辑dp -= restMinuteBetweenDuty
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment * s = d->getSegment(j);
			blh += static_cast<int>(s->getEndTimeUtcSch() - s->getStartTimeUtcSch()) / 60;
			//if (j >= 1 && ruleParam.paramMaxTurnTimeHours * 3600 < d->getSegment(j)->getStartTimeUtcSch() - d->getSegment(j - 1)->getEndTimeUtcSch())
				//restMinuteBetweenDuty += (d->getSegment(j)->getStartTimeUtcSch() - d->getSegment(j - 1)->getEndTimeUtcSch()) / 60;
		}
		//若fdp在文本中已经解析过，则不再计算
		if (d->getFDPInSecs() == 0) {
			int fdp_sec = dp_sec - d->getMinBrief()*60 - d->getMinDebrief()*60;
			d->setFDPInSecs(fdp_sec);
		}
		//dp -= restMinuteBetweenDuty;
		d->setDPInSecs(dp_sec);
		d->setFlyHours(blh / 60.0);
		//REST
		//若为跨夜duty，使用minRestTimeAfterCrossMiddleNightDuty
		//若不跨夜，使用minRestTimeAfterDuty
		int dutyEndHHmm = atoi(utcToUtcHHMM(d->getEndTime()).c_str());
		if (getStartTimeOfDay(d->getEndTime()) > getStartTimeOfDay(d->getStartTime())
			&& dutyEndHHmm > ruleParam.paramMidNightHHmm) {
			d->setMinRest(ruleParam.paramMinRestAfterCrossMidNightDuty * 60);
		}
		else {
			d->setMinRest(ruleParam.paramMinRestAfterDuty * 60);
		}
	}
	pairing->setBase(pairing->getDuty(0)->getSegment(0)->getDepStation());
	pairing->setStartTime(firstDuty->getStartTime());
	pairing->setStartTimeUtc(firstDuty->getStartTimeUtcSch());
	pairing->setEndTime(lastDuty->getEndTime());
	pairing->setEndTimeUtc(lastDuty->getEndTimeUtcSch());
	int tafb = 1 + static_cast<int>(getStartTimeOfDay(pairing->getEndTimeLocSch()) - getStartTimeOfDay(pairing->getStartTimeLocSch())) / (24 * 3600);
	pairing->setNumCrewDays(tafb);

	//fleet/history blk
	string fleet = "";
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty * d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment * s = d->getSegment(j);
			if (s->getAssignment() == "FLY") {
				fleet = s->getFleetCD();
				break;
			}
			//history
			ss.str("");
			ss << s->getFleetCD() << "::" << s->getDepStation() << "::" << s->getArrStation();
			string key = ss.str();
			if (flightHistoryBlk.find(key) == flightHistoryBlk.end()) {
				s->setBlkMinHistory(flightHistoryBlk[key]);
			}
			else {
				s->setBlkMinHistory(static_cast<int>(s->getEndTimeUtcSch() - s->getStartTimeUtcSch()) / 60);//
			}
		}
		if (fleet != "") break;
	}
	pairing->setFltCode(fleet);

}
//根据出发、到达、时刻匹配ferry填充bus对象
void fillBusSegmentValue(Segment* bus, vector<string>& tmp, map<string, ferry*>& ferryMap, CrewDataContext* dbData) {
	//mantis#2648, BUS segment.flt_num = "BUS"
	bus->setSegNumber("BUS");
	bus->setFlightNumber("BUS");
	bus->setFleetCD("BUS");
	bus->setAssignment("BUS");

	stringstream ss;
	ss.str("");
	ss << tmp[2] << " " << tmp[3];
	time_t startUtc = utcStrToUtc((char*)ss.str().c_str());
	string dep = tmp[5];
	string arv = tmp[6];
	int depTmZoneMinutes = dbData->getAirportOffsetMinutes(dep);
	int arvTmZoneMinutes = dbData->getAirportOffsetMinutes(arv);
	bus->setDepStation(dep);
	bus->setArrStation(arv);
	bus->setStartTimeUtcSch(startUtc);
	bus->setStartTimeLocSch(startUtc + depTmZoneMinutes * 60);

	time_t startLoc = startUtc + depTmZoneMinutes * 60;
	string startStr = utcToUtcString(startLoc);
	tm m;
#ifdef WIN32
	gmtime_s(&m, &startUtc);
#else
	if(NULL == gmtime_r(&startUtc, &m)){
	    return;
	}
#endif
	ss.str("");
	ss << dep << "::" << arv << "::" << m.tm_hour << setfill('0') << setw(2) << m.tm_min << setfill('0') << setw(2);
	string key = ss.str();
	if (ferryMap.find(key) == ferryMap.end()) {
		///log ferry
		ofstream logFerry("ro_input_ferry.txt");
		for (auto& entry : ferryMap) {
			logFerry << entry.first << " " << entry.second->dep << "::" << entry.second->arv << "::" << entry.second->depUtcTm << "::" << entry.second->arvUtcTm << "\n";
		}
		logFerry.flush();
		logFerry.close();
		Logger::getRuleLogger()->error("[fillBusSegmentValue] ferry not found {}", key);
		return;
	}
	ferry* f = ferryMap[key];
	int durationMinute = f->duration;
	time_t endUtc = startUtc + durationMinute * 60;
	bus->setEndTimeUtcSch(endUtc);
	bus->setEndTimeLocSch(endUtc + arvTmZoneMinutes * 60);
}
void fillBusSegmentValueZH(Segment* bus, vector<string>& tmp, map<string, ferry*>& ferryMap, CrewDataContext* dbData) {
	//mantis#2648, BUS segment.flt_num = "BUS"
	bus->setSegNumber("BUS");
	bus->setFlightNumber("BUS");
	bus->setFleetCD("BUS");
	bus->setAssignment("BUS");

	stringstream ss;

	time_t startLoc = parseTimeZH(tmp[1], tmp[3]);
	time_t endLoc = parseTimeZH(tmp[8], tmp[6]);
	string dep = tmp[2];
	string arv = tmp[7];
	int depTmZoneMinutes = dbData->getAirportOffsetMinutes(dep);
	int arvTmZoneMinutes = dbData->getAirportOffsetMinutes(arv);
	bus->setDepStation(dep);
	bus->setArrStation(arv);
	bus->setStartTimeUtcSch(startLoc - depTmZoneMinutes * 60);
	bus->setStartTimeLocSch(startLoc);
	bus->setEndTimeUtcSch(endLoc - arvTmZoneMinutes * 60);
	bus->setEndTimeLocSch(endLoc);
}
//根据line解析 pairing
Pairing * parsePairing(string& line) {
	return new Pairing();
}
//根据line解析 duty
Duty * parseDuty(string& line, CrewDataContext* dbData) {
	vector<string> tmp;
	stringstream ss;
	split(line.c_str(), ' ', tmp);
	string dep = tmp[2];
	string arv = tmp[5];
	int depTmZoneMinutes = dbData->getAirportOffsetMinutes(dep);
	int arvTmZoneMinutes = dbData->getAirportOffsetMinutes(arv);
	Duty * d = new Duty();
	//base
	d->setDepStation(dep);
	d->setArrStation(arv);
	//utc
	ss << tmp[3] << " " << tmp[4];
	time_t startUtc = utcStrToUtc((char*)ss.str().c_str());
	ss.str("");
	ss << tmp[6] << " " << tmp[7];
	time_t endUtc = utcStrToUtc((char*)ss.str().c_str());
	d->setStartTimeUtcSch(startUtc);
	d->setStartTime(startUtc + depTmZoneMinutes * 60);
	d->setEndTimeUtcSch(endUtc);
	d->setEndTime(endUtc + arvTmZoneMinutes * 60);
	
	return d;
}
Duty * parseDutyZH(string& line) {

	vector<string> tmp;
	stringstream ss;
	split(line.c_str(), ' ', tmp);
	Duty * d = new Duty();
	//base
	d->setDepStation(tmp[2]);
	d->setArrStation(tmp[3]);
	int fdp = atoi(tmp[4].c_str());
	d->setFDPInSecs(fdp * 60);
	return d;
}

//根据line解析 segment，参数fltMap为 startUtc::fltNum --> flight
Segment * parseSegment(string& line, string airline, map<string, Segment*>& fltMap, map<string, ferry*>& ferryMap, CrewDataContext* dbData) {
	vector<string> tmp;
	stringstream ss;
	split(line.c_str(), ' ', tmp);
	//find flight
	//20171221 ain mantis#2690, import-pairing DHD修正 assignment/fltNum
	//fltNumOfSeg为数据源 segment fltNum, 1782D
	//fltNumOfFlt为解析后 flight fltNum, 1782
	string fltNumOfSeg = tmp[7];
	string fltNumOfFlt = isFltNumDhd(fltNumOfSeg) ? fltNumOfSeg.substr(0, fltNumOfSeg.length() - 1) : fltNumOfSeg; //remove last 'D' from DHD segment
	ss << tmp[2] << " " << tmp[3] << "::" << fltNumOfFlt;
	string key = ss.str();
	if (fltMap.find(key) == fltMap.end() && fltNumOfSeg != "BUS") {
		Logger::getRuleLogger()->error("[parseSegment] flight not found {}", key);
		return nullptr;
	}

	//set val
	Segment * s = new Segment();
	if (fltNumOfSeg == "BUS") {
		//s->setAirlineCD(airline);
		fillBusSegmentValue(s, tmp, ferryMap, dbData);
	}
	else if (isFltNumDhd(fltNumOfSeg)) {
		Segment * prototype = fltMap[key];
		s->copyValue(prototype);
		s->setAssignment("DHD");
		s->setFlightNumber(fltNumOfSeg); //dhd.flightNum --> segFltNum --> 1782D
		s->setSegNumber(fltNumOfSeg);    //dhd.segNum=fltNum --> segFltNum --> 1782D
	}
	else {
		Segment * prototype = fltMap[key];
		s->copyValue(prototype);
		s->setAssignment("FLY");
	}
	

	return s;
}
Segment * parseSegmentZH(string& line, string airline, map<string, Segment*>& fltMap, map<string, ferry*>& ferryMap, CrewDataContext* dbData) {
	vector<string> tmp;
	stringstream ss;
	split(line.c_str(), ' ', tmp);

	string type = tmp[0]; //T/F/D
	string date = tmp[1]; //20170725
	string depArp = tmp[2];
	string depHHmm = tmp[3];
	string fltNum = tmp[5]; ///
	string arvHHmm = tmp[6];
	string arvArp = tmp[7];

	int depTimezoneMinutes = dbData->getAirportOffsetMinutes(depArp);

	//find flight
	time_t startLoc = parseTimeZH(date, depHHmm);
	time_t startUtc = startLoc - depTimezoneMinutes * 60;
	ss << utcToUtcString(startUtc) << "::" << fltNum;
	string key = ss.str();
	if (fltMap.find(key) == fltMap.end() && type != "T") {
		Logger::getRuleLogger()->error("[parseSegmentZH] flight not found {}", key);
		return nullptr;
	}

	//set val
	Segment * s = new Segment();
	if (type == "T") {
		//s->setAirlineCD(airline);
		fillBusSegmentValueZH(s, tmp, ferryMap, dbData);
	}
	else if (type == "D") {
		Segment * prototype = fltMap[key];
		s->copyValue(prototype);
		s->setAssignment("DHD");
		s->setFlightNumber(fltNum + "D"); //dhd.flightNum --> segFltNum --> 1782D
		s->setSegNumber(fltNum + "D");    //dhd.segNum=fltNum --> segFltNum --> 1782D
	}
	else {
		Segment * prototype = fltMap[key];
		s->copyValue(prototype);
		s->setAssignment("FLY");
	}


	return s;
}

int RuleTool::importPairing(long long scenarioId, string filename) {
	return 0;
}

//按loc理解segment行, 汇总utc时间窗
void getTimeWindowFromLinesZH(ImportPairingData& dataCtx, vector<string>& lines) {
	time_t tmpUtc = 0;
	vector<string> tmpList;
	for (string& line : lines) {
		if (line.find("PAIRING") == std::string::npos
			&& line.find("DUTY") == std::string::npos
			&& line.find("ENDPAIRING") == std::string::npos) {

			tmpList.clear();
			split(line.c_str(), ' ', tmpList);

			tmpUtc = dateStrToTime(tmpList[1]);
			if (dataCtx.minStartUtc == 0 || dataCtx.minStartUtc > tmpUtc)
				dataCtx.minStartUtc = tmpUtc;

			tmpUtc = dateStrToTime(tmpList[8]);
			if (dataCtx.maxEndUtc == 0 || dataCtx.maxEndUtc < tmpUtc)
				dataCtx.maxEndUtc = tmpUtc;
		}
	}
	cout << "minStart=" << utcToUtcString(dataCtx.minStartUtc) << " maxEnd=" << utcToUtcString(dataCtx.maxEndUtc) << endl;
}

int prepareImportPairingDatas(ImportPairingData& dataCtx, PairingDBContext * ctx, vector<string>& lines, long long scenarioId, string utcOrLoc) {
	
	return 0;
}

int RuleTool::importPairingZH(long long scenarioId, string filename, string utcOrLoc, int outputTmZone) {

	return 0;
}

int loadFerrySchedule(PairingDBContext * ctx, string& tttId, vector<ferry>& result) {
	
	return 0;
}

time_t parseTimeZH(string yyyyMMdd, string hhmm) {
	time_t t = dateStrToTime(yyyyMMdd);
	int hhmmNum = atoi(hhmm.c_str());
	t += (hhmmNum / 100) * 3600 + (hhmmNum % 100) * 60;
	return t;
}
