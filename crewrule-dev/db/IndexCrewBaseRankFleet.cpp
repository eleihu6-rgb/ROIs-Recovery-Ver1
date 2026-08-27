#include <sstream>
#include "UtilFunc.h"
#include "IndexCrewBaseRankFleet.h"
#include "Log/Logger.h"

#ifdef __unix
#include <memory.h>
#endif

//int IndexCrewBaseRankFleetDayItemConfig::maxBitIndex = 0;
//map<string, shared_ptr<map<string, int>>> IndexCrewBaseRankFleetDayItemConfig::valueBitOffset;
std::unordered_map<string, int> IndexCrewBaseRankFleet::airportUtcOffsetMap;

//init valueBitOffset
void IndexCrewBaseRankFleetDayItemConfig::init(string& type, vector<string>& valueList) {
	if (valueBitOffset.find(type) != valueBitOffset.end()) {
		Logger::getRuleLogger()->warn("WARN: init IndexCrewBaseRankFleetDayItem fail, already inited '{}'", type.c_str());
	}
	else {
	    std::ostringstream oss;
		valueBitOffset.insert(make_pair(type, shared_ptr<map<string, int>>(new map<string, int>)));
		for (string& v : valueList) {
			valueBitOffset[type]->insert(make_pair(v, maxBitIndex++));
			oss <<" " << v;
		}
		Logger::getRuleLogger()->info("Index {}={}", type.c_str(), oss.str());
	}
}

IndexCrewBaseRankFleetDayItem::IndexCrewBaseRankFleetDayItem(shared_ptr<IndexCrewBaseRankFleetDayItemConfig>& config) {
	this->config = config;
	if (config->valueBitOffset.empty()) {
		Logger::getRuleLogger()->error("contructing IndexCrewBaseRankFleetDayItem fail, must init first");
		return;
	}
	//根据bitSize计算所需 byte buf长度，按8取整
	int bitSize = config->maxBitIndex;
	bufsize = bitSize / 8 + (bitSize % 8 == 0 ? 0 : bitSize % 8);
	buf = new unsigned char[bufsize];
	memset(buf, 0, bufsize);
}

IndexCrewBaseRankFleetDayItem::~IndexCrewBaseRankFleetDayItem() {
	delete[] buf;
	buf = NULL;
	bufsize = 0;
}
void IndexCrewBaseRankFleetDayItem::setValue(string& type, string& v) {
	if (config->valueBitOffset.find(type) == config->valueBitOffset.end()) {
		Logger::getRuleLogger()->error("invalid param, IndexCrewBaseRankFleetDayItem do not contain type '{}'", type);
		return;
	}
	if (config->valueBitOffset[type]->find(v) == config->valueBitOffset[type]->end()) {
		Logger::getRuleLogger()->error("invalid param, IndexCrewBaseRankFleetDayItem do not contain value '{}'", v);
		return;
	}
	int bitOffset = config->valueBitOffset[type]->at(v);
	int byteOffset = bitOffset / 8;
	int bitOffsetInByte = bitOffset % 8;
	buf[byteOffset] |= (1 << bitOffsetInByte);

	//记录当日base
	if (type == "base")
		this->base = v;
}
bool IndexCrewBaseRankFleetDayItem::hasValue(string& type, string& v) {
	if (config->valueBitOffset.find(type) == config->valueBitOffset.end()) {
		Logger::getRuleLogger()->error("invalid param, IndexCrewBaseRankFleetDayItem do not contain type '{}'", type);
		return false;
	}
	if (config->valueBitOffset[type]->find(v) == config->valueBitOffset[type]->end()) {
		Logger::getRuleLogger()->error("invalid param, IndexCrewBaseRankFleetDayItem do not contain value '{}'", v);
		return false;
	}
	int bitOffset = config->valueBitOffset[type]->at(v);
	int byteOffset = bitOffset / 8;
	int bitOffsetInByte = bitOffset % 8;
	if (buf[byteOffset] & (1 << bitOffsetInByte)) {
		return true;
	}
	else {
		return false;
	}
}
string& IndexCrewBaseRankFleetDayItem::getBase() {
	return base;
}
map<string, shared_ptr<map<string, int>>>& IndexCrewBaseRankFleetDayItem::getValueBitOffset() {
	return config->valueBitOffset;
}



IndexCrewBaseRankFleet::IndexCrewBaseRankFleet(time_t startDtLoc, time_t endDtLoc, shared_ptr<IndexCrewBaseRankFleetDayItemConfig>& config) {
	this->indexStartDtLoc = getStartTimeOfDay(startDtLoc);
	int days = 1 + static_cast<int>(endDtLoc - this->indexStartDtLoc) / (24 * 3600);
	for (int i = 0; i < days; i++) {
		dateIndexList.push_back(new IndexCrewBaseRankFleetDayItem(config));
	}
}
IndexCrewBaseRankFleet::~IndexCrewBaseRankFleet() {
	for (std::size_t i = 0; i < dateIndexList.size(); i++)
		delete dateIndexList[i];
}

