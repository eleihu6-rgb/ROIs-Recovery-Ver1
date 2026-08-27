
#include <iostream>
#include <fstream>
#include <sstream>
#include <algorithm>
#include "RuleTool.h"
#include "CrewDB.h"
#include "UtilFunc.h"
#include "StringUtil.h"

using namespace std;

enum TIME_TYPE {
	startUtcType, startLocType, endUtcType, endLocType
};

static time_t getItemTime(Pairing* pairing, TIME_TYPE TYPE, int outputTmZoneOffsetHour) {
	if (TYPE == startUtcType) return pairing->getStartTimeUtc() + outputTmZoneOffsetHour * 3600;
	else if (TYPE == startLocType) return pairing->getStartTime() + outputTmZoneOffsetHour * 3600;
	else if (TYPE == endUtcType) return pairing->getEndTimeUtc() + outputTmZoneOffsetHour * 3600;
	else if (TYPE == endLocType) return pairing->getEndTime() + outputTmZoneOffsetHour * 3600;
	else return -1;
}
static time_t getItemTime(Duty* duty, TIME_TYPE TYPE, int outputTmZoneOffsetHour) {
	if (TYPE == startUtcType) return duty->getStartTimeUtcSch() + outputTmZoneOffsetHour * 3600;
	else if (TYPE == startLocType) return duty->getStartTime() + outputTmZoneOffsetHour * 3600;
	else if (TYPE == endUtcType) return duty->getEndTimeUtcSch() + outputTmZoneOffsetHour * 3600;
	else if (TYPE == endLocType) return duty->getEndTime() + outputTmZoneOffsetHour * 3600;
	else return -1;
}
static time_t getItemTime(Segment* seg, TIME_TYPE TYPE, int outputTmZoneOffsetHour) {
	if (TYPE == startUtcType) return seg->getStartTimeUtcSch() + outputTmZoneOffsetHour * 3600;
	else if (TYPE == startLocType) return seg->getStartTimeLocSch() + outputTmZoneOffsetHour * 3600;
	else if (TYPE == endUtcType) return seg->getEndTimeUtcSch() + outputTmZoneOffsetHour * 3600;
	else if (TYPE == endLocType) return seg->getEndTimeLocSch() + outputTmZoneOffsetHour * 3600;
	else return -1;
}
//从str中获取开头的数字部分
string getStartNumberFromStr(string str) {
	stringstream ss;
	for (std::size_t i = 0; i < str.length(); i++) {
		char ch = str.at(i);
		if (ch < '0' || ch > '9')
			break;
		ss << ch;
	}
	return ss.str();
}

