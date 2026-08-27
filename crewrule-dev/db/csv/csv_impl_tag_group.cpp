#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void tagGroupParser::init(vector<string>& headers) {}


static vector<string> tagGroupDefaultHeaders = { "tagCategoryId", "tableType", "type", "parentId", "condition", "level", "idx",
"createdDt","createdBy","lastModified", "modifiedBy","id" };
vector<string>& tagGroupParser::getDefaultHeaders() {
	return tagGroupDefaultHeaders;
}

void* tagGroupParser::createInstance() {
	return new TAG_GROUP();
}

void tagGroupParser::deleteInstance(void* obj) {
	delete (TAG_GROUP*)obj;
}


string tagGroupParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TAG_GROUP * ref = (TAG_GROUP *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "tagCategoryId") { ss << ref->tagCategoryId << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "condition") { ss << ref->condition << "^"; }
		else if (headers[i] == "tableType") { ss << ref->tableType << "^"; }
		else if (headers[i] == "level") { ss << ref->level << "^"; }
		else if (headers[i] == "idx") { ss << ref->idx << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("tagGroup", headers[i]); }
	}
	return ss.str();

}


void tagGroupParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TAG_GROUP * ref = (TAG_GROUP *)obj;
	if (headers[index] == "tagCategoryId") { ref->tagCategoryId = atoll(value); }
	else if (headers[index] == "parentId") { ref->parentId = atoll(value); }
	else if (headers[index] == "type") { ref->type = value; }
	else if (headers[index] == "condition") { ref->condition = value; }
	else if (headers[index] == "tableType") { ref->tableType = value; }
	else if (headers[index] == "level") { ref->level = atoi(value); }
	else if (headers[index] == "idx") { ref->idx = atoi(value); }
	else if (headers[index] == "country") {}
	else if (headers[index] == "createdBy") {}
	else if (headers[index] == "createdDt") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "title") {}
	else if (headers[index] == "key") {}
	else if (headers[index] == "id") { ref->id = atoll(value); }
	else { logUnkonwnField("tagGroup", headers[index]); }

}