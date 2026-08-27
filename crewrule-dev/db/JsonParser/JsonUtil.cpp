
#include <vector>
#include <map>
#include <string>
#include "rapidjson/document.h"		// rapidjson's DOM-style API
#include "rapidjson/prettywriter.h"	// for stringify JSON
#include "rapidjson/filestream.h"	// wrapper of C stream for prettywriter as output
#include "rapidjson/stringbuffer.h"	// wrapper of C stream for prettywriter as output

#include "JsonUtil.h"
#include "UtilFunc.h"

using namespace std;
using namespace rapidjson;

#if defined(__unix) || defined(__APPLE__)
#define _snprintf snprintf
#endif


//获取最后一次出错时保存的错误信息
static char _lastErrorMsgBuf[2048] = { 0 };
const char * jsonUtil_getLastError() {
	return _lastErrorMsgBuf;
}
//检查指定doc对象是否int
bool isIntField(Value &v, const char * itemName, const char * fieldName) {
	if (fieldName == NULL)
		return false;
	if (!v.HasMember(fieldName)) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: %s field %s NOT exist", itemName, fieldName);
		return false;
	}
	if (!v[fieldName].IsInt()) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: %s field %s NOT int", itemName, fieldName);
		return false;
	}
	return true;
}

//检查指定doc对象是否int
bool isInt64Field(Value &v, const char * itemName, const char * fieldName) {
	if (fieldName == NULL)
		return false;
	if ((!v.HasMember(fieldName)) || (!v[fieldName].IsInt64())) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: %s field %s not exist or NOT int64", itemName, fieldName);
		return false;
	}
	return true;
}

//检查指定doc对象是否str
bool isStringField(Value &v, const char * itemName, const char * fieldName) {
	if (fieldName == NULL)
		return false;
	
	if (!v.HasMember(fieldName)) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: %s field %s NOT exist", itemName, fieldName);
		return false;
	}
	if ((!v[fieldName].IsString())) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: %s field %s NOT string", itemName, fieldName);
		return false;
	}
	return true;
}
//检查指定doc对象是否bool
bool isBooleanField(Value &v, const char * itemName, const char * fieldName) {
	if (fieldName == NULL)
		return false;
	if ((!v.HasMember(fieldName)) || (!v[fieldName].IsBool())) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: %s field %s NOT boolean", itemName, fieldName);
		return false;
	}
	return true;
}

//检查指定doc对象是否int
bool isArrayField(Value &v, const char * itemName, const char * fieldName) {
	if (fieldName == NULL)
		return false;
	if (!v.HasMember(fieldName)) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: %s field %s NOT exist", itemName, fieldName);
		return false;
	}
	if (!v[fieldName].IsArray()) {
		_snprintf(_lastErrorMsgBuf, sizeof(_lastErrorMsgBuf), "Input file invalid: %s field %s NOT array", itemName, fieldName);
		return false;
	}
	return true;
}

void addIntField(Value& obj, const char* fieldName, int value, Document::AllocatorType& alloc) {
	Value name(fieldName, alloc);
	Value v(rapidjson::kNumberType);

	v.SetInt(value);
	obj.AddMember(name, v, alloc);
}

void addDoubleField(Value& obj, const char* fieldName, double value, Document::AllocatorType& alloc) {
	Value name(fieldName, alloc);
	Value v(rapidjson::kNumberType);

	v.SetDouble(value);
	obj.AddMember(name, v, alloc);
}

void addBoolField(Value& obj, const char* fieldName, bool value, Document::AllocatorType& alloc) {
	Value name(fieldName, alloc);
	Value v;
	v.SetBool(value);

	obj.AddMember(name, v, alloc);
}

void addStrField(Value& obj, const char* fieldName, const char* value, Document::AllocatorType& alloc) {
	Value name(fieldName, alloc);
	Value v(value, alloc);
	
	obj.AddMember(name, v, alloc);
}