//从dbData中导出pairing/duty/segment，PI默认格式
int exportPairingToFile(SharedPtr<CrewDataContext> dbData, string type, int outputTmZoneHour) {

	vector<Pairing*> pairingOfScenario;
	//string scenarioIdStr;
	stringstream ss;
	stringstream filename;
	ofstream f;
	int ret = 0;

	//ss << dbData->scenarioId;
	//scenarioIdStr = ss.str();

	printf("********************** \n");
	printf("export %s %d\n", type.c_str(), outputTmZoneHour);
	
	//filter pairing by scenario
	for (std::size_t i = 0; i < dbData->pairingList.size(); i++) {
		if (dbData->pairingList[i]->getScenarioId() == dbData->scenarioId)
			pairingOfScenario.push_back(dbData->pairingList[i]);
	}
	cout << "pairing.size = " << pairingOfScenario.size() << endl;

	//output file
	filename << "export_pairing_" << dbData->scenarioId << ".txt";
	f.open(filename.str());

	for (std::size_t i = 0; i < pairingOfScenario.size(); i++) {
		Pairing* p = pairingOfScenario[i];
		f << "Pairing " << (i + 1) << "\n";

		for (std::size_t dutyI = 0; dutyI < p->getNumDuties(); dutyI++) {
			Duty * d = p->getDuty(dutyI);
			char start[100] = { 0 };
			char end[100] = { 0 };
			//mantis#2001, print time in utc
			//utcToUtcStr(d->getStartTimeUtcSch(), start, sizeof(start));
			//utcToUtcStr(d->getEndTimeUtcSch(), end, sizeof(end));
			//OP#1524, 根据参数type/tmZone确定导出格式时区
			utcToUtcStr(getItemTime(d, type == "utc" ? startUtcType : startLocType, outputTmZoneHour), start, sizeof(start));
			utcToUtcStr(getItemTime(d, type == "utc" ? endUtcType : endLocType, outputTmZoneHour), end, sizeof(end));
			
			f << "Duty " << (dutyI + 1) << " " << d->getDepStation() << " " << start << " " << d->getArrStation() << " " << end << "\n";

			for (std::size_t segI = 0; segI < d->getNumSegments(); segI++) {
				Segment * s = d->getSegment(segI);
				//mantis#2001, print time in utc
				char segStart[100] = { 0 };
				//utcToUtcStr(s->getStartTimeUtcSch(), segStart, sizeof(segStart));
				//OP#1524, 根据参数type/tmZone确定导出格式时区
			        auto tempSegNumber = s->getSegNumber();
				f << "Segment " << (segI + 1)
					<< " " << utcToUtcString(getItemTime(s, type == "utc" ? startUtcType : startLocType, outputTmZoneHour))
					<< " " << (s->getAssignment() == "BUS" ? "BUS" : s->getFleetCD())       //mantis#1889, BUS fleet
					<< " " << s->getDepStation()
					<< " " << s->getArrStation()
					//mantis#1889, DHD segment fltNum suffix 'D': 1099 --> 1099D
					//mantis#1889, BUS segment fltNum=BUS
					//mantis#2590, fltNum已经D结尾时不再增加后缀，如'856DD'
					<< " " << tempSegNumber << (s->getAssignment() == "DHD" && (!strEndsWith(tempSegNumber, "D")) ? "D" : "") << (s->getAssignment() == "BUS" ? "BUS" : "")
					<< "\n";
			}
		}
	}
	f.close();

	printf("%5d  exportPairing end\n", static_cast<int>(time(0) % 3600));
	if (ret != 0) {
		printf("ERROR: %d\n", ret);
	}
	return ret;
}
//按mf格式从dbData导出pairing
int exportPairingMfToFile(SharedPtr<CrewDataContext> dbData, string type, int outputTmZoneHour) {

	int i = 0;
	int ret = 0;
	vector<Pairing*> pairingOfScenario;
	stringstream ss;
	//string sid = "";
	stringstream filename;
	ofstream f;
	time_t minStart = 0;
	time_t maxEnd = 0;
	map<long long, int> fltIdToSegFltNumMapIndex;

	if (type != "utc" && type != "loc") {
		Logger::getRuleLogger()->error("invalid type={}, config default type=utc", type);
		type = "utc";
	}

	//ss << dbData->scenarioId;
	//sid = ss.str();
	//load data
	for (std::size_t i = 0; i < dbData->pairingList.size(); i++) {
		Pairing * p = dbData->pairingList[i];
		if (p->getScenarioId() == dbData->scenarioId)
			pairingOfScenario.push_back(dbData->pairingList[i]);
		if (minStart == 0 || minStart > getItemTime(p, type == "utc" ? startUtcType : startLocType, outputTmZoneHour))
			minStart = getItemTime(p, type == "utc" ? startUtcType : startLocType, outputTmZoneHour);
		if (maxEnd == 0 || maxEnd < p->getEndTimeUtc())
			maxEnd = getItemTime(p, type == "utc" ? endUtcType : endLocType, outputTmZoneHour);
	}

	//output file
	filename << "export_pairing_" << dbData->scenarioId << ".txt";
	f.open(filename.str());

	//MF header
	f << "PERIOD: " << utcToUtcDtString(minStart, "yyyymmdd") << " - " << utcToUtcDtString(maxEnd, "yyyymmdd") << "\n";
	f << "PLAN TYPE : DATED\n";
	f << "TIME MODE : UTC\n";
	f << "FILE COMMENT : \"XXXX\"\n";

	//Pairings
	f << "SECTION: PAIRING\n";
	for (std::size_t i = 0; i < pairingOfScenario.size(); i++) {
		Pairing* p = pairingOfScenario[i];

		std::size_t segmentCount = 0;
		for (Duty * d : p->getDutyVec()) {
			segmentCount += d->getNumSegments();
		}

		for (std::size_t dutyI = 0; dutyI < p->getNumDuties(); dutyI++) {
			Duty * d = p->getDuty(dutyI);
		}

		//Pairing
		f << "PAIRING: " << segmentCount << " "
			<< p->getDbId() << " "
			<< "\"" << (p->getLabel() == "" ? "-" : p->getLabel()) << "\" "
			<< "1/0/0/0/0/0/0/0" << " "
			<< p->getBase()
			<< "\n";

		for (std::size_t dutyI = 0; dutyI < p->getNumDuties(); dutyI++) {
			Duty * d = p->getDuty(dutyI);

			//记录duty内每个航班号第一次出现日期
			map<string, int> fltNumIndexInPairing;
			map<string, time_t> fltNumFirstDayMap;
			for (std::size_t segI = 0; segI < d->getNumSegments(); segI++) {
				Segment * s = d->getSegment(segI);
				time_t startTime = getItemTime(s, type == "utc" ? startUtcType : startLocType, outputTmZoneHour);
				bool isBus = (s->getAssignment() == "BUS" || s->getAssignment() == "RAIL");
				string fltNumStr = s->getSegNumber();
				string fltNum = isBus ? fltNumStr : getStartNumberFromStr(fltNumStr);
				time_t startDate = getStartTimeOfDay(startTime);
				if (fltNumFirstDayMap.find(fltNum) == fltNumFirstDayMap.end()) {
					fltNumFirstDayMap[fltNum] = startDate;
					fltNumIndexInPairing[fltNum] = 0;
				}
			}

			for (std::size_t segI = 0; segI < d->getNumSegments(); segI++) {

				//Segment
				Segment * s = d->getSegment(segI);
				bool isBus = (s->getAssignment() == "BUS" || s->getAssignment() == "RAIL");
				string fltNumStr = s->getSegNumber();
				string fltNum = isBus ? fltNumStr : getStartNumberFromStr(fltNumStr);
				string fltNumSuffix = fltNumStr.substr(fltNum.length());

				time_t startTime = getItemTime(s, type == "utc" ? startUtcType : startLocType, outputTmZoneHour);
				time_t endTime = getItemTime(s, type == "utc" ? endUtcType : endLocType, outputTmZoneHour);

				f << (isBus ? "T" : "F");
				f << " " << (isBus ? "*" : (s->getIsOperating() ? "L" : "D"));  //BUS -> *, IsOperation -> L, DHD -> D
				f << " " << utcToUtcDtString(startTime, "yyyymmdd");
				f << " " << s->getDepStation();
				f << " " << utcToUtcHHMM(startTime);
				f << " " << (isBus ? "*" : fltNum); //FltNum, bus -> '*'
				f << " " << (fltNumSuffix == "" ? "*" : fltNumSuffix);        //8081G -> G
				f << " " << (isBus ? 1 : (++fltNumIndexInPairing[fltNum]));
				f << " " << utcToUtcHHMM(endTime);
				f << " " << s->getArrStation();
				f << " " << utcToUtcDtString(endTime, "yyyymmdd");

				if (!isBus && getStartTimeOfDay(startTime) != fltNumFirstDayMap[fltNum]) {
					int dayOffset = static_cast<int>(getStartTimeOfDay(endTime) - fltNumFirstDayMap[fltNum]) / (24 * 3600);
					f << " DAYS_OFFSET(" << dayOffset << ")";
				}
				f << "\n";
			}
		}
		f << "EOPAIRING\n";
	}
	f << "EOSECTION\n";

	if (f.is_open())
		f.close();
	printf("%5d  exportPairing end\n", static_cast<int>(time(0) % 3600));
	if (ret != 0) {
		printf("ERROR: %d\n", ret);
	}
	return ret;
}
//按zh格式从dbData导出pairing
int exportPairingZhToFile(SharedPtr<CrewDataContext> dbData, string type, int outputTmZoneHour, string delim) {

	int i = 0;
	int ret = 0;
	vector<Pairing*> pairingOfScenario;
	stringstream ss;
	stringstream filename;
	ofstream f;
	pairingOfScenario = dbData->pairingList;

	//output file
	filename << "export_pairing_" << dbData->scenarioId << ".txt";
	f.open(filename.str());

	//Pairings
	for (std::size_t i = 0; i < pairingOfScenario.size(); i++) {
		Pairing* p = pairingOfScenario[i];

		//matnis#2244, pairing dhd数
		int dhdCount = 0;
		stringstream nightLocations;
		for (std::size_t dutyI = 0; dutyI < p->getNumDuties(); dutyI++) {
			Duty * d = p->getDuty(dutyI);
			if (dutyI < p->getNumDuties() - 1) {
				if (dutyI > 0)
					nightLocations << "#";
				nightLocations << d->getArrStation();
			}
			for (std::size_t segI = 0; segI < d->getNumSegments(); segI++) {
				Segment * s = d->getSegment(segI);
				//20180528 ain, mantis#2944, 补齐seg DHD/BUS判断条件
				if (s->isBusFerry() ||  s->isTrainFerry() || s->isDeadhead() )
					dhdCount++;
			}
		}

		//matnis#2244, pairing天数
		int pairingDays = static_cast<int>(getStartTimeOfDay(p->getEndTime()) - getStartTimeOfDay(p->getStartTime())) / (24 * 3600) + 1;

		//Pairing
		//mantis#2244, 增加pairing信息
		//int pairingBlkMinutes = p->getBlk()[0] * 60 + p->getBlk()[1];
		f << "PAIRING" << delim << (i + 1)
			//<< " (" << p->getDbId() << ")"      ///TEST
			<< delim << pairingDays               //天数: pairing.end - pairing.start
			<< "/" << (p->getFDPInSec() / 60)   //FDP
			<< "/" << (p->getBLKInSec() / 60)   //BLK
			<< "/" << dhdCount                  //count(dhd)
			<< "/" << (p->getNumDuties() - 1)   //过夜数: count(duty) - 1
			<< "/" << nightLocations.str()      //PEK#SHA#SZX#...
			<< "\n";
		for (std::size_t dutyI = 0; dutyI < p->getNumDuties(); dutyI++) {
			Duty * d = p->getDuty(dutyI);
			//mantis#2244, 增加duty信息
			//mantis#2359, 增加duty.fdp
			f << "DUTY"
				<< delim << (dutyI + 1)
				<< delim << d->getDepStation()
				<< delim << d->getArrStation()
				<< delim << (d->getFDPInSecs() / 60);
			if (dutyI > 0) {
				//第二个duty开始打印rest, 与fdp斜线分隔, 如 fdp/rest --> 540/600
				f << '/' << ((d->getStartTimeUtcSch() - p->getDuty(dutyI - 1)->getEndTimeUtcSch()) / 60);
			}
			f << "\n";

			for (int segI = 0; segI < (int)d->getNumSegments(); segI++) {

				//Segment
				Segment * s = d->getSegment(segI);
				bool isBus = (s->getAssignment() == "BUS" || s->getAssignment() == "RAIL");
				string fltNumStr = s->getSegNumber();
				string fltNum = isBus ? "0000" : getStartNumberFromStr(fltNumStr); //mantis#2197, BUS --> '0000'
				//string fltNumSuffix = fltNumStr.substr(fltNum.length());
				if (isEndsWith(fltNum, "D") || isEndsWith(fltNum, "d")) {
					fltNum = fltNum.substr(0, fltNum.length() - 1);
				}

				string assignmentType = "";
				if (s->getAssignment() == "FLY")
					assignmentType = "F";
				else if (s->getAssignment() == "DHD")
					assignmentType = "D";
				else
					assignmentType = "T";


				f << assignmentType;
				f << delim << utcToUtcDtString(getItemTime(s, type == "utc" ? startUtcType : startLocType, outputTmZoneHour), "yyyymmdd");
				f << delim << s->getDepStation();
				f << delim << utcToUtcHHMM(getItemTime(s, type == "utc" ? startUtcType : startLocType, outputTmZoneHour));
				f << delim << fltNum;
				f << delim << utcToUtcHHMM(getItemTime(s, type == "utc" ? endUtcType : endLocType, outputTmZoneHour));
				f << delim << s->getArrStation();
				f << delim << utcToUtcDtString(getItemTime(s, type == "utc" ? endUtcType : endLocType, outputTmZoneHour), "yyyymmdd");
				//衔接标识
				if (segI < (int)d->getNumSegments() - 1) {
					Segment * next = d->getSegment(segI + 1);
					if (s->isBusFerry() || next->isBusFerry() || s->isDeadhead() || next->isDeadhead()
						|| s->getNextLegNo() != next->getSegNumber()) {
						f << " CP " << ((next->getStartTimeUtcSch() - s->getEndTimeUtcSch()) / 60);
					}
				}
				f << "\n";
			}
		}
		f << "ENDPAIRING\n";
	}

	if (f.is_open())
		f.close();
	printf("%5d  exportPairing end\n", static_cast<int>(time(0) % 3600));
	if (ret != 0) {
		printf("ERROR: %d\n", ret);
	}
	return ret;
}

