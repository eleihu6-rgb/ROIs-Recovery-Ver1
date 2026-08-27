#ifndef JSON_PARSER_H
#define JSON_PARSER_H
#include <vector>
#include <string>
#include <map>
#include "rapidjson/document.h"		// rapidjson's DOM-style API
#include "rapidjson/prettywriter.h"	// for stringify JSON
#include "rapidjson/filestream.h"	// wrapper of C stream for prettywriter as output

using namespace std;
using namespace rapidjson;

class JsonParserItem {
public:
	virtual void* createNew() = 0;
	virtual vector<char*> getFieldNames() = 0;
	virtual void getField(const char* fieldName, void * obj, Document::AllocatorType& alloc, Value& v) = 0;
	virtual void setField(const char* fieldName, Value& v, void * obj) = 0;
};


class JsonParser{
public:
	JsonParser(JsonParserItem * jsonInterface);

	void readJson(const char* dataFile, vector<void*>& outList);
	void writeJson(vector<void*>& list, const char* filepath);

	vector<void*> getList();
	bool   isSuccess();
	string getErrorMsg();
	long   getErrorCode();

private:
	JsonParserItem * jsonInterface = nullptr;
	vector<void*> list;
	map<string, string> fieldTypeMap;
	string errorMsg;
	long   errorCode = 0;
};


#endif//JSON_PARSER_H