//void addTimeField(Value& obj, const char* fieldName, const char* timeStr, Document::AllocatorType& alloc) {
//	Value name(fieldName, alloc);
//	Value v(value, alloc);
//
//	obj.AddMember(name, v, alloc);
//}

void addMapStrIntField(Value& obj, const char* fieldName, map<string, int>& m, Document::AllocatorType& alloc) {
	Value name(fieldName, alloc);
	Value v(kObjectType);

	for (map<string, int>::iterator it = m.begin(); it != m.end(); it++) {
		string key = it->first;
		int value = it->second;

		addIntField(v, key.c_str(), value, alloc);
	}
	obj.AddMember(name, v, alloc);
}
void addMapLongDoubleField(Value& obj, const char* fieldName, map<long, double>& m, Document::AllocatorType& alloc) {
	Value name(fieldName, alloc);
	Value v(kObjectType);

	for (map<long, double>::iterator it = m.begin(); it != m.end(); it++) {
		char buf[20] = { 0 };
		long key = it->first;
		double value = it->second;
		_snprintf(buf, sizeof(buf) - 1, "%d", key);

		addDoubleField(v, buf, value, alloc);
	}
	obj.AddMember(name, v, alloc);
}
void addVectorIntField(Value& obj, const char* fieldName, vector<int>& list, Document::AllocatorType& alloc) {
	Value name(fieldName, alloc);
	Value v(kArrayType);
	for (std::size_t i = 0; i < list.size(); i++) {
		int item = list[i];
		v.PushBack(item, alloc);
	}
	obj.AddMember(name, v, alloc);
}

bool parseJsonToMapStrInt(Value& json, map<string, int>& m) {
	bool ret = 1;
	Value::MemberIterator it;
	for (it = json.MemberBegin(); it != json.MemberEnd(); it++) {
		string key = it->name.GetString();
		int v = it->value.GetInt();
		m[key] = v;
	}
	return ret;
}

bool parseJsonToMapLongDouble(Value& json, map<long, double>& m) {
	bool ret = 1;
	Value::MemberIterator it;
	for (it = json.MemberBegin(); it != json.MemberEnd(); it++) {
		string str = it->name.GetString();
		long key = atoi(str.c_str());
		double v = it->value.GetDouble();
		m[key] = v;
	}
	return ret;
}

bool parseJsonToMapStrStr(Value& json, map<string, string>& m) {
	bool ret = 1;
	Value::MemberIterator it;
	for (it = json.MemberBegin(); it != json.MemberEnd(); it++) {
		string key = it->name.GetString();
		string v = it->value.GetString();
		m[key] = v;
	}
	return ret;
}

void* parseJsonToObj(Value& json, JsonParserItem* jsonInterface) {
	void * obj = jsonInterface->createNew();
	vector<char*> fieldNames = jsonInterface->getFieldNames();
	
	for (std::size_t i = 0; i < fieldNames.size(); i++) {
		char* field = fieldNames[i];
		jsonInterface->setField(field, json, obj);
	}
	return obj;
}

bool parseObjToJson(void* obj, Value& json, JsonParserItem* jsonInterface, Document::AllocatorType& alloc) {
	bool ret = false;
	vector<char*> fieldNames = jsonInterface->getFieldNames();
	for (std::size_t i = 0; i < fieldNames.size(); i++) {
		char* field = fieldNames[i];
		jsonInterface->getField(field, obj, alloc, json);
	}
	return true;
}

string readJsonFile(const char * filepath, Document& doc) {
	char errorMsg[1024] = { 0 };
	char buf[4096] = { 0 };
	FILE * pFile = fopen(filepath, "r");
	if (pFile == NULL) {
		_snprintf(errorMsg, sizeof(errorMsg), "Input file '%s' invalid: not exist or open failed ", filepath);
		return errorMsg;
	}
	rewind(pFile);

	FileStream is(pFile);
	doc.ParseStream<0>(is);

	if (doc.HasParseError()) {
		return doc.GetParseError();
	}
	else {
		return "success";
	}
}
