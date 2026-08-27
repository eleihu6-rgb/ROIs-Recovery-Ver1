#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void tagCategoryParser::init(vector<string>& headers) {}


static vector<string> tagCategoryDefaultHeaders = { "code", "name", "type", "ratio", "source", "idx", "createdBy",
"createdDt","lastModified", "modifiedBy","id" };
vector<string>& tagCategoryParser::getDefaultHeaders() {
	return tagCategoryDefaultHeaders;
}

void* tagCategoryParser::createInstance() {
	return new TAG_CATEGORY();
}

void tagCategoryParser::deleteInstance(void* obj) {
	delete (TAG_CATEGORY*)obj;
}


string tagCategoryParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TAG_CATEGORY * ref = (TAG_CATEGORY *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "code") { ss << ref->code << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "ratio") { ss << ref->ratio << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }
		else if (headers[i] == "idx") { ss << ref->idx << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("tag_category", headers[i]); }
	}
	return ss.str();

}


void tagCategoryParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TAG_CATEGORY * ref = (TAG_CATEGORY *)obj;
	if (headers[index] == "code") { ref->code = value; }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "type") { ref->type = strToUpper(trim(value)); }
	else if (headers[index] == "ratio") { ref->ratio = atoi(value); }
	else if (headers[index] == "source") { ref->source = value; }
	else if (headers[index] == "idx") { ref->idx = atoi(value); }
	else if (headers[index] == "createdBy") {}
	else if (headers[index] == "createdDt") {}
	else if (headers[index] == "exceptTag") { ref->exceptTag = value; }
	else if (headers[index] == "filiale") { split(value, '|', ref->filiales); }
	else if (headers[index] == "divisions") { split(value, '|', ref->divisions); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "requestable") {}
	else if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "division") {}
	else if (headers[index] == "isDisplay") {}
	else if (headers[index] == "isWarning") {}
	else if (headers[index] == "colorHex") {}
	else { logUnkonwnField("tag_category", headers[index]); }

}