//按PO 结果质量检查工具格式导出pairing 结果，针对PO法规检查工具格式
int RuleTool::exportPairing(long long scenarioId, string type, int outputTmZone) {
	int ret = 0;
	ret = this->dbData->loadData(scenarioId);
	if (ret != 0) {
		return ret;
	}
	ret = exportPairingToFile(dbData, type, outputTmZone);
	return ret;
}
//从csv文件读取场景数据，按默认格式导出pairing
int RuleTool::exportPairing(char* filepath, string type, int outputTmZone) {
	int ret = 0;
	ret = this->dbData->loadDataCsv(filepath);
	if (ret != 0) {
		return ret;
	}
	ret = exportPairingToFile(dbData, type, outputTmZone);
	return ret;
}
//从csv文件读取场景数据，按mf格式导出pairing
int RuleTool::exportPairingMF(char* filepath, string utcOrLoc, int outputTmZone) {

	int ret = 0;
	ret = this->dbData->loadDataCsv(filepath);
	if (ret != 0) {
		return ret;
	}
	ret = exportPairingMfToFile(dbData, utcOrLoc, outputTmZone);
	return ret;
}
//从db读取场景数据，按mf格式导出pairing
int RuleTool::exportPairingMF(long long scenarioId, string utcOrLoc, int outputTmZone) {
	int ret = 0;
	ret  = this->dbData->loadData(scenarioId);
	if (ret != 0) {
		return ret;
	}
	ret = exportPairingMfToFile(dbData, utcOrLoc, outputTmZone);
	return ret;
}
//从db读取场景数据，按zh格式导出pairing
int RuleTool::exportPairingZH(long long scenarioId, string utcOrLoc, int outputTimeZoneHour, string delim) {
	int ret = 0;
	ret = this->dbData->loadData(scenarioId);
	if (ret != 0) {
		return ret;
	}
	ret = exportPairingZhToFile(dbData, utcOrLoc, outputTimeZoneHour, delim);
	return ret;
}
//从csv文件读取场景数据，按zh格式导出pairing
int RuleTool::exportPairingZH(char* filepath, string utcOrLoc, int outputTimeZoneHour, string delim) {
	int ret = 0;
	ret = this->dbData->loadDataCsv(filepath);
	if (ret != 0) {
		return ret;
	}
	ret = exportPairingZhToFile(dbData, utcOrLoc, outputTimeZoneHour, delim);
	return ret;
}

