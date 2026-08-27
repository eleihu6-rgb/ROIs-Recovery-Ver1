#include <sstream>
#include "FlightAttribute.h"
#include "Log/Logger.h"
using namespace std;

#if defined(__unix) || defined(__APPLE__)
    #include <memory.h>
    #define _snprintf snprintf
#endif

map<string, std::size_t> FlightAttribute::attrNameIndexMap;

FlightAttribute::FlightAttribute() {
	if (attrNameIndexMap.empty()) {
		//Logger::getRuleLogger()->error("Exception: FlightAttribute is NOT init");
	}
	std::size_t size = attrNameIndexMap.size() / 8;
	size = size == 0 ? 1 : size; //avoid malloc(0)
	if (attrNameIndexMap.size() % 8 != 0)
		size++;
	valueBuf = 0;
	//valueBuf = new unsigned char[size];
	valueBuf = (unsigned char*)malloc(size);
	memset(valueBuf, 0, size);
	//Logger::getRuleLogger()->info("new FlightAttribute   @0x{:08x}", valueBuf);
}

FlightAttribute::~FlightAttribute() {
	//Logger::getRuleLogger()->info("del FlightAttribute   @0x{:08x}", valueBuf);
	if (valueBuf)
		//delete[] valueBuf;
		free(valueBuf);
	valueBuf = 0;
}


FlightAttribute::FlightAttribute(const FlightAttribute& obj) {
	std::size_t size = attrNameIndexMap.size() / 8;
	if (attrNameIndexMap.size() % 8 != 0)
		size++;
	valueBuf = 0;
	//valueBuf = new unsigned char[size];
	valueBuf = (unsigned char*)malloc(size);
	memcpy(valueBuf, obj.valueBuf, size);
	//Logger::getRuleLogger()->info("new FlightAttribute   @0x{:08x}", valueBuf);
}

void FlightAttribute::init(vector<string>& nameList) {
	//Logger::getRuleLogger()->info("init FlightAttribute\n");
	attrNameIndexMap.clear();
	for (std::size_t i = 0; i < nameList.size(); i++) {
		if (attrNameIndexMap.find(nameList[i]) != attrNameIndexMap.end()) {
			Logger::getRuleLogger()->warn("WARNING: duplicate attribute: {}", nameList[i].c_str());
			continue;
		}

		attrNameIndexMap[nameList[i]] = attrNameIndexMap.size();
	}
}
bool FlightAttribute::isInited() {
	return !attrNameIndexMap.empty();
}


bool FlightAttribute::getAttribute(string attr) {
	if (attrNameIndexMap.find(attr) == attrNameIndexMap.end()) {
		Logger::getRuleLogger()->error("Exception: FlightAttribute '{}' is NOT exist", attr);
		return false;
	}
	int offset = (int)attrNameIndexMap[attr];
	int offsetHigh = offset / 8;
	int offsetLow = offset % 8;
	int mask = 1 << offsetLow;
	return (mask & valueBuf[offsetHigh]);
}

void FlightAttribute::setAttribute(string attr) {
	if (attrNameIndexMap.find(attr) == attrNameIndexMap.end()) {
		// std::exception在c++标准中没有char*参数的构造方法，可使用runtime_error异常类 2022/7/21 haoli.
		Logger::getRuleLogger()->error("Exception: FlightAttribute '{}' is NOT exist", attr);
		return;
	}
	int offset = (int)attrNameIndexMap[attr];
	int offsetHigh = offset / 8;
	int offsetLow = offset % 8;
	int mask = 1 << offsetLow;
	valueBuf[offsetHigh] |= mask;
}


void FlightAttribute::copyTo(FlightAttribute& obj) {
	if (attrNameIndexMap.empty()) {
		//Logger::getRuleLogger()->error("Exception: FlightAttribute is NOT init");
	}

	int size = (int)attrNameIndexMap.size() / 8;
	size = size == 0 ? 1 : size;
	if (attrNameIndexMap.size() % 8 != 0)
		size++;
	memcpy(obj.valueBuf, this->valueBuf, size);
}


string FlightAttribute::toString() {
	if (attrNameIndexMap.empty()) {
		//Logger::getRuleLogger()->error("Exception: FlightAttribute is NOT init");
		return "";
	}

	bool isFirst = true;
	stringstream ss;
	map<string, std::size_t>::iterator it;
	for (it = attrNameIndexMap.begin(); it != attrNameIndexMap.end(); it++) {
		string attrName = it->first;
		if (this->getAttribute(attrName)) {
			if (isFirst) {
				isFirst = false;
			}
			else {
				ss << "|";
			}
			ss << attrName;
		}
	}
	return ss.str();
}