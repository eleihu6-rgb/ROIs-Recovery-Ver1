#ifndef _DB_CQF_JSON_H_
#define _DB_CQF_JSON_H_

#include <string>
#include <vector>
#include <map>
#include "rapidjson/document.h"		// rapidjson's DOM-style API
#include "rapidjson/prettywriter.h"	// for stringify JSON
#include "rapidjson/filestream.h"	// wrapper of C stream for prettywriter as output
#include "rapidjson/stringbuffer.h"	// wrapper of C stream for prettywriter as output
#include "UtilFunc.h"
#include "JsonUtil.h"
#include "../CrewDB.h"

class DBCqfJson : public JsonParserItem {
private:
	vector<char*> fieldNames;
public:
	DBCqfJson() { vector<char*> list = { "idCqfSet", "idCqf", "function", "description", "paramNames", "paramValues" }; fieldNames = list; }

	void* createNew() { return (void*) new DBCqf(); }

	vector<char*> getFieldNames() { return fieldNames; }

	void getField(const char* fieldName, void * o, Document::AllocatorType& alloc, Value& outV) {
		DBCqf * obj = (DBCqf*)o;
		if (0 == strcmp(fieldName, "idCqfSet"))                 { outV.AddMember("idCqfSet", obj->idCqfSet, alloc); }
		if (0 == strcmp(fieldName, "idCqf"))                    { outV.AddMember("idCqf", obj->idCqf, alloc); }
		if (0 == strcmp(fieldName, "function"))                 { outV.AddMember("function", obj->function, alloc); }
		if (0 == strcmp(fieldName, "description"))              { Value v(obj->description.c_str(), alloc); outV.AddMember("description", v, alloc); }
		if (0 == strcmp(fieldName, "paramNames"))               { Value v(obj->paramNames.c_str(), alloc); outV.AddMember("paramNames", v, alloc); }
		if (0 == strcmp(fieldName, "paramValues"))              { Value v(kArrayType); vector<string> list = obj->paramValues; for (std::size_t i = 0; i < list.size(); i++) { Value str(list[i].c_str(), alloc); v.PushBack(str, alloc); } outV.AddMember("paramValues", v, alloc); }
	}
	void setField(const char* fieldName, Value& v, void * o) {
		DBCqf * obj = (DBCqf*)o;
		if (0 == strcmp(fieldName, "idCqfSet"))                 { obj->idCqfSet = (v["idCqfSet"].GetInt64()); }
		if (0 == strcmp(fieldName, "idCqf"))                    { obj->idCqf = (v["idCqf"].GetInt64()); }
		if (0 == strcmp(fieldName, "function"))                 { obj->function = (v["function"].GetInt()); }
		if (0 == strcmp(fieldName, "description"))              { obj->description = (v["description"].GetString()); }
		if (0 == strcmp(fieldName, "paramNames"))               { obj->paramNames = (v["paramNames"].GetString()); }
		if (0 == strcmp(fieldName, "paramValues"))              { vector<string> list; Value &item = v[fieldName]; for (SizeType i = 0; i < item.Size(); i++) { list.push_back(item[i].GetString()); } obj->paramValues = (list); }
	}
};


#endif//_DB_CQF_JSON_H_