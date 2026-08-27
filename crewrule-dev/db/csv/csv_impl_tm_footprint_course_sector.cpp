/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2026/3/27 09:14
 * @File:    csv_impl_tm_footprint_course_sector.cpp
 * @Version: 1.0.0
 * @Copyright (c) 2026 Pi-solution. All rights reserved.
**/
#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintCourseSectorParser::init(vector<string>& headers) {}


static vector<string> TmFootprintCourseSectorDefaultHeaders = { "id","tmFootprintCourseId", "sector", "airport", "modifiedBy", "lastModified" };
vector<string>& tmFootprintCourseSectorParser::getDefaultHeaders() {
	return TmFootprintCourseSectorDefaultHeaders;
}

void* tmFootprintCourseSectorParser::createInstance() {
	return new TmFootprintCourseSector();
}

void tmFootprintCourseSectorParser::deleteInstance(void* obj) {
	delete (TmFootprintCourseSector*)obj;
}

string tmFootprintCourseSectorParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmFootprintCourseSector* ref = (TmFootprintCourseSector*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "tmFootprintCourseId") { ss << ref->footprintCourseId << "^"; }
		else if (headers[i] == "sector") { ss << ref->sector << "^"; }
		else if (headers[i] == "airport") { ss << ref->airportStr << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("TmFootprintCourseSector", headers[i]); }
	}
	return ss.str();
}

void tmFootprintCourseSectorParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmFootprintCourseSector* ref = (TmFootprintCourseSector*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "tmFootprintCourseId") { ref->footprintCourseId = atoll(value); }
	else if (headers[index] == "sector") { ref->sector = atoi(value); }
	else if (headers[index] == "airport") {
		ref->airportStr = value;
		if (!ref->airportStr.empty()) {
			split(ref->airportStr, '|', ref->airports);
		}
	}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}

	else { logUnkonwnField("TmFootprintCourseSector", headers[index]); }



}

