#ifndef _DB_RULE_JSON_H_
#define _DB_RULE_JSON_H_


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

class DBRuleJson : public JsonParserItem {
private:
	vector<char*> fieldNames;
public:
	DBRuleJson() { vector<char*> list = { "idRuleSet", "idRule", "function", "classType", "description", "reference", "category", "storeType", "phase", "table", "row", "params" }; fieldNames = list; }

	void* createNew() { return (void*) new DBRule(); }

	vector<char*> getFieldNames() { return fieldNames; }

	void getField(const char* fieldName, void * o, Document::AllocatorType& alloc, Value& outV) {
		DBRule * obj = (DBRule*)o;
		if (0 == strcmp(fieldName, "idRuleSet"))                { outV.AddMember("idRuleSet", obj->idRuleSet, alloc); }
		if (0 == strcmp(fieldName, "idRule"))                   { outV.AddMember("idRule", obj->idRule, alloc); }
		if (0 == strcmp(fieldName, "function"))                 { outV.AddMember("function", obj->function, alloc); }
		if (0 == strcmp(fieldName, "classType"))                { Value v(obj->classType, alloc); outV.AddMember("classType", v, alloc); }
		if (0 == strcmp(fieldName, "description"))              { Value v(obj->description, alloc); outV.AddMember("description", v, alloc); }
		if (0 == strcmp(fieldName, "reference"))                { Value v(obj->reference.c_str(), alloc); outV.AddMember("reference", v, alloc); }
		if (0 == strcmp(fieldName, "category"))                 { Value v(obj->category.c_str(), alloc); outV.AddMember("category", v, alloc); }
		if (0 == strcmp(fieldName, "storeType"))                { Value v(obj->storeType, alloc); outV.AddMember("storeType", v, alloc); }
		if (0 == strcmp(fieldName, "phase"))                    { outV.AddMember("phase", obj->phase, alloc); }
		if (0 == strcmp(fieldName, "table"))                    { outV.AddMember("table", obj->tableNum, alloc); }
		if (0 == strcmp(fieldName, "row"))                      { outV.AddMember("row", obj->rowNum, alloc); }
		if (0 == strcmp(fieldName, "params"))                   { Value v(kObjectType); map<string, string> m = obj->params; for (map<string, string>::iterator it = m.begin(); it != m.end(); it++) { addStrField(v, it->first.c_str(), it->second.c_str(), alloc); } outV.AddMember("params", v, alloc); }
	}
	void setField(const char* fieldName, Value& v, void * o) {
		DBRule * obj = (DBRule*)o;
		if (0 == strcmp(fieldName, "idRuleSet"))                { obj->idRuleSet = (v["idRuleSet"].GetInt64()); }
		if (0 == strcmp(fieldName, "idRule"))                   { obj->idRule = (v["idRule"].GetInt64()); }
		if (0 == strcmp(fieldName, "function"))                 { obj->function = (v["function"].GetInt()); }
		if (0 == strcmp(fieldName, "classType"))                { strncpy(obj->classType, v["classType"].GetString(), sizeof(obj->classType)); }
		if (0 == strcmp(fieldName, "description"))              { strncpy(obj->description, v["description"].GetString(), sizeof(obj->description)); }
		if (0 == strcmp(fieldName, "reference"))                { obj->reference = v["reference"].GetString(); }
		if (0 == strcmp(fieldName, "category"))                 { obj->category = v["category"].GetString(); }
		if (0 == strcmp(fieldName, "storeType"))                { strncpy(obj->storeType, v["storeType"].GetString(), sizeof(obj->storeType)); }
		if (0 == strcmp(fieldName, "phase"))                    { obj->phase = (v["phase"].GetInt64()); }
		if (0 == strcmp(fieldName, "table"))                    { obj->tableNum = v["table"].GetInt(); }
		if (0 == strcmp(fieldName, "row"))                      { obj->rowNum = v["row"].GetInt(); }
		if (0 == strcmp(fieldName, "params"))                   { map<string, string> m; parseJsonToMapStrStr(v[fieldName], m); obj->params = (m); }
	}
};


#endif//_DB_RULE_JSON_H_
