#include <stdio.h>
#include <vector>

#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "Log/Logger.h"
using namespace std;

#ifdef WIN32

#else
#define _snprintf snprintf
#endif

//从CQF列表提取 Special Port Resource Ctrl
map<string, int> createResourceCtrlMap(vector<DBRule> &cqfList, int funcId, time_t startUtc, time_t endUtc) {
	map<string, string>::iterator it;
	vector<int> dayOfWeekList;
	map<string, int> result;
	vector<DBRule*> list; //map<funcId, DBRule>
	time_t utc = 0;

	//参数检查
	switch (funcId) {
	case CQF_FUNC_AUG_RES_CTRL:
	case CQF_FUNC_EXPAT_RES_CTRL:
	case CQF_FUNC_ICAO_RES_CTRL:
	case CQF_FUNC_PORT_RES_CTRL:
		break;
	default:
		Logger::getRuleLogger()->error("ERROR: invalid param funcID {} for createResourceCtrlMap()", funcId);
		return result;
	}

	//计算场景中每一天是星期几，构建dayOfWeek列表
	utc = startUtc - 24 * 3600;
	do {
		utc += 24 * 3600;
		int wday = getWdayOfUtc(utc);
		dayOfWeekList.push_back(wday);
	} while (utc <= endUtc);

	for (std::size_t dt = 0; dt < dayOfWeekList.size(); dt++) {

		for (std::size_t i = 0; i < cqfList.size(); i++) {
			DBRule & cqf = cqfList[i];
			if (cqf.function != funcId) {
				continue;
			}

			for (it = cqf.params.begin(); it != cqf.params.end(); it++) {

				int    wday = dayOfWeekList[dt];
				char dtStrBuf[20] = { 0 };
				// For Linux
				sprintf(dtStrBuf, "%zd", dt);
				// For Windows
				//_itoa(dt, dtStrBuf, 10);
				string dtStr(dtStrBuf); //dt表示场景中第几天

				//Base,Rank,Fleet Group,Fleet,Airport,Default Head Counts Auto,Default Head Counts Manual,Utility Rate,Mon,Tue,Wed,Thu,Fri,Sat,Sun
				string base = cqf.params["Base"];
				string rank = cqf.params["Rank"];
				string fleetGrp = cqf.params["Fleet Group"];
				string fleet = cqf.params["Fleet"];
				string airport = cqf.params["Airport"];
				int defaultHeadCntAuto = atoi(cqf.params["Default Head Counts Auto"].c_str());
				int defaultHeadCntManual = atoi(cqf.params["Default Head Counts Manual"].c_str());
				double utilityRate = atof(cqf.params["Utility Rate"].c_str());

				int defaultHeadCnt = defaultHeadCntAuto;
				if (!cqf.params["Default Head Counts Manual"].empty()) {
					defaultHeadCnt = defaultHeadCntManual;
				}

				string mon = cqf.params["Mon"];
				string tue = cqf.params["Tue"];
				string wed = cqf.params["Wed"];
				string thu = cqf.params["Thu"];
				string fri = cqf.params["Fri"];
				string sat = cqf.params["Sat"];
				string sun = cqf.params["Sun"];
				int dayOfWeekValue[7] = { 0 };

				if (sun.length() > 0) dayOfWeekValue[0] = atoi(sun.c_str());//stoi(sun);
				if (mon.length() > 0) dayOfWeekValue[1] = atoi(mon.c_str());//stoi(mon);
				if (tue.length() > 0) dayOfWeekValue[2] = atoi(tue.c_str());//stoi(tue);
				if (wed.length() > 0) dayOfWeekValue[3] = atoi(wed.c_str());//stoi(wed);
				if (thu.length() > 0) dayOfWeekValue[4] = atoi(thu.c_str());//stoi(thu);
				if (fri.length() > 0) dayOfWeekValue[5] = atoi(fri.c_str());//stoi(fri);
				if (sat.length() > 0) dayOfWeekValue[6] = atoi(sat.c_str());//stoi(sat);

				//生成 key\ value对
				//举例   0:PEK:CA:738:SZX  ->  15,  表示 第0天，base为PEK，rank为CA，机队为738，目的机场SZX时，可用资源数15
				int value = defaultHeadCnt;                                         //默认使用 defaultHeadCount字段
				if (dayOfWeekValue[wday] > 0) {                                     //如果对应dayOfWeek有指定数值，使用指定数值*UtilityRate字段
					value = static_cast<int>(dayOfWeekValue[wday] * utilityRate);
				}
				string key = dtStr + ":" + base + ":" + rank + ":" + fleet + ":" + airport;
				result[key] = value;
			}
		}
	}

	return result;
}

