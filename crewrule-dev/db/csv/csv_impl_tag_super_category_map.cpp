#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void tagSuperCategoryMapParser::init(vector<string>& headers) {}


static vector<string> tagSuperCategoryMapDefaultHeaders = { "id", "tagSuperCategoryId", "tagCategoryIds", "lastModified", "modifiedBy" };
vector<string>& tagSuperCategoryMapParser::getDefaultHeaders() {
	return tagSuperCategoryMapDefaultHeaders;
}

void* tagSuperCategoryMapParser::createInstance() {
	return new TAG_SUPER_CATEGORY_MAP();
}

void tagSuperCategoryMapParser::deleteInstance(void* obj) {
	delete (TAG_SUPER_CATEGORY_MAP*)obj;
}


string tagSuperCategoryMapParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TAG_SUPER_CATEGORY_MAP * ref = (TAG_SUPER_CATEGORY_MAP *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "tagCategoryIds") { ss << ref->tagCategoryId << "^"; }
		else if (headers[i] == "tagSuperCategoryId ") { ss << ref->tagSuperCategoryId << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("tagSuperCategoryMap", headers[i]); }
	}
	return ss.str();

}


void tagSuperCategoryMapParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TAG_SUPER_CATEGORY_MAP * ref = (TAG_SUPER_CATEGORY_MAP *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "tagSuperCategoryId") { ref->tagSuperCategoryId = atoll(value); }
	else if (headers[index] == "tagCategoryId") { ref->tagCategoryId = atoll(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("tagSuperCategoryMap", headers[index]); }

}