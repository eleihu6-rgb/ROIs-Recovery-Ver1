#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void tagSuperCategoryParser::init(vector<string>& headers) {}


static vector<string> tagSuperCategoryDefaultHeaders = { "id", "filiale", "division", "name", "equilibriumType","lastModified", "modifiedBy"};
vector<string>& tagSuperCategoryParser::getDefaultHeaders() {
	return tagSuperCategoryDefaultHeaders;
}

void* tagSuperCategoryParser::createInstance() {
	return new TAG_SUPER_CATEGORY();
}

void tagSuperCategoryParser::deleteInstance(void* obj) {
	delete (TAG_SUPER_CATEGORY*)obj;
}


string tagSuperCategoryParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TAG_SUPER_CATEGORY * ref = (TAG_SUPER_CATEGORY *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "filiale") { ss << ref->filiale << "^"; }
		else if (headers[i] == "divisio ") { ss << ref->division << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "equilibriumType") { ss << ref->equilibriumType << "^"; }
		else if (headers[i] == "layovedDt") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("tagSuperCategory", headers[i]); }
	}
	return ss.str();

}


void tagSuperCategoryParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TAG_SUPER_CATEGORY * ref = (TAG_SUPER_CATEGORY *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "filiale") { ref->filiale = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "equilibriumType") { ref->equilibriumType = value; }
	else if (headers[index] == "tagCategoryId") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("tagSuperCategory", headers[index]); }

}