//1. 从CQF列表中寻找func==6001，并根据其内容获取最长的历史时间长度，以月度记
//2. 遍历6001个条目，返回其中月数最大值，参数名称'Historical Period(0-12 Months)'
//3. 若 cqfList为空或个条目月数都为0，返回0
int getHistoryMonthCountFromCqf(vector<DBRule>& cqfList) {
	int maxHistoryMonth = 12; //OP#1179, 默认 12个月

	for (std::size_t i = 0; i < cqfList.size(); i++) {
		DBRule& item = cqfList[i];
		if (item.function == CQF_FUNC_ROSTER_FAIRNESS) {
			string mongthStr = item.params["Historical Period(0-12 Months)"];
			int month = atoi(mongthStr.c_str());
			if (month > maxHistoryMonth)
				maxHistoryMonth = month;
		}
	}
	return maxHistoryMonth;
}


//从4001 cqf定义计算总blh基地限制
//1 从flight航班表获取当前场景机型总blh
//2 根据4001中人头数，用于统计每种fleet下各base所占比例
//3 人头比例乘以总blh，即为总blh
void parseResourceCtrlBaseBlh(vector<ResourceCtrlBaseBlh>& result, double totalBLH, vector<DBRule> &cqfList, Scenario& scenario, time_t startUtc, time_t endUtc) {
	map<string, string>::iterator it;
	vector<int> dayOfWeekList;
	vector<DBRule*> list;            //map<funcId, DBRule>
	map<string, double>::iterator itHeadMap;
	map<string, double> headBaseFleetMap;   //map<base::fleet, headCnt>
	int totalHead = 0;
	time_t utc = 0;
	vector<string> bases;
	vector<string> fleetGrps;
	//Scenario scenario = getScenario(ctx, scenarioId);
	//if (ctx->errorCode != 0) {
	//	return result;
	//}
	bases = scenario.bases;
	fleetGrps = scenario.fleets;

	//总BLH
	long long scenarioId = scenario.scenarioId;

	//计算场景中每一天是星期几，构建dayOfWeek列表
	utc = startUtc - 24 * 3600;
	do {
		utc += 24 * 3600;
		int wday = getWdayOfUtc(utc);
		dayOfWeekList.push_back(wday);
	} while (utc <= endUtc);

	for (std::size_t dt = 0; dt < dayOfWeekList.size(); dt++) {

		for (std::size_t i = 0; i < cqfList.size(); i++) {
			DBRule & cqf = cqfList[i];
			if (cqf.function != CQF_FUNC_BASE_RES_CTRL) {
				continue;
			}

			//for (it = cqf.params.begin(); it != cqf.params.end(); it++) {

			int    wday = dayOfWeekList[dt];
			char dtStrBuf[20] = { 0 };

			//For Linux
			sprintf(dtStrBuf, "%zd", dt);
			//For Windows
			//_itoa(dt, dtStrBuf, 10);
			string dtStr(dtStrBuf); //dt表示场景中第几天

			//Base,Rank,Fleet Group,Fleet,Airport,Default Head Counts Auto,Default Head Counts Manual,Utility Rate,Mon,Tue,Wed,Thu,Fri,Sat,Sun
			string base = cqf.params["Base"];
			string rank = cqf.params["Rank"];
			string fleetGrp = cqf.params["Fleet Group"];
			string fleet = cqf.params["Fleet"];
			string airport = cqf.params["Airport"];

			//如果法规中某基地不在当前场景，则略过
			if (!isContains(bases, base))
				continue;
			if (!isContains(fleetGrps, fleetGrp))
				continue;

			int defaultHeadCntAuto = atoi(cqf.params["Default Head Counts Auto"].c_str());
			int defaultHeadCntManual = atoi(cqf.params["Default Head Counts Manual"].c_str());
			double utilityRate = atof(cqf.params["Utility Rate"].c_str());

			double defaultHeadCnt = defaultHeadCntAuto * utilityRate;
			if (!cqf.params["Default Head Counts Manual"].empty()) {
				defaultHeadCnt = defaultHeadCntManual * utilityRate;
			}

			string mon = cqf.params["Mon"];
			string tue = cqf.params["Tue"];
			string wed = cqf.params["Wed"];
			string thu = cqf.params["Thu"];
			string fri = cqf.params["Fri"];
			string sat = cqf.params["Sat"];
			string sun = cqf.params["Sun"];
			int dayOfWeekValue[7] = { 0 };

			if (sun.length() > 0) dayOfWeekValue[0] = atoi(sun.c_str());//stoi(sun);
			if (mon.length() > 0) dayOfWeekValue[1] = atoi(mon.c_str());//stoi(mon);
			if (tue.length() > 0) dayOfWeekValue[2] = atoi(tue.c_str());//stoi(tue);
			if (wed.length() > 0) dayOfWeekValue[3] = atoi(wed.c_str());//stoi(wed);
			if (thu.length() > 0) dayOfWeekValue[4] = atoi(thu.c_str());//stoi(thu);
			if (fri.length() > 0) dayOfWeekValue[5] = atoi(fri.c_str());//stoi(fri);
			if (sat.length() > 0) dayOfWeekValue[6] = atoi(sat.c_str());//stoi(sat);

			//生成 key\ value对
			//举例   0:PEK:CA:738:SZX  ->  15,  表示 第0天，base为PEK，rank为CA，机队为738，目的机场SZX时，可用资源数15
			int value = (int)defaultHeadCnt;                                         //默认使用 defaultHeadCount字段
			if (dayOfWeekValue[wday] > 0) {                                     //如果对应dayOfWeek有指定数值，使用指定数值*UtilityRate字段
				value = static_cast<int>(dayOfWeekValue[wday] * utilityRate);
			}
			string key = base + ":" + fleet + ":" + airport;

			//累计各个分布
			if (headBaseFleetMap.find(key) == headBaseFleetMap.end())
				headBaseFleetMap[key] = value;
			else
				headBaseFleetMap[key] = headBaseFleetMap[key] + value;

			//Logger::getRuleLogger()->info("value={}", headBaseFleetMap[key]);
			//累计总人头次
			totalHead += value;
			//}
		}
	}

	Logger::getRuleLogger()->info("totalHead={}", totalHead);
	for (itHeadMap = headBaseFleetMap.begin(); itHeadMap != headBaseFleetMap.end(); itHeadMap++) {
		string baseFleet = itHeadMap->first;
		int head = static_cast<int>(itHeadMap->second);
		Logger::getRuleLogger()->info("\t{}={} ({:.2f})  (blh={:.2f})", baseFleet.c_str(), head, (head / (double)totalHead), (head / (double)totalHead)*totalBLH);
	}

	//统计各个base
	for (itHeadMap = headBaseFleetMap.begin(); itHeadMap != headBaseFleetMap.end(); itHeadMap++) {
		ResourceCtrlBaseBlh item;
		string baseFleet = itHeadMap->first;
		int head = static_cast<int>(itHeadMap->second);
		vector<string> strList;
		split(baseFleet.c_str(), ':', strList);

		item.base = strList[0];
		item.fleet = strList[1];
		item.blhHour = totalBLH * (head / (double)totalHead);
		item.blhHourMin = item.blhHour * 0.95;
		item.blhHourMax = item.blhHour * 1.05;
		result.push_back(item);
	}
}


