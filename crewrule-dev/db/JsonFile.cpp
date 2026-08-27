#include <stdio.h>
#include <vector>
#include <algorithm>

#include <memory>
#include <iostream>
#include <time.h>
#include "Pairing.h"
#include "Duty.h"
#include "Segment.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "TestDBFunc.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

#include "JsonParser/JsonParser.h"
#include "JsonParser/SegmentJson.h"
#include "JsonParser/DBRuleJson.h"
#include "JsonParser/DBCqfJson.h"

using namespace std;

void saveSegmentToJson(vector<Segment>& segList, const char * filepath) {
	vector<void*> list;
	SegmentJson interfaceInstance;
	JsonParser parser(&interfaceInstance);

	for (std::size_t i = 0; i < segList.size(); i++) {
		list.push_back(&segList[i]);
	}

	// 写回json
	parser.writeJson(list, filepath);
	if (!parser.isSuccess()) {
		Logger::getRuleLogger()->error("{}    ERROR: Write Json File failed {}, errorCode={}  errorMsg={} ", (int)time(0) % 3600, filepath, parser.getErrorCode(), parser.getErrorMsg().c_str());
	}
	else {
		Logger::getRuleLogger()->info("{}    Write Json File success {}", (int)time(0) % 3600, filepath);
	}

}

void saveSegmentToJson(vector<Segment*>& segList, const char * filepath) {
	vector<void*> list;
	SegmentJson interfaceInstance;
	JsonParser parser(&interfaceInstance);

	for (std::size_t i = 0; i < segList.size(); i++) {
		list.push_back(segList[i]);
	}

	// 写回json
	parser.writeJson(list, filepath);
	if (!parser.isSuccess()) {
		Logger::getRuleLogger()->error("{}    ERROR: Write Json File failed {}, errorCode={}  errorMsg={} ", (int)time(0) % 3600, filepath, parser.getErrorCode(), parser.getErrorMsg().c_str());
	}
	else {
		Logger::getRuleLogger()->info("{}    Write Json File success {}", (int)time(0) % 3600, filepath);
	}

}

void saveRuleToJson(vector<DBRule>& ruleList, const char * filepath) {
	vector<void*> list;
	DBRuleJson interfaceInstance;
	JsonParser parser(&interfaceInstance);
	for (std::size_t i = 0; i < ruleList.size(); i++) {
		list.push_back(&ruleList[i]);
	}

	// 写回json
	parser.writeJson(list, filepath);
	if (!parser.isSuccess()) {
		Logger::getRuleLogger()->error("{}    ERROR: Write Json File failed {}, errorCode={}  errorMsg={} ", (int)time(0) % 3600, filepath, parser.getErrorCode(), parser.getErrorMsg().c_str());
	}
	else {
		Logger::getRuleLogger()->info("{}    Write Json File success {}", (int)time(0) % 3600, filepath);
	}
}


void saveCqfToJson(vector<DBCqf>& cqfList, const char * filepath) {
	vector<void*> list;
	DBCqfJson interfaceInstance;
	JsonParser parser(&interfaceInstance);
	for (std::size_t i = 0; i < cqfList.size(); i++) {
		list.push_back(&cqfList[i]);
	}

	// 写回json
	parser.writeJson(list, filepath);
	if (!parser.isSuccess()) {
		Logger::getRuleLogger()->error("{}    ERROR: Write Json File failed {}, errorCode={}  errorMsg={} ", (int)time(0) % 3600, filepath, parser.getErrorCode(), parser.getErrorMsg().c_str());
	}
	else {
		Logger::getRuleLogger()->info("{}    Write Json File success {}", (int)time(0) % 3600, filepath);
	}
}


