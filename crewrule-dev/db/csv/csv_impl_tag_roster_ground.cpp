#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tagRosterGroundParser::init(vector<string>& headers) {}


static vector<string> tagRosterGroundDefaultHeaders = { "tagGroupId", "strDtLow", "strDtHigh", "endDtLow", "endDtHigh", "location", "assignmentGroup", "assignment", "assignmentType",
"isSwap","isRequest", "isTraining", "trainingRole", "dutyPeriodLow", "dutyPeriodHigh", "overlapPeriodLow", "overlapPeriodHigh", "createdBy","createdDt","modifiedBy","lastModified","id" };
vector<string>& tagRosterGroundParser::getDefaultHeaders() {
	return tagRosterGroundDefaultHeaders;
}

void* tagRosterGroundParser::createInstance() {
	return new TAG_ROSTER_GROUND();
}

void tagRosterGroundParser::deleteInstance(void* obj) {
	delete (TAG_ROSTER_GROUND*)obj;
}


string tagRosterGroundParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TAG_ROSTER_GROUND * ref = (TAG_ROSTER_GROUND *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "tagGroupId") { ss << ref->tagGroupId << "^"; }
		else if (headers[i] == "strDtLow") { ss << ref->strDtLow << "^"; }
		else if (headers[i] == "strDtHigh") { ss << ref->strDtHigh << "^"; }
		else if (headers[i] == "endDtLow") { ss << ref->endDtLow << "^"; }
		else if (headers[i] == "endDtHigh") { ss << ref->endDtHigh << "^"; }
		else if (headers[i] == "location") { ss << joinStrList(ref->locations, "|") << "^"; }
		else if (headers[i] == "assignmentGroup") { ss << joinStrList(ref->assignmentGroups, "|") << "^"; }
		else if (headers[i] == "assignment") { ss << joinStrList(ref->assignments, "|") << "^"; }
		else if (headers[i] == "assignmentType") { ss << joinStrList(ref->assignmentTypes, "|") << "^"; }
		else if (headers[i] == "isSwap") { ss << ref->isSwap << "^"; }
		else if (headers[i] == "isRequest") { ss << ref->isRequest << "^"; }
		else if (headers[i] == "isTraining") { ss << ref->isTraining << "^"; }
		else if (headers[i] == "trainingRole") { ss << ref->trainingRole << "^"; }
		else if (headers[i] == "dutyPeriodLow") { ss << ref->dutyPeriodLow << "^"; }
		else if (headers[i] == "dutyPeriodHigh") { ss << ref->dutyPeriodHigh << "^"; }
		else if (headers[i] == "overlapPeriodLow") { ss << ref->overlapPeriodLow << "^"; }
		else if (headers[i] == "overlapPeriodHigh") { ss << ref->overlapPeriodHigh << "^"; }
		else if (headers[i] == "createdBy") { ss << ref->createdBy << "^"; }
		else if (headers[i] == "createdDt") { ss << ref->createdDt << "^"; }
		else if (headers[i] == "modifiedBy") { ss << ref->modifiedBy << "^"; }
		else if (headers[i] == "lastModified") { ss << ref->lastModified << "^"; }
		else if (headers[i] == "id") { ss << ref->id << "^"; }
		else { logUnkonwnField("tagRosterGround", headers[i]); }
	}
	return ss.str();

}


void tagRosterGroundParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TAG_ROSTER_GROUND * ref = (TAG_ROSTER_GROUND *)obj;
	if (headers[index] == "tagGroupId") { ref->tagGroupId = atoll(value); }
	else if (headers[index] == "strDtLow") { ref->strDtLow = value; }
	else if (headers[index] == "strDtHigh") { ref->strDtHigh = value; }
	else if (headers[index] == "endDtLow") { ref->endDtLow = value; }
	else if (headers[index] == "endDtHigh") { ref->endDtHigh = value; }
	else if (headers[index] == "location") { split(value, '|', ref->locations); }
	else if (headers[index] == "assignmentGroup") { split(value, '|', ref->assignmentGroups); }
	else if (headers[index] == "assignment") { split(value, '|', ref->assignments); }
	else if (headers[index] == "assignmentType") { split(value, '|', ref->assignmentTypes); }
	else if (headers[index] == "isSwap") { ref->isSwap = value; }
	else if (headers[index] == "isRequest") { ref->isRequest = value; }
	else if (headers[index] == "isTraining") { ref->isTraining = value; }
	else if (headers[index] == "trainingRole") { ref->trainingRole = value; }
	else if (headers[index] == "dutyPeriodLow") { ref->dutyPeriodLow = value; }
	else if (headers[index] == "dutyPeriodHigh") { ref->dutyPeriodHigh = value; }
	else if (headers[index] == "overlapPeriodLow") { ref->overlapPeriodLow = value; }
	else if (headers[index] == "overlapPeriodHigh") { ref->overlapPeriodHigh = value; }
	else if (headers[index] == "createdBy") { ref->createdBy = value; }
	else if (headers[index] == "createdDt") { ref->createdDt = value; }
	else if (headers[index] == "modifiedBy") { ref->modifiedBy = value; }
	else if (headers[index] == "lastModified") { ref->lastModified = value; }
	else if (headers[index] == "id") { ref->id = atoll(value); }
	else { logUnkonwnField("tagRosterGround", headers[index]); }

}
