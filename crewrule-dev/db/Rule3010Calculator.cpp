#include "time.h"
#include "Rule3010Calculator.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

#ifdef __unix
#include <algorithm>
#endif

string parseRuleParamValue(map<string, string>& param, string name) {
	string value;
	if (param.find(name) != param.end()) {
		value = param[name];
	}
	else if (param.find(strToUpper(name)) != param.end()) {
		value = param[strToUpper(name)];
	}
	else{
		Logger::getRuleLogger()->error("invalid data, '{}' not found in rule_param 3010", name);
	}
	return value;
}

//str "12:20" -> int 1220
//throw except on error
int parseRule3010HHmmToInt(map<string, string>& param, string name) {
	string value = parseRuleParamValue(param, name);
	int tmp = hhmmStrToHHmmInt(value);
	if (tmp == -1) {
		Logger::getRuleLogger()->error("invalid data, '{}'={} in rule_param 3010", name, value);
	}
	return tmp;
}

//str "12:20" -> int 12 * 60 + 30 = 780
//throw except on error
int parseRule3010HHmmToMinutes(map<string, string>& param, string name) {
	string value = parseRuleParamValue(param, name);
	int tmp = hhmmToMinutes(value.c_str());
	if (tmp == -1) {
		Logger::getRuleLogger()->error("invalid data, '{}'={} in rule_param 3010", name, value);
	}
	return tmp;

}
//init
Rule3010::Rule3010(long long ruleId, vector<map<string, string>>& ruleParamRows) {
	init(ruleId, ruleParamRows);
}

Rule3010::Rule3010(){}

void Rule3010::init(long long ruleId, vector<map<string, string>>& ruleParamRows){
	this->ruleId = ruleId;
	for (auto& param : ruleParamRows) {
		Rule3010Item item;
		item.airport = parseRuleParamValue(param, "Airport");
		item.dutyStartLocRangeBeginHHmm = parseRule3010HHmmToInt(param, "DepStart");
		string fltNumber = parseRuleParamValue(param, "FLT NUMS");
		split(fltNumber, '|', item.fltNumbers);
		item.dutyEndLocRangeBeginHHmm = parseRule3010HHmmToInt(param, "DepEnd");
		item.dutyType = parseRuleParamValue(param, "Duty Type");
		item.flyBriefMinutes = parseRule3010HHmmToMinutes(param, "Fly Brief");
		item.flyDebriefMinutes = parseRule3010HHmmToMinutes(param, "Fly Debrief");
		item.dhdBriefMinutes = parseRule3010HHmmToMinutes(param, "DHD Brief");
		item.dhdDebriefMinutes = parseRule3010HHmmToMinutes(param, "DHD Debrief");
		item.trainBriefMinutes = parseRule3010HHmmToMinutes(param, "TRAIN Brief");
		item.trainDebriefMinutes = parseRule3010HHmmToMinutes(param, "TRAIN Debrief");
		item.otherBriefMinutes = parseRule3010HHmmToMinutes(param, "Other Brief");
		item.otherDebriefMinutes = parseRule3010HHmmToMinutes(param, "Other Debrief");
		item.pickupMinutes = parseRule3010HHmmToMinutes(param, "Pick Up");
		item.dropMinutes = parseRule3010HHmmToMinutes(param, "Drop Off");

		if (airportMap.find(item.airport) == airportMap.end()) {
			airportMap.insert(make_pair(item.airport, vector<Rule3010Item>()));
		}
		airportMap[item.airport].push_back(item);
	}
}

