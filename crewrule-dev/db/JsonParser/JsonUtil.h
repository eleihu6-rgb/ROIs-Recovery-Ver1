
#ifndef _IO_JSON_H_
#define _IO_JSON_H_
#include <map>
#include <vector>
#include "rapidjson/document.h"		// rapidjson's DOM-style API
#include "rapidjson/prettywriter.h"	// for stringify JSON
#include "rapidjson/filestream.h"	// wrapper of C stream for prettywriter as output

#include "JsonParser.h"


using namespace rapidjson;
using namespace std;

	const char * jsonUtil_getLastError();
	bool isIntField(Value &v, const char * itemName, const char * fieldName);
	bool isInt64Field(Value &v, const char * itemName, const char * fieldName);
	bool isStringField(Value &v, const char * itemName, const char * fieldName);
	bool isBooleanField(Value &v, const char * itemName, const char * fieldName);
	bool isArrayField(Value &v, const char * itemName, const char * fieldName);

	void addDoubleField(Value& obj, const char* fieldName, double value, Document::AllocatorType& alloc);
	void addBoolField(Value& obj, const char* fieldName, bool value, Document::AllocatorType& alloc);
	void addIntField(Value& obj, const char* fieldName, int value, Document::AllocatorType& alloc);
	void addStrField(Value& obj, const char* fieldName, const char* value, Document::AllocatorType& alloc);
	void addMapStrIntField(Value& obj, const char* fieldName, map<string, int>& m, Document::AllocatorType& alloc);
	void addMapLongDoubleField(Value& obj, const char* fieldName, map<long, double>& m, Document::AllocatorType& alloc);
	void addVectorIntField(Value& obj, const char* fieldName, vector<int>& list, Document::AllocatorType& alloc);

	void* parseJsonToObj(Value& json, JsonParserItem* jsonInterface);
	bool parseObjToJson(void* obj, Value& json, JsonParserItem* jsonInterface, Document::AllocatorType& alloc);


	bool parseJsonToMapStrInt(Value& json, map<string, int>& m);
	bool parseJsonToMapStrStr(Value& json, map<string, string>& m);
	bool parseJsonToMapLongDouble(Value& json, map<long, double>& m);
	string readJsonFile(const char * filepath, Document& doc);
#endif//_IO_JSON_H_