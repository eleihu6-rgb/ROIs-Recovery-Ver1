#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void departmentGroupParser::init(vector<string>& headers) {}


static vector<string> departmentGroupDefaultHeaders = { "id", "filiale", "division","groupName","value", "lastModified", "modifiedBy" };
vector<string>& departmentGroupParser::getDefaultHeaders() {
	return departmentGroupDefaultHeaders;
}

void* departmentGroupParser::createInstance() {
	return new DEPARTMENT_GROUP();
}

void departmentGroupParser::deleteInstance(void* obj) {
	delete (DEPARTMENT_GROUP*)obj;
}


string departmentGroupParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	DEPARTMENT_GROUP * ref = (DEPARTMENT_GROUP *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "filiale") { ss << ref->filiale << "^"; }
		else if (headers[i] == "division ") { ss << ref->division << "^"; }
		else if (headers[i] == "groupName ") { ss << ref->groupName << "^"; }
		else if (headers[i] == "value ") { ss << ref->value << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		//else { logUnkonwnField("department_group", headers[i]); }
	}
	return ss.str();

}


void departmentGroupParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	DEPARTMENT_GROUP * ref = (DEPARTMENT_GROUP *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "filiale") { ref->filiale = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "groupName") { ref->groupName = value; }
	else if (headers[index] == "value") { ref->value = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("department_group", headers[index]); }

}