//find rule3010 item match duty
//根据startAirport/startLocal/dutyType/firstSegment匹配 brief/pickup
//根据endAirport/startLocal/dutyType/lastSegment匹配 debrief/dropoff
Rule3010Result Rule3010::findMatch(string firstSegmentFltNumber, string startAirport, string endAirport, time_t dutyStartLoc, string& region, string firstSegmentAssignment, string lastSegmentAssignment) {

	if (airportMap.find(startAirport) == airportMap.end() && airportMap.find("*") == airportMap.end()) {
		for (auto& it : airportMap) {
			Logger::getRuleLogger()->info("rule 3010 airport={} size={}", it.first.c_str(), it.second.size());
		}
		Logger::getRuleLogger()->error("duty.startAirport={} not match rule3010", startAirport);
		throw "duty.startAirport=" + startAirport + " not match rule3010";
	}
	if (airportMap.find(endAirport) == airportMap.end() && airportMap.find("*") == airportMap.end()) {
		for (auto& it : airportMap) {
			Logger::getRuleLogger()->info("rule 3010 airport={} size={}", it.first.c_str(), it.second.size());
		}
		Logger::getRuleLogger()->error("duty.endAirport={} not match rule3010", endAirport);
		throw "duty.endAirport=" + endAirport + " not match rule3010";
	}
	
	//根据 airport, dutyType, HHMM匹配
	Rule3010Item * startAirportItem = findMatchInternal(firstSegmentFltNumber,startAirport, dutyStartLoc, region);
	if (startAirportItem == NULL) {
		startAirportItem = findMatchInternal(firstSegmentFltNumber,"*", dutyStartLoc, region);
	}
	Rule3010Item * endAirportItem = findMatchInternal("*",endAirport, dutyStartLoc, region);
	if (endAirportItem == NULL) {
		endAirportItem = findMatchInternal("*","*", dutyStartLoc, region);
	}

	//若找到匹配ruleParam，则构造返回数据
	//否则抛出异常
	if (startAirportItem == NULL) {
		for (auto& paramItem : airportMap[startAirport]) {
			Logger::getRuleLogger()->error("ERROR: rule3010 airport={} {：04d} {：04d}", paramItem.airport.c_str(), paramItem.dutyStartLocRangeBeginHHmm, paramItem.dutyEndLocRangeBeginHHmm);
		}
		Logger::getRuleLogger()->error("no rule3010 found match duty.startAirport={} dutyStartLoc={} region={} firstSegment={}", startAirport, utcToUtcString(dutyStartLoc), region, firstSegmentAssignment);
		throw "no rule3010 found match duty.startAirport=" + startAirport + " dutyStartLoc=" + utcToUtcString(dutyStartLoc) + " region=" + region + " firstSegment=" + firstSegmentAssignment;
	}
	else if (endAirportItem == NULL) {

		for (auto& paramItem : airportMap[endAirport]) {
			Logger::getRuleLogger()->error("ERROR: rule3010 airport={} {：04d} {：04d}", paramItem.airport.c_str(), paramItem.dutyStartLocRangeBeginHHmm, paramItem.dutyEndLocRangeBeginHHmm);
		}
		Logger::getRuleLogger()->error("no rule3010 found match duty.endAirport={} dutyStartLoc={} region={} firstSegment={}", endAirport, utcToUtcString(dutyStartLoc), region, firstSegmentAssignment);
		throw "no rule3010 found match duty.endAirport=" + endAirport + " dutyStartLoc=" + utcToUtcString(dutyStartLoc) + " region=" + region + " firstSegment=" + firstSegmentAssignment;	
	}
	else {
		Rule3010Result result;
		//first segment
		if (firstSegmentAssignment == "FLY") {
			result.briefMinutes = startAirportItem->flyBriefMinutes;
		}
		else if (firstSegmentAssignment == "DHD") {
			result.briefMinutes = startAirportItem->dhdBriefMinutes;
		}
		else if (firstSegmentAssignment == "TRAIN") {
			result.briefMinutes = startAirportItem->trainBriefMinutes;
		}
		else {
			result.briefMinutes = startAirportItem->otherBriefMinutes;
		}
		//last segment
		if (lastSegmentAssignment == "FLY") {
			result.debriefMinutes = endAirportItem->flyDebriefMinutes;
		}
		else if (lastSegmentAssignment == "DHD") {
			result.debriefMinutes = endAirportItem->dhdDebriefMinutes;
		}
		else if (firstSegmentAssignment == "TRAIN") {
			result.debriefMinutes = endAirportItem->trainDebriefMinutes;
		}
		else {
			result.debriefMinutes = endAirportItem->otherDebriefMinutes;
		}
		result.pickupMinutes = startAirportItem->pickupMinutes;
		result.dropMinutes = endAirportItem->dropMinutes;
		return result;
	}
}

Rule3010Item* Rule3010::findMatchInternal(string firstSegmentFltNumber, string dutyStartAirport, time_t dutyStartLoc, string region) {

	//duty.startLoc -> hhmm
	tm m = { 0 };
	//mantis#2125, 修正计算duty.segments.1st.startTime -> HHMM换时区问题

#ifdef _WIN32
	gmtime_s(&m, &dutyStartLoc);
#else
	gmtime_r(&dutyStartLoc, &m); //不换时区
#endif

	int startLocHHmm = m.tm_hour * 100 + m.tm_min;
	if (airportMap.find(dutyStartAirport) != airportMap.end()) {
		for (auto& paramItem : airportMap[dutyStartAirport]) {
			if (startLocHHmm < paramItem.dutyStartLocRangeBeginHHmm || startLocHHmm > paramItem.dutyEndLocRangeBeginHHmm) {
				continue;
			}
			if (paramItem.dutyType != "*" && region != paramItem.dutyType) {
				continue;
			}
			//endItem 传入参数firstSegmentFltNumber为 * 特判 不进行检查
			if (firstSegmentFltNumber != "*" && paramItem.fltNumbers[0] != "*" && find(paramItem.fltNumbers.begin(), paramItem.fltNumbers.end(), firstSegmentFltNumber) == paramItem.fltNumbers.end()){
				continue;
			}

			return &paramItem;
		}
	}
	return NULL;
}

void Rule3010::print() {
	for (auto& it : airportMap) {
		Logger::getRuleLogger()->info("airport={}", it.first.c_str());
		for (Rule3010Item& item : it.second) {
			Logger::getRuleLogger()->info("    '{}' '{}' {：04d} {：04d}", 
				item.airport.c_str(), item.dutyType.c_str(), item.dutyStartLocRangeBeginHHmm, item.dutyEndLocRangeBeginHHmm);
		}
	}
}