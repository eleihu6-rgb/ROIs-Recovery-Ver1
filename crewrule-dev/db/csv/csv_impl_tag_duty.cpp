#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void tagDutyParser::init(vector<string>& headers) {}


static vector<string> tagDutyDefaultHeaders = { "tagGroupId", "checkInStart", "checkInEnd", "checkOutStart", "checkOutEnd",
"blhStart","blhEnd", "fdpStart", "fdpEnd", "dpStart", "dpEnd", "segNum","createdBy","createdDt","lastModified", "modifiedBy","id" };
vector<string>& tagDutyParser::getDefaultHeaders() {
	return tagDutyDefaultHeaders;
}

void* tagDutyParser::createInstance() {
	return new TAG_DUTY();
}

void tagDutyParser::deleteInstance(void* obj) {
	delete (TAG_DUTY*)obj;
}


string tagDutyParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TAG_DUTY * ref = (TAG_DUTY *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "tagGroupId") { ss << ref->tagGroupId << "^"; }
		else if (headers[i] == "checkInStart") { ss << ref->checkInStart << "^"; }
		else if (headers[i] == "checkInEnd") { ss << ref->checkInEnd << "^"; }
		else if (headers[i] == "checkOutStart") { ss << ref->checkOutStart << "^"; }
		else if (headers[i] == "checkOutEnd") { ss << ref->checkOutEnd << "^"; }
		else if (headers[i] == "blhStart") { ss << ref->blhStart << "^"; }
		else if (headers[i] == "blhEnd") { ss << ref->blhEnd << "^"; }
		else if (headers[i] == "fdpStart") { ss << ref->fdpStart << "^"; }
		else if (headers[i] == "fdpEnd") { ss << ref->fdpEnd << "^"; }
		else if (headers[i] == "segNum") { ss << ref->segNum << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("tag_duty", headers[i]); }
	}
	return ss.str();

}


void tagDutyParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TAG_DUTY * ref = (TAG_DUTY *)obj;
	if (headers[index] == "tagGroupId") { ref->tagGroupId = atoll(value); }
	else if (headers[index] == "checkInStart") { ref->checkInStart = value; }
	else if (headers[index] == "checkInEnd") { ref->checkInEnd = value; }
	else if (headers[index] == "checkOutStart") { ref->checkOutStart = value; }
	else if (headers[index] == "checkOutEnd") { ref->checkOutEnd = value; }
	else if (headers[index] == "blhStart") { ref->blhStart = value; }
	else if (headers[index] == "blhEnd") { ref->blhEnd = value; }
	else if (headers[index] == "fdpStart") { ref->fdpStart = value; }
	else if (headers[index] == "fdpEnd") { ref->fdpEnd = value; }
	else if (headers[index] == "dpStart") { ref->dpStart = value; }
	else if (headers[index] == "dpEnd") { ref->dpEnd = value; }
	else if (headers[index] == "overlapPeriodStart") { ref->overlapPeriodStart = value; }
	else if (headers[index] == "overlapPeriodEnd") { ref->overlapPeriodEnd = value; }
	else if (headers[index] == "segNum") { ref->segNum = value; }
	else if (headers[index] == "dutySeq") { ref->dutySeq = value; }
	else if (headers[index] == "dutyDurationStart") { ref->dutyDurationStart = value; }
	else if (headers[index] == "dutyDurationEnd") { ref->dutyDurationEnd = value; }
	else if (headers[index] == "firstStdStart") { ref->firstSegmentDepTimeStart = value; }
	else if (headers[index] == "firstStdEnd") { ref->firstSegmentDepTimeEnd = value; }
	else if (headers[index] == "fdpTouchStart") { ref->fdpTouchTimeStart = value; }
	else if (headers[index] == "fdpTouchEnd") { ref->fdpTouchTimeEnd = value; }
	else if (headers[index] == "transitAirports") { ref->transitAirports = value; }
	else if (headers[index] == "transitDurationStart") { ref->transitDurationStart = value; }
	else if (headers[index] == "transitDurationEnd") { ref->transitDurationEnd = value; }
	else if (headers[index] == "firstFlyStdStart") { ref->firstFlySegDepStart = value; }
	else if (headers[index] == "firstFlyStdEnd") { ref->firstFlySegDepEnd = value; }
	else if (headers[index] == "lastStdStart") { ref->lastSegArvStart = value; }
	else if (headers[index] == "lastStdEnd") { ref->lastSegArvEnd = value; }
	else if (headers[index] == "lastFlyStdStart") { ref->lastFlySegArvStart = value; }
	else if (headers[index] == "lastFlyStdEnd") { ref->lastFlySegArvEnd = value; }
	else if (headers[index] == "dutyDaysStart") { ref->dutyDaysStart = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "dutyDaysEnd") { ref->dutyDaysEnd = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "assignmentGroup") {}
	else if (headers[index] == "createdBy") {}
	else if (headers[index] == "createdDt") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else { logUnkonwnField("tag_duty", headers[index]); }

}