bool loadSegmentFromJson(vector<Segment*>& segList, const char * filepath) {
	bool ret = false;
	vector<void*> list;
	SegmentJson interfaceInstance;
	JsonParser parser(&interfaceInstance);

	// 读取json
	parser.readJson(filepath, list);
	if (!parser.isSuccess()) {
		Logger::getRuleLogger()->error("{}    ERROR: Write Json File failed {}, errorCode={}  errorMsg={} ", (int)time(0) % 3600, filepath, parser.getErrorCode(), parser.getErrorMsg().c_str());
		ret = false;
	}
	else {
		Logger::getRuleLogger()->info("{}    Write Json File success {}", (int)time(0) % 3600, filepath);
		ret = true;
	}

	// 填充返回列表
	for (std::size_t i = 0; i < list.size(); i++) {
		Segment * item = (Segment*)list[i];
		segList.push_back(item);
	}
	return ret;
}

bool loadSegmentFromJson(vector<Segment>& segList, const char * filepath) {
	bool ret = false;
	vector<void*> list;
	SegmentJson interfaceInstance;
	JsonParser parser(&interfaceInstance);

	// 读取json
	parser.readJson(filepath, list);
	if (!parser.isSuccess()) {
		Logger::getRuleLogger()->error("{}    ERROR: Write Json File failed {}, errorCode={}  errorMsg={} ", (int)time(0) % 3600, filepath, parser.getErrorCode(), parser.getErrorMsg().c_str());
		ret = false;
	}
	else {
		Logger::getRuleLogger()->info("{}    Write Json File success {}", (int)time(0) % 3600, filepath);
		ret = true;
	}

	// 填充返回列表
	for (std::size_t i = 0; i < list.size(); i++) {
		Segment * item = (Segment*)list[i];
		segList.push_back(*item);
	}

	// 释放临时对象
	for (std::size_t i = 0; i < list.size(); i++) {
		delete list[i];
	}
	return ret;
}

bool loadRuleFromJson(vector<DBRule>& ruleList, const char * filepath) {
	bool ret = false;
	vector<void*> list;
	DBRuleJson interfaceInstance;
	JsonParser parser(&interfaceInstance);

	// 读取json
	parser.readJson(filepath, list);
	if (!parser.isSuccess()) {
		Logger::getRuleLogger()->error("{}    ERROR: Write Json File failed {}, errorCode={}  errorMsg={} ", (int)time(0) % 3600, filepath, parser.getErrorCode(), parser.getErrorMsg().c_str());
		ret = false;
	}
	else {
		Logger::getRuleLogger()->info("{}    Write Json File success {}", (int)time(0) % 3600, filepath);
		ret = true;
	}

	// 填充返回列表
	for (std::size_t i = 0; i < list.size(); i++) {
		DBRule * item = (DBRule*)list[i];
		ruleList.push_back(*item);
	}

	// 释放临时对象
	for (std::size_t i = 0; i < list.size(); i++) {
		delete list[i];
	}
	return ret;
}

bool loadCqfFromJson(vector<DBCqf>& cqfList, const char * filepath) {
	bool ret = false;
	vector<void*> list;
	DBCqfJson interfaceInstance;
	JsonParser parser(&interfaceInstance);

	// 读取json
	parser.readJson(filepath, list);
	if (!parser.isSuccess()) {
		Logger::getRuleLogger()->error("{}    ERROR: Write Json File failed {}, errorCode={}  errorMsg={} ", (int)time(0) % 3600, filepath, parser.getErrorCode(), parser.getErrorMsg().c_str());
		ret = false;
	}
	else {
		Logger::getRuleLogger()->info("{}    Write Json File success {}", (int)time(0) % 3600, filepath);
		ret = true;
	}

	// 填充返回列表
	for (std::size_t i = 0; i < list.size(); i++) {
		DBCqf * c = (DBCqf*)list[i];
		DBCqf cqf = *c;
		cqfList.push_back(cqf);
	}

	// 释放临时对象
	for (std::size_t i = 0; i < list.size(); i++) {
		delete list[i];
	}
	return ret;
}