//按leadin中dhd修正 dailyDhdLimit
//修正值为 dailyDhdLimitByLeadin = (dailyDhdLimit * scenarioDays - dhdInLeadin)/scenarioDays;
void fixDhdLimitByLeadin(vector<DBRule>& cqList, int dhdInLeadin, time_t scenarioStartTime, time_t scenarioEndTime) {
	int rollingDays = 3;
	float scenarioDays = 1.0f * rollingDays + 1 + getDaysByDuration(scenarioStartTime, scenarioEndTime);
	bool found4003 = false;

	for (std::size_t i = 0; i < cqList.size(); i++) {
		if (cqList[i].function == 4003) {
			DBRule& cq = cqList[i];

			string dailyDhdLimitStr = cq.params["dailyDhdsLimit"];
			int dailyDhdLimit = atoi(dailyDhdLimitStr.c_str());
			float dailyDhdLimitByLeadin = (dailyDhdLimit * scenarioDays - dhdInLeadin) / scenarioDays;
			char dailyDhdsLimitByLeadinBuf[100] = { 0 };
			_snprintf(dailyDhdsLimitByLeadinBuf, sizeof(dailyDhdsLimitByLeadinBuf) - 1, "%f", dailyDhdLimitByLeadin);
			cq.params["dailyDhdsLimitByLeadin"] = dailyDhdsLimitByLeadinBuf;

			string dailyBlankDaysLimitStr = cq.params["dailyBlankDaysLimit"];
			int dailyBlankDaysLimit = atoi(dailyBlankDaysLimitStr.c_str());
			float dailyBlankDaysLimitByLeadin = (dailyBlankDaysLimit * scenarioDays - dhdInLeadin) / scenarioDays;
			char dailyBlankDaysLimitByLeadinBuf[100] = { 0 };
			_snprintf(dailyBlankDaysLimitByLeadinBuf, sizeof(dailyBlankDaysLimitByLeadinBuf) - 1, "%f", dailyBlankDaysLimitByLeadin);
			cq.params["dailyBlankDaysLimitByLeadin"] = dailyBlankDaysLimitByLeadinBuf;

			Logger::getRuleLogger()->info("rule 4003: dailyDhdLimit={}  -> dailyDhdLimitByLeadin={:.2f}", dailyDhdLimit, dailyDhdLimitByLeadin);
			found4003 = true;
		}
	}

	if (!found4003) {
		Logger::getRuleLogger()->info("rule 4003 not found in scenaior");
	}
}