void IndexCrewBaseRankFleet::init(unordered_map<string, int>& airportUtcOffsetMap) {
	IndexCrewBaseRankFleet::airportUtcOffsetMap.insert(airportUtcOffsetMap.begin(), airportUtcOffsetMap.end());
}
//void IndexCrewBaseRankFleet::init(string& type, vector<string>& valueList) {
//	IndexCrewBaseRankFleetDayItem::init(type, valueList);
//}
void IndexCrewBaseRankFleet::addIndexValue(string& type, string& value, time_t startDtLoc, time_t endDtLoc) {
	int startIndex = static_cast<int>(startDtLoc - this->indexStartDtLoc) / (24 * 3600);
	int endIndex = static_cast<int>(endDtLoc - this->indexStartDtLoc) / (24 * 3600);
	if (startIndex < 0) {
		startIndex = 0;
	}
	if (endIndex >= (int)dateIndexList.size()) {
		endIndex = (int)dateIndexList.size() - 1;
	}
	for (int i = startIndex; i <= endIndex; i++) {
		dateIndexList[i]->setValue(type, value);

	}
}
bool IndexCrewBaseRankFleet::isValueExistOnLocal(string& type, string& value, time_t loc) {
	int dateIndex = static_cast<int>(loc - this->indexStartDtLoc) / (24 * 3600);
	if (dateIndex < 0 || dateIndex >= (int)dateIndexList.size()) {
		Logger::getRuleLogger()->error("invalid param, isValueExistOnLocal() param date={} out of range", utcToUtcString(loc));
		return false;
	}
	return dateIndexList[dateIndex]->hasValue(type, value);
}
bool IndexCrewBaseRankFleet::isValueExistOnUtc(string& type, string& value, time_t utc) {
	//1)根据utc确定当日base
	//2)根据base确定utc对应local
	//3)根据local找到dateIndex
	//1
	int dateIndex = static_cast<int>(utc - this->indexStartDtLoc) / (24 * 3600);
	if (dateIndex < 0 || dateIndex >= (int)dateIndexList.size()) {
		Logger::getRuleLogger()->error("invalid param, isValueExistOnLocal() param date={} out of range", utcToUtcString(utc));
		return false;
	}
	IndexCrewBaseRankFleetDayItem * day = this->dateIndexList[dateIndex];
	if (airportUtcOffsetMap.find(day->getBase()) == airportUtcOffsetMap.end()){
		Logger::getRuleLogger()->error("invalid data, base={} not found in utc offset map", day->getBase());
		return false;
	}
	//2
	time_t loc = utc + 3600 * airportUtcOffsetMap[day->getBase()];
	dateIndex = static_cast<int>(loc - this->indexStartDtLoc) / (24 * 3600);
	//3
	return dateIndexList[dateIndex]->hasValue(type, value);
}
//检查指定日期loc是否具有指定base资格
//loc: 日期, 本地时间描述, 按eff_dt/exp_dt判断
bool IndexCrewBaseRankFleet::isBaseValueExistByLocal(string& value, time_t loc) {
	string type = "base";
	return isValueExistOnLocal(type, value, loc);
}
//检查指定日期loc是否具有指定rank资格
//loc: 日期, 本地时间描述, 按eff_dt/exp_dt判断
bool IndexCrewBaseRankFleet::isRankValueExistByLocal(string& value, time_t loc) {
	string type = "rank";
	return isValueExistOnLocal(type, value, loc);
}
//检查指定日期loc是否具有指定fleet资格
//loc: 日期, 本地时间描述, 按eff_dt/exp_dt判断
bool IndexCrewBaseRankFleet::isFleetValueExistByLocal(string& value, time_t loc) {
	string type = "fleet";
	return isValueExistOnLocal(type, value, loc);
}
//检查指定日期loc是否具有指定qual资格
//loc: 日期, 本地时间描述, 按issued_dt/expiry_dt判断
bool IndexCrewBaseRankFleet::isQualValueExistByLocal(string& value, time_t loc) {
	string type = "qual";
	return isValueExistOnLocal(type, value, loc);
}

//检查指定日期utc是否具有指定base资格
//utc: 日期, 本地时间描述, 按eff_dt/exp_dt判断
bool IndexCrewBaseRankFleet::isBaseValueExistByUtc(string& value, time_t utc) {
	string type = "base";
	return isValueExistOnUtc(type, value, utc);
}
//检查指定日期utc是否具有指定rank资格
//utc: 日期, 本地时间描述, 按eff_dt/exp_dt判断
bool IndexCrewBaseRankFleet::isRankValueExistByUtc(string& value, time_t utc) {
	string type = "rank";
	return isValueExistOnUtc(type, value, utc);
}
//检查指定日期utc是否具有指定fleet资格
//utc: 日期, 本地时间描述, 按eff_dt/exp_dt判断
bool IndexCrewBaseRankFleet::isFleetValueExistByUtc(string& value, time_t utc) {
	string type = "fleet";
	return isValueExistOnUtc(type, value, utc);
}
//检查指定日期utc是否具有指定qual资格
//utc: 日期, 本地时间描述, 按issued_dt/expiry_dt判断
bool IndexCrewBaseRankFleet::isQualValueExistByUtc(string& value, time_t utc) {
	string type = "qual";
	return isValueExistOnUtc(type, value, utc);
}

void IndexCrewBaseRankFleet::printLog() {
	for (std::size_t i = 0; i < dateIndexList.size(); i++) {
		char dtStr[40] = { 0 };
		utcToUtcStr(this->indexStartDtLoc + i * 24 * 3600, dtStr, sizeof(dtStr) - 1);
		std::ostringstream oss;
		for (auto& it : dateIndexList[i]->getValueBitOffset()) {
			string type = it.first;

			for (auto& item : (*it.second.get())) {
				string value = item.first;
				if (dateIndexList[i]->hasValue(type, value)) {
					oss <<" " << value.c_str();
				}
			}
		}
		Logger::getRuleLogger()->info("index {} {}", dtStr, oss.str());
	}
}